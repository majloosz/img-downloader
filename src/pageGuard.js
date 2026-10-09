export const UNSCANNABLE_PAGE_MESSAGE =
  "This page does not allow extensions to scan it (open a regular http(s) page)";

export function isScannablePage(url) {
  if (typeof url !== "string" || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
