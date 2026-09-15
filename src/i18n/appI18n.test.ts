/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_LANGUAGES } from '../store/canvasPreferences';
import {
  applyDocumentLanguage,
  availableAppLanguages,
  englishTranslationTemplate,
  hasTranslation,
  replacePluginLanguagePacks,
  translate,
} from './appI18n';

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

function localizedUiSources(directory = SOURCE_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return localizedUiSources(path);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || entry.name.endsWith('.test.ts')) return [];
    const source = readFileSync(path, 'utf8');
    return source.includes('useAppTranslation') ? [source] : [];
  });
}

const DISPLAY_METADATA_FILES = ['../canvas/nodeTypes.ts', '../graph/nodeSpecs.ts'] as const;

function literalTranslationKeys(source: string): string[] {
  const callKeys = [...source.matchAll(/\bt\(\s*['"]([A-Za-z][A-Za-z0-9_.-]+)['"]/g)];
  const metadataKeys = [
    ...source.matchAll(
      /\b(?:labelKey|descriptionKey|localeKey|hintKey|nameKey|titleKey|ariaKey|errorKey):\s*['"]([A-Za-z][A-Za-z0-9_.-]+)['"]/g,
    ),
  ];
  return [...callKeys, ...metadataKeys].flatMap((match) => (match[1] ? [match[1]] : []));
}

const NATIVE_ESSENTIAL_KEYS = [
  'settings.title',
  'settings.language',
  'language.title',
  'language.interface',
  'language.current',
  'canvas.trash',
  'node.video.edit',
  'node.video.animatedImage',
] as const;

describe('appI18n', () => {
  it('uses the selected English pack for shared shell copy', () => {
    expect(translate('en-US', 'settings.title')).toBe('Qiansi-Canvas Settings');
    expect(translate('en-US', 'toolbar.effectsLibrary')).toBe('Effects library');
    expect(translate('zh-CN', 'home.license')).toBe('GPL-3.0-or-later');
    expect(translate('en-US', 'home.license')).toBe('GPL-3.0-or-later');
  });

  it('keeps canonical Chinese fallbacks Chinese when an English domain key exists', () => {
    expect(translate('zh-CN', 'shortcuts.action.undo', '撤销')).toBe('撤销');
    expect(translate('en-US', 'shortcuts.action.undo', '撤销')).toBe('Undo');
    expect(
      translate('zh-CN', 'shortcuts.action.expandComposer', '展开指令框（单选 / 多选共享）'),
    ).toBe('展开指令框（单选 / 多选共享）');
    expect(translate('en-US', 'shortcuts.action.expandComposer', '展开指令框')).toBe(
      'Open composer (single / shared selection)',
    );
  });

  it('labels the single-canvas workspace in both supported locales', () => {
    expect(translate('zh-CN', 'settings.canvasSave')).toBe('画布与自动保存');
    expect(translate('en-US', 'settings.canvasSave')).toBe('Canvas & autosave');
    expect(translate('zh-CN', 'home.currentCanvas')).toBe('当前画布');
    expect(translate('en-US', 'home.currentCanvas')).toBe('Current canvas');
  });

  it('defines the complete Home and project-hub copy in English', () => {
    const keys = [
      'home.newProject',
      'home.navigationLabel',
      'home.nav.home',
      'home.nav.projects',
      'home.workflowLaunchFailed',
      'home.creatingProject',
      'home.canvasLoading',
      'home.recentProjects',
      'home.recentProjectsHint',
      'home.viewAllProjects',
      'home.openRecentProject',
      'home.openingProject',
      'home.noRecentProjects',
      'home.recentProjectsLoadFailed',
      'home.recentProjectOpenFailed',
      'projects.title',
      'projects.description',
      'projects.refresh',
      'projects.newProject',
      'projects.uncategorized',
      'projects.loading',
      'projects.reload',
      'projects.empty.all',
      'projects.dialog.new.title',
      'projects.dialog.rename.title',
      'projects.dialog.deleteProject.description',
      'projects.card.openLabel',
      'projects.menu.open',
      'projects.menu.move',
      'projects.menu.delete',
      'projects.error.catalog',
      'projects.error.open',
    ];
    for (const language of APP_LANGUAGES) {
      expect(
        keys.filter((key) => !hasTranslation(language, key)),
        language,
      ).toEqual([]);
    }
    expect(translate('en-US', 'projects.title')).toBe('All projects');
    expect(translate('en-US', 'home.recentProjects')).toBe('Recently used canvases');
    expect(translate('en-US', 'header.homeTitle')).toBe('Qiansi-Canvas AI Creative Workspace');
    expect(translate('en-US', 'projects.allCount', undefined, { count: 6 })).toBe('All 6');
    expect(translate('en-US', 'projects.card.openLabel', undefined, { name: 'Demo' })).toBe(
      'Open project “Demo”',
    );
    expect(
      translate('en-US', 'projects.dialog.deleteProject.title', undefined, { name: 'Demo' }),
    ).toBe('Delete “Demo”?');
  });

  it('labels the dismissible LAN conflict notice in both supported locales', () => {
    expect(translate('zh-CN', 'header.dismissLanConflict')).toBe('关闭局域网冲突提示');
    expect(translate('en-US', 'header.dismissLanConflict')).toBe('Dismiss LAN conflict notice');
  });

  it('labels the canvas plugin picker action in both supported locales', () => {
    expect(translate('zh-CN', 'context.selectPlugin')).toBe('选择插件');
    expect(translate('en-US', 'context.selectPlugin')).toBe('Select plugin');
  });

  it('labels the custom Prompt Library section as My prompts instead of a content type', () => {
    expect(translate('zh-CN', 'library.prompt.task.script')).toBe('我的提示词');
    expect(translate('en-US', 'library.prompt.task.script')).toBe('My prompts');
    expect(translate('zh-CN', 'library.prompt.detailTitle')).toBe('提示词详情');
    expect(translate('en-US', 'library.prompt.detailTitle')).toBe('Prompt details');
    expect(translate('zh-CN', 'library.prompt.modulesEditor')).toBe('提示词模块（可选）');
    expect(translate('en-US', 'library.prompt.modulesEditor')).toBe('Prompt modules (optional)');
    expect(translate('zh-CN', 'library.prompt.addCustomModule')).toBe('新增模块');
    expect(translate('en-US', 'library.prompt.addCustomModule')).toBe('Add module');
    expect(translate('zh-CN', 'library.prompt.contentRequirement')).toBe(
      '完整提示词用于未选择模块及其他入口；模块内容可在详情中自由组合。',
    );
    expect(translate('en-US', 'library.prompt.contentRequirement')).toBe(
      'The complete prompt is used when no modules are selected and by other entry points; modules can be combined in details.',
    );
    expect(translate('zh-CN', 'library.prompt.sort.recent')).toBe('最新新增');
    expect(translate('en-US', 'library.prompt.sort.recent')).toBe('Newest added');
    expect(translate('zh-CN', 'library.effects.sort.uses')).toBe('使用次数最多');
    expect(translate('en-US', 'library.effects.sort.uses')).toBe('Most used');
  });

  it('fully localizes the Style Library editor taxonomy and guidance', () => {
    expect(translate('en-US', 'library.category.recommended')).toBe('Recommended');
    expect(translate('en-US', 'library.style.category.photography')).toBe('Photography');
    expect(translate('en-US', 'library.style.category.architecture')).toBe(
      'Architecture & interiors',
    );
    expect(translate('en-US', 'library.style.sort.uses')).toBe('Most used');
    expect(translate('en-US', 'library.style.promptPlaceholder')).toBe(
      'Enter a reusable style prompt',
    );
    expect(translate('en-US', 'library.style.promptGuide')).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it('keeps language-page labels available for both supported locales', () => {
    expect(translate('zh-CN', 'language.title')).toBe('语言');
    expect(translate('en-US', 'language.title')).toBe('Language');
  });

  it('defines the 2D Director image-task workflow copy in both supported locales', () => {
    const keys = [
      'director2d.apply.building',
      'director2d.apply.update',
      'director2d.apply.taskBusy',
      'director2d.apply.taskBusyHelp',
      'director2d.error.connectReference',
      'director2d.error.referenceRoleConflict',
      'director2d.error.duplicateIdentity',
      'director2d.error.createImageTask',
      'director2d.references.canvas',
      'director2d.references.canvasSource',
      'director2d.references.connected',
      'director2d.references.clickToConnect',
      'director2d.references.actions',
      'director2d.references.useScene',
      'director2d.references.removeScene',
      'director2d.references.addCharacter',
      'director2d.references.removeCharacter',
      'director2d.references.empty',
      'director2d.stage.aspectRatio',
      'director2d.stage.clickHint',
      'director2d.stage.sceneOptional',
      'director2d.stage.selectCharacter',
      'director2d.subject.quickPosition',
      'composer.reference.locked',
    ];

    for (const language of APP_LANGUAGES) {
      expect(
        keys.filter((key) => !hasTranslation(language, key)),
        language,
      ).toEqual([]);
    }
    expect(translate('zh-CN', 'director2d.apply.update')).toBe('更新图片生成节点');
    expect(translate('en-US', 'director2d.apply.update')).toBe('Update image generation node');
    expect(translate('zh-CN', 'composer.reference.locked')).toBe('导演参考顺序已锁定');
    expect(translate('en-US', 'composer.reference.locked')).toBe(
      'Director reference order is locked',
    );
  });

  it('defines native essential navigation for both supported locales', () => {
    expect(APP_LANGUAGES).toEqual(['zh-CN', 'en-US']);
    for (const language of APP_LANGUAGES) {
      for (const key of NATIVE_ESSENTIAL_KEYS) {
        expect(hasTranslation(language, key), `${language} is missing ${key}`).toBe(true);
      }
    }
  });

  it('synchronizes the document language contract for every locale', () => {
    for (const language of APP_LANGUAGES) {
      const root = { lang: '', dir: '', dataset: {} as { language?: string } };
      applyDocumentLanguage(root, language);
      expect(root).toEqual({ lang: language, dir: 'ltr', dataset: { language } });
    }
  });

  it('registers a complete external language without overriding built-ins', () => {
    const translations = englishTranslationTemplate();
    translations['settings.title'] = 'הגדרות Qiansi-Canvas';
    replacePluginLanguagePacks([
      {
        locale: 'he-IL',
        nativeName: 'עברית',
        direction: 'rtl',
        pluginId: 'hebrew-pack',
        pluginName: 'Hebrew Pack',
        translations,
      },
    ]);
    expect(translate('he-IL', 'settings.title')).toBe('הגדרות Qiansi-Canvas');
    expect(translate('en-US', 'settings.title')).toBe('Qiansi-Canvas Settings');
    expect(availableAppLanguages().map((item) => item.locale)).toEqual(['zh-CN', 'en-US', 'he-IL']);
    const root = { lang: '', dir: '', dataset: {} as { language?: string } };
    applyDocumentLanguage(root, 'he-IL');
    expect(root.dir).toBe('rtl');
    replacePluginLanguagePacks([]);
  });

  it('never resolves known shared copy to an empty value', () => {
    for (const language of APP_LANGUAGES) {
      expect(translate(language, 'settings.title').trim()).not.toBe('');
      expect(translate(language, 'node.video.edit').trim()).not.toBe('');
      expect(translate(language, 'asset.libraryTitle').trim()).not.toBe('');
    }
  });

  it('interpolates dynamic UI values without changing unknown placeholders', () => {
    expect(translate('en-US', 'composer.duration.seconds', undefined, { seconds: 5 })).toBe(
      '5 seconds',
    );
    expect(translate('en-US', 'trash.item.nodeCount', undefined, { kind: 'Node', count: 7 })).toBe(
      'Node · 7 nodes',
    );
    expect(translate('en-US', 'missing', 'Saved {count} of {total}', { count: 2 })).toBe(
      'Saved 2 of {total}',
    );
    expect(translate('en-US', 'missing', '{count}|{name}', { count: 0, name: '' })).toBe('0|');
  });

  it('uses the component fallback and key when a supported pack has no entry', () => {
    expect(translate('en-US', 'missing.withParams', 'Value {count}', { count: 0 })).toBe('Value 0');
    expect(translate('en-US', 'missing.withoutFallback')).toBe('missing.withoutFallback');
  });

  it('defines every dynamic high-frequency settings and editor key', () => {
    const keys = [
      ...['text', 'image', 'cli'].map((value) => `apiSettings.category.${value}`),
      ...['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map(
        (value) => `apiSettings.reasoningEffort.${value}`,
      ),
      ...['concise', 'balanced', 'detailed'].map((value) => `agent.settings.replyLength.${value}`),
      ...['precise', 'balanced', 'creative'].map((value) => `agent.settings.creativity.${value}`),
      ...['auto', 'bottom', 'top'].flatMap((value) => [
        `node.video.subtitle.${value}.label`,
        `node.video.subtitle.${value}.description`,
      ]),
      ...['preview', 'crop', 'outpaint', 'mask', 'brush', 'resize', 'grid'].flatMap((value) => [
        `imageEditor.mode.${value}.label`,
        `imageEditor.mode.${value}.title`,
        `imageEditor.mode.${value}.hint`,
      ]),
      ...['storyboard', 'texture', 'expressions', 'camera', 'design'].map(
        (value) => `imageType.category.${value}`,
      ),
      ...[
        'image',
        'video',
        'character',
        'face',
        'hair',
        'costume',
        'environment',
        'camera',
        'action',
        'light',
        'color',
      ].map((value) => `library.prompt.category.${value}`),
      ...[
        'storyboard25',
        'storyFour',
        'forward3',
        'backward5',
        'portraitTexture',
        'cinematicLight',
        'characterExpressions9',
        'expressivePortraits9',
        'panorama720',
        'multiCamera9',
        'faceViews',
        'characterSheet',
        'characterViews',
        'sceneSheet',
        'productSheet',
      ].flatMap((value) => [
        `imageType.preset.${value}.name`,
        `imageType.preset.${value}.description`,
      ]),
      ...[
        'head',
        'neck',
        'chest',
        'leftShoulder',
        'leftElbow',
        'leftWrist',
        'rightShoulder',
        'rightElbow',
        'rightWrist',
        'pelvis',
        'leftHip',
        'leftKnee',
        'leftAnkle',
        'rightHip',
        'rightKnee',
        'rightAnkle',
      ].map((value) => `pose.joint.${value}`),
    ];
    expect(keys.filter((key) => !hasTranslation('en-US', key))).toEqual([]);
  });

  it('defines English copy for every literal key used by the migrated global UI', () => {
    const missing = new Set<string>();
    const sources = [
      ...localizedUiSources(),
      ...DISPLAY_METADATA_FILES.map((relativePath) =>
        readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'),
      ),
    ];
    for (const source of sources) {
      for (const key of literalTranslationKeys(source)) {
        if (!hasTranslation('en-US', key)) missing.add(key);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
