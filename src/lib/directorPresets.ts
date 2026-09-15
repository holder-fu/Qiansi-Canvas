import type {
  DirectorBodyFacing,
  DirectorCameraPreset,
  DirectorSceneState,
  DirectorSubjectPlacement,
} from '../canvas/nodeTypes';

export interface DirectorCompositionSlot {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  bodyFacing: DirectorBodyFacing;
}

export interface DirectorCompositionPreset {
  id: string;
  title: string;
  description: string;
  recommendedSubjects: string;
  cameraPreset: DirectorCameraPreset;
  slots: readonly DirectorCompositionSlot[];
}

export const DIRECTOR_COMPOSITION_PRESETS: readonly DirectorCompositionPreset[] = [
  {
    id: 'solo-center',
    title: '单人居中',
    description: '主体稳定居中，适合人物介绍',
    recommendedSubjects: '1人',
    cameraPreset: 'medium-front',
    slots: [{ x: 50, y: 66, scale: 112, rotation: 0, bodyFacing: 'front' }],
  },
  {
    id: 'solo-closeup',
    title: '单人特写',
    description: '突出脸部与情绪表达',
    recommendedSubjects: '1人',
    cameraPreset: 'closeup',
    slots: [{ x: 50, y: 70, scale: 145, rotation: 0, bodyFacing: 'front' }],
  },
  {
    id: 'dialogue',
    title: '双人对话',
    description: '左右平衡，保留交流空间',
    recommendedSubjects: '2人',
    cameraPreset: 'medium-front',
    slots: [
      { x: 34, y: 64, scale: 105, rotation: 0, bodyFacing: 'front-right' },
      { x: 66, y: 64, scale: 105, rotation: 0, bodyFacing: 'front-left' },
    ],
  },
  {
    id: 'confrontation',
    title: '双人对峙',
    description: '拉开距离，强化冲突张力',
    recommendedSubjects: '2人',
    cameraPreset: 'wide-front',
    slots: [
      { x: 27, y: 67, scale: 114, rotation: 0, bodyFacing: 'right-profile' },
      { x: 73, y: 67, scale: 114, rotation: 0, bodyFacing: 'left-profile' },
    ],
  },
  {
    id: 'triangle',
    title: '三角站位',
    description: '主次清楚，适合三人关系戏',
    recommendedSubjects: '3人',
    cameraPreset: 'wide-front',
    slots: [
      { x: 50, y: 42, scale: 82, rotation: 0, bodyFacing: 'front' },
      { x: 31, y: 72, scale: 112, rotation: 0, bodyFacing: 'front-right' },
      { x: 69, y: 72, scale: 112, rotation: 0, bodyFacing: 'front-left' },
    ],
  },
  {
    id: 'depth',
    title: '前后纵深',
    description: '用大小差制造远近层次',
    recommendedSubjects: '2-3人',
    cameraPreset: 'wide-front',
    slots: [
      { x: 36, y: 74, scale: 128, rotation: 0, bodyFacing: 'front-right' },
      { x: 63, y: 48, scale: 82, rotation: 0, bodyFacing: 'front-left' },
      { x: 76, y: 35, scale: 64, rotation: 0, bodyFacing: 'front-left' },
    ],
  },
  {
    id: 'hero-support',
    title: '主角群像',
    description: '主角在前，配角分列后方',
    recommendedSubjects: '3-5人',
    cameraPreset: 'wide-front',
    slots: [
      { x: 50, y: 74, scale: 132, rotation: 0, bodyFacing: 'front' },
      { x: 27, y: 53, scale: 82, rotation: 0, bodyFacing: 'front-right' },
      { x: 73, y: 53, scale: 82, rotation: 0, bodyFacing: 'front-left' },
      { x: 14, y: 41, scale: 66, rotation: 0, bodyFacing: 'front-right' },
      { x: 86, y: 41, scale: 66, rotation: 0, bodyFacing: 'front-left' },
    ],
  },
];

function fallbackSlot(index: number, total: number): DirectorCompositionSlot {
  const x = 12 + ((index + 1) / (total + 1)) * 76;
  return { x, y: 82, scale: 68, rotation: 0, bodyFacing: 'front' };
}

export function getDirectorCompositionPreset(
  presetId: string | undefined,
): DirectorCompositionPreset | undefined {
  return DIRECTOR_COMPOSITION_PRESETS.find((preset) => preset.id === presetId);
}

export function applyDirectorCompositionPreset(
  scene: DirectorSceneState,
  preset: DirectorCompositionPreset,
): DirectorSceneState {
  const overflowCount = Math.max(0, scene.subjects.length - preset.slots.length);
  let overflowIndex = 0;
  const subjects: DirectorSubjectPlacement[] = scene.subjects.map((subject, index) => {
    const slot = preset.slots[index] ?? fallbackSlot(overflowIndex++, overflowCount);
    return { ...subject, ...slot };
  });

  return {
    ...scene,
    compositionPresetId: preset.id,
    cameraPreset: preset.cameraPreset,
    subjects,
  };
}
