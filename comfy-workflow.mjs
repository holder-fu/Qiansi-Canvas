const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const COMFY_WORKFLOW_LIMITS = Object.freeze({
  maxNodes: 2048,
  maxValues: 100_000,
  maxDepth: 64,
  maxStringCharacters: 4 * 1024 * 1024,
});

export const COMFY_BINDING_MARKERS = Object.freeze({
  prompt: 'QIANSI_PROMPT',
  negativePrompt: 'QIANSI_NEGATIVE',
  seed: 'QIANSI_SEED',
  width: 'QIANSI_WIDTH',
  height: 'QIANSI_HEIGHT',
  frames: 'QIANSI_FRAMES',
  fps: 'QIANSI_FPS',
  image: 'QIANSI_IMAGE',
  endImage: 'QIANSI_END_IMAGE',
  sourceVideo: 'QIANSI_SOURCE_VIDEO',
  characterImage: 'QIANSI_CHARACTER_IMAGE',
  mask: 'QIANSI_MASK',
  audio: 'QIANSI_AUDIO',
  output: 'QIANSI_OUTPUT',
});

const LEGACY_COMFY_BINDING_MARKERS = Object.freeze({
  prompt: 'KITTY_PROMPT',
  negativePrompt: 'KITTY_NEGATIVE',
  seed: 'KITTY_SEED',
  width: 'KITTY_WIDTH',
  height: 'KITTY_HEIGHT',
  frames: 'KITTY_FRAMES',
  fps: 'KITTY_FPS',
  image: 'KITTY_IMAGE',
  endImage: 'KITTY_END_IMAGE',
  sourceVideo: 'KITTY_SOURCE_VIDEO',
  characterImage: 'KITTY_CHARACTER_IMAGE',
  mask: 'KITTY_MASK',
  audio: 'KITTY_AUDIO',
  output: 'KITTY_OUTPUT',
});

const COMFY_BINDING_MARKER_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.keys(COMFY_BINDING_MARKERS).map((name) => [
      name,
      [COMFY_BINDING_MARKERS[name], LEGACY_COMFY_BINDING_MARKERS[name]],
    ]),
  ),
);

const INPUT_BINDING_NAMES = Object.freeze(
  Object.keys(COMFY_BINDING_MARKERS).filter((name) => name !== 'output'),
);
const OPTIONAL_BINDING_NAMES = new Set(['sourceVideo', 'characterImage', 'mask', 'audio']);

const PREFERRED_INPUTS = Object.freeze({
  prompt: ['text', 'prompt', 'positive', 'value'],
  negativePrompt: ['text', 'negative_prompt', 'negative', 'prompt', 'value'],
  seed: ['seed', 'noise_seed', 'value'],
  width: ['width', 'value'],
  height: ['height', 'value'],
  frames: ['frames', 'num_frames', 'video_frames', 'length', 'value'],
  fps: ['fps', 'frame_rate', 'value'],
  image: ['image', 'start_image', 'first_image', 'value'],
  endImage: ['end_image', 'last_image', 'image', 'value'],
  sourceVideo: ['video', 'source_video', 'input_video', 'value'],
  characterImage: ['character_image', 'reference_image', 'image', 'value'],
  mask: ['mask', 'mask_image', 'value'],
  audio: ['audio', 'audio_file', 'source_audio', 'input_audio', 'value'],
});

const EXPLICIT_BINDING_ALIASES = Object.freeze({
  prompt: 'prompt',
  QIANSI_PROMPT: 'prompt',
  KITTY_PROMPT: 'prompt',
  negative: 'negativePrompt',
  negativePrompt: 'negativePrompt',
  QIANSI_NEGATIVE: 'negativePrompt',
  KITTY_NEGATIVE: 'negativePrompt',
  seed: 'seed',
  QIANSI_SEED: 'seed',
  KITTY_SEED: 'seed',
  width: 'width',
  QIANSI_WIDTH: 'width',
  KITTY_WIDTH: 'width',
  height: 'height',
  QIANSI_HEIGHT: 'height',
  KITTY_HEIGHT: 'height',
  frames: 'frames',
  QIANSI_FRAMES: 'frames',
  KITTY_FRAMES: 'frames',
  fps: 'fps',
  QIANSI_FPS: 'fps',
  KITTY_FPS: 'fps',
  image: 'image',
  startImage: 'image',
  QIANSI_IMAGE: 'image',
  KITTY_IMAGE: 'image',
  endImage: 'endImage',
  QIANSI_END_IMAGE: 'endImage',
  KITTY_END_IMAGE: 'endImage',
  sourceVideo: 'sourceVideo',
  QIANSI_SOURCE_VIDEO: 'sourceVideo',
  KITTY_SOURCE_VIDEO: 'sourceVideo',
  characterImage: 'characterImage',
  characterReference: 'characterImage',
  QIANSI_CHARACTER_IMAGE: 'characterImage',
  KITTY_CHARACTER_IMAGE: 'characterImage',
  mask: 'mask',
  QIANSI_MASK: 'mask',
  KITTY_MASK: 'mask',
  audio: 'audio',
  QIANSI_AUDIO: 'audio',
  KITTY_AUDIO: 'audio',
  output: 'output',
  outputNodeId: 'output',
  QIANSI_OUTPUT: 'output',
  KITTY_OUTPUT: 'output',
});

