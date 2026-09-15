import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  inferCommonComfyWorkflowBindings,
  prepareComfyWorkflow,
  resolveComfyWorkflowBindings,
  validateComfyWorkflow,
} from './comfy-workflow.mjs';

const WORKFLOW_ID_RE = /^comfy_[A-Za-z0-9_-]{8,80}$/;
const COMFY_LOCAL_CONNECTION_ID = 'comfyui-local';
const COMFY_REMOTE_CONNECTION_ID_RE = /^comfyui-remote(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const COMFY_CLOUD_CONNECTION_ID_RE = /^comfyui-cloud(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv']);
const SUPPORTED_3D_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.ply', '.stl', '.fbx', '.usdz']);
const MODEL_INPUT_RE = /(?:model|ckpt|checkpoint|lora|vae|clip|unet|diffusion)/i;
const MODEL_FILE_RE = /\.(?:safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i;
const COMPATIBILITY_ISSUE_LIMIT = 64;
const SOURCE_VERSION_VALUES = new Set(['api', 'legacy', '0.4', '1.0']);

export function isComfyConnectionId(value) {
  const id = String(value || '').trim();
  return (
    id === COMFY_LOCAL_CONNECTION_ID ||
    (id.length <= 80 &&
      (COMFY_REMOTE_CONNECTION_ID_RE.test(id) || COMFY_CLOUD_CONNECTION_ID_RE.test(id)))
  );
}

export function isRemoteComfyConnectionId(value) {
  const id = String(value || '').trim();
  return id !== COMFY_LOCAL_CONNECTION_ID && isComfyConnectionId(id);
}

export function isCloudComfyConnectionId(value) {
  const id = String(value || '').trim();
  return id.length <= 80 && COMFY_CLOUD_CONNECTION_ID_RE.test(id);
}

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? [...value.normalize('NFKC')]
        .filter((character) => {
          const code = character.codePointAt(0) || 0;
          return code >= 32 && code !== 127;
        })
        .join('')
        .trim()
        .slice(0, maxLength)
    : '';
}

function compactBindings(bindings) {
  return Object.fromEntries(
    Object.entries(bindings || {}).filter(([, binding]) => Boolean(binding)),
  );
}

function fingerprintText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function normalizedSourceMetadata(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const packages = new Map();
  for (const raw of Array.isArray(source.nodePackages) ? source.nodePackages.slice(0, 256) : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = fingerprintText(raw.id, 160);
    if (!id) continue;
    const version = fingerprintText(raw.version, 80);
    packages.set(id.toLowerCase(), { id, ...(version ? { version } : {}) });
  }
  const models = new Map();
  for (const raw of Array.isArray(source.models) ? source.models.slice(0, 512) : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const name = fingerprintText(raw.name, 500);
    if (!name) continue;
    const directory = fingerprintText(raw.directory, 240);
    const url = fingerprintText(raw.url, 2_000);
    models.set(name.toLowerCase(), {
      name,
      ...(directory ? { directory } : {}),
      ...(/^https?:\/\//i.test(url) ? { url } : {}),
    });
  }
  return {
    nodePackages: [...packages.values()].sort((left, right) => left.id.localeCompare(right.id)),
    models: [...models.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function workflowValueKind(value, workflow) {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    Object.hasOwn(workflow, String(value[0] ?? '')) &&
    Number.isInteger(Number(value[1]))
  ) {
    return 'link';
  }
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') return 'object';
  return value === null ? 'null' : typeof value;
}

function workflowNodeSignatures(workflow) {
  return Object.entries(workflow)
    .map(([nodeId, rawNode]) => {
      const node = rawNode && typeof rawNode === 'object' && !Array.isArray(rawNode) ? rawNode : {};
      const inputs =
        node.inputs && typeof node.inputs === 'object' && !Array.isArray(node.inputs)
          ? node.inputs
          : {};
      return {
        nodeId,
        classType: String(node.class_type || ''),
        inputs: Object.entries(inputs)
          .map(([name, value]) => ({ name, kind: workflowValueKind(value, workflow) }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      };
    })
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function workflowModelDependencies(workflow, sourceModels) {
  const models = new Map(
    sourceModels.map((model) => [model.name.toLowerCase(), { ...model }]),
  );
  for (const rawNode of Object.values(workflow)) {
    if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) continue;
    const inputs =
      rawNode.inputs && typeof rawNode.inputs === 'object' && !Array.isArray(rawNode.inputs)
        ? rawNode.inputs
        : {};
    for (const [input, value] of Object.entries(inputs)) {
      if (
        typeof value !== 'string' ||
        (!MODEL_INPUT_RE.test(input) && !MODEL_FILE_RE.test(value))
      ) {
        continue;
      }
      const name = value.replace(/\\/g, '/').split('/').pop()?.trim().slice(0, 500) || '';
      if (name && !models.has(name.toLowerCase())) models.set(name.toLowerCase(), { name, input });
    }
  }
  return [...models.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function stableFingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeWorkflowValue(value)))
    .digest('hex');
}

function createImportFingerprint(body, workflow) {
  const storedFingerprint =
    body?.importFingerprint &&
    typeof body.importFingerprint === 'object' &&
    !Array.isArray(body.importFingerprint)
      ? body.importFingerprint
      : {};
  const sourceFormat =
    (body?.sourceFormat ?? storedFingerprint.sourceFormat) === 'layout' ? 'layout' : 'api';
  const requestedVersion = fingerprintText(
    body?.sourceVersion ?? storedFingerprint.sourceVersion,
    20,
  );
  const sourceVersion = SOURCE_VERSION_VALUES.has(requestedVersion)
    ? requestedVersion
    : sourceFormat === 'layout'
      ? 'legacy'
      : 'api';
  const sourceMetadata = normalizedSourceMetadata(
    body?.sourceMetadata ?? {
      nodePackages: storedFingerprint.nodePackages,
      models: storedFingerprint.modelDependencies,
    },
  );
  const nodeSignatures = workflowNodeSignatures(workflow);
  return {
    schemaVersion: 1,
    sourceFormat,
    sourceVersion,
    workflowHash: stableFingerprint(workflow),
    nodeSignatureHash: stableFingerprint(nodeSignatures),
    nodeSignatures,
    nodePackages: sourceMetadata.nodePackages,
    modelDependencies: workflowModelDependencies(workflow, sourceMetadata.models),
  };
}

function removeUnreferencedDisplayOnlyPlaceholders(workflow) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return workflow;
  const placeholderIds = Object.entries(workflow)
    .filter(([, node]) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
      if (Object.hasOwn(node, 'class_type')) return false;
      if (!node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs))
        return false;
      if (Object.keys(node.inputs).length) return false;
      return Object.keys(node).every((key) => key === 'inputs' || key === '_meta');
    })
    .map(([nodeId]) => nodeId)
    .filter(
      (nodeId) =>
        !Object.entries(workflow).some(
          ([sourceNodeId, node]) =>
            sourceNodeId !== nodeId &&
            node?.inputs &&
            typeof node.inputs === 'object' &&
            Object.values(node.inputs).some(
              (input) => Array.isArray(input) && String(input[0] ?? '') === nodeId,
            ),
        ),
    );
  if (!placeholderIds.length) return workflow;
  const sanitized = { ...workflow };
  for (const nodeId of placeholderIds) delete sanitized[nodeId];
  return sanitized;
}

// Some ComfyUI API exports produced after editing a graph omit the required
// `model` link on a model-only LoRA node, even though the node is still used by
// a downstream guider.  The bridge can repair this without guessing when the
// graph contains exactly one obvious model producer.  If there are multiple
// candidates we leave the graph untouched so the importer can report the
// original problem instead of silently wiring the wrong model.
function repairUniqueModelOnlyLoraLinks(workflow) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return workflow;

  const modelProducer =
    /^(?:UNETLoader|CheckpointLoader(?:Simple)?|LoraLoader(?:ModelOnly)?|ModelPatch)$/i;
  const candidates = Object.entries(workflow).filter(([, node]) =>
    modelProducer.test(String(node?.class_type || '').trim()),
  );
  if (!candidates.length) return workflow;

  let repaired = workflow;
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (
      String(node?.class_type || '')
        .trim()
        .toLowerCase() !== 'loraloadermodelonly'
    )
      continue;
    if (Object.hasOwn(node?.inputs || {}, 'model')) continue;

    const sources = candidates.filter(([sourceId]) => sourceId !== nodeId);
    if (sources.length !== 1) continue;
    if (repaired === workflow) repaired = { ...workflow };
    repaired[nodeId] = {
      ...node,
      inputs: { ...node.inputs, model: [sources[0][0], 0] },
    };
  }
  return repaired;
}

function isMultiImageReferenceWorkflow(workflow, bindings) {
  const boundImageNodeIds = new Set(
    [bindings?.image?.nodeId, bindings?.endImage?.nodeId]
      .filter(Boolean)
      .map((nodeId) => String(nodeId)),
  );
  if (boundImageNodeIds.size < 2) return false;

  return Object.values(workflow || {}).some((node) => {
    if (!node?.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs))
      return false;
    const referenceNodeIds = Object.entries(node.inputs)
      .filter(
        ([inputName, value]) =>
          /^ref(?:erence)?[_-]?image[_-]?\d+$/i.test(inputName) &&
          Array.isArray(value) &&
          boundImageNodeIds.has(String(value[0] ?? '')),
      )
      .map(([, value]) => String(value[0]));
    return new Set(referenceNodeIds).size >= 2;
  });
}

