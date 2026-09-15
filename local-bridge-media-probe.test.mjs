import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');

test('durationless MediaRecorder files fall back to a bounded packet timeline probe', () => {
  assert.match(source, /async function probeUploadedMedia\(filePath, format\)/u);
  assert.match(source, /await probePacketTimelineDuration\(filePath\)/u);
  assert.match(source, /packet=pts_time,duration_time/u);
  assert.match(source, /maximumEnd > MAX_MEDIA_DURATION_SECONDS/u);
  assert.doesNotMatch(source, /-select_streams/u);
});

test('packet probing streams bounded output instead of buffering all media packets', () => {
  assert.match(source, /child\.stdout\.on\('data'/u);
  assert.match(source, /FFPROBE_PACKET_LINE_BYTES/u);
  assert.match(source, /FFPROBE_PACKET_STDERR_BYTES/u);
  assert.match(source, /FFPROBE_PACKET_TIMEOUT_MS/u);
});
