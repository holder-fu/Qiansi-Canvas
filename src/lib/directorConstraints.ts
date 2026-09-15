import type {
  DirectorBodyFacing,
  DirectorCameraMovement,
  DirectorCameraPreset,
  DirectorCameraSpeed,
  DirectorHeadDirection,
  DirectorSceneState,
  DirectorSceneObject,
  DirectorSceneObjectKind,
  DirectorSceneObjectPrimitive,
  DirectorSubjectMotion,
  DirectorSubjectPlacement,
} from '../canvas/nodeTypes';
import {
  DIRECTOR_ANIMATION_CLIPS,
  directorAnimationSampleTimes,
  directorAnimationLabel,
  getDirectorCharacterPreset,
  normalizeDirectorCharacterColors,
  normalizeDirectorRigPose,
} from './directorCharacters';
import {
  DIRECTOR_MOTION_PATH_LABELS,
  migrateDirectorMotionPathToExpandedStage,
  normalizeDirectorMotionPath,
} from './directorMotionPath';
import { getDirectorGroundedCameraPitch } from './directorStage';
import { normalizeDirectorSubjectFrameShape } from './directorSubjectFrame';

export const DIRECTOR_CAMERA_LABELS: Record<DirectorCameraPreset, string> = {
  'wide-front': '正面全景',
  'medium-front': '正面中景',
  closeup: '人物特写',
  'low-angle': '低角度仰拍',
  'high-angle': '高角度俯拍',
  'over-shoulder': '过肩镜头',
  profile: '侧面机位',
};

export const DIRECTOR_BODY_FACING_LABELS: Record<DirectorBodyFacing, string> = {
  front: '正面朝向镜头',
  'front-left': '左前45°',
  'left-profile': '左侧身90°',
  back: '背对镜头',
  'right-profile': '右侧身90°',
  'front-right': '右前45°',
};

export const DIRECTOR_BODY_FACING_ANGLES: Record<DirectorBodyFacing, number> = {
  front: 0,
  'front-left': -45,
  'left-profile': -90,
  back: 180,
  'right-profile': 90,
  'front-right': 45,
};

export function directorBodyFacingFromAngle(angle: number): DirectorBodyFacing {
  const normalized = Math.max(-180, Math.min(180, angle));
  if (normalized <= -68) return normalized <= -135 ? 'back' : 'left-profile';
  if (normalized < -23) return 'front-left';
  if (normalized <= 22) return 'front';
  if (normalized < 68) return 'front-right';
  return normalized >= 135 ? 'back' : 'right-profile';
}

const DIRECTOR_BODY_FACING_PROMPTS: Record<DirectorBodyFacing, string> = {
  front: '身体正面朝向镜头（front-facing）',
  'front-left': '身体转向画面左前方45度（三分之四侧身，three-quarter view facing screen-left）',
  'left-profile': '身体朝画面左侧90度（完整左侧身，left profile body）',
  back: '身体背对镜头（back view），不要自动转为正面',
  'right-profile': '身体朝画面右侧90度（完整右侧身，right profile body）',
  'front-right': '身体转向画面右前方45度（三分之四侧身，three-quarter view facing screen-right）',
};

export const DIRECTOR_HEAD_DIRECTION_LABELS: Record<DirectorHeadDirection, string> = {
  'follow-body': '跟随身体',
  camera: '看向镜头',
  left: '看向画面左侧',
  right: '看向画面右侧',
  up: '抬头',
  down: '低头',
};

export const DIRECTOR_SUBJECT_MOTION_LABELS: Record<DirectorSubjectMotion, string> = {
  still: '原地表演',
  'walk-left': '向画面左侧移动',
  'walk-right': '向画面右侧移动',
  'move-forward': '向场景深处移动',
  'move-backward': '从场景深处靠近',
  'approach-camera': '走向镜头',
  'turn-around': '完成转身',
};

export const DIRECTOR_CAMERA_MOVEMENT_LABELS: Record<DirectorCameraMovement, string> = {
  static: '固定镜头',
  'push-in': '缓慢推近',
  'pull-out': '逐渐拉远',
  'pan-left': '向左摇摄',
  'pan-right': '向右摇摄',
  'orbit-left': '向左环绕',
  'orbit-right': '向右环绕',
  tracking: '平移跟拍',
  handheld: '克制手持',
  'crane-up': '升降镜头上升',
  'crane-down': '升降镜头下降',
};

