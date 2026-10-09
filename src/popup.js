import {
  filterImagesAboveSizeKb,
  formatBytes,
  getSelectedImages,
  sortByLargestResolution,
  toggleSelectedUrl
} from "./imageUtils.js";
import { getKeyboardToggleRow } from "./popupInteractionUtils.js";
import { createRenderBatcher } from "./renderBatcher.js";
import { UNSCANNABLE_PAGE_MESSAGE, isScannablePage } from "./pageGuard.js";
import {
  DEFAULT_MIN_SIZE_KB,
  clampMinimumSizeKb,
  parseMinimumSizeKb
} from "./sizeFilter.js";

const MIN_SIZE_STORAGE_KEY = "simpleImageDownloader.minimumSizeKb";
const MAX_CONCURRENT_SIZE_REQUESTS = 4;
const SIZE_RESOLVE_FLUSH_EVERY = 20;
const PAGE_SIZE = 50;
const SLIDER_DEBOUNCE_MS = 150;
const statusElement = document.querySelector("#status");
const listElement = document.querySelector("#imageList");
const refreshButton = document.querySelector("#refreshButton");
const downloadSelectedButton = document.querySelector("#downloadSelectedButton");
const maxSizeSlider = document.querySelector("#maxSizeSlider");
const maxSizeLabel = document.querySelector("#maxSizeLabel");
const showMoreButton = document.querySelector("#showMoreButton");
let currentImages = [];
let visibleImages = [];
let imageByUrl = new Map();
let selectedUrls = new Set();
let activeScanId = 0;
let visibleLimit = PAGE_SIZE;
let ignoredNonImages = 0;
let sliderDebounceTimer = null;
const renderBatcher = createRenderBatcher(() => {
  renderCurrentImages();
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectScanner(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/pageScanner.js"]
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => globalThis.__SIMPLE_IMAGE_DOWNLOADER_SCAN__?.() || []
  });

  return result?.result || [];
}

async function scanImages() {
  const tab = await getActiveTab();
  if (!tab?.id || !isScannablePage(tab.url)) {
    throw new Error(UNSCANNABLE_PAGE_MESSAGE);
  }

  return injectScanner(tab.id);
}

function imageDimensions(image) {
  return image.width && image.height ? `${image.width} x ${image.height}` : "unknown resolution";
}

function renderEmpty(message) {
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = message;
  listElement.replaceChildren(empty);
}

function readMinimumSizeKb() {
  let saved = null;
  try {
    saved = localStorage.getItem(MIN_SIZE_STORAGE_KEY);
  } catch {
    saved = null;
  }
  return clampMinimumSizeKb(parseMinimumSizeKb(saved, DEFAULT_MIN_SIZE_KB));
}

function writeMinimumSizeKb(value) {
  try {
    localStorage.setItem(MIN_SIZE_STORAGE_KEY, String(clampMinimumSizeKb(value)));
  } catch {
    // Storage may be unavailable; the slider value still applies to this session.
  }
}

function updateMinimumSizeLabel(value) {
  maxSizeLabel.textContent = `Min size: ${value} KB`;
}

function syncMinimumSizeControl() {
  const minimumSizeKb = readMinimumSizeKb();
  maxSizeSlider.value = String(minimumSizeKb);
  updateMinimumSizeLabel(minimumSizeKb);
}

function rebuildImageIndex() {
  imageByUrl = new Map(currentImages.map((image) => [image.url, image]));
}

function removeHiddenSelections() {
  const visibleUrls = new Set(visibleImages.map((image) => image.url));
  for (const url of selectedUrls) {
    if (!visibleUrls.has(url)) selectedUrls.delete(url);
  }
}

function updateSelectionUi() {
  const selectedCount = selectedUrls.size;
  downloadSelectedButton.disabled = selectedCount === 0;
  downloadSelectedButton.textContent = selectedCount
    ? `Download selected (${selectedCount})`
    : "Download selected";

  listElement.querySelectorAll(".image-row").forEach((row) => {
    const isSelected = selectedUrls.has(row.dataset.url);
    row.classList.toggle("selected", isSelected);
    row.setAttribute("aria-pressed", String(isSelected));
  });
}

async function downloadUrls(urls) {
  return chrome.runtime.sendMessage({ type: "DOWNLOAD_IMAGES", urls });
}

async function requestImageSize(url) {
  try {
    const result = await chrome.runtime.sendMessage({ type: "GET_IMAGE_SIZE", url });
    if (!result || result.ok === false) return null;
    return {
      sizeBytes: result.sizeBytes ?? null,
      isImage: result.isImage !== false,
      contentType: result.contentType || ""
    };
  } catch {
    return null;
  }
}

