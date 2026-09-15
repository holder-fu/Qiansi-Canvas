import type { Node, Edge } from '@xyflow/react';
import type { ImageAnnotationHint, ImageAnnotationReferenceMode } from '../lib/imageAnnotations';
import type { CameraPromptCue } from '../lib/cameraPrompt';
import type { VideoMaskRepairSpec } from '../lib/videoMaskRepair';

export type WorkspaceId = 'home' | 'script' | 'views' | 'video' | 'audio';

export type NodeKind =
  | 'image'
  | 'image-compare'
  | 'views'
  | 'video'
  | 'video-comp'
  | 'director-2d'
  | 'director-3d'
  | 'model-3d'
  /** Legacy saved-canvas kind; migrated to director-2d/director-3d when loaded. */
  | 'director'
  | 'script'
  | 'text'
  | 'audio'
  | 'group'
  | 'front-frame'
  // ── 复刻旧版节点模块 ──
  | 'generator' // 文生图 / 图生图
  | 'llm' // 对话 / 改写
  | 'comfy' // ComfyUI 工作流
  | 'midjourney' // Midjourney
  | 'msgen' // ModelScope Z-Image
  | 'rh' // 历史 RunningHub 节点；仅兼容读取与渲染，不再开放新建
  | 'loop' // 循环批处理
  | 'output' // 结果收集
  | 'plugin'; // 第三方沙箱插件节点

export type NodeGroup = 'media' | 'ai' | 'logic' | 'collection';

export type DirectorNodeKind = 'director-2d' | 'director-3d';

export function isDirectorNodeKind(kind: NodeKind): boolean {
  return kind === 'director' || kind === 'director-2d' || kind === 'director-3d';
}

export function resolveDirectorNodeKind(
  kind: NodeKind,
  directorMode?: '2d' | '3d',
): DirectorNodeKind | null {
  if (kind === 'director-2d' || kind === 'director-3d') return kind;
  if (kind !== 'director') return null;
  return directorMode === '2d' ? 'director-2d' : 'director-3d';
}

/** Upgrade the former mode-switched director node into one explicit node contract. */
export function migrateLegacyDirectorNode<T extends FlowNode>(node: T): T {
  const kind = resolveDirectorNodeKind(node.data.kind, node.data.directorMode);
  if (!kind || node.data.kind !== 'director') return node;
  const defaultTitle = kind === 'director-2d' ? '2D导演台' : '3D导演台';
  return {
    ...node,
    type: kind,
    data: {
      ...node.data,
      kind,
      title: !node.data.title || node.data.title === '导演台' ? defaultTitle : node.data.title,
      directorMode: kind === 'director-2d' ? '2d' : '3d',
    },
  } as T;
}

export interface NodeKindMeta {
  /** Display-only translation key. The persisted node kind remains the stable id. */
  labelKey: string;
  label: string;
  group: NodeGroup;
  /** Display-only translation key. Never store the translated description in node data. */
  descriptionKey: string;
  description: string;
  accent: string; // 主题色（hex）
  hasPrompt?: boolean;
  isGenerator?: boolean; // 触发一次生成
}

export interface VisualMark {
  id: string;
  sourceNodeId: string;
  sourceUrl: string;
  label: string;
  category: '人物' | '脸部' | '服饰' | '帽子' | '动物' | '物品' | '其它';
  bbox: { x: number; y: number; width: number; height: number };
}

export type DirectorCameraPreset =
  | 'wide-front'
  | 'medium-front'
  | 'closeup'
  | 'low-angle'
  | 'high-angle'
  | 'over-shoulder'
  | 'profile';

export type DirectorBodyFacing =
  'front' | 'front-left' | 'left-profile' | 'back' | 'right-profile' | 'front-right';

export type DirectorHeadDirection = 'follow-body' | 'camera' | 'left' | 'right' | 'up' | 'down';

export type DirectorSubjectMotion =
  | 'still'
  | 'walk-left'
  | 'walk-right'
  | 'move-forward'
  | 'move-backward'
  | 'approach-camera'
  | 'turn-around';

