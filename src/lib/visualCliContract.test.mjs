import test from 'node:test';
import assert from 'node:assert/strict';
import { bailianImageArgs, bailianVideoArgs } from './visualCliContract.mjs';

test('builds Bailian image edit arguments without a shell command string', () => {
  const args = bailianImageArgs({
    model: 'bailian:qwen-image-2.0',
    prompt: '保留人物，改成水彩',
    referencePaths: ['C:\\refs\\one.png', 'C:\\refs\\two.png'],
    size: '1024x1024',
    count: 2,
    outputDirectory: 'C:\\out',
  });
  assert.deepEqual(args.slice(0, 2), ['image', 'edit']);
  assert.equal(args[args.indexOf('--size') + 1], '1024*1024');
  assert.equal(args.filter((value) => value === '--image').length, 2);
});

test('lets Bailian select the video model from text/image input automatically', () => {
  const args = bailianVideoArgs({
    model: 'bailian:video-auto',
    prompt: '镜头缓慢推进',
    referencePath: 'C:\\refs\\one.png',
    duration: 5,
    aspectRatio: '16:9',
    outputPath: 'C:\\out\\result.mp4',
  });
  assert.equal(args.includes('--model'), false);
  assert.equal(args[args.indexOf('--image') + 1], 'C:\\refs\\one.png');
});
