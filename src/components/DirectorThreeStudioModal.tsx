import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bone,
  Box,
  Camera,
  Check,
  Clapperboard,
  Eye,
  EyeOff,
  Film,
  Layers3,
  Link2,
  Maximize2,
  Move,
  Palette,
  Pause,
  Play,
  Rotate3D,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import type {
  DirectorAnimationClip,
  DirectorCameraPreset,
  DirectorCharacterColors,
  DirectorCharacterPresetId,
  DirectorMotionPathType,
  DirectorPosePreset,
  DirectorRigJoint,
  DirectorSceneObject,
  DirectorSceneObjectPrimitive,
  DirectorSceneState,
  DirectorStageCamera,
  DirectorSubjectPlacement,
} from '../canvas/nodeTypes';
import { flushCanvasPersistence, useCanvasStore } from '../store/canvasStore';
import {
  buildDirectorConstraintPrompt,
  buildDirectorReferenceManifest,
  buildDirectorSupportingReferenceSlots,
  createDefaultDirectorScene,
  createDefaultDirectorSubject,
  createPersistentDirectorScene,
  directorBodyFacingFromAngle,
  normalizeDirectorScene,
} from '../lib/directorConstraints';
import {
  DIRECTOR_ANIMATION_CLIPS,
  DIRECTOR_CHARACTER_CATALOG_PRESETS,
  DIRECTOR_RIG_JOINTS,
  getDirectorCharacterPreset,
  normalizeDirectorCharacterColors,
  patchLinkedDirectorJoint,
  type DirectorCharacterPreset,
} from '../lib/directorCharacters';
import {
  createDirectorMotionPath,
  DIRECTOR_MOTION_PATH_RANGE_MAX,
  DIRECTOR_MOTION_PATH_RANGE_MIN,
  DIRECTOR_MOTION_PATH_LABELS,
  DIRECTOR_MOTION_PATH_OPTIONS,
  getDirectorMotionPathRange,
  resizeDirectorMotionPath,
  translateDirectorMotionPath,
} from '../lib/directorMotionPath';
import {
  deleteLegacyDirectorModel,
  deleteLegacyDirectorScene,
  loadDirectorModel,
  loadDirectorScene,
  loadDirectorSceneReference,
  saveDirectorModel,
  saveDirectorScene,
  saveDirectorSceneReference,
} from '../lib/libraryMedia';
import { DIRECTOR_MODEL_FILE_ACCEPT, directorModelFormatFromFileName } from '../lib/directorModel';
import { availableProviderModels, loadProviderConnections } from '../lib/providerRegistry';
import { matchModelFavorite, readModelFavorite } from '../lib/modelFavorites';
import { getDirectorGroundedCameraPitch } from '../lib/directorStage';
import { directorPrevisFileExtension } from '../lib/directorPrevisVideo';
import {
  DIRECTOR_PANORAMA_LIFT_MAX,
  directorPanoramaRenderPlan,
  isDirectorPanoramaStageReady,
} from '../lib/directorPanorama';
import { persistVideoFile } from '../services/mediaPersistence';
import { bridgeAssetFileUrl, deleteBridgeAsset } from '../services/assetLibrary';
import {
  DIRECTOR_CAMERA_PRESET_DRAG_TYPE,
  DirectorThreeStage,
  type DirectorThreeStageHandle,
} from './DirectorThreeStage';
import { useAppTranslation } from '../i18n/appI18n';

type InspectorTab = 'transform' | 'rig' | 'material' | 'animation';
type LeftPanel = 'actors' | 'objects' | 'scene' | 'cameras';
type TransformMode = 'translate' | 'rotate' | 'scale';
type CameraView = 'director' | 'shot';
type AutoSaveStatus = 'dirty' | 'saving' | 'saved' | 'error';

const COLOR_SLOTS: ReadonlyArray<{
  id: keyof DirectorCharacterColors;
  label: string;
}> = [
  { id: 'skin', label: '肤色' },
  { id: 'outfit', label: '服装' },
  { id: 'accent', label: '强调色' },
  { id: 'hair', label: '发色' },
];

const CAMERA_SHOTS: Array<{
  id: DirectorCameraPreset;
  label: string;
  detail: string;
  yaw: number;
  pitch: number;
  distance: number;
}> = [
  { id: 'medium-front', label: '正面中景', detail: '50mm · 眼平', yaw: 0, pitch: 10, distance: 54 },
  {
    id: 'wide-front',
    label: '正面全景',
    detail: '28mm · 水平环境',
    yaw: 0,
    pitch: 0,
    distance: 82,
  },
  { id: 'closeup', label: '人物特写', detail: '85mm · 近景', yaw: 0, pitch: 14, distance: 30 },
  { id: 'profile', label: '侧面跟拍', detail: '50mm · 右侧', yaw: 86, pitch: 10, distance: 56 },
  { id: 'profile', label: '左侧近景', detail: '65mm · 左侧', yaw: -86, pitch: 12, distance: 38 },
  { id: 'high-angle', label: '高位俯拍', detail: '35mm · 俯视', yaw: 0, pitch: 45, distance: 84 },
  { id: 'low-angle', label: '低位仰拍', detail: '35mm · 英雄', yaw: 0, pitch: -20, distance: 52 },
  {
    id: 'over-shoulder',
    label: '过肩镜头',
    detail: '65mm · 对话',
    yaw: 36,
    pitch: 12,
    distance: 42,
  },
];

function cameraShotKey(shot: (typeof CAMERA_SHOTS)[number]) {
  return `${shot.id}:${shot.yaw}`;
}

const OBJECT_PRIMITIVES: ReadonlyArray<{
  id: DirectorSceneObjectPrimitive;
  label: string;
  detail: string;
  kind: DirectorSceneObject['kind'];
  color: string;
}> = [
  { id: 'cube', label: '正方体', detail: '体块 / 建筑占位', kind: 'prop', color: '#d9772f' },
  { id: 'sphere', label: '球体', detail: '圆形体 / 景观体', kind: 'decoration', color: '#3b82a8' },
  { id: 'cylinder', label: '圆柱体', detail: '立柱 / 罐体', kind: 'prop', color: '#b97436' },
  { id: 'cone', label: '圆锥体', detail: '屋顶 / 标志体', kind: 'decoration', color: '#9b5f9f' },
  { id: 'wall', label: '墙体', detail: '建筑背景平面', kind: 'landmark', color: '#b79a65' },
  {
    id: 'pillar',
    label: '建筑立柱',
    detail: '柱廊 / 空间节奏',
    kind: 'landmark',
    color: '#c0a66f',
  },
  { id: 'arch', label: '拱门', detail: '门洞 / 建筑入口', kind: 'landmark', color: '#a98156' },
  { id: 'stairs', label: '台阶', detail: '高差 / 动线参考', kind: 'landmark', color: '#8b8173' },
];

const POSE_PRESETS = [
  { id: 'stand', label: '自然站立' },
  { id: 't-pose', label: 'T Pose' },
  { id: 'walk', label: '行走步态' },
  { id: 'run', label: '跑步起势' },
  { id: 'sit', label: '坐姿' },
  { id: 'crouch', label: '下蹲' },
  { id: 'kneel', label: '单膝跪' },
  { id: 'double-kneel', label: '双膝跪' },
  { id: 'think', label: '思考' },
  { id: 'bow', label: '鞠躬' },
  { id: 'jump', label: '起跳' },
  { id: 'throw', label: '投掷' },
  { id: 'push', label: '推击' },
  { id: 'wave', label: '招手' },
  { id: 'reach', label: '伸手' },
  { id: 'fold-arms', label: '抱臂' },
] as const satisfies ReadonlyArray<{ id: DirectorPosePreset; label: string }>;

type DirectorCatalogTranslator = ReturnType<typeof useAppTranslation>['t'];

const CHARACTER_PRESET_DISPLAY_KEYS = {
  'cinematic-male': {
    labelKey: 'director3d.catalog.character.cinematicMale.label',
    descriptionKey: 'director3d.catalog.character.cinematicMale.role',
  },
  'cinematic-female': {
    labelKey: 'director3d.catalog.character.cinematicFemale.label',
    descriptionKey: 'director3d.catalog.character.cinematicFemale.role',
  },
  'action-hero': {
    labelKey: 'director3d.catalog.character.actionHero.label',
    descriptionKey: 'director3d.catalog.character.actionHero.role',
  },
  'stylized-youth': {
    labelKey: 'director3d.catalog.character.stylizedYouth.label',
    descriptionKey: 'director3d.catalog.character.stylizedYouth.role',
  },
  'studio-mannequin': {
    labelKey: 'director3d.catalog.character.studioMannequin.label',
    descriptionKey: 'director3d.catalog.character.studioMannequin.role',
  },
  'studio-man': {
    labelKey: 'director3d.catalog.character.studioMan.label',
    descriptionKey: 'director3d.catalog.character.studioMan.role',
  },
} as const satisfies Record<
  DirectorCharacterPresetId,
  { labelKey: string; descriptionKey: string }
>;

const OBJECT_PRIMITIVE_DISPLAY_KEYS = {
  cube: {
    labelKey: 'director3d.catalog.object.cube.label',
    descriptionKey: 'director3d.catalog.object.cube.detail',
  },
  sphere: {
    labelKey: 'director3d.catalog.object.sphere.label',
    descriptionKey: 'director3d.catalog.object.sphere.detail',
  },
  cylinder: {
    labelKey: 'director3d.catalog.object.cylinder.label',
    descriptionKey: 'director3d.catalog.object.cylinder.detail',
  },
  cone: {
    labelKey: 'director3d.catalog.object.cone.label',
    descriptionKey: 'director3d.catalog.object.cone.detail',
  },
  wall: {
    labelKey: 'director3d.catalog.object.wall.label',
    descriptionKey: 'director3d.catalog.object.wall.detail',
  },
  pillar: {
    labelKey: 'director3d.catalog.object.pillar.label',
    descriptionKey: 'director3d.catalog.object.pillar.detail',
  },
  arch: {
    labelKey: 'director3d.catalog.object.arch.label',
    descriptionKey: 'director3d.catalog.object.arch.detail',
  },
  stairs: {
    labelKey: 'director3d.catalog.object.stairs.label',
    descriptionKey: 'director3d.catalog.object.stairs.detail',
  },
} as const satisfies Record<
  DirectorSceneObjectPrimitive,
  { labelKey: string; descriptionKey: string }
>;

const CAMERA_SHOT_DISPLAY_KEYS = {
  'medium-front:0': {
    labelKey: 'director3d.catalog.camera.mediumFront.label',
    descriptionKey: 'director3d.catalog.camera.mediumFront.detail',
  },
  'wide-front:0': {
    labelKey: 'director3d.catalog.camera.wideFront.label',
    descriptionKey: 'director3d.catalog.camera.wideFront.detail',
  },
  'closeup:0': {
    labelKey: 'director3d.catalog.camera.closeup.label',
    descriptionKey: 'director3d.catalog.camera.closeup.detail',
  },
  'profile:86': {
    labelKey: 'director3d.catalog.camera.profileRight.label',
    descriptionKey: 'director3d.catalog.camera.profileRight.detail',
  },
  'profile:-86': {
    labelKey: 'director3d.catalog.camera.profileLeft.label',
    descriptionKey: 'director3d.catalog.camera.profileLeft.detail',
  },
  'high-angle:0': {
    labelKey: 'director3d.catalog.camera.highAngle.label',
    descriptionKey: 'director3d.catalog.camera.highAngle.detail',
  },
  'low-angle:0': {
    labelKey: 'director3d.catalog.camera.lowAngle.label',
    descriptionKey: 'director3d.catalog.camera.lowAngle.detail',
  },
  'over-shoulder:36': {
    labelKey: 'director3d.catalog.camera.overShoulder.label',
    descriptionKey: 'director3d.catalog.camera.overShoulder.detail',
  },
} as const;

const POSE_PRESET_DISPLAY_KEYS = {
  stand: { labelKey: 'director3d.catalog.pose.stand' },
  't-pose': { labelKey: 'director3d.catalog.pose.tPose' },
  walk: { labelKey: 'director3d.catalog.pose.walk' },
  run: { labelKey: 'director3d.catalog.pose.run' },
  sit: { labelKey: 'director3d.catalog.pose.sit' },
  crouch: { labelKey: 'director3d.catalog.pose.crouch' },
  kneel: { labelKey: 'director3d.catalog.pose.kneel' },
  'double-kneel': { labelKey: 'director3d.catalog.pose.doubleKneel' },
  think: { labelKey: 'director3d.catalog.pose.think' },
  bow: { labelKey: 'director3d.catalog.pose.bow' },
  jump: { labelKey: 'director3d.catalog.pose.jump' },
  throw: { labelKey: 'director3d.catalog.pose.throw' },
  push: { labelKey: 'director3d.catalog.pose.push' },
  wave: { labelKey: 'director3d.catalog.pose.wave' },
  reach: { labelKey: 'director3d.catalog.pose.reach' },
  'fold-arms': { labelKey: 'director3d.catalog.pose.foldArms' },
} as const satisfies Record<(typeof POSE_PRESETS)[number]['id'], { labelKey: string }>;

const RIG_JOINT_DISPLAY_KEYS = {
  spine: { labelKey: 'director3d.catalog.joint.spine' },
  neck: { labelKey: 'director3d.catalog.joint.neck' },
  leftShoulder: { labelKey: 'director3d.catalog.joint.leftShoulder' },
  leftElbow: { labelKey: 'director3d.catalog.joint.leftElbow' },
  rightShoulder: { labelKey: 'director3d.catalog.joint.rightShoulder' },
  rightElbow: { labelKey: 'director3d.catalog.joint.rightElbow' },
  leftHip: { labelKey: 'director3d.catalog.joint.leftHip' },
  leftKnee: { labelKey: 'director3d.catalog.joint.leftKnee' },
  rightHip: { labelKey: 'director3d.catalog.joint.rightHip' },
  rightKnee: { labelKey: 'director3d.catalog.joint.rightKnee' },
} as const satisfies Record<DirectorRigJoint, { labelKey: string }>;

const COLOR_SLOT_DISPLAY_KEYS = {
  skin: { labelKey: 'director3d.catalog.color.skin' },
  outfit: { labelKey: 'director3d.catalog.color.outfit' },
  accent: { labelKey: 'director3d.catalog.color.accent' },
  hair: { labelKey: 'director3d.catalog.color.hair' },
} as const satisfies Record<keyof DirectorCharacterColors, { labelKey: string }>;

const ANIMATION_CLIP_DISPLAY_KEYS = {
  none: {
    labelKey: 'director3d.catalog.animation.none.label',
    descriptionKey: 'director3d.catalog.animation.none.description',
  },
  idle: {
    labelKey: 'director3d.catalog.animation.idle.label',
    descriptionKey: 'director3d.catalog.animation.idle.description',
  },
  walk: {
    labelKey: 'director3d.catalog.animation.walk.label',
    descriptionKey: 'director3d.catalog.animation.walk.description',
  },
  run: {
    labelKey: 'director3d.catalog.animation.run.label',
    descriptionKey: 'director3d.catalog.animation.run.description',
  },
  wave: {
    labelKey: 'director3d.catalog.animation.wave.label',
    descriptionKey: 'director3d.catalog.animation.wave.description',
  },
  talk: {
    labelKey: 'director3d.catalog.animation.talk.label',
    descriptionKey: 'director3d.catalog.animation.talk.description',
  },
  turn: {
    labelKey: 'director3d.catalog.animation.turn.label',
    descriptionKey: 'director3d.catalog.animation.turn.description',
  },
  jump: {
    labelKey: 'director3d.catalog.animation.jump.label',
    descriptionKey: 'director3d.catalog.animation.jump.description',
  },
} as const satisfies Record<DirectorAnimationClip, { labelKey: string; descriptionKey: string }>;

