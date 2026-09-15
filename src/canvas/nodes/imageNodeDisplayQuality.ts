export const IMAGE_NODE_ORIGINAL_ZOOM_THRESHOLD = 1;

export function shouldRenderImageNodeOriginal({
  isVideoNode,
  singleSelected,
  zoom,
  originalUrl,
}: {
  isVideoNode: boolean;
  singleSelected: boolean;
  zoom: number;
  originalUrl?: string;
}) {
  return (
    !isVideoNode &&
    singleSelected &&
    zoom > IMAGE_NODE_ORIGINAL_ZOOM_THRESHOLD &&
    Boolean(originalUrl)
  );
}
