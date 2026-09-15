import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comfyVideoExtension,
  dedupeComfyWorkflowPresets,
  createComfyWorkflowPreset,
  inspectComfyWorkflowCompatibility,
  refreshComfyWorkflowValidation,
  isCloudComfyConnectionId,
  isComfyConnectionId,
  isRemoteComfyConnectionId,
  prepareComfy3dWorkflow,
  prepareComfyAudioWorkflow,
  prepareComfyVideoWorkflow,
  publicComfyWorkflow,
  upsertComfyWorkflowPreset,
} from './bridge-comfyui.mjs';

function workflow() {
  return {
    1: {
      class_type: 'CLIPTextEncode',
      inputs: { text: 'old prompt', clip: ['4', 1] },
      _meta: { title: 'QIANSI_PROMPT' },
    },
    2: {
      class_type: 'LoadImage',
      inputs: { image: 'old.png', upload: 'image' },
      _meta: { title: 'QIANSI_IMAGE' },
    },
    3: {
      class_type: 'EmptyHunyuanLatentVideo',
      inputs: { width: 640, height: 360, length: 81 },
      _meta: { title: 'QIANSI_FRAMES' },
    },
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
    9: {
      class_type: 'VHS_VideoCombine',
      inputs: { images: ['8', 0], frame_rate: 24 },
      _meta: { title: 'QIANSI_OUTPUT QIANSI_FPS' },
    },
  };
}

test('creates a video workflow preset with safe bindings and modes', () => {
  const preset = createComfyWorkflowPreset(
    { name: 'Wan 本地视频', workflow: workflow() },
    { id: 'comfy_12345678', now: 10 },
  );
  assert.equal(preset.name, 'Wan 本地视频');
  assert.equal(preset.connectionId, 'comfyui-local');
  assert.deepEqual(preset.modes, ['图生视频']);
  assert.equal(preset.bindings.prompt.nodeId, '1');
  assert.equal(preset.bindings.image.nodeId, '2');
  const summary = publicComfyWorkflow(preset);
  assert.equal(summary.defaultPrompt, 'old prompt');
  assert.equal(summary.supportsVideoReference, false);
  assert.equal(Object.hasOwn(summary, 'workflow'), false);
  assert.equal(Object.hasOwn(summary, 'bindings'), false);
});

test('marks a workflow compatible when node classes, inputs and link types still match', () => {
  const preset = createComfyWorkflowPreset(
    {
      name: '兼容图片工作流',
      workflow: {
        1: { class_type: 'PromptNode', inputs: { text: 'a cat' } },
        2: {
          class_type: 'SaveImage',
          inputs: { images: ['1', 0] },
          _meta: { title: 'QIANSI_OUTPUT' },
        },
      },
    },
    { id: 'comfy_compat001', now: 10 },
  );
  const compatibility = inspectComfyWorkflowCompatibility(preset, {
    PromptNode: {
      input: { required: { text: ['STRING', {}] } },
      output: ['IMAGE'],
    },
    SaveImage: {
      input: { required: { images: ['IMAGE', {}] } },
      output: [],
    },
  });

  assert.equal(compatibility.status, 'compatible');
  assert.deepEqual(compatibility.missingNodeClasses, []);
  assert.deepEqual(compatibility.typeMismatches, []);
});

