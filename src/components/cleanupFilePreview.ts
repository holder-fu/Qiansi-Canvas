export const CLEANUP_FILE_PREVIEW_WIDTH = 320;
export const CLEANUP_FILE_PREVIEW_HEIGHT = 286;
export const CLEANUP_FILE_PREVIEW_GAP = 12;
export const CLEANUP_FILE_PREVIEW_MARGIN = 12;

interface PreviewAnchorRect {
  left: number;
  right: number;
  top: number;
}

interface PreviewViewport {
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function placeCleanupFilePreview(anchor: PreviewAnchorRect, viewport: PreviewViewport) {
  const maximumLeft = Math.max(
    CLEANUP_FILE_PREVIEW_MARGIN,
    viewport.width - CLEANUP_FILE_PREVIEW_WIDTH - CLEANUP_FILE_PREVIEW_MARGIN,
  );
  const maximumTop = Math.max(
    CLEANUP_FILE_PREVIEW_MARGIN,
    viewport.height - CLEANUP_FILE_PREVIEW_HEIGHT - CLEANUP_FILE_PREVIEW_MARGIN,
  );
  const rightCandidate = anchor.right + CLEANUP_FILE_PREVIEW_GAP;
  const leftCandidate = anchor.left - CLEANUP_FILE_PREVIEW_GAP - CLEANUP_FILE_PREVIEW_WIDTH;
  const left =
    rightCandidate + CLEANUP_FILE_PREVIEW_WIDTH <= viewport.width - CLEANUP_FILE_PREVIEW_MARGIN
      ? rightCandidate
      : leftCandidate;

  return {
    left: clamp(left, CLEANUP_FILE_PREVIEW_MARGIN, maximumLeft),
    top: clamp(anchor.top, CLEANUP_FILE_PREVIEW_MARGIN, maximumTop),
  };
}
