import type { Edge } from '@xyflow/react';
import { KIND_DEFAULTS, placeholderImage } from '../canvas/placeholders';
import {
  migrateLegacyDirectorNode,
  NODE_KIND_META,
  type FlowEdge,
  type FlowNode,
  type NodeKind,
} from '../canvas/nodeTypes';
import { isValidConnection, resolveConnectionPorts } from '../graph/graph';
import { recoverPersistedAudioNode } from '../lib/mediaPreview';

/**
 * 后端执行流水线格式（v1）。这是旧导出的兼容接口，不包含画布布局信息。
 */
export interface PipelineNode {
  id: string;
  kind: string;
  title: string;
  params: Record<string, unknown>;
  inputs: string[];
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowJSON {
  version: 1;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export function toWorkflowJSON(nodes: FlowNode[], edges: Edge[]): WorkflowJSON {
  const incoming = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  });

  const pipelineNodes: PipelineNode[] = nodes.map((node) => ({
    id: node.id,
    kind: node.data.kind,
    title: node.data.title,
    params: {
      imageUrl: node.data.imageUrl ?? null,
      model3dUrl: node.data.model3dUrl ?? null,
      images: node.data.images ?? null,
      prompt: node.data.result ?? '',
      input: node.data.input ?? null,
    },
    inputs: incoming.get(node.id) ?? [],
  }));

  const pipelineEdges: PipelineEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));

  return { version: 1, nodes: pipelineNodes, edges: pipelineEdges };
}

export function workflowToString(nodes: FlowNode[], edges: Edge[]): string {
  return JSON.stringify(toWorkflowJSON(nodes, edges), null, 2);
}

const WORKFLOW_FILE_FORMAT = 'qiansi-canvas-workflow';
const LEGACY_WORKFLOW_FILE_FORMATS = new Set(['kitty-canvas-workflow']);
const MAX_SOURCE_LENGTH = 64 * 1024 * 1024;
const MAX_NODES = 2_000;
const MAX_EDGES = 10_000;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 1_000;
const MAX_JSON_DEPTH = 24;
const MAX_ARRAY_ITEMS = 20_000;
const MAX_OBJECT_KEYS = 5_000;
const MAX_MEDIA_ITEMS = 1_000;
const MAX_MEDIA_VALUE_LENGTH = 24 * 1024 * 1024;
const MAX_COORDINATE = 1_000_000;
const MAX_NODE_SIZE = 100_000;

type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };

export interface WorkflowFileNodeV2 {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
  extent?: 'parent';
  style?: { width?: number; height?: number };
  zIndex?: number;
}

export interface WorkflowFileEdgeV2 {
  id: string;
  type: 'flow';
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface WorkflowFileV2 {
  format: typeof WORKFLOW_FILE_FORMAT;
  version: 2;
  exportedAt: string;
  nodes: WorkflowFileNodeV2[];
  edges: WorkflowFileEdgeV2[];
}

export interface ParsedWorkflowFile {
  nodes: FlowNode[];
  edges: FlowEdge[];
  version: 1 | 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === 'string' && Object.hasOwn(NODE_KIND_META, value);
}

function requiredString(value: unknown, path: string, maxLength = MAX_ID_LENGTH): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} 必须是非空文本`);
  if (value.length > maxLength) throw new Error(`${path} 长度超过限制`);
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${path} 必须是文本`);
  if (value.length > MAX_MEDIA_VALUE_LENGTH) throw new Error(`${path} 内容过大`);
  return value;
}

function finiteNumber(value: unknown, path: string, limit: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new Error(`${path} 必须是有效数字`);
  }
  return value;
}

