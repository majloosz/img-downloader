import test from "node:test";
import assert from "node:assert/strict";
import { parseContentRangeTotal, resolveImageInfo, resolveImageSize } from "../src/sizeResolver.js";

function createResponse({ status = 200, headers = {} } = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );

  return {
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) ?? null;
      }
    },
    body: {
      cancel() {}
    }
  };
}

test("parses total bytes from content-range", () => {
  assert.equal(parseContentRangeTotal("bytes 0-0/8192"), 8192);
  assert.equal(parseContentRangeTotal("bytes 100-200/*"), null);
  assert.equal(parseContentRangeTotal(null), null);
});

test("resolves image size from HEAD content-length without fallback request", async () => {
  const requests = [];
  const sizeBytes = await resolveImageSize("https://e.test/image.jpg", async (url, options) => {
    requests.push({ url, options });
    return createResponse({ headers: { "content-length": "4096" } });
  });

  assert.equal(sizeBytes, 4096);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://e.test/image.jpg");
  assert.equal(requests[0].options.method, "HEAD");
});

test("falls back to range GET and prefers total bytes from content-range", async () => {
  const requests = [];
  const responses = [
    createResponse({ status: 405 }),
    createResponse({ status: 206, headers: { "content-range": "bytes 0-0/8192" } })
  ];
  const sizeBytes = await resolveImageSize("https://e.test/image.webp", async (url, options) => {
    requests.push({ url, options });
    return responses.shift();
  });

  assert.equal(sizeBytes, 8192);
  assert.deepEqual(
    requests.map((request) => request.options.method),
    ["HEAD", "GET"]
  );
  assert.equal(requests[1].options.headers.Range, "bytes=0-0");
});

test("probes image size without sending credentials", async () => {
  const requests = [];
  await resolveImageSize("https://a.allegroimg.com/original/test/image", async (url, options) => {
    requests.push({ url, options });
    return createResponse({ status: 403 });
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.credentials, "omit");
  assert.equal(requests[1].options.credentials, "omit");
});

test("uses full response content-length when range request is not partial", async () => {
  const responses = [
    createResponse({ status: 200 }),
    createResponse({ status: 200, headers: { "content-length": "16384" } })
  ];
  const sizeBytes = await resolveImageSize("https://e.test/image.png", async () => responses.shift());

  assert.equal(sizeBytes, 16384);
});

test("returns null when both probes fail to expose size", async () => {
  const responses = [
    createResponse({ status: 403 }),
    createResponse({ status: 206 })
  ];
  const sizeBytes = await resolveImageSize("https://e.test/image.png", async () => responses.shift());

  assert.equal(sizeBytes, null);
});

test("rejects non-image content types as not-an-image", async () => {
  const info = await resolveImageInfo(
    "https://e.test/tracker",
    async () => createResponse({ headers: { "content-length": "512", "content-type": "text/html" } })
  );

  assert.equal(info.isImage, false);
  assert.equal(info.contentType, "text/html");
  assert.equal(
    await resolveImageSize(
      "https://e.test/tracker",
      async () => createResponse({ headers: { "content-length": "512", "content-type": "text/html" } })
    ),
    null
  );
});

test("accepts image content types and exposes them", async () => {
  const info = await resolveImageInfo(
    "https://e.test/photo.avif",
    async () => createResponse({ headers: { "content-length": "2048", "content-type": "image/avif" } })
  );

  assert.equal(info.isImage, true);
  assert.equal(info.sizeBytes, 2048);
  assert.equal(info.contentType, "image/avif");
});

test("aborts hung probes after the configured timeout", async () => {
  const info = await resolveImageInfo("https://e.test/hung.jpg", () => new Promise(() => {}), {
    timeoutMs: 15
  });

  assert.equal(info.sizeBytes, null);
  assert.equal(info.isImage, true);
});
