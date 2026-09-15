import { describe, expect, it } from 'vitest';
import {
  configureDepthProcessorInputSize,
  configureDepthRuntimeEnvironment,
  createDepthPipelineForBackend,
  renderWhiteDepthPixels,
  smoothDepthValues,
  versionDepthRuntimeAssetUrl,
} from './pluginDepthEffect';

describe('plugin depth white-model effect', () => {
  it('versions ONNX runtime assets past the pre-fix immutable MIME response', () => {
    expect(
      versionDepthRuntimeAssetUrl(
        'http://127.0.0.1:2895/assets/ort-wasm-simd-threaded.jsep-B0TxsgQ-.mjs',
      ),
    ).toBe(
      'http://127.0.0.1:2895/assets/ort-wasm-simd-threaded.jsep-B0TxsgQ-.mjs?qiansi-depth-runtime=mime-v2',
    );
    expect(
      versionDepthRuntimeAssetUrl('http://127.0.0.1:2895/assets/runtime.wasm?existing=1#loader'),
    ).toBe(
      'http://127.0.0.1:2895/assets/runtime.wasm?existing=1&qiansi-depth-runtime=mime-v2#loader',
    );
  });

  it('uses the explicitly selected inference backend without silently switching devices', async () => {
    const devices: unknown[] = [];
    await createDepthPipelineForBackend(
      (async (_task: 'depth-estimation', _model: string, options: Record<string, unknown>) => {
        devices.push(options.device);
        return (() => Promise.resolve([])) as never;
      }) as never,
      'webgpu',
    );

    expect(devices).toEqual(['webgpu']);
  });

  it('configures only the selected runtime backend before creating its session', () => {
    const environment = {
      wasm: { numThreads: 0 },
      webgpu: { powerPreference: 'high-performance' as const },
    };
    configureDepthRuntimeEnvironment(environment, {
      backend: 'wasm',
      wasmThreads: 4,
      gpuPowerPreference: 'low-power',
    });
    expect(environment).toEqual({
      wasm: { numThreads: 4 },
      webgpu: { powerPreference: 'high-performance' },
    });
    configureDepthRuntimeEnvironment(environment, {
      backend: 'webgpu',
      wasmThreads: 1,
      gpuPowerPreference: 'low-power',
    });
    expect(environment.webgpu.powerPreference).toBe('low-power');
  });

  it('applies the selected official input size to the depth image processor', () => {
    const estimator = { processor: { image_processor: { size: { width: 518, height: 518 } } } };
    configureDepthProcessorInputSize(estimator as never, 686);
    expect(estimator.processor.image_processor.size).toEqual({ width: 686, height: 686 });
  });

  it('smooths successive normalized depth frames without changing the first frame', () => {
    expect(Array.from(smoothDepthValues([10, 30], null, 0.5))).toEqual([10, 30]);
    expect(Array.from(smoothDepthValues([30, 10], [10, 30], 0.5))).toEqual([20, 20]);
    expect(Array.from(smoothDepthValues([30], [10], 0))).toEqual([30]);
  });

  it('maps normalized depth through black point, white point and gamma', () => {
    const pixels = renderWhiteDepthPixels([0, 64, 128, 255], {
      invert: false,
      blackPoint: 0,
      whitePoint: 1,
      gamma: 1,
    });
    expect(Array.from(pixels)).toEqual([
      0, 0, 0, 255, 64, 64, 64, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
  });

  it('supports near/far reversal without changing alpha', () => {
    expect(
      Array.from(
        renderWhiteDepthPixels([0, 255], {
          invert: true,
          blackPoint: 0,
          whitePoint: 1,
          gamma: 1,
        }),
      ),
    ).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });
});
