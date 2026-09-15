import type {
  DirectorAnimationClip,
  DirectorCharacterColors,
  DirectorCharacterPresetId,
  DirectorPosePreset,
  DirectorRigJoint,
  DirectorRigPose,
  DirectorSubjectPlacement,
} from '../canvas/nodeTypes';

export interface DirectorCharacterPreset {
  id: DirectorCharacterPresetId;
  label: string;
  role: string;
  description: string;
  colors: DirectorCharacterColors;
  /** Optional real-model image used only by the built-in character library card. */
  thumbnailUrl?: string;
  proportions: {
    height: number;
    shoulderWidth: number;
    hipWidth: number;
    torsoWidth: number;
    torsoDepth: number;
    headScale: number;
    limbRadius: number;
  };
  /** Optional bundled skinned mesh that uses the same persisted director-rig contract. */
  model?: {
    url: string;
    targetHeight: number;
    /** Unit direction the character's face looks toward in model-local coordinates. */
    faceDirection: readonly [number, number, number];
    bones: Record<DirectorRigJoint, string>;
  };
}

const STUDIO_MANNEQUIN_MODEL_URL = new URL(
  '../assets/director/studio-mannequin.glb',
  import.meta.url,
).href;
const STUDIO_MANNEQUIN_THUMBNAIL_URL = new URL(
  '../assets/director/studio-mannequin-thumbnail.png',
  import.meta.url,
).href;
const STUDIO_MAN_MODEL_URL = new URL('../assets/director/studio-man.glb', import.meta.url).href;
const STUDIO_MAN_THUMBNAIL_URL = new URL(
  '../assets/director/studio-man-thumbnail.png',
  import.meta.url,
).href;