const HISTORY_BUCKETS = Object.freeze([
  'images',
  'gifs',
  'video',
  'videos',
  'audio',
  'audios',
  '3d',
  'models',
  'meshes',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.mkv',
  '.avi',
  '.mpeg',
  '.mpg',
  '.ogv',
  '.3gp',
  '.3g2',
  '.ts',
  '.mts',
  '.m2ts',
]);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus']);
const MODEL_3D_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.ply', '.stl', '.fbx', '.usdz']);

export class ComfyWorkflowValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'ComfyWorkflowValidationError';
  }
}

function fail(message) {
  throw new ComfyWorkflowValidationError(message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataEntries(value, path) {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries = [];

  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') fail(`${path} cannot contain symbol keys`);
    if (FORBIDDEN_KEYS.has(key)) fail(`${path} contains a forbidden key: ${key}`);

    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(`${path}.${key} must be an enumerable data property`);
    }
    entries.push([key, descriptor.value]);
  }

  return entries;
}

function validateJsonTree(root, limits) {
  const seen = new WeakSet();
  const stack = [{ value: root, depth: 0, path: 'workflow' }];
  let values = 0;
  let stringCharacters = 0;

  while (stack.length) {
    const { value, depth, path } = stack.pop();
    values += 1;
    if (values > limits.maxValues) fail(`workflow exceeds ${limits.maxValues} values`);
    if (depth > limits.maxDepth) fail(`workflow exceeds a depth of ${limits.maxDepth}`);

    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail(`${path} must contain only finite numbers`);
      continue;
    }
    if (typeof value === 'string') {
      stringCharacters += value.length;
      if (stringCharacters > limits.maxStringCharacters) {
        fail(`workflow exceeds ${limits.maxStringCharacters} string characters`);
      }
      continue;
    }
    if (typeof value !== 'object') fail(`${path} contains a non-JSON value`);
    if (seen.has(value)) fail(`${path} contains a circular reference`);
    seen.add(value);

    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          fail(`${path} must not contain sparse or accessor array entries`);
        }
        stack.push({ value: descriptor.value, depth: depth + 1, path: `${path}[${index}]` });
      }
      const extraKeys = Reflect.ownKeys(descriptors).filter(
        (key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(String(key)),
      );
      if (extraKeys.length) fail(`${path} cannot contain custom array properties`);
      continue;
    }

    if (!isPlainObject(value)) fail(`${path} must be a plain object`);
    const entries = ownDataEntries(value, path);
    for (const [key, child] of entries) {
      stringCharacters += key.length;
      if (stringCharacters > limits.maxStringCharacters) {
        fail(`workflow exceeds ${limits.maxStringCharacters} string characters`);
      }
      stack.push({ value: child, depth: depth + 1, path: `${path}.${key}` });
    }
  }
}

function normalizedLimits(options) {
  const limits = { ...COMFY_WORKFLOW_LIMITS };
  if (options === undefined) return limits;
  if (!isPlainObject(options)) fail('validation options must be a plain object');

  for (const [key, value] of ownDataEntries(options, 'options')) {
    if (!Object.hasOwn(limits, key)) fail(`unknown validation limit: ${key}`);
    if (!Number.isSafeInteger(value) || value < 1) fail(`${key} must be a positive integer`);
    limits[key] = value;
  }
  return limits;
}

