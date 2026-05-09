export function getKeyboardToggleRow(event) {
  if (event?.key !== "Enter" && event?.key !== " ") {
    return null;
  }

  if (event?.target?.closest?.('button[data-action="download"]')) {
    return null;
  }

  return event?.target?.closest?.(".image-row") || null;
}