export const DIRECTOR_CHARACTER_PRESETS: readonly DirectorCharacterPreset[] = [
  {
    id: 'cinematic-male',
    label: '电影男演员',
    role: '写实标准体型',
    description: '标准八头身，适合剧情、对白与走位预演',
    colors: { skin: '#c98f6b', outfit: '#334155', accent: '#0ea5e9', hair: '#201a18' },
    proportions: {
      height: 1,
      shoulderWidth: 1.08,
      hipWidth: 0.9,
      torsoWidth: 1,
      torsoDepth: 1,
      headScale: 1,
      limbRadius: 1,
    },
  },
  {
    id: 'cinematic-female',
    label: '电影女演员',
    role: '写实轻盈体型',
    description: '自然比例与清晰轮廓，适合表演和服装配色',
    colors: { skin: '#d8a27d', outfit: '#7c3aed', accent: '#f472b6', hair: '#2b211f' },
    proportions: {
      height: 0.97,
      shoulderWidth: 0.94,
      hipWidth: 1.04,
      torsoWidth: 0.9,
      torsoDepth: 0.88,
      headScale: 0.98,
      limbRadius: 0.9,
    },
  },
  {
    id: 'action-hero',
    label: '动作替身',
    role: '力量型动作体型',
    description: '强化肩背和四肢体块，适合跑跳、格斗与英雄镜头',
    colors: { skin: '#b97b5c', outfit: '#172033', accent: '#f97316', hair: '#111827' },
    proportions: {
      height: 1.04,
      shoulderWidth: 1.22,
      hipWidth: 0.94,
      torsoWidth: 1.12,
      torsoDepth: 1.12,
      headScale: 0.96,
      limbRadius: 1.16,
    },
  },
  {
    id: 'stylized-youth',
    label: '青年动画角色',
    role: '风格化青年体型',
    description: '头身比更鲜明，适合动漫、游戏和夸张动作预演',
    colors: { skin: '#e6b68f', outfit: '#0f766e', accent: '#facc15', hair: '#172554' },
    proportions: {
      height: 0.9,
      shoulderWidth: 0.9,
      hipWidth: 0.92,
      torsoWidth: 0.86,
      torsoDepth: 0.86,
      headScale: 1.18,
      limbRadius: 0.84,
    },
  },
  {
    id: 'studio-mannequin',
    label: '片场绑定人偶',
    role: 'Mixamo 标准骨架人偶',
    description: '来自片场模型目录的蒙皮人偶，可使用完整肩肘、髋膝联动与内置动作',
    colors: { skin: '#b9847a', outfit: '#9b625c', accent: '#5c3837', hair: '#352525' },
    thumbnailUrl: STUDIO_MANNEQUIN_THUMBNAIL_URL,
    proportions: {
      height: 1,
      shoulderWidth: 1,
      hipWidth: 1,
      torsoWidth: 1,
      torsoDepth: 1,
      headScale: 1,
      limbRadius: 1,
    },
    model: {
      url: STUDIO_MANNEQUIN_MODEL_URL,
      targetHeight: 2.78,
      faceDirection: [0, 0, 1],
      bones: {
        spine: 'mixamorig:Spine',
        neck: 'mixamorig:Neck',
        leftShoulder: 'mixamorig:LeftArm',
        leftElbow: 'mixamorig:LeftForeArm',
        rightShoulder: 'mixamorig:RightArm',
        rightElbow: 'mixamorig:RightForeArm',
        leftHip: 'mixamorig:LeftUpLeg',
        leftKnee: 'mixamorig:LeftLeg',
        rightHip: 'mixamorig:RightUpLeg',
        rightKnee: 'mixamorig:RightLeg',
      },
    },
  },
  {
    id: 'studio-man',
    label: '写实绑定男演员',
    role: 'Mixamo 写实男性角色',
    description: '轻量纯色材质与完整 Mixamo 骨架，可使用肩肘、髋膝联动和全部导演台动作',
    colors: { skin: '#b9847a', outfit: '#9b625c', accent: '#5c3837', hair: '#352525' },
    thumbnailUrl: STUDIO_MAN_THUMBNAIL_URL,
    proportions: {
      height: 1,
      shoulderWidth: 1,
      hipWidth: 1,
      torsoWidth: 1,
      torsoDepth: 1,
      headScale: 1,
      limbRadius: 1,
    },
    model: {
      url: STUDIO_MAN_MODEL_URL,
      targetHeight: 2.78,
      faceDirection: [0, 0, 1],
      bones: {
        spine: 'mixamorig1:Spine',
        neck: 'mixamorig1:Neck',
        leftShoulder: 'mixamorig1:LeftArm',
        leftElbow: 'mixamorig1:LeftForeArm',
        rightShoulder: 'mixamorig1:RightArm',
        rightElbow: 'mixamorig1:RightForeArm',
        leftHip: 'mixamorig1:LeftUpLeg',
        leftKnee: 'mixamorig1:LeftLeg',
        rightHip: 'mixamorig1:RightUpLeg',
        rightKnee: 'mixamorig1:RightLeg',
      },
    },
  },
] as const;

export const DIRECTOR_CHARACTER_CATALOG_PRESETS: readonly DirectorCharacterPreset[] = [
  ...DIRECTOR_CHARACTER_PRESETS.filter((preset) => preset.model),
  ...DIRECTOR_CHARACTER_PRESETS.filter((preset) => !preset.model),
];

export const DIRECTOR_ANIMATION_CLIPS: ReadonlyArray<{
  id: DirectorAnimationClip;
  label: string;
  description: string;
}> = [
  { id: 'none', label: '静态姿势', description: '仅使用当前姿势和手动关节值' },
  { id: 'idle', label: '自然待机', description: '呼吸、重心和手臂细微运动' },
  { id: 'walk', label: '标准行走', description: '手脚反向摆动的循环步态' },
  { id: 'run', label: '动作跑步', description: '更大步幅、屈膝和身体起伏' },
  { id: 'wave', label: '挥手示意', description: '右臂抬起并连续挥手' },
  { id: 'talk', label: '对白表演', description: '头部、脊柱和双手的克制表演' },
  { id: 'turn', label: '原地转身', description: '角色沿垂直轴完成一次转身' },
  { id: 'jump', label: '起跳落地', description: '屈膝、腾空和落地缓冲' },
];