const DIRECTOR_CAMERA_MOVEMENT_PROMPTS: Record<DirectorCameraMovement, string> = {
  static: '摄影机固定，画面稳定，不进行无关运镜',
  'push-in': '摄影机稳定向主体推近（dolly in），逐渐缩短景别',
  'pull-out': '摄影机稳定后移拉远（dolly out），逐渐揭示环境',
  'pan-left': '摄影机在固定机位向画面左侧平滑摇摄（pan left）',
  'pan-right': '摄影机在固定机位向画面右侧平滑摇摄（pan right）',
  'orbit-left': '摄影机围绕主体向左平滑环绕，持续保持主体构图',
  'orbit-right': '摄影机围绕主体向右平滑环绕，持续保持主体构图',
  tracking: '摄影机与主体保持相对距离进行平移跟拍，背景产生自然视差',
  handheld: '使用幅度克制的手持跟随，保持主体清晰，避免剧烈随机晃动',
  'crane-up': '摄影机从低位平稳升高，逐步揭示人物和场景空间关系',
  'crane-down': '摄影机从高位平稳下降并靠近主体，最终稳定落位',
};

export const DIRECTOR_CAMERA_SPEED_LABELS: Record<DirectorCameraSpeed, string> = {
  slow: '缓慢',
  normal: '正常',
  fast: '快速',
};

export const DIRECTOR_SCENE_OBJECT_KIND_LABELS: Record<DirectorSceneObjectKind, string> = {
  landmark: '固定结构',
  furniture: '家具',
  prop: '道具/物品',
  decoration: '环境装饰',
};

export const DIRECTOR_SCENE_OBJECT_PRIMITIVE_LABELS: Record<DirectorSceneObjectPrimitive, string> =
  {
    cube: '正方体',
    sphere: '球体',
    cylinder: '圆柱体',
    cone: '圆锥体',
    wall: '墙体',
    pillar: '建筑立柱',
    arch: '拱门',
    stairs: '台阶',
  };

const DEFAULT_SUBJECT_INTENT = {
  bodyFacing: 'front' as const,
  bodyAngle: 0,
  bodyTarget: '',
  headDirection: 'follow-body' as const,
  gazeTarget: '',
  motion: 'still' as const,
  action: '',
  emotion: '',
  posePreset: 'stand' as const,
  poseLean: 0,
  headTilt: 0,
  headTurn: 0,
};

export function createDefaultDirectorScene(): DirectorSceneState {
  return {
    schemaVersion: 14,
    stageMode: 'flat',
    subjects: [],
    sceneName: '',
    sceneObjects: [],
    sceneHorizonPitch: 0,
    scenePanoramaLift: 0,
    cameraPreset: 'medium-front',
    cameraMovement: 'static',
    cameraSpeed: 'slow',
    cameraYaw: 0,
    cameraPitch: 12,
    cameraDistance: 65,
    stageCameras: [],
    duration: 5,
    animationSampleCount: 3,
    startFrame: '',
    endFrame: '',
    negativePrompt: '不要新增人物，不要交换人物身份，不要改变服装，不要瞬移，不要无关镜头切换。',
    lockSubjectCount: true,
    forbidExtraSubjects: true,
    preserveIdentity: true,
    preservePositions: true,
    constraintStrength: 80,
    prompt: '',
    backgroundActors: [],
  };
}

export function createDefaultDirectorSubject(
  subject: Omit<
    DirectorSubjectPlacement,
    | 'bodyFacing'
    | 'bodyAngle'
    | 'bodyTarget'
    | 'headDirection'
    | 'gazeTarget'
    | 'motion'
    | 'action'
    | 'emotion'
  >,
): DirectorSubjectPlacement {
  const characterPreset = getDirectorCharacterPreset(subject.characterPreset).id;
  return {
    ...subject,
    ...DEFAULT_SUBJECT_INTENT,
    frameShape: normalizeDirectorSubjectFrameShape(subject.frameShape),
    height:
      typeof subject.height === 'number' && Number.isFinite(subject.height)
        ? Math.max(0, Math.min(50, subject.height))
        : 0,
    characterPreset,
    characterColors: normalizeDirectorCharacterColors(subject.characterColors, characterPreset),
    rigPose: normalizeDirectorRigPose(subject.rigPose),
    linkLimbs: subject.linkLimbs ?? true,
    animationClip: subject.animationClip ?? 'idle',
    animationSpeed: subject.animationSpeed ?? 1,
    animationLoop: subject.animationLoop ?? true,
  };
}

