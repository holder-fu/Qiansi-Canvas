export type PoseJointId =
  | 'head'
  | 'neck'
  | 'chest'
  | 'leftShoulder'
  | 'leftElbow'
  | 'leftWrist'
  | 'rightShoulder'
  | 'rightElbow'
  | 'rightWrist'
  | 'pelvis'
  | 'leftHip'
  | 'leftKnee'
  | 'leftAnkle'
  | 'rightHip'
  | 'rightKnee'
  | 'rightAnkle';

export interface PosePoint {
  x: number;
  y: number;
}

export interface PoseControlSettings {
  joints: Record<PoseJointId, PosePoint>;
  proportionLocked: boolean;
}

export interface PoseProtectionOptions {
  style: boolean;
  background: boolean;
}

export const DEFAULT_POSE_PROTECTION: Readonly<PoseProtectionOptions> = {
  style: true,
  background: true,
};

export const POSE_BONES: ReadonlyArray<readonly [PoseJointId, PoseJointId]> = [
  ['head', 'neck'],
  ['neck', 'chest'],
  ['chest', 'pelvis'],
  ['neck', 'leftShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['neck', 'rightShoulder'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['pelvis', 'leftHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['pelvis', 'rightHip'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

export const POSE_JOINT_LABELS: Record<PoseJointId, string> = {
  head: '头部',
  neck: '上身',
  chest: '胸部',
  leftShoulder: '左肩',
  leftElbow: '左肘',
  leftWrist: '左手',
  rightShoulder: '右肩',
  rightElbow: '右肘',
  rightWrist: '右手',
  pelvis: '身体中心',
  leftHip: '左髋',
  leftKnee: '左膝',
  leftAnkle: '左脚',
  rightHip: '右髋',
  rightKnee: '右膝',
  rightAnkle: '右脚',
};

export const DEFAULT_POSE_JOINTS: Record<PoseJointId, PosePoint> = {
  head: { x: 0.5, y: 0.13 },
  neck: { x: 0.5, y: 0.23 },
  chest: { x: 0.5, y: 0.36 },
  leftShoulder: { x: 0.39, y: 0.27 },
  leftElbow: { x: 0.33, y: 0.43 },
  leftWrist: { x: 0.29, y: 0.59 },
  rightShoulder: { x: 0.61, y: 0.27 },
  rightElbow: { x: 0.67, y: 0.43 },
  rightWrist: { x: 0.71, y: 0.59 },
  pelvis: { x: 0.5, y: 0.54 },
  leftHip: { x: 0.45, y: 0.56 },
  leftKnee: { x: 0.44, y: 0.75 },
  leftAnkle: { x: 0.43, y: 0.92 },
  rightHip: { x: 0.55, y: 0.56 },
  rightKnee: { x: 0.56, y: 0.75 },
  rightAnkle: { x: 0.57, y: 0.92 },
};

const ALL_JOINTS = Object.keys(DEFAULT_POSE_JOINTS) as PoseJointId[];
const UPPER_BODY: PoseJointId[] = [
  'head',
  'neck',
  'chest',
  'leftShoulder',
  'leftElbow',
  'leftWrist',
  'rightShoulder',
  'rightElbow',
  'rightWrist',
];
const ARM_BRANCHES = {
  leftShoulder: ['leftShoulder', 'leftElbow', 'leftWrist'],
  rightShoulder: ['rightShoulder', 'rightElbow', 'rightWrist'],
} as const;
const LEG_BRANCHES = {
  leftHip: ['leftHip', 'leftKnee', 'leftAnkle'],
  rightHip: ['rightHip', 'rightKnee', 'rightAnkle'],
} as const;

const clampUnit = (value: number) => Math.max(0.035, Math.min(0.965, value));
const clampPoint = (point: PosePoint): PosePoint => ({
  x: clampUnit(point.x),
  y: clampUnit(point.y),
});
const subtract = (a: PosePoint, b: PosePoint): PosePoint => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: PosePoint, b: PosePoint): PosePoint => ({ x: a.x + b.x, y: a.y + b.y });
const length = (point: PosePoint) => Math.hypot(point.x, point.y);
const distance = (a: PosePoint, b: PosePoint) => length(subtract(a, b));
const angle = (from: PosePoint, to: PosePoint) => Math.atan2(to.y - from.y, to.x - from.x);
const rotateVector = (point: PosePoint, radians: number): PosePoint => ({
  x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
  y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
});
const projectFrom = (root: PosePoint, target: PosePoint, targetLength: number): PosePoint => {
  const vector = subtract(target, root);
  const magnitude = Math.max(length(vector), 0.0001);
  return clampPoint({
    x: root.x + (vector.x / magnitude) * targetLength,
    y: root.y + (vector.y / magnitude) * targetLength,
  });
};
const canonicalLength = (from: PoseJointId, to: PoseJointId) =>
  distance(DEFAULT_POSE_JOINTS[from], DEFAULT_POSE_JOINTS[to]);

function cloneJoints(joints: Record<PoseJointId, PosePoint>) {
  return Object.fromEntries(ALL_JOINTS.map((id) => [id, { ...joints[id] }])) as Record<
    PoseJointId,
    PosePoint
  >;
}

function translateBranch(
  joints: Record<PoseJointId, PosePoint>,
  ids: readonly PoseJointId[],
  delta: PosePoint,
) {
  ids.forEach((id) => {
    joints[id] = clampPoint(add(joints[id], delta));
  });
}

function rotateBranch(
  joints: Record<PoseJointId, PosePoint>,
  ids: readonly PoseJointId[],
  center: PosePoint,
  radians: number,
) {
  ids.forEach((id) => {
    joints[id] = clampPoint(add(center, rotateVector(subtract(joints[id], center), radians)));
  });
}

function solveTwoBone(
  root: PosePoint,
  target: PosePoint,
  upperLength: number,
  lowerLength: number,
  previousBend: PosePoint,
) {
  const targetVector = subtract(target, root);
  const rawDistance = Math.max(length(targetVector), 0.0001);
  const solvedDistance = Math.min(
    upperLength + lowerLength - 0.0001,
    Math.max(Math.abs(upperLength - lowerLength) + 0.0001, rawDistance),
  );
  const direction = {
    x: targetVector.x / rawDistance,
    y: targetVector.y / rawDistance,
  };
  const end = clampPoint({
    x: root.x + direction.x * solvedDistance,
    y: root.y + direction.y * solvedDistance,
  });
  const baseAngle = Math.atan2(direction.y, direction.x);
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (upperLength * upperLength + solvedDistance * solvedDistance - lowerLength * lowerLength) /
        (2 * upperLength * solvedDistance),
    ),
  );
  const bendAngle = Math.acos(cosine);
  const candidates = [baseAngle + bendAngle, baseAngle - bendAngle].map((candidateAngle) => ({
    x: root.x + Math.cos(candidateAngle) * upperLength,
    y: root.y + Math.sin(candidateAngle) * upperLength,
  }));
  const bend =
    candidates.sort((a, b) => distance(a, previousBend) - distance(b, previousBend))[0] ??
    previousBend;
  return { bend: clampPoint(bend), end };
}