export const DIRECTOR_RIG_JOINTS: ReadonlyArray<{
  id: DirectorRigJoint;
  label: string;
  group: '躯干' | '左臂' | '右臂' | '左腿' | '右腿';
  min: number;
  max: number;
}> = [
  { id: 'spine', label: '脊柱前倾', group: '躯干', min: -40, max: 55 },
  { id: 'neck', label: '颈部点头', group: '躯干', min: -45, max: 45 },
  { id: 'leftShoulder', label: '左肩', group: '左臂', min: -170, max: 170 },
  { id: 'leftElbow', label: '左肘', group: '左臂', min: -145, max: 145 },
  { id: 'rightShoulder', label: '右肩', group: '右臂', min: -170, max: 170 },
  { id: 'rightElbow', label: '右肘', group: '右臂', min: -145, max: 145 },
  { id: 'leftHip', label: '左髋', group: '左腿', min: -100, max: 100 },
  { id: 'leftKnee', label: '左膝', group: '左腿', min: -130, max: 130 },
  { id: 'rightHip', label: '右髋', group: '右腿', min: -100, max: 100 },
  { id: 'rightKnee', label: '右膝', group: '右腿', min: -130, max: 130 },
];

export const DEFAULT_CHARACTER_PRESET_ID: DirectorCharacterPresetId = 'cinematic-male';

const SAMPLE_FRACTIONS: Record<number, readonly number[]> = {
  1: [0],
  2: [0, 0.83],
  3: [0, 0.37, 0.83],
  4: [0, 0.23, 0.53, 0.87],
  5: [0, 0.18, 0.39, 0.63, 0.88],
};

/**
 * Sample inside the final loop instead of exactly on its closing boundary. This avoids exporting
 * visually identical start/middle/end frames for common one-second walk and run cycles.
 */
export function directorAnimationSampleTimes(duration: number, sampleCount: number) {
  const count = Math.max(1, Math.min(5, Math.round(sampleCount)));
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  return (SAMPLE_FRACTIONS[count] ?? [0, 0.37, 0.83]).map((fraction) => safeDuration * fraction);
}

const DEFAULT_RIG_POSE: Record<DirectorRigJoint, number> = {
  spine: 0,
  neck: 0,
  leftShoulder: -7,
  rightShoulder: 7,
  leftElbow: 3,
  rightElbow: -3,
  leftHip: 2,
  rightHip: -2,
  leftKnee: 0,
  rightKnee: 0,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LEGACY_STUDIO_MAN_TEXTURE_PALETTE: DirectorCharacterColors = {
  skin: '#ffffff',
  outfit: '#64748b',
  accent: '#38bdf8',
  hair: '#231b18',
};

function isLegacyStudioManTexturePalette(
  value: Partial<DirectorCharacterColors> | undefined,
  presetId: DirectorCharacterPresetId | undefined,
) {
  return (
    presetId === 'studio-man' &&
    Object.entries(LEGACY_STUDIO_MAN_TEXTURE_PALETTE).every(([slot, color]) => {
      const candidate = value?.[slot as keyof DirectorCharacterColors];
      return typeof candidate === 'string' && candidate.toLowerCase() === color;
    })
  );
}

export function getDirectorCharacterPreset(
  value: DirectorCharacterPresetId | undefined,
): DirectorCharacterPreset {
  return (
    DIRECTOR_CHARACTER_PRESETS.find((preset) => preset.id === value) ??
    (DIRECTOR_CHARACTER_PRESETS[0] as DirectorCharacterPreset)
  );
}

export function normalizeDirectorCharacterColors(
  value: Partial<DirectorCharacterColors> | undefined,
  presetId?: DirectorCharacterPresetId,
): DirectorCharacterColors {
  const fallback = getDirectorCharacterPreset(presetId).colors;
  const normalizedValue = isLegacyStudioManTexturePalette(value, presetId) ? undefined : value;
  return {
    skin:
      typeof normalizedValue?.skin === 'string' && HEX_COLOR.test(normalizedValue.skin)
        ? normalizedValue.skin
        : fallback.skin,
    outfit:
      typeof normalizedValue?.outfit === 'string' && HEX_COLOR.test(normalizedValue.outfit)
        ? normalizedValue.outfit
        : fallback.outfit,
    accent:
      typeof normalizedValue?.accent === 'string' && HEX_COLOR.test(normalizedValue.accent)
        ? normalizedValue.accent
        : fallback.accent,
    hair:
      typeof normalizedValue?.hair === 'string' && HEX_COLOR.test(normalizedValue.hair)
        ? normalizedValue.hair
        : fallback.hair,
  };
}

export function normalizeDirectorRigPose(value: DirectorRigPose | undefined): DirectorRigPose {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    DIRECTOR_RIG_JOINTS.flatMap((joint) => {
      const angle = value[joint.id];
      return typeof angle === 'number' && Number.isFinite(angle)
        ? [[joint.id, Math.max(joint.min, Math.min(joint.max, angle))]]
        : [];
    }),
  ) as DirectorRigPose;
}

