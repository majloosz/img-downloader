import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDownloadFilename,
  dedupeImages,
  filterImagesAboveSizeKb,
  formatBytes,
  getLargestSrcsetUrl,
  getSelectedImages,
  isSupportedImageUrl,
  normalizeImageCandidate,
  parseSrcset,
  sortByLargestResolution,
  toggleSelectedUrl
} from "../src/imageUtils.js";

test("filters supported remote image URLs", () => {
  assert.equal(isSupportedImageUrl("https://example.com/a.jpg"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.jpeg?x=1"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.png#hash"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.webp"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.svg"), false);
  assert.equal(isSupportedImageUrl("data:image/png;base64,abc"), false);
  assert.equal(isSupportedImageUrl("javascript:alert(1)"), false);
});

test("parses srcset entries and picks largest candidate", () => {
  const entries = parseSrcset("small.jpg 320w, medium.webp 640w, large.jpg 2x");

  assert.deepEqual(entries, [
    { url: "small.jpg", descriptor: "320w", score: 320 },
    { url: "medium.webp", descriptor: "640w", score: 640 },
    { url: "large.jpg", descriptor: "2x", score: 2 }
  ]);
  assert.equal(getLargestSrcsetUrl("small.jpg 320w, medium.webp 640w"), "medium.webp");
});

test("normalizes dimensions, area, source, and size", () => {
  const image = normalizeImageCandidate({
    url: "https://example.com/photo.jpg",
    width: "1200",
    height: "800",
    sizeBytes: "4096",
    source: "img"
  });

  assert.deepEqual(image, {
    url: "https://example.com/photo.jpg",
    width: 1200,
    height: 800,
    area: 960000,
    sizeBytes: 4096,
    source: "img"
  });
});

test("dedupes images by URL and keeps richer metadata", () => {
  const images = [
    normalizeImageCandidate({ url: "https://e.test/a.jpg", width: 0, height: 0 }),
    normalizeImageCandidate({ url: "https://e.test/a.jpg", width: 900, height: 600, sizeBytes: 1234 }),
    normalizeImageCandidate({ url: "https://e.test/b.png", width: 100, height: 100 })
  ];

  const deduped = dedupeImages(images);

  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].width, 900);
  assert.equal(deduped[0].sizeBytes, 1234);
});

test("sorts largest resolution first, then size", () => {
  const images = [
    normalizeImageCandidate({ url: "https://e.test/small.jpg", width: 100, height: 100, sizeBytes: 9999 }),
    normalizeImageCandidate({ url: "https://e.test/large.jpg", width: 1000, height: 800, sizeBytes: 1 }),
    normalizeImageCandidate({ url: "https://e.test/mid.jpg", width: 400, height: 400, sizeBytes: 2048 })
  ];

  assert.equal(sortByLargestResolution(images)[0].url, "https://e.test/large.jpg");
  assert.equal(sortByLargestResolution(images)[2].url, "https://e.test/small.jpg");
});

test("formats byte counts", () => {
  assert.equal(formatBytes(null), "unknown");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2_097_152), "2.0 MB");
});

test("builds safe download filenames", () => {
  assert.equal(
    buildDownloadFilename("https://example.com/path/my photo.JPG?size=large"),
    "my-photo.jpg"
  );
  assert.equal(buildDownloadFilename("https://example.com/image"), "image-download.jpg");
  assert.equal(buildDownloadFilename("https://example.com/ąęźć.webp"), "image-download.webp");
});

test("toggles selected URLs without mutating existing selection", () => {
  const selected = new Set(["https://e.test/a.jpg"]);
  const added = toggleSelectedUrl(selected, "https://e.test/b.png");
  const removed = toggleSelectedUrl(added, "https://e.test/a.jpg");

  assert.deepEqual([...selected], ["https://e.test/a.jpg"]);
  assert.deepEqual([...added].sort(), ["https://e.test/a.jpg", "https://e.test/b.png"]);
  assert.deepEqual([...removed], ["https://e.test/b.png"]);
});

test("returns selected images in current display order", () => {
  const images = [
    normalizeImageCandidate({ url: "https://e.test/large.jpg", width: 1000, height: 800 }),
    normalizeImageCandidate({ url: "https://e.test/small.jpg", width: 100, height: 100 }),
    normalizeImageCandidate({ url: "https://e.test/mid.webp", width: 400, height: 400 })
  ];
  const selected = new Set(["https://e.test/mid.webp", "https://e.test/large.jpg"]);

  assert.deepEqual(
    getSelectedImages(images, selected).map((image) => image.url),
    ["https://e.test/large.jpg", "https://e.test/mid.webp"]
  );
});

test("keeps unknown-size images visible while filtering by minimum size in KB", () => {
  const images = [
    normalizeImageCandidate({ url: "https://e.test/tiny.jpg", width: 10, height: 10, sizeBytes: 4 * 1024 }),
    normalizeImageCandidate({ url: "https://e.test/large.jpg", width: 1000, height: 800, sizeBytes: 6 * 1024 }),
    normalizeImageCandidate({ url: "https://e.test/unknown.webp", width: 400, height: 400 })
  ];

  assert.deepEqual(
    filterImagesAboveSizeKb(images, 5).map((image) => image.url),
    ["https://e.test/large.jpg", "https://e.test/unknown.webp"]
  );
  assert.equal(filterImagesAboveSizeKb(images, 0).length, 3);
});