export function normalizeDirectorScene(scene: DirectorSceneState | undefined): DirectorSceneState {
  const defaults = createDefaultDirectorScene();
  if (!scene) return defaults;
  const sourceSchemaVersion = typeof scene.schemaVersion === 'number' ? scene.schemaVersion : 0;
  const expandsSpatialCoordinates = scene.stageMode === 'spatial' && sourceSchemaVersion < 13;
  const expandedCoordinate = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, 50 + (value - 50) / 10));
  const cameraDistance =
    typeof scene.cameraDistance === 'number' && Number.isFinite(scene.cameraDistance)
      ? Math.max(5, Math.min(1000, scene.cameraDistance))
      : defaults.cameraDistance;
  return {
    ...defaults,
    ...scene,
    schemaVersion: 14,
    stageMode: scene.stageMode === 'spatial' ? 'spatial' : 'flat',
    sceneAssetId:
      typeof scene.sceneAssetId === 'string' && scene.sceneAssetId ? scene.sceneAssetId : undefined,
    sceneReferenceAssetId:
      typeof scene.sceneReferenceAssetId === 'string' && scene.sceneReferenceAssetId
        ? scene.sceneReferenceAssetId
        : undefined,
    sceneReferenceUrl:
      typeof scene.sceneReferenceUrl === 'string' && scene.sceneReferenceUrl
        ? scene.sceneReferenceUrl
        : undefined,
    sceneHorizonPitch:
      typeof scene.sceneHorizonPitch === 'number' && Number.isFinite(scene.sceneHorizonPitch)
        ? Math.max(-30, Math.min(30, scene.sceneHorizonPitch))
        : 0,
    scenePanoramaLift:
      typeof scene.scenePanoramaLift === 'number' && Number.isFinite(scene.scenePanoramaLift)
        ? Math.max(0, Math.min(30, scene.scenePanoramaLift))
        : 0,
    subjects: Array.isArray(scene.subjects)
      ? scene.subjects.map((subject) => {
          const characterPreset = getDirectorCharacterPreset(subject.characterPreset).id;
          const animationClip = DIRECTOR_ANIMATION_CLIPS.some(
            (clip) => clip.id === subject.animationClip,
          )
            ? subject.animationClip
            : 'idle';
          const rawX =
            typeof subject.x === 'number' && Number.isFinite(subject.x)
              ? Math.max(5, Math.min(95, subject.x))
              : 50;
          const rawY =
            typeof subject.y === 'number' && Number.isFinite(subject.y)
              ? Math.max(10, Math.min(92, subject.y))
              : 55;
          const rawDepth =
            typeof subject.depth === 'number' && Number.isFinite(subject.depth)
              ? Math.max(0, Math.min(100, subject.depth))
              : Math.max(0, Math.min(100, rawY));
          const motionPath = expandsSpatialCoordinates
            ? migrateDirectorMotionPathToExpandedStage(subject.motionPath)
            : normalizeDirectorMotionPath(subject.motionPath);
          const migratedAnchor = motionPath?.points[0];
          const x = expandsSpatialCoordinates
            ? (migratedAnchor?.x ?? expandedCoordinate(rawX, 5, 95))
            : rawX;
          const depth = expandsSpatialCoordinates
            ? (migratedAnchor?.depth ?? expandedCoordinate(rawDepth, 0, 100))
            : rawDepth;
          return {
            ...DEFAULT_SUBJECT_INTENT,
            ...subject,
            frameShape: normalizeDirectorSubjectFrameShape(subject.frameShape),
            characterPreset,
            characterColors: normalizeDirectorCharacterColors(
              subject.characterColors,
              characterPreset,
            ),
            rigPose: normalizeDirectorRigPose(subject.rigPose),
            linkLimbs: subject.linkLimbs !== false,
            animationClip,
            animationSpeed:
              typeof subject.animationSpeed === 'number' && Number.isFinite(subject.animationSpeed)
                ? Math.max(0.25, Math.min(2, subject.animationSpeed))
                : 1,
            animationLoop: subject.animationLoop !== false,
            motionPath,
            x,
            y: expandsSpatialCoordinates ? depth : rawY,
            scale:
              typeof subject.scale === 'number' && Number.isFinite(subject.scale)
                ? Math.max(30, Math.min(300, subject.scale))
                : 120,
            bodyAngle:
              typeof subject.bodyAngle === 'number' && Number.isFinite(subject.bodyAngle)
                ? Math.max(-180, Math.min(180, subject.bodyAngle))
                : DIRECTOR_BODY_FACING_ANGLES[subject.bodyFacing ?? 'front'],
            depth,
            height:
              typeof subject.height === 'number' && Number.isFinite(subject.height)
                ? Math.max(0, Math.min(50, subject.height))
                : 0,
            poseLean:
              typeof subject.poseLean === 'number'
                ? Math.max(-35, Math.min(35, subject.poseLean))
                : 0,
            headTilt:
              typeof subject.headTilt === 'number'
                ? Math.max(-45, Math.min(45, subject.headTilt))
                : 0,
            headTurn:
              typeof subject.headTurn === 'number'
                ? Math.max(-90, Math.min(90, subject.headTurn))
                : 0,
          };
        })
      : [],
    sceneName: typeof scene.sceneName === 'string' ? scene.sceneName : '',
    sceneObjects: Array.isArray(scene.sceneObjects)
      ? scene.sceneObjects.flatMap((object) => {
          if (!object || typeof object !== 'object') return [];
          const candidate = object as Partial<DirectorSceneObject>;
          if (typeof candidate.label !== 'string' || !candidate.label.trim()) return [];
          return [
            {
              id:
                typeof candidate.id === 'string' && candidate.id
                  ? candidate.id
                  : `director-object-${candidate.label}`,
              label: candidate.label,
              kind:
                candidate.kind === 'landmark' ||
                candidate.kind === 'furniture' ||
                candidate.kind === 'prop' ||
                candidate.kind === 'decoration'
                  ? candidate.kind
                  : 'prop',
              primitive:
                candidate.primitive === 'cube' ||
                candidate.primitive === 'sphere' ||
                candidate.primitive === 'cylinder' ||
                candidate.primitive === 'cone' ||
                candidate.primitive === 'wall' ||
                candidate.primitive === 'pillar' ||
                candidate.primitive === 'arch' ||
                candidate.primitive === 'stairs'
                  ? candidate.primitive
                  : 'cube',
              x:
                typeof candidate.x === 'number' && Number.isFinite(candidate.x)
                  ? expandsSpatialCoordinates
                    ? expandedCoordinate(candidate.x, 4, 96)
                    : Math.max(4, Math.min(96, candidate.x))
                  : 50,
              y:
                typeof candidate.y === 'number' && Number.isFinite(candidate.y)
                  ? expandsSpatialCoordinates
                    ? expandedCoordinate(candidate.y, 10, 92)
                    : Math.max(10, Math.min(92, candidate.y))
                  : 55,
              depth:
                typeof candidate.depth === 'number' && Number.isFinite(candidate.depth)
                  ? expandsSpatialCoordinates
                    ? expandedCoordinate(candidate.depth, 0, 100)
                    : Math.max(0, Math.min(100, candidate.depth))
                  : typeof candidate.y === 'number' && Number.isFinite(candidate.y)
                    ? expandsSpatialCoordinates
                      ? expandedCoordinate(candidate.y, 0, 100)
                      : Math.max(0, Math.min(100, candidate.y))
                    : 55,
              height:
                typeof candidate.height === 'number' && Number.isFinite(candidate.height)
                  ? Math.max(0, Math.min(50, candidate.height))
                  : 0,
              scale:
                typeof candidate.scale === 'number' && Number.isFinite(candidate.scale)
                  ? Math.max(20, Math.min(1000, candidate.scale))
                  : 100,
              scaleX:
                typeof candidate.scaleX === 'number' && Number.isFinite(candidate.scaleX)
                  ? Math.max(10, Math.min(2000, candidate.scaleX))
                  : 100,
              scaleY:
                typeof candidate.scaleY === 'number' && Number.isFinite(candidate.scaleY)
                  ? Math.max(10, Math.min(5000, candidate.scaleY))
                  : 100,
              scaleZ:
                typeof candidate.scaleZ === 'number' && Number.isFinite(candidate.scaleZ)
                  ? Math.max(10, Math.min(2000, candidate.scaleZ))
                  : 100,
              rotationY:
                typeof candidate.rotationY === 'number' && Number.isFinite(candidate.rotationY)
                  ? Math.max(-180, Math.min(180, candidate.rotationY))
                  : 0,
              color:
                typeof candidate.color === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.color)
                  ? candidate.color.toLowerCase()
                  : candidate.kind === 'landmark'
                    ? '#d5a936'
                    : '#c9682b',
              description: typeof candidate.description === 'string' ? candidate.description : '',
            } satisfies DirectorSceneObject,
          ];
        })
      : [],
    backgroundActors: Array.isArray(scene.backgroundActors)
      ? scene.backgroundActors.flatMap((actor, index) => {
          if (!actor || typeof actor !== 'object') return [];
          const candidate = actor as {
            id?: unknown;
            label?: unknown;
            x?: unknown;
            y?: unknown;
            scale?: unknown;
            description?: unknown;
          };
          return [
            {
              id:
                typeof candidate.id === 'string' && candidate.id
                  ? candidate.id
                  : `director-background-${index + 1}`,
              label:
                typeof candidate.label === 'string' && candidate.label.trim()
                  ? candidate.label.trim()
                  : '群演',
              x:
                typeof candidate.x === 'number' && Number.isFinite(candidate.x)
                  ? Math.max(5, Math.min(95, candidate.x))
                  : 50,
              y:
                typeof candidate.y === 'number' && Number.isFinite(candidate.y)
                  ? Math.max(10, Math.min(92, candidate.y))
                  : 55,
              scale:
                typeof candidate.scale === 'number' && Number.isFinite(candidate.scale)
                  ? Math.max(30, Math.min(300, candidate.scale))
                  : 65,
              description: typeof candidate.description === 'string' ? candidate.description : '',
            },
          ];
        })
      : [],
    cameraMovement:
      scene.cameraMovement && scene.cameraMovement in DIRECTOR_CAMERA_MOVEMENT_LABELS
        ? scene.cameraMovement
        : defaults.cameraMovement,
    cameraSpeed:
      scene.cameraSpeed && scene.cameraSpeed in DIRECTOR_CAMERA_SPEED_LABELS
        ? scene.cameraSpeed
        : defaults.cameraSpeed,
    cameraYaw:
      typeof scene.cameraYaw === 'number' && Number.isFinite(scene.cameraYaw)
        ? Math.max(-180, Math.min(180, scene.cameraYaw))
        : defaults.cameraYaw,
    cameraPitch:
      sourceSchemaVersion < 10 &&
      scene.cameraPreset === 'wide-front' &&
      scene.cameraYaw === 0 &&
      scene.cameraPitch === 12 &&
      cameraDistance === 82
        ? 0
        : typeof scene.cameraPitch === 'number' && Number.isFinite(scene.cameraPitch)
          ? getDirectorGroundedCameraPitch(cameraDistance, scene.cameraPitch)
          : defaults.cameraPitch,
    cameraDistance,
    stageCameras: Array.isArray(scene.stageCameras)
      ? scene.stageCameras
          .filter(
            (camera) => camera && typeof camera.id === 'string' && typeof camera.label === 'string',
          )
          .map((camera) => ({
            id: camera.id,
            label: camera.label,
            x:
              typeof camera.x === 'number' && Number.isFinite(camera.x)
                ? expandsSpatialCoordinates
                  ? expandedCoordinate(camera.x, 0, 100)
                  : Math.max(0, Math.min(100, camera.x))
                : 50,
            depth:
              typeof camera.depth === 'number' && Number.isFinite(camera.depth)
                ? expandsSpatialCoordinates
                  ? expandedCoordinate(camera.depth, 0, 100)
                  : Math.max(0, Math.min(100, camera.depth))
                : 50,
            height:
              typeof camera.height === 'number' && Number.isFinite(camera.height)
                ? Math.max(0.35, Math.min(8, camera.height))
                : 1.6,
            yaw:
              typeof camera.yaw === 'number' && Number.isFinite(camera.yaw)
                ? Math.max(-180, Math.min(180, camera.yaw))
                : 0,
            pitch:
              sourceSchemaVersion < 10 &&
              /^CAM \d+ · 正面全景$/.test(camera.label) &&
              camera.yaw === 0 &&
              camera.pitch === 12 &&
              camera.distance === 82
                ? 0
                : typeof camera.pitch === 'number' && Number.isFinite(camera.pitch)
                  ? Math.max(-35, Math.min(55, camera.pitch))
                  : 12,
            distance:
              typeof camera.distance === 'number' && Number.isFinite(camera.distance)
                ? Math.max(20, Math.min(100, camera.distance))
                : 65,
            trackingMode: camera.trackingMode === 'follow-subject' ? 'follow-subject' : 'fixed',
            trackingSubjectId:
              camera.trackingMode === 'follow-subject' &&
              typeof camera.trackingSubjectId === 'string' &&
              camera.trackingSubjectId
                ? camera.trackingSubjectId
                : undefined,
          }))
      : [],
    duration:
      typeof scene.duration === 'number' && Number.isFinite(scene.duration)
        ? Math.max(1, Math.min(30, scene.duration))
        : defaults.duration,
    animationSampleCount:
      typeof scene.animationSampleCount === 'number' && Number.isFinite(scene.animationSampleCount)
        ? Math.max(1, Math.min(5, Math.round(scene.animationSampleCount)))
        : defaults.animationSampleCount,
    supportingReferenceCount:
      typeof scene.supportingReferenceCount === 'number' &&
      Number.isFinite(scene.supportingReferenceCount)
        ? Math.max(0, Math.min(4, Math.round(scene.supportingReferenceCount)))
        : undefined,
    startFrame: typeof scene.startFrame === 'string' ? scene.startFrame : '',
    endFrame: typeof scene.endFrame === 'string' ? scene.endFrame : '',
    negativePrompt:
      typeof scene.negativePrompt === 'string' ? scene.negativePrompt : defaults.negativePrompt,
  };
}