const MIRRORED_JOINT: Partial<Record<DirectorRigJoint, DirectorRigJoint>> = {
  leftShoulder: 'rightShoulder',
  rightShoulder: 'leftShoulder',
  leftElbow: 'rightElbow',
  rightElbow: 'leftElbow',
  leftHip: 'rightHip',
  rightHip: 'leftHip',
  leftKnee: 'rightKnee',
  rightKnee: 'leftKnee',
};

export function patchLinkedDirectorJoint(
  current: DirectorRigPose | undefined,
  joint: DirectorRigJoint,
  angle: number,
  linked: boolean,
): DirectorRigPose {
  const next = { ...normalizeDirectorRigPose(current), [joint]: angle };
  const mirrored = MIRRORED_JOINT[joint];
  if (linked && mirrored) next[mirrored] = -angle;
  return normalizeDirectorRigPose(next);
}

/**
 * Converts a dragged joint's visible target angle into the persisted manual offset.
 * Pose presets and animation own the base angle; viewport posing only stores the difference.
 */
export function patchDirectorJointFromTargetAngle(
  current: DirectorRigPose | undefined,
  joint: DirectorRigJoint,
  targetAngle: number,
  baseAngle: number,
  linked: boolean,
): DirectorRigPose {
  return patchLinkedDirectorJoint(current, joint, targetAngle - baseAngle, linked);
}

function staticPose(
  pose: DirectorPosePreset | undefined,
): Partial<Record<DirectorRigJoint, number>> {
  switch (pose) {
    case 't-pose':
      return { leftShoulder: -90, rightShoulder: 90 };
    case 'walk':
      return { leftShoulder: -34, rightShoulder: 34, leftHip: 25, rightHip: -25 };
    case 'run':
      return {
        spine: 14,
        leftShoulder: -55,
        rightShoulder: 55,
        leftHip: 42,
        rightHip: -42,
        leftKnee: 28,
        rightKnee: -28,
      };
    case 'sit':
      return { spine: 8, leftHip: 86, rightHip: -86, leftKnee: -82, rightKnee: 82 };
    case 'crouch':
      return { spine: 20, leftHip: 48, rightHip: -48, leftKnee: -74, rightKnee: 74 };
    case 'kneel':
      return { spine: 8, leftHip: 62, leftKnee: -104, rightKnee: 28 };
    case 'double-kneel':
      return { spine: 8, leftHip: 58, rightHip: -58, leftKnee: -108, rightKnee: 108 };
    case 'lean':
      return { spine: 20, leftShoulder: -28, rightShoulder: 28 };
    case 'think':
      return { spine: 8, neck: 18, rightShoulder: 76, rightElbow: -92 };
    case 'bow':
      return { spine: 42, neck: 16, leftShoulder: -22, rightShoulder: 22 };
    case 'jump':
      return { leftShoulder: -72, rightShoulder: 72, leftHip: 28, rightHip: -28 };
    case 'throw':
      return { spine: -10, rightShoulder: 142, rightElbow: -48, leftHip: -18, rightHip: 18 };
    case 'push':
      return { spine: 12, leftShoulder: -82, rightShoulder: 82, leftElbow: 18, rightElbow: -18 };
    case 'wave':
      return { rightShoulder: 152, rightElbow: -54 };
    case 'reach':
      return { spine: 6, leftShoulder: -86, rightShoulder: 86 };
    case 'fold-arms':
      return { leftShoulder: -58, rightShoulder: 58, leftElbow: 104, rightElbow: -104 };
    case 'phone':
      return { neck: 12, leftShoulder: -52, rightShoulder: 52, leftElbow: 88, rightElbow: -88 };
    default:
      return {};
  }
}

export interface DirectorRigFrame {
  joints: Record<DirectorRigJoint, number>;
  rootY: number;
  rootYaw: number;
}

