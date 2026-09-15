import { create } from 'zustand';
import {
  createThemeId,
  DEFAULT_CANVAS_THEME,
  parseCanvasTheme,
  type CanvasTheme,
  type CanvasThemeTokens,
} from '../theme/canvasTheme';

export type ThemeScope = 'global' | 'project';

type StoredThemeState = {
  customThemes: CanvasTheme[];
  globalThemeId: string;
  projectThemeIds: Record<string, string>;
};

type CanvasThemeStore = StoredThemeState & {
  addTheme: (theme: CanvasTheme) => string;
  createThemeCopy: (source: CanvasTheme, name?: string) => string;
  updateTheme: (
    id: string,
    patch: Partial<Pick<CanvasTheme, 'name' | 'author' | 'description'>> & {
      tokens?: Partial<CanvasThemeTokens>;
    },
  ) => void;
  deleteTheme: (id: string) => void;
  setActiveTheme: (id: string, scope: ThemeScope, projectId: string) => void;
};

const STORAGE_KEY = 'qiansi-canvas-themes-v1';

type NormalizedThemeCollection = {
  themes: CanvasTheme[];
  canonicalIdById: Map<string, string>;
};

function themeContentKey(theme: CanvasTheme) {
  return JSON.stringify({
    kind: theme.kind,
    schemaVersion: theme.schemaVersion,
    name: theme.name,
    version: theme.version,
    author: theme.author,
    description: theme.description,
    createdAt: theme.createdAt,
    tokens: theme.tokens,
  });
}

export function normalizeCanvasThemeCollection(
  input: readonly CanvasTheme[],
): NormalizedThemeCollection {
  const themes: CanvasTheme[] = [];
  const canonicalIdById = new Map<string, string>();
  const indexById = new Map<string, number>();
  const idByContent = new Map<string, string>();

  for (const source of input) {
    const theme = { ...source, builtIn: false };
    if (theme.id === DEFAULT_CANVAS_THEME.id) {
      canonicalIdById.set(theme.id, DEFAULT_CANVAS_THEME.id);
      continue;
    }

    const existingIndex = indexById.get(theme.id);
    if (existingIndex !== undefined) {
      themes[existingIndex] = theme;
      canonicalIdById.set(theme.id, theme.id);
      idByContent.set(themeContentKey(theme), theme.id);
      continue;
    }

    const matchingId = idByContent.get(themeContentKey(theme));
    if (matchingId) {
      canonicalIdById.set(theme.id, matchingId);
      continue;
    }

    if (themes.length >= 30) continue;
    indexById.set(theme.id, themes.length);
    idByContent.set(themeContentKey(theme), theme.id);
    canonicalIdById.set(theme.id, theme.id);
    themes.push(theme);
  }

  return { themes, canonicalIdById };
}