test('reports missing nodes, renamed inputs, incompatible link types and missing models', () => {
  const preset = createComfyWorkflowPreset(
    {
      name: '失效工作流',
      workflow: {
        1: {
          class_type: 'PromptNode',
          inputs: { old_text: 'a cat' },
          _meta: { title: 'QIANSI_PROMPT' },
        },
        2: { class_type: 'MissingCustomNode', inputs: { strength: 1 } },
        3: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'gone.safetensors' } },
        4: {
          class_type: 'SaveImage',
          inputs: { images: ['1', 0] },
          _meta: { title: 'QIANSI_OUTPUT' },
        },
      },
    },
    { id: 'comfy_compat002', now: 10 },
  );
  const compatibility = inspectComfyWorkflowCompatibility(preset, {
    PromptNode: {
      input: { required: { text: ['STRING', {}] } },
      output: ['STRING'],
    },
    CheckpointLoaderSimple: {
      input: { required: { ckpt_name: [['present.safetensors'], {}] } },
      output: ['MODEL'],
    },
    SaveImage: {
      input: { required: { images: ['IMAGE', {}] } },
      output: [],
    },
  });

  assert.equal(compatibility.status, 'incompatible');
  assert.deepEqual(compatibility.missingNodeClasses, ['MissingCustomNode']);
  assert.ok(compatibility.missingInputs.some((issue) => issue.input === 'text'));
  assert.ok(compatibility.unknownInputs.some((issue) => issue.input === 'old_text'));
  assert.ok(compatibility.typeMismatches.some((issue) => issue.input === 'images'));
  assert.ok(compatibility.missingModels.some((issue) => issue.value === 'gone.safetensors'));
  assert.match(compatibility.message, /需要重新导入或迁移/);
});

test('leaves workflow compatibility unchecked when object info could not be read', () => {
  const preset = createComfyWorkflowPreset(
    { name: '离线兼容', workflow: workflow() },
    { id: 'comfy_compat003', now: 10 },
  );
  const compatibility = inspectComfyWorkflowCompatibility(preset, null);
  assert.equal(compatibility.status, 'unchecked');
});

test('stores a deterministic import fingerprint with source version, packages, signatures and models', () => {
  const preset = createComfyWorkflowPreset(
    {
      name: '带来源信息的工作流',
      workflow: workflow(),
      sourceFormat: 'layout',
      sourceVersion: '1.0',
      sourceMetadata: {
        nodePackages: [
          { id: 'comfyui-videohelpersuite', version: '1.6.0' },
          { id: 'comfy-core', version: '0.3.50' },
        ],
        models: [{ name: 'model.safetensors', directory: 'checkpoints' }],
      },
    },
    { id: 'comfy_fingerprint1', now: 10 },
  );

  assert.equal(preset.importFingerprint.sourceFormat, 'layout');
  assert.equal(preset.importFingerprint.sourceVersion, '1.0');
  assert.equal(preset.importFingerprint.workflowHash.length, 64);
  assert.equal(preset.importFingerprint.nodeSignatureHash.length, 64);
  assert.ok(
    preset.importFingerprint.nodeSignatures.some(
      (node) => node.nodeId === '1' && node.inputs.some((input) => input.name === 'text'),
    ),
  );
  assert.deepEqual(preset.importFingerprint.nodePackages, [
    { id: 'comfy-core', version: '0.3.50' },
    { id: 'comfyui-videohelpersuite', version: '1.6.0' },
  ]);
  assert.ok(
    preset.importFingerprint.modelDependencies.some(
      (model) => model.name === 'model.safetensors',
    ),
  );
});

test('refreshes and preserves a live compatibility fingerprint across backend upgrades', () => {
  const preset = createComfyWorkflowPreset(
    { name: '升级验证', workflow: workflow(), sourceFormat: 'api', sourceVersion: 'api' },
    { id: 'comfy_fingerprint2', now: 10 },
  );
  const objectInfo = Object.fromEntries(
    Object.values(workflow()).map((node) => [
      node.class_type,
      {
        input: {
          required: Object.fromEntries(
            Object.entries(node.inputs).map(([name, value]) => [
              name,
              [typeof value === 'number' ? 'INT' : typeof value === 'string' ? 'STRING' : '*', {}],
            ]),
          ),
        },
        output: ['*', '*'],
        python_module: 'nodes',
      },
    ]),
  );
  const first = refreshComfyWorkflowValidation(
    preset,
    { system: { comfyui_version: '0.3.50' }, features: { flags: ['a'] }, objectInfo },
    100,
  );
  const stable = refreshComfyWorkflowValidation(
    first,
    { system: { comfyui_version: '0.3.50' }, features: { flags: ['a'] }, objectInfo },
    200,
  );
  const upgraded = refreshComfyWorkflowValidation(
    stable,
    { system: { comfyui_version: '0.4.0' }, features: { flags: ['a'] }, objectInfo },
    300,
  );

  assert.equal(first.lastValidation.backendVersion, '0.3.50');
  assert.equal(first.lastValidation.checkedAt, 100);
  assert.equal(stable.lastValidation.checkedAt, 100);
  assert.equal(upgraded.lastValidation.backendVersion, '0.4.0');
  assert.equal(upgraded.lastValidation.checkedAt, 300);
  assert.notEqual(upgraded.lastValidation.fingerprint, first.lastValidation.fingerprint);
});

