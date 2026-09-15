import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const readRootFile = (path) => readFile(new URL(path, root), 'utf8');

test('package metadata exposes the dual-license expression consistently', async () => {
  const [packageJson, packageLock] = await Promise.all([
    readRootFile('package.json').then(JSON.parse),
    readRootFile('package-lock.json').then(JSON.parse),
  ]);
  const expected = 'GPL-3.0-or-later OR LicenseRef-Qiansi-Commercial';

  assert.equal(packageJson.license, expected);
  assert.equal(packageLock.packages[''].license, expected);
});

test('repository contains the GPL text and consolidated license boundaries', async () => {
  const [license, policy, contributing, thirdParty] = await Promise.all([
    readRootFile('LICENSE'),
    readRootFile('LICENSING.md'),
    readRootFile('CONTRIBUTING.md'),
    readRootFile('THIRD_PARTY_NOTICES.md'),
  ]);

  assert.match(license, /GNU GENERAL PUBLIC LICENSE/);
  assert.match(license, /Version 3, 29 June 2007/);
  assert.match(policy, /GPL-3\.0-or-later/);
  assert.match(policy, /用户作品与数据/);
  assert.match(policy, /权益归用户或其原权利人/);
  assert.match(policy, /不会.*自动.*GPL/s);
  assert.match(policy, /本仓库的说明本身不授予商业许可/);
  assert.match(policy, /additional permission under section 7/i);
  assert.match(contributing, /贡献者许可/);
  assert.match(thirdParty, /@mediapipe\/tasks-vision/);
});

test('current product surfaces no longer advertise the repository as MIT licensed', async () => {
  const [readme, policy, home, settings] = await Promise.all([
    readRootFile('README.md'),
    readRootFile('LICENSING.md'),
    readRootFile('src/components/Home.tsx'),
    readRootFile('src/components/SettingsPanel.tsx'),
  ]);

  assert.match(readme, /GNU GPL v3 或任何后续版本/);
  assert.match(policy, /双许可证模式/);
  assert.doesNotMatch(policy, /旧 MIT 版本/);
  assert.doesNotMatch(home, /MIT License/);
  assert.doesNotMatch(settings, /MIT License/);
});

test('license documents distinguish paid GPL distribution from official endorsement', async () => {
  const [readme, policy] = await Promise.all([
    readRootFile('README.md'),
    readRootFile('LICENSING.md'),
  ]);

  assert.match(readme, /GPL 路径允许合规收费分发/);
  assert.match(readme, /不代表官方授权/);
  assert.match(policy, /不得冒充官方/);
  assert.match(policy, /本段不限制 GPL 授予/);
});
