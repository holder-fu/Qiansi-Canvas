import type { WorkspaceId, NodeKind, FlowNode, FlowEdge } from './nodeTypes';
import { placeholderImage, KIND_DEFAULTS } from './placeholders';

// 复刻旧版无限画布的 AI / 逻辑节点，所有工作区都提供入口。
// `rh` 仅保留给历史画布读取，不再开放新建入口。
const REPLICA_KINDS: NodeKind[] = [
  'generator',
  'llm',
  'comfy',
  'midjourney',
  'msgen',
  'loop',
  'output',
  'plugin',
];

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeNode(
  kind: NodeKind,
  x: number,
  y: number,
  extra: Partial<FlowNode['data']> = {},
): FlowNode {
  return {
    id: genId('node'),
    type: kind,
    position: { x, y },
    data: { kind, ...KIND_DEFAULTS[kind], ...placeholderImage(kind), ...extra },
  };
}

export interface WorkspaceConfig {
  id: WorkspaceId;
  title: string;
  tagline: string;
  /** Node kinds available in the right-click / add-node menu */
  nodeKinds: NodeKind[];
  /** Factory that creates default nodes + edges when entering the workspace */
  create: () => { nodes: FlowNode[]; edges: FlowEdge[] };
  /** Fit view padding */
  fitPadding?: number;
}

export const WORKSPACES: Record<WorkspaceId, WorkspaceConfig> = {
  home: {
    id: 'home',
    title: '首页',
    tagline: '',
    nodeKinds: [],
    create: () => ({ nodes: [], edges: [] }),
  },
  script: {
    id: 'script',
    title: '故事脚本生成',
    tagline: '输入一句话，自动生成故事脚本与分镜',
    nodeKinds: [
      'script',
      'text',
      'image',
      'image-compare',
      'video',
      'director-2d',
      'director-3d',
      'model-3d',
      'audio',
      'group',
      ...REPLICA_KINDS,
    ],
    create: () => ({ nodes: [makeNode('text', -140, -96)], edges: [] }),
  },
  views: {
    id: 'views',
    title: '角色三视图',
    tagline: '上传角色参考，一键生成正视 / 侧视 / 背视三视图',
    nodeKinds: [
      'image',
      'image-compare',
      'views',
      'video',
      'director-2d',
      'director-3d',
      'model-3d',
      'text',
      'audio',
      'group',
      ...REPLICA_KINDS,
    ],
    create: () => {
      const src = makeNode('image', -340, -96, {
        title: '角色参考图',
        description: '上传角色正面参考',
      });
      const tgt = makeNode('views', 120, -96, {
        title: '角色三视图',
        description: '正面、侧面、背面三视图',
        viewCount: 3,
      });
      return {
        nodes: [src, tgt],
        edges: [{ id: genId('edge'), source: src.id, target: tgt.id, type: 'flow' }],
      };
    },
    fitPadding: 0.35,
  },
  video: {
    id: 'video',
    title: '首帧图生视频',
    tagline: '上传首帧图片，延展为完整视频',
    nodeKinds: [
      'image',
      'image-compare',
      'front-frame',
      'video',
      'director-2d',
      'director-3d',
      'model-3d',
      'text',
      'audio',
      'group',
      ...REPLICA_KINDS,
    ],
    create: () => {
      const src = makeNode('image', -340, -96, { title: '首帧图', description: '视频第一帧参考' });
      const tgt = makeNode('video', 120, -96, {
        title: '生成视频',
        description: '由首帧延展的视频',
      });
      return {
        nodes: [src, tgt],
        edges: [{ id: genId('edge'), source: src.id, target: tgt.id, type: 'flow' }],
      };
    },
    fitPadding: 0.35,
  },
  audio: {
    id: 'audio',
    title: '音频生视频',
    tagline: '导入音频，驱动画面生成对口型或节奏视频',
    nodeKinds: [
      'audio',
      'image',
      'image-compare',
      'video',
      'director-2d',
      'director-3d',
      'model-3d',
      'text',
      'group',
      ...REPLICA_KINDS,
    ],
    create: () => {
      const src = makeNode('audio', -340, -96, {
        title: '音频输入',
        description: '上传或录制驱动音频',
      });
      const tgt = makeNode('video', 120, -96, { title: '生成视频', description: '音频驱动的视频' });
      return {
        nodes: [src, tgt],
        edges: [{ id: genId('edge'), source: src.id, target: tgt.id, type: 'flow' }],
      };
    },
    fitPadding: 0.35,
  },
};

export function loadWorkspace(id: WorkspaceId): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const cfg = WORKSPACES[id];
  if (!cfg || id === 'home') return { nodes: [], edges: [] };
  return cfg.create();
}
