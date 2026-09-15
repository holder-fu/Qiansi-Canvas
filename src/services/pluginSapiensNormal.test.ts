import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPluginSapiensNormalFrame } from './pluginSapiensNormal';

afterEach(() => vi.unstubAllGlobals());

describe('plugin Sapiens2 Normal bridge', () => {
  it('sends the selected fixed model and validates the returned WebP frame', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body || '{}'));
      expect(request).toMatchObject({
        pluginId: 'qiansi-motion-capture',
        modelId: 'sapiens2-normal-0.4b',
        mimeType: 'image/jpeg',
        timestampMs: 250,
        width: 320,
        height: 180,
      });
      expect(atob(request.base64)).toBe('input-frame');
      return new Response(
        JSON.stringify({
          mimeType: 'image/webp',
          timestampMs: 250,
          width: 320,
          height: 180,
          inferenceMs: 14,
          base64: btoa('output-frame'),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await renderPluginSapiensNormalFrame(
      'qiansi-motion-capture',
      {
        modelId: 'sapiens2-normal-0.4b',
        bytes: new TextEncoder().encode('input-frame').buffer,
        mimeType: 'image/jpeg',
        timestampMs: 250,
        width: 320,
        height: 180,
        backend: 'wasm',
        inputSize: 518,
        wasmThreads: 0,
        gpuPowerPreference: 'high-performance',
        temporalSmoothing: 0,
        invert: false,
        blackPoint: 0.04,
        whitePoint: 0.96,
        gamma: 0.9,
      },
      'http://127.0.0.1:2895',
    );
    expect(new TextDecoder().decode(result.bytes)).toBe('output-frame');
    expect(result).toMatchObject({ mimeType: 'image/webp', inferenceMs: 14 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('surfaces the Worker error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'CUDA 不可用。' } }), { status: 503 }),
      ),
    );
    await expect(
      renderPluginSapiensNormalFrame(
        'qiansi-motion-capture',
        {
          modelId: 'sapiens2-normal-0.4b',
          bytes: new Uint8Array([1]).buffer,
          mimeType: 'image/jpeg',
          timestampMs: 0,
          width: 16,
          height: 16,
          backend: 'wasm',
          inputSize: 518,
          wasmThreads: 0,
          gpuPowerPreference: 'high-performance',
          temporalSmoothing: 0,
          invert: false,
          blackPoint: 0.04,
          whitePoint: 0.96,
          gamma: 0.9,
        },
        'http://127.0.0.1:2895',
      ),
    ).rejects.toThrow('CUDA 不可用');
  });

  it('explains when the Canvas bridge disconnects during inference', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(
      renderPluginSapiensNormalFrame(
        'qiansi-motion-capture',
        {
          modelId: 'sapiens2-normal-0.4b',
          bytes: new Uint8Array([1]).buffer,
          mimeType: 'image/jpeg',
          timestampMs: 0,
          width: 16,
          height: 16,
          backend: 'wasm',
          inputSize: 518,
          wasmThreads: 0,
          gpuPowerPreference: 'high-performance',
          temporalSmoothing: 0,
          invert: false,
          blackPoint: 0.04,
          whitePoint: 0.96,
          gamma: 0.9,
        },
        'http://127.0.0.1:2895',
      ),
    ).rejects.toThrow('画布后台连接已中断');
  });
});
