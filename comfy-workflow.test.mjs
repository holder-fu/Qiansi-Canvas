import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMFY_WORKFLOW_LIMITS,
  ComfyWorkflowValidationError,
  applyComfyWorkflowInputs,
  extractComfy3dOutputs,
  extractComfyAudioOutputs,
  extractComfyVideoOutputs,
  getComfyOutputNodeId,
  inferCommonComfyWorkflowBindings,
  isComfyVideoOutputFilename,
  parseComfyHistoryOutputDescriptors,
  prepareComfyWorkflow,
  resolveComfyWorkflowBindings,
  validateComfyWorkflow,
} from './comfy-workflow.mjs';

function node(classType, inputs, title) {
  return {
    class_type: classType,
    inputs,
    ...(title ? { _meta: { title } } : {}),
  };
}

function markedWorkflow() {
  return {
    1: node('CLIPTextEncode', { text: 'old prompt', clip: ['20', 0] }, '正向 · QIANSI_PROMPT'),
    2: node('CLIPTextEncode', { text: 'old negative', clip: ['20', 0] }, 'QIANSI_NEGATIVE'),
    3: node('KSampler', { seed: 1, model: ['20', 0] }, 'QIANSI_SEED'),
    4: node('EmptyLatentImage', { width: 512, height: 512 }, 'QIANSI_WIDTH'),
    5: node('EmptyLatentImage', { width: 512, height: 512 }, 'QIANSI_HEIGHT'),
    6: node('VideoLength', { num_frames: 16 }, '参数 [QIANSI_FRAMES]'),
    7: node('VideoFps', { frame_rate: 8 }, 'QIANSI_FPS'),
    8: node('LoadImage', { image: 'old.png', upload: 'image' }, 'QIANSI_IMAGE'),
    9: node('LoadImage', { image: 'old-end.png', upload: 'image' }, 'QIANSI_END_IMAGE'),
    10: node('VHS_VideoCombine', { images: ['21', 0], frame_rate: 8 }, 'QIANSI_OUTPUT'),
    20: node('CheckpointLoaderSimple', { ckpt_name: 'model.safetensors' }),
    21: node('VAEDecode', { samples: ['3', 0], vae: ['20', 2] }),
  };
}

function legacyMarkedWorkflow() {
  const workflow = markedWorkflow();
  for (const value of Object.values(workflow)) {
    if (typeof value._meta?.title === 'string') {
      value._meta.title = value._meta.title.replaceAll('QIANSI_', 'KITTY_');
    }
  }
  return workflow;
}

test('validates a strict API-format workflow made of plain JSON nodes', () => {
  const workflow = markedWorkflow();
  assert.equal(validateComfyWorkflow(workflow), workflow);

  assert.throws(
    () => validateComfyWorkflow([]),
    (error) => error instanceof ComfyWorkflowValidationError && /plain object/.test(error.message),
  );
  assert.throws(
    () => validateComfyWorkflow({ 1: { class_type: 'LoadImage' } }),
    /inputs must be a plain object/,
  );
  assert.throws(
    () => validateComfyWorkflow({ 1: node('', {}) }),
    /class_type must be a non-empty string/,
  );
  assert.throws(
    () => validateComfyWorkflow({ 1: new (class CustomNode {})() }),
    /must be a plain object/,
  );
});

test('rejects prototype-pollution keys, accessor properties, cycles, and non-JSON values', () => {
  const pollutedKey = JSON.parse(
    '{"1":{"class_type":"LoadImage","inputs":{"__proto__":{"polluted":true}}}}',
  );
  assert.throws(() => validateComfyWorkflow(pollutedKey), /forbidden key: __proto__/);

  const constructorKey = JSON.parse(
    '{"1":{"class_type":"LoadImage","inputs":{"constructor":"bad"}}}',
  );
  assert.throws(() => validateComfyWorkflow(constructorKey), /forbidden key: constructor/);

  const prototypeKey = JSON.parse('{"1":{"class_type":"LoadImage","inputs":{"prototype":"bad"}}}');
  assert.throws(() => validateComfyWorkflow(prototypeKey), /forbidden key: prototype/);

  const changedPrototype = { 1: node('LoadImage', {}) };
  Object.setPrototypeOf(changedPrototype['1'].inputs, { polluted: true });
  assert.throws(() => validateComfyWorkflow(changedPrototype), /must be a plain object/);

  const accessor = node('LoadImage', {});
  Object.defineProperty(accessor.inputs, 'image', { enumerable: true, get: () => 'bad.png' });
  assert.throws(() => validateComfyWorkflow({ 1: accessor }), /enumerable data property/);

  const circular = node('LoadImage', {});
  circular.inputs.self = circular.inputs;
  assert.throws(() => validateComfyWorkflow({ 1: circular }), /circular reference/);

  assert.throws(
    () => validateComfyWorkflow({ 1: node('LoadImage', { strength: Number.NaN }) }),
    /finite numbers/,
  );
});

