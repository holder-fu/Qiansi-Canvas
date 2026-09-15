import assert from 'node:assert/strict';
import test from 'node:test';
import { detectComfyMediaFormat } from './comfy-media-format.mjs';

function bytes(value) {
  return new Uint8Array(Buffer.from(value, 'binary'));
}

test('detects AVIF and Matroska from file headers even when the filename is generic', () => {
  assert.equal(
    detectComfyMediaFormat('image', { filename: 'result.bin', bytes: bytes('\0\0\0\x18ftypavif') })
      .extension,
    '.avif',
  );
  assert.equal(
    detectComfyMediaFormat('video', {
      filename: 'result.bin',
      mime: 'application/octet-stream',
      bytes: bytes('\x1aE\xdf\xa3matroska'),
    }).extension,
    '.mkv',
  );
});

test('uses response MIME before a misleading descriptor extension', () => {
  assert.equal(
    detectComfyMediaFormat('video', {
      filename: 'result.mp4',
      mime: 'video/quicktime',
      bytes: new Uint8Array(),
    }).extension,
    '.mov',
  );
  assert.equal(
    detectComfyMediaFormat('image', {
      filename: 'result.png',
      mime: 'image/avif',
      bytes: new Uint8Array(),
    }).extension,
    '.avif',
  );
});

test('rejects a file whose header belongs to the wrong media kind', () => {
  assert.throws(
    () =>
      detectComfyMediaFormat('video', {
        filename: 'fake.mp4',
        mime: 'video/mp4',
        bytes: bytes('\x89PNG\r\n\x1a\n'),
      }),
    /文件头不是视频/,
  );
});

