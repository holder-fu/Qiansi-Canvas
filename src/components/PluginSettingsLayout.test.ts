import { describe, expect, it } from 'vitest';
import settingsPanelSource from './SettingsPanel.tsx?raw';

describe('plugin settings localized layout', () => {
  it('gives the plugin directory copy a full row before wrapping long localized actions', () => {
    expect(settingsPanelSource).toContain('stacked?: boolean;');
    expect(settingsPanelSource).toContain("stacked ? 'flex-col items-stretch gap-3'");
    expect(settingsPanelSource).toContain("stacked ? 'min-w-0 w-full' : 'shrink-0'");
    expect(settingsPanelSource).toContain(
      "<SettingRow\n          stacked\n          title={t('settingsPage.plugins.localDirectory'",
    );
    expect(settingsPanelSource).toContain(
      '<div className="flex w-full flex-wrap justify-start gap-2">',
    );
  });
});
