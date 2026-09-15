import { describe, expect, it } from 'vitest';
import {
  addVideoRemakeSegment,
  defaultVideoRemakeSegmentAt,
  getVideoRemakeDefaultSeconds,
  getVideoRemakeMinimumSeconds,
  MAX_VIDEO_REMAKE_SEGMENTS,
  moveVideoTrimRange,
  normalizeVideoRemakeSegments,
  normalizeVideoTrimRange,
  resolveVideoRemakeDragPreviewTime,
  snapVideoTrimRange,
  updateVideoTrimHandle,
  updateIdentifiedVideoRemakeSegment,
  videoTrimRangesOverlap,
  type VideoTrimRange,
} from './videoTrim';

describe('normalizeVideoTrimRange', () => {
  it('uses the whole video when no saved range exists', () => {
    expect(normalizeVideoTrimRange(15)).toEqual({ start: 0, end: 15 });
  });

  it('clamps invalid saved values into the video duration', () => {
    expect(normalizeVideoTrimRange(10, -4, 30)).toEqual({ start: 0, end: 10 });
  });

  it('keeps a minimum editable interval', () => {
    expect(normalizeVideoTrimRange(10, 9.99, 9.99)).toEqual({ start: 9.9, end: 10 });
  });
});

describe('updateVideoTrimHandle', () => {
  it('prevents the start handle from crossing the end handle', () => {
    expect(updateVideoTrimHandle(10, { start: 2, end: 6 }, 'start', 9)).toEqual({
      start: 5.9,
      end: 6,
    });
  });

  it('prevents the end handle from crossing the start handle', () => {
    expect(updateVideoTrimHandle(10, { start: 4, end: 8 }, 'end', 1)).toEqual({
      start: 4,
      end: 4.1,
    });
  });

  it('keeps a remake selection at least four seconds long', () => {
    expect(updateVideoTrimHandle(15, { start: 2, end: 8 }, 'end', 3, 4)).toEqual({
      start: 2,
      end: 6,
    });
  });
});

describe('moveVideoTrimRange', () => {
  it('moves the selected interval without changing its duration', () => {
    expect(moveVideoTrimRange(15, { start: 2, end: 6 }, 8, 4)).toEqual({
      start: 8,
      end: 12,
    });
  });

  it('stops the selected interval at the end of the video', () => {
    expect(moveVideoTrimRange(15, { start: 2, end: 6 }, 14, 4)).toEqual({
      start: 11,
      end: 15,
    });
  });
});

describe('snapVideoTrimRange', () => {
  it('snaps both boundaries to whole seconds', () => {
    expect(snapVideoTrimRange(15, { start: 2.38, end: 8.62 })).toEqual({ start: 2, end: 9 });
  });

  it('keeps a one-second interval when both boundaries round to the same second', () => {
    expect(snapVideoTrimRange(15, { start: 4.2, end: 4.4 })).toEqual({ start: 4, end: 5 });
    expect(snapVideoTrimRange(5, { start: 4.7, end: 4.9 })).toEqual({ start: 4, end: 5 });
  });
});

