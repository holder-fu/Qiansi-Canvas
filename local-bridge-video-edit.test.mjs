import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');

test('masked repair is an exclusive source-video edit behind an explicit provider gate', () => {
  assert.match(source, /const isMaskedRepair = videoEditOperation === 'masked-repair';/);
  assert.match(
    source,
    /const isSourceVideoEdit = isSubtitleRemoval \|\| isVisualEdit \|\| isMaskedRepair;/,
  );
  assert.match(source, /if \(isMaskedRepair\) assertMaskedRepairProviderSupport\(provider\);/);
  assert.match(source, /const exclusiveOperations = \[[\s\S]{0,180}isSourceVideoEdit,/);
});

test('masked repair forwards the canvas field names into the generic video edit payload', () => {
  assert.match(
    source,
    /const videoEditPayload = buildVideoEditPayload\(\{[\s\S]{0,400}maskImage: body\.maskImage,[\s\S]{0,100}rangeStart: body\.maskRangeStart,[\s\S]{0,100}rangeEnd: body\.maskRangeEnd,[\s\S]{0,100}keyframeTime: body\.keyframeTime,[\s\S]{0,100}tracking: body\.tracking === 'provider',/,
  );
  assert.match(source, /\.\.\.videoEditPayload,/);
  assert.doesNotMatch(source, /buildVideoEditPayload\(\{[\s\S]{0,400}rangeStart: body\.rangeStart/);
});

test('dedicated and ComfyUI adapters cannot silently accept masked repair', () => {
  assert.match(
    source,
    /if \(provider\.protocol === 'comfyui'\) \{[\s\S]{0,800}if \(isSourceVideoEdit\) \{/,
  );
  assert.match(
    source,
    /if \(isSourceVideoEdit && \['jimeng', 'bailian', 'lightx2v'\]\.includes\(provider\.protocol\)\)/,
  );
});

test('generic video generation forwards the node audio switch without a model capability gate', () => {
  assert.match(source, /generate_audio: Boolean\(body\.audio\),/);
  assert.doesNotMatch(source, /videoAudioOutput|video-audio-unsupported/);
});

test('completed generated videos are probed for an actual audio stream', () => {
  assert.match(source, /async function inspectGeneratedVideoAudioTrack\(result\)/);
  assert.match(source, /'-show_entries',[\s\S]{0,80}'stream=codec_type'/);
  assert.match(source, /audioTrackStatus: await inspectGeneratedVideoAudioTrack\(completed\),/);
});
