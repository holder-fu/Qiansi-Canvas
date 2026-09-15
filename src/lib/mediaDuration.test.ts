import { describe, expect, it } from 'vitest';
import { readMediaDuration, resolveMediaDuration } from './mediaDuration';

function ranges(...ends: number[]): TimeRanges {
  return {
    length: ends.length,
    start: () => 0,
    end: (index: number) => ends[index] ?? 0,
  };
}

class DurationProbe extends EventTarget {
  buffered = ranges();
  duration: number;
  readyState = 1;
  seekable = ranges();
  private time = 0;

  constructor(initialDuration = Number.POSITIVE_INFINITY) {
    super();
    this.duration = initialDuration;
  }

  get currentTime() {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    if (value < 1e100) return;
    this.duration = 18.5;
    queueMicrotask(() => this.dispatchEvent(new Event('durationchange')));
  }
}

describe('media duration resolution', () => {
  it('uses a finite seekable range when declared duration is infinite', () => {
    expect(
      readMediaDuration({
        buffered: ranges(),
        duration: Number.POSITIVE_INFINITY,
        seekable: ranges(12.25),
      }),
    ).toBe(12.25);
  });

  it('recovers a finite duration by probing beyond the end and restores playback time', async () => {
    const media = new DurationProbe();
    media.currentTime = 3;

    await expect(resolveMediaDuration(media, 100)).resolves.toBe(18.5);
    expect(media.currentTime).toBe(3);
  });

  it('also recovers MediaRecorder metadata that initially reports zero', async () => {
    const media = new DurationProbe(0);

    await expect(resolveMediaDuration(media, 100)).resolves.toBe(18.5);
    expect(media.currentTime).toBe(0);
  });

  it('does not mistake a partially buffered remote file for its total duration', async () => {
    const media = new DurationProbe(0);
    media.buffered = ranges(2.75);

    expect(readMediaDuration(media)).toBe(0);
    await expect(resolveMediaDuration(media, 100)).resolves.toBe(18.5);
  });
});
