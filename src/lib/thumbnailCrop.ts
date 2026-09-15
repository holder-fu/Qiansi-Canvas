export type ThumbnailCropSize = { width: number; height: number };

export function calculateThumbnailCoverMetrics(
  imageSize: ThumbnailCropSize,
  viewport: ThumbnailCropSize,
  zoom: number,
) {
  const scale =
    Math.max(viewport.width / imageSize.width, viewport.height / imageSize.height) * zoom;
  const width = imageSize.width * scale;
  const height = imageSize.height * scale;
  return {
    width,
    height,
    maxX: Math.max(0, (width - viewport.width) / 2),
    maxY: Math.max(0, (height - viewport.height) / 2),
  };
}

export function calculateThumbnailCropRegion(
  imageSize: ThumbnailCropSize,
  viewport: ThumbnailCropSize,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const scale =
    Math.max(viewport.width / imageSize.width, viewport.height / imageSize.height) * zoom;
  const width = viewport.width / scale;
  const height = viewport.height / scale;
  const centerX = imageSize.width / 2 - offsetX / scale;
  const centerY = imageSize.height / 2 - offsetY / scale;
  return {
    x: Math.max(0, Math.min(imageSize.width - width, centerX - width / 2)),
    y: Math.max(0, Math.min(imageSize.height - height, centerY - height / 2)),
    width,
    height,
  };
}
