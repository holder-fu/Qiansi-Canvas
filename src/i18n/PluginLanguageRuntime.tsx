import { useEffect } from 'react';
import { pluginAssetUrl } from '../services/pluginRegistry';
import {
  APP_LANGUAGES,
  setRegisteredPluginLanguages,
  useCanvasPreferences,
} from '../store/canvasPreferences';
import { usePluginRegistryStore } from '../store/pluginRegistryStore';
import {
  englishTranslationTemplate,
  replacePluginLanguagePacks,
  type PluginLanguagePack,
} from './appI18n';
import { parsePluginLanguageFile, readBoundedLanguageResponse } from './pluginLanguageContract';

export function PluginLanguageRuntime() {
  const catalog = usePluginRegistryStore((state) => state.catalog);
  const loaded = usePluginRegistryStore((state) => state.loaded);
  const loading = usePluginRegistryStore((state) => state.loading);
  const refresh = usePluginRegistryStore((state) => state.refresh);

  useEffect(() => {
    if (!loaded && !loading) void refresh().catch(() => {});
  }, [loaded, loading, refresh]);

  useEffect(() => {
    if (!catalog) return;
    const controller = new AbortController();
    void (async () => {
      // The complete English dictionary includes Settings, canvas modules and shared dialogs.
      const englishTemplate = englishTranslationTemplate();
      const packs: PluginLanguagePack[] = [];
      const claimed = new Set<string>();
      const plugins = [...catalog.plugins].sort((a, b) =>
        a.manifest.id.localeCompare(b.manifest.id),
      );
      for (const plugin of plugins) {
        if (!plugin.enabled || !plugin.compatible) continue;
        for (const locale of plugin.manifest.contributes.locales ?? []) {
          if (claimed.has(locale.locale)) continue;
          try {
            const response = await fetch(
              pluginAssetUrl(plugin.manifest.id, locale.file, undefined, plugin.manifest.version),
              {
                signal: controller.signal,
                cache: 'no-store',
              },
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const translations = parsePluginLanguageFile(
              await readBoundedLanguageResponse(response),
              locale.locale,
              englishTemplate,
            );
            claimed.add(locale.locale);
            packs.push({
              ...locale,
              pluginId: plugin.manifest.id,
              pluginName: plugin.manifest.name,
              translations,
            });
          } catch (error) {
            if (controller.signal.aborted) return;
            console.warn(
              `[plugin-language] ${plugin.manifest.id}/${locale.locale}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }
      }
      if (controller.signal.aborted) return;
      replacePluginLanguagePacks(packs);
      const locales = packs.map((pack) => pack.locale);
      setRegisteredPluginLanguages(locales);
      const current = useCanvasPreferences.getState().language;
      if (
        !APP_LANGUAGES.includes(current as (typeof APP_LANGUAGES)[number]) &&
        !locales.includes(current)
      ) {
        useCanvasPreferences.getState().setPreference('language', 'zh-CN');
      }
    })();
    return () => controller.abort();
  }, [catalog]);

  return null;
}