test('rejects workflows whose node count, depth, or total structure exceeds limits', () => {
  const tooManyNodes = {};
  for (let index = 0; index <= COMFY_WORKFLOW_LIMITS.maxNodes; index += 1) {
    tooManyNodes[String(index)] = node('PreviewImage', {});
  }
  assert.throws(() => validateComfyWorkflow(tooManyNodes), /exceeds 2048 nodes/);

  let nested = 'leaf';
  for (let index = 0; index < 70; index += 1) nested = { next: nested };
  assert.throws(
    () => validateComfyWorkflow({ 1: node('CustomNode', { nested }) }),
    /exceeds a depth of 64/,
  );

  const largeArray = Array.from({ length: 40 }, (_, index) => index);
  assert.throws(
    () => validateComfyWorkflow({ 1: node('CustomNode', { largeArray }) }, { maxValues: 20 }),
    /exceeds 20 values/,
  );
});

test('discovers every QIANSI binding marker and its output node', () => {
  const bindings = resolveComfyWorkflowBindings(markedWorkflow());

  assert.deepEqual(bindings.prompt, { nodeId: '1', input: 'text' });
  assert.deepEqual(bindings.negativePrompt, { nodeId: '2', input: 'text' });
  assert.deepEqual(bindings.seed, { nodeId: '3', input: 'seed' });
  assert.deepEqual(bindings.width, { nodeId: '4', input: 'width' });
  assert.deepEqual(bindings.height, { nodeId: '5', input: 'height' });
  assert.deepEqual(bindings.frames, { nodeId: '6', input: 'num_frames' });
  assert.deepEqual(bindings.fps, { nodeId: '7', input: 'frame_rate' });
  assert.deepEqual(bindings.image, { nodeId: '8', input: 'image' });
  assert.deepEqual(bindings.endImage, { nodeId: '9', input: 'image' });
  assert.deepEqual(bindings.output, { nodeId: '10' });
  assert.equal(getComfyOutputNodeId(markedWorkflow()), '10');
});

test('keeps legacy KITTY binding markers compatible with existing ComfyUI workflows', () => {
  const bindings = resolveComfyWorkflowBindings(legacyMarkedWorkflow());

  assert.deepEqual(bindings.prompt, { nodeId: '1', input: 'text' });
  assert.deepEqual(bindings.image, { nodeId: '8', input: 'image' });
  assert.deepEqual(bindings.output, { nodeId: '10' });
});

test('accepts explicit bindings metadata and lets it override title markers', () => {
  const workflow = markedWorkflow();
  workflow['30'] = node('PrimitiveInt', { value: 24 });
  workflow['31'] = node('SaveVideo', { video: ['21', 0] });
  const definition = {
    workflow,
    bindings: {
      QIANSI_FRAMES: ['30', 'value'],
      outputNodeId: '31',
    },
  };

  const bindings = resolveComfyWorkflowBindings(definition);
  assert.deepEqual(bindings.frames, { nodeId: '30', input: 'value' });
  assert.deepEqual(bindings.output, { nodeId: '31' });

  const overridden = resolveComfyWorkflowBindings(definition, {
    frames: { nodeId: '6', inputName: 'num_frames' },
    output: { node: '10' },
  });
  assert.deepEqual(overridden.frames, { nodeId: '6', input: 'num_frames' });
  assert.deepEqual(overridden.output, { nodeId: '10' });
});

