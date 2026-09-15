import { parsePluginAudioGeneratorContribution } from './plugin-audio-proxy.mjs';
import { compareUpdateVersions } from './system-update-contract.mjs';

const ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const VERSION_RE = /^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/;
const ENGINE_VERSION_RE = /^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const ASSET_TYPES = new Set(['image', 'video', 'audio', 'text', 'reference', 'any']);
const PET_ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(?:png|jpe?g|webp)$/i;
const RUNTIME_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(?:m?js)$/i;
const PLUGIN_ASSET_RE =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|mp4|webm|glb|gltf|bin|wasm|json|txt|md|css)$/i;
const HOST_NODE_KINDS = new Set([
  'plugin',
  'text',
  'image',
  'video',
  'audio',
  'director-2d',
  'director-3d',
]);
const PLUGIN_PERMISSIONS = new Set([
  'canvas:add-node',
  'canvas:create-project-graph',
  'canvas:update-own-node',
  'canvas:read-selection',
  'canvas:notify',
  'canvas:read-own-inputs',
  'canvas:read-own-image',
  'assets:read',
  'styles:manage-samples',
  'audio:generate',
  'audio:reference-library',
  'audio:install',
  'storage:preferences',
  'storage:project-documents',
  'storage:shared-style-covers',
  'models:use-text',
  'models:use-media',
  'media:transform',
  'vision:pose',
  'vision:install',
]);
const PANEL_POSITIONS = new Set(['left', 'right', 'bottom', 'floating', 'fullscreen']);
const BUILT_IN_LOCALES = new Set(['zh-CN', 'en-US']);
const LOCALE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.json$/i;

function canonicalLocale(value) {
  const locale = String(value || '').trim();
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    if (!canonical || canonical.length > 35) throw new Error();
    return canonical;
  } catch {
    throw new Error(`语言代码无效：${locale || '空'}。`);
  }
}

function shortText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength)
    throw new Error(`${label}不能为空且不能超过 ${maxLength} 个字符。`);
  return text;
}

function pluginId(value, label) {
  const id = String(value || '').trim();
  if (!ID_RE.test(id)) throw new Error(`${label}必须是小写字母开头的字母、数字或连字符。`);
  return id;
}

function assetType(value, fallback = 'any') {
  const normalized = String(value || fallback).trim();
  if (!ASSET_TYPES.has(normalized)) throw new Error(`不支持的端口类型：${normalized}。`);
  return normalized;
}

