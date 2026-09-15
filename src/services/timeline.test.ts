import { describe, expect, it, vi } from 'vitest';
import { renderTimeline } from './timeline';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('renderTimeline', () => {
  it('submits clips, polls the real job, and resolves an absolute output URL', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ job: { id: 'render_1', status: 'queued', progress: 5 } }, 202),
      )
      .mockResolvedValueOnce(
        jsonResponse({ job: { id: 'render_1', status: 'running', progress: 45 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          job: { id: 'render_1', status: 'ready', progress: 100, url: '/exports/render_1.mp4' },
        }),
      );
    const progress: number[] = [];

    const job = await renderTimeline({
      clips: [{ source: '/asset-library/files/asset_123456', duration: 3 }],
      bridgeBase: 'http://127.0.0.1:2895',
      fetchImpl,
      wait: async () => {},
      onProgress: (value) => progress.push(value),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const firstRequest = fetchImpl.mock.calls[0];
    expect(firstRequest?.[0]).toBe('http://127.0.0.1:2895/timeline/render');
    expect(JSON.parse(String(firstRequest?.[1]?.body))).toEqual({
      clips: [
        {
          source: 'http://127.0.0.1:2895/asset-library/files/asset_123456',
          duration: 3,
        },
      ],
    });
    expect(progress).toEqual([5, 45, 100]);
    expect(job.url).toBe('http://127.0.0.1:2895/exports/render_1.mp4');
  });

  it('surfaces the bridge job error instead of reporting a fake completion', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ job: { id: 'render_2', status: 'queued', progress: 5 } }, 202),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          job: { id: 'render_2', status: 'error', progress: 0, output: 'FFmpeg 编码失败' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          job: { id: 'render_2', status: 'error', progress: 0, output: '时间线合成已取消。' },
        }),
      );

    await expect(
      renderTimeline({
        clips: [{ source: '/asset-library/files/asset_123456' }],
        fetchImpl,
        wait: async () => {},
      }),
    ).rejects.toThrow('FFmpeg 编码失败');
    expect(fetchImpl.mock.calls[2]?.[1]?.method).toBe('DELETE');
  });

  it('rejects remote URLs before creating a bridge job', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      renderTimeline({ clips: [{ source: 'https://cdn.example.test/clip.mp4' }], fetchImpl }),
    ).rejects.toThrow('受管素材库');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects browser-only blob URLs with an actionable message', async () => {
    await expect(
      renderTimeline({ clips: [{ source: 'blob:http://localhost/video' }] }),
    ).rejects.toThrow('先保存到素材库');
  });
});
