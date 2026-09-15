import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CANVAS_THEME, type CanvasTheme } from '../theme/canvasTheme';
import {
  migrateLegacyCanvasTheme,
  normalizeCanvasThemeCollection,
  useCanvasThemeStore,
} from './canvasThemeStore';

const legacyDreamPink: CanvasTheme = {
  ...DEFAULT_CANVAS_THEME,
  id: 'imported-dream-pink',
  name: '绯梦紫粉',
  version: '1.0.0',
  description: '浅粉画布、紫粉渐变、柔光玻璃与甜心圆角组成的全局明亮风格。',
  builtIn: false,
  tokens: {
    ...DEFAULT_CANVAS_THEME.tokens,
    canvas: '#f8eef8',
    edge: '#e6cce9',
    edgeStrong: '#cfa8d6',
    grid: '#ddc3e2',
    interfaceStyle: 'dream-pink',
  },
};

const officialDreamPinkVersion103: CanvasTheme = {
  ...legacyDreamPink,
  id: 'qiansi-dream-pink',
  version: '1.0.3',
  description: '灰紫创作画布、中紫面板、深梅工具栏、紫粉渐变与甜心圆角组成的高对比全局风格。',
  tokens: {
    ...legacyDreamPink.tokens,
    canvas: '#49334f',
    card: '#b892ba',
    panel: '#8c6694',
    edge: '#6e4778',
    edgeStrong: '#d18bd5',
    accent: '#bd4ccb',
    grid: '#866c8c',
    gridVisible: true,
    gridGap: 24,
    gridSize: 1,
    interfaceStyle: 'dream-pink',
    cursorStyle: 'system',
  },
};

describe('canvas theme storage migrations', () => {
  it('moves the original Dream Pink import to the high-contrast workspace palette', () => {
    expect(migrateLegacyCanvasTheme(legacyDreamPink)).toMatchObject({
      version: '1.0.3',
      tokens: {
        canvas: '#49334f',
        card: '#b892ba',
        panel: '#8c6694',
        edge: '#6e4778',
        edgeStrong: '#d18bd5',
        grid: '#866c8c',
      },
    });
  });

  it('preserves user-customized Dream Pink colors', () => {
    const customized = {
      ...legacyDreamPink,
      tokens: { ...legacyDreamPink.tokens, canvas: '#604060' },
    };
    expect(migrateLegacyCanvasTheme(customized)).toBe(customized);
  });

  it('moves the pale-panel Dream Pink package to the unified medium-purple palette', () => {
    const palePanelTheme: CanvasTheme = {
      ...legacyDreamPink,
      version: '1.0.2',
      description: '灰紫创作画布、浅粉面板、紫粉渐变、柔光玻璃与甜心圆角组成的高对比全局风格。',
      tokens: {
        ...legacyDreamPink.tokens,
        canvas: '#49334f',
        card: '#fffaff',
        panel: '#fdf5fd',
        edge: '#aa8ab4',
        edgeStrong: '#d18bd5',
        grid: '#866c8c',
      },
    };

    expect(migrateLegacyCanvasTheme(palePanelTheme)).toMatchObject({
      version: '1.0.3',
      description: '灰紫创作画布、中紫面板、深梅工具栏、紫粉渐变与甜心圆角组成的高对比全局风格。',
      tokens: {
        card: '#b892ba',
        panel: '#8c6694',
        edge: '#6e4778',
      },
    });
  });

  it('moves the complete official 1.0.3 palette to the low-luminance 1.1.0 palette', () => {
    expect(migrateLegacyCanvasTheme(officialDreamPinkVersion103)).toMatchObject({
      version: '1.1.0',
      description: '低亮度灰紫画布与面板、莓粉强调、柔和分层与甜心圆角组成的舒适全局风格。',
      tokens: {
        canvas: '#403443',
        card: '#58435e',
        panel: '#4b3952',
        edge: '#715978',
        edgeStrong: '#a77eaa',
        accent: '#c978b6',
        grid: '#68566c',
        gridVisible: true,
        gridGap: 24,
        gridSize: 1,
        interfaceStyle: 'dream-pink',
        cursorStyle: 'system',
      },
    });
  });

  it.each(['canvas', 'card', 'panel', 'edge', 'edgeStrong', 'accent', 'grid'] as const)(
    'preserves a 1.0.3 copy whose %s color was customized',
    (token) => {
      const customized = {
        ...officialDreamPinkVersion103,
        id: `customized-${token}`,
        tokens: { ...officialDreamPinkVersion103.tokens, [token]: '#010203' },
      };

      expect(migrateLegacyCanvasTheme(customized)).toBe(customized);
    },
  );
});

describe('canvas theme installation', () => {
  beforeEach(() => {
    useCanvasThemeStore.setState({
      customThemes: [],
      globalThemeId: DEFAULT_CANVAS_THEME.id,
      projectThemeIds: {},
    });
  });

  it('reuses the stable package id when the same theme is imported repeatedly', () => {
    const imported = { ...legacyDreamPink, id: 'qiansi-dream-pink' };
    const firstId = useCanvasThemeStore.getState().addTheme(imported);
    const secondId = useCanvasThemeStore.getState().addTheme(imported);

    expect(firstId).toBe('qiansi-dream-pink');
    expect(secondId).toBe(firstId);
    expect(useCanvasThemeStore.getState().customThemes).toHaveLength(1);
  });

  it('applies the official 1.0.3 migration immediately while importing', () => {
    const id = useCanvasThemeStore.getState().addTheme(officialDreamPinkVersion103);

    expect(id).toBe('qiansi-dream-pink');
    expect(useCanvasThemeStore.getState().customThemes).toEqual([
      expect.objectContaining({
        id,
        version: '1.1.0',
        tokens: expect.objectContaining({
          canvas: '#403443',
          card: '#58435e',
          panel: '#4b3952',
          edge: '#715978',
          edgeStrong: '#a77eaa',
          accent: '#c978b6',
          grid: '#68566c',
        }),
      }),
    ]);
  });

  it('recognizes legacy random-id copies of the same package as one theme', () => {
    const firstId = useCanvasThemeStore
      .getState()
      .addTheme({ ...legacyDreamPink, id: 'theme-old-random-id' });
    const secondId = useCanvasThemeStore
      .getState()
      .addTheme({ ...legacyDreamPink, id: 'qiansi-dream-pink' });

    expect(secondId).toBe(firstId);
    expect(useCanvasThemeStore.getState().customThemes).toHaveLength(1);
  });

  it('keeps same-name themes when their actual appearance differs', () => {
    useCanvasThemeStore.getState().addTheme(legacyDreamPink);
    useCanvasThemeStore.getState().addTheme({
      ...legacyDreamPink,
      id: 'customized-dream-pink',
      tokens: { ...legacyDreamPink.tokens, accent: '#ff3366' },
    });

    expect(useCanvasThemeStore.getState().customThemes).toHaveLength(2);
  });

  it('deduplicates persisted legacy entries and maps their ids to the retained theme', () => {
    const normalized = normalizeCanvasThemeCollection([
      { ...legacyDreamPink, id: 'theme-first-import' },
      { ...legacyDreamPink, id: 'theme-second-import' },
    ]);

    expect(normalized.themes.map((theme) => theme.id)).toEqual(['theme-first-import']);
    expect(normalized.canonicalIdById.get('theme-second-import')).toBe('theme-first-import');
  });
});