/** Removes runtime-only blob URLs from the serializable director scene. Large local panorama and
 * model binaries live in the Bridge asset library and are restored from their asset ids. */
export function createPersistentDirectorScene(scene: DirectorSceneState): DirectorSceneState {
  const normalized = normalizeDirectorScene(scene);
  return {
    ...normalized,
    sceneUrl: normalized.sceneAssetId ? undefined : normalized.sceneUrl,
    sceneReferenceUrl:
      normalized.sceneReferenceAssetId || normalized.sceneAssetId
        ? undefined
        : normalized.sceneReferenceUrl,
    subjects: normalized.subjects.map((subject) => ({ ...subject, modelUrl: undefined })),
  };
}

function horizontalPosition(x: number) {
  if (x < 34) return '画面左侧';
  if (x > 66) return '画面右侧';
  return '画面中央';
}

function depthPosition(y: number) {
  if (y < 35) return '后景';
  if (y > 68) return '前景';
  return '中景';
}

function subjectScale(scale: number) {
  if (scale < 80) return '较小景别';
  if (scale > 120) return '较大景别';
  return '正常景别';
}

export interface DirectorReferenceManifestItem {
  index: number;
  /** Stable semantic slot identity; URLs may intentionally be identical. */
  referenceId: string;
  kind: 'layout' | 'subject' | 'scene';
  label: string;
  imageUrl?: string;
}

