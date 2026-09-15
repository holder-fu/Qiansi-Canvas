import type { FlowNode, ImageNodeData } from '../canvas/nodeTypes';
import { isLegacyMediaPlaceholder } from '../canvas/placeholders';
import { CHARACTER_PRESETS } from '../data/characterPresets';
import { EFFECT_MODELS } from '../data/effectPresets';
import {
  addCustomPrompt,
  refreshPromptLibrary,
  STYLE_CATEGORY_OPTIONS,
  type StyleCategory,
} from '../data/promptLibrary';
import { STYLE_CATEGORIES } from '../data/stylePresets';
import { loadAssetVideo, loadEffectVideo } from './libraryMedia';
import {
  imagePreviewSource,
  isBridgeMediaUrl,
  mediaPreviewUrl,
  preferredImageSource,
} from './mediaPreview';
import { persistImagePreviewForUrl, persistVideoFile } from '../services/mediaPersistence';
import { loadUserLibraryPresets, saveUserLibraryPreset, type UserLibraryKind } from './userLibrary';

export type NodeLibraryTarget = Exclude<UserLibraryKind, 'camera'> | 'prompt';

export interface NodeLibraryCategory {
  value: string;
  label: string;
}

export const NODE_LIBRARY_TARGET_LABELS: Record<NodeLibraryTarget, string> = {
  style: '风格库',
  effect: '特效库',
  character: '角色库',
  prompt: '提示词',
};

function nonPlaceholderUrl(value: unknown) {
  return typeof value === 'string' && value && !isLegacyMediaPlaceholder(value) ? value : undefined;
}

export function resolveNodeImageUrl(data: ImageNodeData) {
  return nonPlaceholderUrl(
    preferredImageSource({
      originalUrl: data.originalUrl,
      imageUrl: data.imageUrl,
      images: data.images,
    }),
  );
}

async function resolveStableImageThumbnail(data: ImageNodeData) {
  const source = nonPlaceholderUrl(
    imagePreviewSource({
      originalUrl: data.originalUrl,
      imageUrl: data.imageUrl,
      images: data.images,
      imagePreviewUrl: data.imagePreviewUrl,
      portInputs: data.portInputs,
    }),
  );
  if (!source) return;

  const persistedPreview = nonPlaceholderUrl(data.previewUrl ?? data.imagePreviewPosterUrl);
  if (
    persistedPreview &&
    !persistedPreview.startsWith('blob:') &&
    !persistedPreview.startsWith('data:')
  ) {
    return persistedPreview;
  }
  if (source.startsWith('blob:') || source.startsWith('data:')) {
    return (await persistImagePreviewForUrl(source)).previewUrl;
  }
  return isBridgeMediaUrl(source) ? mediaPreviewUrl(source, 'image') : source;
}

function resolveNodeVideoUrl(data: ImageNodeData) {
  return nonPlaceholderUrl(data.videoUrl) ?? nonPlaceholderUrl(data.videos?.[0]);
}

function hasVideoContent(data: ImageNodeData) {
  return Boolean(
    resolveNodeVideoUrl(data) ||
    (typeof data.effectVideoId === 'string' && data.effectVideoId) ||
    (typeof data.assetVideoId === 'string' && data.assetVideoId),
  );
}

export function nodeLibraryTargets(node?: FlowNode): NodeLibraryTarget[] {
  if (!node) return [];
  if (node.data.kind === 'video' || node.data.kind === 'video-comp') {
    return hasVideoContent(node.data) ? ['effect'] : [];
  }
  return resolveNodeImageUrl(node.data) ? ['style', 'character', 'prompt'] : [];
}

function uniqueCategories(values: string[]): NodeLibraryCategory[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].map((value) => ({
    value,
    label: value,
  }));
}

export function nodeLibraryCategories(target: NodeLibraryTarget): NodeLibraryCategory[] {
  if (target === 'prompt') {
    return STYLE_CATEGORY_OPTIONS.map((category) => ({
      value: category.key,
      label: category.zh,
    }));
  }

  const customCategories = loadUserLibraryPresets(target).map((preset) => preset.category);
  if (target === 'style') {
    return uniqueCategories([...STYLE_CATEGORIES, ...customCategories, '未分类']);
  }
  if (target === 'character') {
    return uniqueCategories([
      ...CHARACTER_PRESETS.map((preset) => preset.style),
      ...customCategories,
      '未分类',
    ]);
  }
  return uniqueCategories([
    ...EFFECT_MODELS.filter((model) => model !== '全部'),
    ...customCategories,
    '未分类',
  ]);
}

