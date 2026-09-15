import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGeneratedVideoAudioTrackProbe } from './generated-video-audio.mjs';

test('reports a real audio stream from ffprobe output', () => {
  assert.equal(
    parseGeneratedVideoAudioTrackProbe(
      JSON.stringify({ streams: [{ codec_type: 'video' }, { codec_type: 'audio' }] }),
    ),
    'present',
  );
});

test('distinguishes a silent video from an unreadable probe result', () => {
  assert.equal(
    parseGeneratedVideoAudioTrackProbe(JSON.stringify({ streams: [{ codec_type: 'video' }] })),
    'absent',
  );
  assert.equal(parseGeneratedVideoAudioTrackProbe('{broken'), 'unverified');
  assert.equal(parseGeneratedVideoAudioTrackProbe(JSON.stringify({})), 'unverified');
});