function sanitizeJSONValue(value: unknown, path: string, depth = 0): JSONValue {
  if (depth > MAX_JSON_DEPTH) throw new Error(`${path} 嵌套层级过深`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} 包含无效数字`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new Error(`${path} 数组内容过多`);
    return value.map((item, index) => sanitizeJSONValue(item, `${path}[${index}]`, depth + 1));
  }
  if (!isRecord(value)) throw new Error(`${path} 包含不支持的数据`);
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) throw new Error(`${path} 字段过多`);
  const result: Record<string, JSONValue> = {};
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error(`${path} 包含不安全字段`);
    }
    result[key] = sanitizeJSONValue(item, `${path}.${key}`, depth + 1);
  }
  return result;
}

const STRING_DATA_FIELDS = [
  'title',
  'description',
  'imageUrl',
  'videoUrl',
  'videoPreviewUrl',
  'audioUrl',
  'model3dUrl',
  'audioFileName',
  'outputText',
  'generationError',
  'result',
  'providerId',
  'model',
  'aspectRatio',
  'styleKey',
  'prompt',
  'stylePreset',
  'effectPreset',
  'characterPreset',
  'imageFileName',
  'videoFileName',
  'effectVideoId',
  'assetVideoId',
  'directorConstraintPrompt',
  'directorLayoutUrl',
  'directorThumbnailUrl',
  'directorThumbnailSceneKey',
] as const;

const STRING_ARRAY_DATA_FIELDS = ['images', 'videos', 'audios', 'models3d', 'appliedTags'] as const;
const BOOLEAN_DATA_FIELDS = ['aiTag', 'isToolContent', 'isSubject', 'referenceOnly'] as const;
const NUMBER_DATA_FIELDS = [
  'viewCount',
  'promptModuleCount',
  'videoTrimStart',
  'videoTrimEnd',
] as const;
const OBJECT_DATA_FIELDS = ['portInputs', 'genParams', 'composerParams', 'directorScene'] as const;
const MEDIA_DATA_FIELDS = [
  'imageUrl',
  'videoUrl',
  'audioUrl',
  'model3dUrl',
  'directorLayoutUrl',
  'directorThumbnailUrl',
] as const;
const MEDIA_ARRAY_DATA_FIELDS = ['images', 'videos', 'audios', 'models3d'] as const;

function validateMediaValue(value: string, path: string) {
  if (value.length > MAX_MEDIA_VALUE_LENGTH) throw new Error(`${path} 媒体内容过大`);
  const normalized = value.trim().toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('file:')
  ) {
    throw new Error(`${path} 使用了不安全的媒体地址`);
  }
  if (
    normalized.startsWith('data:') &&
    !normalized.startsWith('data:image/') &&
    !normalized.startsWith('data:video/') &&
    !normalized.startsWith('data:audio/')
  ) {
    throw new Error(`${path} 使用了不支持的 Data URL`);
  }
}

function normalizeNodeData(rawData: unknown, kind: NodeKind, path: string): FlowNode['data'] {
  if (!isRecord(rawData)) throw new Error(`${path} 必须是对象`);
  if (rawData.kind !== kind) throw new Error(`${path}.kind 与节点类型不一致`);
  const safe = sanitizeJSONValue(rawData, path);
  if (!isRecord(safe)) throw new Error(`${path} 必须是对象`);

  for (const field of STRING_DATA_FIELDS) {
    const value = safe[field];
    if (value !== undefined && typeof value !== 'string') {
      throw new Error(`${path}.${field} 必须是文本`);
    }
  }
  if (typeof safe.title !== 'string') throw new Error(`${path}.title 必须是文本`);
  if (safe.title.length > MAX_TITLE_LENGTH) throw new Error(`${path}.title 长度超过限制`);
  for (const field of STRING_ARRAY_DATA_FIELDS) {
    const value = safe[field];
    if (value === undefined) continue;
    if (
      !Array.isArray(value) ||
      value.length > MAX_MEDIA_ITEMS ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new Error(`${path}.${field} 必须是文本数组`);
    }
  }
  for (const field of BOOLEAN_DATA_FIELDS) {
    const value = safe[field];
    if (value !== undefined && typeof value !== 'boolean') {
      throw new Error(`${path}.${field} 必须是布尔值`);
    }
  }
  for (const field of NUMBER_DATA_FIELDS) {
    const value = safe[field];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`${path}.${field} 必须是有效数字`);
    }
  }
  for (const field of OBJECT_DATA_FIELDS) {
    const value = safe[field];
    if (value !== undefined && !isRecord(value)) throw new Error(`${path}.${field} 必须是对象`);
  }
  if (safe.composerMarks !== undefined && !Array.isArray(safe.composerMarks)) {
    throw new Error(`${path}.composerMarks 必须是数组`);
  }
  if (safe.videoRemakeSegments !== undefined) {
    if (
      !Array.isArray(safe.videoRemakeSegments) ||
      safe.videoRemakeSegments.length > 5 ||
      safe.videoRemakeSegments.some(
        (segment) =>
          !isRecord(segment) ||
          typeof segment.start !== 'number' ||
          !Number.isFinite(segment.start) ||
          typeof segment.end !== 'number' ||
          !Number.isFinite(segment.end),
      )
    ) {
      throw new Error(`${path}.videoRemakeSegments 必须是最多五项的有效时间范围数组`);
    }
  }
  for (const field of MEDIA_DATA_FIELDS) {
    const value = safe[field];
    if (typeof value === 'string') validateMediaValue(value, `${path}.${field}`);
  }
  for (const field of MEDIA_ARRAY_DATA_FIELDS) {
    const value = safe[field];
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        validateMediaValue(item as string, `${path}.${field}[${index}]`),
      );
    }
  }

  const {
    generationRequestId: _requestId,
    generationTargetMediaSignature: _targetSignature,
    ...stableData
  } = safe;
  return {
    ...KIND_DEFAULTS[kind],
    ...stableData,
    kind,
    generating: false,
    progress: 0,
  } as FlowNode['data'];
}

function exportNodeData(node: FlowNode): Record<string, unknown> {
  const {
    generationRequestId: _requestId,
    generationTargetMediaSignature: _targetSignature,
    ...data
  } = node.data;
  return { ...data, kind: node.data.kind, generating: false, progress: 0 };
}

function exportNodeStyle(node: FlowNode): WorkflowFileNodeV2['style'] | undefined {
  const width = typeof node.style?.width === 'number' ? node.style.width : undefined;
  const height = typeof node.style?.height === 'number' ? node.style.height : undefined;
  return width === undefined && height === undefined ? undefined : { width, height };
}

export function toWorkflowFile(nodes: FlowNode[], edges: FlowEdge[]): WorkflowFileV2 {
  return {
    format: WORKFLOW_FILE_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      position: { ...node.position },
      data: exportNodeData(node),
      ...(node.parentId ? { parentId: node.parentId } : {}),
      ...(node.extent === 'parent' ? { extent: 'parent' as const } : {}),
      ...(exportNodeStyle(node) ? { style: exportNodeStyle(node) } : {}),
      ...(typeof node.zIndex === 'number' ? { zIndex: node.zIndex } : {}),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      type: 'flow',
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}

export function workflowFileToString(nodes: FlowNode[], edges: FlowEdge[]): string {
  return JSON.stringify(toWorkflowFile(nodes, edges), null, 2);
}

export function comfyProviderNodeWorkflowFileToString(options: {
  kind: 'image' | 'video' | 'audio' | '3d';
  title: string;
  providerId: string;
  model: string;
  modes?: string[];
  defaultPrompt?: string;
  supportsAudioReference?: boolean;
  supportsImageReference?: boolean;
}): string {
  const title = requiredString(options.title, 'title', MAX_TITLE_LENGTH);
  const providerId = requiredString(options.providerId, 'providerId');
  const model = requiredString(options.model, 'model');
  const defaultPrompt =
    typeof options.defaultPrompt === 'string' ? options.defaultPrompt.slice(0, 1_000_000) : '';
  const baseId = `comfy-${model}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, MAX_ID_LENGTH - 16);
  const promptId = `${baseId}-prompt`;
  const nodeId = `${baseId}-${options.kind}`;
  const promptNode: WorkflowFileV2['nodes'][number] = {
    id: promptId,
    type: 'text',
    position: { x: 80, y: 260 },
    data: {
      kind: 'text',
      title: '提示词',
      description: '填写 ComfyUI 工作流提示词',
      prompt: defaultPrompt,
    },
  };
  const nodes: WorkflowFileV2['nodes'] = [promptNode];
  const edges: WorkflowFileV2['edges'] = [
    {
      id: `${baseId}-prompt-edge`,
      type: 'flow',
      source: promptId,
      target: nodeId,
      sourceHandle: 'text',
      targetHandle: 'prompt',
    },
  ];

  if (options.kind === 'video') {
    const supportedModes = new Set(options.modes || []);
    const mode = supportedModes.has('视频换人物')
      ? '视频换人物'
      : supportedModes.has('图片参考')
        ? '图片参考'
        : supportedModes.has('全能参考')
          ? '全能参考'
          : supportedModes.has('首尾帧')
            ? '首尾帧'
            : supportedModes.has('图生视频')
              ? '图生视频'
              : '文生视频';
    const addImageInput = (
      suffix: string,
      nodeTitle: string,
      description: string,
      x: number,
      y = 80,
    ) => {
      const id = `${baseId}-${suffix}`;
      nodes.push({
        id,
        type: 'image',
        position: { x, y },
        data: { kind: 'image', title: nodeTitle, description },
      });
      return id;
    };
    if (mode === '视频换人物') {
      const sourceId = `${baseId}-source-video`;
      const characterId = addImageInput(
        'character',
        '目标人物图',
        '上传要替换到视频中的人物图片',
        80,
      );
      nodes.push({
        id: sourceId,
        type: 'video',
        position: { x: 80, y: 440 },
        data: { kind: 'video', title: '原视频', description: '上传要替换人物的原视频' },
      });
      edges.push(
        {
          id: `${baseId}-source-edge`,
          type: 'flow',
          source: sourceId,
          target: nodeId,
          sourceHandle: 'video',
          targetHandle: 'source-video',
        },
        {
          id: `${baseId}-character-edge`,
          type: 'flow',
          source: characterId,
          target: nodeId,
          sourceHandle: 'image',
          targetHandle: 'character-reference',
        },
      );
    } else if (mode === '图片参考' || mode === '全能参考') {
      promptNode.position = { x: 700, y: 260 };
      const firstReferenceId = addImageInput(
        'reference-1',
        '参考图 1',
        '上传人物、场景或风格参考图 1',
        40,
        40,
      );
      const secondReferenceId = addImageInput(
        'reference-2',
        '参考图 2',
        '上传人物、场景或风格参考图 2',
        40,
        500,
      );
      edges.push(
        {
          id: `${baseId}-reference-1-edge`,
          type: 'flow',
          source: firstReferenceId,
          target: nodeId,
          sourceHandle: 'image',
          targetHandle: 'frame',
        },
        {
          id: `${baseId}-reference-2-edge`,
          type: 'flow',
          source: secondReferenceId,
          target: nodeId,
          sourceHandle: 'image',
          targetHandle: 'frame',
        },
      );
    } else if (mode === '首尾帧') {
      const startId = addImageInput('start', '首帧图', '上传视频起始画面', 80);
      const endId = addImageInput('end', '尾帧图', '上传视频结束画面', 80, 500);
      edges.push(
        {
          id: `${baseId}-start-edge`,
          type: 'flow',
          source: startId,
          target: nodeId,
          sourceHandle: 'image',
          targetHandle: 'frame',
        },
        {
          id: `${baseId}-end-edge`,
          type: 'flow',
          source: endId,
          target: nodeId,
          sourceHandle: 'image',
          targetHandle: 'frame',
        },
      );
    } else if (mode === '图生视频') {
      const startId = addImageInput('start', '首帧图', '上传视频起始画面', 80);
      edges.push({
        id: `${baseId}-start-edge`,
        type: 'flow',
        source: startId,
        target: nodeId,
        sourceHandle: 'image',
        targetHandle: 'frame',
      });
    }
    nodes.push({
      id: nodeId,
      type: 'video',
      position:
        mode === '图片参考' || mode === '全能参考' ? { x: 1120, y: 260 } : { x: 520, y: 260 },
      data: {
        kind: 'video',
        title,
        description: `${title} · ComfyUI 工作流`,
        providerId,
        model,
        composerParams: { mode },
      },
    });
  } else if (options.kind === 'audio') {
    nodes.push({
      id: nodeId,
      type: 'audio',
      position: { x: 520, y: 260 },
      data: {
        kind: 'audio',
        title,
        description: `${title} · ComfyUI 音频工作流`,
        providerId,
        model,
      },
    });
    if (options.supportsAudioReference) {
      const sourceId = `${baseId}-source-audio`;
      nodes.push({
        id: sourceId,
        type: 'audio',
        position: { x: 80, y: 520 },
        data: {
          kind: 'audio',
          title: '参考音频',
          description: '上传要传入 ComfyUI 工作流的参考音频',
        },
      });
      edges.push({
        id: `${baseId}-source-audio-edge`,
        type: 'flow',
        source: sourceId,
        target: nodeId,
        sourceHandle: 'audio',
        targetHandle: 'source-audio',
      });
    }
  } else if (options.kind === '3d') {
    nodes.push({
      id: nodeId,
      type: 'model-3d',
      position: { x: 520, y: 260 },
      data: {
        kind: 'model-3d',
        title,
        description: `${title} · ComfyUI 3D 工作流`,
        providerId,
        model,
      },
    });
    if (options.supportsImageReference) {
      const sourceId = `${baseId}-reference-image`;
      nodes.push({
        id: sourceId,
        type: 'image',
        position: { x: 80, y: 520 },
        data: {
          kind: 'image',
          title: '3D 参考图',
          description: '上传要转换或参考的对象图片',
        },
      });
      edges.push({
        id: `${baseId}-reference-image-edge`,
        type: 'flow',
        source: sourceId,
        target: nodeId,
        sourceHandle: 'image',
        targetHandle: 'references',
      });
    }
  } else {
    nodes.push({
      id: nodeId,
      type: 'image',
      position: { x: 520, y: 260 },
      data: {
        kind: 'image',
        title,
        description: `${title} · ComfyUI 工作流`,
        providerId,
        model,
      },
    });
  }
  const file: WorkflowFileV2 = {
    format: WORKFLOW_FILE_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    nodes,
    edges,
  };
  return JSON.stringify(file, null, 2);
}

