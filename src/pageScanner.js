(() => {
  // NOTE: this file is injected into pages via chrome.scripting.executeScript({ files })
  // and therefore stays dependency-free (classic script, no imports). Pure helpers below
  // intentionally mirror src/imageUtils.js; tests/pageScanner.test.mjs asserts parity so
  // the two implementations cannot silently drift (see __SIMPLE_IMAGE_DOWNLOADER_TEST__).
  const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
  const BACKGROUND_SCAN_CANDIDATE_LIMIT = 150;
  const BACKGROUND_SCAN_TIME_BUDGET_MS = 60;
  const BACKGROUND_SCAN_ELEMENT_CAP = 1500;
  const DEEP_SCAN_NODE_CAP = 5000;
  const DEEP_SCAN_SHADOW_ROOT_CAP = 50;
  const DEEP_SCAN_RESULT_CAP = 10000;
  const LAZY_SRC_ATTRIBUTES = ["data-src", "data-original", "data-lazy-src", "data-lazy", "data-image"];
  const LAZY_SRCSET_ATTRIBUTES = ["data-srcset", "data-lazy-srcset"];
  const BACKGROUND_PRESELECT_SELECTOR = [
    "header",
    "section",
    "figure",
    '[style*="background"]',
    '[class*="bg"]',
    '[class*="hero"]',
    '[class*="banner"]',
    '[class*="cover"]',
    '[class*="thumb"]'
  ].join(",");

  function hasPathExtension(pathname) {
    return /\.[a-z0-9]+$/i.test(pathname);
  }

  function getImageExtension(url) {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
      return match ? match[1] : "";
    } catch {
      return "";
    }
  }

  function isSupportedImageUrl(url, options = {}) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;

      if (SUPPORTED_EXTENSIONS.has(getImageExtension(url))) {
        return true;
      }

      if (options.source === "link") {
        return false;
      }

      return !hasPathExtension(parsed.pathname);
    } catch {
      return false;
    }
  }

  function absoluteUrl(url, base) {
    try {
      return new URL(url, base).href;
    } catch {
      return "";
    }
  }

  function parseSrcset(srcset) {
    return String(srcset || "")
      .split(",")
      .map((item) => {
        const [url, descriptor = ""] = item.trim().split(/\s+/);
        if (!url) return null;
        const score = Number.parseFloat(descriptor);
        return { url, descriptor, score: Number.isFinite(score) ? score : 0 };
      })
      .filter(Boolean);
  }

  function getLargestSrcsetUrl(srcset) {
    return parseSrcset(srcset).sort((a, b) => b.score - a.score)[0]?.url || "";
  }

  function buildResourceSizeMap(entries) {
    const resourceSizeMap = new Map();

    for (const entry of entries || []) {
      const size = entry?.encodedBodySize || entry?.transferSize || 0;
      if (size > 0 && entry?.name) {
        resourceSizeMap.set(entry.name, size);
      }
    }

    return resourceSizeMap;
  }

  function getResourceSize(resourceSizeMap, url) {
    return resourceSizeMap.get(url) || null;
  }

  function normalize(candidate, resourceSizeMap) {
    const width = Number.parseInt(candidate.width, 10) || 0;
    const height = Number.parseInt(candidate.height, 10) || 0;

    return {
      url: candidate.url,
      width,
      height,
      area: width * height,
      sizeBytes: candidate.sizeBytes || getResourceSize(resourceSizeMap, candidate.url),
      source: candidate.source || "page"
    };
  }

  function addCandidate(candidates, resourceSizeMap, base, rawUrl, metadata = {}) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return;
    const url = absoluteUrl(rawUrl.trim(), base);
    if (!isSupportedImageUrl(url, { source: metadata.source })) return;
    candidates.push(normalize({ ...metadata, url }, resourceSizeMap));
  }

  function getAttribute(element, name) {
    try {
      if (typeof element?.getAttribute === "function") return element.getAttribute(name);
      return element?.[name] ?? "";
    } catch {
      return "";
    }
  }

  function isPlaceholderSrc(src) {
    return !src || /^(data:|blob:)\s*/i.test(String(src).trim());
  }

  function lazyFallbackUrl(img) {
    for (const attr of LAZY_SRC_ATTRIBUTES) {
      const value = getAttribute(img, attr);
      if (value && value.trim()) return value.trim();
    }
    for (const attr of LAZY_SRCSET_ATTRIBUTES) {
      const value = getAttribute(img, attr);
      const best = value && getLargestSrcsetUrl(value);
      if (best) return best;
    }
    return "";
  }

  function queryRoots(doc) {
    const roots = [doc];
    try {
      const all = doc.querySelectorAll("*");
      const total = Math.min(all.length, DEEP_SCAN_NODE_CAP);
      for (let i = 0; i < total; i++) {
        const shadowRoot = all[i] && all[i].shadowRoot;
        if (shadowRoot && !roots.includes(shadowRoot)) {
          roots.push(shadowRoot);
          if (roots.length > DEEP_SCAN_SHADOW_ROOT_CAP + 1) break;
        }
      }
      const firstLevel = roots.slice(1, DEEP_SCAN_SHADOW_ROOT_CAP + 1);
      for (const shadowRoot of firstLevel) {
        let inner = [];
        try {
          inner = shadowRoot.querySelectorAll("*");
        } catch {
          inner = [];
        }
        const nestedTotal = Math.min(inner.length, 500);
        for (let i = 0; i < nestedTotal; i++) {
          const nested = inner[i] && inner[i].shadowRoot;
          if (nested && !roots.includes(nested)) roots.push(nested);
        }
      }
    } catch {
      // Ignore DOM enumeration failures and scan whatever roots we collected.
    }
    return roots;
  }

  function queryAllDeep(doc, selector) {
    const out = [];
    const seen = new Set();
    for (const root of queryRoots(doc)) {
      let nodes = [];
      try {
        nodes = root.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const node of nodes) {
        if (out.length >= DEEP_SCAN_RESULT_CAP) return out;
        if (!seen.has(node)) {
          seen.add(node);
          out.push(node);
        }
      }
    }
    return out;
  }

  function collectImgCandidates(candidates, resourceSizeMap, ctx) {
    queryAllDeep(ctx.doc, "img").forEach((img) => {
      const dims = {
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0
      };

      let primary = img.currentSrc || img.src || "";
      if (isPlaceholderSrc(primary)) {
        primary = lazyFallbackUrl(img);
      }
      if (primary) {
        addCandidate(candidates, resourceSizeMap, ctx.base, primary, { ...dims, source: "img" });
      }

      const bestSrcset = getLargestSrcsetUrl(getAttribute(img, "srcset") || img.srcset || "");
      if (bestSrcset) {
        addCandidate(candidates, resourceSizeMap, ctx.base, bestSrcset, { ...dims, source: "srcset" });
      }
    });
  }

  function collectSourceCandidates(candidates, resourceSizeMap, ctx) {
    queryAllDeep(ctx.doc, "source[srcset]").forEach((source) => {
      const best = getLargestSrcsetUrl(source.srcset || getAttribute(source, "srcset") || "");
      if (best) {
        addCandidate(candidates, resourceSizeMap, ctx.base, best, { source: "source" });
      }
    });
  }

  function collectLinkedImages(candidates, resourceSizeMap, ctx) {
    queryAllDeep(ctx.doc, "a[href]").forEach((link) => {
      const href = typeof link.href === "string" ? link.href : getAttribute(link, "href");
      addCandidate(candidates, resourceSizeMap, ctx.base, href, { source: "link" });
    });
  }

  function collectBackgroundImages(candidates, resourceSizeMap, ctx, state) {
    const preselected = [];
    const seen = new Set();
    const push = (element) => {
      if (element && !seen.has(element)) {
        seen.add(element);
        preselected.push(element);
      }
    };

    push(ctx.doc.documentElement);
    push(ctx.doc.body);

    let matches = [];
    try {
      matches = ctx.doc.querySelectorAll(BACKGROUND_PRESELECT_SELECTOR);
    } catch {
      matches = [];
    }
    for (const element of matches) push(element);

    const start = ctx.now();
    let scanned = 0;
    for (const element of preselected) {
      if (scanned >= BACKGROUND_SCAN_ELEMENT_CAP || ctx.now() - start > BACKGROUND_SCAN_TIME_BUDGET_MS) {
        state.timedOut = true;
        break;
      }
      scanned += 1;

      let backgroundImage = "";
      try {
        backgroundImage = ctx.win.getComputedStyle(element).backgroundImage;
      } catch {
        continue;
      }
      if (!backgroundImage || backgroundImage === "none") continue;

      const urls = [...backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
      urls.forEach((match) =>
        addCandidate(candidates, resourceSizeMap, ctx.base, match[1], { source: "background" })
      );
    }
    state.scannedElements = scanned;
  }

  function dedupeAndSort(candidates) {
    const byUrl = new Map();

    candidates.forEach((image) => {
      const existing = byUrl.get(image.url);
      const imageScore = image.area + (image.sizeBytes ? 1 : 0);
      const existingScore = existing ? existing.area + (existing.sizeBytes ? 1 : 0) : -1;
      if (!existing || imageScore > existingScore) {
        byUrl.set(image.url, image);
      }
    });

    return [...byUrl.values()].sort((a, b) => {
      if (b.area !== a.area) return b.area - a.area;
      return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    });
  }

  function scanCore(deps) {
    const doc = deps.document;
    const win = deps.window;
    let base = "";
    try {
      base = doc.baseURI || win.location.href || "";
    } catch {
      base = "";
    }
    const now = () => {
      try {
        const perf = deps.performance || win.performance;
        if (perf && typeof perf.now === "function") return perf.now();
      } catch {
        // Fall through to Date.now().
      }
      return Date.now();
    };
    const ctx = { doc, win, base, now };

    const candidates = [];
    let resourceSizeMap = new Map();
    try {
      const perf = deps.performance || win.performance;
      const entries =
        perf && typeof perf.getEntriesByType === "function" ? perf.getEntriesByType("resource") : [];
      resourceSizeMap = buildResourceSizeMap(entries);
    } catch {
      resourceSizeMap = new Map();
    }

    collectImgCandidates(candidates, resourceSizeMap, ctx);
    collectSourceCandidates(candidates, resourceSizeMap, ctx);
    collectLinkedImages(candidates, resourceSizeMap, ctx);

    const state = { timedOut: false, scannedElements: 0, backgroundScanned: false };
    if (candidates.length < BACKGROUND_SCAN_CANDIDATE_LIMIT) {
      state.backgroundScanned = true;
      collectBackgroundImages(candidates, resourceSizeMap, ctx, state);
    }
    return dedupeAndSort(candidates);
  }

  globalThis.__SIMPLE_IMAGE_DOWNLOADER_SCAN__ = () => scanCore({ document, window, performance });

  try {
    globalThis.__SIMPLE_IMAGE_DOWNLOADER_TEST__ = {
      SUPPORTED_EXTENSIONS: [...SUPPORTED_EXTENSIONS],
      BACKGROUND_SCAN_CANDIDATE_LIMIT,
      BACKGROUND_SCAN_TIME_BUDGET_MS,
      BACKGROUND_SCAN_ELEMENT_CAP,
      isSupportedImageUrl,
      getImageExtension,
      parseSrcset,
      getLargestSrcsetUrl,
      scanCore,
      shouldCollectBackgroundImages: (count) => count < BACKGROUND_SCAN_CANDIDATE_LIMIT
    };
  } catch {
    // Test hook is best-effort; scanning works without it.
  }
})();
