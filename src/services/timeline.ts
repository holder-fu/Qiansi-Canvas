import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export const TIMELINE_BRIDGE_BASE = BRIDGE_BASE_URL;

export interface TimelineClip {
  source: string;
  duration?: number;
}

export interface TimelineRenderJob {
  id: string;
  status: 'queued' | 'running' | 'ready' | 'error';
  progress: number;
  output?: string;
  url?: string;
}

interface TimelineEnvelope {
  job?: TimelineRenderJob;
  error?: { message?: string };
}

export interface RenderTimelineOptions {
  clips: TimelineClip[];
  audioSource?: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
  bridgeBase?: string;
  fetchImpl?: typeof fetch;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function normalizedMediaSource(source: string, bridgeBase: string) {
  const value = source.trim();
  if (!value) throw new Error('视频合成包含空素材地址。');
  if (value.startsWith('blob:') || value.startsWith('data:')) {
    throw new Error('临时上传的视频不能直接合成，请先保存到素材库后再连接。');
  }
  const resolved = value.startsWith('/') ? resolveBridgeUrl(value, bridgeBase) : value;
  let mediaUrl: URL;
  let bridgeUrl: URL;
  try {
    mediaUrl = new URL(resolved);
    bridgeUrl = new URL(bridgeBase);
  } catch {
    throw new Error('视频合成仅支持当前本机桥的受管素材库地址。');
  }
  if (
    mediaUrl.origin !== bridgeUrl.origin ||
    !/^\/asset-library\/files\/[A-Za-z0-9_-]{6,80}$/.test(mediaUrl.pathname)
  ) {
    throw new Error('视频合成仅支持当前本机桥的受管素材库地址。');
  }
  return mediaUrl.toString();
}

async function defaultWait(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('操作已取消。', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('操作已取消。', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function readEnvelope(response: Response): Promise<TimelineEnvelope> {
  const body = (await response.json().catch(() => ({}))) as TimelineEnvelope;
  if (!response.ok) {
    throw new Error(body.error?.message || `视频合成请求失败（HTTP ${response.status}）。`);
  }
  return body;
}

/** Submit a real local FFmpeg render and wait for its final media URL. */
export async function renderTimeline(options: RenderTimelineOptions): Promise<TimelineRenderJob> {
  if (!options.clips.length) throw new Error('请至少连接一个视频片段。');
  const bridgeBase = resolveBridgeBaseUrl(options.bridgeBase, TIMELINE_BRIDGE_BASE);
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? defaultWait;
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 20 * 60_000);
  const pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 800);
  const clips = options.clips.map((clip) => ({
    source: normalizedMediaSource(clip.source, bridgeBase),
    duration: Math.max(1, Math.min(30, Number(clip.duration) || 5)),
  }));
  const audioSource = options.audioSource
    ? normalizedMediaSource(options.audioSource, bridgeBase)
    : undefined;

  let jobId = '';
  try {
    const created = await readEnvelope(
      await fetchImpl(resolveBridgeUrl('/timeline/render', bridgeBase), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips, audioSource }),
        signal: options.signal,
      }),
    );
    if (!created.job?.id) throw new Error('本机桥没有返回视频合成任务 ID。');
    jobId = created.job.id;
    options.onProgress?.(Math.max(1, created.job.progress || 1));

    const deadline = Date.now() + timeoutMs;
    let job = created.job;
    while (job.status !== 'ready') {
      if (job.status === 'error') throw new Error(job.output || '视频合成失败。');
      if (Date.now() >= deadline) throw new Error('视频合成等待超时，任务已经请求取消。');
      await wait(pollIntervalMs, options.signal);
      const polled = await readEnvelope(
        await fetchImpl(
          resolveBridgeUrl(`/timeline/render/${encodeURIComponent(job.id)}`, bridgeBase),
          {
            signal: options.signal,
          },
        ),
      );
      if (!polled.job) throw new Error('本机桥返回了无效的视频合成任务状态。');
      job = polled.job;
      options.onProgress?.(Math.max(1, Math.min(100, job.progress || 1)));
    }

    if (!job.url) throw new Error('视频合成已完成，但没有返回输出文件。');
    return {
      ...job,
      url: resolveBridgeUrl(job.url, bridgeBase),
    };
  } catch (error) {
    if (jobId) {
      await fetchImpl(
        resolveBridgeUrl(`/timeline/render/${encodeURIComponent(jobId)}`, bridgeBase),
        {
          method: 'DELETE',
          signal: AbortSignal.timeout(3_000),
        },
      ).catch(() => undefined);
    }
    throw error;
  }
}
