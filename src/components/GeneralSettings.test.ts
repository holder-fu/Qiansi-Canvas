import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from './SettingsPanel.tsx?raw';

const bridgeSource = readFileSync(new URL('../../local-bridge.mjs', import.meta.url), 'utf8');

describe('general settings local library author', () => {
  it('lets the user configure the author stamped onto future library records', () => {
    expect(source).toContain('const userName = useCanvasPreferences((state) => state.userName)');
    expect(source).toContain("t('general.profile', '资料作者')");
    expect(source).toContain("setPreference('userName', normalizeUserName(event.target.value))");
    expect(source).toContain('markConfiguredUserNameEdited()');
    expect(source).toContain('persistConfiguredUserName(event.target.value)');
    expect(source).toContain('maxLength={60}');
    expect(source).toContain("t('general.userNamePlaceholder', '输入显示名称')");
  });

  it('keeps language settings limited to the built-in language selector', () => {
    expect(source).toContain('function LanguageSettings() {');
    expect(source).not.toContain('parsePluginLanguageFile');
    expect(source).not.toContain('registerImportedLanguagePack');
    expect(source).not.toContain("t('language.importTitle')");
    expect(source).not.toContain('accept="application/json,.json"');
  });

  it('exposes bounded request and batch controls backed by the live Bridge', () => {
    expect(source).toContain("t('general.requestCapacity', '请求与并发容量')");
    expect(source).toContain("t('general.batchGeneration', '批量生成')");
    for (const key of [
      'requestRateLimit',
      'generationConcurrency',
      'uploadConcurrency',
      'updateConcurrency',
      'imageBatchSize',
      'imageGenerationConcurrency',
      'videoGenerationConcurrency',
    ]) {
      expect(source).toContain(`'${key}'`);
    }
    expect(source).toContain('persistGenerationLimits()');
    expect(source).toContain('GENERATION_LIMIT_RANGES[key].min');
    expect(bridgeSource).toContain("url.pathname === '/settings/generation-limits'");
    expect(bridgeSource).toContain('bridgeRequestGate.configure(limits)');
  });
});