export type DirectorPosePreset =
  | 'stand'
  | 't-pose'
  | 'walk'
  | 'run'
  | 'sit'
  | 'crouch'
  | 'kneel'
  | 'double-kneel'
  | 'lean'
  | 'stop'
  | 'think'
  | 'bow'
  | 'jump'
  | 'throw'
  | 'push'
  | 'wave'
  | 'reach'
  | 'fold-arms'
  | 'phone';

/** Built-in procedural or bundled-rig actors available without importing an external model. */
export type DirectorCharacterPresetId =
  | 'cinematic-male'
  | 'cinematic-female'
  | 'action-hero'
  | 'stylized-youth'
  | 'studio-mannequin'
  | 'studio-man';

/** Reusable animation clips evaluated by the 3D previs stage. */
export type DirectorAnimationClip =
  'none' | 'idle' | 'walk' | 'run' | 'wave' | 'talk' | 'turn' | 'jump';

/** Main editable joints in the built-in hierarchical humanoid rig. Values are degrees. */
export type DirectorRigJoint =
  | 'spine'
  | 'neck'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee';

export type DirectorRigPose = Partial<Record<DirectorRigJoint, number>>;

export interface DirectorCharacterColors {
  skin: string;
  outfit: string;
  accent: string;
  hair: string;
}

export type DirectorMotionPathType =
  | 'line'
  | 'arc'
  | 's-curve'
  | 'circle'
  | 'figure-eight'
  | 'rectangle'
  | 'zigzag'
  | 'pencil'
  | 'pen';
export interface DirectorMotionPath {
  type: DirectorMotionPathType;
  points: Array<{ x: number; depth: number }>;
  /** Horizontal stage span in director percentage coordinates. */
  width?: number;
  /** Front-to-back stage span in director percentage coordinates. */
  depthRange?: number;
}

export interface DirectorStageCamera {
  id: string;
  label: string;
  x: number;
  depth: number;
  /** Camera height above the director-stage floor, in Three.js world units. */
  height: number;
  yaw: number;
  pitch: number;
  distance: number;
  /** Fixed cameras stay put; follow cameras preserve their offset from a subject root. */
  trackingMode?: 'fixed' | 'follow-subject';
  trackingSubjectId?: string;
}

export type DirectorCameraMovement =
  | 'static'
  | 'push-in'
  | 'pull-out'
  | 'pan-left'
  | 'pan-right'
  | 'orbit-left'
  | 'orbit-right'
  | 'tracking'
  | 'handheld'
  | 'crane-up'
  | 'crane-down';

export type DirectorCameraSpeed = 'slow' | 'normal' | 'fast';

/** Flat layout is a fast 2D composition view; spatial enables the 3D previs stage. */
export type DirectorStageMode = 'flat' | 'spatial';
export type DirectorSubjectFrameShape =
  'arch' | 'rounded' | 'oval' | 'hexagon' | 'shield' | 'human';

export type DirectorSceneObjectKind = 'landmark' | 'furniture' | 'prop' | 'decoration';
export type DirectorSceneObjectPrimitive =
  'cube' | 'sphere' | 'cylinder' | 'cone' | 'wall' | 'pillar' | 'arch' | 'stairs';

export interface DirectorSceneObject {
  id: string;
  label: string;
  kind: DirectorSceneObjectKind;
  /** Built-in 3D primitive used by the spatial previs stage. */
  primitive?: DirectorSceneObjectPrimitive;
  /** Percentage position inside the 16:9 director frame. */
  x: number;
  y: number;
  /** Depth in the 3D previs stage: 0 is far back, 100 is closest to camera. */
  depth?: number;
  /** Vertical distance above the stage floor, in director world units. */
  height?: number;
  /** Relative visual size used by the layout control image. */
  scale: number;
  /** Per-axis building dimensions, expressed as percentages on top of uniform scale. */
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  /** Horizontal object rotation in the 3D stage. */
  rotationY?: number;
  /** PBR base color for the spatial preview object. */
  color?: string;
  /** Object state, contents or relationship, e.g. "桌面摆放书和文具". */
  description: string;
}

