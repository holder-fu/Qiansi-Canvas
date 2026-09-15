import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chat,
  type GenerationRecoveryRequiredError,
  generateAudio,
  generate3d,
  generateImage,
  generateNodeContent,
  generateVideo,
  recoverGenerationResultByRequestId,
  lookupGenerationRequestByRequestId,
  recoverRecentGeneratedImage,
  type GenProvider,
} from './ai';

const provider: GenProvider = {
  protocol: 'openai',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-only',
  model: 'test-model',
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AI request parameters', () => {
  it.each([
    {
      response: { ok: false, status: 404, json: async () => ({}) } as Response,
      expected: { status: 'missing' },
    },
    {
      response: {
        ok: true,
        status: 200,
        json: async () => ({ request: { kind: 'video', status: 'pending' } }),
      } as Response,
      expected: { status: 'pending' },
    },
    {
      response: {
        ok: true,
        status: 200,
        json: async () => ({
          request: { kind: 'video', status: 'failed', error: 'provider rejected request' },
        }),
      } as Response,
      expected: { status: 'failed', error: 'provider rejected request' },
    },
  ])('reports the bridge registry status without submitting a new request', async (fixture) => {
    const fetchMock = vi.fn().mockResolvedValue(fixture.response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupGenerationRequestByRequestId('gen-status-video', 'video')).resolves.toEqual(
      fixture.expected,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ cache: 'no-store' });
  });

  it('forwards a cancellation signal to a generation recovery lookup', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request: { kind: 'video', status: 'pending' } }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      lookupGenerationRequestByRequestId('gen-status-video', 'video', {
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: 'pending' });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      cache: 'no-store',
      signal: controller.signal,
    });
  });

  it('keeps bounded ComfyUI progress details on a pending recovery lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          request: {
            kind: 'video',
            status: 'pending',
            progress: 46.6,
            phase: 'progress',
            nodeId: '17',
            queueRemaining: 1,
          },
        }),
      } as Response),
    );

    await expect(lookupGenerationRequestByRequestId('gen-status-video', 'video')).resolves.toEqual({
      status: 'pending',
      progress: 47,
      phase: 'progress',
      nodeId: '17',
      queueRemaining: 1,
    });
  });

  it('recovers the image that matches this node prompt instead of a newer unrelated result', async () => {
    const prompt = '基于参考图生成可用于 3D 环视的全景场景';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            url: '/asset-library/files/newest-unrelated',
            mime: 'image/png',
            description: '这是另一个图片节点的生成结果',
            createdAt: Date.now(),
          },
          {
            url: '/asset-library/files/older-match',
            mime: 'image/png',
            description: `用户创作要求：${prompt}`,
            createdAt: Date.now() - 1000,
          },
        ],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(recoverRecentGeneratedImage(prompt)).resolves.toBe(
      'http://127.0.0.1:2895/asset-library/files/older-match',
    );
  });

  it('recovers a completed local image when the generation response connection drops', async () => {
    const requestId = 'gen-1786557489584-abc123';
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'not found' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              url: '/asset-library/files/asset_recovered',
              tags: ['Codex CLI', `gen:${requestId}`],
            },
          ],
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateNodeContent({
      type: 'image',
      prompt: '生成全景图',
      requestId,
      provider,
    });

    expect(result.images).toEqual(['http://127.0.0.1:2895/asset-library/files/asset_recovered']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `http://127.0.0.1:2895/api/generation-requests/${requestId}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://127.0.0.1:2895/asset-library');
  });

  it('treats a browser lifecycle abort as a recoverable image response interruption', async () => {
    const requestId = 'gen-background-tab-abort';
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('The request was aborted', 'AbortError'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          request: {
            id: requestId,
            kind: 'image',
            status: 'complete',
            result: { images: ['/output/background-tab.webp'] },
          },
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateImage({ provider, prompt: '后台标签页图片生成', requestId }),
    ).resolves.toEqual({
      images: ['http://127.0.0.1:2895/output/background-tab.webp'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers when a successful bridge response body is interrupted before JSON completes', async () => {
    const requestId = 'gen-background-tab-body';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new TypeError('response body terminated');
        },
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          request: {
            id: requestId,
            kind: 'image',
            status: 'complete',
            result: { images: ['/output/body-recovered.png'] },
          },
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateImage({ provider, prompt: '恢复不完整响应', requestId })).resolves.toEqual(
      {
        images: ['http://127.0.0.1:2895/output/body-recovered.png'],
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      kind: 'image' as const,
      requestId: 'gen-recover-image-result',
      invoke: () =>
        generateImage({
          provider,
          prompt: '恢复图片',
          requestId: 'gen-recover-image-result',
        }),
      result: { images: ['/output/recovered.webp'], url: '/output/recovered.webp' },
      expected: {
        images: ['http://127.0.0.1:2895/output/recovered.webp'],
        url: 'http://127.0.0.1:2895/output/recovered.webp',
      },
    },
    {
      kind: 'video' as const,
      requestId: 'gen-recover-video-result',
      invoke: () =>
        generateVideo({
          provider,
          prompt: '恢复视频',
          requestId: 'gen-recover-video-result',
        }),
      result: { videos: ['/output/recovered.mp4'], url: '/output/recovered.mp4' },
      expected: {
        videos: ['http://127.0.0.1:2895/output/recovered.mp4'],
        url: 'http://127.0.0.1:2895/output/recovered.mp4',
        audioTrackStatus: 'unverified',
      },
    },
    {
      kind: 'audio' as const,
      requestId: 'gen-recover-audio-result',
      invoke: () =>
        generateAudio({
          provider,
          prompt: '恢复音频',
          requestId: 'gen-recover-audio-result',
        }),
      result: { audios: ['/output/recovered.mp3'], url: '/output/recovered.mp3' },
      expected: {
        audios: ['http://127.0.0.1:2895/output/recovered.mp3'],
        url: 'http://127.0.0.1:2895/output/recovered.mp3',
      },
    },
  ])('recovers a completed $kind request after the POST response is lost', async (fixture) => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          request: {
            id: fixture.requestId,
            kind: fixture.kind,
            status: 'complete',
            completedAt: Date.now(),
            result: fixture.result,
          },
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fixture.invoke()).resolves.toEqual(fixture.expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `http://127.0.0.1:2895/api/generation-requests/${fixture.requestId}`,
    );
  });

  it('recovers completed text by request id after every POST response attempt is interrupted', async () => {
    vi.useFakeTimers();
    const requestId = 'gen-recover-text-result';
    const text = '恢复后的文本提示词';
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          request: {
            id: requestId,
            kind: 'text',
            status: 'complete',
            completedAt: Date.now(),
            result: { text },
          },
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const recovery = chat({ provider, prompt: '生成提示词', requestId });
    const assertion = expect(recovery).resolves.toEqual({ text });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `http://127.0.0.1:2895/api/generation-requests/${requestId}`,
    );
  });

  it('surfaces a recovered provider failure instead of silently resubmitting', async () => {
    const requestId = 'gen-recover-provider-error';
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          request: {
            id: requestId,
            kind: 'video',
            status: 'failed',
            completedAt: Date.now(),
            error: 'provider quota exhausted',
          },
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateVideo({ provider, prompt: '测试', requestId })).rejects.toThrow(
      'provider quota exhausted',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a discriminated missing recovery error that keeps the original request ID', async () => {
    const requestId = 'gen-missing-recovery-result';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'not found' } }),
      } as Response),
    );

    await expect(recoverGenerationResultByRequestId(requestId, 'video')).rejects.toMatchObject({
      name: 'GenerationRecoveryRequiredError',
      generationRequestInterrupted: true,
      requestId,
      kind: 'video',
      status: 'missing',
    } satisfies Partial<GenerationRecoveryRequiredError>);
  });

  it('keeps a pending paid request recoverable after bounded polling', async () => {
    vi.useFakeTimers();
    const requestId = 'gen-pending-recovery-result';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          request: { id: requestId, kind: 'audio', status: 'pending', completedAt: 0 },
        }),
      } as Response),
    );

    const recovery = recoverGenerationResultByRequestId(requestId, 'audio');
    const assertion = expect(recovery).rejects.toMatchObject({
      generationRequestInterrupted: true,
      requestId,
      kind: 'audio',
      status: 'pending',
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('keeps an unreachable paid request recoverable instead of allowing a new ID', async () => {
    vi.useFakeTimers();
    const requestId = 'gen-unreachable-recovery';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const recovery = recoverGenerationResultByRequestId(requestId, 'image');
    const assertion = expect(recovery).rejects.toMatchObject({
      generationRequestInterrupted: true,
      requestId,
      kind: 'image',
      status: 'unreachable',
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('posts text mode, length and temperature while preserving every reference image', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '已生成' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const references = Array.from(
      { length: 7 },
      (_, index) => `data:image/png;base64,reference-${index}`,
    );

    await generateNodeContent({
      type: 'text',
      prompt: '把这些画面拆成分镜',
      mode: '拆分镜',
      maxLength: 1000,
      temperature: 0.2,
      referenceImages: references,
      provider,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      mode: string;
      maxLength: number;
      temperature: number;
      messages: Array<{
        content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
      }>;
    };
    expect(url).toBe('http://127.0.0.1:2895/api/chat');
    expect(body).toMatchObject({ mode: '拆分镜', maxLength: 1000, temperature: 0.2 });
    expect(body.messages[0]?.content[0]?.text).toContain('【输出类型】本节点只生成文本');
    expect(body.messages[0]?.content[0]?.text).toContain('不得调用媒体生成工具');
    expect(body.messages[0]?.content[0]?.text).toContain('不得声称已经生成媒体');
    expect(body.messages[0]?.content[0]?.text).toContain('【任务模式】拆分镜');
    expect(body.messages[0]?.content[0]?.text).toContain('【输出长度】最多 1000 字');
    expect(body.messages[0]?.content.slice(1).map((part) => part.image_url?.url)).toEqual(
      references,
    );
  });

  it('enforces the text-only boundary when a text-node caller omits its mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '高清重绘提示词' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'text',
      prompt: '生成一张高清人物图',
      provider,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { mode?: string; prompt?: string };
    expect(body.mode).toBe('自由指令');
    expect(body.prompt).toContain('【输出类型】本节点只生成文本');
    expect(body.prompt).toContain('不得调用媒体生成工具、创建或修改文件');
    expect(body.prompt).toContain('【待处理内容】\n生成一张高清人物图');
  });

  it('posts a 30-second video duration with mode, fps and every reference image', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/video.mp4'], url: '/generated/video.mp4' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const references = ['image-a', 'image-b', 'image-c'];
    const posterFallbacks = ['http://127.0.0.1:2895/media-preview/files/preview_effectposter.webp'];
    const referenceAudios = ['audio-a.mp3', 'audio-b.wav'];
    const requestId = 'gen-video-unique-request';

    const result = await generateNodeContent({
      type: 'video',
      prompt: '镜头缓慢推进',
      requestId,
      mode: '首尾帧',
      fps: 60,
      duration: 30,
      referenceImages: references,
      videoPosterFallbackImages: posterFallbacks,
      referenceAudios,
      provider,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe('http://127.0.0.1:2895/api/generate-video');
    expect(body).toMatchObject({
      requestId,
      mode: '首尾帧',
      fps: 60,
      duration: 30,
      referenceImages: [...posterFallbacks, ...references],
      referenceAudios,
    });
    expect(result).toEqual({
      videos: ['http://127.0.0.1:2895/generated/video.mp4'],
      videoUrl: 'http://127.0.0.1:2895/generated/video.mp4',
    });
  });

  it('keeps duplicate 3D-director identity slots in the real video request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/director.mp4'] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const frame = '/asset-library/files/director_frame';
    const sharedIdentity = '/asset-library/files/shared_identity';

    await generateVideo({
      provider,
      prompt: '人物 A 与人物 B 使用同一身份图，但保持各自站位。',
      referenceImages: [frame, sharedIdentity, sharedIdentity],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { referenceImages?: string[] };
    expect(body.referenceImages).toEqual([frame, sharedIdentity, sharedIdentity]);
  });

  it.each([
    [
      '图片生成',
      () =>
        generateImage({
          provider,
          prompt: '保持人物身份',
          referenceImages: ['/asset-library/files/identity?preview=image&w=768'],
        }),
    ],
    [
      '文本视觉分析',
      () =>
        chat({
          provider,
          prompt: '分析这张图',
          referenceImages: ['/media-preview/files/preview_identity.webp'],
        }),
    ],
    [
      '视频核心参考图',
      () =>
        generateVideo({
          provider,
          prompt: '保持人物一致',
          referenceImages: ['/media-preview/files/preview_identity.webp'],
        }),
    ],
  ])('blocks a renderer thumbnail before %s reaches the bridge', async (_, invoke) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(invoke()).rejects.toThrow('当前只有缩略图');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'blob:http://127.0.0.1/session-reference',
    'qiansi-canvas-media://indexeddb/canvas-media%3Asha256%3Aidentity',
  ])('blocks a browser-only core image before the final AI request: %s', async (reference) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateImage({ provider, prompt: '保持人物身份', referenceImages: [reference] }),
    ).rejects.toThrow('本机桥无法从 AI 请求中读取原图');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'blob:http://127.0.0.1/effect-poster',
    'qiansi-canvas-media://indexeddb-preview/canvas-media%3Asha256%3Aposter',
  ])('blocks an unresolved video poster fallback before bridge submission: %s', async (poster) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateVideo({ provider, prompt: '镜头推进', videoPosterFallbackImages: [poster] }),
    ).rejects.toThrow('视频海报回退图');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['目标人物参考图', { characterReferenceImage: '/media-preview/files/preview_character.webp' }],
    ['局部修复蒙版', { maskImage: '/asset-library/files/mask?preview=image&w=768' }],
  ])('does not silently replace an unavailable %s with its preview', async (label, fields) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateVideo({ provider, prompt: '测试视频', ...fields })).rejects.toThrow(label);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the audio request id used for bridge deduplication', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audios: ['/generated/audio.mp3'] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'audio',
      prompt: '雨夜环境氛围',
      requestId: 'gen-audio-unique-request',
      provider,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      requestId: 'gen-audio-unique-request',
      prompt: '雨夜环境氛围',
    });
  });

  it('posts 3D generation inputs and resolves bridge output URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models3d: ['/output/object.glb'], url: '/output/object.glb' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateNodeContent({
      type: 'model-3d',
      prompt: '单个陶瓷茶壶',
      requestId: 'gen-model-3d-request',
      referenceImages: ['https://example.com/teapot.png'],
      provider,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/api/generate-3d',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      requestId: 'gen-model-3d-request',
      prompt: '单个陶瓷茶壶',
      referenceImages: ['https://example.com/teapot.png'],
    });
    expect(result).toEqual({
      models3d: ['http://127.0.0.1:2895/output/object.glb'],
      model3dUrl: 'http://127.0.0.1:2895/output/object.glb',
    });
  });

  it('posts the fused video character-replacement inputs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/replaced.mp4'], url: '/generated/replaced.mp4' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'video',
      prompt: '保持原动作，只替换人物',
      mode: '视频换人物',
      sourceVideo: 'source.mp4',
      characterReferenceImage: 'character.png',
      maskImage: 'mask.png',
      provider,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      mode: '视频换人物',
      sourceVideo: 'source.mp4',
      characterReferenceImage: 'character.png',
      maskImage: 'mask.png',
    });
  });

  it('posts the source video and every selected interval for fragment remake', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/remade.mp4'], url: '/generated/remade.mp4' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'video',
      prompt: '把选中镜头改成雨夜，未选部分保持原样',
      sourceVideo: 'source.mp4',
      sourceVideoDuration: 10,
      remakeSegments: [
        { start: 0, end: 2 },
        { start: 8, end: 10 },
      ],
      provider,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      sourceVideo: 'source.mp4',
      sourceVideoDuration: 10,
      remakeSegments: [
        { start: 0, end: 2 },
        { start: 8, end: 10 },
      ],
    });
  });

  it('posts the source video and explicit continuation operation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/continued.mp4'], url: '/generated/continued.mp4' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'video',
      prompt: '承接最后一帧，人物继续向前行走',
      sourceVideo: 'source.mp4',
      continueVideo: true,
      provider,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      sourceVideo: 'source.mp4',
      continueVideo: true,
      prompt: '承接最后一帧，人物继续向前行走',
    });
  });

  it('posts an explicit subtitle-removal edit instead of ordinary text-to-video', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/clean.mp4'], url: '/generated/clean.mp4' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'video',
      prompt: '移除底部烧录字幕并逐帧修复背景',
      sourceVideo: 'source.mp4',
      videoEditOperation: 'remove-subtitles',
      subtitleRegion: 'bottom',
      provider,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      sourceVideo: 'source.mp4',
      videoEditOperation: 'remove-subtitles',
      subtitleRegion: 'bottom',
    });
  });

  it('posts an explicit source-video visual edit operation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/edited.mp4'], url: '/generated/edited.mp4' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'video',
      prompt: '移除画面右侧路人',
      sourceVideo: 'source.mp4',
      videoEditOperation: 'visual-edit',
      provider,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      sourceVideo: 'source.mp4',
      videoEditOperation: 'visual-edit',
      prompt: '移除画面右侧路人',
    });
  });

  it('posts the complete provider-tracked keyframe mask repair contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ['/generated/repaired.mp4'], url: '/generated/repaired.mp4' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generateNodeContent({
      type: 'video',
      prompt: '只修复人物右手的形变',
      sourceVideo: 'source.mp4',
      videoEditOperation: 'masked-repair',
      maskImage: 'data:image/png;base64,binary-mask',
      maskRangeStart: 1.25,
      maskRangeEnd: 3.75,
      keyframeTime: 2.5,
      tracking: 'provider',
      provider: {
        ...provider,
        videoOperations: ['masked-repair'],
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      provider: { videoOperations: ['masked-repair'] },
      sourceVideo: 'source.mp4',
      videoEditOperation: 'masked-repair',
      maskImage: 'data:image/png;base64,binary-mask',
      maskRangeStart: 1.25,
      maskRangeEnd: 3.75,
      keyframeTime: 2.5,
      tracking: 'provider',
    });
  });

  it('advances estimated progress while a provider request is still pending', async () => {
    vi.useFakeTimers();
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const onProgress = vi.fn();

    const request = generateVideo({ provider, prompt: '生成测试视频', onProgress });
    expect(onProgress.mock.calls.flat()).toEqual([8]);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(onProgress.mock.calls.flat()).toEqual([8, 9, 10]);

    resolveFetch?.({
      ok: true,
      json: async () => ({ videos: ['/generated/video.mp4'] }),
    } as Response);
    await expect(request).resolves.toEqual({
      videos: ['http://127.0.0.1:2895/generated/video.mp4'],
      url: undefined,
      audioTrackStatus: 'unverified',
    });
    expect(onProgress.mock.calls.flat().at(-1)).toBe(100);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves bridge-relative image results without rewriting inline media', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        images: ['/generated/image.png', 'data:image/png;base64,inline'],
        url: '/generated/image.png',
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateImage({ provider, prompt: '测试图片' })).resolves.toEqual({
      images: ['http://127.0.0.1:2895/generated/image.png', 'data:image/png;base64,inline'],
      url: 'http://127.0.0.1:2895/generated/image.png',
    });
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      requestId?: string;
    };
    expect(request.requestId).toMatch(/^gen-[A-Za-z0-9-]{8,}$/);
  });

  it('keeps all references when chat messages are supplied explicitly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '已分析' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const references = Array.from({ length: 6 }, (_, index) => `reference-${index}`);

    await chat({
      provider,
      messages: [{ role: 'user', content: '先分析人物关系。' }],
      prompt: '再结合这些画面。',
      referenceImages: references,
      mode: '总结',
      maxLength: 500,
      temperature: 0.5,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{
        role: string;
        content: string | Array<{ type: string; image_url?: { url: string } }>;
      }>;
    };
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[1]).toEqual({ role: 'user', content: '先分析人物关系。' });
    const referenceMessage = body.messages.at(-1);
    expect(referenceMessage?.role).toBe('user');
    expect(Array.isArray(referenceMessage?.content)).toBe(true);
    const referenceContent = Array.isArray(referenceMessage?.content)
      ? referenceMessage.content
      : [];
    expect(referenceContent.slice(1)).toEqual(
      references.map((url) => ({ type: 'image_url', image_url: { url, detail: 'auto' } })),
    );
  });

  it('reports an empty text response as a model failure instead of a successful blank result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: '   ' }),
      } as Response),
    );

    await expect(chat({ provider, prompt: '生成提示词' })).rejects.toThrow(
      '文本模型没有返回有效内容',
    );
  });

  it.each([
    ['视频', generateVideo, '/api/generate-video'],
    ['音频', generateAudio, '/api/generate-audio'],
    ['3D 模型', generate3d, '/api/generate-3d'],
  ] as const)('does not report an asynchronous %s task as completed', async (_, generate, path) => {
    const onProgress = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: 'task-123', async: true }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(generate({ provider, prompt: '测试任务', onProgress })).rejects.toThrow(
      '未配置任务查询接口',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:2895${path}`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onProgress.mock.calls.flat()).toEqual([8]);
  });
});