function moveHinge(
  joints: Record<PoseJointId, PosePoint>,
  rootId: PoseJointId,
  hingeId: PoseJointId,
  endId: PoseJointId,
  target: PosePoint,
) {
  const root = joints[rootId];
  const previousHinge = joints[hingeId];
  const previousEnd = joints[endId];
  const nextHinge = projectFrom(root, target, canonicalLength(rootId, hingeId));
  const rotation = angle(root, nextHinge) - angle(root, previousHinge);
  const lowerDirection = rotateVector(subtract(previousEnd, previousHinge), rotation);
  const lowerMagnitude = Math.max(length(lowerDirection), 0.0001);
  const lowerLength = canonicalLength(hingeId, endId);
  joints[hingeId] = nextHinge;
  joints[endId] = clampPoint({
    x: nextHinge.x + (lowerDirection.x / lowerMagnitude) * lowerLength,
    y: nextHinge.y + (lowerDirection.y / lowerMagnitude) * lowerLength,
  });
}

function moveEndEffector(
  joints: Record<PoseJointId, PosePoint>,
  rootId: PoseJointId,
  bendId: PoseJointId,
  endId: PoseJointId,
  target: PosePoint,
) {
  const solved = solveTwoBone(
    joints[rootId],
    target,
    canonicalLength(rootId, bendId),
    canonicalLength(bendId, endId),
    joints[bendId],
  );
  joints[bendId] = solved.bend;
  joints[endId] = solved.end;
}