export type DirectorModelFormat = 'vrm' | 'glb' | 'gltf' | 'fbx';

export interface DirectorSubjectPlacement {
  id: string;
  sourceNodeId: string;
  label: string;
  imageUrl: string;
  /** Visual frame used for this identity marker in the flat director stage. */
  frameShape?: DirectorSubjectFrameShape;
  /** Persisted VRM/GLB/FBX binary id in IndexedDB. The browser URL is regenerated when the studio opens. */
  modelAssetId?: string;
  /** Runtime object URL or explicitly hosted model URL used by the WebGL stage. */
  modelUrl?: string;
  modelFileName?: string;
  modelFormat?: DirectorModelFormat;
  /** Parametric actor used when no imported VRM/GLB/FBX is attached. */
  characterPreset?: DirectorCharacterPresetId;
  /** Persisted material palette for built-in actors and imported-model preview tinting. */
  characterColors?: DirectorCharacterColors;
  /** Manual offsets applied after the selected static pose and before animation. */
  rigPose?: DirectorRigPose;
  /** Mirror matching left/right limbs while editing a joint. */
  linkLimbs?: boolean;
  /** Procedural animation clip evaluated on the director timeline. */
  animationClip?: DirectorAnimationClip;
  /** Playback multiplier for the actor clip. */
  animationSpeed?: number;
  /** Whether the actor clip repeats across the scene duration. */
  animationLoop?: boolean;
  /** Percentage position inside the 16:9 director frame. */
  x: number;
  y: number;
  /** Depth in the 3D previs stage: 0 is far back, 100 is closest to camera. */
  depth?: number;
  /** Height above the 3D director-stage floor, in Three.js world units. */
  height?: number;
  /** Visual size percentage, where 100 is the default subject size. */
  scale: number;
  /** Two-dimensional visual lean kept for backwards-compatible stage layouts. */
  rotation: number;
  /** Semantic body direction passed to the video model. */
  bodyFacing: DirectorBodyFacing;
  /** Continuous horizontal yaw angle: 0 front, -90 left, 90 right, ±180 back. */
  bodyAngle: number;
  /** Named scene object or subject that the body should face. */
  bodyTarget: string;
  /** Semantic head direction, independent from body direction. */
  headDirection: DirectorHeadDirection;
  /** Natural-language gaze target, such as "人物2" or "镜头". */
  gazeTarget: string;
  /** Coarse movement path for temporal video generation. */
  motion: DirectorSubjectMotion;
  /** Specific performance or action instruction. */
  action: string;
  /** Facial expression and emotional state. */
  emotion: string;
  /** Procedural mannequin pose, also passed to the final video constraint. */
  posePreset?: DirectorPosePreset;
  poseLean?: number;
  headTilt?: number;
  headTurn?: number;
  motionPath?: DirectorMotionPath;
}

/** A deliberately non-identity background performer for static storyboard constraints. */
export interface DirectorBackgroundActor {
  id: string;
  label: string;
  /** Percentage position inside the 16:9 director frame. */
  x: number;
  y: number;
  /** Relative visual size; background actors default to a smaller figure. */
  scale: number;
  /** Visible behavior or role, without creating a new identity reference. */
  description: string;
}