test('rejects ambiguous automatic markers and invalid explicit bindings', () => {
  const duplicated = markedWorkflow();
  duplicated['11'] = node('CLIPTextEncode', { text: '' }, 'QIANSI_PROMPT');
  assert.throws(() => resolveComfyWorkflowBindings(duplicated), /multiple nodes are marked/);

  const workflow = markedWorkflow();
  assert.throws(
    () => resolveComfyWorkflowBindings(workflow, { prompt: ['404', 'text'] }),
    /missing node/,
  );
  assert.throws(
    () => resolveComfyWorkflowBindings(workflow, { prompt: ['1', 'missing'] }),
    /missing input/,
  );
  assert.throws(
    () => resolveComfyWorkflowBindings(workflow, { unsupported: ['1', 'text'] }),
    /unknown binding name/,
  );
});

test('strictly infers a common unmarked video workflow when every target is unambiguous', () => {
  const workflow = {
    1: node('CLIPTextEncode', { text: 'positive', clip: ['20', 0] }, 'Positive Prompt'),
    2: node('CLIPTextEncode', { text: 'negative', clip: ['20', 0] }, '负向提示词'),
    3: node('KSampler', { seed: 1, model: ['20', 0] }),
    4: node('EmptyLatentImage', { width: 512, height: 512 }),
    5: node('VideoLength', { num_frames: 49 }),
    6: node('VideoFps', { fps: 16 }),
    7: node('LoadImage', { image: 'first.png' }, '首帧'),
    8: node('LoadImage', { image: 'last.png' }, 'End frame'),
    9: node('VHS_VideoCombine', { images: ['21', 0] }),
    20: node('CheckpointLoaderSimple', { ckpt_name: 'model.safetensors' }),
    21: node('VAEDecode', { samples: ['3', 0], vae: ['20', 2] }),
  };

  assert.deepEqual(inferCommonComfyWorkflowBindings(workflow), {
    prompt: { nodeId: '1', input: 'text' },
    negativePrompt: { nodeId: '2', input: 'text' },
    seed: { nodeId: '3', input: 'seed' },
    width: { nodeId: '4', input: 'width' },
    height: { nodeId: '4', input: 'height' },
    frames: { nodeId: '5', input: 'num_frames' },
    fps: { nodeId: '6', input: 'fps' },
    image: { nodeId: '7', input: 'image' },
    endImage: { nodeId: '8', input: 'image' },
    output: { nodeId: '9' },
  });
});

test('infers a single prompt and LoadImage but rejects ambiguous common candidates', () => {
  const unique = {
    text: node('CLIPTextEncode', { text: 'prompt' }),
    image: node('LoadImage', { image: 'input.png' }),
    output: node('SaveVideo', { video: ['text', 0] }),
  };
  const bindings = inferCommonComfyWorkflowBindings(unique);
  assert.deepEqual(bindings.prompt, { nodeId: 'text', input: 'text' });
  assert.equal(bindings.negativePrompt, null);
  assert.deepEqual(bindings.image, { nodeId: 'image', input: 'image' });
  assert.equal(bindings.endImage, null);
  assert.deepEqual(bindings.output, { nodeId: 'output' });

  const ambiguousPrompts = {
    ...unique,
    anotherText: node('CLIPTextEncode', { text: 'another prompt' }),
  };
  assert.throws(
    () => inferCommonComfyWorkflowBindings(ambiguousPrompts),
    /ambiguous prompt binding candidates/,
  );

  const ambiguousOutputs = {
    ...unique,
    anotherOutput: node('VideoCombine', { video: ['text', 0] }),
  };
  assert.throws(
    () => inferCommonComfyWorkflowBindings(ambiguousOutputs),
    /ambiguous output binding candidates/,
  );
});

test('infers unmarked start and end images from their downstream video input names', () => {
  const workflow = {
    prompt: node('CLIPTextEncode', { text: 'make it move' }),
    end: node('LoadImage', { image: 'end.png' }),
    start: node('LoadImage', { image: 'start.png' }),
    video: node('ImageToVideo', {
      prompt: ['prompt', 0],
      start_image: ['start', 0],
      end_image: ['end', 0],
    }),
    output: node('SaveVideo', { video: ['video', 0] }),
  };

  const bindings = inferCommonComfyWorkflowBindings(workflow);
  assert.deepEqual(bindings.image, { nodeId: 'start', input: 'image' });
  assert.deepEqual(bindings.endImage, { nodeId: 'end', input: 'image' });
});

