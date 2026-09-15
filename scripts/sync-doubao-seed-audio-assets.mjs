import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/console/audio-generate-v1/';
const pluginRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../data/plugins/doubao-seed-audio',
);
const maxAssetBytes = 16 * 1024 * 1024;

const records = [
  ['T_to_A/suspense-crime', 'preview-01-suspense-crime'],
  ['T_to_A/palace-drug-trial', 'preview-02-palace-drug-trial'],
  ['T_to_A/lingshan-declaration', 'preview-03-lingshan-declaration'],
  ['T_to_A/sci-fi-future', 'preview-04-sci-fi-future'],
  ['T_to_A/costume-comedy', 'preview-05-costume-comedy'],
  ['T_to_A/two-host-podcast', 'preview-two-host-podcast'],
  ['T_to_A/fire-scene-news', 'preview-fire-scene-news'],
  ['T_to_A/malay-education-podcast', 'preview-malay-education-podcast'],
  ['T_to_A/spanish-savings-interview', 'preview-spanish-savings-interview'],
  ['T_to_A/suspense-backpack-clue', 'preview-suspense-backpack-clue'],
  ['T_to_A/thai-wealth-podcast', 'preview-thai-wealth-podcast'],
  ['A_to_A/li-mi-memory', 'preview-06-li-mi-memory', 1],
  ['A_to_A/ecommerce-duo', 'preview-07-ecommerce-duo', 2],
  ['A_to_A/police-standoff', 'preview-08-police-standoff', 3],
  ['A_to_A/podcast-chat', 'preview-podcast-chat', 2],
  ['A_to_A/multi-role-voice-expansion', 'preview-multi-role-voice-expansion', 1],
  ['A_to_A/spanish-vlog-toxic-relationships', 'preview-spanish-vlog-toxic-relationships', 1],
  ['A_to_A/french-podcast-small-talk', 'preview-french-podcast-small-talk', 2],
  ['A_to_A/korean-asmr-whisper', 'preview-korean-asmr-whisper', 1],
  ['A_to_A/japanese-audiobook-philosophy', 'preview-japanese-audiobook-philosophy', 1],
  ['A_to_A/indonesian-career-chat', 'preview-indonesian-career-chat', 1],
  ['timestamp/sound-effect-cue', 'preview-09-sound-effect-cue'],
  ['timestamp/emotion-progression', 'preview-10-emotion-progression'],
  ['timestamp/narrative-transition', 'preview-narrative-transition'],
  ['timestamp/narration-progression', 'preview-narration-progression'],
  ['multilingual/french', 'preview-french'],
  ['multilingual/japanese', 'preview-12-japanese'],
  ['multilingual/korean', 'preview-korean'],
  ['multilingual/malay', 'preview-malay'],
  ['multilingual/german', 'preview-german'],
  ['multilingual/english', 'preview-11-english'],
  ['multilingual/thai', 'preview-thai'],
  ['multilingual/indonesian', 'preview-indonesian'],
  ['multilingual/spanish', 'preview-spanish'],
  ['multilingual/vietnamese', 'preview-vietnamese'],
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchBytes(relativePath) {
  const response = await fetch(new URL(relativePath, baseUrl));
  if (!response.ok) throw new Error(`${relativePath}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function outputParts(stem, bytes) {
  if (bytes.byteLength <= maxAssetBytes) {
    const name = `${stem}.wav`;
    await writeFile(resolve(pluginRoot, name), bytes);
    return [name];
  }
  const midpoint = Math.ceil(bytes.byteLength / 2);
  const names = [`${stem}-1.bin`, `${stem}-2.bin`];
  await writeFile(resolve(pluginRoot, names[0]), bytes.subarray(0, midpoint));
  await writeFile(resolve(pluginRoot, names[1]), bytes.subarray(midpoint));
  return names;
}

async function expectedPreviewParts(stem) {
  const wav = `${stem}.wav`;
  const split = [`${stem}-1.bin`, `${stem}-2.bin`];
  if (await exists(resolve(pluginRoot, wav))) return [wav];
  if (
    await Promise.all(split.map((name) => exists(resolve(pluginRoot, name)))).then((v) =>
      v.every(Boolean),
    )
  )
    return split;
  return [];
}

const force = process.argv.includes('--force');
const checkOnly = process.argv.includes('--check');
const report = [];

for (const [remoteStem, localStem, referenceCount = 0] of records) {
  let previewParts = await expectedPreviewParts(localStem);
  if (force || previewParts.length === 0) {
    if (checkOnly) throw new Error(`missing preview asset: ${localStem}`);
    previewParts = await outputParts(localStem, await fetchBytes(`${remoteStem}/generated.wav`));
  }
  const previewBytes = Buffer.concat(
    await Promise.all(previewParts.map((name) => readFile(resolve(pluginRoot, name)))),
  );
  const references = [];
  for (let index = 1; index <= referenceCount; index += 1) {
    const name = `reference-${localStem.replace(/^preview-\d*-?/, '').replace(/^preview-/, '')}-${index}.wav`;
    const path = resolve(pluginRoot, name);
    if (force || !(await exists(path))) {
      if (checkOnly) throw new Error(`missing reference asset: ${name}`);
      await writeFile(path, await fetchBytes(`${remoteStem}/reference-${index}.wav`));
    }
    const bytes = await readFile(path);
    if (bytes.byteLength > maxAssetBytes) throw new Error(`${name} exceeds ${maxAssetBytes} bytes`);
    references.push({
      name,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  report.push({
    remoteStem,
    previewParts,
    previewSize: previewBytes.byteLength,
    previewSha256: createHash('sha256').update(previewBytes).digest('hex'),
    references,
  });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
