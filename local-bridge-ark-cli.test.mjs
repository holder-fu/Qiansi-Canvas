import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('./', import.meta.url);

test('local bridge detects the official Volcengine Ark CLI with fixed version and auth probes', async () => {
  const [source, contract, windowsInstaller, macosInstaller] = await Promise.all([
    readFile(new URL('./local-bridge.mjs', rootUrl), 'utf8'),
    readFile(new URL('./src/lib/arkCliContract.mjs', rootUrl), 'utf8'),
    readFile(new URL('./tools/launchers/qiansi-install.bat', rootUrl), 'utf8'),
    readFile(new URL('./tools/launchers/安装CLI工具-macOS.command', rootUrl), 'utf8'),
  ]);
  const installers = `${windowsInstaller}\n${macosInstaller}`;

  assert.match(source, /from '\.\/src\/lib\/arkCliContract\.mjs'/);
  assert.match(source, /async function readVolcengineStatus\(\)/);
  assert.match(source, /const commandPath = await locate\('arkcli'\)/);
  assert.match(source, /buildArkCliVersionArgs\(\)/);
  assert.match(source, /buildArkCliAuthStatusArgs\(\)/);
  assert.match(contract, /return \['--version'\]/);
  assert.match(contract, /return \['auth', 'status', '--format', 'json'\]/);
  assert.match(installers, /@volcengine\/ark-cli@latest/);
  assert.match(installers, /arkcli(?:\.cmd)?[^\r\n]*--version|%QIANSI_VOLCENGINE_CMD%[^\r\n]*--version/i);
  assert.match(installers, /arkcli auth status/);
});

test('local bridge exposes Ark CLI health without publishing unadapted canvas models', async () => {
  const source = await readFile(new URL('./local-bridge.mjs', rootUrl), 'utf8');

  assert.match(source, /if \(tool === 'arkcli' \|\| tool === 've'\)/);
  assert.match(source, /tools: \{ \[responseKey\]: arkcli\.installed \}/);
  assert.match(source, /sessions: \{ \[responseKey\]: arkcli \}/);
  assert.match(source, /arkServices: arkcli\.ready/);
  assert.match(source, /textGeneration: false/);
  assert.match(
    source,
    /function assertCanvasGenerationProvider\(provider\)[\s\S]*?protocol === 'volcengine-cli'[\s\S]*?throw new Error\([\s\S]*?画布生成适配器尚未启用/,
  );
  assert.match(
    source,
    /async function bridgeChat\(body\)[\s\S]*?assertCanvasGenerationProvider\(provider\)/,
  );
  assert.doesNotMatch(source, /locateArkCli|arkStatus|buildArkCliChatArgs/);
  assert.doesNotMatch(source, /\['resources', 'list'/);
  assert.doesNotMatch(source, /['"]\+chat['"]/);
  assert.doesNotMatch(source, /id: `ark:|startsWith\('ark:'\)|owned_by: 'local-ark-cli'/);
  assert.doesNotMatch(source, /runCli\(\s*['"]arkcli['"]/);
  assert.doesNotMatch(source, /shell:\s*true/);
});
