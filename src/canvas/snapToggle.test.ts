import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
const styles = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');
const snapToolbarSource = appSource.slice(
  appSource.indexOf('id="bottom-snap"'),
  appSource.indexOf('id="bottom-edges"'),
);

describe('canvas node snapping toggle contract', () => {
  it('renders distinct enabled and disabled icon states', () => {
    expect(appSource).toContain("data-snap-icon={snapEnabled ? 'enabled' : 'disabled'}");
    expect(appSource).toContain('{!snapEnabled && (');
    expect(appSource).toContain('<Slash');
  });

  it('exposes the current toggle state without adding green button styling', () => {
    expect(appSource).toContain('aria-pressed={snapEnabled}');
    expect(appSource).toContain('data-neutral-pressed="true"');
    expect(appSource).toContain(
      'border border-edge bg-panel/90 text-white/[0.78] shadow-lg backdrop-blur-xl',
    );
    expect(snapToolbarSource).not.toContain('emerald-');
    expect(styles).toContain("button[aria-pressed='true']:not([data-neutral-pressed='true'])");
    expect(appSource).toContain(
      "aria-label={snapEnabled ? t('canvas.snapOn') : t('canvas.snapOff')}",
    );
  });
});