function moveUpperBody(
  joints: Record<PoseJointId, PosePoint>,
  requestedNeck: PosePoint,
  locked: boolean,
) {
  const pelvis = joints.pelvis;
  const previousNeck = joints.neck;
  const nextNeck = locked
    ? projectFrom(
        pelvis,
        requestedNeck,
        distance(DEFAULT_POSE_JOINTS.pelvis, DEFAULT_POSE_JOINTS.neck),
      )
    : clampPoint(requestedNeck);
  const rotation = angle(pelvis, nextNeck) - angle(pelvis, previousNeck);
  rotateBranch(joints, UPPER_BODY, pelvis, rotation);
  const neckDelta = subtract(nextNeck, joints.neck);
  translateBranch(joints, UPPER_BODY, neckDelta);
}

export function createDefaultPoseSettings(): PoseControlSettings {
  return { proportionLocked: true, joints: cloneJoints(DEFAULT_POSE_JOINTS) };
}

/**
 * Moves the rig using the same hierarchy users expect from a pose tool.
 * With proportion lock on, bones keep their canonical length and hands/feet use two-bone IK.
 * With it off, a joint may be stretched, but its descendants still travel with it.
 */
export function updatePoseJoint(
  settings: PoseControlSettings,
  jointId: PoseJointId,
  point: PosePoint,
): PoseControlSettings {
  const target = clampPoint(point);
  const joints = cloneJoints(settings.joints);
  const previous = joints[jointId];

  if (jointId === 'pelvis') {
    translateBranch(joints, ALL_JOINTS, subtract(target, previous));
    return { ...settings, joints };
  }

  if (jointId === 'neck' || jointId === 'chest') {
    const neckTarget =
      jointId === 'neck' ? target : add(joints.neck, subtract(target, joints.chest));
    moveUpperBody(joints, neckTarget, settings.proportionLocked);
    return { ...settings, joints };
  }

  if (jointId === 'head') {
    joints.head = settings.proportionLocked
      ? projectFrom(joints.neck, target, canonicalLength('head', 'neck'))
      : target;
    return { ...settings, joints };
  }

  if (jointId === 'leftShoulder' || jointId === 'rightShoulder') {
    const nextRoot = settings.proportionLocked
      ? projectFrom(joints.neck, target, canonicalLength('neck', jointId))
      : target;
    translateBranch(joints, ARM_BRANCHES[jointId], subtract(nextRoot, previous));
    return { ...settings, joints };
  }

  if (jointId === 'leftHip' || jointId === 'rightHip') {
    const nextRoot = settings.proportionLocked
      ? projectFrom(joints.pelvis, target, canonicalLength('pelvis', jointId))
      : target;
    translateBranch(joints, LEG_BRANCHES[jointId], subtract(nextRoot, previous));
    return { ...settings, joints };
  }

  if (jointId === 'leftWrist') {
    if (settings.proportionLocked)
      moveEndEffector(joints, 'leftShoulder', 'leftElbow', 'leftWrist', target);
    else joints.leftWrist = target;
  } else if (jointId === 'rightWrist') {
    if (settings.proportionLocked)
      moveEndEffector(joints, 'rightShoulder', 'rightElbow', 'rightWrist', target);
    else joints.rightWrist = target;
  } else if (jointId === 'leftAnkle') {
    if (settings.proportionLocked)
      moveEndEffector(joints, 'leftHip', 'leftKnee', 'leftAnkle', target);
    else joints.leftAnkle = target;
  } else if (jointId === 'rightAnkle') {
    if (settings.proportionLocked)
      moveEndEffector(joints, 'rightHip', 'rightKnee', 'rightAnkle', target);
    else joints.rightAnkle = target;
  } else if (jointId === 'leftElbow') {
    if (settings.proportionLocked)
      moveHinge(joints, 'leftShoulder', 'leftElbow', 'leftWrist', target);
    else translateBranch(joints, ['leftElbow', 'leftWrist'], subtract(target, previous));
  } else if (jointId === 'rightElbow') {
    if (settings.proportionLocked)
      moveHinge(joints, 'rightShoulder', 'rightElbow', 'rightWrist', target);
    else translateBranch(joints, ['rightElbow', 'rightWrist'], subtract(target, previous));
  } else if (jointId === 'leftKnee') {
    if (settings.proportionLocked) moveHinge(joints, 'leftHip', 'leftKnee', 'leftAnkle', target);
    else translateBranch(joints, ['leftKnee', 'leftAnkle'], subtract(target, previous));
  } else if (jointId === 'rightKnee') {
    if (settings.proportionLocked) moveHinge(joints, 'rightHip', 'rightKnee', 'rightAnkle', target);
    else translateBranch(joints, ['rightKnee', 'rightAnkle'], subtract(target, previous));
  }

  return { ...settings, joints };
}

