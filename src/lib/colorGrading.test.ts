import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_GRADE, applyColorGradeToPixels, isDefaultColorGrade } from './colorGrading';

describe('local image color grading', () => {
  it('keeps source pixels unchanged with neutral controls', () => {
    const source = new Uint8ClampedArray([20, 80, 160, 255, 240, 180, 100, 200]);
    expect(applyColorGradeToPixels(source, 2, 1, DEFAULT_COLOR_GRADE)).toEqual(source);
    expect(isDefaultColorGrade(DEFAULT_COLOR_GRADE)).toBe(true);
  });

  it('warms the image while preserving alpha', () => {
    const source = new Uint8ClampedArray([100, 100, 100, 123]);
    const result = applyColorGradeToPixels(source, 1, 1, {
      ...DEFAULT_COLOR_GRADE,
      temperature: 40,
    });
    expect(result[0]).toBeGreaterThan(result[2] ?? 0);
    expect(result[3]).toBe(123);
  });

  it('darkens the outer corners with vignette', () => {
    const source = new Uint8ClampedArray(3 * 3 * 4).fill(255);
    const result = applyColorGradeToPixels(source, 3, 3, {
      ...DEFAULT_COLOR_GRADE,
      vignette: 100,
    });
    const corner = result[0] ?? 0;
    const center = result[(1 * 3 + 1) * 4] ?? 0;
    expect(corner).toBeLessThan(center);
  });
});
