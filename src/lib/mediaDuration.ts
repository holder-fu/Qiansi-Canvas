type DurationMedia = Pick<
  HTMLMediaElement,
  | 'addEventListener'
  | 'buffered'
  | 'currentTime'
  | 'duration'
  | 'readyState'
  | 'removeEventListener'
  | 'seekable'
>;

const DURATION_EVENTS = [
  'loadedmetadata',
  'durationchange',
  'loadeddata',
  'canplay',
  'progress',
  'seeked',
] as const;

function lastRangeEnd(ranges: TimeRanges) {
  if (!ranges.length) return 0;
  try {
    const end = ranges.end(ranges.length - 1);
    return Number.isFinite(end) && end > 0 ? end : 0;
  } catch {
    return 0;
  }
}

/** Read the best finite duration already exposed by a browser media element. */
export function readMediaDuration(
  media: Pick<DurationMedia, 'buffered' | 'duration' | 'seekable'>,
) {
  const declared = Number(media.duration);
  if (Number.isFinite(declared) && declared > 0) return declared;
  // A buffered range may cover only the first downloaded seconds of a remote file.
  // Treating it as the total duration permanently truncates metadata before the
  // end-seek probe can discover the real WebM length.
  return lastRangeEnd(media.seekable);
}

/**
 * Resolve WebM/MediaRecorder videos whose first metadata event reports Infinity.
 * Chromium discovers their real duration after seeking once beyond the media end.
 */
export function resolveMediaDuration(media: DurationMedia, timeoutMs = 8_000): Promise<number> {
  const available = readMediaDuration(media);
  if (available > 0) return Promise.resolve(available);

  return new Promise((resolve) => {
    let finished = false;
    let probeStarted = false;
    const originalTime = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    const timeout = globalThis.setTimeout(() => finish(readMediaDuration(media)), timeoutMs);

    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      for (const event of DURATION_EVENTS) media.removeEventListener(event, check);
    };
    const finish = (duration: number) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (probeStarted) {
        try {
          media.currentTime = originalTime;
        } catch {
          // Restoring the hidden probe is best-effort and does not affect the resolved duration.
        }
      }
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
    };
    function check() {
      const duration = readMediaDuration(media);
      if (duration > 0) {
        finish(duration);
        return;
      }
      if (probeStarted || media.readyState < 1) return;
      probeStarted = true;
      try {
        media.currentTime = 1e101;
      } catch {
        // Some browsers delay seeking until more metadata is available; later events retry read.
      }
    }

    for (const event of DURATION_EVENTS) media.addEventListener(event, check);
    check();
  });
}