function meaningfulText(value: unknown) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || /^(?:data:|blob:|https?:\/\/\S+)$/i.test(text)) return '';
  return text;
}

function nodeText(data: ImageNodeData) {
  return (
    meaningfulText(data.prompt) ||
    meaningfulText(data.outputText) ||
    meaningfulText(data.description) ||
    meaningfulText(data.result) ||
    meaningfulText(data.title) ||
    '来自画布的素材'
  );
}

function nodeDescription(data: ImageNodeData, prompt: string) {
  return meaningfulText(data.description) || prompt;
}

function nodeTags(data: ImageNodeData, categoryLabel: string) {
  const appliedTags = Array.isArray(data.appliedTags)
    ? data.appliedTags.filter(
        (tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()),
      )
    : [];
  return [...new Set([categoryLabel, ...appliedTags, '画布保存'])];
}

function nodeTitle(data: ImageNodeData) {
  return meaningfulText(data.title) || meaningfulText(data.imageFileName) || '未命名素材';
}

function nodeDuration(data: ImageNodeData) {
  const direct = data.durationSeconds;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct;
  const params =
    data.genParams && typeof data.genParams === 'object'
      ? (data.genParams as Record<string, unknown>)
      : undefined;
  const duration = params?.duration;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : undefined;
}

async function loadNodeVideoBlob(data: ImageNodeData) {
  if (typeof data.effectVideoId === 'string' && data.effectVideoId) {
    const blob = await loadEffectVideo(data.effectVideoId);
    if (blob) return blob;
  }
  if (typeof data.assetVideoId === 'string' && data.assetVideoId) {
    const blob = await loadAssetVideo(data.assetVideoId);
    if (blob) return blob;
  }
  const videoUrl = resolveNodeVideoUrl(data);
  if (!videoUrl) throw new Error('当前视频没有可保存的真实内容');
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`读取视频失败（${response.status}）`);
  return response.blob();
}

function createPresetId(kind: Exclude<UserLibraryKind, 'camera'>) {
  return `user-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveNodeToLibrary(
  node: FlowNode,
  target: NodeLibraryTarget,
  category: string,
  projectId: string,
) {
  if (!nodeLibraryTargets(node).includes(target)) {
    throw new Error(
      node.data.kind === 'video' || node.data.kind === 'video-comp'
        ? '视频只能保存到特效库'
        : '当前节点没有可保存到该素材库的内容',
    );
  }

  const categoryOption = nodeLibraryCategories(target).find((item) => item.value === category);
  if (!categoryOption) throw new Error('请选择有效的素材分类');

  const title = nodeTitle(node.data);
  const prompt = nodeText(node.data);
  const thumbnail = await resolveStableImageThumbnail(node.data);
  const tags = nodeTags(node.data, categoryOption.label);

  if (target === 'prompt') {
    const saved = addCustomPrompt({
      name: title,
      category: category as StyleCategory,
      target: 'image',
      description: nodeDescription(node.data, prompt),
      prompt,
      promptModules: {},
      negative: '',
      color: '#10b981',
      tags,
      thumbnailFile: '',
      thumbnailUrl: thumbnail,
    });
    refreshPromptLibrary();
    return saved.id;
  }

  if (target === 'effect') {
    const presetId = createPresetId('effect');
    const video = await loadNodeVideoBlob(node.data);
    const extension = video.type.includes('webm') ? 'webm' : 'mp4';
    const file =
      video instanceof File
        ? video
        : new File([video], node.data.videoFileName || `${title}.${extension}`, {
            type: video.type || (extension === 'webm' ? 'video/webm' : 'video/mp4'),
          });
    const persisted = await persistVideoFile(file, projectId);
    return saveUserLibraryPreset('effect', {
      id: presetId,
      title,
      category,
      prompt,
      thumbnail: persisted.previewUrl,
      thumbnailAssetId: persisted.previewAssetId,
      videoUrl: persisted.originalUrl,
      previewUrl: persisted.previewUrl,
      mediaWidth: persisted.width,
      mediaHeight: persisted.height,
      durationSeconds: persisted.durationSeconds || nodeDuration(node.data),
      bridgeAssetId: persisted.bridgeAssetId,
      tags,
    });
  }

  return saveUserLibraryPreset(target, {
    title,
    category,
    prompt,
    thumbnail,
    tags,
  });
}
