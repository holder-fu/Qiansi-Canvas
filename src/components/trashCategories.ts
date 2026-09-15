import { NODE_KIND_META, type FlowNode } from '../canvas/nodeTypes';
import type { TrashItem } from '../store/canvasStore';

export type TrashCategory = 'all' | 'node' | 'image' | 'video' | 'audio';

export const TRASH_CATEGORY_LABELS: Record<TrashCategory, string> = {
  all: '全部',
  node: '节点',
  image: '图片',
  video: '视频',
  audio: '音频',
};

const IMAGE_KINDS = new Set<FlowNode['data']['kind']>([
  'image',
  'views',
  'front-frame',
  'generator',
  'midjourney',
  'msgen',
]);

function nodeTrashCategory(node: FlowNode): Exclude<TrashCategory, 'all'> {
  const data = node.data;
  if (
    data.kind === 'video' ||
    data.kind === 'video-comp' ||
    typeof data.videoUrl === 'string' ||
    Boolean(data.videos?.length) ||
    typeof data.assetVideoId === 'string' ||
    typeof data.effectVideoId === 'string'
  ) {
    return 'video';
  }
  if (data.kind === 'audio' || typeof data.audioUrl === 'string' || Boolean(data.audios?.length)) {
    return 'audio';
  }
  if (
    IMAGE_KINDS.has(data.kind) ||
    typeof data.imageUrl === 'string' ||
    Boolean(data.images?.length)
  ) {
    return 'image';
  }
  return 'node';
}

export function trashItemCategories(item: TrashItem) {
  return new Set(item.nodes.map(nodeTrashCategory));
}

export function trashItemMatchesCategory(item: TrashItem, category: TrashCategory) {
  return category === 'all' || trashItemCategories(item).has(category);
}

export function trashItemKindLabel(item: TrashItem) {
  if (item.nodes.length > 1) return '节点组';
  const kind = item.nodes[0]?.data.kind;
  return kind ? NODE_KIND_META[kind]?.label || '节点' : '节点';
}
