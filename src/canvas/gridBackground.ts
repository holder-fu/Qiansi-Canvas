export function viewportStableGridMetrics({
  gap,
  size,
  zoom,
}: {
  gap: number;
  size: number;
  zoom: number;
}) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  return {
    gap: gap / safeZoom,
    size: size / safeZoom,
  };
}
