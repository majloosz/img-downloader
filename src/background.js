import { buildDownloadFilename, isSupportedImageUrl } from "./imageUtils.js";
import { resolveImageSize } from "./sizeResolver.js";

function downloadImage(url) {
  if (!isSupportedImageUrl(url)) {
    throw new Error("Unsupported image URL");
  }

  return chrome.downloads.download({
    url,
    filename: buildDownloadFilename(url),
    saveAs: false,
    conflictAction: "uniquify"
  });
}

async function downloadImages(urls) {
  const safeUrls = [...new Set(urls)].filter(isSupportedImageUrl);
  if (!safeUrls.length) {
    throw new Error("No supported image URLs selected");
  }

  const downloadIds = [];
  for (const url of safeUrls) {
    downloadIds.push(await downloadImage(url));
  }
  return downloadIds;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_IMAGE_SIZE") {
    resolveImageSize(message.url)
      .then((sizeBytes) => sendResponse({ ok: true, sizeBytes }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "DOWNLOAD_IMAGE") {
    downloadImage(message.url)
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "DOWNLOAD_IMAGES") {
    downloadImages(message.urls || [])
      .then((downloadIds) => sendResponse({ ok: true, downloadIds }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  return false;
});
