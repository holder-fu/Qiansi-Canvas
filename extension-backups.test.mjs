import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createExtensionBackup,
  listExtensionBackups,
  restoreExtensionBackup,
} from './extension-backups.mjs';

test('backs up and restores only a managed extension directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-extension-backup-'));
  const plugins = join(root, 'plugins');
  const backups = join(root, 'backups');
  const source = join(plugins, 'test-plugin');
  try {
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'plugin.json'), '{"version":"1.0.0"}', 'utf8');
    const created = await createExtensionBackup({
      sourceDirectory: source,
      backupRoot: backups,
      kind: 'plugin',
      id: 'test-plugin',
      version: '1.0.0',
    });
    assert.equal(created.files.length, 1);
    await rm(source, { recursive: true });
    const listed = await listExtensionBackups({ backupRoot: backups, kind: 'plugin' });
    assert.equal(listed[0].version, '1.0.0');
    await restoreExtensionBackup({
      destinationRoot: plugins,
      backupRoot: backups,
      kind: 'plugin',
      id: 'test-plugin',
      backupId: listed[0].backupId,
    });
    assert.equal(await readFile(join(source, 'plugin.json'), 'utf8'), '{"version":"1.0.0"}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects extension ids that could escape the managed directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-extension-backup-'));
  try {
    await assert.rejects(
      createExtensionBackup({
        sourceDirectory: root,
        backupRoot: join(root, 'backups'),
        kind: 'plugin',
        id: '../outside',
      }),
      /扩展 ID/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses to restore a backup whose file no longer matches its checksum', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-extension-backup-'));
  const plugins = join(root, 'plugins');
  const backups = join(root, 'backups');
  const source = join(plugins, 'test-plugin');
  try {
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'plugin.json'), '{"version":"1.0.0"}', 'utf8');
    const created = await createExtensionBackup({
      sourceDirectory: source,
      backupRoot: backups,
      kind: 'plugin',
      id: 'test-plugin',
      version: '1.0.0',
    });
    await rm(source, { recursive: true });
    await writeFile(
      join(backups, 'test-plugin', created.backupId, 'files', 'plugin.json'),
      'tampered',
      'utf8',
    );
    await assert.rejects(
      restoreExtensionBackup({
        destinationRoot: plugins,
        backupRoot: backups,
        kind: 'plugin',
        id: 'test-plugin',
        backupId: created.backupId,
      }),
      /校验失败/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
