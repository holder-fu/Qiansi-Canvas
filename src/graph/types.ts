import type { NodeKind } from '../canvas/nodeTypes';

/**
 * Asset types that flow along edges between node ports.
 * Ordered from most specific to most permissive.
 */
export const ASSET_TYPES = Object.freeze([
  'image',
  'video',
  'audio',
  'text',
  'reference',
  'any',
] as const);

export type AssetType = (typeof ASSET_TYPES)[number];

const ASSET_TYPE_SET: ReadonlySet<string> = new Set(ASSET_TYPES);

export function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && ASSET_TYPE_SET.has(value);
}

export type PortDirection = 'in' | 'out';

/**
 * A typed connection point on a node. In Phase 1 every node exposes a single
 * implicit `in` (accepts `any`) and a single `out` (asset type derived from the
 * node kind). Phase 2 enriches each node with multiple labelled, type-specific
 * ports and the node components render one MagneticEdgeHandle per PortDef.
 */
export interface PortDef {
  id: string;
  direction: PortDirection;
  assetType: AssetType;
  label: string;
  /** Inputs are single-connection by default; collectors and prompts opt in. */
  multiple?: boolean;
  /** Optional finite capacity for a multiple input. */
  maxConnections?: number;
}

/** JSON-safe values currently arriving at a node, keyed by target port id. */
export type NodePortInputs = Record<string, unknown[]>;

/** Shared semantic colour for typed ports and their edges. */
export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  image: '#34d399',
  video: '#f472b6',
  audio: '#a78bfa',
  text: '#60a5fa',
  reference: '#22d3ee',
  any: '#94a3b8',
};

/**
 * Capabilities a node kind exposes to the AI Command Composer.
 * These drive which tools appear in the composer header and which controls
 * can be configured for a node. New node kinds / media types only need to
 * declare their capabilities — the UI is assembled dynamically.
 */
export type NodeCapability =
  | 'generate'
  | 'reference'
  | 'style'
  | 'mark'
  | 'effect'
  | 'character'
  | 'image-edit'
  | 'upscale'
  | 'inpaint'
  | 'outpaint'
  | 'start-frame'
  | 'end-frame'
  | 'motion'
  | 'camera'
  | 'audio'
  | 'voice'
  | 'music'
  | 'context'
  | 'rewrite'
  | 'expand'
  | 'storyboard';

/**
 * Atomic control slots that the composer can render.
 * Each control maps to a small, reusable UI component in controls/.
 */
export type ComposerControlType =
  | 'references'
  | 'marks'
  | 'style'
  | 'effects'
  | 'character'
  | 'startFrame'
  | 'endFrame'
  | 'motion'
  | 'camera'
  | 'audio'
  | 'context'
  | 'mode'
  | 'videoSettings'
  | 'prompt'
  | 'model'
  | 'aspectRatio'
  | 'imageType'
  | 'resolution'
  | 'duration'
  | 'fps'
  | 'count'
  | 'advanced';

/** Declarative description of the AI composer for a node kind. */
export interface ComposerSpec {
  /** Visual family of the composer — drives the prompt placeholder and default controls. */
  type: 'image' | 'video' | 'text' | 'audio' | '3d' | 'generic';
  /** Ordered list of control slots to render in the composer chrome. */
  controls: ComposerControlType[];
}

/** Declarative description of a node kind's ports — the "Node spec" layer. */
export interface NodeSpec {
  kind: NodeKind;
  inputs: PortDef[];
  outputs: PortDef[];
  /** Capabilities exposed to the AI composer. */
  capabilities: NodeCapability[];
  /** AI command composer configuration for this node kind. */
  composer: ComposerSpec;
}