function validateCollectionLimits(root: Record<string, unknown>) {
  if (!Array.isArray(root.nodes)) throw new Error('工作流 nodes 必须是数组');
  if (!Array.isArray(root.edges)) throw new Error('工作流 edges 必须是数组');
  if (root.nodes.length > MAX_NODES) throw new Error(`节点数量不能超过 ${MAX_NODES}`);
  if (root.edges.length > MAX_EDGES) throw new Error(`连线数量不能超过 ${MAX_EDGES}`);
}

function parseStyle(raw: unknown, path: string): WorkflowFileNodeV2['style'] | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error(`${path} 必须是对象`);
  const extraKeys = Object.keys(raw).filter((key) => key !== 'width' && key !== 'height');
  if (extraKeys.length > 0) throw new Error(`${path} 包含不支持的样式字段`);
  const width =
    raw.width === undefined ? undefined : finiteNumber(raw.width, `${path}.width`, MAX_NODE_SIZE);
  const height =
    raw.height === undefined
      ? undefined
      : finiteNumber(raw.height, `${path}.height`, MAX_NODE_SIZE);
  if (width !== undefined && width <= 0) throw new Error(`${path}.width 必须大于 0`);
  if (height !== undefined && height <= 0) throw new Error(`${path}.height 必须大于 0`);
  return width === undefined && height === undefined ? undefined : { width, height };
}

