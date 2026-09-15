import type { NodeTypes } from '@xyflow/react';
import { AudioNode } from './nodes/AudioNode';
import { DirectorNode, DirectorThreeNode, DirectorTwoNode } from './nodes/DirectorNode';
import { GroupNode } from './nodes/GroupNode';
import { ImageNode } from './nodes/ImageNode';
import { ImageCompareNode } from './nodes/ImageCompareNode';
import { PluginNode } from './nodes/PluginNode';
import { TextNode } from './nodes/TextNode';
import { Model3dNode } from './nodes/Model3dNode';

/**
 * Stable renderer registry for every persisted canvas node kind.
 *
 * Keep this object at module scope: React Flow remounts nodes when the nodeTypes
 * object identity changes. Extensions can add renderers here without coupling
 * their component imports to FlowCanvas itself.
 */
export const CANVAS_NODE_TYPES: NodeTypes = Object.freeze({
  image: ImageNode,
  'image-compare': ImageCompareNode,
  views: ImageNode,
  'front-frame': ImageNode,
  video: ImageNode,
  'video-comp': ImageNode,
  director: DirectorNode,
  'director-2d': DirectorTwoNode,
  'director-3d': DirectorThreeNode,
  'model-3d': Model3dNode,
  script: ImageNode,
  audio: AudioNode,
  generator: ImageNode,
  llm: ImageNode,
  comfy: ImageNode,
  midjourney: ImageNode,
  msgen: ImageNode,
  rh: ImageNode,
  loop: ImageNode,
  output: ImageNode,
  text: TextNode,
  group: GroupNode,
  plugin: PluginNode,
});
