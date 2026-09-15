import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./SettingsPanel.tsx', import.meta.url), 'utf8');

describe('AboutSettings author support entry', () => {
  it('places the coffee action before copy version and reveals both support codes', () => {
    const supportAction = source.indexOf('settingsPage.about.supportAuthor');
    const copyAction = source.indexOf('settingsPage.about.copyVersion');

    expect(supportAction).toBeGreaterThan(-1);
    expect(copyAction).toBeGreaterThan(supportAction);
    expect(source).toContain('src={wechatSupportCode}');
    expect(source).toContain('src={kofiSupportCode}');
    expect(source).toContain('{supportOpen && (');
  });

  it('opens Ko-fi safely from the second support code and preserves the requested message', () => {
    expect(source).toContain('href="https://ko-fi.com/holder2895"');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain(
      '如果这个开源项目对你有帮助，欢迎请作者喝杯咖啡。你的支持会用于持续维护、修复问题和开发新功能。',
    );
  });

  it('keeps the unofficial-distribution notice out of the About page', () => {
    expect(source).not.toContain('settingsPage.about.unofficialDistribution');
    expect(source).not.toContain('非官方分发说明');
  });
});