test('uses stable node order for exactly two unmarked image inputs in a video workflow', () => {
  const workflow = {
    prompt: node('CLIPTextEncode', { text: 'make it move' }),
    2: node('LoadImage', { image: 'first.png' }),
    10: node('LoadImage', { image: 'last.png' }),
    video: node('ImageToVideo', { left: ['2', 0], right: ['10', 0] }),
    output: node('SaveVideo', { video: ['video', 0] }),
  };

  const bindings = inferCommonComfyWorkflowBindings(workflow);
  assert.deepEqual(bindings.image, { nodeId: '2', input: 'image' });
  assert.deepEqual(bindings.endImage, { nodeId: '10', input: 'image' });
});

test('applies typed values and uploaded image descriptors to a deep clone', () => {
  const source = markedWorkflow();
  const applied = applyComfyWorkflowInputs(source, {
    prompt: '一只在云海飞行的白猫',
    negativePrompt: '水印，低清晰度',
    seed: 0,
    width: 1280,
    height: 720,
    frames: 81,
    fps: 24,
    uploadedImages: {
      startImage: { name: 'start.png', subfolder: 'kitty/input', type: 'input' },
      endImage: { filename: 'end.png', subfolder: 'kitty\\input', type: 'input' },
    },
  });

  assert.notEqual(applied, source);
  assert.notEqual(applied['1'], source['1']);
  assert.notEqual(applied['1'].inputs, source['1'].inputs);
  assert.equal(applied['1'].inputs.text, '一只在云海飞行的白猫');
  assert.equal(applied['2'].inputs.text, '水印，低清晰度');
  assert.equal(applied['3'].inputs.seed, 0);
  assert.equal(applied['4'].inputs.width, 1280);
  assert.equal(applied['5'].inputs.height, 720);
  assert.equal(applied['6'].inputs.num_frames, 81);
  assert.equal(applied['7'].inputs.frame_rate, 24);
  assert.equal(applied['8'].inputs.image, 'kitty/input/start.png');
  assert.equal(applied['9'].inputs.image, 'kitty/input/end.png');
  assert.equal(source['1'].inputs.text, 'old prompt');
  assert.equal(source['8'].inputs.image, 'old.png');
});

test('preserves unbound inputs and returns preparation metadata', () => {
  const source = {
    1: node('CLIPTextEncode', { text: 'before' }, 'QIANSI_PROMPT'),
    2: node('SaveVideo', { video: ['1', 0] }, 'QIANSI_OUTPUT'),
  };
  const prepared = prepareComfyWorkflow(source, {
    prompt: 'after',
    negativePrompt: 'ignored because the workflow has no negative binding',
    seed: 42,
  });

  assert.equal(prepared.workflow['1'].inputs.text, 'after');
  assert.equal(prepared.outputNodeId, '2');
  assert.deepEqual(prepared.bindings.output, { nodeId: '2' });
  assert.equal(source['1'].inputs.text, 'before');
});

test('validates values before applying them', () => {
  const workflow = markedWorkflow();
  assert.throws(() => applyComfyWorkflowInputs(workflow, { width: 0 }), /width must be an integer/);
  assert.throws(() => applyComfyWorkflowInputs(workflow, { fps: Number.NaN }), /fps must be/);
  assert.throws(
    () => applyComfyWorkflowInputs(workflow, { uploadedImages: { unknown: 'image.png' } }),
    /unknown uploadedImages field/,
  );
  assert.throws(
    () => applyComfyWorkflowInputs(workflow, { arbitrary: true }),
    /unknown workflow input value/,
  );
});

