# Image Downloader Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simple Chrome Manifest V3 extension that scans the currently open page for JPG, JPEG, PNG, and WEBP images, shows them from largest resolution to smallest with preview, dimensions, and file size, and lets the user download any one image with one click.

**Architecture:** The popup is the user interface and asks the active tab content script for image candidates. The content script extracts image URLs and dimensions from the page DOM. The background service worker validates metadata that requires network access and starts downloads through `chrome.downloads.download`.

**Tech Stack:** Chrome Extension Manifest V3, plain HTML/CSS/JavaScript, `chrome.tabs`, `chrome.scripting`, `chrome.runtime`, `chrome.downloads`, Node built-in `node:test` for pure utility tests.

---

## Assumptions

- No frontend framework is needed; plain JavaScript keeps the extension easy to load in Chrome.
- The extension requests `activeTab`, `scripting`, and `downloads` permissions plus `<all_urls>` host permissions so it can inspect and download images from arbitrary pages.
- File size is read with an HTTP `HEAD` request when the server exposes `content-length`; when unavailable, the UI displays `unknown`.
- Image resolution is taken from page DOM data when available and probed from loaded image metadata as a fallback.
- The first version downloads one selected image per click. Bulk download is intentionally out of scope.

## File Structure

- Create: `manifest.json` - Chrome MV3 metadata, permissions, popup, content script, and background worker.
- Create: `src/content.js` - Extract image candidates from the current page.
- Create: `src/background.js` - Fetch file metadata and trigger Chrome downloads.
- Create: `src/popup.html` - Popup markup.
- Create: `src/popup.css` - Popup layout and visual styling.
- Create: `src/popup.js` - Popup state, rendering, sorting, and download actions.
- Create: `src/imageUtils.js` - Shared pure utilities for filtering, normalization, sorting, formatting, and filenames.
- Create: `tests/imageUtils.test.mjs` - Unit tests for shared utilities.
- Create: `package.json` - Test script.
- Create: `README.md` - Manual installation and usage instructions.

---

### Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `README.md`

- [ ] **Step 1: Create the package metadata**

```json
{
  "name": "chrome-image-downloader",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
```

- [ ] **Step 2: Create usage documentation**

```markdown
# Chrome Image Downloader

Simple Chrome extension for finding image files on the active tab, sorting them by resolution, previewing dimensions and size, and downloading a selected image.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project directory.

## Use

1. Open any webpage with images.
2. Click the extension icon.
3. Review images sorted from largest resolution to smallest.
4. Click `Download` next to the image you want to save.

## Test

```bash
npm test
```
```

- [ ] **Step 3: Run initial test command**

Run: `npm test`

Expected: command fails because no test files exist yet.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: bootstrap chrome extension project"
```

---

### Task 2: Shared Image Utilities

**Files:**
- Create: `src/imageUtils.js`
- Create: `tests/imageUtils.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDownloadFilename,
  formatBytes,
  isSupportedImageUrl,
  normalizeImageCandidate,
  sortByLargestResolution
} from "../src/imageUtils.js";

