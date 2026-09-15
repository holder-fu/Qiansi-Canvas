import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { loadCustomPrompts } from '../data/promptLibrary';
import { loadUserLibraryPresets } from './userLibrary';
import { loadAssetVideo, loadEffectVideo } from './libraryMedia';
import { nodeLibraryCategories, nodeLibraryTargets, saveNodeToLibrary } from './nodeLibrarySave';
import { persistImagePreviewForUrl, persistVideoFile } from '../services/mediaPersistence';

const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return memoryStorage.size;
    },
    clear: () => memoryStorage.clear(),
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    removeItem: (key: string) => memoryStorage.delete(key),
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
  } satisfies Storage,
});

vi.mock('./libraryMedia', () => ({
  loadAssetVideo: vi.fn(),
  loadEffectVideo: vi.fn(),
}));

vi.mock('../services/mediaPersistence', () => ({
  persistImagePreviewForUrl: vi.fn(),
  persistVideoFile: vi.fn(),
}));

const imageNode: FlowNode = {
  id: 'generated-image',
  type: 'image',
  position: { x: 0, y: 0 },
  data: {
    kind: 'image',
    title: '紫发剑客',
    prompt: '紫色长发的古风剑客，电影感光影。',
    imageUrl: 'https://example.test/generated-image.png',
    appliedTags: ['古风'],
  },
};

const videoNode: FlowNode = {
  id: 'generated-video',
  type: 'video',
  position: { x: 0, y: 0 },
  data: {
    kind: 'video',
    title: '环绕镜头',
    prompt: '镜头缓慢环绕人物一周。',
    effectVideoId: 'effect-source',
    imageUrl: 'https://example.test/poster.png',
  },
};

describe('saving node content into preset libraries', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('offers image libraries for real images and only the effects library for real videos', () => {
    expect(nodeLibraryTargets(imageNode)).toEqual(['style', 'character', 'prompt']);
    expect(nodeLibraryTargets(videoNode)).toEqual(['effect']);
    expect(
      nodeLibraryTargets({
        ...videoNode,
        data: { ...videoNode.data, effectVideoId: undefined, videoUrl: undefined },
      }),
    ).toEqual([]);
  });

  it('exposes the existing categories used by each destination library', () => {
    expect(nodeLibraryCategories('style').map((item) => item.label)).toContain('动漫游戏');
    expect(nodeLibraryCategories('character').map((item) => item.label)).toContain('古风');
    expect(nodeLibraryCategories('effect').map((item) => item.label)).toContain('Kling 3.0');
    expect(nodeLibraryCategories('prompt')).toContainEqual({
      value: 'character',
      label: '人物设计',
    });
  });

  it('saves an image and its prompt text into the style library', async () => {
    await saveNodeToLibrary(imageNode, 'style', '动漫游戏', 'project-a');

    expect(loadUserLibraryPresets('style')[0]).toMatchObject({
      title: '紫发剑客',
      category: '动漫游戏',
      prompt: '紫色长发的古风剑客，电影感光影。',
      thumbnail: 'https://example.test/generated-image.png',
      tags: ['动漫游戏', '古风', '画布保存'],
    });
  });

  it('persists an ephemeral node image before saving it into the character library', async () => {
    vi.mocked(persistImagePreviewForUrl).mockResolvedValue({
      previewUrl: 'http://127.0.0.1:2895/media-preview/files/stable.webp',
      width: 768,
      height: 768,
    });

    await saveNodeToLibrary(
      {
        ...imageNode,
        data: { ...imageNode.data, imageUrl: 'blob:http://127.0.0.1/session-image' },
      },
      'character',
      '古风',
      'project-a',
    );

    expect(persistImagePreviewForUrl).toHaveBeenCalledWith('blob:http://127.0.0.1/session-image');
    expect(loadUserLibraryPresets('character')[0]?.thumbnail).toBe(
      'http://127.0.0.1:2895/media-preview/files/stable.webp',
    );
  });

  it('saves an image URL together with text into the prompt library', async () => {
    await saveNodeToLibrary(imageNode, 'prompt', 'character', 'project-a');

    expect(loadCustomPrompts()[0]).toMatchObject({
      name: '紫发剑客',
      category: 'character',
      target: 'image',
      prompt: '紫色长发的古风剑客，电影感光影。',
      thumbnailUrl: 'https://example.test/generated-image.png',
    });
  });

  it('copies video bytes and metadata only into the effects library', async () => {
    const videoBlob = new Blob(['video'], { type: 'video/mp4' });
    vi.mocked(loadEffectVideo).mockResolvedValue(videoBlob);

    await expect(saveNodeToLibrary(videoNode, 'style', '推荐', 'project-a')).rejects.toThrow(
      '视频只能保存到特效库',
    );
    vi.mocked(persistVideoFile).mockResolvedValue({
      originalUrl: 'http://127.0.0.1:2895/asset-library/files/asset_video123',
      previewUrl: 'http://127.0.0.1:2895/media-preview/files/preview_video123456789.webp',
      width: 1920,
      height: 1080,
      durationSeconds: 8,
      bridgeAssetId: 'asset_video123',
    });
    const savedId = await saveNodeToLibrary(videoNode, 'effect', 'Kling 3.0', 'project-a');

    expect(loadEffectVideo).toHaveBeenCalledWith('effect-source');
    expect(loadAssetVideo).not.toHaveBeenCalled();
    expect(persistVideoFile).toHaveBeenCalledWith(expect.any(File), 'project-a');
    expect(loadUserLibraryPresets('effect')[0]).toMatchObject({
      id: savedId,
      title: '环绕镜头',
      category: 'Kling 3.0',
      prompt: '镜头缓慢环绕人物一周。',
      thumbnail: 'http://127.0.0.1:2895/media-preview/files/preview_video123456789.webp',
      videoUrl: 'http://127.0.0.1:2895/asset-library/files/asset_video123',
      bridgeAssetId: 'asset_video123',
    });
  });
});
