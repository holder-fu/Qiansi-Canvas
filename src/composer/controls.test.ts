import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImageSizeMenu } from './controls';
import controlsSource from './controls.tsx?raw';
import { hasDirectorAspectRatioLock } from './directorTask';

function renderImageSizeMenu(overrides: Partial<ComponentProps<typeof ImageSizeMenu>> = {}) {
  const props: ComponentProps<typeof ImageSizeMenu> = {
    genParams: {
      viewCount: 3,
      aspectRatio: '16:9',
      quality: '2K',
      count: 2,
    },
    aspectRatioLocked: false,
    maxCount: 4,
    onQualityChange: () => {},
    onAspectRatioChange: () => {},
    onCountChange: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(createElement(ImageSizeMenu, props));
}

function settingButtons(html: string, setting: 'quality' | 'ratio' | 'count') {
  return html.match(new RegExp(`<button[^>]*data-image-setting="${setting}"[^>]*>`, 'g')) ?? [];
}

describe('ImageSizeMenu director aspect ratio lock', () => {
  it('detects the lock from the primary node director source contract', () => {
    expect(hasDirectorAspectRatioLock({ directorSourceId: 'director-2d-1' })).toBe(true);
    expect(hasDirectorAspectRatioLock({ directorSourceId: '   ' })).toBe(false);
    expect(hasDirectorAspectRatioLock(undefined)).toBe(false);
  });

  it('locks every ratio choice while keeping resolution and count controls enabled', () => {
    const html = renderImageSizeMenu({ aspectRatioLocked: true });
    const ratioButtons = settingButtons(html, 'ratio');
    const qualityButtons = settingButtons(html, 'quality');
    const countButtons = settingButtons(html, 'count');

    expect(html).toContain('data-director-ratio-lock="true"');
    expect(html).toContain('画面比例 · 16:9');
    expect(ratioButtons).toHaveLength(10);
    expect(ratioButtons.every((button) => button.includes('disabled=""'))).toBe(true);
    expect(qualityButtons).toHaveLength(3);
    expect(qualityButtons.every((button) => !button.includes('disabled=""'))).toBe(true);
    expect(countButtons).toHaveLength(3);
    expect(countButtons.every((button) => !button.includes('disabled=""'))).toBe(true);
  });

  it('keeps aspect ratio choices editable for a normal image task', () => {
    const html = renderImageSizeMenu();
    const ratioButtons = settingButtons(html, 'ratio');

    expect(html).not.toContain('data-director-ratio-lock="true"');
    expect(ratioButtons).toHaveLength(10);
    expect(ratioButtons.every((button) => !button.includes('disabled=""'))).toBe(true);
  });

  it('disables output counts above the exact selected model limit', () => {
    const html = renderImageSizeMenu({ maxCount: 1 });
    const countButtons = settingButtons(html, 'count');

    expect(countButtons[0]).not.toContain('disabled=""');
    expect(countButtons[1]).toContain('disabled=""');
    expect(countButtons[2]).toContain('disabled=""');
  });
});

describe('text mode prompt seeding', () => {
  it('writes the selected mode template into the instruction editor', () => {
    expect(controlsSource).toContain('applyTextModePrompt(state.prompt, requestedTextValue, mode)');
    expect(controlsSource).toContain('if (nextPrompt !== state.prompt) setPrompt(nextPrompt)');
  });

  it('exposes a top-right editor entry and persists the editable catalog through the store', () => {
    expect(controlsSource).toContain('TextModeEditor open={editModesOpen}');
    expect(controlsSource).toContain('composer.mode.editor.open');
  });
});

describe('video generation mode selection', () => {
  it('allows choosing a workflow before connecting its model or required references', () => {
    expect(controlsSource).toContain("setParam('mode', mode.value)");
    expect(controlsSource).not.toContain('modelAllowsVideoMode');
    expect(controlsSource).not.toContain('aria-disabled={!mode.enabled}');
    expect(controlsSource).not.toContain('if (!mode.enabled) return');
  });

  it('keeps native audio available for every selected video model', () => {
    expect(controlsSource).toContain("onClick={() => setGenParam('audio', option.value)}");
    expect(controlsSource).not.toContain('audioSupported');
    expect(controlsSource).not.toContain('composer.audio.modelUnsupported');
  });
});