function bodySummary(joints: Record<PoseJointId, PosePoint>) {
  const raisedArms: string[] = [];
  if (joints.leftWrist.y < joints.leftShoulder.y - 0.04) raisedArms.push('左臂举起');
  if (joints.rightWrist.y < joints.rightShoulder.y - 0.04) raisedArms.push('右臂举起');
  const torsoDelta = joints.neck.x - joints.pelvis.x;
  const torso =
    torsoDelta < -0.04
      ? '躯干向画面左侧倾斜'
      : torsoDelta > 0.04
        ? '躯干向画面右侧倾斜'
        : '躯干基本直立';
  const stance =
    Math.abs(joints.leftAnkle.x - joints.rightAnkle.x) > 0.28
      ? '双腿分开形成稳定站姿'
      : '双腿间距较窄';
  return [...raisedArms, torso, stance].join('，');
}

export function buildPoseControlInstruction(
  settings: PoseControlSettings,
  protection: PoseProtectionOptions = DEFAULT_POSE_PROTECTION,
): string {
  const coordinates = ALL_JOINTS.map(
    (id) =>
      `${POSE_JOINT_LABELS[id]}(${Math.round(settings.joints[id].x * 100)}%,${Math.round(settings.joints[id].y * 100)}%)`,
  ).join('；');
  const styleRule = protection.style
    ? '风格保护：保持原图画风、材质、色彩、光影、清晰度和渲染质感不变。'
    : '风格保护关闭：允许模型为适配新姿态微调画面风格。';
  const backgroundRule = protection.background
    ? '背景保护：保持原图背景、场景物品、镜头、构图和人物所在位置不变。'
    : '背景保护关闭：允许模型为适配新姿态调整背景与构图。';
  return `把参考图中的主要人物调整为姿态控制图所示动作。姿态摘要：${bodySummary(settings.joints)}。归一化关节点位置（左上为0%,0%）：${coordinates}。第二张参考图是黑底灰白人体骨架控制图，只用于约束身体姿态和关节朝向，不是服装、外观或背景参考。严格保持原人物身份、五官、年龄、发型、服装和身体比例不变。${styleRule}${backgroundRule}只改变主要人物的身体姿态与关节位置，肩肘腕、髋膝踝连接自然，四肢长度稳定，手脚完整，不增减人物，不添加文字或水印。`;
}

export function poseControlSvg(settings: PoseControlSettings, size = 768): string {
  const point = (id: PoseJointId) => ({
    x: Math.round(settings.joints[id].x * size),
    y: Math.round(settings.joints[id].y * size),
  });
  const bones = POSE_BONES.map(([from, to]) => {
    const a = point(from);
    const b = point(to);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join('');
  const torso = ['leftShoulder', 'rightShoulder', 'rightHip', 'leftHip']
    .map((id) => {
      const p = point(id as PoseJointId);
      return `${p.x},${p.y}`;
    })
    .join(' ');
  const joints = ALL_JOINTS.map((id) => {
    const p = point(id);
    const radius = id === 'head' ? 27 : 11;
    return `<circle cx="${p.x}" cy="${p.y}" r="${radius}"/>`;
  }).join('');
  const leftFoot = point('leftAnkle');
  const rightFoot = point('rightAnkle');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#000"/><polygon points="${torso}" fill="#6b6b70" fill-opacity=".6"/><g stroke="#85858a" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" fill="#fff">${bones}<line x1="${leftFoot.x - 18}" y1="${leftFoot.y + 10}" x2="${leftFoot.x + 22}" y2="${leftFoot.y + 10}"/><line x1="${rightFoot.x - 18}" y1="${rightFoot.y + 10}" x2="${rightFoot.x + 22}" y2="${rightFoot.y + 10}"/>${joints}</g></svg>`;
}

export function poseControlDataUrl(settings: PoseControlSettings, size = 768): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(poseControlSvg(settings, size))}`;
}

export async function renderPoseControlPng(
  settings: PoseControlSettings,
  size = 768,
): Promise<string> {
  const source = poseControlDataUrl(settings, size);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('浏览器无法创建姿态控制图。'));
        return;
      }
      context.drawImage(image, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('姿态控制图渲染失败。'));
    image.src = source;
  });
}
