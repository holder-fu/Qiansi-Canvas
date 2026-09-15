export type PanoramaPromptPositionInput = {
  anchorLeft: number;
  anchorRight: number;
  anchorTop: number;
  anchorBottom: number;
  viewportWidth: number;
  viewportHeight: number;
  promptWidth: number;
  promptHeight: number;
  gap?: number;
  margin?: number;
};

export function resolvePanoramaPromptPosition({
  anchorLeft,
  anchorRight,
  anchorTop,
  anchorBottom,
  viewportWidth,
  viewportHeight,
  promptWidth,
  promptHeight,
  gap = 12,
  margin = 12,
}: PanoramaPromptPositionInput) {
  const maxLeft = Math.max(margin, viewportWidth - promptWidth - margin);
  const centeredLeft = (anchorLeft + anchorRight - promptWidth) / 2;
  const left = Math.min(Math.max(centeredLeft, margin), maxLeft);
  const below = anchorBottom + gap;

  if (below + promptHeight <= viewportHeight - margin) {
    return { left, top: below };
  }

  // A tall node can extend beyond the current viewport. Keep the confirmation
  // visible at the lower edge instead of silently placing it below the canvas.
  if (anchorBottom > viewportHeight - margin) {
    return { left, top: Math.max(margin, viewportHeight - promptHeight - margin) };
  }

  const above = anchorTop - gap - promptHeight;
  if (above >= margin) return { left, top: above };

  return {
    left,
    top: Math.min(
      Math.max(below, margin),
      Math.max(margin, viewportHeight - promptHeight - margin),
    ),
  };
}
