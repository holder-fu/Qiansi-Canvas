import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIO_ASSET_MIME_EXTENSIONS,
  audioExtensionForMime,
  detectedAudioFileExtension,
  ffprobePacketEndSeconds,
  generatedAudioFileExtension,
  generatedOutputAudioMime,
  isAudioOnlyWebmFile,
  resolveAudioAssetUploadFormat,
} from './audio-file-format.mjs';

test('derives duration from ffprobe packet rows when WebM container duration is absent', () => {
  assert.ok(Math.abs(ffprobePacketEndSeconds('2.994000,0.007000') - 3.001) < 1e-9);
  assert.ok(Math.abs(ffprobePacketEndSeconds('-0.007000,0.020000') - 0.013) < 1e-9);
  assert.equal(ffprobePacketEndSeconds('1.250000,N/A'), 1.25);
  assert.equal(ffprobePacketEndSeconds('N/A,0.020000'), 0);
  assert.equal(ffprobePacketEndSeconds(''), 0);
});

function ebmlElement(id, payload) {
  assert.ok(payload.length < 127);
  return Buffer.concat([Buffer.from(id), Buffer.from([0x80 | payload.length]), payload]);
}

function webmWithTracks(...trackTypes) {
  const header = ebmlElement(
    [0x1a, 0x45, 0xdf, 0xa3],
    ebmlElement([0x42, 0x82], Buffer.from('webm')),
  );
  const entries = trackTypes.map((trackType) =>
    ebmlElement(
      [0xae],
      Buffer.concat([
        ebmlElement([0x83], Buffer.from([trackType])),
        ebmlElement([0x86], Buffer.from(trackType === 2 ? 'A_OPUS' : 'V_VP9')),
      ]),
    ),
  );
  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], Buffer.concat(entries));
  return Buffer.concat([header, ebmlElement([0x18, 0x53, 0x80, 0x67], tracks)]);
}

test('keeps uploaded audio MIME types paired with their canonical extensions', () => {
  const expected = new Map([
    ['audio/webm', '.webm'],
    ['audio/mp4', '.m4a'],
    ['audio/mpeg', '.mp3'],
    ['audio/mp3', '.mp3'],
    ['audio/wav', '.wav'],
    ['audio/x-wav', '.wav'],
    ['audio/ogg', '.ogg'],
    ['audio/flac', '.flac'],
    ['audio/x-flac', '.flac'],
  ]);

  assert.deepEqual(AUDIO_ASSET_MIME_EXTENSIONS, expected);
  assert.equal(audioExtensionForMime(' Audio/WebM; codecs=opus '), '.webm');
});

test('uses unambiguous extensions for generated audio and never downgrades WebM to MP3', () => {
  assert.equal(generatedAudioFileExtension('https://provider.test/result', 'audio/webm'), '.weba');
  assert.equal(
    generatedAudioFileExtension('https://provider.test/result', 'audio/webm; codecs=opus'),
    '.weba',
  );
  assert.equal(generatedAudioFileExtension('https://provider.test/result.webm', ''), '.weba');
  assert.equal(generatedAudioFileExtension('https://provider.test/result', 'audio/mp4'), '.m4a');
  assert.equal(generatedAudioFileExtension('https://provider.test/result', 'audio/mpeg'), '.mp3');
  assert.equal(generatedAudioFileExtension('https://provider.test/result', 'audio/mp3'), '.mp3');
  assert.equal(generatedAudioFileExtension('https://provider.test/result', 'audio/x-wav'), '.wav');
  assert.equal(generatedAudioFileExtension('https://provider.test/result', 'audio/ogg'), '.ogg');
  assert.equal(
    generatedAudioFileExtension('https://provider.test/result', 'audio/x-flac'),
    '.flac',
  );
});

test('prefers the byte signature when an upstream MIME header is missing or wrong', () => {
  const webm = webmWithTracks(2);
  const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  assert.equal(detectedAudioFileExtension(webm), '.weba');
  assert.equal(detectedAudioFileExtension(wav), '.wav');
  assert.equal(generatedAudioFileExtension('https://provider.test/result', '', webm), '.weba');
  assert.equal(
    generatedAudioFileExtension('https://provider.test/result.mp3', 'audio/mpeg', webm),
    '.weba',
  );
});

test('confirms audio-only WebM from its track table instead of the container prefix alone', () => {
  const audioWebm = webmWithTracks(2);
  const videoWebm = webmWithTracks(1);
  const mixedWebm = webmWithTracks(1, 2);
  const headerOnly = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);

  assert.equal(isAudioOnlyWebmFile(audioWebm), true);
  assert.equal(isAudioOnlyWebmFile(videoWebm), false);
  assert.equal(isAudioOnlyWebmFile(mixedWebm), false);
  assert.equal(isAudioOnlyWebmFile(headerOnly), false);
  assert.equal(detectedAudioFileExtension(audioWebm), '.weba');
  assert.equal(detectedAudioFileExtension(videoWebm), '');
  assert.equal(detectedAudioFileExtension(mixedWebm), '');
});

test('normalizes audio-bound asset uploads from bytes while leaving WebM video untouched', () => {
  const audioWebm = webmWithTracks(2);
  const videoWebm = webmWithTracks(1);
  const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);

  assert.deepEqual(resolveAudioAssetUploadFormat('video/webm', audioWebm), {
    extension: '.weba',
    mime: 'audio/webm',
  });
  assert.deepEqual(resolveAudioAssetUploadFormat('audio/mpeg', wav), {
    extension: '.wav',
    mime: 'audio/wav',
  });
  assert.equal(resolveAudioAssetUploadFormat('video/webm', videoWebm), null);
  assert.equal(resolveAudioAssetUploadFormat('audio/mpeg', videoWebm), null);
});

test('serves every generated audio extension with its matching MIME type', () => {
  assert.equal(generatedOutputAudioMime('.weba'), 'audio/webm');
  assert.equal(generatedOutputAudioMime('.m4a'), 'audio/mp4');
  assert.equal(generatedOutputAudioMime('.mp3'), 'audio/mpeg');
  assert.equal(generatedOutputAudioMime('.wav'), 'audio/wav');
  assert.equal(generatedOutputAudioMime('.ogg'), 'audio/ogg');
  assert.equal(generatedOutputAudioMime('.flac'), 'audio/flac');
  assert.equal(generatedOutputAudioMime('.webm'), '');
});
