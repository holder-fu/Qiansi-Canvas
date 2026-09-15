import { chmod, lstat, readFile, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { atomicWriteJson } from './bridge-project-storage.mjs';

export const SEED_AUDIO_PLUGIN_ID = 'doubao-seed-audio';
export const SEED_AUDIO_GENERATOR_ID = 'doubao-seed-audio-cloud';

const CONFIG_FILE_NAME = 'config.json';
const MAX_CONFIG_BYTES = 8 * 1024;
const MAX_API_KEY_CHARACTERS = 4096;

export class SeedAudioConfigError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SeedAudioConfigError';
    this.statusCode = statusCode;
  }
}

function normalizeApiKey(value) {
  if (typeof value !== 'string') throw new SeedAudioConfigError('Seed Audio API Key 无效。');
  const apiKey = value.trim();
  if (!apiKey) throw new SeedAudioConfigError('请填写 Seed Audio API Key。');
  if (apiKey.length > MAX_API_KEY_CHARACTERS) {
    throw new SeedAudioConfigError(
      `Seed Audio API Key 不能超过 ${MAX_API_KEY_CHARACTERS} 个字符。`,
    );
  }
  if (
    [...apiKey].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new SeedAudioConfigError('Seed Audio API Key 不能包含控制字符。');
  }
  return apiKey;
}

async function resolveExactPluginRoot(pluginsRoot, pluginRoot) {
  let realPluginsRoot;
  let realPluginRoot;
  try {
    [realPluginsRoot, realPluginRoot] = await Promise.all([
      realpath(pluginsRoot),
      realpath(pluginRoot),
    ]);
  } catch {
    throw new SeedAudioConfigError('Seed Audio 插件目录无效。', 403);
  }
  const pluginRelativePath = relative(realPluginsRoot, realPluginRoot).replaceAll('\\', '/');
  if (pluginRelativePath !== SEED_AUDIO_PLUGIN_ID) {
    throw new SeedAudioConfigError('Seed Audio 插件目录无效。', 403);
  }
  return realPluginRoot;
}

async function readExistingTimeout(configPath) {
  let metadata;
  try {
    metadata = await lstat(configPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return 300;
    throw new SeedAudioConfigError('Seed Audio 配置文件状态读取失败。', 503);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_CONFIG_BYTES) {
    throw new SeedAudioConfigError('Seed Audio config.json 不是受支持的普通配置文件。', 409);
  }
  let existing;
  try {
    existing = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    return 300;
  }
  const timeout = existing?.request_timeout_seconds;
  return Number.isInteger(timeout) && timeout >= 10 && timeout <= 900 ? timeout : 300;
}

export async function saveSeedAudioApiKeyConfig({
  pluginsRoot,
  pluginRoot,
  pluginId,
  generatorId,
  apiKey: apiKeyValue,
}) {
  if (pluginId !== SEED_AUDIO_PLUGIN_ID) {
    throw new SeedAudioConfigError('当前插件不能配置 Seed Audio API Key。', 403);
  }
  if (generatorId !== SEED_AUDIO_GENERATOR_ID) {
    throw new SeedAudioConfigError('当前音频生成器不能配置 Seed Audio API Key。', 403);
  }
  const apiKey = normalizeApiKey(apiKeyValue);
  const exactPluginRoot = await resolveExactPluginRoot(pluginsRoot, pluginRoot);
  const configPath = resolve(exactPluginRoot, CONFIG_FILE_NAME);
  const requestTimeoutSeconds = await readExistingTimeout(configPath);
  await atomicWriteJson(
    configPath,
    {
      api_key: apiKey,
      request_timeout_seconds: requestTimeoutSeconds,
    },
    { maxBytes: MAX_CONFIG_BYTES },
  );
  await chmod(configPath, 0o600).catch(() => {});
  return {
    configured: true,
    configuredAt: new Date().toISOString(),
  };
}