export type DirectorSupportingReferenceSlot = Omit<DirectorReferenceManifestItem, 'index'> & {
  kind: 'subject' | 'scene';
  imageUrl: string;
};

export function buildDirectorSupportingReferenceSlots(
  scene: DirectorSceneState,
): DirectorSupportingReferenceSlot[] {
  const normalized = normalizeDirectorScene(scene);
  const subjects = normalized.subjects
    .filter((subject) => Boolean(subject.imageUrl))
    .map((subject) => ({
      referenceId: `subject:${subject.id}`,
      kind: 'subject' as const,
      label: subject.label || '人物参考',
      imageUrl: subject.imageUrl,
    }));
  const sceneImageUrl = normalized.sceneReferenceUrl ?? normalized.sceneUrl;
  return [
    ...subjects,
    ...(sceneImageUrl
      ? [
          {
            referenceId: 'scene:environment',
            kind: 'scene' as const,
            label: '场景参考',
            imageUrl: sceneImageUrl,
          },
        ]
      : []),
  ];
}

export function buildDirectorReferenceManifest(
  scene: DirectorSceneState,
): DirectorReferenceManifestItem[] {
  const normalized = normalizeDirectorScene(scene);
  const layoutItems: Omit<DirectorReferenceManifestItem, 'index'>[] =
    normalized.stageMode === 'spatial'
      ? Array.from({ length: normalized.animationSampleCount ?? 3 }, (_, index) => {
          const time = directorAnimationSampleTimes(
            normalized.duration,
            normalized.animationSampleCount ?? 3,
          )[index];
          return {
            referenceId: `layout:${index}`,
            kind: 'layout' as const,
            label: `3D动画关键帧${index + 1}（${(time ?? 0).toFixed(1)}秒）`,
          };
        })
      : [{ referenceId: 'layout:0', kind: 'layout' as const, label: '导演构图控制图' }];
  const items: Omit<DirectorReferenceManifestItem, 'index'>[] = [
    ...layoutItems,
    ...buildDirectorSupportingReferenceSlots(normalized),
  ];
  return items.slice(0, 5).map((item, index) => ({ ...item, index: index + 1 }));
}

