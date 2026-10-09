const DEFAULT_PROBE_TIMEOUT_MS = 8000;

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseContentRangeTotal(contentRange) {
  const match = String(contentRange || "").match(/\/(\d+)$/);
  return match ? parsePositiveInt(match[1]) : null;
}

function getContentLength(response) {
  return parsePositiveInt(response?.headers?.get("content-length"));
}

function getContentType(response) {
  const raw = response?.headers?.get("content-type");
  if (!raw) return "";
  return String(raw).split(";")[0].trim().toLowerCase();
}

function isImageContentType(contentType) {
  return !contentType || contentType.startsWith("image/");
}

function getRangeResponseSize(response) {
  const totalBytes = parseContentRangeTotal(response?.headers?.get("content-range"));
  if (totalBytes) return totalBytes;

  if (response?.status !== 206) {
    return getContentLength(response);
  }

  return null;
}

function cancelResponseBody(response) {
  try {
    response?.body?.cancel?.();
  } catch {
    // Ignore cancellation failures because the metadata result is already decided.
  }
}

async function tryFetch(fetchImpl, url, options, timeoutMs) {
  let timer = null;
  let controller = null;
  try {
    if (typeof AbortController === "function") {
      controller = new AbortController();
    }
    const pending = fetchImpl(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return await pending;
    }
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("probe-timeout")), timeoutMs);
    });
    return await Promise.race([pending, timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    try {
      controller?.abort?.();
    } catch {
      // Ignore abort failures; the probe result is already decided.
    }
  }
}

export async function resolveImageInfo(url, fetchImpl = fetch, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

  const headResponse = await tryFetch(
    fetchImpl,
    url,
    { method: "HEAD", credentials: "omit", redirect: "follow" },
    timeoutMs
  );
  const headContentType = getContentType(headResponse);
  if (headContentType && !isImageContentType(headContentType)) {
    cancelResponseBody(headResponse);
    return { sizeBytes: null, contentType: headContentType, isImage: false };
  }
  const headSize = getContentLength(headResponse);
  if (headSize) {
    cancelResponseBody(headResponse);
    return { sizeBytes: headSize, contentType: headContentType, isImage: true };
  }

  const rangeResponse = await tryFetch(
    fetchImpl,
    url,
    { method: "GET", credentials: "omit", headers: { Range: "bytes=0-0" }, redirect: "follow" },
    timeoutMs
  );
  const rangeContentType = getContentType(rangeResponse) || headContentType;
  if (rangeContentType && !isImageContentType(rangeContentType)) {
    cancelResponseBody(rangeResponse);
    return { sizeBytes: null, contentType: rangeContentType, isImage: false };
  }
  const rangeSize = getRangeResponseSize(rangeResponse);
  cancelResponseBody(rangeResponse);
  return { sizeBytes: rangeSize, contentType: rangeContentType, isImage: true };
}

export async function resolveImageSize(url, fetchImpl = fetch) {
  try {
    const info = await resolveImageInfo(url, fetchImpl);
    if (!info || info.isImage === false) return null;
    return info.sizeBytes;
  } catch {
    return null;
  }
}
