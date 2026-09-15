import type { FlowNode } from '../canvas/nodeTypes';
import { isPlaceholderMediaUrl } from '../canvas/placeholders';
import { preferredImageSource, resolveMediaSourceUrl } from './mediaPreview';

export interface CanvasNodeImageOption {
  id: string;
  nodeId: string;
  title: string;
  url: string;
}

export type CanvasNodeImageSortOrder = 'newest' | 'oldest';

export async function canvasImageOptionToFile(
  option: CanvasNodeImageOption,
  basename: string,
): Promise<File> {
  const response = await fetch(option.url);
  if (!response.ok) throw new Error('Unable to read canvas image');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Canvas source is not an image');
  const extension = blob.type.split('/')[1]?.split('+')[0] || 'png';
  return new File([blob], `${basename}.${extension}`, { type: blob.type });
}

const NON_IMAGE_NODE_KINDS = new Set<FlowNode['data']['kind']>([
  'video',
  'video-comp',
  'audio',
  'director',
  'director-2d',
  'director-3d',
]);

const NON_IMAGE_DATA_URL = /^data:(?:audio|video)\//i;
const NON_IMAGE_FILE_EXTENSION =
  /\.(?:aac|avi|flac|m4a|m4v|mkv|mov|mp3|mp4|mpeg|mpg|oga|ogg|ogv|opus|wav|webm)(?:$|[?#])/i;

function isSelectableCanvasImage(node: FlowNode, source: string): boolean {
  const normalized = source.trim();
  return Boolean(
    normalized &&
    !NON_IMAGE_NODE_KINDS.has(node.data.kind) &&
    !isPlaceholderMediaUrl(normalized) &&
    !NON_IMAGE_DATA_URL.test(normalized) &&
    !NON_IMAGE_FILE_EXTENSION.test(normalized),
  );
}

/** Reorder node groups without changing the image order owned by each node. */
export function sortCanvasNodeImageOptions(
  options: CanvasNodeImageOption[],
  order: CanvasNodeImageSortOrder,
): CanvasNodeImageOption[] {
  if (order === 'newest') return [...options];
  const groups = new Map<string, CanvasNodeImageOption[]>();
  for (const option of options) {
    const group = groups.get(option.nodeId);
    if (group) group.push(option);
    else groups.set(option.nodeId, [option]);
  }
  return [...groups.values()].reverse().flat();
}

/** List real, node-owned still images newest-first; previews and non-image media are excluded. */
export function canvasNodeImageOptions(nodes: FlowNode[]): CanvasNodeImageOption[] {
  return [...nodes].reverse().flatMap((node) => {
    const sources = Array.from(
      new Set(
        [preferredImageSource(node.data), ...(node.data.images ?? [])].filter(
          (source): source is string =>
            typeof source === 'string' && isSelectableCanvasImage(node, source),
        ),
      ),
    );
    return sources.map((source, index) => ({
      id: `${node.id}:${index}`,
      nodeId: node.id,
      title: sources.length > 1 ? `${node.data.title} · ${index + 1}` : node.data.title,
      url: resolveMediaSourceUrl(source),
    }));
  });
}