export function migrateLegacyCanvasTheme(theme: CanvasTheme): CanvasTheme {
  const isOriginalDreamPink =
    theme.version === '1.0.0' &&
    theme.tokens.interfaceStyle === 'dream-pink' &&
    theme.tokens.canvas === '#f8eef8' &&
    theme.tokens.edge === '#e6cce9' &&
    theme.tokens.edgeStrong === '#cfa8d6' &&
    theme.tokens.grid === '#ddc3e2';
  const workspaceTheme = isOriginalDreamPink
    ? {
        ...theme,
        version: '1.0.1',
        description:
          theme.description === '浅粉画布、紫粉渐变、柔光玻璃与甜心圆角组成的全局明亮风格。'
            ? '灰紫创作画布、浅粉面板、紫粉渐变、柔光玻璃与甜心圆角组成的高对比全局风格。'
            : theme.description,
        tokens: {
          ...theme.tokens,
          canvas: '#49334f',
          edge: '#aa8ab4',
          edgeStrong: '#d18bd5',
          grid: '#866c8c',
        },
      }
    : theme;
  const isPalePanelDreamPink =
    ['1.0.1', '1.0.2'].includes(workspaceTheme.version) &&
    workspaceTheme.tokens.interfaceStyle === 'dream-pink' &&
    workspaceTheme.tokens.canvas === '#49334f' &&
    workspaceTheme.tokens.edge === '#aa8ab4' &&
    workspaceTheme.tokens.edgeStrong === '#d18bd5' &&
    workspaceTheme.tokens.grid === '#866c8c' &&
    (isOriginalDreamPink ||
      (workspaceTheme.tokens.card === '#fffaff' && workspaceTheme.tokens.panel === '#fdf5fd'));
  const mediumPurpleTheme = isPalePanelDreamPink
    ? {
        ...workspaceTheme,
        version: '1.0.3',
        description:
          workspaceTheme.description ===
          '灰紫创作画布、浅粉面板、紫粉渐变、柔光玻璃与甜心圆角组成的高对比全局风格。'
            ? '灰紫创作画布、中紫面板、深梅工具栏、紫粉渐变与甜心圆角组成的高对比全局风格。'
            : workspaceTheme.description,
        tokens: {
          ...workspaceTheme.tokens,
          card: '#b892ba',
          panel: '#8c6694',
          edge: '#6e4778',
        },
      }
    : workspaceTheme;
  const hasOfficialVersion103ColorFingerprint =
    mediumPurpleTheme.version === '1.0.3' &&
    mediumPurpleTheme.tokens.interfaceStyle === 'dream-pink' &&
    mediumPurpleTheme.tokens.canvas === '#49334f' &&
    mediumPurpleTheme.tokens.card === '#b892ba' &&
    mediumPurpleTheme.tokens.panel === '#8c6694' &&
    mediumPurpleTheme.tokens.edge === '#6e4778' &&
    mediumPurpleTheme.tokens.edgeStrong === '#d18bd5' &&
    mediumPurpleTheme.tokens.accent === '#bd4ccb' &&
    mediumPurpleTheme.tokens.grid === '#866c8c';
  if (!hasOfficialVersion103ColorFingerprint) return mediumPurpleTheme;
  return {
    ...mediumPurpleTheme,
    version: '1.1.0',
    description:
      mediumPurpleTheme.description ===
      '灰紫创作画布、中紫面板、深梅工具栏、紫粉渐变与甜心圆角组成的高对比全局风格。'
        ? '低亮度灰紫画布与面板、莓粉强调、柔和分层与甜心圆角组成的舒适全局风格。'
        : mediumPurpleTheme.description,
    tokens: {
      ...mediumPurpleTheme.tokens,
      canvas: '#403443',
      card: '#58435e',
      panel: '#4b3952',
      edge: '#715978',
      edgeStrong: '#a77eaa',
      accent: '#c978b6',
      grid: '#68566c',
    },
  };
}

function readStoredState(): StoredThemeState {
  const fallback: StoredThemeState = {
    customThemes: [],
    globalThemeId: DEFAULT_CANVAS_THEME.id,
    projectThemeIds: {},
  };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    const record = value as Record<string, unknown>;
    const parsedThemes = Array.isArray(record.customThemes)
      ? record.customThemes.flatMap((theme) => {
          try {
            return [migrateLegacyCanvasTheme({ ...parseCanvasTheme(theme), builtIn: false })];
          } catch {
            return [];
          }
        })
      : [];
    const { themes: customThemes, canonicalIdById } = normalizeCanvasThemeCollection(parsedThemes);
    const validIds = new Set([DEFAULT_CANVAS_THEME.id, ...customThemes.map((theme) => theme.id)]);
    const requestedGlobalThemeId =
      typeof record.globalThemeId === 'string'
        ? (canonicalIdById.get(record.globalThemeId) ?? record.globalThemeId)
        : DEFAULT_CANVAS_THEME.id;
    const globalThemeId = validIds.has(requestedGlobalThemeId)
      ? requestedGlobalThemeId
      : DEFAULT_CANVAS_THEME.id;
    const projectThemeIds =
      record.projectThemeIds &&
      typeof record.projectThemeIds === 'object' &&
      !Array.isArray(record.projectThemeIds)
        ? (Object.fromEntries(
            Object.entries(record.projectThemeIds as Record<string, unknown>).flatMap(
              ([projectId, themeId]) => {
                if (projectId.length > 100 || typeof themeId !== 'string') return [];
                const canonicalId = canonicalIdById.get(themeId) ?? themeId;
                return validIds.has(canonicalId) ? [[projectId, canonicalId]] : [];
              },
            ),
          ) as Record<string, string>)
        : {};
    return { customThemes, globalThemeId, projectThemeIds };
  } catch {
    return fallback;
  }
}