test("filters supported image URLs", () => {
  assert.equal(isSupportedImageUrl("https://example.com/a.jpg"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.jpeg?x=1"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.png#hash"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.webp"), true);
  assert.equal(isSupportedImageUrl("https://example.com/a.svg"), false);
  assert.equal(isSupportedImageUrl("data:image/png;base64,abc"), false);
});

test("normalizes dimensions and area", () => {
  const image = normalizeImageCandidate({
    url: "https://example.com/photo.jpg",
    width: "1200",
    height: "800"
  });

  assert.deepEqual(image, {
    url: "https://example.com/photo.jpg",
    width: 1200,
    height: 800,
    area: 960000,
    sizeBytes: null
  });
});

test("sorts largest resolution first", () => {
  const images = [
    normalizeImageCandidate({ url: "https://e.test/small.jpg", width: 100, height: 100 }),
    normalizeImageCandidate({ url: "https://e.test/large.jpg", width: 1000, height: 800 }),
    normalizeImageCandidate({ url: "https://e.test/mid.jpg", width: 400, height: 400 })
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
  assert.equal(
    buildDownloadFilename("https://example.com/image"),
    "image-download.jpg"
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because `src/imageUtils.js` does not exist.

- [ ] **Step 3: Implement shared utilities**

```javascript
const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export function getImageExtension(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

export function isSupportedImageUrl(url) {
  return SUPPORTED_EXTENSIONS.has(getImageExtension(url));
}

export function normalizeImageCandidate(candidate) {
  const width = Number.parseInt(candidate.width, 10) || 0;
  const height = Number.parseInt(candidate.height, 10) || 0;
  return {
    url: candidate.url,
    width,
    height,
    area: width * height,
    sizeBytes: Number.isFinite(candidate.sizeBytes) ? candidate.sizeBytes : null
  };
}

export function sortByLargestResolution(images) {
  return [...images].sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    return b.width - a.width;
  });
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function buildDownloadFilename(url) {
  const parsed = new URL(url);
  const extension = getImageExtension(url) || "jpg";
  const rawName = parsed.pathname.split("/").pop() || "image-download";
  const withoutExtension = rawName.replace(/\.[^.]+$/, "") || "image-download";
  const safeName = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeName || "image-download"}.${extension === "jpeg" ? "jpg" : extension}`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/imageUtils.js tests/imageUtils.test.mjs
git commit -m "test: add image utility behavior"
```

---

### Task 3: Chrome Manifest and Background Worker

**Files:**
- Create: `manifest.json`
- Create: `src/background.js`

- [ ] **Step 1: Create Manifest V3 config**

```json
{
  "manifest_version": 3,
  "name": "Image Downloader",
  "version": "0.1.0",
  "description": "Find, sort, preview, and download images from the active tab.",
  "permissions": ["activeTab", "scripting", "downloads"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "src/popup.html",
    "default_title": "Image Downloader"
  },
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Implement background actions**

```javascript
import { buildDownloadFilename } from "./imageUtils.js";

async function readImageSize(url) {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    const contentLength = response.headers.get("content-length");
    return contentLength ? Number.parseInt(contentLength, 10) : null;
  } catch {
    return null;
  }
}

function downloadImage(url) {
  return chrome.downloads.download({
    url,
    filename: buildDownloadFilename(url),
    saveAs: false,
    conflictAction: "uniquify"
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "READ_IMAGE_SIZE") {
    readImageSize(message.url).then((sizeBytes) => sendResponse({ sizeBytes }));
    return true;
  }

  if (message?.type === "DOWNLOAD_IMAGE") {
    downloadImage(message.url)
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
```

- [ ] **Step 3: Validate extension manifest**

Run: load the project through `chrome://extensions` using `Load unpacked`.

Expected: Chrome loads the extension without manifest errors.

- [ ] **Step 4: Commit**

```bash
git add manifest.json src/background.js
git commit -m "feat: add chrome extension manifest and downloads worker"
```

---

### Task 4: Content Script Image Discovery

**Files:**
- Create: `src/content.js`
- Modify: `src/imageUtils.js`
- Modify: `tests/imageUtils.test.mjs`

- [ ] **Step 1: Add srcset parsing tests**

```javascript
import { parseSrcsetUrls } from "../src/imageUtils.js";

test("parses URLs from srcset", () => {
  assert.deepEqual(
    parseSrcsetUrls("https://e.test/a.jpg 1x, https://e.test/b.webp 2x"),
    ["https://e.test/a.jpg", "https://e.test/b.webp"]
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because `parseSrcsetUrls` is not exported.

- [ ] **Step 3: Implement `parseSrcsetUrls`**

```javascript
export function parseSrcsetUrls(srcset) {
  return String(srcset || "")
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
}
```

- [ ] **Step 4: Implement content script scanner**

```javascript
import {
  isSupportedImageUrl,
  normalizeImageCandidate,
  parseSrcsetUrls,
  sortByLargestResolution
} from "./imageUtils.js";

function absoluteUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return "";
  }
}

function collectImageElements() {
  const candidates = [];

  document.querySelectorAll("img").forEach((img) => {
    const urls = [img.currentSrc, img.src, ...parseSrcsetUrls(img.srcset)]
      .map(absoluteUrl)
      .filter(isSupportedImageUrl);

    urls.forEach((url) => {
      candidates.push({
        url,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0
      });
    });
  });

  document.querySelectorAll("source[srcset]").forEach((source) => {
    parseSrcsetUrls(source.srcset)
      .map(absoluteUrl)
      .filter(isSupportedImageUrl)
      .forEach((url) => candidates.push({ url, width: 0, height: 0 }));
  });

  document.querySelectorAll("a[href]").forEach((link) => {
    const url = absoluteUrl(link.href);
    if (isSupportedImageUrl(url)) {
      candidates.push({ url, width: 0, height: 0 });
    }
  });

  return candidates;
}

function collectCssBackgroundImages() {
  const candidates = [];
  document.querySelectorAll("body *").forEach((element) => {
    const backgroundImage = window.getComputedStyle(element).backgroundImage;
    const matches = [...backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
    matches
      .map((match) => absoluteUrl(match[1]))
      .filter(isSupportedImageUrl)
      .forEach((url) => candidates.push({ url, width: 0, height: 0 }));
  });
  return candidates;
}

function scanPageImages() {
  const seen = new Set();
  const images = [...collectImageElements(), ...collectCssBackgroundImages()]
    .map(normalizeImageCandidate)
    .filter((image) => {
      if (seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });

  return sortByLargestResolution(images);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SCAN_IMAGES") {
    sendResponse({ images: scanPageImages() });
  }
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Manually verify scan response**

Run: load the extension, open a page with several JPG/PNG/WEBP images, open popup after Task 5, and confirm the content script returns a non-empty list.

Expected: popup displays image candidates.

- [ ] **Step 7: Commit**

```bash
git add src/content.js src/imageUtils.js tests/imageUtils.test.mjs
git commit -m "feat: scan page image candidates"
```

---

### Task 5: Popup UI and Image List

**Files:**
- Create: `src/popup.html`
- Create: `src/popup.css`
- Create: `src/popup.js`

- [ ] **Step 1: Create popup markup**

```html
<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Image Downloader</title>
    <link rel="stylesheet" href="./popup.css">
  </head>
  <body>
    <header class="topbar">
      <h1>Images</h1>
      <button id="refreshButton" type="button">Refresh</button>
    </header>
    <p id="status" class="status">Scanning page...</p>
    <main id="imageList" class="image-list" aria-live="polite"></main>
    <script type="module" src="./popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create popup styling**

```css
* {
  box-sizing: border-box;
}

body {
  width: 420px;
  min-height: 260px;
  max-height: 620px;
  margin: 0;
  font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1f2933;
  background: #f7f9fb;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: #ffffff;
  border-bottom: 1px solid #d8e0e8;
}

h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

button {
  border: 1px solid #b8c4d0;
  border-radius: 6px;
  padding: 7px 10px;
  background: #ffffff;
  color: #1f2933;
  cursor: pointer;
}

button.primary {
  background: #1167b1;
  border-color: #1167b1;
  color: #ffffff;
}

button:disabled {
  opacity: 0.55;
  cursor: default;
}

.status {
  margin: 0;
  padding: 10px 12px;
  color: #536471;
}

.image-list {
  display: grid;
  gap: 10px;
  padding: 0 12px 12px;
}

.image-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  padding: 10px;
  border: 1px solid #d8e0e8;
  border-radius: 8px;
  background: #ffffff;
}

.preview {
  width: 96px;
  height: 72px;
  object-fit: contain;
  background: #edf2f7;
  border: 1px solid #d8e0e8;
  border-radius: 6px;
}

.meta {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.url {
  overflow: hidden;
  color: #536471;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats {
  color: #1f2933;
  font-weight: 600;
}
```

- [ ] **Step 3: Implement popup behavior**

```javascript
import { formatBytes, sortByLargestResolution } from "./imageUtils.js";

const statusElement = document.querySelector("#status");
const listElement = document.querySelector("#imageList");
const refreshButton = document.querySelector("#refreshButton");

function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function scanImages() {
  const tab = await getActiveTab();
  if (!tab?.id) return [];

  const response = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_IMAGES" });
  return response?.images || [];
}

async function enrichImage(image) {
  const response = await sendRuntimeMessage({ type: "READ_IMAGE_SIZE", url: image.url });
  return { ...image, sizeBytes: response?.sizeBytes ?? null };
}

function imageDimensions(image) {
  return image.width && image.height ? `${image.width} x ${image.height}` : "unknown resolution";
}

function renderImages(images) {
  listElement.replaceChildren();

  images.forEach((image) => {
    const row = document.createElement("article");
    row.className = "image-row";

    const preview = document.createElement("img");
    preview.className = "preview";
    preview.src = image.url;
    preview.alt = "";

    const meta = document.createElement("div");
    meta.className = "meta";

    const stats = document.createElement("div");
    stats.className = "stats";
    stats.textContent = `${imageDimensions(image)} · ${formatBytes(image.sizeBytes)}`;

    const url = document.createElement("div");
    url.className = "url";
    url.title = image.url;
    url.textContent = image.url;

    const button = document.createElement("button");
    button.className = "primary";
    button.type = "button";
    button.textContent = "Download";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Downloading";
      const result = await sendRuntimeMessage({ type: "DOWNLOAD_IMAGE", url: image.url });
      button.textContent = result?.ok ? "Downloaded" : "Failed";
    });

    meta.append(stats, url, button);
    row.append(preview, meta);
    listElement.append(row);
  });
}

async function refresh() {
  refreshButton.disabled = true;
  statusElement.textContent = "Scanning page...";
  listElement.replaceChildren();

  try {
    const scanned = await scanImages();
    const enriched = await Promise.all(scanned.map(enrichImage));
    const sorted = sortByLargestResolution(enriched);
    statusElement.textContent = sorted.length
      ? `${sorted.length} images found`
      : "No JPG, JPEG, PNG, or WEBP images found";
    renderImages(sorted);
  } catch (error) {
    statusElement.textContent = `Scan failed: ${error.message}`;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", refresh);
refresh();
```

- [ ] **Step 4: Manually verify popup**

Run: load the unpacked extension and open the popup on a page with images.

Expected: images appear with previews, dimensions, size or `unknown`, and a `Download` button.

- [ ] **Step 5: Commit**

```bash
git add src/popup.html src/popup.css src/popup.js
git commit -m "feat: add image downloader popup"
```

---

### Task 6: Download Flow Hardening

**Files:**
- Modify: `src/background.js`
- Modify: `src/popup.js`
- Modify: `README.md`

- [ ] **Step 1: Handle restricted Chrome pages clearly**

Add this check in `scanImages()` before sending the tab message:

```javascript
if (!tab.url || /^(chrome|edge|about):\/\//.test(tab.url)) {
  throw new Error("Chrome does not allow extensions to scan this page");
}
```

- [ ] **Step 2: Make failed downloads recoverable**

Replace the download button listener body with:

```javascript
button.disabled = true;
button.textContent = "Downloading";
const result = await sendRuntimeMessage({ type: "DOWNLOAD_IMAGE", url: image.url });
if (result?.ok) {
  button.textContent = "Downloaded";
} else {
  button.disabled = false;
  button.textContent = "Retry download";
}
```

- [ ] **Step 3: Document limitations**

Add this section to `README.md`:

```markdown
## Limitations

- Chrome blocks extension scripts on internal pages such as `chrome://extensions`.
- Some servers do not expose `content-length`, so file size can show as `unknown`.
- Some lazy-loaded images appear only after scrolling the page before opening the popup.
- The first version downloads one image at a time.
```

- [ ] **Step 4: Re-run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Manually verify download**

Run: open a normal webpage, click the extension, click `Download` next to a JPG/PNG/WEBP image.

Expected: Chrome downloads the image to the default downloads folder with a safe filename.

- [ ] **Step 6: Commit**

```bash
git add src/background.js src/popup.js README.md
git commit -m "fix: harden image download flow"
```

---

### Task 7: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run unit tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Verify Chrome extension loading**

Run: open `chrome://extensions`, reload the unpacked extension.

Expected: no extension errors in Chrome.

- [ ] **Step 3: Verify scan and sorting**

Run: open a test page with at least three images of different resolutions.

Expected: the image with the largest `width * height` appears first, and the smallest appears last.

- [ ] **Step 4: Verify preview and metadata**

Run: inspect each row in the popup.

Expected: preview is visible, dimensions appear as `WIDTH x HEIGHT` when known, and size appears as a formatted value or `unknown`.

- [ ] **Step 5: Verify single-click download**

Run: click `Download` on one image.

Expected: the browser downloads exactly that image and the button changes to `Downloaded`.

- [ ] **Step 6: Final commit**

```bash
git status --short
git commit --allow-empty -m "chore: verify image downloader extension"
```

---

## Self-Review

- Spec coverage: the plan covers scanning the active page, filtering JPG/JPEG/PNG/WEBP, sorting by resolution, previewing dimensions and file size, and one-click download.
- Scope: this is one focused subsystem and does not need decomposition.
- Ambiguity resolved: file size can be `unknown` when unavailable through `content-length`; the first version downloads one image per click rather than bulk downloading.
- Testing: pure utility behavior is covered by `node:test`; Chrome API behavior is verified manually in an unpacked extension because it depends on browser permissions and active-tab runtime state.