export function validateComfyWorkflow(workflow, options) {
  if (!isPlainObject(workflow)) fail('workflow must be a plain object');
  const limits = normalizedLimits(options);
  const nodes = ownDataEntries(workflow, 'workflow');
  if (!nodes.length) fail('workflow must contain at least one node');
  if (nodes.length > limits.maxNodes) fail(`workflow exceeds ${limits.maxNodes} nodes`);

  validateJsonTree(workflow, limits);

  for (const [nodeId, node] of nodes) {
    if (!nodeId || nodeId.length > 256) fail('workflow node IDs must be 1-256 characters');
    if (!isPlainObject(node)) fail(`workflow.${nodeId} must be a plain object`);
    if (typeof node.class_type !== 'string' || !node.class_type.trim()) {
      fail(`workflow.${nodeId}.class_type must be a non-empty string`);
    }
    if (node.class_type.length > 256) fail(`workflow.${nodeId}.class_type is too long`);
    if (!isPlainObject(node.inputs)) fail(`workflow.${nodeId}.inputs must be a plain object`);
    if (Object.hasOwn(node, '_meta')) {
      if (!isPlainObject(node._meta)) fail(`workflow.${nodeId}._meta must be a plain object`);
      if (Object.hasOwn(node._meta, 'title') && typeof node._meta.title !== 'string') {
        fail(`workflow.${nodeId}._meta.title must be a string`);
      }
    }
  }

  return workflow;
}

function deepCloneJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepCloneJson);

  const clone = Object.create(Object.getPrototypeOf(value));
  for (const [key, child] of ownDataEntries(value, 'workflow')) {
    Object.defineProperty(clone, key, {
      value: deepCloneJson(child),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return clone;
}

function titleHasMarker(title, marker) {
  const normalized = title.toUpperCase();
  const index = normalized.indexOf(marker);
  if (index < 0) return false;
  const before = normalized[index - 1];
  const after = normalized[index + marker.length];
  return (!before || !/[A-Z0-9_]/.test(before)) && (!after || !/[A-Z0-9_]/.test(after));
}

function looksLikeNodeLink(value, workflow) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number') &&
    Number.isInteger(value[1]) &&
    Object.hasOwn(workflow, String(value[0]))
  );
}

function inferInputName(workflow, bindingName, nodeId) {
  const inputs = workflow[nodeId].inputs;
  const keys = Object.keys(inputs);
  const byLowerCase = new Map(keys.map((key) => [key.toLowerCase(), key]));

  for (const preferred of PREFERRED_INPUTS[bindingName]) {
    const actual = byLowerCase.get(preferred);
    if (actual && !looksLikeNodeLink(inputs[actual], workflow)) return actual;
  }

  const widgetInputs = keys.filter((key) => !looksLikeNodeLink(inputs[key], workflow));
  if (widgetInputs.length === 1) return widgetInputs[0];
  fail(
    `cannot infer the input for ${COMFY_BINDING_MARKERS[bindingName]} on node ${nodeId}; ` +
      'provide an explicit binding',
  );
}

function explicitBindingEntries(bindings) {
  if (bindings === undefined || bindings === null) return [];
  if (!isPlainObject(bindings)) fail('bindings must be a plain object');
  return ownDataEntries(bindings, 'bindings');
}

function normalizeExplicitBinding(workflow, bindingName, raw) {
  let nodeId;
  let input;

  if (bindingName === 'output' && (typeof raw === 'string' || typeof raw === 'number')) {
    nodeId = String(raw);
  } else if (Array.isArray(raw)) {
    if (raw.length !== 2) fail(`${bindingName} binding tuples must contain [nodeId, input]`);
    [nodeId, input] = raw;
    nodeId = String(nodeId);
  } else if (isPlainObject(raw)) {
    const entries = ownDataEntries(raw, `bindings.${bindingName}`);
    const allowed = new Set(['nodeId', 'node', 'input', 'inputName']);
    for (const [key] of entries) {
      if (!allowed.has(key)) fail(`unknown ${bindingName} binding field: ${key}`);
    }
    nodeId = raw.nodeId ?? raw.node;
    input = raw.input ?? raw.inputName;
    if (nodeId !== undefined) nodeId = String(nodeId);
  } else {
    fail(`${bindingName} binding must identify a node and input`);
  }

  if (!nodeId || !Object.hasOwn(workflow, nodeId)) {
    fail(`${bindingName} binding refers to a missing node: ${nodeId || '(empty)'}`);
  }
  if (bindingName === 'output') return { nodeId };
  if (typeof input !== 'string' || !input || FORBIDDEN_KEYS.has(input)) {
    fail(`${bindingName} binding must include a valid input name`);
  }
  if (!Object.hasOwn(workflow[nodeId].inputs, input)) {
    fail(`${bindingName} binding refers to a missing input: ${nodeId}.${input}`);
  }
  return { nodeId, input };
}

