import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ReferenceAudioLibrary,
  ReferenceAudioLibraryError,
  UNCATEGORIZED_REFERENCE_AUDIO,
} from './plugin-reference-audio-library.mjs';

const wav = Buffer.from('RIFF\x04\x00\x00\x00WAVE', 'binary');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

test('lists root and categorized reference audio, then renames without overwriting', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-reference-library-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'voice.wav'), wav);
  await writeFile(join(root, 'voice.jpg'), jpeg);
  await mkdir(join(root, '旁白'));
  await writeFile(join(root, '旁白', 'warm.mp3'), Buffer.from([1, 2, 3]));
  await writeFile(join(root, 'ignore.txt'), Buffer.from('ignore'));

  const library = new ReferenceAudioLibrary(root);
  const listing = await library.list();
  assert.deepEqual(listing.categories, [UNCATEGORIZED_REFERENCE_AUDIO, '旁白']);
  assert.equal(listing.entries.length, 2);
  const source = listing.entries.find((entry) => entry.name === 'voice');
  assert.equal(source.avatarDataUrl, 'data:image/jpeg;base64,/9j/2Q==');
  const renamed = await library.rename(source.id, 'narrator', '角色', '这是准确转写。');
  assert.equal(renamed.fileName, 'narrator.wav');
  assert.equal(renamed.category, '角色');
  assert.equal(renamed.transcript, '这是准确转写。');
  assert.equal(
    await readFile(join(root, '角色', 'narrator.wav.transcript.txt'), 'utf8'),
    '这是准确转写。',
  );
  const { target } = await library.read(renamed.id);
  assert.deepEqual(await readFile(target), wav);
  assert.deepEqual(await readFile(join(root, '角色', 'narrator.jpg')), jpeg);
  await assert.rejects(() => readFile(join(root, 'voice.jpg')));

  await writeFile(join(root, '角色', 'taken.wav'), wav);
  await assert.rejects(
    () => library.rename(renamed.id, 'taken', '角色'),
    (error) => error instanceof ReferenceAudioLibraryError && error.statusCode === 409,
  );
});

test('persists bounded transcripts beside audio and preserves them when metadata changes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-reference-library-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'voice.wav'), wav);
  const library = new ReferenceAudioLibrary(root);
  const source = (await library.list()).entries[0];

  const saved = await library.rename(source.id, 'voice', '', '第一行\n第二行');
  assert.equal(saved.transcript, '第一行\n第二行');
  const moved = await library.rename(saved.id, '旁白', '角色');
  assert.equal(moved.transcript, '第一行\n第二行');
  await assert.rejects(() => library.rename(moved.id, '旁白', '角色', '字'.repeat(16_001)));
  const cleared = await library.rename(moved.id, '旁白', '角色', '');
  assert.equal(cleared.transcript, '');
  await assert.rejects(() => readFile(join(root, '角色', '旁白.wav.transcript.txt'), 'utf8'));
});

test('creates empty categories idempotently and rejects unsafe names', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-reference-library-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const library = new ReferenceAudioLibrary(root);

  assert.equal(await library.createCategory('角色'), '角色');
  assert.equal(await library.createCategory('角色'), '角色');
  assert.deepEqual((await library.list()).categories, [UNCATEGORIZED_REFERENCE_AUDIO, '角色']);
  await assert.rejects(() => library.createCategory('../越界'));
  await assert.rejects(() => library.createCategory(UNCATEGORIZED_REFERENCE_AUDIO));
});

test('ignores unsupported, oversized, nested and linked files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-reference-library-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'category', 'nested'), { recursive: true });
  await writeFile(join(root, 'category', 'nested', 'hidden.wav'), wav);
  await writeFile(join(root, 'too-large.wav'), Buffer.alloc(16 * 1024 * 1024 + 1));
  const outside = join(root, '..', `outside-${Date.now()}.wav`);
  await writeFile(outside, wav);
  t.after(() => rm(outside, { force: true }));
  try {
    await symlink(outside, join(root, 'linked.wav'));
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
  }

  const listing = await new ReferenceAudioLibrary(root).list();
  assert.deepEqual(listing.entries, []);
});

test('adds selected local audio idempotently and preserves same-name variants', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-reference-library-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const library = new ReferenceAudioLibrary(root);

  const first = await library.add('voice.wav', 'audio/x-wav', wav);
  const repeated = await library.add('voice.wav', 'audio/wav', wav);
  const variantBytes = Buffer.from('RIFF\x08\x00\x00\x00WAVEtest', 'binary');
  const variant = await library.add('voice.wav', '', variantBytes);
  const repeatedVariant = await library.add('voice.wav', 'audio/wav', variantBytes);

  assert.equal(first.fileName, 'voice.wav');
  assert.equal(repeated.id, first.id);
  assert.equal(variant.fileName, 'voice (2).wav');
  assert.equal(repeatedVariant.id, variant.id);
  assert.equal((await library.list()).entries.length, 2);
  assert.deepEqual(await readFile(join(root, variant.fileName)), variantBytes);
});

test('rejects unsafe, mismatched, empty, and oversized imports', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-reference-library-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const library = new ReferenceAudioLibrary(root);

  await assert.rejects(() => library.add('../voice.wav', 'audio/wav', wav));
  await assert.rejects(
    () => library.add('voice.mp3', 'audio/wav', wav),
    (error) => error instanceof ReferenceAudioLibraryError && error.statusCode === 415,
  );
  await assert.rejects(
    () => library.add('voice.txt', 'audio/wav', wav),
    (error) => error instanceof ReferenceAudioLibraryError && error.statusCode === 415,
  );
  await assert.rejects(() => library.add('voice.wav', 'audio/wav', Buffer.alloc(0)));
  await assert.rejects(
    () => library.add('voice.wav', 'audio/wav', Buffer.alloc(16 * 1024 * 1024 + 1)),
    (error) => error instanceof ReferenceAudioLibraryError && error.statusCode === 413,
  );
});
