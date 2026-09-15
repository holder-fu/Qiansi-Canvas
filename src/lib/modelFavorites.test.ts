import { describe, expect, it } from 'vitest';
import { matchModelFavorite, parseModelFavorites } from './modelFavorites';

describe('parseModelFavorites', () => {
  it('keeps only complete favorites for supported model functions', () => {
    expect(
      parseModelFavorites({
        chat: { providerId: 'codex', model: 'codex:gpt-5.6-sol' },
        image: { providerId: 'jimeng', model: '' },
        audio: { providerId: 'other', model: 'audio-model' },
      }),
    ).toEqual({
      chat: { providerId: 'codex', model: 'codex:gpt-5.6-sol' },
      audio: { providerId: 'other', model: 'audio-model' },
    });
  });

  it('returns an empty collection for malformed storage', () => {
    expect(parseModelFavorites(null)).toEqual({});
    expect(parseModelFavorites('broken')).toEqual({});
  });
});

describe('matchModelFavorite', () => {
  it('returns the exact provider and model pair without guessing', () => {
    const models = [
      { providerId: 'codex', model: 'codex:default', label: 'Default' },
      { providerId: 'codex', model: 'codex:gpt-5.6', label: 'GPT-5.6' },
    ];
    expect(matchModelFavorite(models, { providerId: 'codex', model: 'codex:gpt-5.6' })).toEqual(
      models[1],
    );
    expect(matchModelFavorite(models, { providerId: 'other', model: 'codex:gpt-5.6' })).toBe(
      undefined,
    );
  });
});