function animationPhase(subject: DirectorSubjectPlacement, timeSeconds: number) {
  const speed = Math.max(0.25, Math.min(2, subject.animationSpeed ?? 1));
  const raw = Math.max(0, timeSeconds) * speed;
  return subject.animationLoop === false ? Math.min(1, raw) * Math.PI * 2 : raw * Math.PI * 2;
}

/**
 * Evaluate a deterministic rig frame so the WebGL preview and AI-facing timeline share one source
 * of truth. Manual joint offsets are applied last and therefore remain visible during animation.
 */
export function evaluateDirectorRigFrame(
  subject: DirectorSubjectPlacement,
  timeSeconds: number,
): DirectorRigFrame {
  const joints = {
    ...DEFAULT_RIG_POSE,
    ...staticPose(subject.posePreset),
  };
  const clip = subject.animationClip ?? 'none';
  const phase = animationPhase(subject, timeSeconds);
  const swing = Math.sin(phase);
  let rootY = 0;
  let rootYaw = 0;

  if (clip === 'idle') {
    joints.spine += Math.sin(phase * 0.5) * 1.5;
    joints.leftShoulder += swing * 2.5;
    joints.rightShoulder -= swing * 2.5;
    rootY = (Math.sin(phase * 0.5) + 1) * 0.006;
  } else if (clip === 'walk' || clip === 'run') {
    const amplitude = clip === 'run' ? 58 : 34;
    joints.leftShoulder = -swing * amplitude;
    joints.rightShoulder = swing * amplitude;
    joints.leftHip = swing * amplitude * 0.78;
    joints.rightHip = -swing * amplitude * 0.78;
    joints.leftElbow = Math.max(0, -swing) * 42;
    joints.rightElbow = -Math.max(0, swing) * 42;
    joints.leftKnee = -Math.max(0, -swing) * (clip === 'run' ? 74 : 45);
    joints.rightKnee = Math.max(0, swing) * (clip === 'run' ? 74 : 45);
    joints.spine = clip === 'run' ? 13 : 4;
    rootY = Math.abs(Math.sin(phase * 2)) * (clip === 'run' ? 0.1 : 0.035);
  } else if (clip === 'wave') {
    joints.rightShoulder = 148;
    joints.rightElbow = -58 + Math.sin(phase * 1.7) * 26;
    joints.neck = Math.sin(phase * 0.5) * 4;
  } else if (clip === 'talk') {
    joints.spine = Math.sin(phase * 0.5) * 4;
    joints.neck = Math.sin(phase * 0.75) * 6;
    joints.leftShoulder = -18 + Math.sin(phase) * 16;
    joints.rightShoulder = 18 + Math.sin(phase + Math.PI * 0.65) * 16;
    joints.leftElbow = 22 + Math.sin(phase * 1.2) * 14;
    joints.rightElbow = -22 - Math.sin(phase * 1.2 + 0.7) * 14;
  } else if (clip === 'turn') {
    rootYaw =
      subject.animationLoop === false ? Math.min(1, phase / (Math.PI * 2)) * Math.PI * 2 : phase;
    joints.leftShoulder = -Math.sin(phase) * 12;
    joints.rightShoulder = Math.sin(phase) * 12;
  } else if (clip === 'jump') {
    const normalized = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
    rootY = Math.sin(normalized * Math.PI) * 0.72;
    const crouch = Math.max(0, 1 - rootY / 0.72);
    joints.leftShoulder = -35 - rootY * 70;
    joints.rightShoulder = 35 + rootY * 70;
    joints.leftHip = 24 + crouch * 24;
    joints.rightHip = -24 - crouch * 24;
    joints.leftKnee = -crouch * 58;
    joints.rightKnee = crouch * 58;
  }

  for (const [joint, value] of Object.entries(normalizeDirectorRigPose(subject.rigPose))) {
    joints[joint as DirectorRigJoint] += value ?? 0;
  }

  return { joints, rootY, rootYaw };
}

export function directorAnimationLabel(clip: DirectorAnimationClip | undefined) {
  return DIRECTOR_ANIMATION_CLIPS.find((item) => item.id === (clip ?? 'none'))?.label ?? '静态姿势';
}
