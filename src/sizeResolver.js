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

async function tryFetch(fetchImpl, url, options) {
  try {
    return await fetchImpl(url, options);
  } catch {
    return null;
  }
}

export async function resolveImageSize(url, fetchImpl = fetch) {
  const headResponse = await tryFetch(fetchImpl, url, {
    method: "HEAD",
    credentials: "omit",
    redirect: "follow"
  });
  const headSize = getContentLength(headResponse);
  cancelResponseBody(headResponse);
  if (headSize) return headSize;

  const rangeResponse = await tryFetch(fetchImpl, url, {
    method: "GET",
    credentials: "omit",
    headers: { Range: "bytes=0-0" },
    redirect: "follow"
  });
  const rangeSize = getRangeResponseSize(rangeResponse);
  cancelResponseBody(rangeResponse);
  return rangeSize;
}