function unwrapWorkflowDefinition(workflowOrDefinition, additionalBindings) {
  let workflow = workflowOrDefinition;
  let bindings;

  if (
    isPlainObject(workflowOrDefinition) &&
    Object.hasOwn(workflowOrDefinition, 'workflow') &&
    isPlainObject(workflowOrDefinition.workflow)
  ) {
    const allowed = new Set(['workflow', 'bindings']);
    for (const [key] of ownDataEntries(workflowOrDefinition, 'definition')) {
      if (!allowed.has(key)) fail(`unknown workflow definition field: ${key}`);
    }
    workflow = workflowOrDefinition.workflow;
    bindings = workflowOrDefinition.bindings;
  }

  if (additionalBindings !== undefined) {
    const combined = Object.create(null);
    for (const [key, value] of explicitBindingEntries(bindings)) combined[key] = value;
    for (const [key, value] of explicitBindingEntries(additionalBindings)) {
      const canonicalName = EXPLICIT_BINDING_ALIASES[key];
      if (canonicalName) {
        for (const existingKey of Object.keys(combined)) {
          if (EXPLICIT_BINDING_ALIASES[existingKey] === canonicalName) delete combined[existingKey];
        }
      }
      combined[key] = value;
    }
    bindings = combined;
  }

  validateComfyWorkflow(workflow);
  return { workflow, bindings };
}

export function resolveComfyWorkflowBindings(workflowOrDefinition, explicitBindings) {
  const { workflow, bindings } = unwrapWorkflowDefinition(workflowOrDefinition, explicitBindings);
  const resolved = Object.fromEntries(
    Object.keys(COMFY_BINDING_MARKERS).map((bindingName) => [bindingName, null]),
  );

  for (const [nodeId, node] of Object.entries(workflow)) {
    const title = node._meta?.title;
    if (typeof title !== 'string') continue;

    for (const [bindingName, markers] of Object.entries(COMFY_BINDING_MARKER_ALIASES)) {
      const marker = markers.find((candidate) => titleHasMarker(title, candidate));
      if (!marker) continue;
      if (resolved[bindingName]) {
        fail(`multiple nodes are marked ${COMFY_BINDING_MARKERS[bindingName]}`);
      }
      resolved[bindingName] =
        bindingName === 'output'
          ? { nodeId }
          : { nodeId, input: inferInputName(workflow, bindingName, nodeId) };
    }
  }

  const explicitNames = new Set();
  for (const [rawName, rawBinding] of explicitBindingEntries(bindings)) {
    const bindingName = EXPLICIT_BINDING_ALIASES[rawName];
    if (!bindingName) fail(`unknown binding name: ${rawName}`);
    if (explicitNames.has(bindingName)) fail(`binding ${bindingName} is declared more than once`);
    explicitNames.add(bindingName);
    resolved[bindingName] = normalizeExplicitBinding(workflow, bindingName, rawBinding);
  }

  return Object.fromEntries(
    Object.entries(resolved).filter(
      ([bindingName, value]) => value || !OPTIONAL_BINDING_NAMES.has(bindingName),
    ),
  );
}

function uniqueInferredBinding(candidates, bindingName) {
  if (candidates.length > 1) {
    const locations = candidates.map(({ nodeId, input }) => `${nodeId}.${input}`).join(', ');
    fail(`ambiguous ${bindingName} binding candidates: ${locations}`);
  }
  return candidates[0] ?? null;
}

function candidateInputs(workflow, inputNames, predicate = () => true) {
  const normalizedNames = new Set(inputNames.map((name) => name.toLowerCase()));
  const candidates = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    for (const [input, value] of Object.entries(node.inputs)) {
      if (
        normalizedNames.has(input.toLowerCase()) &&
        !looksLikeNodeLink(value, workflow) &&
        predicate({ nodeId, node, input, value })
      ) {
        candidates.push({ nodeId, input });
      }
    }
  }
  return candidates;
}

function normalizedNodeLabel(node) {
  return `${node.class_type} ${node._meta?.title ?? ''}`.toLowerCase();
}