export function comfyWorkflowModes(workflow, bindings) {
  const modes = [];
  if (bindings?.sourceVideo && bindings?.characterImage) return ['视频换人物'];
  if (isMultiImageReferenceWorkflow(workflow, bindings)) return ['图片参考'];
  if (bindings?.image && bindings?.endImage) modes.push('首尾帧');
  else if (bindings?.image) modes.push('图生视频');
  else modes.push('文生视频');
  return modes;
}

function comfyWorkflowKind(workflow, bindings) {
  const outputNodeId = bindings?.output?.nodeId;
  const outputNode = outputNodeId ? workflow?.[outputNodeId] : null;
  const label = `${outputNode?.class_type ?? ''} ${outputNode?._meta?.title ?? ''}`;
  if (/(?:save|preview|output).*(?:audio|sound)|(?:audio|sound).*(?:save|preview|output)/i.test(label)) {
    return 'audio';
  }
  if (/(?:save|preview|output).*(?:3d|mesh|gltf|glb)|(?:3d|mesh|gltf|glb).*(?:save|preview|output)/i.test(label)) {
    return '3d';
  }
  return /(?:save|preview|output).*image|image.*(?:save|preview|output)/i.test(label)
    ? 'image'
    : 'video';
}

function bindingInferenceMessage(error) {
  const detail = error instanceof Error ? error.message : '';
  if (/ambiguous output binding/i.test(detail)) {
    return '检测到多个输出节点。请把最终图片或视频输出节点标题改为 QIANSI_OUTPUT 后重新导出。';
  }
  if (/ambiguous (?:prompt|negativePrompt) binding/i.test(detail)) {
    return '检测到多个提示词节点。请把正向提示词节点标题改为 QIANSI_PROMPT 后重新导出。';
  }
  if (/ambiguous (?:image|endImage) binding/i.test(detail)) {
    return '检测到多个图片输入节点，且无法安全判定首帧与尾帧。请分别把首帧和尾帧节点标题改为 QIANSI_IMAGE、QIANSI_END_IMAGE 后重新导出。';
  }
  return detail || '无法识别 ComfyUI 工作流的参数节点。';
}

