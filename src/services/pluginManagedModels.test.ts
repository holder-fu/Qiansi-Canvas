import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizePluginManagedImageRequest } from './pluginSandbox';
import { registerManagedMedia, resolveManagedImageReferences } from './pluginManagedMediaBridge';

const mocks = vi.hoisted(() => ({
  connections: [] as Array<Record<string, unknown>>,
  available: {
    chat: [] as Array<Record<string, unknown>>,
    image: [] as Array<Record<string, unknown>>,
    video: [] as Array<Record<string, unknown>>,
  },
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
  generateNodeContent: vi.fn(),
}));

vi.mock('./ai', () => ({
  generateImage: mocks.generateImage,
  generateVideo: mocks.generateVideo,
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/keyVault', () => ({
  hydrateApiKeys: vi.fn(async (connections: Array<Record<string, unknown>>) => connections),
}));

vi.mock('../lib/providerRegistry', () => ({
  availableProviderModels: vi.fn(
    (_connections: Array<Record<string, unknown>>, kind: 'chat' | 'image' | 'video') =>
      mocks.available[kind],
  ),
  isProviderConnectionUsable: vi.fn(() => true),
  loadProviderConnections: vi.fn(() => mocks.connections),
}));

import {
  listPluginManagedImageModels,
  listPluginManagedVideoModels,
  runPluginManagedImageModel,
  runPluginManagedVideoModel,
} from './pluginManagedModels';

function connection() {
  return {
    id: 'provider-main',
    name: 'Provider Main',
    enabled: true,
    canGenerate: true,
    disabledModelKinds: [],
    protocol: 'openai',
    baseUrl: 'https://provider.example/v1',
    endpoint: '',
    authType: 'bearer',
    apiKey: 'host-secret',
    models: { chat: [], image: ['image-v1'], video: ['video-v1'], audio: [] },
    modelCapabilities: {},
  };
}

function capability(kind: 'image' | 'video', overrides: Record<string, unknown> = {}) {
  return {
    key: `provider-main\0${kind}-v1`,
    providerId: 'provider-main',
    providerName: 'Provider Main',
    model: `${kind}-v1`,
    displayName: `${kind} v1`,
    label: `Provider Main · ${kind} v1`,
    recommended: false,
    ...overrides,
  };
}