function inferTextBindings(workflow, resolved) {
  if (resolved.prompt && resolved.negativePrompt) return;
  const used = new Set(
    [resolved.prompt, resolved.negativePrompt]
      .filter(Boolean)
      .map(({ nodeId, input }) => `${nodeId}\0${input}`),
  );
  const candidates = candidateInputs(
    workflow,
    ['text', 'prompt', 'positive', 'negative', 'negative_prompt'],
    ({ node, value }) =>
      typeof value === 'string' &&
      /(clip.*text|text.*encode|prompt|conditioning|encode|video)/i.test(node.class_type),
  )
    .filter(({ nodeId, input }) => !used.has(`${nodeId}\0${input}`))
    .map((candidate) => {
      const { nodeId, input } = candidate;
      const label = normalizedNodeLabel(workflow[nodeId]);
      const negative =
        input.toLowerCase().startsWith('negative') ||
        /(?:negative|neg[ _-]?prompt|负向|负面|反向|负提示)/i.test(label);
      const positive =
        input.toLowerCase() === 'positive' ||
        /(?:positive|pos[ _-]?prompt|正向|正面|正提示)/i.test(label);
      if (negative && positive)
        fail(`text node ${nodeId} has conflicting positive/negative labels`);
      return { ...candidate, role: negative ? 'negative' : positive ? 'positive' : null };
    });

  if (!resolved.negativePrompt) {
    const negatives = candidates
      .filter(({ role }) => role === 'negative')
      .map(({ nodeId, input }) => ({ nodeId, input }));
    resolved.negativePrompt = uniqueInferredBinding(negatives, 'negativePrompt');
  }
  if (!resolved.prompt) {
    const positives = candidates
      .filter(({ role }) => role === 'positive')
      .map(({ nodeId, input }) => ({ nodeId, input }));
    resolved.prompt = uniqueInferredBinding(positives, 'prompt');
  }

  const assigned = new Set(
    [resolved.prompt, resolved.negativePrompt]
      .filter(Boolean)
      .map(({ nodeId, input }) => `${nodeId}\0${input}`),
  );
  const remaining = candidates
    .filter(({ nodeId, input }) => !assigned.has(`${nodeId}\0${input}`))
    .map(({ nodeId, input }) => ({ nodeId, input }));
  if (!resolved.prompt) resolved.prompt = uniqueInferredBinding(remaining, 'prompt');
  else if (remaining.length > 1 && !resolved.negativePrompt) {
    uniqueInferredBinding(remaining, 'negativePrompt');
  }
}