export function createComfyWorkflowPreset(body, options = {}) {
  const name = cleanText(body?.name, 120);
  if (!name) throw new Error('请填写 ComfyUI 工作流名称。');
  const workflow = repairUniqueModelOnlyLoraLinks(
    removeUnreferencedDisplayOnlyPlaceholders(body?.workflow),
  );
  validateComfyWorkflow(workflow, {
    maxNodes: 2048,
    maxValues: 100_000,
    maxDepth: 64,
    maxStringCharacters: 5 * 1024 * 1024,
  });
  let declaredBindings;
  let inferred;
  try {
    declaredBindings = compactBindings(resolveComfyWorkflowBindings(workflow, body?.bindings));
    inferred = compactBindings(
      inferCommonComfyWorkflowBindings(workflow, body?.bindings, {
        strictOptional: false,
        strictOutput: true,
      }),
    );
  } catch (error) {
    throw new Error(bindingInferenceMessage(error));
  }
  // Numeric video constraints are model-specific (for example, frame counts may
  // need a particular step). Only override them when the workflow author marks
  // or explicitly binds the input; inferred prompt/image/output bindings are safe.
  for (const name of ['seed', 'width', 'height', 'frames', 'fps']) {
    if (!declaredBindings[name]) delete inferred[name];
  }
  if (Boolean(declaredBindings.frames) !== Boolean(declaredBindings.fps)) {
    throw new Error(
      '视频时长与帧率需要一起配置。请同时标记 QIANSI_FRAMES 和 QIANSI_FPS，或都不标记以保留工作流默认值。',
    );
  }
  const bindings = compactBindings(resolveComfyWorkflowBindings(workflow, inferred));
  if (!bindings.output) {
    throw new Error(
      '无法确认最终输出节点。请为最终图片、视频、音频或 3D 输出节点添加 QIANSI_OUTPUT 标题后重新导出 API Format。',
    );
  }
  const kind = comfyWorkflowKind(workflow, bindings);
  if (!bindings.prompt && !(kind === '3d' && bindings.image)) {
    throw new Error(
      kind === '3d'
        ? '3D 工作流需要 QIANSI_PROMPT 提示词或 QIANSI_IMAGE 图片输入。'
        : '无法确认正向提示词节点。请在 ComfyUI 中把对应节点标题改为 QIANSI_PROMPT 后重新导出 API Format。',
    );
  }
  const id = String(options.id || '').trim();
  if (!WORKFLOW_ID_RE.test(id)) throw new Error('ComfyUI 工作流 ID 无效。');
  const now = Number.isSafeInteger(options.now) ? options.now : Date.now();
  const connectionId = String(
    options.connectionId || body?.connectionId || COMFY_LOCAL_CONNECTION_ID,
  ).trim();
  if (!isComfyConnectionId(connectionId)) throw new Error('ComfyUI 连接类型无效。');
  return {
    id,
    connectionId,
    name,
    workflow,
    bindings,
    kind,
    modes: kind === 'video' ? comfyWorkflowModes(workflow, bindings) : [],
    importFingerprint: createImportFingerprint(body, workflow),
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeStoredComfyWorkflow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const id = String(value.id || '').trim();
    if (!WORKFLOW_ID_RE.test(id)) return null;
    const createdAt =
      Number.isSafeInteger(value.createdAt) && value.createdAt >= 0 ? value.createdAt : 0;
    const normalized = createComfyWorkflowPreset(value, {
      id,
      connectionId: value.connectionId || 'comfyui-local',
      now: Number.isSafeInteger(value.updatedAt) ? value.updatedAt : createdAt,
    });
    normalized.createdAt = createdAt;
    const lastValidation = normalizeLastWorkflowValidation(value.lastValidation);
    if (lastValidation) normalized.lastValidation = lastValidation;
    return normalized;
  } catch {
    return null;
  }
}

function canonicalizeWorkflowValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeWorkflowValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeWorkflowValue(value[key])]),
  );
}

export function comfyWorkflowIdentity(value) {
  const workflow = Object.fromEntries(
    Object.entries(value?.workflow || {}).map(([nodeId, node]) => [
      nodeId,
      {
        class_type: node?.class_type,
        inputs: node?.inputs,
      },
    ]),
  );
  return JSON.stringify(
    canonicalizeWorkflowValue({
      kind: ['image', 'video', 'audio', '3d'].includes(value?.kind) ? value.kind : 'video',
      connectionId: value?.connectionId || 'comfyui-local',
      workflow,
      bindings: value?.bindings || {},
    }),
  );
}

export function dedupeComfyWorkflowPresets(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => {
    const identity = comfyWorkflowIdentity(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function upsertComfyWorkflowPreset(values, incoming, maxItems = 64) {
  const items = dedupeComfyWorkflowPresets(values);
  const identity = comfyWorkflowIdentity(incoming);
  const existingIndex = items.findIndex((item) => comfyWorkflowIdentity(item) === identity);
  if (existingIndex < 0) {
    return { preset: incoming, items: [incoming, ...items].slice(0, maxItems), reused: false };
  }
  const existing = items[existingIndex];
  const preset = {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
  };
  items[existingIndex] = preset;
  return { preset, items: items.slice(0, maxItems), reused: true };
}

function comfyWorkflowDefaultPrompt(value) {
  const binding = value?.bindings?.prompt;
  if (!binding) return '';
  const prompt = value?.workflow?.[binding.nodeId]?.inputs?.[binding.input];
  return typeof prompt === 'string' ? prompt.slice(0, 1_000_000) : '';
}

export function publicComfyWorkflow(value, compatibility) {
  return {
    id: value.id,
    connectionId: value.connectionId || 'comfyui-local',
    name: value.name,
    modes: [...value.modes],
    kind: ['image', 'video', 'audio', '3d'].includes(value.kind) ? value.kind : 'video',
    supportsVideoReference: Boolean(value?.bindings?.sourceVideo),
    supportsAudioReference: Boolean(value?.bindings?.audio),
    supportsImageReference: Boolean(value?.bindings?.image),
    defaultPrompt: comfyWorkflowDefaultPrompt(value),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(value.importFingerprint
      ? {
          importFingerprint: {
            schemaVersion: value.importFingerprint.schemaVersion,
            sourceFormat: value.importFingerprint.sourceFormat,
            sourceVersion: value.importFingerprint.sourceVersion,
            workflowHash: value.importFingerprint.workflowHash,
            nodeSignatureHash: value.importFingerprint.nodeSignatureHash,
            nodePackages: value.importFingerprint.nodePackages,
            modelDependencies: value.importFingerprint.modelDependencies,
          },
        }
      : {}),
    ...(value.lastValidation ? { lastValidation: value.lastValidation } : {}),
    ...(compatibility ? { compatibility } : {}),
  };
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function inputDefinitions(nodeInfo) {
  const input = objectRecord(nodeInfo?.input);
  const result = new Map();
  for (const groupName of ['required', 'optional', 'hidden']) {
    const group = objectRecord(input?.[groupName]);
    if (!group) continue;
    for (const [name, definition] of Object.entries(group)) {
      result.set(name, { definition, required: groupName === 'required' });
    }
  }
  return result;
}

function declaredType(definition) {
  if (!Array.isArray(definition) || !definition.length) return { type: '', choices: null };
  if (Array.isArray(definition[0])) {
    return {
      type: 'COMBO',
      choices: definition[0].filter((value) => typeof value === 'string').slice(0, 10_000),
    };
  }
  return { type: String(definition[0] ?? '').trim().toUpperCase(), choices: null };
}

function literalType(value) {
  if (typeof value === 'string') return 'STRING';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INT' : 'FLOAT';
  return '';
}

function workflowInputType(value, workflow, objectInfo) {
  if (!Array.isArray(value) || value.length < 2) return literalType(value);
  const sourceNode = workflow?.[String(value[0] ?? '')];
  const sourceInfo = objectRecord(objectInfo?.[String(sourceNode?.class_type || '')]);
  const outputs = Array.isArray(sourceInfo?.output) ? sourceInfo.output : [];
  const slot = Number(value[1]);
  return Number.isInteger(slot) && slot >= 0 && slot < outputs.length
    ? String(outputs[slot] ?? '').trim().toUpperCase()
    : '';
}

function clearlyIncompatibleType(expected, actual) {
  if (!expected || !actual || expected === '*' || expected === 'ANY') return false;
  if (expected === 'COMBO') return actual !== 'STRING';
  if (expected === actual) return false;
  if (expected === 'FLOAT' && actual === 'INT') return false;
  if (expected === 'NUMBER' && (actual === 'INT' || actual === 'FLOAT')) return false;
  return true;
}

function compatibilityIssue(nodeId, classType, input, extra = {}) {
  return { nodeId: String(nodeId), classType: String(classType), input: String(input), ...extra };
}

/** Compare an API Prompt snapshot against the live ComfyUI node registry. */
export function inspectComfyWorkflowCompatibility(preset, objectInfo) {
  if (!objectRecord(objectInfo)) {
    return {
      status: 'unchecked',
      message: 'ComfyUI 未提供节点定义，工作流兼容性暂未验证。',
      missingNodeClasses: [],
      missingInputs: [],
      unknownInputs: [],
      typeMismatches: [],
      missingModels: [],
    };
  }
  const workflow = objectRecord(preset?.workflow) || {};
  const missingNodeClasses = new Set();
  const missingInputs = [];
  const unknownInputs = [];
  const typeMismatches = [];
  const missingModels = [];

  for (const [nodeId, rawNode] of Object.entries(workflow)) {
    const node = objectRecord(rawNode);
    const classType = String(node?.class_type || '').trim();
    const nodeInfo = objectRecord(objectInfo[classType]);
    if (!nodeInfo) {
      if (classType) missingNodeClasses.add(classType);
      continue;
    }
    const definitions = inputDefinitions(nodeInfo);
    const inputs = objectRecord(node?.inputs) || {};
    for (const [name, entry] of definitions) {
      if (entry.required && !Object.hasOwn(inputs, name)) {
        missingInputs.push(compatibilityIssue(nodeId, classType, name));
      }
    }
    for (const [name, value] of Object.entries(inputs)) {
      const entry = definitions.get(name);
      if (!entry) {
        unknownInputs.push(compatibilityIssue(nodeId, classType, name));
        continue;
      }
      const expected = declaredType(entry.definition);
      const actual = workflowInputType(value, workflow, objectInfo);
      if (clearlyIncompatibleType(expected.type, actual)) {
        typeMismatches.push(
          compatibilityIssue(nodeId, classType, name, { expected: expected.type, actual }),
        );
      }
      if (
        expected.choices &&
        typeof value === 'string' &&
        !expected.choices.includes(value) &&
        (MODEL_INPUT_RE.test(name) || MODEL_FILE_RE.test(value))
      ) {
        missingModels.push(compatibilityIssue(nodeId, classType, name, { value }));
      }
    }
  }

  const hasIssues =
    missingNodeClasses.size > 0 ||
    missingInputs.length > 0 ||
    unknownInputs.length > 0 ||
    typeMismatches.length > 0 ||
    missingModels.length > 0;
  return {
    status: hasIssues ? 'incompatible' : 'compatible',
    message: hasIssues
      ? '工作流与当前 ComfyUI 不兼容，需要重新导入或迁移。'
      : '工作流与当前 ComfyUI 节点定义兼容。',
    missingNodeClasses: [...missingNodeClasses].slice(0, COMPATIBILITY_ISSUE_LIMIT).sort(),
    missingInputs: missingInputs.slice(0, COMPATIBILITY_ISSUE_LIMIT),
    unknownInputs: unknownInputs.slice(0, COMPATIBILITY_ISSUE_LIMIT),
    typeMismatches: typeMismatches.slice(0, COMPATIBILITY_ISSUE_LIMIT),
    missingModels: missingModels.slice(0, COMPATIBILITY_ISSUE_LIMIT),
  };
}

function normalizeLastWorkflowValidation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fingerprint = fingerprintText(value.fingerprint, 64);
  const backendVersion = fingerprintText(value.backendVersion, 160);
  const nodeRegistryHash = fingerprintText(value.nodeRegistryHash, 64);
  const featureHash = fingerprintText(value.featureHash, 64);
  const status =
    value.status === 'compatible' ||
    value.status === 'incompatible' ||
    value.status === 'unchecked'
      ? value.status
      : '';
  const checkedAt =
    Number.isSafeInteger(value.checkedAt) && value.checkedAt >= 0 ? value.checkedAt : 0;
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || !status) return null;
  return {
    fingerprint,
    backendVersion,
    nodeRegistryHash: /^[a-f0-9]{64}$/.test(nodeRegistryHash) ? nodeRegistryHash : '',
    featureHash: /^[a-f0-9]{64}$/.test(featureHash) ? featureHash : '',
    status,
    checkedAt,
  };
}

function liveNodeRegistrySnapshot(preset, objectInfo) {
  const source = objectRecord(objectInfo) || {};
  const classTypes = Array.from(
    new Set(
      Object.values(objectRecord(preset?.workflow) || {})
        .map((node) => String(node?.class_type || '').trim())
        .filter(Boolean),
    ),
  ).sort();
  return Object.fromEntries(
    classTypes.map((classType) => {
      const info = objectRecord(source[classType]);
      return [
        classType,
        info
          ? {
              input: info.input,
              output: info.output,
              output_name: info.output_name,
              output_is_list: info.output_is_list,
              python_module: info.python_module,
            }
          : null,
      ];
    }),
  );
}

/** Persist only when the live compatibility fingerprint changes. */
export function refreshComfyWorkflowValidation(preset, inspection, now = Date.now()) {
  const system = objectRecord(inspection?.system) || {};
  const backendVersion = fingerprintText(
    system.comfyui_version ?? system.version ?? system.comfy_version,
    160,
  );
  const nodeRegistryHash = stableFingerprint(
    liveNodeRegistrySnapshot(preset, inspection?.objectInfo),
  );
  const featureHash = stableFingerprint(objectRecord(inspection?.features) || {});
  const compatibility = inspectComfyWorkflowCompatibility(preset, inspection?.objectInfo);
  const fingerprint = stableFingerprint({
    backendVersion,
    nodeRegistryHash,
    featureHash,
    workflowHash: preset?.importFingerprint?.workflowHash || '',
    status: compatibility.status,
  });
  if (preset?.lastValidation?.fingerprint === fingerprint) return preset;
  return {
    ...preset,
    lastValidation: {
      fingerprint,
      backendVersion,
      nodeRegistryHash,
      featureHash,
      status: compatibility.status,
      checkedAt: Number.isSafeInteger(now) && now >= 0 ? now : Date.now(),
    },
  };
}

export function prepareComfyImageWorkflow(preset, input = {}) {
  const resolved = resolveComfyWorkflowBindings(preset.workflow, preset.bindings);
  const values = {
    prompt: String(input.prompt || ''),
    seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : 0,
    uploadedImages: Array.isArray(input.uploadedImages) ? input.uploadedImages.slice(0, 2) : [],
  };
  for (const key of ['prompt', 'seed']) if (!resolved[key]) delete values[key];
  if (!resolved.image) delete values.uploadedImages;
  return prepareComfyWorkflow({ workflow: preset.workflow, bindings: preset.bindings }, values);
}

export function prepareComfyAudioWorkflow(preset, input = {}) {
  const resolved = resolveComfyWorkflowBindings(preset.workflow, preset.bindings);
  const values = {
    prompt: String(input.prompt || ''),
    seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : 0,
    uploadedAudio: input.uploadedAudio,
  };
  for (const key of ['prompt', 'seed']) if (!resolved[key]) delete values[key];
  if (!resolved.audio) delete values.uploadedAudio;
  return prepareComfyWorkflow({ workflow: preset.workflow, bindings: preset.bindings }, values);
}

export function prepareComfy3dWorkflow(preset, input = {}) {
  const resolved = resolveComfyWorkflowBindings(preset.workflow, preset.bindings);
  const values = {
    prompt: String(input.prompt || ''),
    seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : 0,
    uploadedImages: Array.isArray(input.uploadedImages) ? input.uploadedImages.slice(0, 2) : [],
  };
  for (const key of ['prompt', 'seed']) if (!resolved[key]) delete values[key];
  if (!resolved.image) delete values.uploadedImages;
  return prepareComfyWorkflow({ workflow: preset.workflow, bindings: preset.bindings }, values);
}

function aspectDimensions(aspectRatio, resolution) {
  const ratios = {
    '16:9': [16, 9],
    '9:16': [9, 16],
    '4:3': [4, 3],
    '3:4': [3, 4],
    '1:1': [1, 1],
    '21:9': [21, 9],
  };
  const ratio = ratios[String(aspectRatio || '')];
  if (!ratio || String(aspectRatio || '').toLowerCase() === 'auto') return {};
  const shortSide = {
    '480P': 480,
    '720P': 720,
    '1080P': 1080,
    '2K': 1440,
    '4K': 2160,
  }[String(resolution || '').toUpperCase()];
  if (!shortSide) return {};
  const [x, y] = ratio;
  const landscape = x >= y;
  const width = landscape ? Math.round((shortSide * x) / y) : shortSide;
  const height = landscape ? shortSide : Math.round((shortSide * y) / x);
  const align = (value) => Math.max(16, Math.round(value / 16) * 16);
  return { width: align(width), height: align(height) };
}

export function prepareComfyVideoWorkflow(preset, input = {}) {
  const fps = Math.max(1, Math.min(120, Number(input.fps) || 24));
  const duration = Math.max(1, Math.min(60, Number(input.duration) || 5));
  const dimensions = aspectDimensions(input.aspectRatio, input.resolution);
  const values = {
    prompt: String(input.prompt || ''),
    seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : 0,
    frames: Math.max(1, Math.round(duration * fps)),
    fps,
    uploadedImages: Array.isArray(input.uploadedImages) ? input.uploadedImages.slice(0, 2) : [],
    uploadedVideo: input.uploadedVideo,
    uploadedCharacterImage: input.uploadedCharacterImage,
    uploadedMask: input.uploadedMask,
    ...dimensions,
  };
  // Unmapped settings deliberately preserve the workflow's own defaults.
  const resolved = resolveComfyWorkflowBindings(preset.workflow, preset.bindings);
  for (const key of Object.keys(values)) {
    if (
      key === 'uploadedImages' ||
      key === 'uploadedVideo' ||
      key === 'uploadedCharacterImage' ||
      key === 'uploadedMask'
    )
      continue;
    if (!resolved[key]) delete values[key];
  }
  if (!resolved.image) delete values.uploadedImages;
  if (!resolved.sourceVideo) delete values.uploadedVideo;
  if (!resolved.characterImage) delete values.uploadedCharacterImage;
  if (!resolved.mask) delete values.uploadedMask;
  return prepareComfyWorkflow({ workflow: preset.workflow, bindings: preset.bindings }, values);
}

export function comfyVideoExtension(filename) {
  const extension = extname(String(filename || '')).toLowerCase();
  if (!SUPPORTED_VIDEO_EXTENSIONS.has(extension)) {
    throw new Error(
      `ComfyUI 输出格式 ${extension || '(未知)'} 暂不支持，请输出 MP4、WebM、MOV、M4V 或 MKV。`,
    );
  }
  return extension;
}

export function comfy3dExtension(filename) {
  const extension = extname(String(filename || '')).toLowerCase();
  if (!SUPPORTED_3D_EXTENSIONS.has(extension)) {
    throw new Error(
      `ComfyUI 3D 输出格式 ${extension || '(未知)'} 暂不支持，请输出 GLB、glTF、OBJ、PLY、STL、FBX 或 USDZ。`,
    );
  }
  return extension;
}
