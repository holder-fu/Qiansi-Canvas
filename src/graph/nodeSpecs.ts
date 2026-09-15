import type { NodeKind } from '../canvas/nodeTypes';
import type {
  AssetType,
  ComposerControlType,
  ComposerSpec,
  NodeCapability,
  NodeSpec,
  PortDef,
  PortDirection,
} from './types';

type LocalizedPortDef = PortDef & { readonly labelKey?: string };

const BUILT_IN_PORT_LABEL_KEYS: Readonly<Record<string, string>> = {
  提示词: 'node.port.prompt',
  参考图: 'node.port.referenceImage',
  参考图片: 'node.port.referenceImage',
  图片: 'node.port.image',
  对比图片: 'node.port.compareImages',
  三视图: 'node.port.views',
  首帧图: 'node.port.firstFrame',
  首尾帧: 'node.port.startEndFrames',
  批次来源: 'node.port.batchSource',
  配乐: 'node.port.soundtrack',
  原视频: 'node.port.sourceVideo',
  目标人物: 'node.port.targetCharacter',
  人物遮罩: 'node.port.subjectMask',
  视频: 'node.port.video',
  '人物/场景参考': 'node.port.subjectSceneReference',
  构图约束: 'node.port.compositionConstraint',
  '2D构图约束': 'node.port.compositionConstraint2d',
  '3D预演约束': 'node.port.previsConstraint3d',
  视频片段: 'node.port.videoClips',
  背景音频: 'node.port.backgroundAudio',
  参考视频: 'node.port.referenceVideo',
  文本: 'node.port.text',
  脚本: 'node.port.script',
  输入: 'node.port.input',
  回复: 'node.port.reply',
  音频: 'node.port.audio',
  输出: 'node.port.output',
  插件输入: 'node.port.pluginInput',
  插件输出: 'node.port.pluginOutput',
};

function inp(id: string, assetType: AssetType, label: string, multiple = false): PortDef {
  return {
    id,
    direction: 'in',
    assetType,
    label,
    multiple,
    labelKey: BUILT_IN_PORT_LABEL_KEYS[label],
  } as LocalizedPortDef;
}

function boundedInp(
  id: string,
  assetType: AssetType,
  label: string,
  maxConnections: number,
): PortDef {
  return {
    ...inp(id, assetType, label, true),
    maxConnections,
  };
}
function out(id: string, assetType: AssetType, label: string): PortDef {
  return {
    id,
    direction: 'out',
    assetType,
    label,
    labelKey: BUILT_IN_PORT_LABEL_KEYS[label],
  } as LocalizedPortDef;
}

/** Translation metadata for a built-in port. Custom/plugin labels intentionally return undefined. */
export function getPortLabelKey(port: PortDef): string | undefined {
  return (port as LocalizedPortDef).labelKey;
}

function composer(type: ComposerSpec['type'], controls: ComposerControlType[]): ComposerSpec {
  return { type, controls };
}

/**
 * Explicit port registry for every NodeKind — the "Node / Port" data model.
 *
 * Design rules (this is the single source of truth for the typed node system):
 * - Asset types come from the PORT declaration, never guessed from node.kind.
 * - Port ids are unique within a single node.
 * - The default input is `inputs[0]` and the default output is `outputs[0]`;
 *   these are used to resolve edges that carry no handle id (seeded/legacy
 *   edges), keeping save/load and the current single-handle UI working.
 * - The UI still renders one magnetic handle per side (unchanged); these specs
 *   drive the graph/typing layer now and per-port rendering in a later phase.
 */