function markSizeResolved(url, sizeBytes) {
  const image = imageByUrl.get(url);
  if (!image) return false;

  const nextSizeBytes = Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : image.sizeBytes;
  if (nextSizeBytes === image.sizeBytes && !image.sizePending) {
    return false;
  }

  image.sizeBytes = nextSizeBytes;
  image.sizePending = false;
  return true;
}

function dropNonImages(urls) {
  if (!urls.length) return;
  const dropped = new Set(urls);
  currentImages = currentImages.filter((image) => !dropped.has(image.url));
  rebuildImageIndex();
  ignoredNonImages += urls.length;
}

function resortAndRender() {
  currentImages = sortByLargestResolution(currentImages);
  rebuildImageIndex();
  renderBatcher.request();
}

async function resolveUnknownImageSizes(scanId) {
  try {
    const unresolvedUrls = [
      ...new Set(
        currentImages.filter((image) => !Number.isFinite(image.sizeBytes)).map((image) => image.url)
      )
    ];

    if (!unresolvedUrls.length) return;

    let nextIndex = 0;
    let completed = 0;
    const nonImageUrls = [];
    const workerCount = Math.min(MAX_CONCURRENT_SIZE_REQUESTS, unresolvedUrls.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (scanId === activeScanId) {
          const cursor = nextIndex;
          nextIndex += 1;
          if (cursor >= unresolvedUrls.length) return;

          const url = unresolvedUrls[cursor];
          let result = null;
          try {
            result = await requestImageSize(url);
          } catch {
            result = null;
          }

          if (scanId !== activeScanId) return;

          if (!result) {
            markSizeResolved(url, null);
          } else if (result.isImage === false) {
            nonImageUrls.push(url);
          } else {
            markSizeResolved(url, result.sizeBytes);
          }

          completed += 1;
          if (completed % SIZE_RESOLVE_FLUSH_EVERY === 0) {
            resortAndRender();
          }
        }
      })
    );

    if (scanId !== activeScanId) return;
    if (nonImageUrls.length) dropNonImages(nonImageUrls);
    resortAndRender();
  } catch {
    // Size probing is best-effort and must never break the popup.
  }
}

