import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compareUpdateVersions,
  findPreviousUpdateRelease,
  mergeUpdateSourceConfigs,
  normalizeUpdateSources,
  parseUpdateManifest,
  safeUpdateUrl,
} from './system-update-contract.mjs';

test('compares dotted release versions', () => {
  assert.ok(compareUpdateVersions('0.2.0', '0.1.9') > 0);
  assert.ok(compareUpdateVersions('1.0.0', '0.1.0') > 0);
  assert.ok(compareUpdateVersions('0.1.0', '1.0.0') < 0);
  assert.equal(compareUpdateVersions('v2026.08.12', '2026.8.12'), 0);
});

test('orders prerelease versions before their stable release', () => {
  assert.ok(compareUpdateVersions('0.1.0-beta.1', '0.1.0-beta.2') < 0);
  assert.ok(compareUpdateVersions('0.1.0-beta.2', '0.1.0') < 0);
  assert.ok(compareUpdateVersions('0.1.0', '0.1.0-beta.2') > 0);
  assert.equal(compareUpdateVersions('v0.1.0-beta.1+build.7', '0.1.0-beta.1'), 0);
});

test('accepts a strict SHA-256 update manifest', () => {
  const manifest = parseUpdateManifest({
    schemaVersion: 1,
    version: '0.1.0',
    notes: ['安全更新'],
    package: { url: 'https://example.com/qiansi.zip', sha256: 'a'.repeat(64), size: 123 },
  });
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.package.sha256, 'a'.repeat(64));
  assert.deepEqual(manifest.releases, []);
});

test('selects the newest declared release below the running version', () => {
  const manifest = parseUpdateManifest({
    schemaVersion: 1,
    version: '0.3.0',
    notes: ['当前版本'],
    package: { url: 'https://example.com/0.3.0.zip', sha256: 'a'.repeat(64), size: 300 },
    releases: [
      {
        version: '0.2.0',
        notes: ['上一版本'],
        package: { url: 'https://example.com/0.2.0.zip', sha256: 'b'.repeat(64), size: 200 },
      },
      {
        version: '0.1.0',
        package: { url: 'https://example.com/0.1.0.zip', sha256: 'c'.repeat(64), size: 100 },
      },
    ],
  });

  assert.equal(findPreviousUpdateRelease(manifest, '0.3.0')?.version, '0.2.0');
  assert.equal(findPreviousUpdateRelease(manifest, '0.1.0'), null);
});

test('uses an older top-level mirror release as a rollback candidate', () => {
  const manifest = parseUpdateManifest({
    schemaVersion: 1,
    version: '0.1.9',
    package: { url: 'https://example.com/0.1.9.zip', sha256: 'd'.repeat(64), size: 190 },
  });
  assert.equal(findPreviousUpdateRelease(manifest, '0.2.0')?.version, '0.1.9');
});

test('rejects insecure URLs and malformed hashes', () => {
  assert.throws(() => safeUpdateUrl('http://example.com/update.zip'), /HTTPS/);
  assert.throws(
    () =>
      parseUpdateManifest({
        schemaVersion: 1,
        version: '0.1.0',
        package: { url: 'https://example.com/update.zip', sha256: 'bad', size: 1 },
      }),
    /SHA-256/,
  );
});

test('keeps configured and disabled mirror sources', () => {
  const config = normalizeUpdateSources({
    version: 1,
    sources: [
      {
        id: 'github',
        name: 'GitHub',
        manifestUrl: 'https://example.com/update.json',
        homepageUrl: 'https://github.com/holder-fu/Qiansi-Canvas',
      },
      {
        id: 'modelscope',
        name: 'ModelScope',
        manifestUrl: '',
        homepageUrl: 'https://www.modelscope.cn/studios/holder2895/Qiansi-Canvas',
        enabled: false,
      },
    ],
  });
  assert.equal(config.sources.length, 2);
  assert.equal(config.sources[1].enabled, false);
  assert.equal(config.sources[0].homepageUrl, 'https://github.com/holder-fu/Qiansi-Canvas');
  assert.equal(
    config.sources[1].homepageUrl,
    'https://www.modelscope.cn/studios/holder2895/Qiansi-Canvas',
  );
});

test('ships the holder GitHub and ModelScope accounts as secure default update sources', async () => {
  const defaults = normalizeUpdateSources(
    JSON.parse(await readFile(new URL('./update-sources.default.json', import.meta.url), 'utf8')),
  );
  assert.deepEqual(
    defaults.sources.map(({ id, manifestUrl, homepageUrl, enabled }) => ({
      id,
      manifestUrl,
      homepageUrl,
      enabled,
    })),
    [
      {
        id: 'github',
        manifestUrl: 'https://raw.githubusercontent.com/holder-fu/Qiansi-Canvas/main/update.json',
        homepageUrl: 'https://github.com/holder-fu/Qiansi-Canvas',
        enabled: true,
      },
      {
        id: 'modelscope',
        manifestUrl:
          'https://www.modelscope.cn/api/v1/studio/holder2895/Qiansi-Canvas/repo?Revision=master&FilePath=update.json',
        homepageUrl: 'https://www.modelscope.cn/studios/holder2895/Qiansi-Canvas',
        enabled: true,
      },
    ],
  );
});

test('fills empty legacy URLs from defaults without overwriting user choices', () => {
  const merged = mergeUpdateSourceConfigs(
    {
      sources: [
        {
          id: 'github',
          name: 'GitHub',
          manifestUrl: 'https://defaults.example.com/update.json',
          homepageUrl: 'https://defaults.example.com',
        },
        {
          id: 'modelscope',
          name: 'ModelScope',
          manifestUrl: 'https://defaults.example.com/modelscope.json',
          homepageUrl: 'https://defaults.example.com/modelscope',
        },
      ],
    },
    {
      sources: [
        {
          id: 'github',
          name: 'GitHub',
          manifestUrl: '',
          homepageUrl: '',
        },
        {
          id: 'modelscope',
          name: '我的魔搭镜像',
          manifestUrl: 'https://custom.example.com/update.json',
          homepageUrl: 'https://custom.example.com',
          enabled: false,
        },
      ],
    },
  );

  assert.equal(merged.sources[0].manifestUrl, 'https://defaults.example.com/update.json');
  assert.equal(merged.sources[0].homepageUrl, 'https://defaults.example.com');
  assert.equal(merged.sources[1].name, '我的魔搭镜像');
  assert.equal(merged.sources[1].manifestUrl, 'https://custom.example.com/update.json');
  assert.equal(merged.sources[1].enabled, false);
});

test('rejects insecure project homepages', () => {
  assert.throws(
    () =>
      normalizeUpdateSources({
        sources: [{ id: 'github', name: 'GitHub', homepageUrl: 'http://github.com/example' }],
      }),
    /HTTPS/,
  );
});
