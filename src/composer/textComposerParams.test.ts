import { describe, expect, it } from 'vitest';
import { sanitizeTextComposerParams } from './textComposerParams';

describe('sanitizeTextComposerParams', () => {
  it('drops retired length and creativity values without mutating the saved object', () => {
    const saved = {
      mode: '生成提示词',
      providerId: 'codex',
      model: 'codex:default',
      maxLength: 500,
      temperature: 0.2,
    };

    expect(sanitizeTextComposerParams(saved)).toEqual({
      mode: '生成提示词',
      providerId: 'codex',
      model: 'codex:default',
    });
    expect(saved).toHaveProperty('maxLength', 500);
    expect(saved).toHaveProperty('temperature', 0.2);
  });
});
