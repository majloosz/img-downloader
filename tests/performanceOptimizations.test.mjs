import test from "node:test";
import assert from "node:assert/strict";
import { createAsyncResultCache } from "../src/asyncResultCache.js";
import { getKeyboardToggleRow } from "../src/popupInteractionUtils.js";
import { createRenderBatcher } from "../src/renderBatcher.js";
import { buildResourceSizeMap, shouldCollectBackgroundImages } from "../src/pageScanUtils.js";

test("builds a single resource-size index for page scan candidates", () => {
  const sizeMap = buildResourceSizeMap([
    { name: "https://e.test/a.jpg", encodedBodySize: 0, transferSize: 1200 },
    { name: "https://e.test/b.jpg", encodedBodySize: 2400, transferSize: 2600 },
    { name: "https://e.test/a.jpg", encodedBodySize: 1800, transferSize: 2000 },
    { name: "https://e.test/c.jpg", encodedBodySize: 0, transferSize: 0 }
  ]);

  assert.equal(sizeMap.get("https://e.test/a.jpg"), 1800);
  assert.equal(sizeMap.get("https://e.test/b.jpg"), 2400);
  assert.equal(sizeMap.has("https://e.test/c.jpg"), false);
});

test("skips background-image scan when page already exposed many image candidates", () => {
  assert.equal(shouldCollectBackgroundImages(149), true);
  assert.equal(shouldCollectBackgroundImages(150), false);
});

test("batches multiple popup render requests into one scheduled render", async () => {
  let scheduled = null;
  let renderCount = 0;
  const batcher = createRenderBatcher(
    () => {
      renderCount += 1;
    },
    (callback) => {
      scheduled = callback;
    }
  );

  batcher.request();
  batcher.request();
  batcher.request();

  assert.equal(renderCount, 0);
  assert.equal(typeof scheduled, "function");

  scheduled();

  assert.equal(renderCount, 1);

  batcher.request();
  scheduled();

  assert.equal(renderCount, 2);
});

test("dedupes in-flight and resolved async work by cache key", async () => {
  let callCount = 0;
  const cache = createAsyncResultCache(async (url) => {
    callCount += 1;
    return `${url}:size`;
  });

  const [first, second] = await Promise.all([
    cache.get("https://e.test/a.jpg"),
    cache.get("https://e.test/a.jpg")
  ]);

  assert.equal(first, "https://e.test/a.jpg:size");
  assert.equal(second, "https://e.test/a.jpg:size");
  assert.equal(callCount, 1);

  const third = await cache.get("https://e.test/a.jpg");

  assert.equal(third, "https://e.test/a.jpg:size");
  assert.equal(callCount, 1);
});

test("ignores keyboard row toggles that originate from the download button", () => {
  const actionButtonTarget = {
    closest(selector) {
      if (selector === 'button[data-action="download"]') return { dataset: { action: "download" } };
      return null;
    }
  };
  const rowTarget = {
    closest(selector) {
      if (selector === 'button[data-action="download"]') return null;
      if (selector === ".image-row") return { dataset: { url: "https://e.test/a.jpg" } };
      return null;
    }
  };

  assert.equal(getKeyboardToggleRow({ key: "Enter", target: actionButtonTarget }), null);
  assert.deepEqual(getKeyboardToggleRow({ key: " ", target: rowTarget }), {
    dataset: { url: "https://e.test/a.jpg" }
  });
});

test("cancelled render batches never invoke the render", async () => {
  let scheduled = null;
  let renderCount = 0;
  const batcher = createRenderBatcher(
    () => {
      renderCount += 1;
    },
    (callback) => {
      scheduled = callback;
    }
  );

  batcher.request();
  batcher.cancel();
  scheduled();

  assert.equal(renderCount, 0);

  batcher.request();
  scheduled();

  assert.equal(renderCount, 1);
});
