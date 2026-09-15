import { describe, expect, it } from 'vitest';
import { DEFAULT_CANVAS_THEME, parseCanvasTheme } from './canvasTheme';

describe('canvas theme manifest', () => {
  it('locks the explicitly approved default canvas background baseline', () => {
    expect(DEFAULT_CANVAS_THEME.tokens).toMatchObject({
      canvas: '#141414',
      grid: '#383838',
      gridVisible: true,
      gridGap: 16,
      gridSize: 1.5,
    });
  });

  it('accepts the supported token-only schema', () => {
    expect(DEFAULT_CANVAS_THEME.name).toBe('千丝默认深色');
    expect(DEFAULT_CANVAS_THEME.version).toBe('2.0.7');
    expect(parseCanvasTheme(DEFAULT_CANVAS_THEME).tokens).toMatchObject({
      canvas: '#141414',
      accent: '#57c957',
      grid: '#383838',
      gridGap: 16,
      gridSize: 1.5,
      interfaceStyle: 'studio',
      gridVisible: true,
    });
  });

  it('keeps old version-one themes compatible with the default interface treatment', () => {
    const legacyTokens = { ...DEFAULT_CANVAS_THEME.tokens } as Partial<
      typeof DEFAULT_CANVAS_THEME.tokens
    >;
    delete legacyTokens.interfaceStyle;
    delete legacyTokens.cursorStyle;
    expect(
      parseCanvasTheme({ ...DEFAULT_CANVAS_THEME, tokens: legacyTokens }).tokens,
    ).toMatchObject({ interfaceStyle: 'qiansi', cursorStyle: 'system' });
  });

  it('accepts only built-in safe interface and cursor presets', () => {
    expect(
      parseCanvasTheme({
        ...DEFAULT_CANVAS_THEME,
        tokens: {
          ...DEFAULT_CANVAS_THEME.tokens,
          interfaceStyle: 'macos',
          cursorStyle: 'macos',
        },
      }).tokens,
    ).toMatchObject({ interfaceStyle: 'macos', cursorStyle: 'macos' });
    expect(
      parseCanvasTheme({
        ...DEFAULT_CANVAS_THEME,
        tokens: {
          ...DEFAULT_CANVAS_THEME.tokens,
          interfaceStyle: 'studio',
        },
      }).tokens.interfaceStyle,
    ).toBe('studio');
    expect(
      parseCanvasTheme({
        ...DEFAULT_CANVAS_THEME,
        tokens: {
          ...DEFAULT_CANVAS_THEME.tokens,
          interfaceStyle: 'dream-pink',
        },
      }).tokens.interfaceStyle,
    ).toBe('dream-pink');
    expect(() =>
      parseCanvasTheme({
        ...DEFAULT_CANVAS_THEME,
        tokens: { ...DEFAULT_CANVAS_THEME.tokens, interfaceStyle: 'theme.css' },
      }),
    ).toThrow('界面样式不受支持');
  });

  it('rejects arbitrary CSS in color tokens', () => {
    expect(() =>
      parseCanvasTheme({
        ...DEFAULT_CANVAS_THEME,
        tokens: { ...DEFAULT_CANVAS_THEME.tokens, canvas: 'url(javascript:alert(1))' },
      }),
    ).toThrow('必须是 #RRGGBB 颜色');
  });

  it('rejects unsupported schema versions', () => {
    expect(() => parseCanvasTheme({ ...DEFAULT_CANVAS_THEME, schemaVersion: 2 })).toThrow(
      '不是受支持',
    );
  });
});