export function parsePluginManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('插件清单不是有效对象。');
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error('插件清单版本不受支持。');
  }
  const schemaVersion = value.schemaVersion;
  if (value.scripts || value.executable) {
    throw new Error('插件不能声明系统脚本或可执行程序。');
  }
  if (schemaVersion === 1 && value.runtime) {
    throw new Error('v1 插件不支持运行时代码，请升级到 schemaVersion 2。');
  }
  const id = pluginId(value.id, '插件 ID');
  const version = String(value.version || '').trim();
  if (!VERSION_RE.test(version)) throw new Error('插件版本号格式不正确。');
  let runtime;
  if (schemaVersion === 2 && value.runtime != null) {
    if (!value.runtime || typeof value.runtime !== 'object' || Array.isArray(value.runtime)) {
      throw new Error('插件 runtime 定义无效。');
    }
    const entry = String(value.runtime.entry || '').trim();
    if (!RUNTIME_FILE_RE.test(entry)) throw new Error('插件运行时入口必须是同目录的 JS 文件。');
    if (value.runtime.apiVersion !== 1 && value.runtime.apiVersion !== 2) {
      throw new Error('插件运行时 API 版本不受支持。');
    }
    runtime = { entry, apiVersion: value.runtime.apiVersion };
  }
  const rawPermissions =
    schemaVersion === 2 && Array.isArray(value.permissions) ? value.permissions : [];
  const permissions = [...new Set(rawPermissions.map((item) => String(item || '').trim()))];
  for (const permission of permissions) {
    if (!PLUGIN_PERMISSIONS.has(permission)) throw new Error(`不支持的插件权限：${permission}。`);
  }
  const rawAssets = schemaVersion === 2 && Array.isArray(value.assets) ? value.assets : [];
  const assets = [...new Set(rawAssets.map((item) => String(item || '').trim()))];
  for (const asset of assets) {
    if (!PLUGIN_ASSET_RE.test(asset)) throw new Error(`插件素材文件名无效：${asset}。`);
  }
  const rawAudioGenerators =
    schemaVersion === 2 && Array.isArray(value.contributes?.audioGenerators)
      ? value.contributes.audioGenerators
      : [];
  const seenAudioGeneratorIds = new Set();
  const audioGenerators = rawAudioGenerators.slice(0, 8).map((item) => {
    const generator = parsePluginAudioGeneratorContribution(item);
    if (seenAudioGeneratorIds.has(generator.id)) {
      throw new Error(`音频生成器 ID 重复：${generator.id}。`);
    }
    seenAudioGeneratorIds.add(generator.id);
    return generator;
  });
  const rawNodes = Array.isArray(value.contributes?.nodes) ? value.contributes.nodes : [];
  const seenNodeIds = new Set();
  const nodes = rawNodes.slice(0, 40).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('节点定义无效。');
    const nodeId = pluginId(item.id, '节点 ID');
    if (seenNodeIds.has(nodeId)) throw new Error(`节点 ID 重复：${nodeId}。`);
    seenNodeIds.add(nodeId);
    const accent = String(item.accent || '#94a3b8').trim();
    if (!HEX_COLOR_RE.test(accent)) throw new Error(`${nodeId} 的节点颜色格式不正确。`);
    const hostKind = schemaVersion === 2 ? String(item.hostKind || 'plugin').trim() : 'plugin';
    if (!HOST_NODE_KINDS.has(hostKind)) throw new Error(`${nodeId} 的宿主节点类型不受支持。`);
    const renderer = schemaVersion === 2 ? String(item.renderer || 'host').trim() : 'host';
    if (renderer !== 'host' && renderer !== 'sandbox') {
      throw new Error(`${nodeId} 的节点渲染方式不受支持。`);
    }
    if (renderer === 'sandbox' && hostKind !== 'plugin') {
      throw new Error(`${nodeId} 的沙箱界面只能用于自定义插件节点。`);
    }
    const presentation = schemaVersion === 2 ? String(item.presentation || 'card').trim() : 'card';
    if (presentation !== 'card' && presentation !== 'immersive') {
      throw new Error(`${nodeId} 的节点呈现方式不受支持。`);
    }
    if (presentation === 'immersive' && renderer !== 'sandbox') {
      throw new Error(`${nodeId} 的沉浸式呈现只能用于沙箱界面。`);
    }
    const view = String(item.view || '')
      .trim()
      .slice(0, 80);
    if (renderer === 'sandbox' && !view) throw new Error(`${nodeId} 缺少运行时 view。`);
    const width = Number(item.width ?? 360);
    const height = Number(item.height ?? 220);
    if (!Number.isInteger(width) || width < 240 || width > 1200) {
      throw new Error(`${nodeId} 的节点宽度必须是 240 到 1200 之间的整数。`);
    }
    if (!Number.isInteger(height) || height < 120 || height > 900) {
      throw new Error(`${nodeId} 的节点高度必须是 120 到 900 之间的整数。`);
    }
    return {
      id: nodeId,
      label: shortText(item.label, `${nodeId} 节点名称`, 40),
      description: String(item.description || '')
        .trim()
        .slice(0, 160),
      accent: accent.toLowerCase(),
      input: assetType(item.input),
      output: assetType(item.output),
      ...(schemaVersion === 2
        ? { hostKind, renderer, presentation, ...(view ? { view } : {}), width, height }
        : {}),
    };
  });
  const rawWidgets = Array.isArray(value.contributes?.widgets) ? value.contributes.widgets : [];
  const seenWidgetIds = new Set();
  const widgets = rawWidgets.slice(0, 12).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('挂件定义无效。');
    const widgetId = pluginId(item.id, '挂件 ID');
    if (seenWidgetIds.has(widgetId)) throw new Error(`挂件 ID 重复：${widgetId}。`);
    seenWidgetIds.add(widgetId);
    if (item.type !== 'pet') throw new Error(`${widgetId} 的挂件类型不受支持。`);
    const asset = String(item.asset || '').trim();
    if (!PET_ASSET_RE.test(asset)) throw new Error(`${widgetId} 的宠物图片文件名无效。`);
    const centerAsset = String(item.centerAsset || '').trim();
    if (centerAsset && !PET_ASSET_RE.test(centerAsset)) {
      throw new Error(`${widgetId} 的击掌图片文件名无效。`);
    }
    const width = Number(item.width ?? 150);
    if (!Number.isInteger(width) || width < 72 || width > 240) {
      throw new Error(`${widgetId} 的宠物宽度必须是 72 到 240 之间的整数。`);
    }
    return {
      id: widgetId,
      type: 'pet',
      label: shortText(item.label, `${widgetId} 挂件名称`, 40),
      description: String(item.description || '')
        .trim()
        .slice(0, 160),
      asset,
      ...(centerAsset ? { centerAsset } : {}),
      position: 'bottom-right',
      width,
      message: String(item.message || '喵～')
        .trim()
        .slice(0, 80),
    };
  });
  const rawPanels =
    schemaVersion === 2 && Array.isArray(value.contributes?.panels) ? value.contributes.panels : [];
  const seenPanelIds = new Set();
  const panels = rawPanels.slice(0, 8).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('面板定义无效。');
    const panelId = pluginId(item.id, '面板 ID');
    if (seenPanelIds.has(panelId)) throw new Error(`面板 ID 重复：${panelId}。`);
    seenPanelIds.add(panelId);
    const position = String(item.position || 'right').trim();
    if (!PANEL_POSITIONS.has(position)) throw new Error(`${panelId} 的面板位置不受支持。`);
    const hostChrome = String(item.hostChrome || 'default').trim();
    if (hostChrome !== 'default' && hostChrome !== 'integrated' && hostChrome !== 'custom') {
      throw new Error(`${panelId} 的宿主顶栏模式不受支持。`);
    }
    if ((hostChrome === 'integrated' || hostChrome === 'custom') && position !== 'fullscreen') {
      throw new Error(`${panelId} 只有全屏面板可以使用集成或自绘宿主顶栏。`);
    }
    const view = String(item.view || '')
      .trim()
      .slice(0, 80);
    if (!view) throw new Error(`${panelId} 缺少运行时 view。`);
    const width = Number(item.width ?? 360);
    const height = Number(item.height ?? 480);
    if (!Number.isInteger(width) || width < 240 || width > 1200) {
      throw new Error(`${panelId} 的面板宽度必须是 240 到 1200 之间的整数。`);
    }
    if (!Number.isInteger(height) || height < 160 || height > 900) {
      throw new Error(`${panelId} 的面板高度必须是 160 到 900 之间的整数。`);
    }
    return {
      id: panelId,
      label: shortText(item.label, `${panelId} 面板名称`, 40),
      description: String(item.description || '')
        .trim()
        .slice(0, 160),
      position,
      view,
      width,
      height,
      defaultOpen: item.defaultOpen === true,
      ...(hostChrome === 'integrated' || hostChrome === 'custom' ? { hostChrome } : {}),
    };
  });
  const rawMenus =
    schemaVersion === 2 && Array.isArray(value.contributes?.menus) ? value.contributes.menus : [];
  const seenMenuIds = new Set();
  const menus = rawMenus.slice(0, 20).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('右键菜单定义无效。');
    const menuId = pluginId(item.id, '菜单 ID');
    if (seenMenuIds.has(menuId)) throw new Error(`菜单 ID 重复：${menuId}。`);
    seenMenuIds.add(menuId);
    if (item.location !== 'canvas') throw new Error(`${menuId} 的菜单位置不受支持。`);
    const action = item.action;
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new Error(`${menuId} 的菜单动作无效。`);
    }
    if (action.type === 'add-node') {
      const nodeId = pluginId(action.nodeId, `${menuId} 目标节点 ID`);
      if (!seenNodeIds.has(nodeId)) throw new Error(`${menuId} 引用了不存在的节点：${nodeId}。`);
      return {
        id: menuId,
        label: shortText(item.label, `${menuId} 菜单名称`, 40),
        location: 'canvas',
        action: { type: 'add-node', nodeId },
      };
    }
    if (action.type === 'open-panel') {
      const panelId = pluginId(action.panelId, `${menuId} 目标面板 ID`);
      if (!seenPanelIds.has(panelId)) throw new Error(`${menuId} 引用了不存在的面板：${panelId}。`);
      return {
        id: menuId,
        label: shortText(item.label, `${menuId} 菜单名称`, 40),
        location: 'canvas',
        action: { type: 'open-panel', panelId },
      };
    }
    throw new Error(`${menuId} 的菜单动作不受支持。`);
  });
  const rawLocales =
    schemaVersion === 2 && Array.isArray(value.contributes?.locales)
      ? value.contributes.locales
      : [];
  const seenLocales = new Set();
  const locales = rawLocales.slice(0, 12).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('语言包定义无效。');
    }
    const locale = canonicalLocale(item.locale);
    if (BUILT_IN_LOCALES.has(locale)) throw new Error(`语言包不能覆盖内置语言：${locale}。`);
    if (seenLocales.has(locale)) throw new Error(`语言代码重复：${locale}。`);
    seenLocales.add(locale);
    const file = String(item.file || '').trim();
    if (!LOCALE_FILE_RE.test(file)) throw new Error(`${locale} 的语言文件必须是同目录 JSON 文件。`);
    const direction = String(item.direction || 'ltr').trim();
    if (direction !== 'ltr' && direction !== 'rtl') {
      throw new Error(`${locale} 的文字方向必须是 ltr 或 rtl。`);
    }
    return {
      locale,
      nativeName: shortText(item.nativeName, `${locale} 原生语言名称`, 60),
      file,
      direction,
    };
  });
  if ((nodes.some((node) => node.renderer === 'sandbox') || panels.length > 0) && !runtime) {
    throw new Error('包含沙箱节点或面板的插件必须声明 runtime。');
  }
  const usesRuntimeApi2Permission = permissions.some(
    (permission) =>
      permission === 'canvas:create-project-graph' ||
      permission === 'canvas:read-own-inputs' ||
      permission === 'canvas:read-own-image' ||
      permission === 'audio:generate' ||
      permission === 'audio:reference-library' ||
      permission === 'audio:install' ||
      permission === 'storage:preferences' ||
      permission === 'storage:project-documents' ||
      permission === 'storage:shared-style-covers' ||
      permission === 'models:use-text' ||
      permission === 'models:use-media' ||
      permission === 'vision:pose' ||
      permission === 'vision:install',
  );
  if (usesRuntimeApi2Permission && runtime?.apiVersion !== 2) {
    throw new Error(
      '新建项目节点图、读取自身输入、生成音频、保存项目文档或调用受管模型的插件必须声明 runtime.apiVersion 2。',
    );
  }
  if (audioGenerators.length > 0 && !permissions.includes('audio:generate')) {
    throw new Error('声明音频生成器的插件必须申请 audio:generate 权限。');
  }
  if (permissions.includes('audio:generate') && audioGenerators.length === 0) {
    throw new Error('申请 audio:generate 权限的插件必须声明音频生成器。');
  }
  if (permissions.includes('audio:install') && audioGenerators.length === 0) {
    throw new Error('申请 audio:install 权限的插件必须声明音频生成器。');
  }
  if (
    nodes.length === 0 &&
    widgets.length === 0 &&
    panels.length === 0 &&
    menus.length === 0 &&
    locales.length === 0 &&
    audioGenerators.length === 0
  ) {
    throw new Error('插件必须至少声明一个节点、挂件、面板、右键菜单、语言包或音频生成器。');
  }
  return {
    schemaVersion,
    id,
    name: shortText(value.name, '插件名称', 60),
    version,
    author: String(value.author || '')
      .trim()
      .slice(0, 60),
    description: String(value.description || '')
      .trim()
      .slice(0, 240),
    engine: {
      qiansiCanvas: String(value.engine?.qiansiCanvas || '>=0.0.0')
        .trim()
        .slice(0, 40),
    },
    permissions,
    ...(runtime ? { runtime } : {}),
    assets,
    contributes: { nodes, widgets, panels, menus, locales, audioGenerators },
  };
}

export function isPluginEngineCompatible(range, appVersion) {
  const value = String(range || '').trim();
  const minimum = value.startsWith('>=') ? value.slice(2) : '';
  if (minimum && ENGINE_VERSION_RE.test(minimum)) {
    return compareUpdateVersions(appVersion, minimum) >= 0;
  }
  if (ENGINE_VERSION_RE.test(value)) return compareUpdateVersions(appVersion, value) === 0;
  return false;
}

export function normalizePluginState(value) {
  const enabled = value && typeof value === 'object' && !Array.isArray(value) ? value.enabled : {};
  const clean = {};
  if (enabled && typeof enabled === 'object' && !Array.isArray(enabled)) {
    for (const [id, state] of Object.entries(enabled)) {
      if (ID_RE.test(id)) clean[id] = state !== false;
    }
  }
  return { schemaVersion: 1, enabled: clean };
}