function persist(state: StoredThemeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the active in-memory theme when browser storage is unavailable.
  }
}

export function resolveCanvasTheme(state: StoredThemeState, projectId: string): CanvasTheme {
  const id = state.projectThemeIds[projectId] ?? state.globalThemeId;
  return state.customThemes.find((theme) => theme.id === id) ?? DEFAULT_CANVAS_THEME;
}

export const useCanvasThemeStore = create<CanvasThemeStore>((set) => ({
  ...readStoredState(),
  addTheme: (theme) => {
    const parsedTheme = {
      ...migrateLegacyCanvasTheme(parseCanvasTheme(theme)),
      builtIn: false,
    };
    let id = parsedTheme.id;
    set((state) => {
      if (parsedTheme.id === DEFAULT_CANVAS_THEME.id) return state;
      const matchingTheme = state.customThemes.find(
        (candidate) =>
          candidate.id === parsedTheme.id ||
          themeContentKey(candidate) === themeContentKey(parsedTheme),
      );
      id = matchingTheme?.id ?? parsedTheme.id;
      if (matchingTheme && matchingTheme.id !== parsedTheme.id) return state;
      const customThemes = matchingTheme
        ? state.customThemes.map((candidate) =>
            candidate.id === parsedTheme.id ? parsedTheme : candidate,
          )
        : [...state.customThemes, parsedTheme].slice(-30);
      const next = {
        customThemes,
        globalThemeId: state.globalThemeId,
        projectThemeIds: state.projectThemeIds,
      };
      persist(next);
      return next;
    });
    return id;
  },
  createThemeCopy: (source, name) => {
    const id = createThemeId();
    set((state) => {
      const copy: CanvasTheme = {
        ...source,
        id,
        name: (name?.trim() || `${source.name} 副本`).slice(0, 60),
        author: source.builtIn ? '' : source.author,
        description: source.builtIn ? '基于千丝默认风格创建。' : source.description,
        createdAt: new Date().toISOString(),
        builtIn: false,
        tokens: { ...source.tokens },
      };
      const next = {
        customThemes: [...state.customThemes, copy].slice(-30),
        globalThemeId: state.globalThemeId,
        projectThemeIds: state.projectThemeIds,
      };
      persist(next);
      return next;
    });
    return id;
  },
  updateTheme: (id, patch) =>
    set((state) => {
      const customThemes = state.customThemes.map((theme) =>
        theme.id === id
          ? {
              ...parseCanvasTheme({
                ...theme,
                ...patch,
                name: patch.name?.trim().slice(0, 60) || theme.name,
                author:
                  patch.author === undefined ? theme.author : patch.author.trim().slice(0, 60),
                description:
                  patch.description === undefined
                    ? theme.description
                    : patch.description.trim().slice(0, 240),
                tokens: { ...theme.tokens, ...patch.tokens },
              }),
              builtIn: false,
            }
          : theme,
      );
      const next = { ...state, customThemes };
      persist(next);
      return next;
    }),
  deleteTheme: (id) =>
    set((state) => {
      if (id === DEFAULT_CANVAS_THEME.id) return state;
      const next = {
        customThemes: state.customThemes.filter((theme) => theme.id !== id),
        globalThemeId: state.globalThemeId === id ? DEFAULT_CANVAS_THEME.id : state.globalThemeId,
        projectThemeIds: Object.fromEntries(
          Object.entries(state.projectThemeIds).filter(([, themeId]) => themeId !== id),
        ),
      };
      persist(next);
      return next;
    }),
  setActiveTheme: (id, scope, projectId) =>
    set((state) => {
      const next =
        scope === 'project'
          ? { ...state, projectThemeIds: { ...state.projectThemeIds, [projectId]: id } }
          : {
              ...state,
              globalThemeId: id,
              projectThemeIds: Object.fromEntries(
                Object.entries(state.projectThemeIds).filter(([key]) => key !== projectId),
              ),
            };
      persist(next);
      return next;
    }),
}));
