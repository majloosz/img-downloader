export const BACKGROUND_SCAN_CANDIDATE_LIMIT = 150;

function getResourceSize(entry) {
  const encodedBodySize = Number(entry?.encodedBodySize) || 0;
  const transferSize = Number(entry?.transferSize) || 0;
  const size = encodedBodySize || transferSize;
  return size > 0 ? size : null;
}

export function buildResourceSizeMap(entries) {
  const resourceSizeMap = new Map();

  for (const entry of entries || []) {
    const size = getResourceSize(entry);
    if (!size || !entry?.name) continue;
    resourceSizeMap.set(entry.name, size);
  }

  return resourceSizeMap;
}

export function shouldCollectBackgroundImages(candidateCount) {
  return candidateCount < BACKGROUND_SCAN_CANDIDATE_LIMIT;
}
