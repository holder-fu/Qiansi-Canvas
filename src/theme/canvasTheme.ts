export const CANVAS_THEME_KIND = 'qiansi-canvas-theme' as const;
export const CANVAS_THEME_SCHEMA_VERSION = 1 as const;

export type CanvasInterfaceStyle = 'qiansi' | 'studio' | 'macos' | 'dream-pink';
export type CanvasCursorStyle = 'system' | 'macos';

export type CanvasThemeTokens = {
  canvas: string;
  card: string;
  panel: string;
  edge: string;
  edgeStrong: string;
  accent: string;
  grid: string;
  gridVisible: boolean;
  gridGap: 16 | 24 | 32;
  gridSize: 1 | 1.5 | 2;
  interfaceStyle: CanvasInterfaceStyle;
  cursorStyle: CanvasCursorStyle;
};

export type CanvasTheme = {
  kind: typeof CANVAS_THEME_KIND;
  schemaVersion: typeof CANVAS_THEME_SCHEMA_VERSION;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  createdAt: string;
  builtIn?: boolean;
  tokens: CanvasThemeTokens;
};

export const DEFAULT_CANVAS_THEME: CanvasTheme = {
  kind: CANVAS_THEME_KIND,
  schemaVersion: CANVAS_THEME_SCHEMA_VERSION,
  id: 'qiansi-default-dark',
  name: '千丝默认深色',
  version: '2.0.7',
  author: 'Qiansi-Canvas',
  description: '统一的黑色创作画布、悬浮工具条、深灰面板和翠绿选中态组成的 Studio 工作台。',
  createdAt: '2026-08-12T00:00:00.000Z',
  builtIn: true,
  tokens: {
    // Protected visual baseline: changes require explicit user approval (see AGENTS.md).
    canvas: '#141414',
    card: '#191919',
    panel: '#111111',
    edge: '#1c1c1c',
    edgeStrong: '#292929',
    accent: '#57c957',
    grid: '#383838',
    gridVisible: true,
    gridGap: 16,
    gridSize: 1.5,
    interfaceStyle: 'studio',
    cursorStyle: 'system',
  },
};

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const GRID_GAPS = new Set([16, 24, 32]);
const GRID_SIZES = new Set([1, 1.5, 2]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, label: string, maxLength: number, required = true) {
  if (typeof value !== 'string') throw new Error(`${label}格式不正确。`);
  const text = value.trim();
  if ((required && !text) || text.length > maxLength) throw new Error(`${label}长度不正确。`);
  return text;
}

function safeColor(value: unknown, label: string) {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
    throw new Error(`${label}必须是 #RRGGBB 颜色。`);
  }
  return value.toLowerCase();
}

function safeChoice<T extends string>(
  value: unknown,
  fallback: T,
  choices: readonly T[],
  label: string,
) {
  const resolved = value ?? fallback;
  if (typeof resolved !== 'string' || !choices.includes(resolved as T)) {
    throw new Error(`${label}不受支持。`);
  }
  return resolved as T;
}

export function parseCanvasTheme(value: unknown): CanvasTheme {
  if (!isRecord(value)) throw new Error('风格清单不是有效对象。');
  if (value.kind !== CANVAS_THEME_KIND || value.schemaVersion !== CANVAS_THEME_SCHEMA_VERSION) {
    throw new Error('不是受支持的 Qiansi-Canvas 风格包。');
  }
  if (!isRecord(value.tokens)) throw new Error('风格令牌缺失。');
  const tokens = value.tokens;
  const gridGap = Number(tokens.gridGap);
  const gridSize = Number(tokens.gridSize);
  if (!GRID_GAPS.has(gridGap)) throw new Error('网格间距仅支持 16、24 或 32。');
  if (!GRID_SIZES.has(gridSize)) throw new Error('网格点大小不受支持。');
  if (typeof tokens.gridVisible !== 'boolean') throw new Error('网格显示设置格式不正确。');

  return {
    kind: CANVAS_THEME_KIND,
    schemaVersion: CANVAS_THEME_SCHEMA_VERSION,
    id: safeText(value.id, '风格 ID', 80),
    name: safeText(value.name, '风格名称', 60),
    version: safeText(value.version, '风格版本', 24),
    author: safeText(value.author ?? '', '作者', 60, false),
    description: safeText(value.description ?? '', '说明', 240, false),
    createdAt: safeText(value.createdAt, '创建时间', 40),
    tokens: {
      canvas: safeColor(tokens.canvas, '画布颜色'),
      card: safeColor(tokens.card, '节点颜色'),
      panel: safeColor(tokens.panel, '面板颜色'),
      edge: safeColor(tokens.edge, '边框颜色'),
      edgeStrong: safeColor(tokens.edgeStrong, '强边框颜色'),
      accent: safeColor(tokens.accent, '强调色'),
      grid: safeColor(tokens.grid, '网格颜色'),
      gridVisible: tokens.gridVisible,
      gridGap: gridGap as CanvasThemeTokens['gridGap'],
      gridSize: gridSize as CanvasThemeTokens['gridSize'],
      interfaceStyle: safeChoice(
        tokens.interfaceStyle,
        'qiansi',
        ['qiansi', 'studio', 'macos', 'dream-pink'] as const,
        '界面样式',
      ),
      cursorStyle: safeChoice(
        tokens.cursorStyle,
        'system',
        ['system', 'macos'] as const,
        '鼠标指针样式',
      ),
    },
  };
}

export function applyCanvasTheme(theme: CanvasTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--color-canvas', theme.tokens.canvas);
  root.style.setProperty('--color-card', theme.tokens.card);
  root.style.setProperty('--color-panel', theme.tokens.panel);
  root.style.setProperty('--color-edge', theme.tokens.edge);
  root.style.setProperty('--color-edge-strong', theme.tokens.edgeStrong);
  root.style.setProperty('--color-accent', theme.tokens.accent);
  root.dataset.canvasTheme = theme.id;
  root.dataset.canvasInterface = theme.tokens.interfaceStyle;
  root.dataset.canvasCursor = theme.tokens.cursorStyle;
}

export function createThemeId() {
  return `theme-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
