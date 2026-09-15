import { describe, expect, it } from 'vitest';
import {
  APP_LANGUAGES,
  DEFAULT_CANVAS_PREFERENCES,
  normalizeAppLanguage,
  normalizeDefaultZoom,
  normalizeGenerationSoundVolume,
  normalizeGenerationLimitPreferences,
  normalizeMiniMapPosition,
  normalizeUserName,
} from './canvasPreferences';

describe('local library author preference', () => {
  it('starts empty and limits unsafe or oversized names', () => {
    expect(DEFAULT_CANVAS_PREFERENCES.userName).toBe('');
    expect(normalizeUserName('老\u0000树苗')).toBe('老树苗');
    expect(normalizeUserName('a'.repeat(80))).toHaveLength(60);
    expect(normalizeUserName(null)).toBe('');
  });
});

describe('startup destination preference', () => {
  it('opens the workbench home by default', () => {
    expect(DEFAULT_CANVAS_PREFERENCES.startupTarget).toBe('home');
  });
});

describe('move-to-trash confirmation preference', () => {
  it('asks for confirmation by default', () => {
    expect(DEFAULT_CANVAS_PREFERENCES.confirmMoveToTrash).toBe(true);
  });
});

describe('default canvas zoom preference', () => {
  it('keeps freely entered zoom values', () => {
    expect(normalizeDefaultZoom(0.637)).toBe(0.637);
    expect(normalizeDefaultZoom(2.345)).toBe(2.345);
  });

  it('clamps zoom to the canvas-supported range', () => {
    expect(normalizeDefaultZoom(0.01)).toBe(0.1);
    expect(normalizeDefaultZoom(9)).toBe(5);
  });

  it('falls back for invalid stored values', () => {
    expect(normalizeDefaultZoom(Number.NaN)).toBe(1);
    expect(normalizeDefaultZoom('75')).toBe(1);
  });
});

describe('application language preference', () => {
  it('defaults to Simplified Chinese and accepts the Chinese and English packs', () => {
    expect(DEFAULT_CANVAS_PREFERENCES.language).toBe('zh-CN');
    expect(APP_LANGUAGES).toEqual(['zh-CN', 'en-US']);
    for (const language of APP_LANGUAGES) {
      expect(normalizeAppLanguage(language)).toBe(language);
    }
  });

  it('falls back safely for unsupported stored language values', () => {
    expect(normalizeAppLanguage('zh-TW')).toBe('zh-CN');
    expect(normalizeAppLanguage('ja-JP')).toBe('zh-CN');
    expect(normalizeAppLanguage(null)).toBe('zh-CN');
  });
});

describe('generation sound preference', () => {
  it('keeps valid stored volume values', () => {
    expect(normalizeGenerationSoundVolume(0.42)).toBe(0.42);
  });

  it('clamps or falls back for invalid volume values', () => {
    expect(normalizeGenerationSoundVolume(-1)).toBe(0);
    expect(normalizeGenerationSoundVolume(2)).toBe(1);
    expect(normalizeGenerationSoundVolume('60')).toBe(0.35);
  });
});

describe('request and batch generation preferences', () => {
  it('keeps the requested defaults', () => {
    expect(DEFAULT_CANVAS_PREFERENCES).toMatchObject({
      requestRateLimit: 3_000,
      generationConcurrency: 5,
      uploadConcurrency: 2,
      updateConcurrency: 1,
      imageBatchSize: 20,
      imageGenerationConcurrency: 5,
      videoGenerationConcurrency: 5,
    });
  });

  it('clamps stored values to the shared safety contract', () => {
    expect(
      normalizeGenerationLimitPreferences({
        requestRateLimit: 50_000,
        generationConcurrency: 0,
        uploadConcurrency: 3,
        updateConcurrency: 2,
        imageBatchSize: 27,
        imageGenerationConcurrency: 9,
        videoGenerationConcurrency: 8,
      }),
    ).toEqual({
      requestRateLimit: 20_000,
      generationConcurrency: 1,
      uploadConcurrency: 3,
      updateConcurrency: 2,
      imageBatchSize: 27,
      imageGenerationConcurrency: 9,
      videoGenerationConcurrency: 5,
    });
  });
});

describe('canvas minimap position preference', () => {
  it('defaults to the lower-left corner', () => {
    expect(DEFAULT_CANVAS_PREFERENCES.miniMapPosition).toBe('bottom-left');
  });

  it('keeps all supported positions and rejects invalid stored values', () => {
    expect(normalizeMiniMapPosition('bottom-left')).toBe('bottom-left');
    expect(normalizeMiniMapPosition('bottom-center')).toBe('bottom-center');
    expect(normalizeMiniMapPosition('bottom-right')).toBe('bottom-right');
    expect(normalizeMiniMapPosition('top-left')).toBe('bottom-left');
  });
});