export interface DirectorSceneState {
  /** Older versions are retained so saved canvases can be restored before normalization. */
  schemaVersion: 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
  /** Persists the user's preferred director-stage interaction model. */
  stageMode: DirectorStageMode;
  sceneSourceId?: string;
  /** Bridge asset id for a locally uploaded 3D panorama. */
  sceneAssetId?: string;
  /** Bridge asset id for the separate, AI-sized panorama reference. */
  sceneReferenceAssetId?: string;
  sceneUrl?: string;
  /** Runtime AI environment reference restored from the local media store for asset-backed scenes. */
  sceneReferenceUrl?: string;
  /** Vertical equirectangular-background calibration in degrees for matching its horizon to the stage. */
  sceneHorizonPitch?: number;
  /** Raises only the panorama background, as a percentage of its full equirectangular height. */
  scenePanoramaLift?: number;
  /** Semantic environment name, e.g. classroom or subway platform. */
  sceneName: string;
  /** Named objects and their spatial relationships inside the environment. */
  sceneObjects: DirectorSceneObject[];
  subjects: DirectorSubjectPlacement[];
  /** Unnamed background performers positioned for the 2D storyboard control image. */
  backgroundActors?: DirectorBackgroundActor[];
  /** Last composition template applied to the stage. */
  compositionPresetId?: string;
  cameraPreset: DirectorCameraPreset;
  cameraMovement: DirectorCameraMovement;
  cameraSpeed: DirectorCameraSpeed;
  /** Spatial-stage camera orbit controls, expressed in degrees and a relative distance. */
  cameraYaw: number;
  cameraPitch: number;
  cameraDistance: number;
  /** Additional camera placements visible in the 3D director stage. */
  stageCameras?: DirectorStageCamera[];
  duration: number;
  /** Number of fixed-resolution animation samples exported by the 3D director. */
  animationSampleCount?: number;
  /** Number of non-layout identity/environment references included after the animation samples. */
  supportingReferenceCount?: number;
  startFrame: string;
  endFrame: string;
  negativePrompt: string;
  lockSubjectCount: boolean;
  forbidExtraSubjects: boolean;
  preserveIdentity: boolean;
  preservePositions: boolean;
  constraintStrength: number;
  prompt: string;
}