test('deduplicates equivalent workflows while ignoring display metadata and property order', () => {
  const first = createComfyWorkflowPreset(
    { name: 'first', workflow: workflow() },
    { id: 'comfy_duplicate1', now: 10 },
  );
  const reordered = Object.fromEntries(
    Object.entries(workflow()).map(([nodeId, node]) => [
      nodeId,
      {
        inputs: Object.fromEntries(Object.entries(node.inputs || {}).reverse()),
        class_type: node.class_type,
        _meta: {
          title: `${node._meta?.title || ''} translated ${nodeId}`,
          models: [{ url: 'https://example.com/model' }],
        },
      },
    ]),
  );
  const second = createComfyWorkflowPreset(
    { name: 'second', workflow: reordered },
    { id: 'comfy_duplicate2', now: 20 },
  );
  assert.deepEqual(dedupeComfyWorkflowPresets([first, second]), [first]);
});

test('reuses the existing id when the same workflow is uploaded again', () => {
  const first = createComfyWorkflowPreset(
    { name: '旧名称', workflow: workflow() },
    { id: 'comfy_existing1', now: 10 },
  );
  const incoming = createComfyWorkflowPreset(
    { name: '新名称', workflow: workflow() },
    { id: 'comfy_incoming1', now: 20 },
  );
  const result = upsertComfyWorkflowPreset([first], incoming);
  assert.equal(result.reused, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.preset.id, first.id);
  assert.equal(result.preset.name, '新名称');
  assert.equal(result.preset.createdAt, first.createdAt);
  assert.equal(result.preset.updatedAt, incoming.updatedAt);
});

test('keeps identical local and remote workflows in separate connection scopes', () => {
  const local = createComfyWorkflowPreset(
    { name: '本地工作流', workflow: workflow() },
    { id: 'comfy_scopelocal', connectionId: 'comfyui-local', now: 10 },
  );
  const remote = createComfyWorkflowPreset(
    { name: '远程工作流', workflow: workflow() },
    { id: 'comfy_scoperemote', connectionId: 'comfyui-remote', now: 20 },
  );
  const result = upsertComfyWorkflowPreset([local], remote);

  assert.equal(result.reused, false);
  assert.deepEqual(
    result.items.map((item) => item.connectionId),
    ['comfyui-remote', 'comfyui-local'],
  );
});

test('accepts bounded dynamic remote ComfyUI connection ids and rejects unrelated ids', () => {
  const dynamicId = 'comfyui-remote-s12-a1b2c3d4';
  const remote = createComfyWorkflowPreset(
    { name: '远程实例工作流', workflow: workflow() },
    { id: 'comfy_dynamic01', connectionId: dynamicId, now: 30 },
  );

  assert.equal(remote.connectionId, dynamicId);
  assert.equal(isComfyConnectionId('comfyui-local'), true);
  assert.equal(isComfyConnectionId('comfyui-remote'), true);
  assert.equal(isComfyConnectionId('comfyui-cloud'), true);
  assert.equal(isCloudComfyConnectionId('comfyui-cloud'), true);
  assert.equal(isCloudComfyConnectionId(dynamicId), false);
  assert.equal(isComfyConnectionId(dynamicId), true);
  assert.equal(isRemoteComfyConnectionId(dynamicId), true);
  assert.equal(isRemoteComfyConnectionId('comfyui-local'), false);
  assert.equal(isComfyConnectionId('custom-openai'), false);
  assert.throws(
    () =>
      createComfyWorkflowPreset(
        { name: '越界工作流', workflow: workflow() },
        { id: 'comfy_invalid01', connectionId: '../comfyui-remote', now: 40 },
      ),
    /连接类型无效/,
  );
});