function parseV2Node(raw: unknown, index: number): FlowNode {
  const path = `nodes[${index}]`;
  if (!isRecord(raw)) throw new Error(`${path} 必须是对象`);
  const id = requiredString(raw.id, `${path}.id`);
  if (!isNodeKind(raw.type)) throw new Error(`${path}.type 是未知节点类型`);
  if (!isRecord(raw.position)) throw new Error(`${path}.position 必须是对象`);
  const position = {
    x: finiteNumber(raw.position.x, `${path}.position.x`, MAX_COORDINATE),
    y: finiteNumber(raw.position.y, `${path}.position.y`, MAX_COORDINATE),
  };
  const style = parseStyle(raw.style, `${path}.style`);
  const parentId = optionalString(raw.parentId, `${path}.parentId`);
  if (raw.extent !== undefined && raw.extent !== 'parent') {
    throw new Error(`${path}.extent 仅支持 parent`);
  }
  if (raw.extent === 'parent' && !parentId) throw new Error(`${path}.extent 缺少 parentId`);
  const zIndex =
    raw.zIndex === undefined
      ? undefined
      : finiteNumber(raw.zIndex, `${path}.zIndex`, MAX_COORDINATE);
  return {
    id,
    type: raw.type,
    position,
    data: normalizeNodeData(raw.data, raw.type, `${path}.data`),
    selected: false,
    dragging: false,
    ...(parentId ? { parentId } : {}),
    ...(raw.extent === 'parent' ? { extent: 'parent' as const } : {}),
    ...(style ? { style } : {}),
    ...(zIndex !== undefined ? { zIndex } : {}),
  };
}