export const NODE_KIND_META: Record<NodeKind, NodeKindMeta> = {
  image: {
    labelKey: 'node.kind.image.label',
    label: '图片',
    group: 'media',
    descriptionKey: 'node.kind.image.description',
    description: '角色/场景图片',
    accent: '#34d399',
    hasPrompt: true,
    isGenerator: true,
  },
  'image-compare': {
    labelKey: 'node.kind.image-compare.label',
    label: '图片对比',
    group: 'media',
    descriptionKey: 'node.kind.image-compare.description',
    description: '拖动分隔线清晰对比两张图片',
    accent: '#22d3ee',
  },
  views: {
    labelKey: 'node.kind.views.label',
    label: '三视图',
    group: 'media',
    descriptionKey: 'node.kind.views.description',
    description: '角色三视图',
    accent: '#34d399',
    hasPrompt: true,
    isGenerator: true,
  },
  'front-frame': {
    labelKey: 'node.kind.front-frame.label',
    label: '首帧图',
    group: 'media',
    descriptionKey: 'node.kind.front-frame.description',
    description: '视频第一帧',
    accent: '#34d399',
    hasPrompt: true,
    isGenerator: true,
  },
  video: {
    labelKey: 'node.kind.video.label',
    label: '视频',
    group: 'media',
    descriptionKey: 'node.kind.video.description',
    description: '文生视频 / 图生视频',
    accent: '#f472b6',
    hasPrompt: true,
    isGenerator: true,
  },
  'video-comp': {
    labelKey: 'node.kind.video-comp.label',
    label: '视频合成',
    group: 'media',
    descriptionKey: 'node.kind.video-comp.description',
    description: '多源视频合成',
    accent: '#f472b6',
    isGenerator: true,
  },
  director: {
    labelKey: 'node.kind.director.label',
    label: '导演台',
    group: 'ai',
    descriptionKey: 'node.kind.director.description',
    description: '人物站位与镜头构图约束',
    accent: '#60a5fa',
  },
  'director-2d': {
    labelKey: 'node.kind.director-2d.label',
    label: '2D导演台',
    group: 'ai',
    descriptionKey: 'node.kind.director-2d.description',
    description: '平面分镜、人物站位与构图约束',
    accent: '#60a5fa',
  },
  'director-3d': {
    labelKey: 'node.kind.director-3d.label',
    label: '3D导演台',
    group: 'ai',
    descriptionKey: 'node.kind.director-3d.description',
    description: '3D角色、机位、动作与轨迹预演',
    accent: '#22d3ee',
  },
  'model-3d': {
    labelKey: 'node.kind.model-3d.label',
    label: '3D 模型',
    group: 'media',
    descriptionKey: 'node.kind.model-3d.description',
    description: 'ComfyUI 生成的 GLB、glTF 或网格模型',
    accent: '#22d3ee',
    hasPrompt: true,
    isGenerator: true,
  },
  script: {
    labelKey: 'node.kind.script.label',
    label: '脚本',
    group: 'ai',
    descriptionKey: 'node.kind.script.description',
    description: '故事脚本与分镜',
    accent: '#60a5fa',
    hasPrompt: true,
    isGenerator: true,
  },
  text: {
    labelKey: 'node.kind.text.label',
    label: '提示词',
    group: 'logic',
    descriptionKey: 'node.kind.text.description',
    description: '文本提示词输入',
    accent: '#a3a3a3',
    hasPrompt: true,
    isGenerator: true,
  },
  audio: {
    labelKey: 'node.kind.audio.label',
    label: '音频',
    group: 'media',
    descriptionKey: 'node.kind.audio.description',
    description: '上传音频并作为视频参考',
    accent: '#a78bfa',
    hasPrompt: true,
    isGenerator: true,
  },
  group: {
    labelKey: 'node.kind.group.label',
    label: '分组',
    group: 'logic',
    descriptionKey: 'node.kind.group.description',
    description: '节点分组容器',
    accent: '#737373',
  },
  generator: {
    labelKey: 'node.kind.generator.label',
    label: '生图',
    group: 'ai',
    descriptionKey: 'node.kind.generator.description',
    description: '文生图 / 图生图',
    accent: '#34d399',
    hasPrompt: true,
    isGenerator: true,
  },
  llm: {
    labelKey: 'node.kind.llm.label',
    label: '对话',
    group: 'ai',
    descriptionKey: 'node.kind.llm.description',
    description: 'LLM 对话 / 改写',
    accent: '#60a5fa',
    hasPrompt: true,
    isGenerator: true,
  },
  comfy: {
    labelKey: 'node.kind.comfy.label',
    label: 'ComfyUI',
    group: 'ai',
    descriptionKey: 'node.kind.comfy.description',
    description: 'ComfyUI 工作流',
    accent: '#22d3ee',
    hasPrompt: true,
    isGenerator: true,
  },
  midjourney: {
    labelKey: 'node.kind.midjourney.label',
    label: 'Midjourney',
    group: 'ai',
    descriptionKey: 'node.kind.midjourney.description',
    description: 'Midjourney 生图',
    accent: '#a78bfa',
    hasPrompt: true,
    isGenerator: true,
  },
  msgen: {
    labelKey: 'node.kind.msgen.label',
    label: 'ModelScope',
    group: 'ai',
    descriptionKey: 'node.kind.msgen.description',
    description: 'Z-Image 生图',
    accent: '#f59e0b',
    hasPrompt: true,
    isGenerator: true,
  },
  rh: {
    labelKey: 'node.kind.rh.label',
    label: 'RunningHub',
    group: 'ai',
    descriptionKey: 'node.kind.rh.description',
    description: 'RunningHub 工作流',
    accent: '#fb7185',
    hasPrompt: true,
    isGenerator: true,
  },
  loop: {
    labelKey: 'node.kind.loop.label',
    label: '循环',
    group: 'logic',
    descriptionKey: 'node.kind.loop.description',
    description: '重复运行上游生成节点',
    accent: '#fbbf24',
    isGenerator: true,
  },
  output: {
    labelKey: 'node.kind.output.label',
    label: '结果',
    group: 'collection',
    descriptionKey: 'node.kind.output.description',
    description: '收集上游结果',
    accent: '#94a3b8',
  },
  plugin: {
    labelKey: 'node.kind.plugin.label',
    label: '插件',
    group: 'logic',
    descriptionKey: 'node.kind.plugin.description',
    description: '第三方沙箱插件节点',
    accent: '#22d3ee',
  },
};

