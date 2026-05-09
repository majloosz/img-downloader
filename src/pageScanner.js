(() => {
  const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
  const BACKGROUND_SCAN_CANDIDATE_LIMIT = 150;

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

  function absoluteUrl(url) {
    try {
      return new URL(url, window.location.href).href;
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
        return { url, score: Number.isFinite(score) ? score : 0 };
      })
      .filter(Boolean);
  }

  function buildResourceSizeMap() {
    const resourceSizeMap = new Map();

    performance.getEntriesByType("resource").forEach((entry) => {
      const size = entry?.encodedBodySize || entry?.transferSize || 0;
      if (size > 0 && entry?.name) {
        resourceSizeMap.set(entry.name, size);
      }
    });

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

  function addCandidate(candidates, resourceSizeMap, rawUrl, metadata = {}) {
    const url = absoluteUrl(rawUrl);
    if (!isSupportedImageUrl(url, { source: metadata.source })) return;
    candidates.push(normalize({ ...metadata, url }, resourceSizeMap));
  }

  function collectImgCandidates(candidates, resourceSizeMap) {
    document.querySelectorAll("img").forEach((img) => {
      addCandidate(candidates, resourceSizeMap, img.currentSrc || img.src, {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        source: "img"
      });

      parseSrcset(img.srcset).forEach((entry) => {
        addCandidate(candidates, resourceSizeMap, entry.url, {
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          source: "srcset"
        });
      });
    });
  }

  function collectSourceCandidates(candidates, resourceSizeMap) {
    document.querySelectorAll("source[srcset]").forEach((source) => {
      parseSrcset(source.srcset).forEach((entry) => {
        addCandidate(candidates, resourceSizeMap, entry.url, { source: "source" });
      });
    });
  }

  function collectLinkedImages(candidates, resourceSizeMap) {
    document.querySelectorAll("a[href]").forEach((link) => {
      addCandidate(candidates, resourceSizeMap, link.href, { source: "link" });
    });
  }

  function collectBackgroundImages(candidates, resourceSizeMap) {
    document.querySelectorAll("body *").forEach((element) => {
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      const matches = [...backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
      matches.forEach((match) =>
        addCandidate(candidates, resourceSizeMap, match[1], { source: "background" })
      );
    });
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

  globalThis.__SIMPLE_IMAGE_DOWNLOADER_SCAN__ = () => {
    const candidates = [];
    const resourceSizeMap = buildResourceSizeMap();
    collectImgCandidates(candidates, resourceSizeMap);
    collectSourceCandidates(candidates, resourceSizeMap);
    collectLinkedImages(candidates, resourceSizeMap);
    if (candidates.length < BACKGROUND_SCAN_CANDIDATE_LIMIT) {
      collectBackgroundImages(candidates, resourceSizeMap);
    }
    return dedupeAndSort(candidates);
  };
})();