function migrateLegacyComfyUploadNodes(nodes: FlowNode[], rawEdges: unknown[]): FlowNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const legacyUploadIds = new Set<string>();

  for (const rawEdge of rawEdges) {
    if (!isRecord(rawEdge) || rawEdge.targetHandle !== 'frame') continue;
    if (typeof rawEdge.source !== 'string' || typeof rawEdge.target !== 'string') continue;
    const source = nodesById.get(rawEdge.source);
    const target = nodesById.get(rawEdge.target);
    if (
      source?.data.kind === 'front-frame' &&
      source.id.startsWith('comfy-') &&
      /-(?:start|end)$/.test(source.id) &&
      target?.data.kind === 'video' &&
      typeof target.data.providerId === 'string' &&
      target.data.providerId.startsWith('comfyui-')
    ) {
      legacyUploadIds.add(source.id);
    }
  }

  return nodes.map((node) =>
    legacyUploadIds.has(node.id)
      ? { ...node, type: 'image', data: { ...node.data, kind: 'image' } }
      : node,
  );
}

function legacyNodeStyle(kind: NodeKind): WorkflowFileNodeV2['style'] | undefined {
  if (kind === 'text') return { width: 350, height: 350 };
  if (kind === 'group') return { width: 320, height: 220 };
  return undefined;
}