export interface DirectorReadinessCheck {
  id: string;
  label: string;
  ready: boolean;
  hint: string;
}

export function getDirectorIntentReadiness(scene: DirectorSceneState): {
  score: number;
  level: '待完善' | '基本可用' | '表达清楚';
  checks: DirectorReadinessCheck[];
} {
  const normalized = normalizeDirectorScene(scene);
  const hasPerformance = normalized.subjects.every(
    (subject) =>
      subject.action.trim() ||
      subject.motion !== 'still' ||
      (subject.animationClip ?? 'none') !== 'none' ||
      Boolean(subject.motionPath?.points.length),
  );
  const checks: DirectorReadinessCheck[] = [
    {
      id: 'subjects',
      label: '人物身份',
      ready: normalized.subjects.length > 0,
      hint: '至少添加一个内置角色或导入角色',
    },
    {
      id: 'story',
      label: '场景与剧情',
      ready: normalized.prompt.trim().length >= 6,
      hint: '说明人物在什么地方做什么',
    },
    {
      id: 'scene-space',
      label: '场景空间',
      ready: Boolean(normalized.sceneName.trim() || normalized.sceneObjects.length > 0),
      hint: '填写场景名称，并登记黑板、书桌等需要固定的物件',
    },
    {
      id: 'performance',
      label: '人物动作',
      ready: normalized.subjects.length > 0 && hasPerformance,
      hint: '为每名人物填写动作或移动方向',
    },
    {
      id: 'camera',
      label: '镜头运动',
      ready: normalized.cameraMovement !== 'static' || normalized.cameraPreset !== 'medium-front',
      hint: '选择机位与运镜；固定镜头也可主动确认',
    },
    {
      id: 'timeline',
      label: '首尾变化',
      ready: Boolean(normalized.startFrame.trim() && normalized.endFrame.trim()),
      hint: '描述视频开始和结束时分别看到什么',
    },
  ];
  const score = Math.round((checks.filter((check) => check.ready).length / checks.length) * 100);
  return {
    score,
    level: score >= 80 ? '表达清楚' : score >= 50 ? '基本可用' : '待完善',
    checks,
  };
}

