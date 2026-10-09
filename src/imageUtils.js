export const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

const SUPPORTED_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);

function hasPathExtension(pathname) {
  return /\.[a-z0-9]+$/i.test(pathname);
}

export function getImageExtension(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

export function isSupportedImageUrl(url, options = {}) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    if (SUPPORTED_EXTENSIONS.has(getImageExtension(url))) {
      return true;
    }

    if (options.source === "link") {
      return false;
    }

    return !hasPathExtension(parsed.pathname);
  } catch {
    return false;
  }
}

export function parseSrcset(srcset) {
  return String(srcset || "")
    .split(",")
    .map((item) => {
      const [url, descriptor = ""] = item.trim().split(/\s+/);
      if (!url) return null;
      const numeric = Number.parseFloat(descriptor);
      return {
        url,
        descriptor,
        score: Number.isFinite(numeric) ? numeric : 0
      };
    })
    .filter(Boolean);
}

export function getLargestSrcsetUrl(srcset) {
  return parseSrcset(srcset).sort((a, b) => b.score - a.score)[0]?.url || "";
}

export function normalizeImageCandidate(candidate) {
  const width = Number.parseInt(candidate.width, 10) || 0;
  const height = Number.parseInt(candidate.height, 10) || 0;
  const sizeBytes = Number.parseInt(candidate.sizeBytes, 10);

  return {
    url: candidate.url,
    width,
    height,
    area: width * height,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : null,
    source: candidate.source || "page"
  };
}

function metadataScore(image) {
  return image.area + (image.sizeBytes ? 1 : 0);
}

export function dedupeImages(images) {
  const byUrl = new Map();

  images.forEach((image) => {
    const existing = byUrl.get(image.url);
    if (!existing || metadataScore(image) > metadataScore(existing)) {
      byUrl.set(image.url, image);
    }
  });

  return [...byUrl.values()];
}

export function sortByLargestResolution(images) {
  return [...images].sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    if ((b.sizeBytes || 0) !== (a.sizeBytes || 0)) return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    return b.width - a.width;
  });
}

export function filterImagesAboveSizeKb(images, minimumSizeKb) {
  const thresholdBytes = Math.max(0, Number.parseInt(minimumSizeKb, 10) || 0) * 1024;
  if (thresholdBytes === 0) return images;
  return images.filter((image) => !Number.isFinite(image.sizeBytes) || image.sizeBytes >= thresholdBytes);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function buildDownloadFilename(url) {
  const parsed = new URL(url);
  const rawExtension = getImageExtension(url);
  const hasExtension = Boolean(rawExtension);
  const extension = rawExtension || "jpg";
  const rawName = hasExtension
    ? decodeURIComponent(parsed.pathname.split("/").pop() || "image-download")
    : "image-download";
  const withoutExtension = foldToAscii(rawName).replace(/\.[^.]+$/, "") || "image-download";
  const safeName = withoutExtension
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeName || "image-download"}.${extension === "jpeg" ? "jpg" : extension}`;
}

const POLISH_FOLD = {
  "\u0105": "a",
  "\u0107": "c",
  "\u0119": "e",
  "\u0142": "l",
  "\u0144": "n",
  "\u00f3": "o",
  "\u015b": "s",
  "\u017a": "z",
  "\u017c": "z"
};

export function foldToAscii(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/g, (ch) => POLISH_FOLD[ch] || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function toggleSelectedUrl(selectedUrls, url) {
  const next = new Set(selectedUrls);
  if (next.has(url)) {
    next.delete(url);
  } else {
    next.add(url);
  }
  return next;
}

export function getSelectedImages(images, selectedUrls) {
  return images.filter((image) => selectedUrls.has(image.url));
}
