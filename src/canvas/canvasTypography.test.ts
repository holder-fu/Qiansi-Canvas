import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
const styles = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { scripts: Record<string, string> };
const fontGate = readFileSync(
  fileURLToPath(new URL('../../scripts/check-font-size-gate.mjs', import.meta.url)),
  'utf8',
);

describe('canvas typography contract', () => {
  it('scopes the readability baseline to the canvas workspace', () => {
    expect(appSource).toContain("workspace === 'home' ? '' : 'canvas-readable-typography'");
  });

  it('raises 10px interactive copy to 12px across canvas controls', () => {
    expect(styles).toMatch(
      /\.canvas-readable-typography[\s\S]*?:is\(button, select, \[role='button'\], \[role='tab'\], \[role='menuitem'\]\)[\s\S]*?font-size: 12px;[\s\S]*?line-height: 16px;/,
    );
  });

  it('documents that 8px typography is rejected by the repository gate', () => {
    expect(styles).toContain('the repository gate rejects new 8px typography');
  });

  it('runs the canvas and bundled-plugin font gate in the quality command', () => {
    expect(packageJson.scripts.quality).toContain('node scripts/check-font-size-gate.mjs');
    expect(fontGate).toContain("collectFiles(join(projectRoot, 'src'), files)");
    expect(fontGate).toContain("const installedPluginRoot = join(projectRoot, 'data', 'plugins')");
    expect(fontGate).toContain('if (existsSync(installedPluginRoot))');
    expect(fontGate).toContain('collectFiles(installedPluginRoot, files)');
    expect(fontGate).toContain('Tailwind arbitrary 8px text');
    expect(fontGate).toContain('CSS 8px font-size');
    expect(fontGate).toContain('inline 8px fontSize');
  });
});
