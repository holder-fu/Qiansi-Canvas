import { create } from 'zustand';
import {
  DEFAULT_GENERATION_LIMITS,
  normalizeGenerationLimits,
} from '../lib/generationLimitsContract.mjs';

export type StartupTarget = 'home' | 'last-session';
export const APP_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type BuiltInAppLanguage = (typeof APP_LANGUAGES)[number];
export type AppLanguage = string;
export type AutosaveDelay = 400 | 1000 | 3000;
export type WheelMode = 'zoom' | 'pan';
export type DefaultZoom = number;
export type MiniMapPosition = 'bottom-left' | 'bottom-center' | 'bottom-right';
export const MIN_DEFAULT_ZOOM = 0.1;
export const MAX_DEFAULT_ZOOM = 5;
export type GridGap = 16 | 24 | 32;
export type GridTone = 'subtle' | 'balanced' | 'strong';
export type ToolbarMode = 'visible' | 'auto-hide' | 'hidden';
export type GenerationSoundKind = 'image' | 'video' | 'audio' | 'text';
export type GenerationLimitPreferences = {
  requestRateLimit: number;
  generationConcurrency: number;
  uploadConcurrency: number;
  updateConcurrency: number;
  imageBatchSize: number;
  imageGenerationConcurrency: number;
  videoGenerationConcurrency: number;
};
export type GenerationLimitKey = keyof GenerationLimitPreferences;
export const MIN_GENERATION_SOUND_VOLUME = 0;
export const MAX_GENERATION_SOUND_VOLUME = 1;
export const TOOLBAR_CONTROL_IDS = [
  'top-project',
  'top-undo',
  'top-redo',
  'top-group',
  'top-ai-skill',
  'bottom-assets',
  'bottom-snap',
  'bottom-edges',
  'bottom-search',
  'bottom-layers',
  'bottom-fullscreen',
  'bottom-zoom-menu',
  'bottom-style-library',
  'bottom-effects-library',
  'bottom-character-library',
  'bottom-prompt-library',
  'bottom-zoom-out',
  'bottom-zoom-in',
  'bottom-fit-view',
  'bottom-reset-view',
  'bottom-shortcuts',
  'bottom-trash',
] as const;
export type ToolbarControlId = (typeof TOOLBAR_CONTROL_IDS)[number];
export type ToolbarModes = Record<ToolbarControlId, ToolbarMode>;

export type CanvasPreferences = GenerationLimitPreferences & {
  language: AppLanguage;
  userName: string;
  startupTarget: StartupTarget;
  autosaveDelay: AutosaveDelay;
  snapEnabled: boolean;
  edgesVisible: boolean;
  wheelMode: WheelMode;
  defaultZoom: DefaultZoom;
  miniMapPosition: MiniMapPosition;
  gridVisible: boolean;
  gridGap: GridGap;
  gridTone: GridTone;
  editingShortcutsEnabled: boolean;
  deleteShortcutEnabled: boolean;
  confirmMoveToTrash: boolean;
  generationSoundEnabled: boolean;
  generationSoundVolume: number;
  imageGenerationSoundEnabled: boolean;
  videoGenerationSoundEnabled: boolean;
  audioGenerationSoundEnabled: boolean;
  textGenerationSoundEnabled: boolean;
  imageGenerationSound: string;
  videoGenerationSound: string;
  audioGenerationSound: string;
  textGenerationSound: string;
  toolbarModes: ToolbarModes;
};

type CanvasPreferencesStore = CanvasPreferences & {
  setPreference: <Key extends keyof CanvasPreferences>(
    key: Key,
    value: CanvasPreferences[Key],
  ) => void;
  setToolbarMode: (id: ToolbarControlId, mode: ToolbarMode) => void;
};

const STORAGE_KEY = 'qiansi-canvas-preferences-v1';
const PLUGIN_LANGUAGE_STORAGE_KEY = 'qiansi-canvas-plugin-languages-v1';
const IMPORTED_LANGUAGE_STORAGE_KEY = 'qiansi-canvas-imported-languages-v1';

const DEFAULT_TOOLBAR_MODES = Object.fromEntries(
  TOOLBAR_CONTROL_IDS.map((id) => [id, 'visible']),
) as ToolbarModes;

