import type { DirectorCameraPreset } from '../canvas/nodeTypes';

export interface DirectorCameraGuide {
  cameraX: number;
  cameraY: number;
  targetX: number;
  targetY: number;
  label: string;
  description: string;
}

const CAMERA_GUIDES: Record<DirectorCameraPreset, DirectorCameraGuide> = {
  'wide-front': {
    cameraX: 50,
    cameraY: 92,
    targetX: 50,
    targetY: 46,
    label: '正前方机位',
    description: '摄影机位于场景正前方，朝向整个表演区域',
  },
  'medium-front': {
    cameraX: 50,
    cameraY: 92,
    targetX: 50,
    targetY: 50,
    label: '正前方机位',
    description: '摄影机位于人物正前方，朝向画面中心',
  },
  closeup: {
    cameraX: 50,
    cameraY: 86,
    targetX: 50,
    targetY: 48,
    label: '正前方近机位',
    description: '摄影机从正前方靠近人物，对准头肩和面部',
  },
  'low-angle': {
    cameraX: 50,
    cameraY: 94,
    targetX: 50,
    targetY: 38,
    label: '低机位·向上仰拍',
    description: '摄影机位于人物前下方，镜头向上对准人物',
  },
  'high-angle': {
    cameraX: 50,
    cameraY: 8,
    targetX: 50,
    targetY: 58,
    label: '高机位·向下俯拍',
    description: '摄影机位于场景前上方，镜头向下对准人物',
  },
  'over-shoulder': {
    cameraX: 18,
    cameraY: 82,
    targetX: 56,
    targetY: 48,
    label: '画面左前方·肩后机位',
    description: '摄影机位于前景人物肩后，朝向对面人物',
  },
  profile: {
    cameraX: 92,
    cameraY: 56,
    targetX: 52,
    targetY: 56,
    label: '画面右侧机位',
    description: '摄影机位于场景右侧，向左拍摄人物侧面',
  },
};

export function getDirectorCameraGuide(preset: DirectorCameraPreset): DirectorCameraGuide {
  return CAMERA_GUIDES[preset];
}

export function getDirectorCameraConePoints(guide: DirectorCameraGuide): string {
  const dx = guide.targetX - guide.cameraX;
  const dy = guide.targetY - guide.cameraY;
  const length = Math.hypot(dx, dy) || 1;
  const spread = 11;
  const offsetX = (-dy / length) * spread;
  const offsetY = (dx / length) * spread;
  return [
    `${guide.cameraX},${guide.cameraY}`,
    `${guide.targetX + offsetX},${guide.targetY + offsetY}`,
    `${guide.targetX - offsetX},${guide.targetY - offsetY}`,
  ].join(' ');
}