test('creates and prepares an audio workflow with a replaceable audio input', () => {
  const preset = createComfyWorkflowPreset(
    {
      name: '音频重混',
      workflow: {
        1: {
          class_type: 'TextEncode',
          inputs: { text: 'old prompt' },
          _meta: { title: 'QIANSI_PROMPT' },
        },
        2: {
          class_type: 'LoadAudio',
          inputs: { audio: 'old.wav' },
          _meta: { title: 'QIANSI_AUDIO' },
        },
        3: {
          class_type: 'SaveAudio',
          inputs: { audio: ['2', 0] },
          _meta: { title: 'QIANSI_OUTPUT' },
        },
      },
    },
    { id: 'comfy_audio001', now: 10 },
  );
  assert.equal(preset.kind, 'audio');
  assert.equal(publicComfyWorkflow(preset).supportsAudioReference, true);
  const prepared = prepareComfyAudioWorkflow(preset, {
    prompt: '重新编曲',
    uploadedAudio: 'qiansi/source.wav',
  });
  assert.equal(prepared.workflow[1].inputs.text, '重新编曲');
  assert.equal(prepared.workflow[2].inputs.audio, 'qiansi/source.wav');
});

test('creates an image-conditioned 3D workflow without requiring a text prompt', () => {
  const preset = createComfyWorkflowPreset(
    {
      name: '图片转 GLB',
      workflow: {
        1: {
          class_type: 'LoadImage',
          inputs: { image: 'old.png' },
          _meta: { title: 'QIANSI_IMAGE' },
        },
        2: {
          class_type: 'SaveGLB',
          inputs: { mesh: ['1', 0] },
          _meta: { title: 'QIANSI_OUTPUT' },
        },
      },
    },
    { id: 'comfy_3d000001', now: 10 },
  );
  assert.equal(preset.kind, '3d');
  assert.equal(publicComfyWorkflow(preset).supportsImageReference, true);
  const prepared = prepareComfy3dWorkflow(preset, {
    uploadedImages: ['qiansi/object.png'],
  });
  assert.equal(prepared.workflow[1].inputs.image, 'qiansi/object.png');
});

test('uses one conservative mode so exported placeholder images are never reused silently', () => {
  const source = workflow();
  source[6] = {
    class_type: 'LoadImage',
    inputs: { image: 'old-end.png', upload: 'image' },
    _meta: { title: 'QIANSI_END_IMAGE' },
  };
  const preset = createComfyWorkflowPreset(
    { name: '首尾帧', workflow: source },
    { id: 'comfy_bothframe', now: 10 },
  );
  assert.deepEqual(preset.modes, ['首尾帧']);
});

test('recognizes numbered MiniMax H3 reference inputs as multi-image reference video', () => {
  const source = {
    14: { class_type: 'LoadImage', inputs: { image: 'reference-1.png' } },
    18: { class_type: 'LoadImage', inputs: { image: 'reference-2.png' } },
    17: {
      class_type: 'MiniMaxH3ReferenceToVideo',
      inputs: {
        prompt: 'two subjects walk forward',
        ref_image_0: ['14', 0],
        ref_image_1: ['18', 0],
      },
    },
    20: { class_type: 'SaveVideo', inputs: { video: ['17', 0] } },
  };
  const preset = createComfyWorkflowPreset(
    { name: 'MiniMax H3 多图参考', workflow: source },
    { id: 'comfy_multiref1', now: 10 },
  );

  assert.deepEqual(preset.modes, ['图片参考']);
  assert.equal(preset.bindings.image.nodeId, '14');
  assert.equal(preset.bindings.endImage.nodeId, '18');
  const prepared = prepareComfyVideoWorkflow(preset, {
    prompt: 'keep both referenced subjects recognizable',
    uploadedImages: ['qiansi/reference-1.png', 'qiansi/reference-2.png'],
  });
  assert.equal(prepared.workflow[14].inputs.image, 'qiansi/reference-1.png');
  assert.equal(prepared.workflow[18].inputs.image, 'qiansi/reference-2.png');
});