describe('plugin managed media models', () => {
  beforeEach(() => {
    mocks.connections = [connection()];
    mocks.available.chat = [];
    mocks.available.image = [capability('image')];
    mocks.available.video = [capability('video')];
    mocks.generateImage.mockReset();
    mocks.generateVideo.mockReset();
    mocks.generateNodeContent.mockReset();
  });

  it('lists only public image model metadata and keeps provider secrets host-side', () => {
    const [model] = listPluginManagedImageModels();
    expect(model).toMatchObject({
      capabilityId: 'image:provider-main:image-v1',
      providerId: 'provider-main',
      model: 'image-v1',
    });
    expect(model).not.toHaveProperty('apiKey');
    expect(model).not.toHaveProperty('baseUrl');
  });

  it('advertises audio request control for every public video model without a whitelist', () => {
    mocks.available.video = [capability('video', { videoAudioOutput: false })];
    const [model] = listPluginManagedVideoModels();
    expect(model).toMatchObject({
      capabilityId: 'video:provider-main:video-v1',
      providerId: 'provider-main',
      model: 'video-v1',
      videoAudioOutput: true,
    });
  });

  it('runs one image through the selected host provider without returning its connection', async () => {
    mocks.generateImage.mockResolvedValue({ images: ['/output/plugin-image.png'] });
    const result = await runPluginManagedImageModel({
      providerId: 'provider-main',
      model: 'image-v1',
      prompt: '云海宫殿',
      requestId: 'pm-session-image-0001',
      size: '1024x1024',
      aspectRatio: '1:1',
      quality: '2K',
    });
    expect(result).toEqual({
      url: '/output/plugin-image.png',
      providerId: 'provider-main',
      model: 'image-v1',
    });
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1, prompt: '云海宫殿', size: '1024x1024' }),
    );
    expect(mocks.generateImage.mock.calls[0]?.[0]?.provider).toMatchObject({
      apiKey: 'host-secret',
      baseUrl: 'https://provider.example/v1',
    });
  });

  it('passes approved asset handles through the sandbox contract into the image generator', async () => {
    mocks.available.image = [
      capability('image', { inputModalities: ['text', 'image'], maxReferenceImages: 2 }),
    ];
    mocks.generateImage.mockResolvedValue({ images: ['https://example.test/first-frame.png'] });
    const registry = new Map();
    const scope = { pluginId: 'production-studio', sessionId: 'session-a' };
    const urls = ['https://example.test/character.png', 'https://example.test/scene.png'];
    const handles = urls.map(
      (url) =>
        registerManagedMedia(registry, scope, {
          kind: 'image',
          url,
          providerId: 'provider-main',
          model: 'image-v1',
        }).mediaId,
    );
    const { referenceMediaIds, ...request } = sanitizePluginManagedImageRequest({
      providerId: 'provider-main',
      model: 'image-v1',
      prompt: '以人物与场景参考生成首帧',
      referenceMediaIds: handles,
    });
    await runPluginManagedImageModel({
      ...request,
      referenceImages: resolveManagedImageReferences(
        registry,
        referenceMediaIds ?? [],
        scope.pluginId,
        scope.sessionId,
      ),
    });
    expect(mocks.generateImage).toHaveBeenCalledOnce();
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: urls,
        count: 1,
      }),
    );
    expect(mocks.generateImage.mock.calls[0]?.[0]).not.toHaveProperty('referenceMediaIds');
  });

  it('rejects undeclared or excessive image references before the image generator runs', async () => {
    const request = {
      providerId: 'provider-main',
      model: 'image-v1',
      prompt: '首帧',
      referenceImages: ['https://example.test/asset.png'],
    };
    await expect(runPluginManagedImageModel(request)).rejects.toThrow('未声明参考图能力');
    mocks.available.image = [capability('image', { maxReferenceImages: 2 })];
    await expect(runPluginManagedImageModel(request)).rejects.toThrow('未声明参考图能力');
    mocks.available.image = [
      capability('image', { inputModalities: ['text', 'image'], maxReferenceImages: 1 }),
    ];
    await expect(
      runPluginManagedImageModel({
        ...request,
        referenceImages: [...request.referenceImages, 'https://example.test/second.png'],
      }),
    ).rejects.toThrow('最多接受 1 张参考图片');
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it('fails closed when a video model has not declared reference-image support', async () => {
    await expect(
      runPluginManagedVideoModel({
        providerId: 'provider-main',
        model: 'video-v1',
        prompt: '推进镜头',
        referenceImages: ['/output/reference.png'],
      }),
    ).rejects.toThrow('未声明参考图能力');
    expect(mocks.generateVideo).not.toHaveBeenCalled();

    mocks.available.video = [capability('video', { maxReferenceImages: 1 })];
    await expect(
      runPluginManagedVideoModel({
        providerId: 'provider-main',
        model: 'video-v1',
        prompt: '推进镜头',
        referenceImages: ['/output/reference.png'],
      }),
    ).rejects.toThrow('未声明参考图能力');
    expect(mocks.generateVideo).not.toHaveBeenCalled();
  });

  it('passes one same-session reference and never gates the requested native audio', async () => {
    mocks.available.video = [
      capability('video', {
        maxReferenceImages: 1,
        inputModalities: ['text', 'image'],
        videoAudioOutput: false,
      }),
    ];
    mocks.generateVideo.mockResolvedValue({
      videos: ['/output/plugin-video.mp4'],
      audioTrackStatus: 'present',
    });
    const result = await runPluginManagedVideoModel({
      providerId: 'provider-main',
      model: 'video-v1',
      prompt: '推进镜头',
      requestId: 'pm-session-video-0001',
      referenceImages: ['/output/reference.png'],
      duration: 5,
      resolution: '720P',
      audio: true,
    });
    expect(result).toMatchObject({
      url: '/output/plugin-video.mp4',
      audioRequested: true,
      audioTrackStatus: 'present',
    });
    expect(mocks.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 1,
        referenceImages: ['/output/reference.png'],
        duration: 5,
        audio: true,
      }),
    );
  });

  it('also forwards an explicit audio-off request and reports the probed result', async () => {
    mocks.generateVideo.mockResolvedValue({
      videos: ['/output/silent-plugin-video.mp4'],
      audioTrackStatus: 'absent',
    });
    const result = await runPluginManagedVideoModel({
      providerId: 'provider-main',
      model: 'video-v1',
      prompt: '静音画面测试',
      audio: false,
    });
    expect(mocks.generateVideo).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(result).toMatchObject({ audioRequested: false, audioTrackStatus: 'absent' });
  });
});
