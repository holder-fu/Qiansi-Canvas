import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_TYPE_DESCRIPTIONS,
  IMAGE_TYPE_GROUPS,
  buildImagePrompt,
  isConfiguredImageType,
  isKnownImageType,
  resolveImageSize,
  stripLegacyImageTypePrefix,
  toggleImageTypeSelection,
} from './imageGeneration';
import { buildTextTaskPrompt } from './textGeneration';

describe('image generation parameters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('provides an executable prompt for every image type option', () => {
    const options = IMAGE_TYPE_GROUPS.flatMap((column) =>
      column.groups.flatMap((group) => group.options),
    );

    expect(options).toHaveLength(15);
    for (const option of options) {
      expect(isKnownImageType(option)).toBe(true);
      expect(buildImagePrompt('', option).length).toBeGreaterThan(40);
      expect((IMAGE_TYPE_DESCRIPTIONS[option] ?? '').length).toBeGreaterThan(12);
    }
    expect(isKnownImageType('__proto__')).toBe(false);
    expect(buildImagePrompt('', '9宫人物表情')).toContain('自然/平静表情');
    expect(buildImagePrompt('', '9宫格人物表情挤眼弄眉')).toContain('单眼眯笑露齿大笑');
  });

  it('combines the preset instruction and user prompt exactly once', () => {
    const prompt = buildImagePrompt('古代剑客站在雪夜城门前', '角色三视图');

    expect(prompt).toContain('角色全身正面、侧面、背面三视图');
    expect(prompt).toContain('用户创作要求：古代剑客站在雪夜城门前');
    expect(prompt.match(/用户创作要求：/g)).toHaveLength(1);
  });

  it('uses an edited or custom preset prompt as the executable instruction', () => {
    const prompt = buildImagePrompt('保留红色披风', '自定义分镜', '生成六格连续动作分镜。');

    expect(prompt).toBe('生成六格连续动作分镜。\n\n用户创作要求：保留红色披风');
    expect(isConfiguredImageType('自定义分镜', '生成六格连续动作分镜。')).toBe(true);
    expect(isConfiguredImageType('自定义分镜', '')).toBe(false);
  });

  it('migrates the legacy display prefix without deleting user content', () => {
    expect(stripLegacyImageTypePrefix('生成类型：角色三视图\n保留红色披风', '角色三视图')).toBe(
      '保留红色披风',
    );
    expect(stripLegacyImageTypePrefix('保留红色披风', '角色三视图')).toBe('保留红色披风');
  });

  it('cancels an image type when the selected option is clicked again', () => {
    expect(toggleImageTypeSelection(undefined, '角色三视图')).toBe('角色三视图');
    expect(toggleImageTypeSelection('角色三视图', '角色三视图')).toBeUndefined();
    expect(toggleImageTypeSelection('角色三视图', '场景设定图')).toBe('场景设定图');
  });

  it('maps ratio and quality to an actual model size', () => {
    expect(resolveImageSize('16:9', 'standard')).toBe('1024x576');
    expect(resolveImageSize('9:16', '2K')).toBe('1152x2048');
    expect(resolveImageSize('1:1', '4K')).toBe('4096x4096');
    expect(resolveImageSize('invalid', '2K')).toBe('1024x1024');
  });

  it('posts image type, ratio, quality, count, computed size and expanded prompt', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['/generated/test.png'], url: '/generated/test.png' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { generateNodeContent } = await import('../services/ai');

    await generateNodeContent({
      type: 'image',
      prompt: '白发剑客，黑色披风',
      imageType: '角色三视图',
      aspectRatio: '16:9',
      quality: '2K',
      count: 2,
      provider: {
        protocol: 'openai',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-only',
        model: 'image-model',
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe('http://127.0.0.1:2895/api/generate-image');
    expect(body).toMatchObject({
      imageType: '角色三视图',
      aspectRatio: '16:9',
      quality: '2K',
      count: 2,
      size: '2048x1152',
    });
    expect(body.prompt).toContain('角色全身正面、侧面、背面三视图');
    expect(body.prompt).toContain('用户创作要求：白发剑客，黑色披风');
  });

  it('sends an edited preset prompt instead of the original built-in template', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['/generated/custom.png'], url: '/generated/custom.png' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { generateNodeContent } = await import('../services/ai');

    await generateNodeContent({
      type: 'image',
      prompt: '保留红色披风',
      imageType: '自定义动作分镜',
      imageTypePrompt: '生成六格连续动作分镜，保持角色与场景一致。',
      provider: {
        protocol: 'openai',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-only',
        model: 'image-model',
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.prompt).toBe(
      '生成六格连续动作分镜，保持角色与场景一致。\n\n用户创作要求：保留红色披风',
    );
  });

  it('submits the selected CLI provider and model for text generation', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '已生成的脚本内容' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { generateNodeContent } = await import('../services/ai');

    await generateNodeContent({
      type: 'llm',
      prompt: '写一个三幕式动画短片',
      requestId: 'gen-text-cli-contract',
      provider: {
        protocol: 'codex',
        baseUrl: 'http://127.0.0.1:2895/v1',
        apiKey: '',
        model: 'codex:gpt-5.6',
        reasoningEffort: 'high',
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe('http://127.0.0.1:2895/api/chat');
    expect(body).toMatchObject({
      requestId: 'gen-text-cli-contract',
      provider: {
        protocol: 'codex',
        baseUrl: 'http://127.0.0.1:2895/v1',
        model: 'codex:gpt-5.6',
        reasoningEffort: 'high',
      },
      prompt: buildTextTaskPrompt('写一个三幕式动画短片', '自由指令'),
      reasoningEffort: 'high',
    });
  });

  it('reconnects a dropped text response with the same request ID', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '后台任务完成后返回的文本' }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { generateNodeContent } = await import('../services/ai');

    const result = await generateNodeContent({
      type: 'text',
      prompt: '保持任务继续运行',
      requestId: 'gen-text-reconnect',
      provider: {
        protocol: 'codex',
        baseUrl: 'http://127.0.0.1:2895/v1',
        apiKey: '',
        model: 'codex:gpt-5.6',
      },
    });

    expect(result.text).toBe('后台任务完成后返回的文本');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    );
    expect(requestBodies).toEqual([
      expect.objectContaining({ requestId: 'gen-text-reconnect' }),
      expect.objectContaining({ requestId: 'gen-text-reconnect' }),
    ]);
  });

  it('submits connected reference images as multimodal text-generation messages', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '电影感夜景，霓虹灯光' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { generateNodeContent } = await import('../services/ai');

    await generateNodeContent({
      type: 'text',
      prompt: '反推这张图片的提示词',
      referenceImages: ['data:image/png;base64,reference-image'],
      provider: {
        protocol: 'openai',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-only',
        model: 'vision-model',
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      prompt?: string;
      messages?: unknown;
    };
    expect(url).toBe('http://127.0.0.1:2895/api/chat');
    expect(body.prompt).toBeUndefined();
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildTextTaskPrompt('反推这张图片的提示词', '自由指令'),
          },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,reference-image', detail: 'auto' },
          },
        ],
      },
    ]);
  });

  it('posts audio generation parameters to the local bridge', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audios: ['/output/music.mp3'], url: '/output/music.mp3' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { generateNodeContent } = await import('../services/ai');

    const result = await generateNodeContent({
      type: 'audio',
      prompt: '温暖的钢琴与弦乐，缓慢抒情',
      duration: 45,
      count: 1,
      mode: '描述生音乐',
      provider: {
        protocol: 'openai',
        baseUrl: 'https://music.example.invalid/v1',
        endpoint: '/audio/generations',
        apiKey: 'test-only',
        model: 'music-v8',
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe('http://127.0.0.1:2895/api/generate-audio');
    expect(body).toMatchObject({
      prompt: '温暖的钢琴与弦乐，缓慢抒情',
      duration: 45,
      count: 1,
      mode: '描述生音乐',
      provider: { model: 'music-v8', endpoint: '/audio/generations' },
    });
    expect(result.audioUrl).toBe('http://127.0.0.1:2895/output/music.mp3');
  });
});
