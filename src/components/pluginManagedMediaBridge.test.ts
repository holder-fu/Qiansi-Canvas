import { describe, expect, it, vi } from 'vitest';
import { sanitizePluginProjectGraphRequest } from '../services/pluginSandbox';
import {
  captureManagedVideoFrame,
  managedMediaRecord,
  previewManagedMedia,
  readManagedCanvasImageCopy,
  readManagedImagePreviewSource,
  registerManagedCanvasImage,
  registerManagedMedia,
  releaseManagedMediaRegistry,
  resolveManagedImageReferences,
  resolveManagedProjectGraphMedia,
} from '../services/pluginManagedMediaBridge';

describe('plugin managed media bridge scope', () => {
  it('resolves image references in order and rejects foreign, released and video handles', () => {
    const registry = new Map();
    const scope = { pluginId: 'production-studio', sessionId: 'session-a' };
    const first = registerManagedMedia(registry, scope, {
      kind: 'image',
      url: 'https://example.test/character.png',
      providerId: 'image-main',
      model: 'image-v1',
    });
    const second = registerManagedMedia(registry, scope, {
      kind: 'image',
      url: 'https://example.test/scene.png',
      providerId: 'image-main',
      model: 'image-v1',
    });
    const video = registerManagedMedia(registry, scope, {
      kind: 'video',
      url: 'https://example.test/clip.mp4',
      providerId: 'video-main',
      model: 'video-v1',
    });
    const ids = [second.mediaId, first.mediaId];
    expect(resolveManagedImageReferences(registry, ids, scope.pluginId, scope.sessionId)).toEqual([
      'https://example.test/scene.png',
      'https://example.test/character.png',
    ]);
    expect(() =>
      resolveManagedImageReferences(registry, ids, 'other-plugin', scope.sessionId),
    ).toThrow('不属于当前插件会话');
    expect(() =>
      resolveManagedImageReferences(registry, ids, scope.pluginId, 'old-session'),
    ).toThrow('不属于当前插件会话');
    expect(() =>
      resolveManagedImageReferences(registry, [video.mediaId], scope.pluginId, scope.sessionId),
    ).toThrow('有效的图片');
    managedMediaRecord(registry, first.mediaId, scope.pluginId, scope.sessionId).released = true;
    expect(() =>
      resolveManagedImageReferences(registry, [first.mediaId], scope.pluginId, scope.sessionId),
    ).toThrow('有效的图片');
    releaseManagedMediaRegistry(registry);
    expect(() =>
      resolveManagedImageReferences(registry, [second.mediaId], scope.pluginId, scope.sessionId),
    ).toThrow('不存在');
  });

  it('returns only an opaque handle and rejects another plugin or iframe session', () => {
    const registry = new Map();
    const result = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'image',
        url: 'http://127.0.0.1:2895/output/shot-001.png',
        providerId: 'image-main',
        model: 'image-v1',
      },
    );
    expect(result).toMatchObject({
      kind: 'image',
      providerId: 'image-main',
      model: 'image-v1',
    });
    expect(result.mediaId).toMatch(/^media-[0-9a-f-]{36}$/);
    expect(result).not.toHaveProperty('url');
    expect(() =>
      managedMediaRecord(registry, result.mediaId, 'another-plugin', 'session-a'),
    ).toThrow('不属于当前插件会话');
    expect(() =>
      managedMediaRecord(registry, result.mediaId, 'production-studio', 'session-b'),
    ).toThrow('不属于当前插件会话');
  });

  it('registers a user-chosen Canvas image as an opaque, previewable session handle', async () => {
    const registry = new Map();
    const source = new Blob(['canvas-image'], { type: 'image/png' });
    const preview = new Blob(['preview'], { type: 'image/webp' });
    const readSource = vi.fn(async () => source);
    const createPreview = vi.fn(async () => ({ blob: preview, width: 640, height: 360 }));

    const result = await registerManagedCanvasImage(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      { url: 'blob:https://canvas.test/source-image', title: '白小纯设定图' },
      { readSource, createPreview },
    );

    expect(result).toMatchObject({
      kind: 'image',
      providerId: 'qiansi-canvas',
      model: 'canvas-image-selection',
      title: '白小纯设定图',
    });
    expect(result).not.toHaveProperty('url');
    expect(readSource).toHaveBeenCalledWith('blob:https://canvas.test/source-image');
    expect(createPreview).toHaveBeenCalledWith(source);

    const record = managedMediaRecord(registry, result.mediaId, 'production-studio', 'session-a');
    await expect(previewManagedMedia(record)).resolves.toMatchObject({
      mediaId: result.mediaId,
      kind: 'image',
      preview,
    });
    expect(record.url).toBe('blob:https://canvas.test/source-image');
  });

  it('returns the selected Canvas source image instead of its UI thumbnail', async () => {
    const registry = new Map();
    const source = new Blob(['full-resolution-canvas-image'], { type: 'image/png' });
    const preview = new Blob(['small-preview'], { type: 'image/webp' });
    const result = await registerManagedCanvasImage(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      { url: 'blob:https://canvas.test/full-image', title: '原图' },
      {
        readSource: async () => source,
        createPreview: async () => ({ blob: preview, width: 768, height: 432 }),
      },
    );
    const record = managedMediaRecord(registry, result.mediaId, 'production-studio', 'session-a');
    const readSource = vi.fn(async () => source);

    await expect(readManagedCanvasImageCopy(record, readSource)).resolves.toEqual({
      mediaId: result.mediaId,
      kind: 'image',
      image: source,
    });
    expect(readSource).toHaveBeenCalledWith('blob:https://canvas.test/full-image');
    expect(source.size).toBeGreaterThan(preview.size);
  });

  it('does not expose provider-generated media through the Canvas source-copy API', async () => {
    const registry = new Map();
    const generated = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'image',
        url: 'http://127.0.0.1:2895/output/private-source.png',
        providerId: 'image-main',
        model: 'image-v1',
      },
    );
    const record = managedMediaRecord(
      registry,
      generated.mediaId,
      'production-studio',
      'session-a',
    );
    await expect(readManagedCanvasImageCopy(record)).rejects.toThrow('不是用户从画布选择');
  });

  it('rejects an empty selected Canvas image before registering a handle', async () => {
    const registry = new Map();
    await expect(
      registerManagedCanvasImage(
        registry,
        { pluginId: 'production-studio', sessionId: 'session-a' },
        { url: 'blob:https://canvas.test/empty-image' },
        {
          readSource: async () => new Blob([], { type: 'image/png' }),
          createPreview: vi.fn(),
        },
      ),
    ).rejects.toThrow('内容为空');
    expect(registry.size).toBe(0);
  });

  it('injects only a matching registered media kind into a sanitized project graph', () => {
    const registry = new Map();
    const media = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'video',
        url: 'http://127.0.0.1:2895/output/shot-001.mp4',
        providerId: 'video-main',
        model: 'video-v1',
        audioRequested: true,
        audioTrackStatus: 'present',
      },
    );
    expect(media).toMatchObject({ audioRequested: true, audioTrackStatus: 'present' });
    const request = sanitizePluginProjectGraphRequest({
      applicationId: 'approved-delivery-v1',
      name: '已批准交付',
      nodes: [
        {
          clientId: 'video_1',
          kind: 'video',
          data: { mediaId: media.mediaId, shotId: 'shot-001', role: 'video' },
        },
      ],
      edges: [],
    });
    const resolved = resolveManagedProjectGraphMedia(
      request,
      registry,
      'production-studio',
      'session-a',
    );
    expect(resolved.nodes[0]?.data).toEqual({
      shotId: 'shot-001',
      role: 'video',
      videoUrl: 'http://127.0.0.1:2895/output/shot-001.mp4',
      videos: ['http://127.0.0.1:2895/output/shot-001.mp4'],
      output: 'http://127.0.0.1:2895/output/shot-001.mp4',
    });

    const mismatched = sanitizePluginProjectGraphRequest({
      applicationId: 'approved-delivery-v2',
      name: '类型不匹配',
      nodes: [{ clientId: 'image_1', kind: 'image', data: { mediaId: media.mediaId } }],
      edges: [],
    });
    expect(() =>
      resolveManagedProjectGraphMedia(mismatched, registry, 'production-studio', 'session-a'),
    ).toThrow('媒体类型与节点类型不匹配');
  });

  it('returns one revocable current-session image preview without exposing the source URL', async () => {
    const registry = new Map();
    const media = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'image',
        url: 'http://127.0.0.1:2895/output/private-source.png',
        providerId: 'image-main',
        model: 'image-v1',
      },
    );
    const record = managedMediaRecord(registry, media.mediaId, 'production-studio', 'session-a');
    const previewBlob = new Blob(['preview'], { type: 'image/webp' });
    const createPreviewBlob = vi.fn(async () => previewBlob);
    const first = await previewManagedMedia(record, createPreviewBlob);
    const second = await previewManagedMedia(record, createPreviewBlob);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ mediaId: media.mediaId, kind: 'image' });
    expect(first.preview).toBe(previewBlob);
    expect(first).not.toHaveProperty('url');
    expect(JSON.stringify(first)).not.toContain('private-source.png');
    expect(createPreviewBlob).toHaveBeenCalledTimes(1);
    expect(createPreviewBlob).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/output/private-source.png',
    );

    releaseManagedMediaRegistry(registry);
    expect(registry.size).toBe(0);
    await expect(previewManagedMedia(record, createPreviewBlob)).rejects.toThrow('会话释放');
  });

  it('rejects video preview requests instead of returning the source media', async () => {
    const registry = new Map();
    const media = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'video',
        url: 'http://127.0.0.1:2895/output/private-source.mp4',
        providerId: 'video-main',
        model: 'video-v1',
      },
    );
    const record = managedMediaRecord(registry, media.mediaId, 'production-studio', 'session-a');
    await expect(previewManagedMedia(record)).rejects.toThrow('仅支持受管图片预览');
  });

  it('captures a managed video frame into a new opaque image handle without exposing bytes or URLs', async () => {
    const registry = new Map();
    const video = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'video',
        url: 'http://127.0.0.1:2895/output/private-source.mp4',
        providerId: 'video-main',
        model: 'video-v1',
      },
    );
    const frameBlob = new Blob(['jpeg-frame'], { type: 'image/jpeg' });
    const captureFrame = vi.fn(async () => ({ blob: frameBlob, width: 1280, height: 720 }));
    const result = await captureManagedVideoFrame(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      { mediaId: video.mediaId, position: 'last' },
      captureFrame,
    );

    expect(captureFrame).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/output/private-source.mp4',
      'last',
    );
    expect(result).toMatchObject({ kind: 'image', position: 'last', width: 1280, height: 720 });
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('blob');
    expect(result).not.toHaveProperty('bytes');
    const record = managedMediaRecord(registry, result.mediaId, 'production-studio', 'session-a');
    expect(record.kind).toBe('image');
    expect(record.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(() => managedMediaRecord(registry, result.mediaId, 'other-plugin', 'session-a')).toThrow(
      '不属于当前插件会话',
    );
  });

  it('rejects non-video frame sources and invalid captured image payloads', async () => {
    const registry = new Map();
    const image = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'image',
        url: 'http://127.0.0.1:2895/output/private-source.png',
        providerId: 'image-main',
        model: 'image-v1',
      },
    );
    await expect(
      captureManagedVideoFrame(
        registry,
        { pluginId: 'production-studio', sessionId: 'session-a' },
        { mediaId: image.mediaId, position: 'last' },
        vi.fn(),
      ),
    ).rejects.toThrow('来源必须是');

    const video = registerManagedMedia(
      registry,
      { pluginId: 'production-studio', sessionId: 'session-a' },
      {
        kind: 'video',
        url: 'http://127.0.0.1:2895/output/private-source.mp4',
        providerId: 'video-main',
        model: 'video-v1',
      },
    );
    await expect(
      captureManagedVideoFrame(
        registry,
        { pluginId: 'production-studio', sessionId: 'session-a' },
        { mediaId: video.mediaId, position: 'last' },
        async () => ({
          blob: new Blob(['svg'], { type: 'image/svg+xml' }),
          width: 1280,
          height: 720,
        }),
      ),
    ).rejects.toThrow('视频帧无效');
  });

  it('bounds and type-checks the host-read image before preview decoding', async () => {
    const oversized = vi.fn(
      async () =>
        new Response(new Blob(['x'], { type: 'image/png' }), {
          headers: { 'content-length': String(32 * 1024 * 1024 + 1) },
        }),
    );
    await expect(
      readManagedImagePreviewSource('https://example.test/large.png', oversized),
    ).rejects.toThrow('超过 32 MiB');
    expect(oversized).toHaveBeenCalledWith('https://example.test/large.png', {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });

    const svg = vi.fn(
      async () =>
        new Response(new Blob(['<svg/>'], { type: 'image/svg+xml' }), {
          headers: { 'content-type': 'image/svg+xml' },
        }),
    );
    await expect(
      readManagedImagePreviewSource('https://example.test/vector.svg', svg),
    ).rejects.toThrow('格式不受支持');

    const pngBlob = new Blob(['png'], { type: 'image/png' });
    const png = vi.fn(
      async () => new Response(pngBlob, { headers: { 'content-type': 'image/png' } }),
    );
    await expect(
      readManagedImagePreviewSource('https://example.test/safe.png', png),
    ).resolves.toMatchObject({ size: pngBlob.size, type: 'image/png' });
  });
});