export function buildDirectorConstraintPrompt(scene: DirectorSceneState): string {
  const normalized = normalizeDirectorScene(scene);
  const count = normalized.subjects.length;
  const lines = [
    'AI视频导演指令：',
    '请把以下内容作为连续视频的硬性导演约束，不要仅当作画面描述。',
  ];
  const description = normalized.prompt.trim();
  if (description) lines.push(`场景与剧情：${description}`);

  if (normalized.sceneName.trim() || normalized.sceneObjects.length > 0) {
    lines.push('场景空间与固定物件：');
    if (normalized.sceneName.trim()) lines.push(`场景类型：${normalized.sceneName.trim()}。`);
    for (const [index, object] of normalized.sceneObjects.entries()) {
      lines.push(
        `${index + 1}. ${object.label}（${DIRECTOR_SCENE_OBJECT_KIND_LABELS[object.kind]}，${DIRECTOR_SCENE_OBJECT_PRIMITIVE_LABELS[object.primitive ?? 'cube']} 3D参考体）：${horizontalPosition(object.x)}、${depthPosition(object.depth ?? object.y)}、离地高度${(object.height ?? 0).toFixed(1)}米、统一大小${Math.round(object.scale)}%、三轴尺寸宽X ${Math.round(object.scaleX ?? 100)}% / 高Y ${Math.round(object.scaleY ?? 100)}% / 深Z ${Math.round(object.scaleZ ?? 100)}%、水平旋转${Math.round(object.rotationY ?? 0)}°、材质颜色${object.color ?? '#c9682b'}；${object.description.trim() || '保持物件完整、位置稳定，不随人物移动'}。`,
      );
    }
    lines.push(
      '以上固定物件在整个镜头中保持名称、外观、相对位置和空间关系一致，不得消失、复制或无理由移动。',
    );
  }

  lines.push('参考图对应关系：');
  for (const item of buildDirectorReferenceManifest(normalized)) {
    lines.push(
      `参考图${item.index}：${item.label}${item.kind === 'layout' ? (normalized.stageMode === 'spatial' ? '，是同一连续动作在固定时间点的3D预演画面，必须按编号顺序还原肢体、位置和镜头变化' : '，用于控制人物数量、站位和画面大小') : '，用于保持视觉身份'}`,
    );
  }

  lines.push('镜头设计：');
  if (normalized.stageMode === 'spatial') {
    lines.push(
      `3D导演预演：采用三维场景调度；摄影机环绕角度${Math.round(normalized.cameraYaw)}°、俯仰${Math.round(normalized.cameraPitch)}°、距离${Math.round(normalized.cameraDistance)}%。严格保留人物与物件的前后景深、朝向和遮挡关系。`,
    );
    if (normalized.stageCameras?.length) {
      lines.push(
        `备用拍摄机位：${normalized.stageCameras
          .map((camera) => {
            const trackedSubject = normalized.subjects.find(
              (subject) => subject.id === camera.trackingSubjectId,
            );
            const tracking =
              camera.trackingMode === 'follow-subject' && trackedSubject
                ? `，跟随拍摄“${trackedSubject.label}”，保持相对距离并持续对准人物根节点`
                : '，固定机位';
            return `${camera.label}位于舞台 X${Math.round(camera.x)} / Z${Math.round(camera.depth)} / 高度${camera.height.toFixed(1)}，水平角${Math.round(camera.yaw)}°、俯仰${Math.round(camera.pitch)}°、构图距离${Math.round(camera.distance)}%${tracking}`;
          })
          .join('；')}。这些机位作为备选构图依据，保持人物空间关系一致。`,
      );
    }
  }
  lines.push(`机位与景别：${DIRECTOR_CAMERA_LABELS[normalized.cameraPreset]}。`);
  lines.push(
    `镜头运动：${DIRECTOR_CAMERA_MOVEMENT_LABELS[normalized.cameraMovement]}，${DIRECTOR_CAMERA_SPEED_LABELS[normalized.cameraSpeed]}速度；${DIRECTOR_CAMERA_MOVEMENT_PROMPTS[normalized.cameraMovement]}。`,
  );
  lines.push(
    `镜头时长：约${Math.round(normalized.duration)}秒，保持一个连续镜头，除非剧情描述明确要求切镜。`,
  );

  lines.push('时间轴：');
  lines.push(
    `0秒起始画面：${normalized.startFrame.trim() || '保持构图控制图中的人物初始站位和景别。'}`,
  );
  lines.push(
    `${Math.max(1, Math.round(normalized.duration / 2))}秒过程：人物按各自动作与移动方向连续表演，运动轨迹自然，不能瞬移或交换位置。`,
  );
  lines.push(
    `${Math.round(normalized.duration)}秒结束画面：${normalized.endFrame.trim() || '动作自然结束并稳定在合理站位，保持人物身份一致。'}`,
  );

  if (normalized.lockSubjectCount) {
    lines.push(count === 0 ? '画面中不要出现人物。' : `画面中必须且只能出现${count}名人物。`);
  }
  if (normalized.forbidExtraSubjects) lines.push('禁止生成未被引用的额外人物或重复人物。');
  if (normalized.preserveIdentity && count > 0) {
    lines.push('严格保持每名人物各自的脸部身份、发型、服装和配饰，不得互换身份。');
  }

  if (count > 0) lines.push('人物调度：');
  for (const [index, subject] of normalized.subjects.entries()) {
    const manifest = buildDirectorReferenceManifest(normalized).find(
      (item) => item.referenceId === `subject:${subject.id}`,
    );
    const referenceLabel = manifest ? `参考图${manifest.index}` : '3D导演布局参考图中的程序化角色';
    const preset = getDirectorCharacterPreset(subject.characterPreset);
    const colors = normalizeDirectorCharacterColors(subject.characterColors, preset.id);
    const rigOffsets = Object.entries(subject.rigPose ?? {})
      .filter(([, value]) => typeof value === 'number' && Math.abs(value) >= 0.5)
      .map(([joint, value]) => `${joint}${Math.round(value as number)}°`)
      .join('、');
    const path = subject.motionPath?.points ?? [];
    const pathFollowsDirection = path.length > 1;
    const facingDescription = pathFollowsDirection
      ? '身体、面部、躯干与四肢始终统一朝向运动路径的前进切线，不保持固定镜头朝向，也不能侧滑或倒退'
      : subject.bodyTarget.trim()
        ? `身体明确朝向场景目标“${subject.bodyTarget.trim()}”，不能误转向镜头；镜头中呈现为${DIRECTOR_BODY_FACING_PROMPTS[subject.bodyFacing]}，水平朝向角度${Math.round(subject.bodyAngle)}度（0度正面、-90度左侧、90度右侧、±180度背面）`
        : `${DIRECTOR_BODY_FACING_PROMPTS[subject.bodyFacing]}，水平朝向角度${Math.round(subject.bodyAngle)}度（0度正面、-90度左侧、90度右侧、±180度背面）`;
    const pathDescription = path.length
      ? `运动路径为${DIRECTOR_MOTION_PATH_LABELS[subject.motionPath?.type ?? 'line']}，范围宽${Math.round(subject.motionPath?.width ?? 0)}% × 深${Math.round(subject.motionPath?.depthRange ?? 0)}%，人物根节点始终沿路径切线朝向前进，头部、躯干与四肢共享该前进方位，包含${path.length}个连续路径点（${path
          .map((point) => `${Math.round(point.x)},${Math.round(point.depth)}`)
          .join(' → ')}）`
      : '没有额外根节点位移路径';
    const performanceDescription =
      normalized.stageMode === 'spatial'
        ? ''
        : `；动作表演：${subject.action.trim() || '保持自然姿态并完成连续细微动作'}；情绪表演：${subject.emotion.trim() || '自然克制'}`;
    lines.push(
      `${index + 1}. ${subject.label || `人物${index + 1}`}：${horizontalPosition(subject.x)}、${depthPosition(subject.depth ?? subject.y)}、${subjectScale(subject.scale)}（画面大小${Math.round(subject.scale)}%）；身份参考：${referenceLabel}；角色资产：${subject.modelFileName ? `导入模型“${subject.modelFileName}”` : `${preset.label}（${preset.role}）`}；材质配色必须保持为肤色${colors.skin}、服装${colors.outfit}、强调色${colors.accent}、发色${colors.hair}；${normalized.stageMode === 'spatial' ? `三维景深位置${Math.round(subject.depth ?? subject.y)}%、离地高度${(subject.height ?? 0).toFixed(1)}米；` : ''}${facingDescription}；姿势为${subject.posePreset ?? 'stand'}，使用分层四肢关节联动骨架，躯干倾斜${Math.round(subject.poseLean ?? 0)}度，头部点头${Math.round(subject.headTilt ?? 0)}度、转头${pathFollowsDirection ? 0 : Math.round(subject.headTurn ?? 0)}度${rigOffsets ? `，手动关节偏移为${rigOffsets}` : ''}；动画片段为${directorAnimationLabel(subject.animationClip)}，速度${(subject.animationSpeed ?? 1).toFixed(2)}倍，${subject.animationLoop === false ? '只播放一次' : '按镜头时长循环'}；${pathDescription}；${pathFollowsDirection ? '头部视线随前进方向' : `头部${DIRECTOR_HEAD_DIRECTION_LABELS[subject.headDirection]}${subject.gazeTarget.trim() ? `，视线目标为“${subject.gazeTarget.trim()}”` : ''}`}；移动方式为${DIRECTOR_SUBJECT_MOTION_LABELS[subject.motion]}${performanceDescription}${subject.rotation ? `；画面姿态倾斜${Math.round(subject.rotation)}度` : ''}。`,
    );
  }

  if (normalized.preservePositions && count > 0) {
    lines.push('严格保持人物的左右顺序、前后遮挡关系和相对画面大小；移动结束前不得无理由越位。');
  }
  lines.push(`导演约束强度：${Math.round(normalized.constraintStrength)}%。`);
  if (normalized.negativePrompt.trim()) lines.push(`禁止事项：${normalized.negativePrompt.trim()}`);
  return lines.join('\n');
}
