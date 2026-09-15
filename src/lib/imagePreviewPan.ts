export interface ImagePreviewPanStart {
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
}

export function imagePreviewPanPosition(
  start: ImagePreviewPanStart,
  clientX: number,
  clientY: number,
): { left: number; top: number } {
  return {
    left: start.scrollLeft - (clientX - start.clientX),
    top: start.scrollTop - (clientY - start.clientY),
  };
}
