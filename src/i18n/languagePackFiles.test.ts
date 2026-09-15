import { describe, expect, it } from 'vitest';
import { availableAppLanguages } from './appI18n';

describe('built-in application language boundary', () => {
  it('keeps launch-center-only translations out of the canvas application', () => {
    expect(
      availableAppLanguages()
        .filter((language) => language.builtIn)
        .map((language) => language.locale),
    ).toEqual(['zh-CN', 'en-US']);
  });
});
