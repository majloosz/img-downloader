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
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && SUPPORTED_EXTENSIONS.has(getImageExtension(url));
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

export function filterImagesByMinimumSizeKb(images, minimumSizeKb) {
  const thresholdBytes = Math.max(0, Number.parseInt(minimumSizeKb, 10) || 0) * 1024;
  if (thresholdBytes === 0) return images;
  return images.filter((image) => Number.isFinite(image.sizeBytes) && image.sizeBytes >= thresholdBytes);
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
  const hasExtension = Boolean(getImageExtension(url));
  const rawName = hasExtension
    ? decodeURIComponent(parsed.pathname.split("/").pop() || "image-download")
    : "image-download";
  const withoutExtension = /[^\x00-\x7F]/.test(rawName)
    ? "image-download"
    : rawName.replace(/\.[^.]+$/, "") || "image-download";
  const safeName = withoutExtension
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeName || "image-download"}.${extension === "jpeg" ? "jpg" : extension}`;
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