test('parses descriptors from all ComfyUI history output buckets', () => {
  const history = {
    promptA: {
      outputs: {
        10: {
          images: [
            { filename: 'preview.png', subfolder: 'preview', type: 'temp' },
            { filename: 'animation.webp', subfolder: '', type: 'output' },
          ],
          gifs: [{ filename: 'movie.mp4', subfolder: 'videos', type: 'output' }],
          videos: [{ filename: 'movie.WEBM', subfolder: 'videos', type: 'output' }],
          video: { filename: 'movie.mkv', subfolder: 'videos', type: 'output' },
          audio: [{ filename: 'sound.wav', subfolder: 'audio', type: 'output' }],
        },
        11: {
          videos: [{ filename: 'other.mov', subfolder: '', type: 'output' }],
        },
      },
    },
  };

  const descriptors = parseComfyHistoryOutputDescriptors(history, {
    promptId: 'promptA',
    outputNodeId: '10',
  });
  assert.deepEqual(
    descriptors.map(({ bucket, filename, subfolder, type }) => ({
      bucket,
      filename,
      subfolder,
      type,
    })),
    [
      { bucket: 'images', filename: 'preview.png', subfolder: 'preview', type: 'temp' },
      { bucket: 'images', filename: 'animation.webp', subfolder: '', type: 'output' },
      { bucket: 'gifs', filename: 'movie.mp4', subfolder: 'videos', type: 'output' },
      { bucket: 'video', filename: 'movie.mkv', subfolder: 'videos', type: 'output' },
      { bucket: 'videos', filename: 'movie.WEBM', subfolder: 'videos', type: 'output' },
      { bucket: 'audio', filename: 'sound.wav', subfolder: 'audio', type: 'output' },
    ],
  );
  assert.ok(descriptors.every((descriptor) => descriptor.promptId === 'promptA'));
  assert.ok(descriptors.every((descriptor) => descriptor.nodeId === '10'));
});

test('filters history descriptors to video extensions regardless of their bucket', () => {
  const history = {
    outputs: {
      output: {
        images: [{ filename: 'cover.png', subfolder: '', type: 'output' }],
        gifs: [{ filename: 'render.mp4', subfolder: 'videos', type: 'output' }],
        videos: [
          { filename: 'render.webm', subfolder: 'videos', type: 'output' },
          { filename: 'README.txt', subfolder: '', type: 'output' },
          { filename: '', subfolder: '', type: 'output' },
        ],
        audio: [{ filename: 'voice.wav', subfolder: 'audio', type: 'output' }],
      },
    },
  };

  assert.deepEqual(
    extractComfyVideoOutputs(history).map((descriptor) => descriptor.filename),
    ['render.mp4', 'render.webm', 'README.txt'],
  );
  assert.equal(isComfyVideoOutputFilename('clip.MOV'), true);
  assert.equal(isComfyVideoOutputFilename('clip.MKV'), true);
  assert.equal(isComfyVideoOutputFilename('clip.mp4.txt'), false);
  assert.equal(isComfyVideoOutputFilename('animation.webp'), false);
  assert.equal(isComfyVideoOutputFilename('cover.png'), false);
});

test('extracts audio and 3D outputs from singular, plural, and generic history buckets', () => {
  const history = {
    outputs: {
      audioNode: {
        audio: { filename: 'music.flac', subfolder: 'audio', type: 'output' },
        audios: [{ filename: 'voice.wav', subfolder: 'audio', type: 'output' }],
      },
      modelNode: {
        models: [{ filename: 'scene.glb', subfolder: '3d', type: 'output' }],
        meshes: [{ filename: 'character.obj', subfolder: '3d', type: 'output' }],
      },
    },
  };

  assert.deepEqual(
    extractComfyAudioOutputs(history).map((descriptor) => descriptor.filename),
    ['music.flac', 'voice.wav'],
  );
  assert.deepEqual(
    extractComfy3dOutputs(history).map((descriptor) => descriptor.filename),
    ['scene.glb', 'character.obj'],
  );
});

test('ignores malformed history output entries without hiding valid files', () => {
  const history = {
    promptA: {
      outputs: {
        10: {
          videos: [
            null,
            { filename: 123 },
            { filename: 'bad.mp4', subfolder: 123 },
            { filename: 'good.mp4', subfolder: '', type: 'output' },
          ],
        },
      },
    },
  };

  assert.deepEqual(
    extractComfyVideoOutputs(history).map((descriptor) => descriptor.filename),
    ['good.mp4'],
  );
  assert.deepEqual(extractComfyVideoOutputs(null), []);
});