const MOTION_PATH_DISPLAY_KEYS = {
  line: {
    labelKey: 'director3d.catalog.path.line.label',
    descriptionKey: 'director3d.catalog.path.line.detail',
  },
  arc: {
    labelKey: 'director3d.catalog.path.arc.label',
    descriptionKey: 'director3d.catalog.path.arc.detail',
  },
  's-curve': {
    labelKey: 'director3d.catalog.path.sCurve.label',
    descriptionKey: 'director3d.catalog.path.sCurve.detail',
  },
  circle: {
    labelKey: 'director3d.catalog.path.circle.label',
    descriptionKey: 'director3d.catalog.path.circle.detail',
  },
  'figure-eight': {
    labelKey: 'director3d.catalog.path.figureEight.label',
    descriptionKey: 'director3d.catalog.path.figureEight.detail',
  },
  rectangle: {
    labelKey: 'director3d.catalog.path.rectangle.label',
    descriptionKey: 'director3d.catalog.path.rectangle.detail',
  },
  zigzag: {
    labelKey: 'director3d.catalog.path.zigzag.label',
    descriptionKey: 'director3d.catalog.path.zigzag.detail',
  },
  pencil: { labelKey: 'director3d.catalog.path.pencil.label' },
  pen: { labelKey: 'director3d.catalog.path.pen.label' },
} as const satisfies Record<DirectorMotionPathType, { labelKey: string; descriptionKey?: string }>;

function translatedCharacterPreset(preset: DirectorCharacterPreset, t: DirectorCatalogTranslator) {
  const keys = CHARACTER_PRESET_DISPLAY_KEYS[preset.id];
  return {
    label: t(keys.labelKey, preset.label),
    role: t(keys.descriptionKey, preset.role),
  };
}

function translatedObjectPrimitive(
  preset: (typeof OBJECT_PRIMITIVES)[number],
  t: DirectorCatalogTranslator,
) {
  const keys = OBJECT_PRIMITIVE_DISPLAY_KEYS[preset.id];
  return {
    label: t(keys.labelKey, preset.label),
    detail: t(keys.descriptionKey, preset.detail),
  };
}

function translatedCameraShot(shot: (typeof CAMERA_SHOTS)[number], t: DirectorCatalogTranslator) {
  const keys =
    CAMERA_SHOT_DISPLAY_KEYS[cameraShotKey(shot) as keyof typeof CAMERA_SHOT_DISPLAY_KEYS];
  return keys
    ? { label: t(keys.labelKey, shot.label), detail: t(keys.descriptionKey, shot.detail) }
    : { label: shot.label, detail: shot.detail };
}

function translatedPoseLabel(pose: (typeof POSE_PRESETS)[number], t: DirectorCatalogTranslator) {
  return t(POSE_PRESET_DISPLAY_KEYS[pose.id].labelKey, pose.label);
}

function translatedJointLabel(
  joint: (typeof DIRECTOR_RIG_JOINTS)[number],
  t: DirectorCatalogTranslator,
) {
  return t(RIG_JOINT_DISPLAY_KEYS[joint.id].labelKey, joint.label);
}

function translatedColorSlotLabel(
  slot: (typeof COLOR_SLOTS)[number],
  t: DirectorCatalogTranslator,
) {
  return t(COLOR_SLOT_DISPLAY_KEYS[slot.id].labelKey, slot.label);
}

function translatedAnimationClip(
  clip: (typeof DIRECTOR_ANIMATION_CLIPS)[number],
  t: DirectorCatalogTranslator,
) {
  const keys = ANIMATION_CLIP_DISPLAY_KEYS[clip.id];
  return {
    label: t(keys.labelKey, clip.label),
    description: t(keys.descriptionKey, clip.description),
  };
}

function translatedMotionPathLabel(
  type: DirectorMotionPathType,
  fallback: string,
  t: DirectorCatalogTranslator,
) {
  return t(MOTION_PATH_DISPLAY_KEYS[type].labelKey, fallback);
}

function translatedMotionPathDetail(
  type: Exclude<DirectorMotionPathType, 'pencil' | 'pen'>,
  fallback: string,
  t: DirectorCatalogTranslator,
) {
  return t(MOTION_PATH_DISPLAY_KEYS[type].descriptionKey, fallback);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('无法编码全景图片'))),
      type,
      quality,
    ),
  );
}

async function createPanoramaAssets(file: Blob) {
  const bitmap = await createImageBitmap(file);
  try {
    const render = async (maximumWidth: number, maximumHeight: number, quality: number) => {
      const plan = directorPanoramaRenderPlan(
        bitmap.width,
        bitmap.height,
        maximumWidth,
        maximumHeight,
      );
      const canvas = document.createElement('canvas');
      canvas.width = plan.outputWidth;
      canvas.height = plan.outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器不支持图片缩放');
      context.drawImage(
        bitmap,
        plan.sourceX,
        plan.sourceY,
        plan.sourceWidth,
        plan.sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return canvasToBlob(canvas, 'image/jpeg', quality);
    };
    const panorama = await render(4096, 2048, 0.9);
    const reference = await render(960, 480, 0.72);
    return { panorama, reference };
  } finally {
    bitmap.close();
  }
}

async function normalizePanoramaForStage(file: Blob) {
  const bitmap = await createImageBitmap(file);
  try {
    if (isDirectorPanoramaStageReady(bitmap.width, bitmap.height)) return file;
  } finally {
    bitmap.close();
  }
  return (await createPanoramaAssets(file)).panorama;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('无法读取场景参考图'));
    reader.onerror = () => reject(reader.error ?? new Error('无法读取场景参考图'));
    reader.readAsDataURL(blob);
  });
}

async function persistPanoramaBlob(blob: Blob, projectId: string) {
  const { panorama, reference } = await createPanoramaAssets(blob);
  const uploadId = `director-scene-${crypto.randomUUID()}`;
  const sceneItem = await saveDirectorScene(uploadId, panorama, {
    project: projectId,
    fileName: `${uploadId}.jpg`,
  });
  let referenceItem;
  try {
    referenceItem = await saveDirectorSceneReference(uploadId, reference, {
      project: projectId,
      fileName: `${uploadId}-reference.jpg`,
    });
  } catch (error) {
    await deleteBridgeAsset(sceneItem.id).catch(() => undefined);
    throw error;
  }
  return {
    sceneAssetId: sceneItem.id,
    sceneReferenceAssetId: referenceItem.id,
    panorama,
    reference,
    sceneReferenceUrl: referenceItem.url,
  };
}

async function loadPanoramaAssets(
  sceneAssetId: string,
  sceneReferenceAssetId: string | undefined,
  projectId: string,
) {
  const [panorama, storedReference] = await Promise.all([
    loadDirectorScene(sceneAssetId),
    loadDirectorSceneReference(sceneReferenceAssetId || sceneAssetId),
  ]);
  if (!panorama) return null;
  const stagePanorama = await normalizePanoramaForStage(panorama);
  const reference = storedReference ?? (await createPanoramaAssets(panorama)).reference;
  if (!sceneAssetId.startsWith('asset_')) {
    const migrationId = `director-scene-${crypto.randomUUID()}`;
    const sceneItem = await saveDirectorScene(migrationId, stagePanorama, {
      project: projectId,
      fileName: `${migrationId}.jpg`,
    });
    let referenceItem;
    try {
      referenceItem = await saveDirectorSceneReference(migrationId, reference, {
        project: projectId,
        fileName: `${migrationId}-reference.jpg`,
      });
    } catch (error) {
      await deleteBridgeAsset(sceneItem.id).catch(() => undefined);
      throw error;
    }
    return {
      legacySceneAssetId: sceneAssetId,
      sceneAssetId: sceneItem.id,
      sceneReferenceAssetId: referenceItem.id,
      sceneReferenceUrl: referenceItem.url,
      panorama: stagePanorama,
      reference,
    };
  }
  if (sceneReferenceAssetId?.startsWith('asset_') && storedReference) {
    return {
      panorama: stagePanorama,
      reference,
      sceneReferenceUrl: bridgeAssetFileUrl(sceneReferenceAssetId),
    };
  }
  const referenceItem = await saveDirectorSceneReference(sceneAssetId, reference, {
    project: projectId,
    fileName: `${sceneAssetId}-reference.jpg`,
  });
  return {
    panorama: stagePanorama,
    reference,
    sceneReferenceAssetId: referenceItem.id,
    sceneReferenceUrl: referenceItem.url,
  };
}

function orderedDirectorReferences(scene: DirectorSceneState, layoutFrames: string[]) {
  let layoutIndex = 0;
  return buildDirectorReferenceManifest(scene).flatMap((item) => {
    if (item.kind === 'layout') {
      const frame = layoutFrames[layoutIndex];
      layoutIndex += 1;
      return frame ? [frame] : [];
    }
    return item.imageUrl ? [item.imageUrl] : [];
  });
}