test('classifies a SaveImage workflow as an image workflow and accepts Krea prompt nodes', () => {
  const source = {
    1: {
      class_type: 'Krea2EditGroundedEncode',
      inputs: { prompt: 'four-view character sheet' },
      _meta: { title: 'Krea2 Edit' },
    },
    2: {
      class_type: 'SaveImage',
      inputs: { images: ['1', 0] },
      _meta: { title: 'QIANSI_OUTPUT' },
    },
  };
  const preset = createComfyWorkflowPreset(
    { name: '四视图', workflow: source },
    { id: 'comfy_image001', now: 10 },
  );
  assert.equal(preset.kind, 'image');
  assert.deepEqual(preset.bindings.prompt, { nodeId: '1', input: 'prompt' });
});

test('accepts a prompt input exposed directly by a video-generation node', () => {
  const source = {
    1: {
      class_type: 'MiniMaxH3ImageToVideo',
      inputs: { prompt: 'camera pushes in', image: ['3', 0] },
    },
    2: { class_type: 'SaveVideo', inputs: { video: ['1', 0] } },
    3: { class_type: 'LoadImage', inputs: { image: 'start.png' } },
  };
  const preset = createComfyWorkflowPreset(
    { name: 'MiniMax H3', workflow: source },
    { id: 'comfy_minimaxh3', now: 10 },
  );
  assert.equal(preset.kind, 'video');
  assert.deepEqual(preset.bindings.prompt, { nodeId: '1', input: 'prompt' });
});

test('repairs a uniquely inferable model link omitted from a model-only LoRA export', () => {
  const source = {
    6: { class_type: 'UNETLoader', inputs: { unet_name: 'h3.safetensors' } },
    19: {
      class_type: 'LoraLoaderModelOnly',
      inputs: { lora_name: 'turbo.safetensors', strength_model: 0.75 },
    },
    11: { class_type: 'BasicGuider', inputs: { model: ['19', 0], conditioning: ['1', 0] } },
    1: { class_type: 'Conditioning', inputs: { text: 'prompt' } },
    20: { class_type: 'SaveVideo', inputs: { video: ['11', 0] } },
  };
  const preset = createComfyWorkflowPreset(
    { name: '缺少 LoRA 模型连线', workflow: source },
    { id: 'comfy_lora_repair', now: 10 },
  );
  assert.deepEqual(preset.workflow[19].inputs.model, ['6', 0]);
});

test('does not guess a model link when more than one model producer exists', () => {
  const source = {
    6: { class_type: 'UNETLoader', inputs: { unet_name: 'h3-a.safetensors' } },
    7: { class_type: 'UNETLoader', inputs: { unet_name: 'h3-b.safetensors' } },
    19: {
      class_type: 'LoraLoaderModelOnly',
      inputs: { lora_name: 'turbo.safetensors', strength_model: 0.75 },
    },
    1: { class_type: 'Conditioning', inputs: { text: 'prompt' } },
    11: { class_type: 'BasicGuider', inputs: { model: ['19', 0], conditioning: ['1', 0] } },
    20: { class_type: 'SaveVideo', inputs: { video: ['11', 0] } },
  };
  const preset = createComfyWorkflowPreset(
    { name: '保留未决模型连线', workflow: source },
    { id: 'comfy_lora_repair2', now: 10 },
  );
  assert.equal(Object.hasOwn(preset.workflow[19].inputs, 'model'), false);
});

test('drops an unreferenced display-only placeholder from a valid image API export', () => {
  const source = {
    1: {
      class_type: 'Krea2EditGroundedEncode',
      inputs: { prompt: 'four-view character sheet' },
    },
    2: { class_type: 'SaveImage', inputs: { images: ['1', 0] } },
    34: { inputs: {}, _meta: { title: 'display placeholder' } },
  };
  const preset = createComfyWorkflowPreset(
    { name: '四视图', workflow: source },
    { id: 'comfy_image002', now: 10 },
  );
  assert.equal(preset.kind, 'image');
  assert.equal(preset.workflow[34], undefined);
});

