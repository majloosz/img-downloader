import {
  filterImagesAboveSizeKb,
  formatBytes,
  getSelectedImages,
  sortByLargestResolution,
  toggleSelectedUrl
} from "./imageUtils.js";

const DEFAULT_MIN_SIZE_KB = 5;
const MIN_SIZE_STORAGE_KEY = "simpleImageDownloader.minimumSizeKb";
const statusElement = document.querySelector("#status");
const listElement = document.querySelector("#imageList");
const refreshButton = document.querySelector("#refreshButton");
const downloadSelectedButton = document.querySelector("#downloadSelectedButton");
const maxSizeSlider = document.querySelector("#maxSizeSlider");
const maxSizeLabel = document.querySelector("#maxSizeLabel");
let currentImages = [];
let visibleImages = [];
let selectedUrls = new Set();

function isRestrictedPage(url) {
  return !url || /^(chrome|edge|about|chrome-extension):\/\//.test(url);
}

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
  if (!tab?.id || isRestrictedPage(tab.url)) {
    throw new Error("Chrome does not allow extensions to scan this page");
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
  const savedValue = Number.parseInt(localStorage.getItem(MIN_SIZE_STORAGE_KEY), 10);
  return Number.isFinite(savedValue) ? savedValue : DEFAULT_MIN_SIZE_KB;
}

function writeMinimumSizeKb(value) {
  localStorage.setItem(MIN_SIZE_STORAGE_KEY, String(value));
}

function updateMinimumSizeLabel(value) {
  maxSizeLabel.textContent = `Min size: ${value} KB`;
}

function syncMinimumSizeControl() {
  const minimumSizeKb = readMinimumSizeKb();
  maxSizeSlider.value = String(minimumSizeKb);
  updateMinimumSizeLabel(minimumSizeKb);
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

function renderImages(images) {
  if (!images.length) {
    renderEmpty("No JPG, JPEG, PNG, or WEBP images found.");
    updateSelectionUi();
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
    row.addEventListener("click", () => {
      selectedUrls = toggleSelectedUrl(selectedUrls, image.url);
      updateSelectionUi();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectedUrls = toggleSelectedUrl(selectedUrls, image.url);
        updateSelectionUi();
      }
    });

    const selectionMark = document.createElement("span");
    selectionMark.className = "selection-mark";
    selectionMark.textContent = "✓";
    selectionMark.setAttribute("aria-hidden", "true");

    const preview = document.createElement("img");
    preview.className = "preview";
    preview.src = image.url;
    preview.alt = "";
    preview.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "meta";

    const stats = document.createElement("div");
    stats.className = "stats";
    stats.textContent = `${imageDimensions(image)} · ${formatBytes(image.sizeBytes)}`;

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
    button.textContent = "Download";
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      button.disabled = true;
      button.textContent = "Downloading";

      const result = await downloadUrls([image.url]);
      if (result?.ok) {
        button.textContent = "Downloaded";
      } else {
        button.disabled = false;
        button.textContent = "Retry";
      }
    });

    actions.append(button);
    meta.append(stats, source, url, actions);
    row.append(selectionMark, preview, meta);
    fragment.append(row);
  });

  listElement.replaceChildren(fragment);
  updateSelectionUi();
}

function renderCurrentImages() {
  const minimumSizeKb = Number.parseInt(maxSizeSlider.value, 10) || 0;
  visibleImages = filterImagesAboveSizeKb(currentImages, minimumSizeKb);
  removeHiddenSelections();

  const total = currentImages.length;
  const shown = visibleImages.length;
  statusElement.textContent = minimumSizeKb
    ? `${shown} of ${total} images shown`
    : `${total} image${total === 1 ? "" : "s"} found`;

  if (total > 0 && shown === 0 && minimumSizeKb > 0) {
    renderEmpty(`No images at or above ${minimumSizeKb} KB.`);
    updateSelectionUi();
    return;
  }

  renderImages(visibleImages);
}

async function refresh() {
  refreshButton.disabled = true;
  downloadSelectedButton.disabled = true;
  statusElement.textContent = "Scanning current tab...";
  listElement.replaceChildren();
  selectedUrls = new Set();
  currentImages = [];
  visibleImages = [];

  try {
    const images = sortByLargestResolution(await scanImages());
    currentImages = images;
    renderCurrentImages();
  } catch (error) {
    statusElement.textContent = "Scan unavailable";
    renderEmpty(error.message);
  } finally {
    refreshButton.disabled = false;
  }
}

downloadSelectedButton.addEventListener("click", async () => {
  const selectedImages = getSelectedImages(currentImages, selectedUrls);
  if (!selectedImages.length) return;

  downloadSelectedButton.disabled = true;
  downloadSelectedButton.textContent = `Downloading ${selectedImages.length}`;

  const result = await downloadUrls(selectedImages.map((image) => image.url));
  if (result?.ok) {
    selectedUrls = new Set();
    downloadSelectedButton.textContent = `Downloaded ${result.downloadIds.length}`;
    updateSelectionUi();
  } else {
    downloadSelectedButton.disabled = false;
    downloadSelectedButton.textContent = "Retry selected";
  }
});

maxSizeSlider.addEventListener("input", () => {
  const minimumSizeKb = Number.parseInt(maxSizeSlider.value, 10) || 0;
  writeMinimumSizeKb(minimumSizeKb);
  updateMinimumSizeLabel(minimumSizeKb);
  renderCurrentImages();
});

syncMinimumSizeControl();
refreshButton.addEventListener("click", refresh);
refresh();