export const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = {
  ...(DEFAULT_GENERATION_LIMITS as GenerationLimitPreferences),
  language: 'zh-CN',
  userName: '',
  startupTarget: 'home',
  autosaveDelay: 400,
  snapEnabled: true,
  edgesVisible: true,
  wheelMode: 'zoom',
  defaultZoom: 1,
  miniMapPosition: 'bottom-left',
  gridVisible: true,
  gridGap: 16,
  gridTone: 'balanced',
  editingShortcutsEnabled: true,
  deleteShortcutEnabled: true,
  confirmMoveToTrash: true,
  generationSoundEnabled: false,
  generationSoundVolume: 0.35,
  imageGenerationSoundEnabled: true,
  videoGenerationSoundEnabled: true,
  audioGenerationSoundEnabled: true,
  textGenerationSoundEnabled: true,
  imageGenerationSound: 'image-complete.wav',
  videoGenerationSound: 'video-complete.wav',
  audioGenerationSound: 'audio-complete.wav',
  textGenerationSound: 'text-complete.wav',
  toolbarModes: DEFAULT_TOOLBAR_MODES,
};

const STARTUP_TARGETS = new Set<StartupTarget>(['home', 'last-session']);
const APP_LANGUAGE_SET = new Set<string>(APP_LANGUAGES);
const AUTOSAVE_DELAYS = new Set<AutosaveDelay>([400, 1000, 3000]);
const WHEEL_MODES = new Set<WheelMode>(['zoom', 'pan']);
const MINI_MAP_POSITIONS = new Set<MiniMapPosition>([
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);
const GRID_GAPS = new Set<GridGap>([16, 24, 32]);
const GRID_TONES = new Set<GridTone>(['subtle', 'balanced', 'strong']);
const TOOLBAR_MODES = new Set<ToolbarMode>(['visible', 'auto-hide', 'hidden']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeDefaultZoom(value: unknown): DefaultZoom {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CANVAS_PREFERENCES.defaultZoom;
  }
  return Math.round(Math.min(MAX_DEFAULT_ZOOM, Math.max(MIN_DEFAULT_ZOOM, value)) * 1000) / 1000;
}

export function normalizeGenerationSoundVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CANVAS_PREFERENCES.generationSoundVolume;
  }
  return (
    Math.round(
      Math.min(MAX_GENERATION_SOUND_VOLUME, Math.max(MIN_GENERATION_SOUND_VOLUME, value)) * 100,
    ) / 100
  );
}

export function normalizeMiniMapPosition(value: unknown): MiniMapPosition {
  return MINI_MAP_POSITIONS.has(value as MiniMapPosition)
    ? (value as MiniMapPosition)
    : DEFAULT_CANVAS_PREFERENCES.miniMapPosition;
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
  const language = typeof value === 'string' ? value.trim() : '';
  return APP_LANGUAGE_SET.has(language) || readRegisteredPluginLanguages().includes(language)
    ? language
    : DEFAULT_CANVAS_PREFERENCES.language;
}

export function normalizeUserName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .slice(0, 60);
}

export function normalizeGenerationLimitPreferences(value: unknown): GenerationLimitPreferences {
  return normalizeGenerationLimits(value) as GenerationLimitPreferences;
}

export function readGenerationLimitPreferences(): GenerationLimitPreferences {
  return normalizeGenerationLimitPreferences(readCanvasPreferences());
}

/** Author name stamped onto newly created local library records. */
export function readConfiguredUserName(): string | undefined {
  const name = readCanvasPreferences().userName.trim().replace(/\s+/gu, ' ');
  return name || undefined;
}

export function readRegisteredPluginLanguages(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const sources = [PLUGIN_LANGUAGE_STORAGE_KEY, IMPORTED_LANGUAGE_STORAGE_KEY].flatMap((key) => {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    });
    return sources
      .filter((item): item is string => typeof item === 'string')
      .flatMap((item) => {
        try {
          const [canonical] = Intl.getCanonicalLocales(item.trim());
          return canonical && canonical.length <= 35 ? [canonical] : [];
        } catch {
          return [];
        }
      })
      .filter(
        (item, index, values) =>
          item && !APP_LANGUAGE_SET.has(item) && values.indexOf(item) === index,
      )
      .slice(0, 24);
  } catch {
    return [];
  }
}