describe('video remake segments', () => {
  it('keeps a precise minimum while retaining duration-aware default lengths', () => {
    expect(getVideoRemakeMinimumSeconds(10)).toBe(0.1);
    expect(getVideoRemakeDefaultSeconds(10)).toBe(2);
    expect(getVideoRemakeMinimumSeconds(20)).toBe(0.1);
    expect(getVideoRemakeDefaultSeconds(20)).toBe(4);
    expect(getVideoRemakeMinimumSeconds(30)).toBe(0.1);
    expect(getVideoRemakeDefaultSeconds(30)).toBe(5);
  });

  it('allows a selected remake range to be shorter than two seconds', () => {
    expect(
      updateIdentifiedVideoRemakeSegment(
        10,
        [{ id: 'short', start: 1, end: 3 }],
        'short',
        'end',
        1.6,
      ),
    ).toEqual([{ id: 'short', start: 1, end: 1.6 }]);
    expect(normalizeVideoRemakeSegments(10, [{ start: 1.2, end: 1.8 }])).toEqual([
      { start: 1.2, end: 1.8 },
    ]);
  });

  it('divides a ten-second source into five two-second default sections', () => {
    expect(defaultVideoRemakeSegmentAt(10, 1)).toEqual({ start: 0, end: 2 });
    expect(defaultVideoRemakeSegmentAt(10, 3)).toEqual({ start: 2, end: 4 });
    expect(defaultVideoRemakeSegmentAt(10, 9.9)).toEqual({ start: 8, end: 10 });
  });

  it('allows all five non-overlapping selections on a ten-second source', () => {
    const selected = [1, 3, 5, 7, 9].reduce<VideoTrimRange[]>((current, time) => {
      const next = addVideoRemakeSegment(10, current, time);
      expect(next).not.toBeNull();
      return next ?? current;
    }, []);

    expect(selected).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
      { start: 6, end: 8 },
      { start: 8, end: 10 },
    ]);
  });

  it('does not add the same duration-aware section twice', () => {
    expect(addVideoRemakeSegment(15, [{ start: 9, end: 12 }], 10)).toBeNull();
  });

  it('does not add a default section that overlaps an existing selection', () => {
    expect(addVideoRemakeSegment(20, [{ start: 3, end: 8 }], 7)).toBeNull();
    expect(videoTrimRangesOverlap({ start: 0, end: 5 }, { start: 5, end: 10 })).toBe(false);
  });

  it('does not force a resized short-video segment back to two seconds', () => {
    expect(
      updateIdentifiedVideoRemakeSegment(
        10,
        [{ id: 'short', start: 0, end: 4 }],
        'short',
        'end',
        1,
      ),
    ).toEqual([{ id: 'short', start: 0, end: 1 }]);
  });

  it('keeps no more than five normalized segments', () => {
    const raw = Array.from({ length: MAX_VIDEO_REMAKE_SEGMENTS + 2 }, (_, index) => ({
      start: index * 4,
      end: index * 4 + 4,
    }));
    expect(normalizeVideoRemakeSegments(28, raw)).toHaveLength(MAX_VIDEO_REMAKE_SEGMENTS);
    expect(addVideoRemakeSegment(28, raw.slice(0, MAX_VIDEO_REMAKE_SEGMENTS), 22)).toBeNull();
  });

  it('stops a dragged segment at the next selected segment', () => {
    const initial = [
      { id: 'a', start: 0, end: 5 },
      { id: 'b', start: 10, end: 15 },
    ];
    const crossed = updateIdentifiedVideoRemakeSegment(30, initial, 'a', 'window', 14, 2);
    const continued = updateIdentifiedVideoRemakeSegment(30, crossed, 'a', 'window', 18, 2);

    expect(crossed).toEqual([
      { id: 'a', start: 5, end: 10 },
      { id: 'b', start: 10, end: 15 },
    ]);
    expect(continued).toEqual([
      { id: 'a', start: 5, end: 10 },
      { id: 'b', start: 10, end: 15 },
    ]);
  });

  it('clamps resize handles to neighboring segment boundaries', () => {
    const initial = [
      { id: 'a', start: 0, end: 5 },
      { id: 'b', start: 8, end: 13 },
      { id: 'c', start: 16, end: 21 },
    ];

    expect(updateIdentifiedVideoRemakeSegment(30, initial, 'b', 'start', 2)).toEqual([
      { id: 'a', start: 0, end: 5 },
      { id: 'b', start: 5, end: 13 },
      { id: 'c', start: 16, end: 21 },
    ]);
    expect(updateIdentifiedVideoRemakeSegment(30, initial, 'b', 'end', 20)).toEqual([
      { id: 'a', start: 0, end: 5 },
      { id: 'b', start: 8, end: 16 },
      { id: 'c', start: 16, end: 21 },
    ]);
  });

  it('resolves the preview frame from the actual dragged remake boundary or pointer', () => {
    const segment = { start: 5, end: 10 };

    expect(resolveVideoRemakeDragPreviewTime('start', 2, segment)).toBe(5);
    expect(resolveVideoRemakeDragPreviewTime('end', 20, segment)).toBe(10);
    expect(resolveVideoRemakeDragPreviewTime('window', 7.4, segment)).toBe(7.4);
    expect(resolveVideoRemakeDragPreviewTime('window', 18, segment)).toBe(10);
  });

  it('drops overlapping legacy selections during normalization', () => {
    expect(
      normalizeVideoRemakeSegments(20, [
        { start: 0, end: 5 },
        { start: 3, end: 8 },
        { start: 8, end: 13 },
      ]),
    ).toEqual([
      { start: 0, end: 5 },
      { start: 8, end: 13 },
    ]);
  });
});
