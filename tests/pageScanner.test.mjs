import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  isSupportedImageUrl,
  parseSrcset
} from "../src/imageUtils.js";

let hookPromise = null;

async function loadHook() {
  if (!hookPromise) {
    hookPromise = (async () => {
      const code = await readFile(new URL("../src/pageScanner.js", import.meta.url), "utf8");
      const sandbox = { URL, Date, Math, JSON, console };
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox);
      assert.ok(sandbox.__SIMPLE_IMAGE_DOWNLOADER_TEST__, "scanner exposes test hook");
      assert.equal(
        typeof sandbox.__SIMPLE_IMAGE_DOWNLOADER_SCAN__,
        "function",
        "scanner exposes page entrypoint"
      );
      return sandbox.__SIMPLE_IMAGE_DOWNLOADER_TEST__;
    })();
  }
  return hookPromise;
}

function fakeImg(overrides = {}) {
  const attrs = overrides.attrs || {};
  return {
    currentSrc: overrides.currentSrc ?? "",
    src: overrides.src ?? "",
    srcset: overrides.srcset ?? "",
    naturalWidth: overrides.naturalWidth ?? 0,
    naturalHeight: overrides.naturalHeight ?? 0,
    width: overrides.width ?? 0,
    height: overrides.height ?? 0,
    getAttribute(name) {
      return attrs[name] ?? null;
    }
  };
}

function fakeDoc({ imgs = [], sources = [], links = [], preselected = [], all = [], baseURI = "https://site.test/page" } = {}) {
  const body = { tag: "body" };
  const html = { tag: "html" };
  return {
    baseURI,
    documentElement: html,
    body,
    __body: body,
    __html: html,
    querySelectorAll(selector) {
      if (selector === "*") return all;
      if (selector === "img") return imgs;
      if (selector === "source[srcset]") return sources;
      if (selector === "a[href]") return links;
      return preselected;
    }
  };
}

function fakeWindow({ bgMap = new Map(), calls = null } = {}) {
  return {
    location: { href: "https://site.test/page" },
    getComputedStyle(element) {
      if (calls) calls.push(element);
      return { backgroundImage: bgMap.get(element) || "none" };
    }
  };
}

function fakePerf({ now = null } = {}) {
  return {
    getEntriesByType: () => [],
    now: now || (() => Date.now())
  };
}

// Values produced inside the vm context carry foreign prototypes, so normalize
// them into this realm before structural assertions.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function resultUrls(images) {
  return [...images.map((image) => image.url)];
}

test("scanner shares the supported-extension set with imageUtils", async () => {
  const hook = await loadHook();
  assert.deepEqual([...hook.SUPPORTED_EXTENSIONS].sort(), [...SUPPORTED_IMAGE_EXTENSIONS].sort());
  assert.equal(hook.BACKGROUND_SCAN_CANDIDATE_LIMIT, 150);
});

test("scanner URL filtering matches imageUtils on fixtures", async () => {
  const hook = await loadHook();
  const fixtures = [
    "https://example.com/a.jpg",
    "https://example.com/a.avif",
    "https://example.com/a.gif",
    "https://example.com/a.svg",
    "https://example.com/no-extension-here",
    "https://example.com/api/track?q=1",
    "data:image/png;base64,abc",
    "javascript:alert(1)"
  ];

  for (const url of fixtures) {
    for (const source of ["img", "link", "background", undefined]) {
      assert.equal(
        hook.isSupportedImageUrl(url, source ? { source } : {}),
        isSupportedImageUrl(url, source ? { source } : {}),
        `${url} [${source}]`
      );
    }
  }
});

test("scanner srcset parsing matches imageUtils", async () => {
  const hook = await loadHook();
  const srcset = "small.jpg 320w, medium.webp 640w, large.jpg 2x";
  assert.deepEqual(plain(hook.parseSrcset(srcset)), parseSrcset(srcset));
  assert.equal(hook.getLargestSrcsetUrl(srcset), "medium.webp");
});

