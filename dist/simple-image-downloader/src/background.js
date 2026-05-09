import { buildDownloadFilename, isSupportedImageUrl } from "./imageUtils.js";

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "DOWNLOAD_IMAGE") {
    return false;
  }

  downloadImage(message.url)
    .then((downloadId) => sendResponse({ ok: true, downloadId }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