function compareComfyNodeIds(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

function inferredImageRoleFromConsumers(workflow, nodeId) {
  const roles = new Set();
  for (const consumer of Object.values(workflow)) {
    for (const [input, value] of Object.entries(consumer.inputs || {})) {
      if (!Array.isArray(value) || String(value[0] ?? '') !== String(nodeId)) continue;
      const signal = `${input} ${normalizedNodeLabel(consumer)}`;
      if (
        /(?:end|last|ending|尾帧|末帧|结束)[_\s-]*image|(?:end|last|ending|尾帧|末帧|结束)/i.test(
          signal,
        )
      ) {
        roles.add('end');
      }
      if (
        /(?:start|first|starting|首帧|起始)[_\s-]*image|(?:start|first|starting|首帧|起始)/i.test(
          signal,
        )
      ) {
        roles.add('start');
      }
    }
  }
  if (roles.size > 1) fail(`image node ${nodeId} has conflicting downstream start/end uses`);
  return roles.values().next().value || null;
}

function hasVideoWorkflowSignal(workflow) {
  return Object.values(workflow).some((node) =>
    /(?:video|animatediff|wan(?:video)?|hunyuan(?:video)?|cogvideo|ltxv)/i.test(
      `${node.class_type || ''} ${normalizedNodeLabel(node)}`,
    ),
  );
}

function inferImageBindings(workflow, resolved) {
  if (resolved.image && resolved.endImage) return;
  const used = new Set(
    [resolved.image, resolved.endImage]
      .filter(Boolean)
      .map(({ nodeId, input }) => `${nodeId}\0${input}`),
  );
  const candidates = candidateInputs(
    workflow,
    ['image', 'start_image', 'first_image', 'end_image', 'last_image'],
    ({ node, value }) =>
      typeof value === 'string' && /load.*image|image.*load/i.test(node.class_type),
  )
    .filter(({ nodeId, input }) => !used.has(`${nodeId}\0${input}`))
    .map((candidate) => {
      const { nodeId, input } = candidate;
      const label = normalizedNodeLabel(workflow[nodeId]);
      const isEnd =
        /^(end|last)_image$/i.test(input) || /(?:end|last|ending|尾帧|末帧|结束)/i.test(label);
      const isStart =
        /^(start|first)_image$/i.test(input) || /(?:start|first|starting|首帧|起始)/i.test(label);
      if (isEnd && isStart) fail(`image node ${nodeId} has conflicting start/end labels`);
      const downstreamRole = inferredImageRoleFromConsumers(workflow, nodeId);
      const labelRole = isEnd ? 'end' : isStart ? 'start' : null;
      if (labelRole && downstreamRole && labelRole !== downstreamRole) {
        fail(`image node ${nodeId} has conflicting start/end labels and downstream uses`);
      }
      return { ...candidate, role: labelRole || downstreamRole };
    });

  if (!resolved.endImage) {
    resolved.endImage = uniqueInferredBinding(
      candidates
        .filter(({ role }) => role === 'end')
        .map(({ nodeId, input }) => ({ nodeId, input })),
      'endImage',
    );
  }
  if (!resolved.image) {
    resolved.image = uniqueInferredBinding(
      candidates
        .filter(({ role }) => role === 'start')
        .map(({ nodeId, input }) => ({ nodeId, input })),
      'image',
    );
  }

  const assigned = new Set(
    [resolved.image, resolved.endImage]
      .filter(Boolean)
      .map(({ nodeId, input }) => `${nodeId}\0${input}`),
  );
  const remaining = candidates
    .filter(({ nodeId, input }) => !assigned.has(`${nodeId}\0${input}`))
    .map(({ nodeId, input }) => ({ nodeId, input }));
  if (
    !resolved.image &&
    !resolved.endImage &&
    remaining.length === 2 &&
    hasVideoWorkflowSignal(workflow)
  ) {
    const [start, end] = remaining.sort((left, right) =>
      compareComfyNodeIds(left.nodeId, right.nodeId),
    );
    resolved.image = start;
    resolved.endImage = end;
    return;
  }
  if (!resolved.image) resolved.image = uniqueInferredBinding(remaining, 'image');
  else if (remaining.length > 1 && !resolved.endImage) uniqueInferredBinding(remaining, 'endImage');
}

export function inferCommonComfyWorkflowBindings(
  workflowOrDefinition,
  explicitBindings,
  options = {},
) {
  const { workflow } = unwrapWorkflowDefinition(workflowOrDefinition, explicitBindings);
  const resolved = resolveComfyWorkflowBindings(workflowOrDefinition, explicitBindings);
  const strictOptional = options.strictOptional !== false;
  const strictOutput = options.strictOutput !== false;
  inferTextBindings(workflow, resolved);
  if (!(resolved.sourceVideo && resolved.characterImage)) inferImageBindings(workflow, resolved);

  const numericInputs = {
    seed: ['seed', 'noise_seed'],
    width: ['width'],
    height: ['height'],
    frames: ['frames', 'num_frames', 'video_frames', 'length'],
    fps: ['fps', 'frame_rate'],
  };
  for (const [bindingName, inputNames] of Object.entries(numericInputs)) {
    if (resolved[bindingName]) continue;
    const candidates = candidateInputs(
      workflow,
      inputNames,
      ({ value }) => typeof value === 'number',
    );
    resolved[bindingName] =
      candidates.length > 1 && !strictOptional
        ? null
        : uniqueInferredBinding(candidates, bindingName);
  }

  if (!resolved.output) {
    const outputCandidates = Object.entries(workflow)
      .filter(([, node]) => {
        const label = normalizedNodeLabel(node);
        return (
          /vhs[ _-]?videocombine/i.test(label) ||
          /(?:save|combine|output).*video|video.*(?:save|combine|output)/i.test(label) ||
          /(?:save|preview|output).*image|image.*(?:save|preview|output)/i.test(label) ||
          /(?:save|preview|output).*(?:audio|sound)|(?:audio|sound).*(?:save|preview|output)/i.test(label) ||
          /(?:save|preview|output).*(?:3d|mesh|gltf|glb)|(?:3d|mesh|gltf|glb).*(?:save|preview|output)/i.test(label)
        );
      })
      .map(([nodeId]) => ({ nodeId }));
    if (outputCandidates.length > 1 && strictOutput) {
      fail(
        `ambiguous output binding candidates: ${outputCandidates
          .map(({ nodeId }) => nodeId)
          .join(', ')}`,
      );
    }
    resolved.output = outputCandidates.length === 1 ? outputCandidates[0] : null;
  }

  return resolved;
}

function assertTextValue(name, value) {
  if (typeof value !== 'string') fail(`${name} must be a string`);
  if (value.length > 1_000_000) fail(`${name} is too long`);
  return value;
}

function assertIntegerValue(name, value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function assertFps(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000) {
    fail('fps must be a finite number between 0 and 1000');
  }
  return value;
}

function uploadedImageName(value, name) {
  if (typeof value === 'string') {
    if (!value || value.length > 4096 || value.includes('\0'))
      fail(`${name} is not a valid image name`);
    return value;
  }
  if (!isPlainObject(value)) fail(`${name} must be an uploaded image name or descriptor`);

  const allowed = new Set(['name', 'filename', 'subfolder', 'type']);
  for (const [key] of ownDataEntries(value, name)) {
    if (!allowed.has(key)) fail(`unknown ${name} field: ${key}`);
  }
  const filename = value.name ?? value.filename;
  const subfolder = value.subfolder ?? '';
  if (typeof filename !== 'string' || !filename || filename.includes('\0')) {
    fail(`${name} must include a valid name or filename`);
  }
  if (typeof subfolder !== 'string' || subfolder.includes('\0')) {
    fail(`${name}.subfolder must be a string`);
  }
  const normalizedSubfolder = subfolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalizedSubfolder ? `${normalizedSubfolder}/${filename}` : filename;
}

function normalizedUploadedImages(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') return { image: uploadedImageName(value, 'uploadedImages') };
  if (Array.isArray(value)) {
    if (value.length > 2) fail('uploadedImages supports at most a start and end image');
    return {
      ...(value[0] === undefined
        ? {}
        : { image: uploadedImageName(value[0], 'uploadedImages[0]') }),
      ...(value[1] === undefined
        ? {}
        : { endImage: uploadedImageName(value[1], 'uploadedImages[1]') }),
    };
  }
  if (!isPlainObject(value)) fail('uploadedImages must be a string, array, or plain object');

  const aliases = {
    image: 'image',
    startImage: 'image',
    firstImage: 'image',
    endImage: 'endImage',
    lastImage: 'endImage',
  };
  const result = {};
  for (const [key, image] of ownDataEntries(value, 'uploadedImages')) {
    const normalizedName = aliases[key];
    if (!normalizedName) fail(`unknown uploadedImages field: ${key}`);
    if (Object.hasOwn(result, normalizedName))
      fail(`${normalizedName} image is declared more than once`);
    result[normalizedName] = uploadedImageName(image, `uploadedImages.${key}`);
  }
  return result;
}

function normalizedInputValues(values) {
  if (values === undefined) return {};
  if (!isPlainObject(values)) fail('workflow input values must be a plain object');
  const allowed = new Set([
    'prompt',
    'negativePrompt',
    'seed',
    'width',
    'height',
    'frames',
    'fps',
    'uploadedImages',
    'uploadedVideo',
    'uploadedCharacterImage',
    'uploadedMask',
    'uploadedAudio',
  ]);
  const normalized = {};

  for (const [key, value] of ownDataEntries(values, 'values')) {
    if (!allowed.has(key)) fail(`unknown workflow input value: ${key}`);
    if (key === 'prompt' || key === 'negativePrompt') normalized[key] = assertTextValue(key, value);
    else if (key === 'seed') normalized[key] = assertIntegerValue(key, value);
    else if (key === 'fps') normalized[key] = assertFps(value);
    else if (key === 'uploadedImages') Object.assign(normalized, normalizedUploadedImages(value));
    else if (key === 'uploadedVideo') {
      if (value !== undefined && value !== null) {
        normalized.sourceVideo = uploadedImageName(value, 'uploadedVideo');
      }
    } else if (key === 'uploadedCharacterImage') {
      if (value !== undefined && value !== null) {
        normalized.characterImage = uploadedImageName(value, 'uploadedCharacterImage');
      }
    } else if (key === 'uploadedMask') {
      if (value !== undefined && value !== null) {
        normalized.mask = uploadedImageName(value, 'uploadedMask');
      }
    } else if (key === 'uploadedAudio') {
      if (value !== undefined && value !== null) {
        normalized.audio = uploadedImageName(value, 'uploadedAudio');
      }
    } else normalized[key] = assertIntegerValue(key, value, { minimum: 1, maximum: 1_000_000 });
  }
  return normalized;
}

function applyResolvedValues(workflow, bindings, values) {
  for (const bindingName of INPUT_BINDING_NAMES) {
    if (!Object.hasOwn(values, bindingName) || !bindings[bindingName]) continue;
    const { nodeId, input } = bindings[bindingName];
    workflow[nodeId].inputs[input] = values[bindingName];
  }
}

export function applyComfyWorkflowInputs(workflowOrDefinition, values = {}, explicitBindings) {
  const { workflow } = unwrapWorkflowDefinition(workflowOrDefinition, explicitBindings);
  const bindings = resolveComfyWorkflowBindings(workflowOrDefinition, explicitBindings);
  const clone = deepCloneJson(workflow);
  applyResolvedValues(clone, bindings, normalizedInputValues(values));
  return clone;
}

export function getComfyOutputNodeId(workflowOrDefinition, explicitBindings) {
  return (
    resolveComfyWorkflowBindings(workflowOrDefinition, explicitBindings).output?.nodeId ?? null
  );
}

export function prepareComfyWorkflow(workflowOrDefinition, values = {}, explicitBindings) {
  const bindings = resolveComfyWorkflowBindings(workflowOrDefinition, explicitBindings);
  return {
    workflow: applyComfyWorkflowInputs(workflowOrDefinition, values, explicitBindings),
    bindings,
    outputNodeId: bindings.output?.nodeId ?? null,
  };
}

function historyRecords(history, promptId) {
  if (!isPlainObject(history)) return [];
  if (isPlainObject(history.outputs)) return [{ promptId: promptId ?? null, record: history }];
  if (promptId !== undefined && promptId !== null) {
    const id = String(promptId);
    return isPlainObject(history[id]) && isPlainObject(history[id].outputs)
      ? [{ promptId: id, record: history[id] }]
      : [];
  }
  return Object.entries(history)
    .filter(([, record]) => isPlainObject(record) && isPlainObject(record.outputs))
    .map(([id, record]) => ({ promptId: id, record }));
}

function normalizedOutputNodeFilter(outputNodeId) {
  if (outputNodeId === undefined || outputNodeId === null) return null;
  const values = Array.isArray(outputNodeId) ? outputNodeId : [outputNodeId];
  return new Set(values.map(String));
}

export function parseComfyHistoryOutputDescriptors(history, options = {}) {
  if (!isPlainObject(options)) fail('history parser options must be a plain object');
  const allowedOptions = new Set(['promptId', 'outputNodeId']);
  for (const [key] of ownDataEntries(options, 'options')) {
    if (!allowedOptions.has(key)) fail(`unknown history parser option: ${key}`);
  }

  const nodeFilter = normalizedOutputNodeFilter(options.outputNodeId);
  const descriptors = [];
  for (const { promptId, record } of historyRecords(history, options.promptId)) {
    for (const [nodeId, output] of Object.entries(record.outputs)) {
      if (nodeFilter && !nodeFilter.has(String(nodeId))) continue;
      if (!isPlainObject(output)) continue;

      for (const bucket of HISTORY_BUCKETS) {
        const rawItems = Array.isArray(output[bucket])
          ? output[bucket]
          : isPlainObject(output[bucket])
            ? [output[bucket]]
            : [];
        for (const item of rawItems) {
          if (!isPlainObject(item) || typeof item.filename !== 'string' || !item.filename) continue;
          if (item.filename.length > 4096 || item.filename.includes('\0')) continue;
          if (item.subfolder !== undefined && typeof item.subfolder !== 'string') continue;
          if (item.type !== undefined && typeof item.type !== 'string') continue;
          descriptors.push({
            promptId,
            nodeId: String(nodeId),
            bucket,
            filename: item.filename,
            subfolder: item.subfolder ?? '',
            type: item.type ?? 'output',
          });
        }
      }
    }
  }
  return descriptors;
}

export function isComfyVideoOutputFilename(filename) {
  if (typeof filename !== 'string') return false;
  const match = /\.[^.\\/]+$/.exec(filename.trim().toLowerCase());
  return Boolean(match && VIDEO_EXTENSIONS.has(match[0]));
}

export function extractComfyVideoOutputs(history, options = {}) {
  return parseComfyHistoryOutputDescriptors(history, options).filter((descriptor) =>
    descriptor.bucket === 'video' ||
    descriptor.bucket === 'videos' ||
    isComfyVideoOutputFilename(descriptor.filename),
  );
}

export function isComfyAudioOutputFilename(filename) {
  if (typeof filename !== 'string') return false;
  const match = /\.[^.\\/]+$/.exec(filename.trim().toLowerCase());
  return Boolean(match && AUDIO_EXTENSIONS.has(match[0]));
}

export function extractComfyAudioOutputs(history, options = {}) {
  return parseComfyHistoryOutputDescriptors(history, options).filter(
    (descriptor) =>
      descriptor.bucket === 'audio' ||
      descriptor.bucket === 'audios' ||
      isComfyAudioOutputFilename(descriptor.filename),
  );
}

export function isComfy3dOutputFilename(filename) {
  if (typeof filename !== 'string') return false;
  const match = /\.[^.\\/]+$/.exec(filename.trim().toLowerCase());
  return Boolean(match && MODEL_3D_EXTENSIONS.has(match[0]));
}

export function extractComfy3dOutputs(history, options = {}) {
  return parseComfyHistoryOutputDescriptors(history, options).filter(
    (descriptor) =>
      descriptor.bucket === '3d' ||
      descriptor.bucket === 'models' ||
      descriptor.bucket === 'meshes' ||
      isComfy3dOutputFilename(descriptor.filename),
  );
}