export function setRegisteredPluginLanguages(languages: string[]) {
  if (typeof localStorage === 'undefined') return;
  const clean = languages
    .flatMap((item) => {
      try {
        const [canonical] = Intl.getCanonicalLocales(item.trim());
        return canonical && canonical.length <= 35 ? [canonical] : [];
      } catch {
        return [];
      }
    })
    .filter(
      (item, index, values) =>
        item && !APP_LANGUAGE_SET.has(item) && values.indexOf(item) === index,
    )
    .slice(0, 24);
  try {
    localStorage.setItem(PLUGIN_LANGUAGE_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Language registration remains usable for the current session.
  }
}

/** Keeps imported user language packs registered independently from plugins. */
export function setRegisteredImportedLanguages(languages: string[]) {
  if (typeof localStorage === 'undefined') return;
  const clean = languages
    .flatMap((item) => {
      try {
        const [canonical] = Intl.getCanonicalLocales(item.trim());
        return canonical && canonical.length <= 35 ? [canonical] : [];
      } catch {
        return [];
      }
    })
    .filter(
      (item, index, values) =>
        item && !APP_LANGUAGE_SET.has(item) && values.indexOf(item) === index,
    )
    .slice(0, 24);
  try {
    localStorage.setItem(IMPORTED_LANGUAGE_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Imported language registration remains usable for the current session.
  }
}

function readToolbarModes(parsed: Record<string, unknown>): ToolbarModes {
  const storedModes = isRecord(parsed.toolbarModes) ? parsed.toolbarModes : {};
  const legacyTopMode = TOOLBAR_MODES.has(parsed.topToolbarMode as ToolbarMode)
    ? (parsed.topToolbarMode as ToolbarMode)
    : 'visible';
  const legacyBottomMode = TOOLBAR_MODES.has(parsed.bottomToolbarMode as ToolbarMode)
    ? (parsed.bottomToolbarMode as ToolbarMode)
    : 'visible';
  return Object.fromEntries(
    TOOLBAR_CONTROL_IDS.map((id) => {
      const storedMode = storedModes[id];
      if (TOOLBAR_MODES.has(storedMode as ToolbarMode)) return [id, storedMode as ToolbarMode];
      return [id, id.startsWith('top-') ? legacyTopMode : legacyBottomMode];
    }),
  ) as ToolbarModes;
}

export function readCanvasPreferences(): CanvasPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_CANVAS_PREFERENCES };
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!isRecord(parsed)) return { ...DEFAULT_CANVAS_PREFERENCES };
    return {
      ...normalizeGenerationLimitPreferences(parsed),
      language: normalizeAppLanguage(parsed.language),
      userName: normalizeUserName(parsed.userName),
      startupTarget: STARTUP_TARGETS.has(parsed.startupTarget as StartupTarget)
        ? (parsed.startupTarget as StartupTarget)
        : DEFAULT_CANVAS_PREFERENCES.startupTarget,
      autosaveDelay: AUTOSAVE_DELAYS.has(parsed.autosaveDelay as AutosaveDelay)
        ? (parsed.autosaveDelay as AutosaveDelay)
        : DEFAULT_CANVAS_PREFERENCES.autosaveDelay,
      snapEnabled:
        typeof parsed.snapEnabled === 'boolean'
          ? parsed.snapEnabled
          : DEFAULT_CANVAS_PREFERENCES.snapEnabled,
      edgesVisible:
        typeof parsed.edgesVisible === 'boolean'
          ? parsed.edgesVisible
          : DEFAULT_CANVAS_PREFERENCES.edgesVisible,
      wheelMode: WHEEL_MODES.has(parsed.wheelMode as WheelMode)
        ? (parsed.wheelMode as WheelMode)
        : DEFAULT_CANVAS_PREFERENCES.wheelMode,
      defaultZoom: normalizeDefaultZoom(parsed.defaultZoom),
      miniMapPosition: normalizeMiniMapPosition(parsed.miniMapPosition),
      gridVisible:
        typeof parsed.gridVisible === 'boolean'
          ? parsed.gridVisible
          : DEFAULT_CANVAS_PREFERENCES.gridVisible,
      gridGap: GRID_GAPS.has(parsed.gridGap as GridGap)
        ? (parsed.gridGap as GridGap)
        : DEFAULT_CANVAS_PREFERENCES.gridGap,
      gridTone: GRID_TONES.has(parsed.gridTone as GridTone)
        ? (parsed.gridTone as GridTone)
        : DEFAULT_CANVAS_PREFERENCES.gridTone,
      editingShortcutsEnabled:
        typeof parsed.editingShortcutsEnabled === 'boolean'
          ? parsed.editingShortcutsEnabled
          : DEFAULT_CANVAS_PREFERENCES.editingShortcutsEnabled,
      deleteShortcutEnabled:
        typeof parsed.deleteShortcutEnabled === 'boolean'
          ? parsed.deleteShortcutEnabled
          : DEFAULT_CANVAS_PREFERENCES.deleteShortcutEnabled,
      confirmMoveToTrash:
        typeof parsed.confirmMoveToTrash === 'boolean'
          ? parsed.confirmMoveToTrash
          : DEFAULT_CANVAS_PREFERENCES.confirmMoveToTrash,
      generationSoundEnabled:
        typeof parsed.generationSoundEnabled === 'boolean'
          ? parsed.generationSoundEnabled
          : DEFAULT_CANVAS_PREFERENCES.generationSoundEnabled,
      generationSoundVolume: normalizeGenerationSoundVolume(parsed.generationSoundVolume),
      imageGenerationSoundEnabled:
        typeof parsed.imageGenerationSoundEnabled === 'boolean'
          ? parsed.imageGenerationSoundEnabled
          : DEFAULT_CANVAS_PREFERENCES.imageGenerationSoundEnabled,
      videoGenerationSoundEnabled:
        typeof parsed.videoGenerationSoundEnabled === 'boolean'
          ? parsed.videoGenerationSoundEnabled
          : DEFAULT_CANVAS_PREFERENCES.videoGenerationSoundEnabled,
      audioGenerationSoundEnabled:
        typeof parsed.audioGenerationSoundEnabled === 'boolean'
          ? parsed.audioGenerationSoundEnabled
          : DEFAULT_CANVAS_PREFERENCES.audioGenerationSoundEnabled,
      textGenerationSoundEnabled:
        typeof parsed.textGenerationSoundEnabled === 'boolean'
          ? parsed.textGenerationSoundEnabled
          : DEFAULT_CANVAS_PREFERENCES.textGenerationSoundEnabled,
      imageGenerationSound:
        typeof parsed.imageGenerationSound === 'string' && parsed.imageGenerationSound.length <= 180
          ? parsed.imageGenerationSound
          : DEFAULT_CANVAS_PREFERENCES.imageGenerationSound,
      videoGenerationSound:
        typeof parsed.videoGenerationSound === 'string' && parsed.videoGenerationSound.length <= 180
          ? parsed.videoGenerationSound
          : DEFAULT_CANVAS_PREFERENCES.videoGenerationSound,
      audioGenerationSound:
        typeof parsed.audioGenerationSound === 'string' && parsed.audioGenerationSound.length <= 180
          ? parsed.audioGenerationSound
          : DEFAULT_CANVAS_PREFERENCES.audioGenerationSound,
      textGenerationSound:
        typeof parsed.textGenerationSound === 'string' && parsed.textGenerationSound.length <= 180
          ? parsed.textGenerationSound
          : DEFAULT_CANVAS_PREFERENCES.textGenerationSound,
      toolbarModes: readToolbarModes(parsed),
    };
  } catch {
    return { ...DEFAULT_CANVAS_PREFERENCES };
  }
}

export function writeCanvasPreferences(patch: Partial<CanvasPreferences>): CanvasPreferences {
  const next = { ...readCanvasPreferences(), ...patch };
  Object.assign(next, normalizeGenerationLimitPreferences(next));
  next.userName = normalizeUserName(next.userName);
  next.defaultZoom = normalizeDefaultZoom(next.defaultZoom);
  next.miniMapPosition = normalizeMiniMapPosition(next.miniMapPosition);
  next.generationSoundVolume = normalizeGenerationSoundVolume(next.generationSoundVolume);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The in-memory setting remains usable when browser storage is unavailable.
    }
  }
  return next;
}

export const useCanvasPreferences = create<CanvasPreferencesStore>((set) => ({
  ...readCanvasPreferences(),
  setPreference: (key, value) => {
    const next = writeCanvasPreferences({ [key]: value });
    set({ [key]: next[key] } as Pick<CanvasPreferencesStore, typeof key>);
  },
  setToolbarMode: (id, mode) =>
    set((state) => {
      const toolbarModes = { ...state.toolbarModes, [id]: mode };
      writeCanvasPreferences({ toolbarModes });
      return { toolbarModes };
    }),
}));
