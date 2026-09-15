import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { saveSeedAudioApiKeyConfig } from './plugin-seed-audio-config.mjs';

async function withPluginDirectory(action) {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-seed-key-'));
  const pluginsRoot = join(root, 'plugins');
  const pluginRoot = join(pluginsRoot, 'doubao-seed-audio');
  await mkdir(pluginRoot, { recursive: true });
  try {
    await action({ root, pluginsRoot, pluginRoot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('saves only the bounded Seed Audio API key to the exact plugin config without echoing it', async () => {
  await withPluginDirectory(async ({ pluginsRoot, pluginRoot }) => {
    await writeFile(
      join(pluginRoot, 'config.json'),
      JSON.stringify({ api_key: 'old-secret', request_timeout_seconds: 180 }),
      'utf8',
    );
    const result = await saveSeedAudioApiKeyConfig({
      pluginsRoot,
      pluginRoot,
      pluginId: 'doubao-seed-audio',
      generatorId: 'doubao-seed-audio-cloud',
      apiKey: '  new-secret  ',
    });
    assert.deepEqual(Object.keys(result).sort(), ['configured', 'configuredAt']);
    assert.equal(result.configured, true);
    assert.match(result.configuredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(JSON.parse(await readFile(join(pluginRoot, 'config.json'), 'utf8')), {
      api_key: 'new-secret',
      request_timeout_seconds: 180,
    });
  });
});

test('rejects cross-plugin paths, alternate generators and unsafe key content', async () => {
  await withPluginDirectory(async ({ root, pluginsRoot, pluginRoot }) => {
    const base = {
      pluginsRoot,
      pluginRoot,
      pluginId: 'doubao-seed-audio',
      generatorId: 'doubao-seed-audio-cloud',
      apiKey: 'new-secret',
    };
    await assert.rejects(
      saveSeedAudioApiKeyConfig({ ...base, pluginId: 'other-plugin' }),
      /当前插件不能配置 Seed Audio API Key/,
    );
    await assert.rejects(
      saveSeedAudioApiKeyConfig({ ...base, generatorId: 'other-generator' }),
      /当前音频生成器不能配置 Seed Audio API Key/,
    );
    await assert.rejects(saveSeedAudioApiKeyConfig({ ...base, apiKey: 'bad\nkey' }), /控制字符/);
    await assert.rejects(
      saveSeedAudioApiKeyConfig({ ...base, pluginRoot: join(root, 'outside') }),
      /插件目录无效/,
    );
  });
});
