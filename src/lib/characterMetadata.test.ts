import { describe, expect, it } from 'vitest';
import {
  matchesCharacterDemographics,
  normalizeCharacterAge,
  normalizeCharacterGender,
  normalizeCharacterNationality,
} from './characterMetadata';

describe('character metadata', () => {
  it('normalizes persisted demographic values without inventing defaults', () => {
    expect(normalizeCharacterGender('female')).toBe('female');
    expect(normalizeCharacterGender('unknown')).toBeUndefined();
    expect(normalizeCharacterAge('24')).toBe(24);
    expect(normalizeCharacterAge(151)).toBeUndefined();
    expect(normalizeCharacterNationality('  中国  ')).toBe('中国');
    expect(normalizeCharacterNationality('')).toBeUndefined();
  });

  it('matches gender, age bands and nationality together', () => {
    const character = { gender: 'female' as const, age: 24, nationality: '中国' };
    expect(
      matchesCharacterDemographics(character, {
        gender: 'female',
        age: 'young-adult',
        nationality: '中国',
      }),
    ).toBe(true);
    expect(
      matchesCharacterDemographics(character, {
        gender: 'male',
        age: 'all',
        nationality: 'all',
      }),
    ).toBe(false);
    expect(
      matchesCharacterDemographics(
        {},
        {
          gender: 'unspecified',
          age: 'unspecified',
          nationality: 'unspecified',
        },
      ),
    ).toBe(true);
  });
});
