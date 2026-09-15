import { removeKey, revealKey, sealKey } from '../lib/keyVault';
import {
  AUTODL_H3_BASE_URL,
  AUTODL_H3_PROVIDER_ID,
  AUTODL_H3_WORKFLOWS,
} from '../lib/autodlH3Catalog';

const AUTODL_H3_CONFIG_STORAGE_KEY = 'qiansi-plugin-autodl-h3-config-v1';
const AUTODL_H3_VAULT_KEY = `plugin:qiansi-novel-video-studio:${AUTODL_H3_PROVIDER_ID}`;

type StoredAutoDlH3Configuration = {
  version: 1;
  configuredAt: number;
};

export type PluginAutoDlH3ConnectionStatus = {
  providerId: typeof AUTODL_H3_PROVIDER_ID;
  baseUrl: typeof AUTODL_H3_BASE_URL;
  configured: boolean;
  configuredAt: number | null;
  executable: false;
  message: string;
  workflows: Array<{ model: string; label: string }>;
};

function readStoredConfiguration(storage: Storage): StoredAutoDlH3Configuration | null {
  try {
    const raw = storage.getItem(AUTODL_H3_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAutoDlH3Configuration>;
    if (parsed.version !== 1 || !Number.isFinite(parsed.configuredAt)) return null;
    return { version: 1, configuredAt: Number(parsed.configuredAt) };
  } catch {
    return null;
  }
}

function connectionStatus(
  configured: boolean,
  configuredAt: number | null,
): PluginAutoDlH3ConnectionStatus {
  return {
    providerId: AUTODL_H3_PROVIDER_ID,
    baseUrl: AUTODL_H3_BASE_URL,
    configured,
    configuredAt,
    executable: false,
    message: configured
      ? 'AutoDL Token 已由宿主加密保存；真实视频提交适配器尚未启用。'
      : '尚未配置 AutoDL ComfyUI Token。',
    workflows: AUTODL_H3_WORKFLOWS.map((workflow) => ({
      model: workflow.id,
      label: workflow.displayName,
    })),
  };
}

export async function readPluginAutoDlH3ConnectionStatus(
  storage: Storage = localStorage,
): Promise<PluginAutoDlH3ConnectionStatus> {
  const stored = readStoredConfiguration(storage);
  const token = await revealKey(AUTODL_H3_VAULT_KEY);
  return connectionStatus(Boolean(stored && token), stored?.configuredAt ?? null);
}

export async function configurePluginAutoDlH3Connection(
  token: string,
  storage: Storage = localStorage,
): Promise<PluginAutoDlH3ConnectionStatus> {
  const normalized = token.trim();
  if (!normalized) throw new Error('请填写 AutoDL ComfyUI Token。');
  if (normalized.length > 4096) throw new Error('AutoDL Token 长度不能超过 4096 个字符。');
  await sealKey(AUTODL_H3_VAULT_KEY, normalized);
  const configuredAt = Date.now();
  storage.setItem(
    AUTODL_H3_CONFIG_STORAGE_KEY,
    JSON.stringify({ version: 1, configuredAt } satisfies StoredAutoDlH3Configuration),
  );
  return connectionStatus(true, configuredAt);
}

export async function clearPluginAutoDlH3Connection(
  storage: Storage = localStorage,
): Promise<PluginAutoDlH3ConnectionStatus> {
  await removeKey(AUTODL_H3_VAULT_KEY);
  storage.removeItem(AUTODL_H3_CONFIG_STORAGE_KEY);
  return connectionStatus(false, null);
}
