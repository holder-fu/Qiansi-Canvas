import { describe, expect, it } from 'vitest';
import { DEFAULT_CANVAS_THEME } from './canvasTheme';
import { createThemeZip, parseThemeZip } from './themeZip';

describe('canvas theme zip', () => {
  it('round-trips the safe manifest', async () => {
    const blob = createThemeZip(DEFAULT_CANVAS_THEME);
    const file = new File([blob], 'default.zip', { type: 'application/zip' });
    const theme = await parseThemeZip(file);
    expect(theme.name).toBe(DEFAULT_CANVAS_THEME.name);
    expect(theme.tokens).toEqual(DEFAULT_CANVAS_THEME.tokens);
    expect(theme.builtIn).toBeUndefined();
  });

  it('rejects a non-zip payload', async () => {
    const file = new File(['not a zip'], 'broken.zip', { type: 'application/zip' });
    await expect(parseThemeZip(file)).rejects.toThrow('缺少 theme.json');
  });
});