function parseV1Node(raw: unknown, index: number): FlowNode {
  const path = `nodes[${index}]`;
  if (!isRecord(raw)) throw new Error(`${path} 必须是对象`);
  const id = requiredString(raw.id, `${path}.id`);
  if (!isNodeKind(raw.kind)) throw new Error(`${path}.kind 是未知节点类型`);
  const title = requiredString(raw.title, `${path}.title`, MAX_TITLE_LENGTH);
  if (raw.params !== undefined && !isRecord(raw.params))
    throw new Error(`${path}.params 必须是对象`);
  const params = isRecord(raw.params) ? raw.params : {};
  const imageUrl = optionalString(params.imageUrl, `${path}.params.imageUrl`);
  const prompt = optionalString(params.prompt, `${path}.params.prompt`);
  let images: string[] | undefined;
  if (params.images !== undefined && params.images !== null) {
    if (
      !Array.isArray(params.images) ||
      params.images.length > MAX_MEDIA_ITEMS ||
      params.images.some((item) => typeof item !== 'string')
    ) {
      throw new Error(`${path}.params.images 必须是文本数组`);
    }
    images = [...params.images] as string[];
  }
  if (imageUrl) validateMediaValue(imageUrl, `${path}.params.imageUrl`);
  images?.forEach((item, itemIndex) =>
    validateMediaValue(item, `${path}.params.images[${itemIndex}]`),
  );
  const kind = raw.kind;
  const fallbackMedia = kind === 'text' ? {} : placeholderImage(kind);
  const data: FlowNode['data'] = {
    kind,
    ...KIND_DEFAULTS[kind],
    ...fallbackMedia,
    title,
    ...(imageUrl ? { imageUrl } : {}),
    ...(images ? { images } : {}),
    ...(prompt ? { prompt, result: prompt, outputText: prompt } : {}),
    generating: false,
    progress: 0,
  };
  const style = legacyNodeStyle(kind);
  return {
    id,
    type: kind,
    position: { x: (index % 4) * 520, y: Math.floor(index / 4) * 420 },
    data,
    selected: false,
    dragging: false,
    ...(style ? { style } : {}),
    ...(kind === 'group' ? { zIndex: -1 } : {}),
  };
}

