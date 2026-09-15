const STORAGE_KEY = 'qiansi-plugin-preferences-v1';
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const PREFERENCE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_PREFERENCES_PER_PLUGIN = 32;
const MAX_PREFERENCE_JSON_LENGTH = 32 * 1024;
const MAX_STORAGE_JSON_LENGTH = 1024 * 1024;
const LEGACY_PLUGIN_PREFERENCE_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'qiansi-audio': Object.freeze(['voxcpm2-tts', 'chattts-tts']),
});

type PreferenceState = {
  schemaVersion: 1;
  plugins: Record<string, Record<string, unknown>>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function browserStorage(): Storage {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('当前环境不支持插件偏好存储。');
  }
  return window.localStorage;
}

function validatePluginId(pluginId: string) {
  if (!PLUGIN_ID_RE.test(pluginId)) throw new Error('插件 ID 无效。');
  return pluginId;
}

export function sanitizePluginPreferenceKey(value: unknown) {
  if (typeof value !== 'string' || !PREFERENCE_KEY_RE.test(value)) {
    throw new Error('插件偏好键必须是 1 到 64 位字母、数字、点、下划线或连字符。');
  }
  return value;
}

export function sanitizePluginPreferenceValue(value: unknown): unknown {
  if (value === undefined) throw new Error('插件偏好值不能为空。');
  let serialized = '';
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('插件偏好值必须是可序列化的 JSON 数据。');
  }
  if (!serialized || serialized.length > MAX_PREFERENCE_JSON_LENGTH) {
    throw new Error('单个插件偏好不能超过 32 KB。');
  }
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('插件偏好值必须是有效 JSON 数据。');
  }
}

function emptyState(): PreferenceState {
  return { schemaVersion: 1, plugins: {} };
}

function readState(storage: Storage): PreferenceState {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw || raw.length > MAX_STORAGE_JSON_LENGTH) return emptyState();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.plugins)) return emptyState();
    return { schemaVersion: 1, plugins: parsed.plugins as Record<string, Record<string, unknown>> };
  } catch {
    return emptyState();
  }
}

function pluginPreferences(state: PreferenceState, pluginId: string) {
  const value = state.plugins[pluginId];
  return isPlainObject(value) ? value : {};
}

function writeState(storage: Storage, state: PreferenceState) {
  const serialized = JSON.stringify(state);
  if (serialized.length > MAX_STORAGE_JSON_LENGTH) {
    throw new Error('插件偏好存储空间不足。');
  }
  try {
    storage.setItem(STORAGE_KEY, serialized);
  } catch {
    throw new Error('插件偏好保存失败，请检查浏览器存储空间。');
  }
}

export function readPluginPreference(
  pluginId: string,
  key: unknown,
  storage: Storage = browserStorage(),
) {
  const safePluginId = validatePluginId(pluginId);
  const safeKey = sanitizePluginPreferenceKey(key);
  const state = readState(storage);
  const current = pluginPreferences(state, safePluginId);
  const value =
    current[safeKey] ??
    (LEGACY_PLUGIN_PREFERENCE_IDS[safePluginId] ?? [])
      .map((legacyPluginId) => pluginPreferences(state, legacyPluginId)[safeKey])
      .find((legacyValue) => legacyValue !== undefined);
  return value === undefined ? null : sanitizePluginPreferenceValue(value);
}

export function writePluginPreference(
  pluginId: string,
  key: unknown,
  value: unknown,
  storage: Storage = browserStorage(),
) {
  const safePluginId = validatePluginId(pluginId);
  const safeKey = sanitizePluginPreferenceKey(key);
  const safeValue = sanitizePluginPreferenceValue(value);
  const state = readState(storage);
  const current = pluginPreferences(state, safePluginId);
  if (!(safeKey in current) && Object.keys(current).length >= MAX_PREFERENCES_PER_PLUGIN) {
    throw new Error(`每个插件最多保存 ${MAX_PREFERENCES_PER_PLUGIN} 项偏好。`);
  }
  state.plugins[safePluginId] = { ...current, [safeKey]: safeValue };
  writeState(storage, state);
  return safeValue;
}

export function deletePluginPreference(
  pluginId: string,
  key: unknown,
  storage: Storage = browserStorage(),
) {
  const safePluginId = validatePluginId(pluginId);
  const safeKey = sanitizePluginPreferenceKey(key);
  const state = readState(storage);
  const current = pluginPreferences(state, safePluginId);
  if (!(safeKey in current)) return false;
  const next = { ...current };
  delete next[safeKey];
  if (Object.keys(next).length > 0) state.plugins[safePluginId] = next;
  else delete state.plugins[safePluginId];
  writeState(storage, state);
  return true;
}
