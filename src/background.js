import { buildDownloadFilename, isSupportedImageUrl } from "./imageUtils.js";
import { createAsyncResultCache } from "./asyncResultCache.js";
import { resolveImageInfo } from "./sizeResolver.js";

const imageSizeCache = createAsyncResultCache((url) => resolveImageInfo(url));

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

  const results = [];
  for (const url of safeUrls) {
    try {
      results.push({ url, ok: true, downloadId: await downloadImage(url) });
    } catch (error) {
      results.push({ url, ok: false, error: error?.message || "Download failed" });
    }
  }
  return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_IMAGE_SIZE") {
    imageSizeCache
      .get(message.url)
      .then((info) =>
        sendResponse({
          ok: true,
          sizeBytes: info && info.isImage !== false ? info.sizeBytes : null,
          contentType: info?.contentType || "",
          isImage: !info || info.isImage !== false
        })
      )
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
      .then((results) =>
        sendResponse({
          ok: true,
          results,
          downloadIds: results.filter((result) => result.ok).map((result) => result.downloadId)
        })
      )
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  return false;
});
