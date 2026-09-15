import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');
const dreamPinkStart = styles.indexOf("html[data-canvas-interface='dream-pink']");
const studioStart = styles.indexOf("html[data-canvas-interface='studio']", dreamPinkStart);
const dreamPinkStyles = styles.slice(dreamPinkStart, studioStart === -1 ? undefined : studioStart);

const EXPECTED_PALETTE = {
  text: '#f4eaf4',
  muted: '#d7c4d7',
  subtle: '#cbb5cd',
  overlay: '#423249',
  control: '#604b64',
  'primary-action': '#97488c',
} as const;

type DreamPaletteKey = keyof typeof EXPECTED_PALETTE;

const PALETTE_VARIABLES: Record<DreamPaletteKey, string> = {
  text: 'ink',
  muted: 'muted',
  subtle: 'subtle',
  overlay: 'surface-overlay',
  control: 'surface-control',
  'primary-action': 'action-primary',
};

const REQUIRED_SURFACE_SELECTORS = [
  ['context menu', '.context-menu-surface'],
  ['workspace switcher', "[data-theme-role='workspace-switcher']"],
  ['workspace menu', "[data-theme-role='workspace-menu']"],
  ['modal backdrop', "[data-theme-role='modal-backdrop']"],
  ['modal surface', "[data-theme-role='modal-surface']"],
  ['modal titlebar', "[data-theme-role='modal-titlebar']"],
  ['modal content', "[data-theme-role='modal-content']"],
  ['home sidebar', "[data-theme-role='home-sidebar']"],
  ['home card', "[data-theme-role='home-card']"],
  ['home compact card', "[data-theme-role='home-compact-card']"],
  ['asset panel', "[data-theme-role='asset-panel']"],
  ['asset category menu', "[data-theme-role='asset-category-menu']"],
  ['settings brand icon', "[data-theme-role='settings-brand-icon']"],
  ['settings navigation item', "[data-theme-role='settings-nav-item']"],
  ['settings choice', "[data-theme-role='settings-choice']"],
  ['settings section', "[data-theme-role='settings-section']"],
  ['settings section surface', "[data-theme-role='settings-section-surface']"],
  ['settings row', "[data-theme-role='settings-row']"],
  ['settings toggle', "[data-theme-role='settings-toggle']"],
  ['library toolbar', "[data-theme-role='library-toolbar']"],
  ['library filter bar', "[data-theme-role='library-filterbar']"],
  ['library sidebar', "[data-theme-role='library-sidebar']"],
  ['library categories', "[data-theme-role='library-categories']"],
  ['library category', "[data-theme-role='library-category']"],
  ['library card', "[data-theme-role='library-card']"],
  ['library preview', "[data-theme-role='library-preview']"],
  ['popover surface', "[data-theme-role='popover-surface']"],
  ['project card', "[data-theme-role='project-card']"],
] as const;

function dreamPinkRootDeclarations() {
  const match = dreamPinkStyles.match(
    /html\[data-canvas-interface='dream-pink'\]\s*\{([\s\S]*?)\}/,
  );
  if (!match?.[1]) throw new Error('Dream Pink root declarations are missing from index.css.');
  return match[1];
}

function readPaletteColor(key: DreamPaletteKey) {
  const variable = PALETTE_VARIABLES[key];
  const match = dreamPinkRootDeclarations().match(
    new RegExp(`--dream-${variable}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'),
  );
  if (!match?.[1]) throw new Error(`Dream Pink semantic color --dream-${variable} is missing.`);
  return match[1].toLowerCase();
}

function relativeLuminance(color: string) {
  const channels = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map(
    (channel) => Number.parseInt(channel, 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe('Dream Pink visual contract', () => {
  it('uses the approved low-glare dark semantic palette', () => {
    expect(dreamPinkStart).toBeGreaterThanOrEqual(0);
    expect(dreamPinkRootDeclarations()).toMatch(/\bcolor-scheme:\s*dark\s*;/);

    for (const [key, expected] of Object.entries(EXPECTED_PALETTE)) {
      expect(readPaletteColor(key as DreamPaletteKey)).toBe(expected);
    }
  });

  it.each(REQUIRED_SURFACE_SELECTORS)('explicitly themes the %s', (_label, selector) => {
    expect(dreamPinkStyles.includes(selector)).toBe(true);
  });

  it('rounds the visible modal layers inside the Dream Pink window border', () => {
    expect(dreamPinkStyles).toMatch(
      /\[data-theme-role='modal-surface'\]:not\(\.rounded-none\)\s*>\s*\[data-theme-role='modal-titlebar'\]\s*\{[^}]*border-radius:\s*21px\s+21px\s+0\s+0\s*;/,
    );
    expect(dreamPinkStyles).toMatch(
      /\[data-theme-role='modal-surface'\]:not\(\.rounded-none\)\s*>\s*\[data-theme-role='modal-content'\]\s*\{[^}]*border-radius:\s*0\s+0\s+21px\s+21px\s*;/,
    );
  });

  it.each([
    ['primary text on overlays', 'text', 'overlay'],
    ['secondary text on overlays', 'muted', 'overlay'],
    ['small supporting text on overlays', 'subtle', 'overlay'],
    ['primary text on controls', 'text', 'control'],
    ['secondary text on controls', 'muted', 'control'],
    ['primary action labels', 'text', 'primary-action'],
  ] as const)('%s keeps at least 4.5:1 contrast', (_label, foreground, background) => {
    expect(
      contrastRatio(readPaletteColor(foreground), readPaletteColor(background)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
