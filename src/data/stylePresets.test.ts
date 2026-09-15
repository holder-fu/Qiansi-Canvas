import { describe, expect, it } from 'vitest';
import { STYLE_PRESETS } from './stylePresets';

describe('built-in style templates', () => {
  it('uses deterministic, visibly marked placeholder metadata', () => {
    expect(STYLE_PRESETS).not.toHaveLength(0);
    for (const preset of STYLE_PRESETS) {
      expect(preset.template).toBe(true);
      expect(preset.author).toBe('内置模板');
      expect(preset.uses).toBe(0);
      expect(preset.commercial).toBe(false);
      expect(preset.tags).toContain('内置模板');
      expect(decodeURIComponent(preset.thumbnail ?? '')).toContain('TEMPLATE');
    }
  });
});