function supportingDirectorReferenceUrls(scene: DirectorSceneState) {
  return buildDirectorSupportingReferenceSlots(scene).map((slot) => slot.imageUrl);
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function automaticVideoModel() {
  const choices = availableProviderModels(loadProviderConnections(), 'video').filter(
    (choice) => !choice.videoModes?.length || choice.videoModes.includes('全能参考'),
  );
  const favorite = matchModelFavorite(choices, readModelFavorite('video'));
  const providers = new Set(choices.map((choice) => choice.providerId));
  const recommended = choices.filter((choice) => choice.recommended);
  return (
    favorite ??
    (choices.length === 1
      ? choices[0]
      : providers.size === 1 && recommended.length === 1
        ? recommended[0]
        : undefined)
  );
}

function CharacterThumbnail({ presetId }: { presetId: DirectorCharacterPresetId }) {
  const preset = getDirectorCharacterPreset(presetId);
  if (preset.thumbnailUrl) {
    return (
      <img
        src={preset.thumbnailUrl}
        alt=""
        className="director-character-photo h-full w-full object-contain object-bottom transition-transform duration-200 group-hover:scale-[1.025]"
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="director-character-thumb"
      style={
        {
          '--actor-skin': preset.colors.skin,
          '--actor-outfit': preset.colors.outfit,
          '--actor-accent': preset.colors.accent,
          '--actor-hair': preset.colors.hair,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <span className="director-character-thumb__head" />
      <span className="director-character-thumb__body" />
      <span className="director-character-thumb__arm director-character-thumb__arm--left" />
      <span className="director-character-thumb__arm director-character-thumb__arm--right" />
      <span className="director-character-thumb__leg director-character-thumb__leg--left" />
      <span className="director-character-thumb__leg director-character-thumb__leg--right" />
    </span>
  );
}

function PrimitiveThumbnail({
  primitive,
  color,
}: {
  primitive: DirectorSceneObjectPrimitive;
  color: string;
}) {
  const common = { fill: `${color}33`, stroke: color, strokeWidth: 2 };
  return (
    <svg viewBox="0 0 96 72" className="h-[70px] w-[92px]" aria-hidden="true">
      {primitive === 'cube' ? (
        <>
          <path d="M22 24 48 10l27 14-27 15Z" {...common} />
          <path d="M22 24v30l26 10V39Zm53 0v30L48 64V39Z" {...common} />
        </>
      ) : primitive === 'sphere' ? (
        <>
          <circle cx="48" cy="36" r="25" {...common} />
          <ellipse cx="48" cy="36" rx="11" ry="25" fill="none" stroke={color} strokeWidth="1.5" />
          <ellipse cx="48" cy="36" rx="25" ry="9" fill="none" stroke={color} strokeWidth="1.5" />
        </>
      ) : primitive === 'cylinder' ? (
        <>
          <path d="M25 20v34c0 7 46 7 46 0V20" {...common} />
          <ellipse cx="48" cy="20" rx="23" ry="9" {...common} />
          <path d="M25 54c0 7 46 7 46 0" fill="none" stroke={color} strokeWidth="2" />
        </>
      ) : primitive === 'cone' ? (
        <>
          <path d="M48 8 22 55c0 9 52 9 52 0Z" {...common} />
          <ellipse cx="48" cy="55" rx="26" ry="9" fill="none" stroke={color} strokeWidth="2" />
        </>
      ) : primitive === 'wall' ? (
        <>
          <rect x="10" y="16" width="76" height="43" rx="2" {...common} />
          <path
            d="M10 31h76M10 45h76M29 16v15m37-15v15M20 31v14m28-14v14m27-14v14M32 45v14m34-14v14"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
          />
        </>
      ) : primitive === 'pillar' ? (
        <>
          <path d="M34 14h28l-4 7v36l5 7H33l5-7V21Z" {...common} />
          <path d="M38 23h20M38 55h20" fill="none" stroke={color} strokeWidth="2" />
        </>
      ) : primitive === 'arch' ? (
        <path d="M15 64V34C15 7 81 7 81 34v30H63V36c0-17-30-17-30 0v28Z" {...common} />
      ) : (
        <path d="M12 59h72V47H69V36H55V25H41V14H27v34H12Z" {...common} />
      )}
    </svg>
  );
}

function motionPointMarkers(points: Array<{ x: number; depth: number }> | undefined) {
  if (!points?.length) return [];
  return points.map((point, index) => ({
    id: `motion-point-${index}-${point.x}-${point.depth}`,
    left: `${(index / Math.max(1, points.length - 1)) * 100}%`,
  }));
}

function shouldIgnoreStudioShortcut(event: KeyboardEvent) {
  if (event.isComposing) return true;
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function DirectorThreeStudioModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const takeSnapshot = useCanvasStore((state) => state.takeSnapshot);
  const propagate = useCanvasStore((state) => state.propagate);
  const createVideoFromDirector = useCanvasStore((state) => state.createVideoFromDirector);
  const activeProjectId = useCanvasStore((state) => state.activeProjectId);
  const stageRef = useRef<DirectorThreeStageHandle>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const loadedRef = useRef<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  const pendingLegacyModelCleanupRef = useRef(new Set<string>());
  const pendingLegacySceneCleanupRef = useRef(new Set<string>());
  const [draft, setDraft] = useState<DirectorSceneState>(createDefaultDirectorScene);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [activeRigJoint, setActiveRigJoint] = useState<{
    subjectId: string;
    joint: DirectorRigJoint;
  } | null>(null);
  const [activeSceneObjectId, setActiveSceneObjectId] = useState<string | null>(null);
  const [activeStageCameraId, setActiveStageCameraId] = useState<string | null>(null);
  const [previewStageCameraId, setPreviewStageCameraId] = useState<string | null>(null);
  const [activeMotionPathSubjectId, setActiveMotionPathSubjectId] = useState<string | null>(null);
  const activeSubjectIdRef = useRef(activeSubjectId);
  const activeSceneObjectIdRef = useRef(activeSceneObjectId);
  const activeStageCameraIdRef = useRef(activeStageCameraId);
  const activeMotionPathSubjectIdRef = useRef(activeMotionPathSubjectId);
  activeSubjectIdRef.current = activeSubjectId;
  activeSceneObjectIdRef.current = activeSceneObjectId;
  activeStageCameraIdRef.current = activeStageCameraId;
  activeMotionPathSubjectIdRef.current = activeMotionPathSubjectId;
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('transform');
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('actors');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [cameraView, setCameraView] = useState<CameraView>('shot');
  const [showRig, setShowRig] = useState(false);
  const [motionPreviewOnly, setMotionPreviewOnly] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('saved');
  const [autoSaveError, setAutoSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [restoringModels, setRestoringModels] = useState(false);
  const [restoringScene, setRestoringScene] = useState(false);
  const [modelLoadStatus, setModelLoadStatus] = useState({ loading: 0, errors: 0 });
  const leftPanelPersistent = useMediaQuery('(min-width: 1280px)');
  const rightPanelPersistent = useMediaQuery('(min-width: 1080px)');
  const isOpen = openModal === 'director-studio';
  const node = nodes.find(
    (item) =>
      item.id === modalNodeId &&
      (item.data.kind === 'director-3d' ||
        (item.data.kind === 'director' && item.data.directorMode !== '2d')),
  );
  const sceneHydrated = Boolean(node && loadedRef.current === node.id);

  const cleanupCommittedLegacyDirectorMedia = useCallback(async () => {
    const modelIds = [...pendingLegacyModelCleanupRef.current];
    const sceneIds = [...pendingLegacySceneCleanupRef.current];
    await Promise.all([
      ...modelIds.map(async (id) => {
        await deleteLegacyDirectorModel(id);
        pendingLegacyModelCleanupRef.current.delete(id);
      }),
      ...sceneIds.map(async (id) => {
        await deleteLegacyDirectorScene(id);
        pendingLegacySceneCleanupRef.current.delete(id);
      }),
    ]);
  }, []);
  const active = draft.subjects.find((subject) => subject.id === activeSubjectId) ?? null;
  const activeSceneObject =
    draft.sceneObjects.find((object) => object.id === activeSceneObjectId) ?? null;
  const activeStageCamera =
    draft.stageCameras?.find((camera) => camera.id === activeStageCameraId) ?? null;
  const previewStageCamera =
    draft.stageCameras?.find((camera) => camera.id === previewStageCameraId) ??
    draft.stageCameras?.[0] ??
    null;
  const selectedVideoModel = automaticVideoModel();
  const supportingReferences = useMemo(() => supportingDirectorReferenceUrls(draft), [draft]);
  const referenceOverflow = supportingReferences.length > 4;
  const unresolvedImportedModels = draft.subjects.some(
    (subject) => Boolean(subject.modelAssetId) && !subject.modelUrl,
  );
  const modelSubmissionBlocked =
    restoringModels ||
    unresolvedImportedModels ||
    modelLoadStatus.loading > 0 ||
    modelLoadStatus.errors > 0;
  const unresolvedSceneAsset = Boolean(draft.sceneAssetId && !draft.sceneUrl);
  const submissionBlocked = modelSubmissionBlocked || restoringScene || unresolvedSceneAsset;
  const leftPanelHidden = !leftPanelPersistent && !leftDrawerOpen;
  const rightPanelHidden = !rightPanelPersistent && !rightDrawerOpen;

  const openLeftDrawer = useCallback(() => {
    setRightDrawerOpen(false);
    setLeftDrawerOpen(true);
  }, []);

  const openRightDrawer = useCallback(() => {
    setLeftDrawerOpen(false);
    setRightDrawerOpen(true);
  }, []);

  const patchScene = useCallback((patch: Partial<DirectorSceneState>) => {
    setAutoSaveStatus('dirty');
    setDraft((value) => ({ ...value, ...patch }));
  }, []);

  const patchSubject = useCallback((id: string, patch: Partial<DirectorSubjectPlacement>) => {
    setAutoSaveStatus('dirty');
    setDraft((value) => ({
      ...value,
      subjects: value.subjects.map((subject) =>
        subject.id === id
          ? {
              ...subject,
              ...patch,
              ...(typeof patch.bodyAngle === 'number'
                ? { bodyFacing: directorBodyFacingFromAngle(patch.bodyAngle) }
                : {}),
            }
          : subject,
      ),
    }));
  }, []);

  const applyPosePreset = useCallback(
    (id: string, posePreset: DirectorPosePreset) => {
      setIsPlaying(false);
      setPlaybackSeconds(0);
      setMotionPreviewOnly(false);
      setActiveRigJoint(null);
      patchSubject(id, {
        posePreset,
        rigPose: {},
        animationClip: 'none',
      });
    },
    [patchSubject],
  );

  const patchStageCamera = useCallback(
    (id: string, patch: Partial<Omit<DirectorStageCamera, 'id'>>) => {
      setAutoSaveStatus('dirty');
      setDraft((value) => ({
        ...value,
        stageCameras: value.stageCameras?.map((camera) =>
          camera.id === id ? { ...camera, ...patch } : camera,
        ),
      }));
    },
    [],
  );

  const patchSceneObject = useCallback((id: string, patch: Partial<DirectorSceneObject>) => {
    setAutoSaveStatus('dirty');
    setDraft((value) => ({
      ...value,
      sceneObjects: value.sceneObjects.map((object) =>
        object.id === id ? { ...object, ...patch } : object,
      ),
    }));
  }, []);

  const releaseRuntimeUrls = useCallback(() => {
    for (const url of urlsRef.current) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    urlsRef.current = [];
  }, []);

  useEffect(() => {
    if (!isOpen || !node || loadedRef.current === node.id) return;
    loadedRef.current = node.id;
    releaseRuntimeUrls();
    const restored = normalizeDirectorScene(node.data.directorScene);
    restored.stageMode = 'spatial';
    restored.subjects = restored.subjects.map((subject) => ({ ...subject, modelUrl: undefined }));
    if (restored.sceneAssetId) restored.sceneUrl = undefined;
    setDraft(restored);
    setActiveSubjectId(restored.subjects[0]?.id ?? null);
    setActiveRigJoint(null);
    setActiveSceneObjectId(null);
    setActiveStageCameraId(null);
    setPreviewStageCameraId(restored.stageCameras?.[0]?.id ?? null);
    setActiveMotionPathSubjectId(null);
    setPlaybackSeconds(0);
    setSubmitError('');
    setAutoSaveError('');
    setAutoSaveStatus('saved');
    setSubmitting(false);
    setModelLoadStatus({ loading: 0, errors: 0 });
    setRestoringModels(restored.subjects.some((subject) => Boolean(subject.modelAssetId)));
    setRestoringScene(
      Boolean(restored.sceneAssetId || restored.sceneUrl?.startsWith('data:image/')),
    );
    void Promise.all([
      Promise.all(
        restored.subjects.map(async (subject) => {
          if (!subject.modelAssetId) return subject;
          const sourceAssetId = subject.modelAssetId;
          const blob = await loadDirectorModel(sourceAssetId).catch(() => null);
          if (!blob) return subject;
          if (!sourceAssetId.startsWith('asset_')) {
            try {
              const storedModel = await saveDirectorModel(sourceAssetId, blob, {
                project: useCanvasStore.getState().activeProjectId,
                fileName: subject.modelFileName || `${sourceAssetId}.glb`,
              });
              pendingLegacyModelCleanupRef.current.add(sourceAssetId);
              return {
                ...subject,
                modelAssetId: storedModel.id,
                modelUrl: storedModel.url,
              };
            } catch {
              // The verified legacy record remains authoritative until Bridge is available.
            }
          }
          const url = URL.createObjectURL(blob);
          urlsRef.current.push(url);
          return { ...subject, modelUrl: url };
        }),
      ),
      restored.sceneAssetId
        ? loadPanoramaAssets(
            restored.sceneAssetId,
            restored.sceneReferenceAssetId,
            useCanvasStore.getState().activeProjectId,
          ).catch(() => null)
        : restored.sceneUrl?.startsWith('data:image/')
          ? fetch(restored.sceneUrl)
              .then((response) => response.blob())
              .then((blob) => persistPanoramaBlob(blob, useCanvasStore.getState().activeProjectId))
              .catch(() => null)
          : Promise.resolve(null),
    ])
      .then(async ([subjects, sceneResult]) => {
        if (loadedRef.current !== node.id) return;
        const sceneBlob = sceneResult?.panorama;
        const sceneUrl = sceneBlob ? URL.createObjectURL(sceneBlob) : restored.sceneUrl;
        const sceneReferenceUrl = sceneResult
          ? 'sceneReferenceUrl' in sceneResult && typeof sceneResult.sceneReferenceUrl === 'string'
            ? sceneResult.sceneReferenceUrl
            : await readBlobAsDataUrl(sceneResult.reference)
          : restored.sceneReferenceUrl;
        if (sceneUrl) urlsRef.current.push(sceneUrl);
        if (
          sceneResult &&
          'legacySceneAssetId' in sceneResult &&
          typeof sceneResult.legacySceneAssetId === 'string'
        ) {
          pendingLegacySceneCleanupRef.current.add(sceneResult.legacySceneAssetId);
        }
        setDraft((current) => ({
          ...current,
          subjects,
          sceneUrl,
          sceneReferenceUrl,
          ...(sceneResult && 'sceneAssetId' in sceneResult
            ? {
                sceneAssetId: String(sceneResult.sceneAssetId),
              }
            : {}),
          ...(sceneResult &&
          'sceneReferenceAssetId' in sceneResult &&
          typeof sceneResult.sceneReferenceAssetId === 'string'
            ? { sceneReferenceAssetId: sceneResult.sceneReferenceAssetId }
            : {}),
        }));
        if (restored.sceneAssetId && !sceneUrl) {
          setSubmitError(
            t(
              'director3d.error.sceneAssetMissing',
              '本机素材库中的环境贴图已丢失，请重新上传场景图。',
            ),
          );
        }
      })
      .finally(() => {
        if (loadedRef.current === node.id) {
          setRestoringModels(false);
          setRestoringScene(false);
        }
      });
  }, [isOpen, node, releaseRuntimeUrls]);

  useEffect(() => {
    if (isOpen) return;
    loadedRef.current = null;
    releaseRuntimeUrls();
  }, [isOpen, releaseRuntimeUrls]);

  useEffect(() => () => releaseRuntimeUrls(), [releaseRuntimeUrls]);

  const persistDraftAutomatically = useCallback(async () => {
    if (!modalNodeId || loadedRef.current !== modalNodeId) return false;
    setAutoSaveStatus('saving');
    updateNodeData(modalNodeId, {
      directorScene: createPersistentDirectorScene({
        ...draftRef.current,
        stageMode: 'spatial',
      }),
      directorOutputDirty: true,
    });
    const persisted = await flushCanvasPersistence();
    if (persisted) await cleanupCommittedLegacyDirectorMedia().catch(() => undefined);
    setAutoSaveStatus(persisted ? 'saved' : 'error');
    setAutoSaveError(
      persisted
        ? ''
        : t(
            'director3d.error.autoSaveFull',
            '本机 Bridge 未能提交导演场景。更改仍在当前临时会话中，刷新页面会丢失；请检查 Bridge 状态和主机磁盘空间。',
          ),
    );
    return persisted;
  }, [cleanupCommittedLegacyDirectorMedia, modalNodeId, updateNodeData]);

  useEffect(() => {
    if (!isOpen || restoringScene || !modalNodeId || loadedRef.current !== modalNodeId) return;
    setAutoSaveStatus('saving');
    const timeout = window.setTimeout(() => void persistDraftAutomatically(), 600);
    return () => window.clearTimeout(timeout);
  }, [draft, isOpen, modalNodeId, persistDraftAutomatically, restoringScene]);

  useEffect(() => {
    if (!isOpen) return;
    const flushPendingDraft = () => {
      if (document.visibilityState === 'hidden' && autoSaveStatus === 'dirty') {
        void persistDraftAutomatically();
      }
    };
    const flushBeforeUnload = () => {
      if (autoSaveStatus === 'dirty') void persistDraftAutomatically();
    };
    document.addEventListener('visibilitychange', flushPendingDraft);
    window.addEventListener('beforeunload', flushBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', flushPendingDraft);
      window.removeEventListener('beforeunload', flushBeforeUnload);
    };
  }, [autoSaveStatus, isOpen, persistDraftAutomatically]);

  useEffect(() => {
    if (!isPlaying) return;
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setPlaybackSeconds((current) => {
        const next = current + (now - previous) / 1000;
        return next >= draft.duration ? 0 : next;
      });
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draft.duration, isPlaying]);

  const persistScene = useCallback(
    async (sampleCount: number, withSnapshot: boolean, allowFallback = true) => {
      if (!modalNodeId) return null;
      const supportingCount = Math.min(4, supportingDirectorReferenceUrls(draft).length);
      const layoutSampleCount = Math.max(1, Math.min(sampleCount, 5 - supportingCount));
      let finalScene = createPersistentDirectorScene({
        ...draft,
        stageMode: 'spatial',
        animationSampleCount: layoutSampleCount,
        supportingReferenceCount: supportingCount,
      });
      const animationFrames =
        stageRef.current?.captureAnimationFrames(layoutSampleCount).filter(Boolean) ?? [];
      const fallback = node?.data.directorLayoutUrl || node?.data.imageUrl;
      const frames = animationFrames.length
        ? animationFrames
        : allowFallback && fallback
          ? [fallback]
          : [];
      finalScene = { ...finalScene, animationSampleCount: Math.max(1, frames.length) };
      const constraint = buildDirectorConstraintPrompt(finalScene);
      const references = orderedDirectorReferences(
        { ...finalScene, sceneReferenceUrl: draft.sceneReferenceUrl },
        frames,
      ).slice(0, 5);
      if (withSnapshot) takeSnapshot();
      updateNodeData(modalNodeId, {
        directorScene: finalScene,
        directorConstraintPrompt: constraint,
        directorLayoutUrl: frames[0],
        imageUrl: frames[0],
        images: references,
        output: references,
        prompt: finalScene.prompt,
        description: `3D 动画预演 · ${finalScene.subjects.length} 个角色 · ${frames.length} 张关键帧`,
        directorOutputDirty: false,
      });
      propagate(modalNodeId);
      const persisted = await flushCanvasPersistence();
      if (persisted) await cleanupCommittedLegacyDirectorMedia().catch(() => undefined);
      setAutoSaveStatus(persisted ? 'saved' : 'error');
      setAutoSaveError(
        persisted
          ? ''
          : t(
              'director3d.error.saveFull',
              '本机 Bridge 未能持久保存预演。更改仅保留在当前临时会话；请检查 Bridge 状态和主机磁盘空间后重试。',
            ),
      );
      return { finalScene, frames, persisted };
    },
    [
      draft,
      cleanupCommittedLegacyDirectorMedia,
      modalNodeId,
      node?.data.directorLayoutUrl,
      node?.data.imageUrl,
      propagate,
      takeSnapshot,
      updateNodeData,
    ],
  );

  const closeStudio = useCallback(async () => {
    if (submitting) return;
    const persisted = await persistScene(1, false);
    if (persisted && !persisted.persisted) return;
    closeModal();
  }, [closeModal, persistScene, submitting]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !shouldIgnoreStudioShortcut(event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const selectedStageCameraId = activeStageCameraIdRef.current;
        const selectedSceneObjectId = activeSceneObjectIdRef.current;
        const selectedSubjectId = activeSubjectIdRef.current;
        const selectedMotionPathSubjectId = activeMotionPathSubjectIdRef.current;
        if (selectedMotionPathSubjectId) {
          setDraft((value) => ({
            ...value,
            subjects: value.subjects.map((subject) =>
              subject.id === selectedMotionPathSubjectId
                ? { ...subject, motionPath: undefined }
                : subject,
            ),
          }));
          setActiveMotionPathSubjectId(null);
          setAutoSaveStatus('dirty');
        } else if (selectedStageCameraId) {
          setDraft((value) => ({
            ...value,
            stageCameras: value.stageCameras?.filter(
              (camera) => camera.id !== selectedStageCameraId,
            ),
          }));
          setActiveStageCameraId(null);
          setAutoSaveStatus('dirty');
        } else if (selectedSceneObjectId) {
          setDraft((value) => ({
            ...value,
            sceneObjects: value.sceneObjects.filter(
              (object) => object.id !== selectedSceneObjectId,
            ),
          }));
          setActiveSceneObjectId(null);
          setAutoSaveStatus('dirty');
        } else if (selectedSubjectId) {
          setDraft((value) => ({
            ...value,
            subjects: value.subjects.filter((subject) => subject.id !== selectedSubjectId),
          }));
          setActiveSubjectId(null);
          setActiveRigJoint(null);
          setAutoSaveStatus('dirty');
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (leftDrawerOpen && !leftPanelPersistent) {
          setLeftDrawerOpen(false);
          return;
        }
        if (rightDrawerOpen && !rightPanelPersistent) {
          setRightDrawerOpen(false);
          return;
        }
        void closeStudio();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.offsetParent !== null &&
          !element.closest('[inert]') &&
          window.getComputedStyle(element).visibility !== 'hidden',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [
    closeStudio,
    isOpen,
    leftDrawerOpen,
    leftPanelPersistent,
    rightDrawerOpen,
    rightPanelPersistent,
  ]);

  const addBuiltInCharacter = (presetId: DirectorCharacterPresetId) => {
    const preset = getDirectorCharacterPreset(presetId);
    const id = `director-actor-${crypto.randomUUID()}`;
    const index = draft.subjects.length;
    const subject = createDefaultDirectorSubject({
      id,
      sourceNodeId: '',
      label: `${preset.label} ${index + 1}`,
      imageUrl: '',
      characterPreset: preset.id,
      characterColors: { ...preset.colors },
      x: 48 + (index % 3) * 2,
      y: 51,
      depth: 51,
      scale: 100,
      rotation: 0,
    });
    setDraft((value) => ({ ...value, subjects: [...value.subjects, subject] }));
    setActiveSubjectId(id);
    setActiveRigJoint(null);
    setActiveSceneObjectId(null);
    setActiveStageCameraId(null);
    setActiveMotionPathSubjectId(null);
    setInspectorTab('transform');
    openRightDrawer();
    setAutoSaveStatus('dirty');
  };

  const importModels = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const format = directorModelFormatFromFileName(file.name);
      if (!format) {
        setSubmitError(
          t('director3d.error.unsupportedModel', '{file} 不是受支持的 VRM/GLB/FBX 单文件模型。', {
            file: file.name,
          }),
        );
        continue;
      }
      const assetId = `director-model-${crypto.randomUUID()}`;
      const storedModel = await saveDirectorModel(assetId, file, {
        project: useCanvasStore.getState().activeProjectId,
        fileName: file.name,
      });
      const url = storedModel.url;
      const id = `director-model-${crypto.randomUUID()}`;
      const preset = getDirectorCharacterPreset('cinematic-male');
      const subject = createDefaultDirectorSubject({
        id,
        sourceNodeId: '',
        label: file.name.replace(/\.[^.]+$/, ''),
        imageUrl: '',
        modelAssetId: storedModel.id,
        modelUrl: url,
        modelFileName: file.name,
        modelFormat: format,
        characterPreset: preset.id,
        characterColors: { ...preset.colors },
        x: 48 + ((draft.subjects.length + 1) % 3) * 2,
        y: 51,
        depth: 51,
        scale: 100,
        rotation: 0,
      });
      setDraft((value) => ({ ...value, subjects: [...value.subjects, subject] }));
      setActiveSubjectId(id);
      setActiveRigJoint(null);
      setActiveSceneObjectId(null);
      setActiveStageCameraId(null);
      setActiveMotionPathSubjectId(null);
      setInspectorTab('transform');
      openRightDrawer();
      setAutoSaveStatus('dirty');
    }
  };

  const removeSubject = (subjectId: string) => {
    const remainingSubjects = draft.subjects.filter((subject) => subject.id !== subjectId);
    setDraft((value) => ({
      ...value,
      subjects: value.subjects.filter((subject) => subject.id !== subjectId),
    }));
    if (activeSubjectId === subjectId) {
      setActiveSubjectId(remainingSubjects[0]?.id ?? null);
    }
    if (activeRigJoint?.subjectId === subjectId) setActiveRigJoint(null);
    if (activeMotionPathSubjectId === subjectId) setActiveMotionPathSubjectId(null);
    setAutoSaveStatus('dirty');
  };

  const removeActiveSubject = () => {
    if (active) removeSubject(active.id);
  };

  const addSceneObject = (preset: (typeof OBJECT_PRIMITIVES)[number]) => {
    const id = `director-object-${crypto.randomUUID()}`;
    const count = draft.sceneObjects.filter((object) => object.primitive === preset.id).length + 1;
    const index = draft.sceneObjects.length;
    const object: DirectorSceneObject = {
      id,
      label: `${preset.label} ${count}`,
      kind: preset.kind,
      primitive: preset.id,
      x: 46 + (index % 3) * 4,
      y: 48 + (Math.floor(index / 3) % 3) * 4,
      depth: 48 + (Math.floor(index / 3) % 3) * 4,
      height: 0,
      scale: 100,
      scaleX: 100,
      scaleY: 100,
      scaleZ: 100,
      rotationY: 0,
      color: preset.color,
      description: preset.detail,
    };
    setDraft((value) => ({ ...value, sceneObjects: [...value.sceneObjects, object] }));
    setActiveSubjectId(null);
    setActiveSceneObjectId(id);
    setActiveStageCameraId(null);
    setActiveMotionPathSubjectId(null);
    setLeftPanel('objects');
    setShowRig(false);
    setTransformMode('translate');
    openRightDrawer();
    setAutoSaveStatus('dirty');
  };

  const removeSceneObject = (objectId: string) => {
    setDraft((value) => ({
      ...value,
      sceneObjects: value.sceneObjects.filter((object) => object.id !== objectId),
    }));
    if (activeSceneObjectId === objectId) setActiveSceneObjectId(null);
    setAutoSaveStatus('dirty');
  };

  const removeActiveSceneObject = () => {
    if (activeSceneObject) removeSceneObject(activeSceneObject.id);
  };

  const applyShot = (shot: (typeof CAMERA_SHOTS)[number]) => {
    patchScene({
      cameraPreset: shot.id,
      cameraYaw: shot.yaw,
      cameraPitch: getDirectorGroundedCameraPitch(shot.distance, shot.pitch),
      cameraDistance: shot.distance,
    });
    setCameraView('shot');
  };

  const addStageCamera = (
    shot: (typeof CAMERA_SHOTS)[number],
    placement: { x: number; depth: number } = { x: 50, depth: 48 },
  ) => {
    const id = `director-camera-${crypto.randomUUID()}`;
    applyShot(shot);
    setDraft((value) => ({
      ...value,
      stageCameras: [
        ...(value.stageCameras ?? []),
        {
          id,
          label: `CAM ${(value.stageCameras?.length ?? 0) + 1} · ${shot.label}`,
          x: placement.x,
          depth: placement.depth,
          height: 1.6,
          yaw: shot.yaw,
          pitch: shot.pitch,
          distance: shot.distance,
          trackingMode: 'fixed',
        },
      ],
    }));
    setActiveSubjectId(null);
    setActiveSceneObjectId(null);
    setActiveStageCameraId(id);
    setPreviewStageCameraId(id);
    setActiveMotionPathSubjectId(null);
    setLeftPanel('cameras');
    setShowRig(false);
    setTransformMode('translate');
    openRightDrawer();
    setAutoSaveStatus('dirty');
  };

  const removeStageCamera = (cameraId: string) => {
    const remainingCameras = draft.stageCameras?.filter((camera) => camera.id !== cameraId) ?? [];
    setDraft((value) => ({
      ...value,
      stageCameras: value.stageCameras?.filter((camera) => camera.id !== cameraId),
    }));
    if (previewStageCameraId === cameraId) {
      setPreviewStageCameraId(remainingCameras[0]?.id ?? null);
    }
    if (activeStageCameraId === cameraId) setActiveStageCameraId(null);
    setAutoSaveStatus('dirty');
  };

  const removeActiveStageCamera = () => {
    if (activeStageCamera) removeStageCamera(activeStageCamera.id);
  };

  const createMotionPath = (type: DirectorMotionPathType) => {
    if (!active) return;
    if (type === 'pencil' || type === 'pen') return;
    const currentRange = active.motionPath
      ? getDirectorMotionPathRange(active.motionPath)
      : { width: 32, depthRange: 24 };
    patchSubject(active.id, {
      motionPath: createDirectorMotionPath(
        type,
        { x: active.x, depth: active.depth ?? active.y },
        currentRange.width,
        currentRange.depthRange,
      ),
      motion: 'walk-right',
      animationClip:
        active.animationClip === 'none' || active.animationClip === 'idle'
          ? 'walk'
          : active.animationClip,
    });
    setActiveMotionPathSubjectId(active.id);
    setShowRig(false);
    setTransformMode('translate');
  };

  const moveMotionPathAnchor = (
    subject: DirectorSubjectPlacement,
    next: { x?: number; depth?: number },
  ) => {
    const path = subject.motionPath;
    const anchor = path?.points[0];
    if (!path || !anchor) return;
    const movedPath = translateDirectorMotionPath(
      path,
      typeof next.x === 'number' ? next.x - anchor.x : 0,
      typeof next.depth === 'number' ? next.depth - anchor.depth : 0,
    );
    const movedAnchor = movedPath.points[0];
    if (!movedAnchor) return;
    patchSubject(subject.id, {
      x: movedAnchor.x,
      y: movedAnchor.depth,
      depth: movedAnchor.depth,
      motionPath: movedPath,
    });
  };

  const submitToAi = async () => {
    if (!modalNodeId || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitProgress(t('director3d.submit.savingScene', '正在保存导演场景…'));
    setIsPlaying(false);
    let uploadedAssetId: string | undefined;
    try {
      if (submissionBlocked) {
        throw new Error(
          restoringScene
            ? t('director3d.submit.sceneLoading', '环境贴图仍在载入，请等待舞台准备完成后再提交。')
            : unresolvedSceneAsset
              ? t(
                  'director3d.submit.sceneMissing',
                  '环境贴图未能从本机素材库恢复，请重新上传场景图。',
                )
              : modelLoadStatus.errors > 0 || unresolvedImportedModels
                ? t(
                    'director3d.submit.modelFailed',
                    '外部角色模型未能完整载入，请重新导入或移除失败角色后再提交。',
                  )
                : t(
                    'director3d.submit.modelLoading',
                    '外部角色模型仍在载入，请等待舞台准备完成后再提交。',
                  ),
        );
      }
      if (referenceOverflow) {
        throw new Error(
          t(
            'director3d.submit.referenceOverflow',
            'AI 视频最多接收 5 张参考图；请将人物身份图与环境参考合计控制在 4 张以内。',
          ),
        );
      }
      // The playable previsualization is the temporal source of truth. Keep a
      // Keep a single layout frame in the project snapshot; AI submission
      // samples the Bridge-persisted previs video at task time.
      const persisted = await persistScene(1, true, false);
      if (!persisted?.frames.length)
        throw new Error(
          t('director3d.submit.stageNotReadyFrames', 'WebGL 舞台尚未准备好，无法导出动画关键帧。'),
        );
      if (!persisted.persisted)
        throw new Error(
          t(
            'director3d.submit.persistFailed',
            '预演未能由本机 Bridge 持久保存，已阻止创建视频任务；当前更改仅在临时会话中。',
          ),
        );
      setSubmitProgress(t('director3d.submit.recording', '正在按参考机位录制 3D 动画…'));
      const capture = await stageRef.current?.captureAnimationVideo();
      if (!capture)
        throw new Error(
          t('director3d.submit.stageNotReadyVideo', 'WebGL 舞台尚未准备好，无法录制 3D 动画。'),
        );
      const extension = directorPrevisFileExtension(capture.blob.type);
      setSubmitProgress(t('director3d.submit.savingVideo', '正在保存可播放的预演视频…'));
      const stored = await persistVideoFile(
        new File(
          [capture.blob],
          `3d-director-${modalNodeId}-${Date.now().toString(36)}.${extension}`,
          { type: capture.blob.type },
        ),
        activeProjectId,
      );
      uploadedAssetId = stored.bridgeAssetId;
      setSubmitProgress(t('director3d.submit.creatingNode', '正在创建连接的视频任务节点…'));
      const videoNodeId = createVideoFromDirector(modalNodeId, {
        ...stored,
        durationSeconds: capture.durationSeconds,
        cameraLabel: capture.cameraLabel,
      });
      if (!videoNodeId)
        throw new Error(
          t('director3d.submit.createNodeFailed', '无法创建下游 AI 视频任务，请检查画布连接。'),
        );
      if (!(await flushCanvasPersistence())) {
        useCanvasStore.getState().deleteNode(videoNodeId);
        throw new Error(
          t(
            'director3d.submit.nodePersistFailed',
            '视频任务未能由本机 Bridge 持久保存，请检查 Bridge 状态和主机磁盘空间后重试。',
          ),
        );
      }
      uploadedAssetId = undefined;
      setSubmitting(false);
      setSubmitProgress('');
      closeModal();
    } catch (error) {
      if (uploadedAssetId) await deleteBridgeAsset(uploadedAssetId).catch(() => {});
      setSubmitError(
        error instanceof Error
          ? error.message
          : t('director3d.submit.failed', '提交视频任务失败。'),
      );
      setSubmitting(false);
      setSubmitProgress('');
    }
  };

  if (!isOpen || !node) return null;

  const colorValues = active
    ? normalizeDirectorCharacterColors(active.characterColors, active.characterPreset)
    : null;

  const leftTabs: Array<{ id: LeftPanel; label: string }> = [
    { id: 'actors', label: t('director3d.assets.characters', '角色资产') },
    { id: 'objects', label: t('director3d.assets.objects', '物品') },
    { id: 'cameras', label: t('director3d.assets.cameras', '机位') },
    { id: 'scene', label: t('director3d.assets.environment', '环境') },
  ];
  const inspectorTabs: Array<{ id: InspectorTab; label: string; icon: typeof Move }> = [
    { id: 'transform', label: t('director3d.inspector.transform', '变换'), icon: Move },
    { id: 'rig', label: t('director3d.inspector.rig', '骨骼'), icon: Bone },
    { id: 'material', label: t('director3d.inspector.material', '材质'), icon: Palette },
    { id: 'animation', label: t('director3d.inspector.animation', '动画'), icon: Film },
  ];

  return (
    <div
      ref={dialogRef}
      className="director-settings-shell director-three-studio fixed inset-0 z-[1000] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="director-three-title"
    >
      <header className="director-settings-header flex h-12 shrink-0 items-center border-b px-3 min-[900px]:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#eabf35]/12 text-[#eabf35]">
            <Clapperboard className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div id="director-three-title" className="truncate text-sm font-semibold text-white/95">
              {t('director3d.title', '3D 导演台')}
              <span className="ml-2 rounded border border-cyan-300/20 bg-cyan-300/8 px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-cyan-100/80">
                HOLDER 3D PRO
              </span>
            </div>
            <div className="hidden text-[10px] text-white/48 min-[900px]:block">
              {t('director3d.subtitle', 'Humanoid 绑定 · 动画预演 · AI 视频交付')}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-md border border-white/8 bg-black/15 px-2.5 py-1.5 text-[10px] text-white/58 min-[1080px]:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${selectedVideoModel ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            {selectedVideoModel
              ? `${selectedVideoModel.model}`
              : t('director3d.videoModel.selectAfterSubmit', '提交后选择视频模型')}
          </div>
          <button
            type="button"
            onClick={() => void persistScene(1, true)}
            disabled={autoSaveStatus === 'saving'}
            className={`director-settings-action flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:cursor-wait ${autoSaveStatus === 'error' ? 'border-red-300/30 text-red-200' : ''}`}
            aria-live="polite"
            aria-label={
              autoSaveError ||
              (autoSaveStatus === 'saved'
                ? t('director3d.autosave.savedAction', '3D 导演台已自动保存，点击立即保存预演快照')
                : t('director3d.autosave.saveNow', '立即保存 3D 导演台'))
            }
            title={
              autoSaveError ||
              t('director3d.autosave.help', '自动保存已开启；点击可立即保存预演快照')
            }
          >
            {autoSaveStatus === 'saved' ? (
              <Check className="h-3.5 w-3.5 text-emerald-300" />
            ) : autoSaveStatus === 'saving' ? (
              <RotateCcw className="h-3.5 w-3.5 animate-spin text-cyan-200" />
            ) : autoSaveStatus === 'error' ? (
              <X className="h-3.5 w-3.5" />
            ) : null}
            {autoSaveStatus === 'saved'
              ? t('director.autosave.saved', '已自动保存')
              : autoSaveStatus === 'saving'
                ? t('director.autosave.savingShort', '自动保存中')
                : autoSaveStatus === 'error'
                  ? t('director.autosave.retry', '重试保存')
                  : t('director.autosave.waiting', '等待自动保存')}
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeStudio}
            disabled={submitting}
            className="director-settings-action p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('director3d.saveAndClose', '保存并关闭 3D 导演台')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {leftDrawerOpen && (
          <button
            type="button"
            className="absolute inset-0 z-[690] bg-black/55 min-[1280px]:hidden"
            onClick={() => setLeftDrawerOpen(false)}
            aria-label={t('director3d.assets.closeDrawer', '关闭资产抽屉')}
          />
        )}
        <aside
          className={`director-settings-sidebar absolute inset-y-0 left-0 z-[700] flex w-[304px] shrink-0 flex-col border-r transition-transform min-[1280px]:relative min-[1280px]:translate-x-0 ${leftDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
          aria-label={t('director3d.assets.ariaLabel', '场景与资产')}
          aria-hidden={leftPanelHidden}
          inert={leftPanelHidden ? true : undefined}
        >
          <button
            type="button"
            onClick={() => setLeftDrawerOpen(false)}
            className="absolute top-2 right-2 z-10 rounded p-1 text-white/50 min-[1280px]:hidden"
            aria-label={t('director3d.scene.closePanel', '关闭场景面板')}
          >
            <X className="h-4 w-4" />
          </button>

          <div
            className="flex border-b border-[#36363a] px-2 pt-1"
            role="tablist"
            aria-label={t('director3d.assets.categories', '资产类别')}
          >
            {leftTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={leftPanel === tab.id}
                onClick={() => setLeftPanel(tab.id)}
                className={`flex-1 border-b-2 px-1 py-2 text-[11px] ${leftPanel === tab.id ? 'border-[#eabf35] text-white' : 'border-transparent text-white/48 hover:text-white/75'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {leftPanel === 'actors' ? (
              <>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[10px] font-semibold tracking-[0.12em] text-white/48">
                    {t('director3d.characters.builtIn', '内置绑定角色')}
                  </span>
                  <span className="text-[9px] text-emerald-300/75">
                    {t('director3d.characters.limbLink', '四肢联动')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DIRECTOR_CHARACTER_CATALOG_PRESETS.map((preset) => {
                    const display = translatedCharacterPreset(preset, t);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => addBuiltInCharacter(preset.id)}
                        className="director-settings-card group rounded-lg border p-2 text-left hover:border-[#eabf35]/45 hover:bg-white/[0.055]"
                        aria-label={t('director3d.characters.add', '添加 {name}', {
                          name: display.label,
                        })}
                      >
                        <div className="flex h-[92px] items-end justify-center overflow-hidden rounded-md bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.09),transparent_64%)]">
                          <CharacterThumbnail presetId={preset.id} />
                        </div>
                        <div className="mt-2 text-[11px] font-medium text-white/88">
                          {display.label}
                        </div>
                        <div className="mt-0.5 truncate text-[9px] text-white/43">
                          {display.role}
                        </div>
                        <div className="mt-2 flex gap-1">
                          {Object.values(preset.colors).map((color) => (
                            <span
                              key={color}
                              className="h-2 w-2 rounded-full border border-white/15"
                              style={{ background: color }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-[#36363a] pt-3">
                  <label className="director-settings-action flex cursor-pointer items-center justify-center gap-2 px-3 py-2 text-xs text-white/82">
                    <Upload className="h-3.5 w-3.5" />
                    {t('director3d.characters.importModel', '导入 VRM / GLB / FBX')}
                    <input
                      type="file"
                      multiple
                      accept={DIRECTOR_MODEL_FILE_ACCEPT}
                      className="hidden"
                      onChange={(event) => {
                        void importModels(event.currentTarget.files);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <p className="mt-2 text-[10px] leading-4 text-white/42">
                    {t(
                      'director3d.characters.importHint',
                      '模型二进制保存在本机素材库。带内嵌动画的模型会预览首个动作；FBX 请优先使用内嵌贴图。',
                    )}
                  </p>
                </div>

                <div
                  className="director-settings-card mt-3 rounded-md border p-2"
                  data-director-scene-summary="true"
                >
                  <label className="flex items-center gap-2 text-xs text-white/78">
                    <Box className="h-3.5 w-3.5 shrink-0 text-[#eabf35]" />
                    <span className="sr-only">{t('director3d.scene.name', '场景名称')}</span>
                    <input
                      value={draft.sceneName}
                      onChange={(event) => patchScene({ sceneName: event.target.value })}
                      placeholder={t('director.common.untitledScene', '未命名场景')}
                      aria-label={t('director3d.scene.name', '场景名称')}
                      className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/68"
                    />
                    <span className="text-[9px] text-white/42">SCENE</span>
                  </label>
                  <div className="mt-2 space-y-1 border-t border-white/8 pt-2">
                    {draft.subjects.length ? (
                      draft.subjects.map((subject) => (
                        <div
                          key={subject.id}
                          className={`group flex w-full items-center rounded ${subject.id === activeSubjectId ? 'bg-[#eabf35]/12 text-white' : 'text-white/58 hover:bg-white/5 hover:text-white/85'}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSubjectId(subject.id);
                              setActiveSceneObjectId(null);
                              setActiveStageCameraId(null);
                              setActiveMotionPathSubjectId(null);
                              openRightDrawer();
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[11px]"
                          >
                            <UserRound className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{subject.label}</span>
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: subject.characterColors?.accent }}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSubject(subject.id)}
                            className="mr-1 rounded p-1 text-white/28 opacity-60 hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={t('director3d.character.deleteNamed', '删除角色 {name}', {
                              name: subject.label,
                            })}
                            title={t('director3d.character.deleteNamed', '删除角色 {name}', {
                              name: subject.label,
                            })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="px-2 py-1 text-[10px] text-white/42">
                        {t('director3d.characters.empty', '尚未添加角色')}
                      </div>
                    )}
                    {draft.sceneObjects.map((object) => (
                      <div
                        key={object.id}
                        className={`group flex w-full items-center rounded ${object.id === activeSceneObjectId ? 'bg-[#eabf35]/12 text-[#f8dfa0]' : 'text-white/45 hover:bg-white/5 hover:text-white/80'}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubjectId(null);
                            setActiveSceneObjectId(object.id);
                            setActiveStageCameraId(null);
                            setActiveMotionPathSubjectId(null);
                            setLeftPanel('objects');
                            setShowRig(false);
                            openRightDrawer();
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[10px]"
                        >
                          <Box className="h-3 w-3 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{object.label}</span>
                          <span
                            className="h-2 w-2 shrink-0 rounded-full border border-white/15"
                            style={{ background: object.color }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSceneObject(object.id)}
                          className="mr-1 rounded p-1 text-white/28 opacity-60 hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={t('director3d.object.deleteNamed', '删除物品 {name}', {
                            name: object.label,
                          })}
                          title={t('director3d.object.deleteNamed', '删除物品 {name}', {
                            name: object.label,
                          })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {(draft.stageCameras ?? []).map((stageCamera) => (
                      <div
                        key={stageCamera.id}
                        className={`group flex w-full items-center rounded ${stageCamera.id === activeStageCameraId ? 'bg-cyan-300/10 text-cyan-100' : stageCamera.id === previewStageCamera?.id ? 'text-cyan-100/75 hover:bg-white/5' : 'text-white/45 hover:bg-white/5 hover:text-white/80'}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubjectId(null);
                            setActiveSceneObjectId(null);
                            setActiveStageCameraId(stageCamera.id);
                            setPreviewStageCameraId(stageCamera.id);
                            setActiveMotionPathSubjectId(null);
                            setLeftPanel('cameras');
                            setShowRig(false);
                            openRightDrawer();
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[10px]"
                        >
                          <Camera className="h-3 w-3 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{stageCamera.label}</span>
                          {stageCamera.id === previewStageCamera?.id ? (
                            <span className="rounded bg-cyan-300/10 px-1 py-0.5 text-[10px] font-semibold text-cyan-100/75">
                              LIVE
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStageCamera(stageCamera.id)}
                          className="mr-1 rounded p-1 text-white/28 opacity-60 hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={t('director3d.camera.deleteNamed', '删除机位 {name}', {
                            name: stageCamera.label,
                          })}
                          title={t('director3d.camera.deleteNamed', '删除机位 {name}', {
                            name: stageCamera.label,
                          })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : leftPanel === 'objects' ? (
              <div>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[10px] font-semibold tracking-[0.12em] text-white/48">
                    {t('director3d.objects.basic', '3D 基础物品')}
                  </span>
                  <span className="text-[9px] text-[#eac968]/75">
                    {t('director3d.objects.architectureReference', '建筑参考')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {OBJECT_PRIMITIVES.map((preset) => {
                    const display = translatedObjectPrimitive(preset, t);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => addSceneObject(preset)}
                        className="director-settings-card group rounded-lg border p-2 text-left hover:border-[#eabf35]/45 hover:bg-white/[0.055]"
                        aria-label={t('director3d.objects.add', '添加 {name}', {
                          name: display.label,
                        })}
                      >
                        <div className="flex h-[86px] items-center justify-center overflow-hidden rounded-md bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.08),transparent_66%)]">
                          <PrimitiveThumbnail primitive={preset.id} color={preset.color} />
                        </div>
                        <span className="mt-2 block text-[11px] font-medium text-white/88">
                          {display.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[9px] text-white/43">
                          {display.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] leading-4 text-white/42">
                  {t(
                    'director3d.objects.addHint',
                    '添加后可在舞台中选中，使用 G 移动、R 旋转、S 缩放；物品会随预演截图和场景约束提交给 AI。',
                  )}
                </p>
              </div>
            ) : leftPanel === 'scene' ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-[11px] text-white/55">
                    {t('director3d.scene.panorama', '360° 环境贴图')}
                  </div>
                  <label className="director-settings-card flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-xs text-white/75 hover:bg-white/5">
                    <Upload className="h-4 w-4" />
                    {t('director3d.scene.uploadPanorama', '上传全景图片')}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (!file) return;
                        event.currentTarget.value = '';
                        setRestoringScene(true);
                        void persistPanoramaBlob(file, useCanvasStore.getState().activeProjectId)
                          .then(
                            ({
                              sceneAssetId,
                              sceneReferenceAssetId,
                              panorama,
                              sceneReferenceUrl,
                            }) => {
                              const sceneUrl = URL.createObjectURL(panorama);
                              urlsRef.current.push(sceneUrl);
                              patchScene({
                                sceneAssetId,
                                sceneReferenceAssetId,
                                sceneUrl,
                                sceneReferenceUrl,
                                sceneHorizonPitch: 0,
                                scenePanoramaLift: 0,
                                sceneName: draft.sceneName || file.name.replace(/\.[^.]+$/, ''),
                              });
                              setSubmitError('');
                            },
                          )
                          .catch(() =>
                            setSubmitError(
                              t(
                                'director3d.error.panoramaPersist',
                                '全景图片无法写入本机素材库，请更换图片后重试。',
                              ),
                            ),
                          )
                          .finally(() => setRestoringScene(false));
                      }}
                    />
                  </label>
                  {draft.sceneUrl && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-300/15 bg-emerald-300/7 px-2.5 py-2 text-[10px] text-emerald-100/75">
                      <Check className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1">
                        {t('director3d.scene.panoramaReady', '环境贴图已加载到舞台')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (draft.sceneUrl?.startsWith('blob:')) {
                            URL.revokeObjectURL(draft.sceneUrl);
                            urlsRef.current = urlsRef.current.filter(
                              (url) => url !== draft.sceneUrl,
                            );
                          }
                          patchScene({
                            sceneAssetId: undefined,
                            sceneReferenceAssetId: undefined,
                            sceneUrl: undefined,
                            sceneReferenceUrl: undefined,
                            sceneHorizonPitch: 0,
                            scenePanoramaLift: 0,
                          });
                          setSubmitError('');
                        }}
                        className="rounded px-1.5 py-0.5 text-emerald-100/65 hover:bg-white/8 hover:text-white"
                      >
                        {t('director3d.scene.removePanorama', '移除')}
                      </button>
                    </div>
                  )}
                  {draft.sceneUrl && (
                    <label className="mt-3 block text-[10px] text-white/52">
                      <span className="flex justify-between">
                        <span>{t('director3d.scene.lift', '场景抬升')}</span>
                        <span className="font-mono text-white/72">
                          +{Math.round(draft.scenePanoramaLift ?? 0)}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={DIRECTOR_PANORAMA_LIFT_MAX}
                        step={1}
                        value={draft.scenePanoramaLift ?? 0}
                        onChange={(event) =>
                          patchScene({ scenePanoramaLift: Number(event.target.value) })
                        }
                        className="director-range mt-1.5 w-full"
                        aria-label={t('director3d.scene.lift', '场景抬升')}
                      />
                      <span className="mt-1.5 block leading-4 text-white/36">
                        {t(
                          'director3d.scene.liftHint',
                          '纵向校准全景地面投影与网格的贴合位置，不改变人物、物品、路径或机位坐标。',
                        )}
                      </span>
                    </label>
                  )}
                  {draft.sceneUrl && (
                    <label className="mt-3 block text-[10px] text-white/52">
                      <span className="flex justify-between">
                        <span>{t('director3d.scene.horizon', '全景地平线校准')}</span>
                        <span className="font-mono text-white/72">
                          {(draft.sceneHorizonPitch ?? 0) > 0 ? '+' : ''}
                          {Math.round(draft.sceneHorizonPitch ?? 0)}°
                        </span>
                      </span>
                      <input
                        type="range"
                        min={-30}
                        max={30}
                        step={1}
                        value={draft.sceneHorizonPitch ?? 0}
                        onChange={(event) =>
                          patchScene({ sceneHorizonPitch: Number(event.target.value) })
                        }
                        className="director-range mt-1.5 w-full"
                        aria-label={t('director3d.scene.horizon', '全景地平线校准')}
                      />
                      <span className="mt-1.5 block leading-4 text-white/36">
                        {t(
                          'director3d.scene.horizonHint',
                          '导入时自动适配为 2:1（2K 为 2048×1024，4K 为 4096×2048）并优先保留地面；仍可微调到背景地面与网格自然衔接。',
                        )}
                      </span>
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 px-1 text-[10px] font-semibold tracking-[0.12em] text-white/48">
                  {t('director3d.cameras.presets', '镜头预设')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CAMERA_SHOTS.map((shot) => {
                    const display = translatedCameraShot(shot, t);
                    return (
                      <button
                        key={`${shot.label}-${shot.yaw}`}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData(
                            DIRECTOR_CAMERA_PRESET_DRAG_TYPE,
                            cameraShotKey(shot),
                          );
                        }}
                        onClick={() => addStageCamera(shot)}
                        className={`director-settings-card rounded-lg border p-2 text-left ${draft.cameraPreset === shot.id && draft.cameraYaw === shot.yaw ? 'director-settings-card--selected' : 'hover:bg-white/5'}`}
                      >
                        <Camera className="mb-4 h-4 w-4 text-cyan-200/75" />
                        <span className="block text-[11px] text-white/82">{display.label}</span>
                        <span className="mt-1 block text-[9px] text-white/42">
                          {display.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] leading-4 text-white/42">
                  {t(
                    'director3d.cameras.addHint',
                    '点击会在舞台中心创建机位；也可拖到 3D 地板的指定位置。自由环绕只在“导演视角”中使用。',
                  )}
                </p>
              </div>
            )}
          </div>
        </aside>

        <main className="director-settings-content relative min-w-0 flex-1">
          <section className="absolute inset-x-0 top-0 bottom-[138px]">
            {sceneHydrated ? (
              <DirectorThreeStage
                ref={stageRef}
                scene={draft}
                activeSubjectId={activeSubjectId}
                activeRigJoint={activeRigJoint}
                activeSceneObjectId={activeSceneObjectId}
                activeStageCameraId={activeStageCameraId}
                previewStageCameraId={previewStageCamera?.id ?? null}
                activeMotionPathSubjectId={activeMotionPathSubjectId}
                onSubjectSelect={(id) => {
                  if (id !== activeRigJoint?.subjectId) setActiveRigJoint(null);
                  setActiveSubjectId(id);
                  if (id) {
                    setActiveSceneObjectId(null);
                    setActiveStageCameraId(null);
                    setActiveMotionPathSubjectId(null);
                  }
                  if (id) openRightDrawer();
                }}
                onRigJointSelect={(selection) => {
                  setActiveRigJoint(selection);
                  if (!selection) return;
                  setActiveSubjectId(selection.subjectId);
                  setActiveSceneObjectId(null);
                  setActiveStageCameraId(null);
                  setActiveMotionPathSubjectId(null);
                  setInspectorTab('rig');
                  setIsPlaying(false);
                  openRightDrawer();
                }}
                onSceneObjectSelect={(id) => {
                  if (id) setActiveRigJoint(null);
                  setActiveSceneObjectId(id);
                  if (id) {
                    setActiveSubjectId(null);
                    setActiveStageCameraId(null);
                    setActiveMotionPathSubjectId(null);
                    setLeftPanel('objects');
                    setShowRig(false);
                    openRightDrawer();
                  }
                }}
                onStageCameraSelect={(id) => {
                  if (id) setActiveRigJoint(null);
                  setActiveStageCameraId(id);
                  if (id) {
                    setPreviewStageCameraId(id);
                    setActiveSubjectId(null);
                    setActiveSceneObjectId(null);
                    setActiveMotionPathSubjectId(null);
                    setLeftPanel('cameras');
                    setShowRig(false);
                    openRightDrawer();
                  }
                }}
                onMotionPathSelect={(subjectId) => {
                  setActiveMotionPathSubjectId(subjectId);
                  if (!subjectId) return;
                  setActiveSubjectId(subjectId);
                  setActiveRigJoint(null);
                  setActiveSceneObjectId(null);
                  setActiveStageCameraId(null);
                  setInspectorTab('animation');
                  setShowRig(false);
                  setTransformMode('translate');
                  setIsPlaying(false);
                  openRightDrawer();
                }}
                onCameraPresetDrop={(presetKey, placement) => {
                  const shot = CAMERA_SHOTS.find(
                    (candidate) => cameraShotKey(candidate) === presetKey,
                  );
                  if (shot) addStageCamera(shot, placement);
                }}
                onStagePrimaryPointerDown={() => {
                  if (cameraView !== 'shot') return;
                  setCameraView('director');
                  setTransformMode('translate');
                  setShowRig(false);
                  setActiveRigJoint(null);
                }}
                onKeyboardWalkStart={() => {
                  setIsPlaying(false);
                  setMotionPreviewOnly(false);
                  setTransformMode('translate');
                  setShowRig(false);
                  setActiveRigJoint(null);
                }}
                onKeyboardViewPanStart={() => {
                  setCameraView('director');
                  setShowRig(false);
                  setActiveRigJoint(null);
                }}
                onSubjectChange={(id, patch) => patchSubject(id, patch)}
                onObjectChange={patchSceneObject}
                onCameraChange={patchScene}
                onStageCameraChange={patchStageCamera}
                playbackTime={playbackSeconds}
                pathPreviewSubjectId={motionPreviewOnly ? activeSubjectId : null}
                transformMode={transformMode}
                onTransformModeChange={(mode) => {
                  setTransformMode(mode);
                  setShowRig(false);
                  setActiveRigJoint(null);
                  setCameraView('director');
                }}
                cameraView={cameraView}
                showRig={showRig}
                onModelLoadStatusChange={setModelLoadStatus}
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center bg-[#07090d] text-xs text-white/55"
                role="status"
              >
                {t('director3d.stage.loadingModels', '正在载入导演台场景…', { count: 1 })}
              </div>
            )}
          </section>

          <div className="director-viewport-toolbar absolute left-3 right-3 top-3 z-[620] flex items-center justify-between gap-2">
            <div
              className="director-settings-card flex items-center rounded-md border p-1"
              role="toolbar"
              aria-label={t('director3d.stage.tools', '舞台操作工具')}
            >
              <button
                type="button"
                onClick={openLeftDrawer}
                className="director-settings-action mr-1 p-1.5 min-[1280px]:hidden"
                aria-label={t('director3d.assets.openPanel', '打开场景资产面板')}
              >
                <Layers3 className="h-3.5 w-3.5" />
              </button>
              {(
                [
                  ['translate', t('director3d.stage.move', '移动'), Move],
                  ['rotate', t('director3d.stage.rotate', '旋转'), Rotate3D],
                  ['scale', t('director3d.stage.scale', '缩放'), Maximize2],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setCameraView('director');
                    setShowRig(false);
                    setActiveRigJoint(null);
                    setTransformMode(mode);
                    if (mode !== 'translate') setActiveMotionPathSubjectId(null);
                  }}
                  className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] ${cameraView === 'director' && !showRig && transformMode === mode ? 'bg-[#eabf35]/15 text-[#f4d86f]' : 'text-white/55 hover:bg-white/6 hover:text-white'}`}
                  aria-pressed={cameraView === 'director' && !showRig && transformMode === mode}
                  title={t(
                    mode === 'translate'
                      ? 'director3d.stage.toolTitle.move'
                      : mode === 'rotate'
                        ? 'director3d.stage.toolTitle.rotate'
                        : 'director3d.stage.toolTitle.scale',
                    `${label}工具`,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden min-[1080px]:inline">{label}</span>
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-white/10" />
              <button
                type="button"
                disabled={!activeSubjectId}
                onClick={() => {
                  if (!activeSubjectId) return;
                  setCameraView('director');
                  setActiveMotionPathSubjectId(null);
                  setShowRig(true);
                  setIsPlaying(false);
                }}
                className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-30 ${cameraView === 'director' && showRig ? 'bg-cyan-300/10 text-cyan-100' : 'text-white/55 hover:text-white'}`}
                aria-pressed={cameraView === 'director' && showRig}
                title={
                  activeSubjectId
                    ? t('director3d.stage.rigToolHelp', '关节工具：拖动人偶圆点调整骨骼姿势')
                    : t('director3d.stage.selectCharacterFirst', '请先选择一个角色')
                }
              >
                <Bone className="h-3.5 w-3.5" />
                <span className="hidden min-[1080px]:inline">
                  {t('director3d.stage.joint', '关节')}
                </span>
              </button>
            </div>

            <div
              className="director-settings-card flex rounded-md border p-1"
              role="tablist"
              aria-label={t('director3d.stage.views', '舞台视角')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={cameraView === 'director'}
                onClick={() => setCameraView('director')}
                className={`rounded px-2.5 py-1.5 text-[10px] ${cameraView === 'director' ? 'bg-white/10 text-white' : 'text-white/48'}`}
              >
                {t('director3d.stage.directorView', '导演视角')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cameraView === 'shot'}
                onClick={() => setCameraView('shot')}
                title={
                  previewStageCamera
                    ? t('director3d.stage.previewCamera', '使用 {name} 的真实取景画面', {
                        name: previewStageCamera.label,
                      })
                    : t('director3d.stage.mainCamera', '使用主镜头取景画面')
                }
                className={`rounded px-2.5 py-1.5 text-[10px] ${cameraView === 'shot' ? 'bg-white/10 text-white' : 'text-white/48'}`}
              >
                {t('director3d.stage.cameraView', '镜头视角')}
                {previewStageCamera ? ` · ${previewStageCamera.label}` : ''}
              </button>
              <button
                type="button"
                onClick={openRightDrawer}
                className="ml-1 border-l border-white/10 p-1.5 text-white/55 min-[1080px]:hidden"
                aria-label={t('director3d.inspector.open', '打开角色检查器')}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="absolute right-3 bottom-[150px] z-[640] flex max-w-[360px] flex-col items-end gap-2">
            {submitError && (
              <div
                className="rounded-lg border border-red-300/25 bg-red-950/85 px-3 py-2 text-[11px] leading-4 text-red-100 shadow-xl backdrop-blur-md"
                role="alert"
              >
                {submitError}
              </div>
            )}
            <button
              type="button"
              onClick={() => void submitToAi()}
              disabled={
                submitting || draft.subjects.length === 0 || submissionBlocked || referenceOverflow
              }
              className="director-settings-action-primary flex min-h-10 min-w-[156px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.42)] disabled:cursor-not-allowed disabled:opacity-45"
              title={
                submissionBlocked
                  ? restoringScene
                    ? t('director3d.videoTask.waitScene', '等待环境贴图完成载入')
                    : unresolvedSceneAsset
                      ? t('director3d.videoTask.reuploadScene', '环境贴图未恢复，请重新上传')
                      : t('director3d.videoTask.waitModels', '等待所有外部角色模型完成载入')
                  : referenceOverflow
                    ? t(
                        'director3d.videoTask.referenceLimit',
                        '人物身份图与环境参考合计不能超过 4 张',
                      )
                    : t(
                        'director3d.videoTask.readyHint',
                        '录制当前参考机位的 3D 动画并创建视频任务节点',
                      )
              }
            >
              <Film className="h-4 w-4" />
              {submitting
                ? submitProgress || t('director3d.videoTask.exporting', '正在导出…')
                : t('director3d.videoTask.create', '创建视频任务')}
            </button>
          </div>

          <div className="director-settings-sidebar absolute inset-x-0 bottom-0 z-[650] h-[138px] border-t text-white">
            <div className="flex h-10 items-center gap-2 border-b border-[#36363a] px-3">
              <button
                type="button"
                onClick={() => setIsPlaying((value) => !value)}
                className="director-settings-action flex h-7 w-7 items-center justify-center"
                aria-label={
                  isPlaying
                    ? t('director3d.timeline.pause', '暂停动画')
                    : t('director3d.timeline.play', '播放动画')
                }
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaybackSeconds(0);
                  setIsPlaying(false);
                }}
                className="director-settings-action flex h-7 w-7 items-center justify-center"
                aria-label={t('director3d.timeline.restart', '回到时间轴起点')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <span className="rounded border border-white/10 bg-black/20 px-2 py-1 font-mono text-[10px] tabular-nums text-white/72">
                {playbackSeconds.toFixed(2)}s / {draft.duration.toFixed(2)}s
              </span>
              <span className="ml-auto text-[9px] tracking-[0.12em] text-white/38">
                {t('director3d.timeline.title', '24 FPS · ANIMATION TIMELINE')}
              </span>
            </div>
            <div className="grid h-[98px] grid-cols-[148px_1fr] overflow-hidden">
              <div className="overflow-y-auto border-r border-[#36363a] py-2">
                {draft.subjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => {
                      setActiveSubjectId(subject.id);
                      setActiveSceneObjectId(null);
                      setActiveStageCameraId(null);
                      setActiveMotionPathSubjectId(null);
                    }}
                    className={`flex h-7 w-full items-center gap-2 px-3 text-left text-[10px] ${activeSubjectId === subject.id ? 'bg-white/6 text-white' : 'text-white/48'}`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: subject.characterColors?.accent }}
                    />
                    <span className="truncate">{subject.label}</span>
                  </button>
                ))}
              </div>
              <div className="relative overflow-x-hidden overflow-y-auto px-3 py-2">
                <div className="absolute inset-x-3 top-1 flex justify-between text-[10px] text-white/32">
                  {[0, 0.25, 0.5, 0.75, 1].map((point) => (
                    <span key={point}>
                      {(draft.duration * point).toFixed(point === 0 || point === 1 ? 0 : 1)}s
                    </span>
                  ))}
                </div>
                {draft.subjects.map((subject, index) => (
                  <div
                    key={subject.id}
                    className="absolute left-3 right-3 h-5"
                    style={{ top: 22 + index * 25 }}
                  >
                    <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-white/7" />
                    <div
                      className="absolute inset-x-0 top-1 h-3 rounded border opacity-65"
                      style={{
                        borderColor: subject.characterColors?.accent,
                        background: `${subject.characterColors?.accent}20`,
                      }}
                    />
                    {motionPointMarkers(subject.motionPath?.points).map((marker) => (
                      <span
                        key={marker.id}
                        className="absolute top-1 h-3 w-1 rounded-sm bg-white/75"
                        style={{ left: marker.left }}
                      />
                    ))}
                  </div>
                ))}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, draft.duration)}
                  step={1 / 24}
                  value={playbackSeconds}
                  onChange={(event) => {
                    setPlaybackSeconds(Number(event.target.value));
                    setIsPlaying(false);
                  }}
                  className="director-timeline-scrubber absolute inset-x-3 top-4 z-20 h-[78px] cursor-ew-resize"
                  aria-label={t('director3d.timeline.playhead', '动画播放头')}
                  aria-valuetext={t(
                    'director3d.timeline.position',
                    '{current} 秒，共 {duration} 秒',
                    {
                      current: playbackSeconds.toFixed(2),
                      duration: draft.duration.toFixed(2),
                    },
                  )}
                />
                <span
                  className="director-playhead pointer-events-none absolute top-4 bottom-1 z-10 w-px bg-[#eabf35] shadow-[0_0_7px_rgba(234,191,53,0.65)]"
                  style={{
                    left: `calc(0.75rem + ${(playbackSeconds / Math.max(0.01, draft.duration)) * (100 - 3)}%)`,
                  }}
                />
              </div>
            </div>
          </div>
        </main>

        {rightDrawerOpen && (
          <button
            type="button"
            className="absolute inset-0 z-[690] bg-black/55 min-[1080px]:hidden"
            onClick={() => setRightDrawerOpen(false)}
            aria-label={t('director3d.inspector.closeOverlay', '关闭角色检查器遮罩')}
          />
        )}
        <aside
          className={`director-settings-sidebar absolute inset-y-0 right-0 z-[700] flex w-[336px] shrink-0 flex-col border-l transition-transform min-[1080px]:relative min-[1080px]:translate-x-0 ${rightDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
          aria-label={t('director3d.inspector.ariaLabel', '角色检查器')}
          aria-hidden={rightPanelHidden}
          inert={rightPanelHidden ? true : undefined}
        >
          <header className="flex h-11 items-center border-b border-[#36363a] px-3">
            {activeSceneObject ? (
              <Box className="mr-2 h-4 w-4 text-[#f6c744]" />
            ) : activeStageCamera ? (
              <Camera className="mr-2 h-4 w-4 text-[#f6c744]" />
            ) : (
              <SlidersHorizontal className="mr-2 h-4 w-4 text-white/55" />
            )}
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/88">
              {activeSceneObject?.label ?? activeStageCamera?.label ?? active?.label ?? 'INSPECTOR'}
            </span>
            <button
              type="button"
              onClick={() => setRightDrawerOpen(false)}
              className="rounded p-1 text-white/50 min-[1080px]:hidden"
              aria-label={t('director3d.inspector.close', '关闭角色检查器')}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {activeSceneObject ? (
            <div className="flex items-center gap-2 border-b border-[#36363a] bg-[#eabf35]/5 px-4 py-2 text-[10px] text-[#f8dfa0]/72">
              <Move className="h-3.5 w-3.5" />
              {t('director3d.inspector.objectHint', '3D 物品 · 可在视口变换')}
            </div>
          ) : activeStageCamera ? (
            <div className="flex items-center gap-2 border-b border-[#36363a] bg-cyan-300/5 px-4 py-2 text-[10px] text-cyan-100/72">
              <Move className="h-3.5 w-3.5" />
              {t('director3d.inspector.cameraHint', '舞台机位 · 可在视口拖动')}
            </div>
          ) : (
            <div
              className="grid grid-cols-4 border-b border-[#36363a] px-1"
              role="tablist"
              aria-label={t('director3d.inspector.characterProperties', '角色属性')}
            >
              {inspectorTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === tab.id}
                    onClick={() => setInspectorTab(tab.id)}
                    className={`flex flex-col items-center gap-1 border-b-2 py-2 text-[9px] ${inspectorTab === tab.id ? 'border-[#eabf35] text-white' : 'border-transparent text-white/42 hover:text-white/75'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activeSceneObject ? (
              <div className="space-y-4">
                <div className="director-settings-card flex items-center gap-3 rounded-lg border p-3">
                  <PrimitiveThumbnail
                    primitive={activeSceneObject.primitive ?? 'cube'}
                    color={activeSceneObject.color ?? '#c9682b'}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white/82">
                      {(() => {
                        const preset = OBJECT_PRIMITIVES.find(
                          (item) => item.id === (activeSceneObject.primitive ?? 'cube'),
                        );
                        return preset
                          ? translatedObjectPrimitive(preset, t).label
                          : t('director3d.object.defaultName', '正方体');
                      })()}
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-white/42">
                      {t('director3d.object.referenceHint', '建筑与空间布局参考体')}
                    </div>
                  </div>
                </div>
                <label className="block text-[11px] text-white/55">
                  {t('director3d.object.name', '物品名称')}
                  <input
                    value={activeSceneObject.label}
                    onChange={(event) =>
                      patchSceneObject(activeSceneObject.id, { label: event.target.value })
                    }
                    className="director-settings-input mt-1.5 h-9 w-full border px-3 text-xs text-white outline-none"
                  />
                </label>
                <div>
                  <div className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-white/42">
                    TRANSFORM
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['x', t('director3d.object.positionX', '位置 X'), activeSceneObject.x],
                        [
                          'depth',
                          t('director3d.object.positionZ', '位置 Z'),
                          activeSceneObject.depth ?? activeSceneObject.y,
                        ],
                      ] as const
                    ).map(([key, label, value]) => (
                      <label
                        key={key}
                        className="director-settings-input rounded-md border px-2 py-1.5 text-[9px] text-white/42"
                      >
                        {label}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(value)}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            patchSceneObject(activeSceneObject.id, {
                              [key]: next,
                              ...(key === 'depth' ? { y: next } : {}),
                            });
                          }}
                          className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block text-[11px] text-white/55">
                  <span className="flex justify-between">
                    <span>{t('director3d.object.lift', '物品抬升')}</span>
                    <span className="font-mono text-white/72">
                      +{(activeSceneObject.height ?? 0).toFixed(1)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={0.1}
                    value={activeSceneObject.height ?? 0}
                    onChange={(event) =>
                      patchSceneObject(activeSceneObject.id, {
                        height: Number(event.target.value),
                      })
                    }
                    className="director-range mt-2 w-full"
                    aria-label={t('director3d.object.lift', '物品抬升')}
                  />
                  <span className="mt-1.5 block text-[9px] leading-4 text-white/36">
                    {t(
                      'director3d.object.liftHint',
                      '横向拖动拉杆，使物品沿舞台 Y 轴离地，不改变 X/Z 位置。',
                    )}
                  </span>
                </label>
                <label className="block text-[11px] text-white/55">
                  <span className="flex justify-between">
                    <span>{t('director3d.object.rotation', '水平旋转')}</span>
                    <span>{Math.round(activeSceneObject.rotationY ?? 0)}°</span>
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={activeSceneObject.rotationY ?? 0}
                    onChange={(event) =>
                      patchSceneObject(activeSceneObject.id, {
                        rotationY: Number(event.target.value),
                      })
                    }
                    className="director-range mt-2 w-full"
                    aria-label={t('director3d.object.rotationAria', '物品水平旋转')}
                  />
                </label>
                <label className="block text-[11px] text-white/55">
                  <span className="flex justify-between">
                    <span>{t('director3d.object.uniformScale', '统一缩放')}</span>
                    <span>{(activeSceneObject.scale / 100).toFixed(2)}×</span>
                  </span>
                  <input
                    type="range"
                    min={20}
                    max={1000}
                    step={10}
                    value={activeSceneObject.scale}
                    onChange={(event) =>
                      patchSceneObject(activeSceneObject.id, { scale: Number(event.target.value) })
                    }
                    className="director-range mt-2 w-full"
                    aria-label={t('director3d.object.uniformScaleAria', '物品统一缩放')}
                  />
                </label>
                <div className="space-y-3 rounded-md border border-cyan-300/12 bg-cyan-300/[0.035] p-2.5">
                  <div className="text-[10px] font-semibold tracking-[0.12em] text-white/42">
                    {t('director3d.object.axisScale', '建筑三轴尺寸')}
                  </div>
                  {(
                    [
                      [
                        'scaleX',
                        t('director3d.object.widthX', '宽度 X'),
                        activeSceneObject.scaleX ?? 100,
                        2000,
                      ],
                      [
                        'scaleY',
                        t('director3d.object.heightY', '高度 Y'),
                        activeSceneObject.scaleY ?? 100,
                        5000,
                      ],
                      [
                        'scaleZ',
                        t('director3d.object.depthZ', '深度 Z'),
                        activeSceneObject.scaleZ ?? 100,
                        2000,
                      ],
                    ] as const
                  ).map(([key, label, value, max]) => (
                    <label key={key} className="block text-[10px] text-white/52">
                      <span className="flex justify-between">
                        <span>{label}</span>
                        <span className="font-mono text-white/72">{(value / 100).toFixed(1)}×</span>
                      </span>
                      <input
                        type="range"
                        min={10}
                        max={max}
                        step={10}
                        value={value}
                        onChange={(event) =>
                          patchSceneObject(activeSceneObject.id, {
                            [key]: Number(event.target.value),
                          })
                        }
                        className="director-range mt-1.5 w-full"
                        aria-label={t('director3d.object.dimensionAria', '物品{name}', {
                          name: label,
                        })}
                      />
                    </label>
                  ))}
                  <p className="text-[9px] leading-4 text-white/36">
                    {t(
                      'director3d.object.dimensionHint',
                      '高度最多 50×，并可与统一缩放叠加到基础高度 500×；舞台 S 工具也支持 X / Y / Z 三轴缩放。',
                    )}
                  </p>
                </div>
                <label className="director-settings-card flex items-center gap-3 rounded-md border px-3 py-2">
                  <input
                    type="color"
                    value={activeSceneObject.color ?? '#c9682b'}
                    onChange={(event) =>
                      patchSceneObject(activeSceneObject.id, { color: event.target.value })
                    }
                    className="director-color-input h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label={t('director3d.object.colorAria', '物品颜色')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-white/78">
                      {t('director3d.object.materialColor', '材质颜色')}
                    </span>
                    <span className="block font-mono text-[9px] uppercase text-white/38">
                      {activeSceneObject.color ?? '#c9682b'}
                    </span>
                  </span>
                </label>
                <label className="block text-[11px] text-white/55">
                  {t('director3d.object.description', '建筑与场景说明')}
                  <textarea
                    value={activeSceneObject.description}
                    onChange={(event) =>
                      patchSceneObject(activeSceneObject.id, { description: event.target.value })
                    }
                    placeholder={t(
                      'director3d.object.descriptionPlaceholder',
                      '例如：位于角色后方，作为建筑入口，不随镜头移动',
                    )}
                    className="director-settings-input mt-1.5 h-20 w-full resize-none border p-2.5 text-xs leading-5 text-white outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={removeActiveSceneObject}
                  className="director-settings-action flex w-full items-center justify-center gap-2 py-2 text-[11px] text-red-200/75"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('director3d.object.delete', '删除物品')}
                </button>
              </div>
            ) : activeStageCamera ? (
              <div className="space-y-4">
                <label className="block text-[11px] text-white/55">
                  {t('director3d.camera.name', '机位名称')}
                  <input
                    value={activeStageCamera.label}
                    onChange={(event) =>
                      patchStageCamera(activeStageCamera.id, { label: event.target.value })
                    }
                    className="director-settings-input mt-1.5 h-9 w-full border px-3 text-xs text-white outline-none"
                  />
                </label>

                <div>
                  <div className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-white/42">
                    {t('director3d.camera.mode', '拍摄模式')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={(activeStageCamera.trackingMode ?? 'fixed') === 'fixed'}
                      onClick={() =>
                        patchStageCamera(activeStageCamera.id, {
                          trackingMode: 'fixed',
                          trackingSubjectId: undefined,
                        })
                      }
                      className={`director-settings-card rounded-lg border px-3 py-2.5 text-xs ${(activeStageCamera.trackingMode ?? 'fixed') === 'fixed' ? 'director-settings-card--selected text-yellow-100' : 'text-white/65 hover:bg-white/5'}`}
                    >
                      {t('director3d.camera.fixed', '固定机位')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={activeStageCamera.trackingMode === 'follow-subject'}
                      disabled={draft.subjects.length === 0}
                      onClick={() =>
                        patchStageCamera(activeStageCamera.id, {
                          trackingMode: 'follow-subject',
                          trackingSubjectId:
                            activeStageCamera.trackingSubjectId ?? draft.subjects[0]?.id,
                        })
                      }
                      className={`director-settings-card rounded-lg border px-3 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-35 ${activeStageCamera.trackingMode === 'follow-subject' ? 'director-settings-card--selected text-yellow-100' : 'text-white/65 hover:bg-white/5'}`}
                    >
                      {t('director3d.camera.follow', '跟随拍摄')}
                    </button>
                  </div>
                  {activeStageCamera.trackingMode === 'follow-subject' ? (
                    <label className="mt-3 block text-[11px] text-white/55">
                      {t('director3d.camera.followTarget', '跟随目标角色')}
                      <select
                        aria-label={t('director3d.camera.followTarget', '跟随目标角色')}
                        value={activeStageCamera.trackingSubjectId ?? draft.subjects[0]?.id ?? ''}
                        onChange={(event) =>
                          patchStageCamera(activeStageCamera.id, {
                            trackingSubjectId: event.target.value,
                          })
                        }
                        className="director-settings-input mt-1.5 h-9 w-full border px-3 text-xs text-white outline-none"
                      >
                        {draft.subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.label}
                          </option>
                        ))}
                      </select>
                      <span className="mt-2 block text-[10px] leading-4 text-cyan-50/58">
                        {t(
                          'director3d.camera.followHint',
                          '机位保持当前相对距离，随根节点路径同步移动，并持续朝向所选角色。',
                        )}
                      </span>
                    </label>
                  ) : null}
                </div>

                <div>
                  <div className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-white/42">
                    POSITION
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['x', 'X', activeStageCamera.x, 0, 100, 1],
                        ['height', 'Y', activeStageCamera.height, 0.35, 8, 0.1],
                        ['depth', 'Z', activeStageCamera.depth, 0, 100, 1],
                      ] as const
                    ).map(([key, label, value, min, max, step]) => (
                      <label
                        key={key}
                        className="director-settings-input rounded-md border px-2 py-1.5 text-[9px] text-white/42"
                      >
                        {t('director3d.camera.position', '位置 {axis}', { axis: label })}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          value={Number(value.toFixed(step < 1 ? 1 : 0))}
                          onChange={(event) =>
                            patchStageCamera(activeStageCamera.id, {
                              [key]: Number(event.target.value),
                            })
                          }
                          className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-white/38">
                    {t(
                      'director3d.camera.positionHint',
                      '视口中使用 G 拖动机位；Y 轴控制摄影机高度。',
                    )}
                  </p>
                </div>

                {(
                  [
                    [
                      'yaw',
                      t('director3d.camera.yaw', '水平角度'),
                      activeStageCamera.yaw,
                      -180,
                      180,
                      '°',
                    ],
                    [
                      'pitch',
                      t('director3d.camera.pitch', '俯仰角度'),
                      activeStageCamera.pitch,
                      -35,
                      55,
                      '°',
                    ],
                    [
                      'distance',
                      t('director3d.camera.range', '取景范围'),
                      activeStageCamera.distance,
                      20,
                      100,
                      '%',
                    ],
                  ] as const
                ).map(([key, label, value, min, max, suffix]) => (
                  <label key={key} className="block text-[11px] text-white/55">
                    <span className="flex justify-between">
                      <span>{label}</span>
                      <span className="font-mono text-white/72">
                        {Math.round(value)}
                        {suffix}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={value}
                      onChange={(event) =>
                        patchStageCamera(activeStageCamera.id, {
                          [key]: Number(event.target.value),
                        })
                      }
                      className="director-range mt-2 w-full"
                      aria-label={label}
                    />
                  </label>
                ))}

                <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-3 text-[10px] leading-5 text-cyan-50/58">
                  {t(
                    'director3d.camera.transformHint',
                    'R 仅旋转机位水平朝向；俯仰可在此精确调节。取景范围越小越接近人物，越大画面越宽、景物显得越远。S 可直接调整范围，亮黄色箭头表示拍摄方向。',
                  )}
                </div>
                <button
                  type="button"
                  onClick={removeActiveStageCamera}
                  className="director-settings-action flex w-full items-center justify-center gap-2 py-2 text-[11px] text-red-200/75"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('director3d.camera.delete', '删除机位')}
                </button>
              </div>
            ) : !active ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <UserRound className="h-8 w-8 text-white/18" />
                <p className="mt-3 text-xs text-white/45">
                  {t('director3d.character.empty', '从资产库添加角色，或在舞台中选择一个角色。')}
                </p>
              </div>
            ) : inspectorTab === 'transform' ? (
              <div className="space-y-4">
                <label className="block text-[11px] text-white/55">
                  {t('director3d.character.name', '角色名称')}
                  <input
                    value={active.label}
                    onChange={(event) => patchSubject(active.id, { label: event.target.value })}
                    className="director-settings-input mt-1.5 h-9 w-full border px-3 text-xs text-white outline-none"
                  />
                </label>
                <div>
                  <div className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-white/42">
                    TRANSFORM
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['x', t('director3d.character.positionX', '位置 X'), active.x, 0, 100],
                        [
                          'height',
                          t('director3d.character.positionY', '位置 Y'),
                          active.height ?? 0,
                          0,
                          50,
                        ],
                        [
                          'depth',
                          t('director3d.character.positionZ', '位置 Z'),
                          active.depth ?? active.y,
                          0,
                          100,
                        ],
                      ] as const
                    ).map(([key, label, value, min, max]) => (
                      <label
                        key={key}
                        className="director-settings-input rounded-md border px-2 py-1.5 text-[9px] text-white/42"
                      >
                        {label}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={key === 'height' ? 0.1 : 1}
                          value={key === 'height' ? Number(value.toFixed(1)) : Math.round(value)}
                          onChange={(event) =>
                            patchSubject(active.id, { [key]: Number(event.target.value) })
                          }
                          className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block text-[11px] text-white/55">
                  <span className="flex justify-between">
                    <span>{t('director3d.character.rotationY', '旋转 Y')}</span>
                    <span>
                      {active.motionPath
                        ? t('director3d.character.pathControlled', '路径自动')
                        : `${Math.round(active.bodyAngle)}°`}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={active.bodyAngle}
                    disabled={Boolean(active.motionPath)}
                    onChange={(event) =>
                      patchSubject(active.id, { bodyAngle: Number(event.target.value) })
                    }
                    className="director-range mt-2 w-full disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={
                      active.motionPath
                        ? t('director3d.character.rotationPathAria', '旋转 Y 由路径自动控制')
                        : t('director3d.character.rotationY', '旋转 Y')
                    }
                  />
                </label>
                <label className="block text-[11px] text-white/55">
                  <span className="flex justify-between">
                    <span>{t('director3d.character.uniformScale', '统一缩放')}</span>
                    <span>{(active.scale / 100).toFixed(2)}×</span>
                  </span>
                  <input
                    type="range"
                    min={55}
                    max={170}
                    value={active.scale}
                    onChange={(event) =>
                      patchSubject(active.id, { scale: Number(event.target.value) })
                    }
                    className="director-range mt-2 w-full"
                  />
                </label>
                <button
                  type="button"
                  onClick={removeActiveSubject}
                  className="director-settings-action flex w-full items-center justify-center gap-2 py-2 text-[11px] text-red-200/75"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('director3d.character.remove', '移除角色')}
                </button>
              </div>
            ) : inspectorTab === 'rig' ? (
              active.modelAssetId ? (
                <div className="rounded-lg border border-amber-300/20 bg-amber-300/7 p-3 text-[10px] leading-5 text-amber-100/72">
                  {t(
                    'director3d.character.importRigHint',
                    '导入模型暂不开放通用骨骼映射。当前保留模型自带骨骼与动画，避免错误关节映射破坏姿势；内置角色可使用完整肩肘、髋膝联动。',
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white/82">
                        {t('director3d.rig.title', 'Humanoid 骨骼')}
                      </div>
                      <div className="mt-0.5 text-[9px] text-white/42">
                        {t('director3d.rig.hint', '直接拖动舞台上的关节圆点，或使用下方精确滑杆')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => patchSubject(active.id, { linkLimbs: !active.linkLimbs })}
                      className={`director-settings-action flex min-w-[92px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[9px] ${active.linkLimbs !== false ? 'director-settings-card--selected text-white' : 'text-white/50'}`}
                      aria-pressed={active.linkLimbs !== false}
                    >
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span>{t('director3d.rig.mirror', '镜像联动')}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POSE_PRESETS.map((pose) => {
                      const displayLabel = translatedPoseLabel(pose, t);
                      return (
                        <button
                          key={pose.id}
                          type="button"
                          onClick={() => applyPosePreset(active.id, pose.id)}
                          className={`director-settings-action flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[10px] ${active.posePreset === pose.id ? 'director-pose-preset--selected director-settings-card--selected text-white' : 'text-white/62'}`}
                          aria-pressed={active.posePreset === pose.id}
                          aria-label={t('director3d.rig.applyPose', '应用 {name} 姿势', {
                            name: displayLabel,
                          })}
                        >
                          {active.posePreset === pose.id && <Check className="h-3.5 w-3.5" />}
                          {displayLabel}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="mt-2 flex items-center gap-1.5 text-[11px] text-[#f6d66b]"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]" />
                    {t('director3d.rig.currentPose', '当前姿势：')}
                    {(() => {
                      const pose = POSE_PRESETS.find((item) => item.id === active.posePreset);
                      return pose
                        ? translatedPoseLabel(pose, t)
                        : t(POSE_PRESET_DISPLAY_KEYS.stand.labelKey, '自然站立');
                    })()}
                  </div>
                  <div className="mt-4 space-y-3 border-t border-[#36363a] pt-4">
                    {DIRECTOR_RIG_JOINTS.map((joint) => {
                      const value = active.rigPose?.[joint.id] ?? 0;
                      const displayLabel = translatedJointLabel(joint, t);
                      const selected =
                        activeRigJoint?.subjectId === active.id &&
                        activeRigJoint.joint === joint.id;
                      return (
                        <label
                          key={joint.id}
                          className={`block rounded-md border px-2.5 py-2 text-[10px] ${selected ? 'border-[#eabf35]/55 bg-[#eabf35]/8 text-white/82' : 'border-transparent text-white/52'}`}
                          onPointerDown={() =>
                            setActiveRigJoint({ subjectId: active.id, joint: joint.id })
                          }
                        >
                          <span className="flex justify-between">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-[#facc15]' : 'bg-white/28'}`}
                              />
                              {displayLabel}
                            </span>
                            <span>{Math.round(value)}°</span>
                          </span>
                          <input
                            type="range"
                            min={joint.min}
                            max={joint.max}
                            value={value}
                            onChange={(event) =>
                              patchSubject(active.id, {
                                rigPose: patchLinkedDirectorJoint(
                                  active.rigPose,
                                  joint.id as DirectorRigJoint,
                                  Number(event.target.value),
                                  active.linkLimbs !== false,
                                ),
                              })
                            }
                            className="director-range mt-1.5 w-full"
                            aria-label={t('director3d.rig.adjustJoint', '调节 {name}', {
                              name: displayLabel,
                            })}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => applyPosePreset(active.id, 'stand')}
                    className="director-settings-action mt-4 w-full py-2 text-[10px] text-white/62"
                  >
                    {t('director3d.rig.reset', '重置骨骼姿势')}
                  </button>
                </div>
              )
            ) : inspectorTab === 'material' && colorValues ? (
              <div>
                <div className="mb-4">
                  <div className="text-xs font-semibold text-white/82">
                    {t('director3d.material.title', '角色材质配色')}
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-white/42">
                    {active.modelAssetId
                      ? t(
                          'director3d.material.importedHint',
                          '导入模型当前提供整体服装染色；其余色槽仅作为 AI 视频材质约束。',
                        )
                      : t(
                          'director3d.material.builtInHint',
                          '配色会实时更新预演模型，并作为硬性约束提交给视频模型。',
                        )}
                  </p>
                </div>
                <div className="space-y-2">
                  {COLOR_SLOTS.map((slot) => {
                    const displayLabel = translatedColorSlotLabel(slot, t);
                    return (
                      <label
                        key={slot.id}
                        className="director-settings-card flex items-center gap-3 rounded-md border px-3 py-2"
                      >
                        <input
                          type="color"
                          value={colorValues[slot.id]}
                          disabled={Boolean(active.modelAssetId && slot.id !== 'outfit')}
                          onChange={(event) =>
                            patchSubject(active.id, {
                              characterColors: { ...colorValues, [slot.id]: event.target.value },
                            })
                          }
                          className="director-color-input h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                          aria-label={t('director3d.material.colorAria', '{name}颜色', {
                            name: displayLabel,
                          })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] text-white/78">{displayLabel}</span>
                          <span className="block font-mono text-[10px] uppercase text-white/38">
                            {colorValues[slot.id]}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-[#36363a] pt-4">
                  <div className="mb-2 text-[9px] text-white/48">
                    {t('director3d.material.quickPalette', '快速应用角色调色板')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DIRECTOR_CHARACTER_CATALOG_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          patchSubject(active.id, {
                            characterColors: { ...preset.colors },
                          })
                        }
                        className="director-settings-card rounded-md border p-2 text-left hover:border-[#eabf35]/35"
                      >
                        <span className="block text-[10px] text-white/72">
                          {translatedCharacterPreset(preset, t).label}
                        </span>
                        <span className="mt-2 flex gap-1">
                          {Object.values(preset.colors).map((color) => (
                            <span
                              key={color}
                              className="h-3 w-3 rounded-full border border-white/15"
                              style={{ background: color }}
                            />
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : active.modelAssetId ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-white/82">
                    {t('director3d.animation.embeddedTitle', '模型内嵌动画')}
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-white/42">
                    {t(
                      'director3d.animation.embeddedHint',
                      '舞台播放 GLB/VRM/FBX 的首个内嵌动画片段。当前可调播放速度；动作片段选择、镜像循环和手动关节仅适用于内置角色。',
                    )}
                  </p>
                </div>
                <label className="block text-[10px] text-white/52">
                  <span className="flex justify-between">
                    <span>{t('director3d.animation.speed', '播放速度')}</span>
                    <span>{(active.animationSpeed ?? 1).toFixed(2)}×</span>
                  </span>
                  <input
                    type="range"
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={active.animationSpeed ?? 1}
                    onChange={(event) =>
                      patchSubject(active.id, { animationSpeed: Number(event.target.value) })
                    }
                    className="director-range mt-1.5 w-full"
                  />
                </label>
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <div className="text-xs font-semibold text-white/82">
                    {t('director3d.animation.clipTitle', '动画片段')}
                  </div>
                  <div className="mt-0.5 text-[9px] text-white/42">
                    {t('director3d.animation.clipHint', '确定性循环动作 + 根节点路径')}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DIRECTOR_ANIMATION_CLIPS.map((clip) => {
                    const display = translatedAnimationClip(clip, t);
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => patchSubject(active.id, { animationClip: clip.id })}
                        className={`director-settings-card rounded-md border p-2 text-left ${active.animationClip === clip.id ? 'director-settings-card--selected' : ''}`}
                        title={display.description}
                      >
                        <span className="block text-[10px] text-white/78">{display.label}</span>
                        <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-white/38">
                          {display.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label className="mt-4 block text-[10px] text-white/52">
                  <span className="flex justify-between">
                    <span>{t('director3d.animation.speed', '播放速度')}</span>
                    <span>{(active.animationSpeed ?? 1).toFixed(2)}×</span>
                  </span>
                  <input
                    type="range"
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={active.animationSpeed ?? 1}
                    onChange={(event) =>
                      patchSubject(active.id, { animationSpeed: Number(event.target.value) })
                    }
                    className="director-range mt-1.5 w-full"
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-[10px] text-white/58">
                  <input
                    type="checkbox"
                    checked={active.animationLoop !== false}
                    onChange={(event) =>
                      patchSubject(active.id, { animationLoop: event.target.checked })
                    }
                    className="accent-[#eabf35]"
                  />
                  {t('director3d.animation.loopToShot', '按镜头时长循环动画')}
                </label>
                <div className="mt-4 border-t border-[#36363a] pt-4">
                  <div className="mb-2 flex items-center justify-between text-[10px] text-white/52">
                    <span>{t('director3d.path.title', '根节点运动路径')}</span>
                    <button
                      type="button"
                      onClick={() => setMotionPreviewOnly((value) => !value)}
                      className="text-white/55 hover:text-white"
                      aria-label={
                        motionPreviewOnly
                          ? t('director3d.path.showAll', '显示角色与路径')
                          : t('director3d.path.showOnly', '仅显示运动路径')
                      }
                    >
                      {motionPreviewOnly ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {DIRECTOR_MOTION_PATH_OPTIONS.map(({ id: type, label, detail }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => createMotionPath(type)}
                        className={`director-settings-card rounded border px-1.5 py-2 text-left ${active.motionPath?.type === type ? 'director-settings-card--selected' : ''}`}
                        aria-pressed={active.motionPath?.type === type}
                      >
                        <span className="block text-[10px] text-white/75">
                          {translatedMotionPathLabel(type, label, t)}
                        </span>
                        <span className="mt-0.5 block text-[9px] text-white/35">
                          {translatedMotionPathDetail(type, detail, t)}
                        </span>
                      </button>
                    ))}
                  </div>
                  {active.motionPath && (
                    <div className="mt-3 space-y-3 rounded-md border border-violet-300/15 bg-violet-300/7 p-2.5 text-[10px] text-violet-100/72">
                      <div className="flex items-center justify-between">
                        <span>
                          {translatedMotionPathLabel(
                            active.motionPath.type,
                            DIRECTOR_MOTION_PATH_LABELS[active.motionPath.type],
                            t,
                          )}{' '}
                          ·{' '}
                          {t('director3d.path.points', '{count} 点', {
                            count: active.motionPath.points.length,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            patchSubject(active.id, { motionPath: undefined });
                            setActiveMotionPathSubjectId(null);
                          }}
                          className="underline"
                        >
                          {t('director3d.path.clear', '清除')}
                        </button>
                      </div>
                      {(() => {
                        const motionPath = active.motionPath;
                        const range = getDirectorMotionPathRange(motionPath);
                        const anchor = motionPath.points[0] ?? {
                          x: active.x,
                          depth: active.depth ?? active.y,
                        };
                        return (
                          <div className="space-y-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMotionPathSubjectId(active.id);
                                setShowRig(false);
                                setTransformMode('translate');
                                setMotionPreviewOnly(false);
                              }}
                              className={`director-settings-action w-full px-2.5 py-2 text-left ${activeMotionPathSubjectId === active.id ? 'director-settings-card--selected' : ''}`}
                              aria-pressed={activeMotionPathSubjectId === active.id}
                            >
                              {activeMotionPathSubjectId === active.id
                                ? t(
                                    'director3d.path.selectedHint',
                                    '路径已在舞台选中 · 拖动 X / Z 箭头移动',
                                  )
                                : t('director3d.path.selectHint', '在舞台中选中并移动路径')}
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="director-settings-input rounded-md border px-2 py-1.5 text-white/52">
                                {t('director3d.path.positionX', '位置 X')}
                                <input
                                  type="number"
                                  min={4}
                                  max={96}
                                  step={0.5}
                                  value={Number(anchor.x.toFixed(1))}
                                  onChange={(event) =>
                                    moveMotionPathAnchor(active, {
                                      x: Number(event.target.value),
                                    })
                                  }
                                  className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                                />
                              </label>
                              <label className="director-settings-input rounded-md border px-2 py-1.5 text-white/52">
                                {t('director3d.path.positionZ', '位置 Z')}
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  value={Number(anchor.depth.toFixed(1))}
                                  onChange={(event) =>
                                    moveMotionPathAnchor(active, {
                                      depth: Number(event.target.value),
                                    })
                                  }
                                  className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                                />
                              </label>
                            </div>
                            <label className="block text-[10px] text-white/52">
                              <span className="flex justify-between">
                                <span>{t('director3d.path.width', '路径宽度')}</span>
                                <span>
                                  {Math.round(range.width)}% · 约 {Math.round(range.width * 1.6)}m
                                </span>
                              </span>
                              <input
                                type="range"
                                min={DIRECTOR_MOTION_PATH_RANGE_MIN}
                                max={DIRECTOR_MOTION_PATH_RANGE_MAX}
                                step={1}
                                value={range.width}
                                onChange={(event) =>
                                  patchSubject(active.id, {
                                    motionPath: resizeDirectorMotionPath(
                                      motionPath,
                                      Number(event.target.value),
                                      range.depthRange,
                                    ),
                                  })
                                }
                                className="director-range mt-1 w-full"
                                aria-label={t('director3d.path.widthAria', '路径宽度')}
                              />
                            </label>
                            <label className="block text-[9px] text-white/52">
                              <span className="flex justify-between">
                                <span>{t('director3d.path.depth', '前后范围')}</span>
                                <span>
                                  {Math.round(range.depthRange)}% · 约{' '}
                                  {Math.round(range.depthRange * 1.6)}m
                                </span>
                              </span>
                              <input
                                type="range"
                                min={DIRECTOR_MOTION_PATH_RANGE_MIN}
                                max={DIRECTOR_MOTION_PATH_RANGE_MAX}
                                step={1}
                                value={range.depthRange}
                                onChange={(event) =>
                                  patchSubject(active.id, {
                                    motionPath: resizeDirectorMotionPath(
                                      motionPath,
                                      range.width,
                                      Number(event.target.value),
                                    ),
                                  })
                                }
                                className="director-range mt-1 w-full"
                                aria-label={t('director3d.path.depthAria', '路径前后范围')}
                              />
                            </label>
                          </div>
                        );
                      })()}
                      <p className="leading-4 text-white/38">
                        {t(
                          'director3d.path.collisionHint',
                          '角色会按路径长度匀速移动，面部、躯干和四肢始终跟随前进方向；墙体和实体建筑会阻挡根节点，避免人物穿墙。',
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <footer className="border-t border-[#36363a] p-3">
            <label className="block text-[9px] text-white/48">
              <span className="flex justify-between">
                <span>{t('director3d.videoTask.duration', '镜头时长')}</span>
                <span>
                  {t('director.common.seconds', '{count} 秒', {
                    count: draft.duration.toFixed(0),
                  })}
                </span>
              </span>
              <input
                type="range"
                min={1}
                max={15}
                value={draft.duration}
                onChange={(event) => {
                  const duration = Number(event.target.value);
                  patchScene({ duration });
                  setPlaybackSeconds((current) => Math.min(current, duration));
                }}
                className="director-range mt-1.5 w-full"
              />
            </label>
          </footer>
        </aside>

        <div className="director-viewport-warning absolute inset-0 z-[900] hidden flex-col items-center justify-center bg-[#111114] px-8 text-center max-[899px]:flex">
          <Clapperboard className="h-10 w-10 text-[#eabf35]" />
          <div className="mt-4 text-base font-semibold text-white">
            {t('director3d.viewport.tooNarrow', '3D 导演台需要更宽的桌面窗口')}
          </div>
          <p className="mt-2 max-w-md text-xs leading-5 text-white/55">
            {t(
              'director3d.viewport.tooNarrowDescription',
              '请把窗口扩展到至少 900px，以同时使用 WebGL 舞台、骨骼检查器和动画时间轴。当前预演已自动保存。',
            )}
          </p>
          <button
            type="button"
            onClick={closeStudio}
            className="director-settings-action mt-5 px-4 py-2 text-xs"
          >
            {t('director3d.viewport.backToCanvas', '返回画布')}
          </button>
        </div>
      </div>
    </div>
  );
}
