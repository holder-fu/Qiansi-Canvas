import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canvasWebMime } from './canvas-web-mime.mjs';

test('serves browser modules and WebAssembly with executable MIME types', () => {
  assert.equal(canvasWebMime('assets/runtime.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(canvasWebMime('assets/runtime.js'), 'text/javascript; charset=utf-8');
  assert.equal(canvasWebMime('assets/runtime.wasm'), 'application/wasm');
});

test('keeps known static MIME types and defaults unknown files to binary', () => {
  assert.equal(canvasWebMime('index.html'), 'text/html; charset=utf-8');
  assert.equal(canvasWebMime('assets/app.css'), 'text/css; charset=utf-8');
  assert.equal(canvasWebMime('assets/image.webp'), 'image/webp');
  assert.equal(canvasWebMime('assets/model.onnx'), 'application/octet-stream');
});

test('versions both Canvas and standalone ONNX assets past the old immutable MIME response', async () => {
  const [canvasDepthSource, standaloneSource] = await Promise.all([
    readFile(new URL('./src/services/pluginDepthEffect.ts', import.meta.url), 'utf8'),
    readFile(
      new URL('./data/plugins/qiansi-motion-capture/standalone/standalone.js', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(canvasDepthSource, /PLUGIN_DEPTH_RUNTIME_ASSET_REVISION = 'mime-v2'/);
  assert.match(canvasDepthSource, /url\.searchParams\.set\('qiansi-depth-runtime'/);
  assert.equal(
    standaloneSource.match(/qiansi-depth-runtime=mime-v2/g)?.length,
    2,
    'standalone must version both the ONNX JavaScript module and WebAssembly binary',
  );
});
