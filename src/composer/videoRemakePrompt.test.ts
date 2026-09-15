import { describe, expect, it } from 'vitest';
import { buildVideoRemakePromptPreview, formatVideoRemakeTimestamp } from './videoRemakePrompt';

describe('video remake prompt preview', () => {
  it('describes every selected source-video interval in the instruction box', () => {
    expect(
      buildVideoRemakePromptPreview([
        { start: 0, end: 5 },
        { start: 5, end: 10 },
        { start: 10, end: 14.8 },
      ]),
    ).toEqual({
      prefix: '把视频 1 中',
      ranges: ['00:00–00:05', '00:05–00:10', '00:10–00:14.8'],
      suffix: '这些片段重新生成',
    });
  });

  it('keeps fractional boundaries visible instead of rounding them to the wrong seconds', () => {
    expect(formatVideoRemakeTimestamp(1.6)).toBe('00:01.6');
    expect(formatVideoRemakeTimestamp(4.4)).toBe('00:04.4');
    expect(formatVideoRemakeTimestamp(59.96)).toBe('01:00');
    expect(
      buildVideoRemakePromptPreview([
        { start: 1.6, end: 4.4 },
        { start: 65.25, end: 69.05 },
      ]).ranges,
    ).toEqual(['00:01.6–00:04.4', '01:05.3–01:09.1']);
  });
});
