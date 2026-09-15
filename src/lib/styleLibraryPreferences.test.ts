import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE_PROMPT_GUIDE,
  loadStylePromptGuide,
  saveStylePromptGuide,
} from './styleLibraryPreferences';

const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return memoryStorage.size;
    },
    clear: () => memoryStorage.clear(),
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    removeItem: (key: string) => memoryStorage.delete(key),
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
  } satisfies Storage,
});

describe('style library prompt guide preference', () => {
  beforeEach(() => localStorage.clear());

  it('uses the built-in guide before the user edits it', () => {
    expect(loadStylePromptGuide()).toBe(DEFAULT_STYLE_PROMPT_GUIDE);
  });

  it('persists a trimmed custom guide', () => {
    expect(saveStylePromptGuide('  只保留画风与光影  ')).toBe('只保留画风与光影');
    expect(loadStylePromptGuide()).toBe('只保留画风与光影');
  });

  it('restores the built-in guide when an empty value is submitted', () => {
    expect(saveStylePromptGuide('   ')).toBe(DEFAULT_STYLE_PROMPT_GUIDE);
    expect(loadStylePromptGuide()).toBe(DEFAULT_STYLE_PROMPT_GUIDE);
  });
});