function validateNodeHierarchy(nodes: FlowNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) throw new Error(`节点 ${node.id} 引用了不存在的父分组`);
    if (parent.data.kind !== 'group') throw new Error(`节点 ${node.id} 的父节点不是分组`);
    if (parent.id === node.id) throw new Error(`节点 ${node.id} 不能把自己作为父分组`);
  }
  for (const node of nodes) {
    const seen = new Set<string>([node.id]);
    let parentId = node.parentId;
    while (parentId) {
      if (seen.has(parentId)) throw new Error(`节点 ${node.id} 的分组层级形成循环`);
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
}

/** React Flow requires every parent node to appear before its children. */
function orderNodesByHierarchy(nodes: FlowNode[]): FlowNode[] {
  const children = new Map<string, FlowNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  const ordered: FlowNode[] = [];
  const append = (node: FlowNode) => {
    ordered.push(node);
    for (const child of children.get(node.id) ?? []) append(child);
  };
  for (const node of nodes) {
    if (!node.parentId) append(node);
  }
  return ordered;
}

function parseEdges(rawEdges: unknown[], nodes: FlowNode[], version: 1 | 2): FlowEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set<string>();
  const edges: FlowEdge[] = [];

  rawEdges.forEach((raw, index) => {
    const path = `edges[${index}]`;
    if (!isRecord(raw)) throw new Error(`${path} 必须是对象`);
    const id = requiredString(raw.id, `${path}.id`);
    if (edgeIds.has(id)) throw new Error(`${path}.id 与其它连线重复`);
    edgeIds.add(id);
    const source = requiredString(raw.source, `${path}.source`);
    const target = requiredString(raw.target, `${path}.target`);
    if (!nodeIds.has(source) || !nodeIds.has(target)) throw new Error(`${path} 引用了不存在的节点`);
    const sourceHandle =
      version === 2 ? (optionalString(raw.sourceHandle, `${path}.sourceHandle`) ?? null) : null;
    const targetHandle =
      version === 2 ? (optionalString(raw.targetHandle, `${path}.targetHandle`) ?? null) : null;
    const ports = resolveConnectionPorts(nodes, source, sourceHandle, target, targetHandle);
    if (!ports) throw new Error(`${path} 的节点端口不兼容`);
    if (!isValidConnection(nodes, edges, source, sourceHandle, target, targetHandle)) {
      throw new Error(`${path} 重复、超出端口容量或形成循环`);
    }
    edges.push({
      id,
      type: 'flow',
      source,
      target,
      sourceHandle: ports.source.id,
      targetHandle: ports.target.id,
      selected: false,
    });
  });
  return edges;
}

function parseWorkflowRoot(source: string): Record<string, unknown> {
  if (!source.trim()) throw new Error('文件内容为空');
  if (source.length > MAX_SOURCE_LENGTH) throw new Error('工作流文件超过 64 MB');
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!isRecord(parsed)) throw new Error('工作流根内容必须是对象');
  return parsed;
}

export function parseWorkflowFileString(source: string): ParsedWorkflowFile {
  const root = parseWorkflowRoot(source);
  if (root.version !== 1 && root.version !== 2) {
    const looksLikeComfyApi = Object.values(root).some((value) => {
      const node = isRecord(value) ? value : undefined;
      return typeof node?.class_type === 'string' && isRecord(node.inputs);
    });
    if (looksLikeComfyApi) {
      throw new Error(
        '这是 ComfyUI API JSON，不能直接导入无限画布；请在 ComfyUI 设置中下载“画布 JSON”。',
      );
    }
    if (Array.isArray(root.nodes) && Array.isArray(root.links)) {
      throw new Error(
        '这是 ComfyUI 普通工作流 JSON，不能直接导入无限画布；请先在 ComfyUI 设置中导入，再下载“画布 JSON”。',
      );
    }
    throw new Error('不支持的工作流版本');
  }
  validateCollectionLimits(root);
  if (
    root.version === 2 &&
    root.format !== WORKFLOW_FILE_FORMAT &&
    !LEGACY_WORKFLOW_FILE_FORMATS.has(String(root.format))
  ) {
    throw new Error('这不是 Qiansi-Canvas 工作流文件');
  }

  const rawNodes = root.nodes as unknown[];
  const nodeIds = new Set<string>();
  const parsedNodes = rawNodes.map((raw, index) => {
    const node = migrateLegacyDirectorNode(
      root.version === 2 ? parseV2Node(raw, index) : parseV1Node(raw, index),
    );
    if (nodeIds.has(node.id)) throw new Error(`nodes[${index}].id 与其它节点重复`);
    nodeIds.add(node.id);
    return node;
  });
  const migratedNodes = (
    root.version === 2
      ? migrateLegacyComfyUploadNodes(parsedNodes, root.edges as unknown[])
      : parsedNodes
  ).map(recoverPersistedAudioNode);
  validateNodeHierarchy(migratedNodes);
  const nodes = orderNodesByHierarchy(migratedNodes);
  const edges = parseEdges(root.edges as unknown[], nodes, root.version);
  return { nodes, edges, version: root.version };
}
