import { describe, expect, it } from 'vitest';
import { englishTranslationTemplate } from './appI18n';
import { parsePluginLanguageFile } from './pluginLanguageContract';

describe('plugin language file contract', () => {
  const english = {
    'settings.title': 'Settings',
    'settings.count': '{count} settings',
  };

  it('accepts a complete dictionary with matching placeholders', () => {
    expect(
      parsePluginLanguageFile(
        JSON.stringify({
          locale: 'ja-JP',
          translations: {
            'settings.title': '設定',
            'settings.count': '設定 {count} 件',
          },
        }),
        'ja-JP',
        english,
      ),
    ).toEqual({ 'settings.title': '設定', 'settings.count': '設定 {count} 件' });
  });

  it('rejects incomplete packs and changed placeholders', () => {
    expect(() =>
      parsePluginLanguageFile(
        JSON.stringify({ locale: 'ja-JP', translations: { 'settings.title': '設定' } }),
        'ja-JP',
        english,
      ),
    ).toThrow(/英文内置覆盖/);
    expect(() =>
      parsePluginLanguageFile(
        JSON.stringify({
          locale: 'ja-JP',
          translations: { 'settings.title': '設定', 'settings.count': '設定 {total} 件' },
        }),
        'ja-JP',
        english,
      ),
    ).toThrow(/占位符/);
  });

  it('rejects mismatched locale and malformed documents', () => {
    expect(() =>
      parsePluginLanguageFile(
        JSON.stringify({ locale: 'ko-KR', translations: english }),
        'ja-JP',
        english,
      ),
    ).toThrow(/语言代码不一致/);
    expect(() => parsePluginLanguageFile('[]', 'ja-JP', english)).toThrow(/JSON 对象/);
  });

  it('accepts the complete built-in English template used by the downloadable example', () => {
    const translations = englishTranslationTemplate();
    expect(
      Object.keys(
        parsePluginLanguageFile(
          JSON.stringify({ locale: 'en-GB', translations }),
          'en-GB',
          translations,
        ),
      ).length,
    ).toBe(Object.keys(translations).length);
  });
});
