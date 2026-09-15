import { describe, expect, it } from 'vitest';
import {
  clampVideoTimelineFrameTime,
  createUniformVideoFrameTimes,
  createVideoTimelineFrameTimes,
} from './videoFrameExtraction';

describe('createUniformVideoFrameTimes', () => {
  it('samples the centre of evenly divided segments in chronological order', () => {
    expect(createUniformVideoFrameTimes(10, 5)).toEqual([1, 3, 5, 7, 9]);
    expect(createUniformVideoFrameTimes(10, 1)).toEqual([5]);
  });

  it('keeps short-video samples distinct, ordered and inside the duration', () => {
    const times = createUniformVideoFrameTimes(0.04, 5);

    expect(times).toHaveLength(5);
    expect(times[0]).toBeGreaterThanOrEqual(0);
    expect(times.at(-1)).toBeLessThan(0.04);
    expect(
      times.every((time, index) => {
        if (index === 0) return true;
        const previousTime = times[index - 1];
        return previousTime !== undefined && time > previousTime;
      }),
    ).toBe(true);
  });

  it('falls back to the first frame for invalid durations', () => {
    expect(createUniformVideoFrameTimes(0, 5)).toEqual([0]);
    expect(createUniformVideoFrameTimes(-10, 5)).toEqual([0]);
    expect(createUniformVideoFrameTimes(Number.NaN, 5)).toEqual([0]);
    expect(createUniformVideoFrameTimes(Number.POSITIVE_INFINITY, 5)).toEqual([0]);
  });

  it('returns no times for invalid requested counts and floors fractional counts', () => {
    expect(createUniformVideoFrameTimes(10, 0)).toEqual([]);
    expect(createUniformVideoFrameTimes(10, -1)).toEqual([]);
    expect(createUniformVideoFrameTimes(10, Number.NaN)).toEqual([]);
    expect(createUniformVideoFrameTimes(10, 2.9)).toEqual([2.5, 7.5]);
  });
});

describe('video timeline thumbnails', () => {
  it('covers the first and final readable frame instead of sampling only segment centres', () => {
    const times = createVideoTimelineFrameTimes(10, 5);

    expect(times).toHaveLength(5);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBeCloseTo(9.96, 5);
    expect(times).toEqual([...times].sort((left, right) => left - right));
  });

  it('refuses to represent an unknown duration as one timeline frame', () => {
    expect(createVideoTimelineFrameTimes(0, 12)).toEqual([]);
    expect(createVideoTimelineFrameTimes(Number.POSITIVE_INFINITY, 12)).toEqual([]);
  });

  it('uses the recovered full duration when native WebM metadata remains infinite', () => {
    const recoveredDuration = 10.02;
    const times = createVideoTimelineFrameTimes(recoveredDuration, 6);

    expect(times.map((time) => clampVideoTimelineFrameTime(time, recoveredDuration))).toEqual(
      times,
    );
    expect(clampVideoTimelineFrameTime(5.01, recoveredDuration)).toBe(5.01);
    expect(clampVideoTimelineFrameTime(99, recoveredDuration)).toBe(recoveredDuration);
  });

  it('keeps dense timeline samples close to every five-second guide', () => {
    const times = createVideoTimelineFrameTimes(37, 30);

    for (const guide of [5, 10, 15, 20, 25, 30, 35]) {
      const closestDistance = Math.min(...times.map((time) => Math.abs(time - guide)));
      expect(closestDistance).toBeLessThan(0.7);
    }
  });
});
