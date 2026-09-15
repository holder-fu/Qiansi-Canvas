import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTOR_SUBJECT_FRAME_SHAPE,
  DIRECTOR_SUBJECT_FRAME_SHAPES,
  directorSubjectFrameStyle,
  normalizeDirectorSubjectFrameShape,
} from './directorSubjectFrame';

describe('director subject frame shapes', () => {
  it('keeps the legacy arch as the safe default', () => {
    expect(DEFAULT_DIRECTOR_SUBJECT_FRAME_SHAPE).toBe('arch');
    expect(normalizeDirectorSubjectFrameShape(null)).toBe('arch');
    expect(normalizeDirectorSubjectFrameShape('unknown')).toBe('arch');
  });

  it('accepts every selectable frame shape', () => {
    expect(DIRECTOR_SUBJECT_FRAME_SHAPES).toEqual([
      'arch',
      'rounded',
      'oval',
      'hexagon',
      'shield',
      'human',
    ]);
    for (const shape of DIRECTOR_SUBJECT_FRAME_SHAPES) {
      expect(normalizeDirectorSubjectFrameShape(shape)).toBe(shape);
    }
  });

  it('provides distinct rounded and polygon outlines', () => {
    expect(directorSubjectFrameStyle('arch')).toMatchObject({ borderRadius: expect.any(String) });
    expect(directorSubjectFrameStyle('rounded')).not.toEqual(directorSubjectFrameStyle('arch'));
    expect(directorSubjectFrameStyle('hexagon')).toMatchObject({ clipPath: expect.any(String) });
    expect(directorSubjectFrameStyle('shield')).not.toEqual(directorSubjectFrameStyle('hexagon'));
    expect(directorSubjectFrameStyle('human')).toMatchObject({ clipPath: expect.any(String) });
    expect(directorSubjectFrameStyle('human')).not.toEqual(directorSubjectFrameStyle('shield'));
  });
});