test("scanner keeps the largest srcset variant instead of the first", async () => {
  const hook = await loadHook();
  const images = hook.scanCore({
    document: fakeDoc({
      imgs: [
        fakeImg({
          currentSrc: "https://site.test/small.jpg",
          naturalWidth: 100,
          naturalHeight: 100,
          attrs: { srcset: "small.jpg 320w, big.jpg 2000w" }
        })
      ]
    }),
    window: fakeWindow(),
    performance: fakePerf()
  });

  const urls = resultUrls(images);
  assert.ok(urls.includes("https://site.test/big.jpg"), "largest variant collected");
  assert.equal(urls.filter((url) => url === "https://site.test/small.jpg").length, 1);
});

test("scanner falls back to lazy-load attributes when src is empty", async () => {
  const hook = await loadHook();
  const images = hook.scanCore({
    document: fakeDoc({
      imgs: [fakeImg({ src: "", attrs: { "data-src": "https://site.test/lazy.jpg" } })]
    }),
    window: fakeWindow(),
    performance: fakePerf()
  });

  assert.deepEqual(
    resultUrls(images),
    ["https://site.test/lazy.jpg"]
  );
});

test("scanner resolves relative URLs against document.baseURI", async () => {
  const hook = await loadHook();
  const images = hook.scanCore({
    document: fakeDoc({
      imgs: [fakeImg({ src: "img/a.jpg" })],
      baseURI: "https://cdn.test/sub/page"
    }),
    window: fakeWindow(),
    performance: fakePerf()
  });

  assert.deepEqual(
    resultUrls(images),
    ["https://cdn.test/sub/img/a.jpg"]
  );
});

test("scanner finds images inside open shadow roots", async () => {
  const hook = await loadHook();
  const innerImg = fakeImg({ src: "https://site.test/shadow.jpg", naturalWidth: 50, naturalHeight: 50 });
  const host = {
    shadowRoot: {
      querySelectorAll(selector) {
        return selector === "img" ? [innerImg] : [];
      }
    }
  };
  const images = hook.scanCore({
    document: fakeDoc({ all: [host] }),
    window: fakeWindow(),
    performance: fakePerf()
  });

  assert.deepEqual(
    resultUrls(images),
    ["https://site.test/shadow.jpg"]
  );
});

test("background scan only touches preselected elements, not the whole DOM", async () => {
  const hook = await loadHook();
  const hero = { tag: "hero" };
  const plain = { tag: "plain" };
  const calls = [];
  const images = hook.scanCore({
    document: fakeDoc({
      preselected: [hero, plain],
      all: Array.from({ length: 500 }, (_, i) => ({ tag: `node-${i}` }))
    }),
    window: fakeWindow({
      calls,
      bgMap: new Map([[hero, 'url("https://site.test/hero.jpg")']])
    }),
    performance: fakePerf()
  });

  const urls = resultUrls(images);
  assert.ok(urls.includes("https://site.test/hero.jpg"));
  // documentElement + body + 2 preselected; the 500 unrelated nodes are never styled.
  assert.equal(calls.length, 4);
});

test("background scan aborts on its time budget on huge pages", async () => {
  const hook = await loadHook();
  const calls = [];
  const preselected = Array.from({ length: 3000 }, (_, i) => ({ tag: `bg-${i}` }));
  const bgMap = new Map(preselected.map((el, i) => [el, `url("https://img.test/bg${i}.jpg")`]));
  let clock = 0;
  const images = hook.scanCore({
    document: fakeDoc({ preselected }),
    window: fakeWindow({ calls, bgMap }),
    performance: { getEntriesByType: () => [], now: () => (clock += 1) }
  });

  assert.ok(calls.length < 3000, `expected early abort, styled ${calls.length}`);
  assert.ok(images.length < 3000, `expected partial results, got ${images.length}`);
});

test("background scan is skipped once the page already exposed many candidates", async () => {
  const hook = await loadHook();
  const calls = [];
  const hero = { tag: "hero" };
  const links = Array.from({ length: 160 }, (_, i) => ({ href: `https://site.test/p${i}.jpg` }));
  const images = hook.scanCore({
    document: fakeDoc({ links, preselected: [hero] }),
    window: fakeWindow({
      calls,
      bgMap: new Map([[hero, 'url("https://site.test/hero.jpg")']])
    }),
    performance: fakePerf()
  });

  assert.equal(calls.length, 0);
  assert.ok(!images.some((image) => image.url === "https://site.test/hero.jpg"));
});