export interface ImageNodeData {
  kind: NodeKind;
  title: string;
  // React Flow v12 requires node data to satisfy Record<string, unknown>.
  // The index signature lets ImageNodeData meet that constraint without
  // weakening access to the explicitly-declared fields above.
  [key: string]: unknown;
  description?: string;
  /** Canonical full-resolution media URL used for editing, export and model input. */
  originalUrl?: string;
  /** Lightweight image preview or video poster used by the canvas renderer. */
  previewUrl?: string;
  /** Original media dimensions persisted to avoid decoding full media for layout. */
  mediaWidth?: number;
  mediaHeight?: number;
  /** Optional presentation-only canvas frame used by coordinated reference layouts. */
  canvasFrameWidth?: number;
  canvasFrameHeight?: number;
  durationSeconds?: number;
  bridgeAssetId?: string;
  /** Browser-session media was projected out of the durable Bridge snapshot and must be replaced. */
  mediaPersistenceState?: 'session-only';
  /** Original upload MIME retained when a session-only URL itself cannot be serialized. */
  mediaMimeType?: string;
  imageUrl?: string;
  images?: string[];
  /** Read-only source image retained for a connected derived node's generation reference. */
  imagePreviewUrl?: string;
  /** Lightweight preview belonging to imagePreviewUrl, kept separate from the node's own output. */
  imagePreviewPosterUrl?: string;
  videoUrl?: string;
  videos?: string[];
  /** Read-only source preview shown before a remake node generates its own output. */
  videoPreviewUrl?: string;
  /** Persisted 3D-director animation used as the playable preview and AI motion reference. */
  directorPrevisUrl?: string;
  directorPrevisCameraLabel?: string;
  /** Non-destructive playback/edit range in seconds. */
  videoTrimStart?: number;
  videoTrimEnd?: number;
  /** Stable media-content revision; persistence may change URLs without changing this value. */
  videoEditRevision?: string;
  /** Up to five source-video intervals selected for fragment remake. */
  videoRemakeSegments?: Array<{ start: number; end: number }>;
  /** Manual keyframe mask and time range for a provider-tracked localized repair task. */
  videoMaskRepair?: VideoMaskRepairSpec;
  /** IndexedDB key for a video applied from the effects library. */
  effectVideoId?: string;
  /** IndexedDB key for a video restored from the asset library. */
  assetVideoId?: string;
  audioUrl?: string;
  audios?: string[];
  model3dUrl?: string;
  models3d?: string[];
  /** A persisted session-only Blob can no longer be opened and must not be played. */
  audioSourceState?: 'unavailable-after-restore';
  composerReferences?: Array<{
    id: string;
    type: 'image' | 'video' | 'audio' | 'text';
    url?: string;
    previewUrl?: string;
    label: string;
    locked?: boolean;
    role?: 'style' | 'effect';
    stylePrompt?: string;
    effectPresetId?: string;
    effectPrompt?: string;
  }>;
  audioFileName?: string;
  /** Legacy preview speed retained for older saved canvases; generated edits reset to 1×. */
  audioPlaybackRate?: number;
  /** Legacy split preview data retained only so older saved canvases remain readable. */
  audioSplitPoints?: number[];
  /** Legacy trim preview range used to seed the current destructive trim editor. */
  audioTrimStart?: number;
  audioTrimEnd?: number;
  outputText?: string;
  aiTag?: boolean;
  generating?: boolean;
  /** Unique live request token used to prevent duplicate paid submissions. */
  generationRequestId?: string;
  /** Output snapshot bound to generationRequestId; prevents a late result from replacing newer content. */
  generationTargetMediaSignature?: string;
  /** Last generation failure, rendered independently from successful media. */
  generationError?: string;
  progress?: number;
  result?: string;
  /** upstream output injected from a connected source node */
  input?: unknown;
  /** upstream values grouped by declared target port id */
  portInputs?: Record<string, unknown[]>;
  /** Horizontal A/B image reveal position, expressed as a percentage. */
  comparisonPosition?: number;
  /** this node's generated output, propagated downstream */
  output?: unknown;
  /** selected AI provider / model for generation */
  providerId?: string;
  model?: string;
  /** Requested output ratio; drives the image-node frame before generation. */
  aspectRatio?: string;
  /** workspace-specific extra fields */
  viewCount?: 3 | 4 | 6;
  styleKey?: string;
  prompt?: string;
  /** Editable operation for a text node; kept separate from source material and generated output. */
  textInstruction?: string;
  /** Declares whether a text node's legacy `prompt` field is source material or an instruction. */
  textContentRole?: 'source' | 'instruction';
  /** Prompt automatically selected from the media type connected to a text node. */
  connectionPromptPreset?: 'image' | 'video';
  /** preset tags applied from libraries */
  stylePreset?: string;
  effectPreset?: string;
  /** Stable preset identity for a reference node created from the effects library. */
  effectPresetId?: string;
  /** Effect-specific generation guidance carried into composer references. */
  effectPrompt?: string;
  characterPreset?: string;
  /** Structured camera instructions rendered as compact chips in the command composer. */
  cameraPresets?: CameraPromptCue[];
  /** Latest camera title/prompt retained for backwards-compatible saved canvases. */
  cameraPreset?: string;
  cameraPrompt?: string;
  /** per-node generation parameters */
  genParams?: Record<string, unknown>;
  /** per-node composer-only parameters such as the selected image generation type */
  composerParams?: Record<string, unknown>;
  /** tags applied from prompt / style libraries */
  appliedTags?: string[];
  /** count of selected prompt modules */
  promptModuleCount?: number;
  /** legacy marker kept for backwards-compatible saved canvases */
  isToolContent?: boolean;
  /** saved into the character asset category by context-menu "创建主体" */
  isSubject?: boolean;
  /** top-level media source: no AI composer and no incoming connection handle */
  referenceOnly?: boolean;
  /** Controls whether an empty media task accepts a manual upload or waits for generation. */
  mediaInputMode?: 'upload' | 'generation-only';
  /** uploaded file display name */
  imageFileName?: string;
  /** uploaded video file display name */
  videoFileName?: string;
  /** Original clean image retained when a paint annotation is applied. */
  annotationSourceUrl?: string;
  /** Structured paint annotations used to explain the rasterized guide to AI models. */
  annotationHints?: ImageAnnotationHint[];
  /** Which version downstream AI nodes should receive by default. */
  aiReferenceMode?: ImageAnnotationReferenceMode;
  /** user-selected visual regions from other image nodes */
  composerMarks?: VisualMark[];
  /** Persisted lightweight director-stage configuration. */
  directorScene?: DirectorSceneState;
  /** Chooses the node's default editor when opened from the canvas. */
  directorMode?: '2d' | '3d';
  /** User-selected tint for a group node background. */
  groupBackgroundColor?: string;
  /** Structured prompt injected into downstream image/video generation. */
  directorConstraintPrompt?: string;
  /** Semantic labels aligned index-for-index with the director reference bundle. */
  directorReferenceLabels?: string[];
  /** Rasterized layout guide emitted by the director node. */
  directorLayoutUrl?: string;
  /** Compressed real-render preview shown while a 3D director node is not selected. */
  directorThumbnailUrl?: string;
  /** Panorama calibration captured inside the current 3D director thumbnail. */
  directorThumbnailSceneKey?: string;
  /** The editable director draft changed after the last applied output snapshot. */
  directorOutputDirty?: boolean;
  /** Stable owner and contribution ids for a third-party declarative plugin node. */
  pluginId?: string;
  pluginNodeId?: string;
  pluginVersion?: string;
  pluginName?: string;
  pluginAccent?: string;
  pluginInputType?: string;
  pluginOutputType?: string;
  pluginRenderer?: 'host' | 'sandbox';
  pluginView?: string;
}

export type FlowNode = Node<ImageNodeData, NodeKind>;
export type FlowEdge = Edge;

export interface Point {
  x: number;
  y: number;
}