function renderImages(images) {
  if (!images.length) {
    renderEmpty("No supported images found.");
    updateSelectionUi();
    updateShowMore(0);
    return;
  }

  const fragment = document.createDocumentFragment();

  images.forEach((image) => {
    const row = document.createElement("article");
    row.className = "image-row";
    row.dataset.url = image.url;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Select image ${imageDimensions(image)}`);

    const selectionMark = document.createElement("span");
    selectionMark.className = "selection-mark";
    selectionMark.textContent = "✓";
    selectionMark.setAttribute("aria-hidden", "true");

    const preview = document.createElement("img");
    preview.className = "preview";
    preview.src = image.url;
    preview.alt = "";
    preview.loading = "lazy";
    preview.decoding = "async";

    const meta = document.createElement("div");
    meta.className = "meta";

    const stats = document.createElement("div");
    stats.className = "stats";
    stats.textContent = `${imageDimensions(image)} · ${
      image.sizePending ? "checking size..." : formatBytes(image.sizeBytes)
    }`;

    const source = document.createElement("div");
    source.className = "source";
    source.textContent = `Source: ${image.source}`;

    const url = document.createElement("div");
    url.className = "url";
    url.title = image.url;
    url.textContent = image.url;

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const button = document.createElement("button");
    button.className = "primary";
    button.type = "button";
    button.dataset.action = "download";
    button.dataset.url = image.url;
    button.textContent = "Download";

    actions.append(button);
    meta.append(stats, source, url, actions);
    row.append(selectionMark, preview, meta);
    fragment.append(row);
  });

  listElement.replaceChildren(fragment);
  updateSelectionUi();
}

function updateShowMore(remaining) {
  if (!showMoreButton) return;
  if (remaining > 0) {
    showMoreButton.hidden = false;
    showMoreButton.textContent = `Show more (${remaining} remaining)`;
  } else {
    showMoreButton.hidden = true;
  }
}

listElement.addEventListener("click", async (event) => {
  const actionButton = event.target.closest?.('button[data-action="download"]');
  if (actionButton) {
    event.stopPropagation();
    actionButton.disabled = true;
    actionButton.textContent = "Downloading";

    const result = await downloadUrls([actionButton.dataset.url]);
    const entry = result?.results?.find((item) => item.url === actionButton.dataset.url);
    if (entry?.ok) {
      actionButton.textContent = "Downloaded";
    } else {
      actionButton.disabled = false;
      actionButton.textContent = "Retry";
    }
    return;
  }

  const row = event.target.closest?.(".image-row");
  if (!row) return;

  selectedUrls = toggleSelectedUrl(selectedUrls, row.dataset.url);
  updateSelectionUi();
});

listElement.addEventListener("keydown", (event) => {
  const row = getKeyboardToggleRow(event);
  if (!row) return;

  event.preventDefault();
  selectedUrls = toggleSelectedUrl(selectedUrls, row.dataset.url);
  updateSelectionUi();
});

function renderCurrentImages() {
  const minimumSizeKb = clampMinimumSizeKb(maxSizeSlider.value);
  visibleImages = filterImagesAboveSizeKb(currentImages, minimumSizeKb);
  rebuildImageIndex();
  removeHiddenSelections();

  const total = currentImages.length;
  const shown = visibleImages.length;
  const baseStatus = minimumSizeKb
    ? `${shown} of ${total} images shown`
    : `${total} image${total === 1 ? "" : "s"} found`;
  const pendingCount = currentImages.filter((img) => img.sizePending).length;
  const ignoredSuffix = ignoredNonImages ? ` · ${ignoredNonImages} ignored (not images)` : "";
  statusElement.textContent = pendingCount
    ? `${baseStatus} · checking ${pendingCount} size${pendingCount === 1 ? "" : "s"}${ignoredSuffix}`
    : `${baseStatus}${ignoredSuffix}`;

  if (total > 0 && shown === 0 && minimumSizeKb > 0) {
    renderEmpty(`No images at or above ${minimumSizeKb} KB.`);
    updateSelectionUi();
    updateShowMore(0);
    return;
  }

  renderImages(visibleImages.slice(0, visibleLimit));
  updateShowMore(Math.max(0, shown - visibleLimit));
}

async function refresh() {
  const scanId = ++activeScanId;
  renderBatcher.cancel();
  refreshButton.disabled = true;
  downloadSelectedButton.disabled = true;
  statusElement.textContent = "Scanning current tab...";
  listElement.replaceChildren();
  selectedUrls = new Set();
  currentImages = [];
  visibleImages = [];
  imageByUrl = new Map();
  visibleLimit = PAGE_SIZE;
  ignoredNonImages = 0;
  updateShowMore(0);

  try {
    const images = sortByLargestResolution(await scanImages()).map((image) => ({
      ...image,
      sizePending: !Number.isFinite(image.sizeBytes)
    }));
    if (scanId !== activeScanId) return;

    currentImages = images;
    rebuildImageIndex();
    renderCurrentImages();
    void resolveUnknownImageSizes(scanId);
  } catch (error) {
    statusElement.textContent = "Scan unavailable";
    renderEmpty(error.message);
  } finally {
    if (scanId === activeScanId) {
      refreshButton.disabled = false;
    }
  }
}

downloadSelectedButton.addEventListener("click", async () => {
  const selectedImages = getSelectedImages(currentImages, selectedUrls);
  if (!selectedImages.length) return;

  downloadSelectedButton.disabled = true;
  downloadSelectedButton.textContent = `Downloading ${selectedImages.length}`;

  const result = await downloadUrls(selectedImages.map((image) => image.url));
  const results = result?.results || [];
  const succeeded = results.filter((entry) => entry.ok);
  const failed = results.filter((entry) => !entry.ok);

  if (succeeded.length && !failed.length) {
    selectedUrls = new Set();
    downloadSelectedButton.textContent = `Downloaded ${succeeded.length}`;
    updateSelectionUi();
  } else if (succeeded.length) {
    selectedUrls = new Set(failed.map((entry) => entry.url));
    downloadSelectedButton.disabled = false;
    downloadSelectedButton.textContent = `Downloaded ${succeeded.length} of ${results.length} — retry ${failed.length}`;
    updateSelectionUi();
  } else if (result?.ok) {
    selectedUrls = new Set();
    downloadSelectedButton.textContent = `Downloaded ${(result.downloadIds || []).length}`;
    updateSelectionUi();
  } else {
    downloadSelectedButton.disabled = false;
    downloadSelectedButton.textContent = "Retry selected";
  }
});

maxSizeSlider.addEventListener("input", () => {
  const minimumSizeKb = clampMinimumSizeKb(maxSizeSlider.value);
  updateMinimumSizeLabel(minimumSizeKb);
  if (sliderDebounceTimer) clearTimeout(sliderDebounceTimer);
  sliderDebounceTimer = setTimeout(() => {
    writeMinimumSizeKb(minimumSizeKb);
    renderCurrentImages();
  }, SLIDER_DEBOUNCE_MS);
});

if (showMoreButton) {
  showMoreButton.addEventListener("click", () => {
    visibleLimit += PAGE_SIZE;
    renderCurrentImages();
  });
}

syncMinimumSizeControl();
refreshButton.addEventListener("click", refresh);
refresh();