export const NODE_SPECS: Record<NodeKind, NodeSpec> = {
  // ── 图片生成类 ──────────────────────────────────────────────
  image: {
    kind: 'image',
    inputs: [inp('prompt', 'text', '提示词', true), inp('ref', 'reference', '参考图', true)],
    outputs: [out('image', 'image', '图片')],
    capabilities: ['generate', 'reference', 'style', 'mark', 'image-edit', 'upscale'],
    composer: composer('image', [
      'references',
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },
  'image-compare': {
    kind: 'image-compare',
    inputs: [boundedInp('images', 'image', '对比图片', 2)],
    outputs: [],
    capabilities: [],
    composer: composer('generic', []),
  },
  views: {
    kind: 'views',
    inputs: [inp('prompt', 'text', '提示词', true), inp('ref', 'reference', '参考图', true)],
    outputs: [out('image', 'image', '三视图')],
    capabilities: ['generate', 'reference', 'style', 'mark', 'image-edit', 'upscale'],
    composer: composer('image', [
      'references',
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },
  'front-frame': {
    kind: 'front-frame',
    inputs: [inp('prompt', 'text', '提示词', true), inp('ref', 'reference', '参考图', true)],
    outputs: [out('image', 'image', '首帧图')],
    capabilities: ['generate', 'reference', 'style', 'mark', 'image-edit', 'upscale'],
    composer: composer('image', [
      'references',
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },
  generator: {
    kind: 'generator',
    inputs: [inp('prompt', 'text', '提示词', true), inp('ref', 'reference', '参考图', true)],
    outputs: [out('image', 'image', '图片')],
    capabilities: ['generate', 'reference', 'style', 'mark', 'image-edit', 'upscale'],
    composer: composer('image', [
      'references',
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },
  comfy: {
    kind: 'comfy',
    inputs: [inp('prompt', 'text', '提示词', true), inp('ref', 'reference', '参考图', true)],
    outputs: [out('image', 'image', '图片')],
    capabilities: ['generate', 'reference', 'style', 'mark', 'image-edit', 'upscale'],
    composer: composer('image', [
      'references',
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },
  midjourney: {
    kind: 'midjourney',
    inputs: [inp('prompt', 'text', '提示词', true), inp('ref', 'reference', '参考图', true)],
    outputs: [out('image', 'image', '图片')],
    capabilities: ['generate', 'reference', 'style', 'mark', 'image-edit', 'upscale'],
    composer: composer('image', [
      'references',
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },
  msgen: {
    kind: 'msgen',
    inputs: [inp('prompt', 'text', '提示词', true)],
    outputs: [out('image', 'image', '图片')],
    capabilities: ['generate', 'style', 'mark'],
    composer: composer('image', [
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },
  rh: {
    kind: 'rh',
    inputs: [inp('prompt', 'text', '提示词', true), inp('ref', 'reference', '参考图', true)],
    outputs: [out('image', 'image', '图片')],
    capabilities: ['generate', 'reference', 'style', 'mark', 'image-edit', 'upscale'],
    composer: composer('image', [
      'references',
      'marks',
      'style',
      'prompt',
      'model',
      'aspectRatio',
      'imageType',
      'resolution',
      'count',
    ]),
  },

  // ── 视频类 ────────────────────────────────────────────────
  video: {
    kind: 'video',
    inputs: [
      inp('prompt', 'text', '提示词', true),
      inp('frame', 'image', '首尾帧', true),
      inp('batch-source', 'video', '批次来源', true),
      inp('audio-track', 'audio', '配乐'),
      inp('source-video', 'video', '原视频', false),
      inp('character-reference', 'reference', '目标人物', false),
      inp('mask', 'image', '人物遮罩', false),
    ],
    outputs: [out('video', 'video', '视频')],
    capabilities: [
      'generate',
      'reference',
      'mark',
      'effect',
      'character',
      'start-frame',
      'end-frame',
      'motion',
      'camera',
      'audio',
    ],
    composer: composer('video', [
      'references',
      'marks',
      'effects',
      'character',
      'camera',
      'prompt',
      'model',
      'mode',
      'videoSettings',
    ]),
  },
  director: {
    kind: 'director',
    inputs: [inp('references', 'reference', '人物/场景参考', true)],
    outputs: [out('layout', 'reference', '构图约束')],
    capabilities: ['reference', 'camera'],
    composer: composer('generic', []),
  },
  'director-2d': {
    kind: 'director-2d',
    inputs: [inp('references', 'reference', '人物/场景参考', true)],
    outputs: [out('layout', 'reference', '2D构图约束')],
    capabilities: ['reference', 'camera'],
    composer: composer('generic', []),
  },
  'director-3d': {
    kind: 'director-3d',
    inputs: [inp('references', 'reference', '人物/场景参考', true)],
    outputs: [out('layout', 'reference', '3D预演约束')],
    capabilities: ['reference', 'camera'],
    composer: composer('generic', []),
  },
  'model-3d': {
    kind: 'model-3d',
    inputs: [
      inp('prompt', 'text', '提示词', true),
      inp('references', 'reference', '图片参考', true),
    ],
    outputs: [out('model', 'reference', '3D 模型')],
    capabilities: ['generate', 'reference'],
    composer: composer('3d', ['references', 'prompt', 'model']),
  },
  'video-comp': {
    kind: 'video-comp',
    inputs: [
      inp('clips', 'video', '视频片段', true),
      inp('audio-track', 'audio', '背景音频', false),
    ],
    outputs: [out('video', 'video', '视频')],
    capabilities: ['generate', 'audio'],
    composer: composer('generic', ['duration', 'advanced']),
  },

  // ── 文本类 ────────────────────────────────────────────────
  text: {
    kind: 'text',
    inputs: [
      inp('prompt', 'text', '提示词', true),
      inp('ref', 'reference', '参考图片', true),
      inp('video-ref', 'video', '参考视频', true),
    ],
    outputs: [out('text', 'text', '文本')],
    capabilities: ['generate', 'context', 'rewrite', 'expand', 'storyboard'],
    composer: composer('text', ['context', 'mode', 'prompt', 'model']),
  },
  script: {
    kind: 'script',
    inputs: [inp('prompt', 'text', '提示词', true)],
    outputs: [out('text', 'text', '脚本')],
    capabilities: ['generate', 'context', 'rewrite', 'expand', 'storyboard'],
    composer: composer('text', ['context', 'mode', 'prompt', 'model']),
  },
  llm: {
    kind: 'llm',
    inputs: [inp('prompt', 'text', '输入', true)],
    outputs: [out('text', 'text', '回复')],
    capabilities: ['generate', 'context', 'rewrite', 'expand', 'storyboard'],
    composer: composer('text', ['context', 'mode', 'prompt', 'model']),
  },

  // ── 音频 ─────────────────────────────────────────────────
  audio: {
    kind: 'audio',
    inputs: [
      inp('prompt', 'text', '提示词', true),
      inp('source-video', 'video', '原视频', false),
      inp('source-audio', 'audio', '参考音频', false),
    ],
    outputs: [out('audio', 'audio', '音频')],
    capabilities: ['generate', 'reference', 'audio', 'music'],
    composer: composer('audio', ['references', 'prompt', 'model', 'duration', 'count']),
  },

  // ── 逻辑 / 收集 ───────────────────────────────────────────
  loop: {
    kind: 'loop',
    inputs: [inp('in', 'any', '输入', true)],
    outputs: [out('out', 'any', '输出')],
    capabilities: ['generate'],
    composer: composer('generic', ['count']),
  },
  output: {
    kind: 'output',
    inputs: [inp('in', 'any', '输入', true)],
    outputs: [out('out', 'any', '输出')],
    capabilities: [],
    composer: composer('generic', []),
  },

  // Third-party nodes keep a universal static fallback. The graph and node renderer
  // replace these asset types with each installed contribution's persisted declarations.
  plugin: {
    kind: 'plugin',
    inputs: [inp('in', 'any', '插件输入', true)],
    outputs: [out('out', 'any', '插件输出')],
    capabilities: [],
    composer: composer('generic', []),
  },

  // ── 容器（无连接端口） ────────────────────────────────────
  group: {
    kind: 'group',
    inputs: [],
    outputs: [],
    capabilities: [],
    composer: composer('generic', []),
  },
};

/** The declared spec for a node kind. */
export function getNodeSpec(kind: NodeKind): NodeSpec {
  return NODE_SPECS[kind];
}

/** Ports of a given direction for a node kind (used by node rendering in Phase 2). */
export function getPorts(kind: NodeKind, direction: PortDirection): PortDef[] {
  const spec = getNodeSpec(kind);
  return direction === 'in' ? spec.inputs : spec.outputs;
}

/** Default output port (`outputs[0]`) — used when an edge has no handle id. */
export function defaultOutputPort(kind: NodeKind): PortDef | undefined {
  return getNodeSpec(kind).outputs[0];
}

/** Default input port (`inputs[0]`) — used when an edge has no handle id. */
export function defaultInputPort(kind: NodeKind): PortDef | undefined {
  return getNodeSpec(kind).inputs[0];
}

/**
 * Resolve the SOURCE port an edge emits from: by the edge's `sourceHandle`
 * when present, otherwise the node's default output port. This is how upstream
 * asset types are obtained from the PORT rather than guessed from node.kind.
 */
export function resolveOutputPort(
  kind: NodeKind,
  sourceHandle?: string | null,
): PortDef | undefined {
  const spec = getNodeSpec(kind);
  if (sourceHandle) return spec.outputs.find((p) => p.id === sourceHandle);
  return defaultOutputPort(kind);
}

/** Resolve the TARGET input port an edge lands on (by handle id, else default). */
export function resolveInputPort(
  kind: NodeKind,
  targetHandle?: string | null,
): PortDef | undefined {
  const spec = getNodeSpec(kind);
  if (targetHandle) return spec.inputs.find((p) => p.id === targetHandle);
  return defaultInputPort(kind);
}

/** Asset type emitted by a node's default output port. */
export function outputAssetType(kind: NodeKind): AssetType {
  return defaultOutputPort(kind)?.assetType ?? 'any';
}

/** Resolve the composer spec for a node kind. */
export function getComposerSpec(kind: NodeKind): ComposerSpec {
  return getNodeSpec(kind).composer;
}

/** Resolve capabilities for a node kind. */
export function getCapabilities(kind: NodeKind): NodeCapability[] {
  return getNodeSpec(kind).capabilities;
}

/**
 * Merge capabilities when multiple nodes are selected.
 * The result is the intersection (capabilities common to all selected kinds).
 */
export function mergeCapabilities(kinds: NodeKind[]): NodeCapability[] {
  if (kinds.length === 0) return [];
  const first = kinds[0];
  if (!first) return [];
  const sets = kinds.map((k) => new Set(getCapabilities(k)));
  return Array.from(getCapabilities(first)).filter((c) => sets.every((s) => s.has(c)));
}

/**
 * Derive a composer spec for a multi-selection context.
 * If all selected nodes share the same composer type, use that family;
 * otherwise fall back to a generic multi-reference composer.
 */
export function mergeComposerSpec(kinds: NodeKind[]): ComposerSpec {
  if (kinds.length === 0) return composer('generic', []);

  const firstKind = kinds[0];
  if (!firstKind) return composer('generic', []);
  if (kinds.length === 1) return getComposerSpec(firstKind);

  const firstSpec = getComposerSpec(firstKind);
  const types = new Set(kinds.map((k) => getComposerSpec(k).type));
  const commonType: ComposerSpec['type'] = types.size === 1 ? firstSpec.type : 'generic';

  // Start from the first node's control list, keep only controls that every
  // selected node also declares.
  const firstControls = firstSpec.controls;
  const controlSets = kinds.map((k) => new Set(getComposerSpec(k).controls));
  const commonControls = firstControls.filter((c) => controlSets.every((s) => s.has(c)));

  return composer(commonType, commonControls);
}