test('recognizes a fused video character-replacement workflow', () => {
  const source = workflow();
  delete source[2];
  source[10] = {
    class_type: 'VHS_LoadVideo',
    inputs: { video: 'old.mp4' },
    _meta: { title: 'QIANSI_SOURCE_VIDEO' },
  };
  source[11] = {
    class_type: 'LoadImage',
    inputs: { image: 'character.png' },
    _meta: { title: 'QIANSI_CHARACTER_IMAGE' },
  };
  source[12] = {
    class_type: 'LoadImage',
    inputs: { image: 'mask.png' },
    _meta: { title: 'QIANSI_MASK' },
  };
  const preset = createComfyWorkflowPreset(
    { name: '人物替换', workflow: source },
    { id: 'comfy_replace1', now: 10 },
  );
  assert.deepEqual(preset.modes, ['视频换人物']);
  assert.equal(preset.bindings.sourceVideo.nodeId, '10');
  assert.equal(preset.bindings.characterImage.nodeId, '11');
  assert.equal(preset.bindings.mask.nodeId, '12');
  assert.equal(publicComfyWorkflow(preset).supportsVideoReference, true);
  const prepared = prepareComfyVideoWorkflow(preset, {
    prompt: '保持动作，只替换人物',
    uploadedVideo: 'source.mp4',
    uploadedCharacterImage: 'character.png',
    uploadedMask: 'mask.png',
    duration: 5,
    fps: 24,
  });
  assert.equal(prepared.workflow[10].inputs.video, 'source.mp4');
  assert.equal(prepared.workflow[11].inputs.image, 'character.png');
  assert.equal(prepared.workflow[12].inputs.image, 'mask.png');
});

test('injects only explicitly bound workflow values', () => {
  const preset = createComfyWorkflowPreset(
    { name: 'Wan', workflow: workflow() },
    { id: 'comfy_abcdefgh', now: 10 },
  );
  const prepared = prepareComfyVideoWorkflow(preset, {
    prompt: 'a cinematic shot',
    uploadedImages: ['kitty/start.png'],
    duration: 5,
    fps: 24,
    aspectRatio: '16:9',
    resolution: '720P',
    seed: 42,
  });
  assert.equal(prepared.workflow[1].inputs.text, 'a cinematic shot');
  assert.equal(prepared.workflow[2].inputs.image, 'kitty/start.png');
  assert.equal(prepared.workflow[3].inputs.length, 120);
  assert.equal(prepared.workflow[3].inputs.width, 640);
  assert.equal(prepared.workflow[3].inputs.height, 360);
});

test('rejects unsupported video output formats', () => {
  assert.equal(comfyVideoExtension('result.mp4'), '.mp4');
  assert.equal(comfyVideoExtension('result.mkv'), '.mkv');
  assert.throws(() => comfyVideoExtension('result.gif'), /暂不支持/);
});

test('keeps workflow defaults when optional numeric bindings are ambiguous', () => {
  const source = workflow();
  source[5] = { class_type: 'KSampler', inputs: { seed: 11 } };
  source[6] = { class_type: 'RandomNoise', inputs: { noise_seed: 22 } };
  const preset = createComfyWorkflowPreset(
    { name: '双采样工作流', workflow: source },
    { id: 'comfy_optional1', now: 10 },
  );
  assert.equal(preset.bindings.seed, undefined);
  assert.equal(preset.workflow[5].inputs.seed, 11);
  assert.equal(preset.workflow[6].inputs.noise_seed, 22);
});

test('requires frame count and frame rate bindings as a pair', () => {
  const source = workflow();
  source[9]._meta.title = 'QIANSI_OUTPUT';
  assert.throws(
    () =>
      createComfyWorkflowPreset(
        { name: '帧数不完整', workflow: source },
        { id: 'comfy_framepair', now: 10 },
      ),
    /QIANSI_FRAMES.*QIANSI_FPS/,
  );
});

test('requires an explicit final output when multiple video outputs exist', () => {
  const source = workflow();
  delete source[9]._meta;
  source[10] = {
    class_type: 'SaveVideo',
    inputs: { video: ['8', 0] },
  };
  assert.throws(
    () =>
      createComfyWorkflowPreset(
        { name: '多个输出', workflow: source },
        { id: 'comfy_outputs1', now: 10 },
      ),
    /QIANSI_OUTPUT/,
  );
});
