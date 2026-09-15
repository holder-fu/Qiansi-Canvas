export const PLUGIN_OPEN_API_SETTINGS_EVENT = 'qiansi:plugin-open-api-settings';

export type PluginApiSettingsRequest = {
  providerId: 'volcengine';
};

export function parsePluginApiSettingsRequest(value: unknown): PluginApiSettingsRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('插件 API 设置请求无效。');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'providerId')) {
    throw new Error('插件 API 设置请求包含未知字段。');
  }
  if (record.providerId !== 'volcengine') {
    throw new Error('插件请求的 API 设置平台不受支持。');
  }
  return { providerId: record.providerId };
}
