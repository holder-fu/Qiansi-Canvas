import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readPluginMotionCaptureResult,
  startPluginMotionCapture,
} from './pluginMotionCaptureWorker';

const job = {
  jobId: '12345678-1234-4123-8123-123456789abc',
  engineId: 'gem-x',
  status: 'queued',
  phase: 'queued',
  message: 'ready',
  progress: 0,
  completedFrames: 0,
  totalFrames: 1,
  error: null,
  startedAt: '2026-09-03T00:00:00Z',
  updatedAt: '2026-09-03T00:00:00Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('plugin AI motion capture Bridge client', () => {
  it('sends only GEM-X parameters with one bounded video body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(job), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const bytes = new Uint8Array([1, 2, 3]).buffer;

    await expect(
      startPluginMotionCapture(
        'qiansi-motion-capture',
        {
          engineId: 'gem-x',
          bytes,
          fileName: '动作.mp4',
          mimeType: 'video/mp4',
          durationSeconds: 1,
          width: 720,
          height: 1280,
          sampleFps: 10,
          maxPoses: 1,
          confidenceThreshold: 0.45,
          smoothing: 0.65,
          staticCamera: true,
          detectionThreshold: 0.3,
          trackingMethod: 'iou',
          trackingThreshold: 0.35,
        },
        { bridgeBase: 'http://127.0.0.1:3999' },
      ),
    ).resolves.toMatchObject({ engineId: 'gem-x', status: 'queued' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/vision/capture/start?'),
      expect.objectContaining({ method: 'POST', body: bytes }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('engineId=gem-x');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('staticCamera=true');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('detectionThreshold');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('trackingMethod');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('trackingThreshold');
  });

  it('sends RTMW3D parameters without the GEM-X static-camera field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...job, engineId: 'rtmw3d' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      startPluginMotionCapture(
        'qiansi-motion-capture',
        {
          engineId: 'rtmw3d',
          bytes: new Uint8Array([1, 2, 3]).buffer,
          fileName: '动作.mp4',
          mimeType: 'video/mp4',
          durationSeconds: 1,
          width: 720,
          height: 1280,
          sampleFps: 10,
          maxPoses: 2,
          confidenceThreshold: 0.45,
          smoothing: 0.65,
          staticCamera: false,
          detectionThreshold: 0.25,
          trackingMethod: 'oks',
          trackingThreshold: 0.35,
        },
        { bridgeBase: 'http://127.0.0.1:3999' },
      ),
    ).resolves.toMatchObject({
      engineId: 'rtmw3d',
      status: 'queued',
      parameterCompatibility: 'full',
    });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).not.toContain('staticCamera');
    expect(url).toContain('detectionThreshold=0.25');
    expect(url).toContain('trackingMethod=oks');
    expect(url).toContain('trackingThreshold=0.35');
  });

  it('retries an older Bridge once with core parameters only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'AI 动作任务包含未知参数：detectionThreshold。' },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...job, engineId: 'rtmw3d' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      startPluginMotionCapture(
        'qiansi-motion-capture',
        {
          engineId: 'rtmw3d',
          bytes: new Uint8Array([1, 2, 3]).buffer,
          fileName: '动作.mp4',
          mimeType: 'video/mp4',
          durationSeconds: 1,
          width: 720,
          height: 1280,
          sampleFps: 10,
          maxPoses: 2,
          confidenceThreshold: 0.45,
          smoothing: 0.65,
          staticCamera: false,
          detectionThreshold: 0.25,
          trackingMethod: 'oks',
          trackingThreshold: 0.35,
        },
        { bridgeBase: 'http://127.0.0.1:3999' },
      ),
    ).resolves.toMatchObject({ parameterCompatibility: 'legacy-defaults' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(fallbackUrl).not.toContain('staticCamera');
    expect(fallbackUrl).not.toContain('detectionThreshold');
    expect(fallbackUrl).not.toContain('trackingMethod');
    expect(fallbackUrl).not.toContain('trackingThreshold');
  });

  it('accepts the canonical extended skeleton and rejects cross-engine results', async () => {
    const point = { x: 0.1, y: 0.2, z: 0.3, visibility: 0.9 };
    const result = {
      schemaVersion: 1,
      engineId: 'gem-x',
      model: 'fixture',
      skeleton: 'qiansi-soma-77',
      jointCount: 77,
      sampleFps: 10,
      frames: [
        {
          timestampMs: 0,
          detected: true,
          confidence: 0.9,
          people: [
            {
              trackId: 1,
              confidence: 0.9,
              landmarks: Array.from({ length: 77 }, () => point),
              worldLandmarks: Array.from({ length: 77 }, () => point),
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      readPluginMotionCaptureResult('qiansi-motion-capture', 'gem-x', job.jobId, {
        bridgeBase: 'http://127.0.0.1:3999',
      }),
    ).resolves.toMatchObject({ engineId: 'gem-x', jointCount: 77 });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...result, engineId: 'rtmw3d' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      readPluginMotionCaptureResult('qiansi-motion-capture', 'gem-x', job.jobId, {
        bridgeBase: 'http://127.0.0.1:3999',
      }),
    ).rejects.toThrow(/请求引擎不匹配/);
  });

  it('accepts only declared RTMW3D world and screen conventions while retaining legacy results', async () => {
    const point = { x: 0.1, y: 0.2, z: 0.3, visibility: 0.9 };
    const result = {
      schemaVersion: 1,
      engineId: 'rtmw3d',
      model: 'fixture',
      skeleton: 'qiansi-coco-wholebody-133',
      jointCount: 133,
      coordinateConvention: 'qiansi-camera-relative-y-down-v1',
      landmarkConvention: 'qiansi-screen-normalized-v1',
      landmarkLayout: 'qiansi-mediapipe33-hands21-v1',
      sampleFps: 10,
      frames: [
        {
          timestampMs: 0,
          detected: true,
          confidence: 0.9,
          people: [
            {
              trackId: 1,
              confidence: 0.9,
              landmarks: Array.from({ length: 133 }, () => point),
              worldLandmarks: Array.from({ length: 133 }, () => point),
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      readPluginMotionCaptureResult('qiansi-motion-capture', 'rtmw3d', job.jobId, {
        bridgeBase: 'http://127.0.0.1:3999',
      }),
    ).resolves.toMatchObject({
      engineId: 'rtmw3d',
      coordinateConvention: 'qiansi-camera-relative-y-down-v1',
      landmarkConvention: 'qiansi-screen-normalized-v1',
      landmarkLayout: 'qiansi-mediapipe33-hands21-v1',
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...result, coordinateConvention: undefined }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      readPluginMotionCaptureResult('qiansi-motion-capture', 'rtmw3d', job.jobId, {
        bridgeBase: 'http://127.0.0.1:3999',
      }),
    ).resolves.toMatchObject({ engineId: 'rtmw3d' });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...result, coordinateConvention: 'official-demo-z-up' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      readPluginMotionCaptureResult('qiansi-motion-capture', 'rtmw3d', job.jobId, {
        bridgeBase: 'http://127.0.0.1:3999',
      }),
    ).rejects.toThrow(/坐标约定无效/);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...result, landmarkConvention: 'camera-pixels' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      readPluginMotionCaptureResult('qiansi-motion-capture', 'rtmw3d', job.jobId, {
        bridgeBase: 'http://127.0.0.1:3999',
      }),
    ).rejects.toThrow(/画面坐标约定无效/);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...result, landmarkLayout: 'wholebody-raw' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      readPluginMotionCaptureResult('qiansi-motion-capture', 'rtmw3d', job.jobId, {
        bridgeBase: 'http://127.0.0.1:3999',
      }),
    ).rejects.toThrow(/关节点布局无效/);
  });
});
