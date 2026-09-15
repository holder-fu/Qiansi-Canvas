/* oxlint-disable react/only-export-components -- the node preview intentionally shares the exact rig factory. */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type {
  DirectorRigJoint,
  DirectorSceneObject,
  DirectorSceneState,
  DirectorStageCamera,
  DirectorSubjectPlacement,
} from '../canvas/nodeTypes';
import {
  DIRECTOR_RIG_JOINTS,
  directorAnimationSampleTimes,
  evaluateDirectorRigFrame,
  getDirectorCharacterPreset,
  normalizeDirectorCharacterColors,
  patchDirectorJointFromTargetAngle,
  type DirectorCharacterPreset,
} from '../lib/directorCharacters';
import {
  DIRECTOR_CAMERA_RADIUS_MAX,
  DIRECTOR_CAMERA_RADIUS_MIN,
  DIRECTOR_CAMERA_TARGET,
  DIRECTOR_STAGE_WORLD_UNIT,
  constrainDirectorMotionToScene,
  groundDirectorCameraPosition,
  getDirectorSceneObjectScale,
  getDirectorStagePixelRatio,
  getDirectorStageCameraFrustumScale,
  getDirectorStageCameraCapturePose,
  getDirectorTrackedStageCameraCapturePose,
  getDirectorShotCameraPosition,
  getDirectorShotCameraState,
  getDirectorWheelZoomTarget,
  stepDirectorKeyboardViewPan,
  stepDirectorKeyboardWalk,
  stepDirectorSmoothZoom,
  type DirectorShotCameraState,
} from '../lib/directorStage';
import { translateDirectorMotionPath } from '../lib/directorMotionPath';
import { loadDirectorModelUrl } from '../lib/directorModel';
import {
  DIRECTOR_PREVIS_FPS,
  DIRECTOR_PREVIS_HEIGHT,
  DIRECTOR_PREVIS_WIDTH,
  selectDirectorPrevisMimeType,
  type DirectorPrevisCapture,
} from '../lib/directorPrevisVideo';
import { useAppTranslation } from '../i18n/appI18n';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';
import {
  DIRECTOR_PANORAMA_GROUND_CAPTURE_HEIGHT,
  directorPanoramaBackgroundPitchDegrees,
  directorPanoramaGroundVerticalOffset,
} from '../lib/directorPanorama';

const WORLD_UNIT = DIRECTOR_STAGE_WORLD_UNIT;
const CAPTURE_WIDTH = DIRECTOR_PREVIS_WIDTH;
const CAPTURE_HEIGHT = DIRECTOR_PREVIS_HEIGHT;
const DIRECTOR_STAGE_SIZE = 280;
const DIRECTOR_STAGE_GRID_DIVISIONS = 28;
const DIRECTOR_STAGE_MINOR_GRID_DIVISIONS = 280;
const DIRECTOR_HORIZON_GROUND_RADIUS = 2000;
const DIRECTOR_KEYBOARD_WALK_COMMIT_INTERVAL = 50;
export const DIRECTOR_CAMERA_PRESET_DRAG_TYPE = 'application/x-qiansi-director-camera-preset';

type TransformMode = 'translate' | 'rotate' | 'scale';
type CameraView = 'director' | 'shot';
type ModelLoadState = Record<string, 'loading' | 'ready' | 'error'>;

interface SubjectPatch {
  x?: number;
  y?: number;
  depth?: number;
  height?: number;
  scale?: number;
  bodyAngle?: number;
  rigPose?: DirectorSubjectPlacement['rigPose'];
  motionPath?: DirectorSubjectPlacement['motionPath'];
}

interface ActiveRigJoint {
  subjectId: string;
  joint: DirectorRigJoint;
}

type SceneObjectPatch = Partial<
  Pick<
    DirectorSceneObject,
    | 'x'
    | 'y'
    | 'depth'
    | 'height'
    | 'scale'
    | 'scaleX'
    | 'scaleY'
    | 'scaleZ'
    | 'rotationY'
    | 'color'
    | 'label'
    | 'description'
  >
>;

interface DirectorRuntimeEntity extends THREE.Group {
  userData: {
    directorRoot: true;
    directorKind: 'subject' | 'object' | 'camera' | 'path';
    id: string;
    directorImported?: boolean;
    directorMixer?: THREE.AnimationMixer;
    [key: string]: unknown;
  };
}

function worldPosition(x: number, depth: number) {
  return new THREE.Vector3((x - 50) * WORLD_UNIT, 0, (depth - 50) * WORLD_UNIT);
}

function directorStageHeight(height: number | undefined) {
  return Math.max(0, Math.min(50, Number.isFinite(height) ? (height ?? 0) : 0));
}

function createDirectorPanoramaGroundMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    name: 'director-panorama-ground-projection',
    uniforms: {
      panoramaMap: { value: texture },
      panoramaVerticalOffset: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 directorWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        directorWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D panoramaMap;
      uniform float panoramaVerticalOffset;
      varying vec3 directorWorldPosition;

      const float DIRECTOR_PI = 3.141592653589793;
      const float DIRECTOR_CAPTURE_HEIGHT = ${DIRECTOR_PANORAMA_GROUND_CAPTURE_HEIGHT.toFixed(1)};

      void main() {
        vec3 panoramaDirection = normalize(vec3(
          directorWorldPosition.x,
          -DIRECTOR_CAPTURE_HEIGHT,
          directorWorldPosition.z
        ));
        vec2 panoramaUv = vec2(
          atan(panoramaDirection.z, panoramaDirection.x) / (DIRECTOR_PI * 2.0) + 0.5,
          asin(clamp(panoramaDirection.y, -1.0, 1.0)) / DIRECTOR_PI + 0.5
        );
        panoramaUv.y = clamp(panoramaUv.y + panoramaVerticalOffset, 0.001, 0.499);
        gl_FragColor = texture2D(panoramaMap, panoramaUv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  });
}

function directorPosition(position: THREE.Vector3) {
  return {
    x: Math.max(4, Math.min(96, position.x / WORLD_UNIT + 50)),
    depth: Math.max(0, Math.min(100, position.z / WORLD_UNIT + 50)),
  };
}

function subjectRuntimePlacement(
  subject: DirectorSubjectPlacement,
  progress: number,
  sceneObjects: DirectorSceneObject[],
) {
  const motionPath = subject.motionPath;
  const sample =
    motionPath && motionPath.points.length > 1
      ? constrainDirectorMotionToScene(motionPath, progress, sceneObjects, subject.scale)
      : undefined;
  const position = worldPosition(
    sample?.x ?? subject.x,
    sample?.depth ?? subject.depth ?? subject.y,
  );
  position.y = directorStageHeight(subject.height);
  return {
    position,
    pathYaw: sample?.yawRadians,
  };
}

function subjectCameraTarget(
  subject: DirectorSubjectPlacement,
  progress: number,
  sceneObjects: DirectorSceneObject[],
) {
  const { position } = subjectRuntimePlacement(subject, progress, sceneObjects);
  return {
    x: position.x,
    y:
      directorStageHeight(subject.height) +
      Math.max(0.75, Math.min(4.5, 1.35 * (subject.scale / 100))),
    z: position.z,
  };
}

function stageCameraRuntimePose(
  scene: DirectorSceneState,
  cameraId: string | null | undefined,
  time: number,
) {
  const stageCamera = scene.stageCameras?.find((candidate) => candidate.id === cameraId);
  if (!stageCamera) return null;
  const progress = Math.max(0, Math.min(1, time / Math.max(0.01, scene.duration)));
  const trackedSubject = scene.subjects.find(
    (subject) => subject.id === stageCamera.trackingSubjectId,
  );
  return {
    camera: stageCamera,
    pose: getDirectorTrackedStageCameraCapturePose(
      stageCamera,
      trackedSubject ? subjectCameraTarget(trackedSubject, 0, scene.sceneObjects) : undefined,
      trackedSubject
        ? subjectCameraTarget(trackedSubject, progress, scene.sceneObjects)
        : undefined,
    ),
  };
}

function degrees(value: number) {
  return THREE.MathUtils.degToRad(value);
}

function colorMaterial(color: string, slot: 'skin' | 'outfit' | 'accent' | 'hair') {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: slot === 'accent' ? 0.38 : 0.62,
    metalness: slot === 'accent' ? 0.28 : 0.04,
  });
  material.userData.directorColorSlot = slot;
  return material;
}

function markMesh(
  mesh: THREE.Mesh,
  slot?: 'skin' | 'outfit' | 'accent' | 'hair',
  rigHelper = false,
) {
  mesh.castShadow = !rigHelper;
  mesh.receiveShadow = !rigHelper;
  if (slot) mesh.userData.directorColorSlot = slot;
  if (rigHelper) mesh.userData.directorRigHelper = true;
  return mesh;
}

function capsuleSegment(
  length: number,
  radius: number,
  material: THREE.Material,
  slot: 'skin' | 'outfit' | 'accent',
) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 6, 12),
    material,
  );
  mesh.position.y = -length / 2;
  return markMesh(mesh, slot);
}

function jointHelper(radius: number, joint: DirectorRigJoint) {
  const helper = markMesh(
    new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 10),
      new THREE.MeshBasicMaterial({
        color: '#f8fafc',
        transparent: true,
        opacity: 0.72,
        depthTest: false,
        depthWrite: false,
      }),
    ),
    undefined,
    true,
  );
  helper.name = `director-joint-handle-${joint}`;
  helper.renderOrder = 70;
  helper.userData.directorRigJoint = joint;
  return helper;
}

function createSubjectSelectionRing(color: string) {
  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.58, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    }),
  );
  selectionRing.name = 'director-selection-ring';
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.012;
  selectionRing.userData.directorColorSlot = 'accent';
  return selectionRing;
}

function createLimb(
  side: 'left' | 'right',
  kind: 'arm' | 'leg',
  firstLength: number,
  secondLength: number,
  radius: number,
  firstMaterial: THREE.Material,
  secondMaterial: THREE.Material,
  accentMaterial: THREE.Material,
) {
  const firstJoint = new THREE.Group();
  const firstName = (kind === 'arm' ? `${side}Shoulder` : `${side}Hip`) as DirectorRigJoint;
  const secondName = (kind === 'arm' ? `${side}Elbow` : `${side}Knee`) as DirectorRigJoint;
  firstJoint.name = `director-joint-${firstName}`;
  firstJoint.add(jointHelper(radius * 1.16, firstName));
  firstJoint.add(capsuleSegment(firstLength, radius, firstMaterial, 'outfit'));

  const secondJoint = new THREE.Group();
  secondJoint.name = `director-joint-${secondName}`;
  secondJoint.position.y = -firstLength;
  secondJoint.add(jointHelper(radius * 1.08, secondName));
  secondJoint.add(capsuleSegment(secondLength, radius * 0.9, secondMaterial, 'outfit'));
  firstJoint.add(secondJoint);

  const extremity = markMesh(
    new THREE.Mesh(
      kind === 'arm'
        ? new THREE.SphereGeometry(radius * 1.16, 14, 10)
        : new THREE.BoxGeometry(radius * 1.8, radius * 0.72, radius * 3.1),
      accentMaterial,
    ),
    'accent',
  );
  extremity.position.set(0, -secondLength, kind === 'leg' ? radius * 0.9 : 0);
  secondJoint.add(extremity);
  return firstJoint;
}

function createBuiltInSubject(subject: DirectorSubjectPlacement): DirectorRuntimeEntity {
  const preset = getDirectorCharacterPreset(subject.characterPreset);
  const visualReady = !preset.model && !subject.modelAssetId && !subject.modelUrl;
  const colors = normalizeDirectorCharacterColors(subject.characterColors, preset.id);
  const proportions = preset.proportions;
  const root = new THREE.Group() as DirectorRuntimeEntity;
  root.name = subject.label || preset.label;
  root.userData = {
    directorRoot: true,
    directorKind: 'subject',
    id: subject.id,
    directorImported: false,
    directorVisualReady: visualReady,
  };
  root.visible = visualReady;

  const skin = colorMaterial(colors.skin, 'skin');
  const outfit = colorMaterial(colors.outfit, 'outfit');
  const accent = colorMaterial(colors.accent, 'accent');
  const hair = colorMaterial(colors.hair, 'hair');
  const limbRadius = 0.115 * proportions.limbRadius;
  const height = proportions.height;

  const pelvis = markMesh(
    new THREE.Mesh(new THREE.CapsuleGeometry(0.27 * proportions.hipWidth, 0.2, 6, 14), outfit),
    'outfit',
  );
  pelvis.position.y = 1.24 * height;
  pelvis.scale.z = proportions.torsoDepth;
  root.add(pelvis);

  const spine = new THREE.Group();
  spine.name = 'director-joint-spine';
  spine.position.y = 1.26 * height;
  spine.add(jointHelper(0.095, 'spine'));
  root.add(spine);

  const torso = markMesh(
    new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34 * proportions.torsoWidth, 0.47 * height, 8, 16),
      outfit,
    ),
    'outfit',
  );
  torso.name = 'director-torso';
  torso.position.y = 0.44 * height;
  torso.scale.z = proportions.torsoDepth;
  spine.add(torso);

  const chestPanel = markMesh(
    new THREE.Mesh(new THREE.BoxGeometry(0.36 * proportions.torsoWidth, 0.16, 0.035), accent),
    'accent',
  );
  chestPanel.position.set(0, 0.51 * height, 0.32 * proportions.torsoDepth);
  spine.add(chestPanel);

  const neck = new THREE.Group();
  neck.name = 'director-joint-neck';
  neck.position.y = 1.02 * height;
  neck.add(jointHelper(0.075, 'neck'));
  spine.add(neck);

  const neckMesh = capsuleSegment(0.18, 0.09, skin, 'skin');
  neckMesh.rotation.z = Math.PI;
  neckMesh.position.y = 0.08;
  neck.add(neckMesh);
  const head = markMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.3 * proportions.headScale, 24, 18), skin),
    'skin',
  );
  head.name = 'director-head';
  head.position.y = 0.35 * proportions.headScale;
  head.scale.y = 1.12;
  neck.add(head);

  const hairMesh = markMesh(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.305 * proportions.headScale, 24, 12, 0, Math.PI * 2, 0, 1.56),
      hair,
    ),
    'hair',
  );
  hairMesh.position.copy(head.position).add(new THREE.Vector3(0, 0.07, -0.008));
  hairMesh.scale.y = 1.08;
  neck.add(hairMesh);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#101317' });
  for (const x of [-0.105, 0.105]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMaterial);
    eye.position.set(
      x * proportions.headScale,
      head.position.y + 0.035,
      0.282 * proportions.headScale,
    );
    neck.add(eye);
  }

  const shoulderY = 0.78 * height;
  const shoulderX = 0.4 * proportions.shoulderWidth;
  const upperArm = 0.56 * height;
  const lowerArm = 0.51 * height;
  const leftArm = createLimb('left', 'arm', upperArm, lowerArm, limbRadius, outfit, outfit, skin);
  leftArm.position.set(-shoulderX, shoulderY, 0);
  spine.add(leftArm);
  const rightArm = createLimb('right', 'arm', upperArm, lowerArm, limbRadius, outfit, outfit, skin);
  rightArm.position.set(shoulderX, shoulderY, 0);
  spine.add(rightArm);

  const hipX = 0.19 * proportions.hipWidth;
  const upperLeg = 0.67 * height;
  const lowerLeg = 0.68 * height;
  const leftLeg = createLimb(
    'left',
    'leg',
    upperLeg,
    lowerLeg,
    limbRadius * 1.12,
    outfit,
    outfit,
    accent,
  );
  leftLeg.position.set(-hipX, 1.2 * height, 0);
  root.add(leftLeg);
  const rightLeg = createLimb(
    'right',
    'leg',
    upperLeg,
    lowerLeg,
    limbRadius * 1.12,
    outfit,
    outfit,
    accent,
  );
  rightLeg.position.set(hipX, 1.2 * height, 0);
  root.add(rightLeg);

  const selectionRing = createSubjectSelectionRing(colors.accent);
  root.add(selectionRing);
  const joints = new Map<string, THREE.Object3D>();
  const rigHelpers: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.name.startsWith('director-joint-')) {
      joints.set(child.name.slice('director-joint-'.length), child);
    }
    if (child.userData.directorRigHelper) rigHelpers.push(child);
  });
  root.userData.directorJoints = joints;
  root.userData.directorRigHelpers = rigHelpers;
  root.userData.directorSelectionRing = selectionRing;
  return root;
}

type DirectorBuiltInModelSpec = NonNullable<DirectorCharacterPreset['model']>;

const DIRECTOR_RIG_CHILD_BONES: Record<DirectorRigJoint, string> = {
  spine: 'mixamorig:Spine1',
  neck: 'mixamorig:Head',
  leftShoulder: 'mixamorig:LeftForeArm',
  leftElbow: 'mixamorig:LeftHand',
  rightShoulder: 'mixamorig:RightForeArm',
  rightElbow: 'mixamorig:RightHand',
  leftHip: 'mixamorig:LeftLeg',
  leftKnee: 'mixamorig:LeftFoot',
  rightHip: 'mixamorig:RightLeg',
  rightKnee: 'mixamorig:RightFoot',
};

function directorRigChildBoneName(spec: DirectorBuiltInModelSpec, joint: DirectorRigJoint) {
  const fallback = DIRECTOR_RIG_CHILD_BONES[joint];
  const namespaceEnd = spec.bones[joint].lastIndexOf(':');
  if (namespaceEnd < 0) return fallback;
  return `${spec.bones[joint].slice(0, namespaceEnd + 1)}${fallback.slice(fallback.lastIndexOf(':') + 1)}`;
}

function signedAngleAroundAxis(from: THREE.Vector3, to: THREE.Vector3, axis: THREE.Vector3) {
  return Math.atan2(axis.dot(new THREE.Vector3().crossVectors(from, to)), from.dot(to));
}

function clearSubjectVisuals(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    if (!child) break;
    group.remove(child);
    disposeObject(child);
  }
}

function resolveDirectorRigBone(model: THREE.Object3D, name: string) {
  return (
    model.getObjectByName(name) ??
    model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))
  );
}

/** Replaces the procedural fallback with a bundled skinned model and binds its named bones. */
export function installDirectorBuiltInSubjectModel(
  group: THREE.Group,
  model: THREE.Object3D,
  subject: DirectorSubjectPlacement,
  spec: DirectorBuiltInModelSpec,
) {
  const resolvedRig = new Map<
    DirectorRigJoint,
    { bone: THREE.Object3D; childBone: THREE.Object3D; parent: THREE.Object3D }
  >();
  for (const joint of DIRECTOR_RIG_JOINTS) {
    const bone = resolveDirectorRigBone(model, spec.bones[joint.id]);
    const childBone = resolveDirectorRigBone(model, directorRigChildBoneName(spec, joint.id));
    const parent = bone?.parent;
    if (!bone || !childBone || !parent) return false;
    resolvedRig.set(joint.id, { bone, childBone, parent });
  }

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const modelScale = size.y > 0 ? spec.targetHeight / size.y : 1;
  model.scale.setScalar(modelScale);
  model.position.set(-center.x * modelScale, -bounds.min.y * modelScale, -center.z * modelScale);

  const originalMaterials = new Set<THREE.Material>();
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const slot = child.name.toLowerCase().includes('joint') ? 'accent' : 'skin';
    child.userData.directorColorSlot = slot;
    child.material = materialList(child.material).map((material) => {
      originalMaterials.add(material);
      const clone = material.clone();
      clone.userData.directorColorSlot = slot;
      return clone;
    });
    if (child.material.length === 1) child.material = child.material[0];
  });
  for (const material of originalMaterials) material.dispose();

  clearSubjectVisuals(group);
  group.userData.directorImported = false;
  group.userData.directorVisualReady = true;
  group.userData.directorColorSignature = '';
  group.userData.directorMixer = undefined;
  group.add(model);
  group.updateWorldMatrix(true, true);

  const groupQuaternion = group.getWorldQuaternion(new THREE.Quaternion());
  const actorUp = new THREE.Vector3(0, 1, 0).applyQuaternion(groupQuaternion).normalize();
  const actorFront = new THREE.Vector3(...spec.faceDirection)
    .applyQuaternion(groupQuaternion)
    .normalize();
  const actorRight = new THREE.Vector3().crossVectors(actorUp, actorFront).normalize();
  const actorDown = new THREE.Vector3(0, -1, 0).applyQuaternion(groupQuaternion).normalize();
  const joints = new Map<string, THREE.Object3D>();
  const rigHelpers: THREE.Object3D[] = [];

  for (const joint of DIRECTOR_RIG_JOINTS) {
    const resolved = resolvedRig.get(joint.id);
    if (!resolved) continue;
    const { bone, childBone, parent } = resolved;

    const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
    const parentInverse = parentQuaternion.clone().invert();
    const frontAxis = actorFront.clone().applyQuaternion(parentInverse).normalize();
    const rightAxis = actorRight.clone().applyQuaternion(parentInverse).normalize();
    const yawAxis = actorUp.clone().applyQuaternion(parentInverse).normalize();
    const restQuaternion = bone.quaternion.clone();
    let calibration = 0;
    if (joint.id === 'leftShoulder' || joint.id === 'rightShoulder') {
      const origin = bone.getWorldPosition(new THREE.Vector3());
      const direction = childBone
        .getWorldPosition(new THREE.Vector3())
        .sub(origin)
        .projectOnPlane(actorFront)
        .normalize();
      calibration = signedAngleAroundAxis(direction, actorDown, actorFront);
    }

    bone.userData.directorRigRestQuaternion = restQuaternion;
    bone.userData.directorRigFrontAxis = frontAxis;
    bone.userData.directorRigRightAxis = rightAxis;
    bone.userData.directorRigAxis =
      joint.id === 'leftShoulder' || joint.id === 'rightShoulder' ? frontAxis : rightAxis;
    bone.userData.directorRigYawAxis = yawAxis;
    bone.userData.directorRigCalibration = calibration;
    bone.quaternion
      .copy(restQuaternion)
      .premultiply(new THREE.Quaternion().setFromAxisAngle(frontAxis, calibration));
    bone.updateWorldMatrix(true, true);

    const zeroDirection = parent
      .worldToLocal(childBone.getWorldPosition(new THREE.Vector3()))
      .sub(bone.position)
      .normalize();
    bone.userData.directorRigZeroDirection = zeroDirection;
    joints.set(joint.id, bone);

    const helper = jointHelper(0.075, joint.id);
    bone.add(helper);
    group.updateWorldMatrix(true, true);
    const boneScale = bone.getWorldScale(new THREE.Vector3());
    const groupScale = group.getWorldScale(new THREE.Vector3());
    const nestedScale = Math.max(
      0.0001,
      boneScale.x / Math.max(0.0001, groupScale.x),
      boneScale.y / Math.max(0.0001, groupScale.y),
      boneScale.z / Math.max(0.0001, groupScale.z),
    );
    const baseScale = 1 / nestedScale;
    helper.scale.setScalar(baseScale);
    helper.userData.directorRigBaseScale = baseScale;
    rigHelpers.push(helper);
  }

  const colors = normalizeDirectorCharacterColors(subject.characterColors, subject.characterPreset);
  const selectionRing = createSubjectSelectionRing(colors.accent);
  group.add(selectionRing);
  group.userData.directorJoints = joints;
  group.userData.directorRigHelpers = rigHelpers;
  group.userData.directorSelectionRing = selectionRing;
  return true;
}

/** Shared renderer factory used by the full studio and the canvas node's real WebGL preview. */
export function createDirectorPreviewSubject(subject: DirectorSubjectPlacement): THREE.Group {
  return createBuiltInSubject(subject);
}

function materialList(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material];
}

function applySubjectColors(group: THREE.Group, subject: DirectorSubjectPlacement) {
  const preset = getDirectorCharacterPreset(subject.characterPreset);
  const colors = normalizeDirectorCharacterColors(subject.characterColors, preset.id);
  const signature = `${colors.skin}|${colors.outfit}|${colors.accent}|${colors.hair}|${group.userData.directorImported ? 'imported' : 'built-in'}`;
  if (group.userData.directorColorSignature === signature) return;
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of materialList(child.material)) {
      if (!(
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshBasicMaterial
      )) {
        continue;
      }
      const slot =
        (child.userData.directorColorSlot as keyof typeof colors | undefined) ??
        (material.userData.directorColorSlot as keyof typeof colors | undefined);
      if (slot) {
        material.color.set(colors[slot]);
        material.needsUpdate = true;
      } else if (
        group.userData.directorImported &&
        material instanceof THREE.MeshStandardMaterial
      ) {
        const original = material.userData.directorOriginalColor as string | undefined;
        if (!original)
          material.userData.directorOriginalColor = `#${material.color.getHexString()}`;
        material.color
          .set(material.userData.directorOriginalColor as string)
          .lerp(new THREE.Color(colors.outfit), 0.24);
        material.needsUpdate = true;
      }
    }
  });
  group.userData.directorColorSignature = signature;
}

export function updateDirectorRigHelperAppearance(helper: THREE.Object3D, selected: boolean) {
  const storedBaseScale = helper.userData.directorRigBaseScale;
  const baseScale =
    typeof storedBaseScale === 'number' && Number.isFinite(storedBaseScale) && storedBaseScale > 0
      ? storedBaseScale
      : 1;
  helper.scale.setScalar(baseScale * (selected ? 1.45 : 1));
  const helperMaterial =
    helper instanceof THREE.Mesh && helper.material instanceof THREE.MeshBasicMaterial
      ? helper.material
      : undefined;
  if (helperMaterial) {
    helperMaterial.color.set(selected ? '#facc15' : '#f8fafc');
    helperMaterial.opacity = selected ? 1 : 0.72;
  }
}

function usesSagittalShoulderMotion(subject: DirectorSubjectPlacement) {
  return (
    subject.animationClip === 'walk' ||
    subject.animationClip === 'run' ||
    subject.posePreset === 'walk' ||
    subject.posePreset === 'run'
  );
}

function usesCrossBodyShoulderMotion(subject: DirectorSubjectPlacement) {
  return (
    subject.posePreset === 'fold-arms' ||
    subject.posePreset === 'phone' ||
    subject.posePreset === 'think'
  );
}

function builtInRigAngleSign(joint: DirectorRigJoint, subject: DirectorSubjectPlacement) {
  // Mixamo's named sides use the opposite X convention from the procedural rig;
  // cross-body poses intentionally keep rotating inward.
  if (
    (joint === 'leftShoulder' || joint === 'rightShoulder') &&
    !usesSagittalShoulderMotion(subject) &&
    !usesCrossBodyShoulderMotion(subject)
  ) {
    return -1;
  }
  if (joint === 'leftElbow' || joint === 'leftHip' || joint === 'leftKnee') return -1;
  if (joint === 'rightHip' && usesSagittalShoulderMotion(subject)) return -1;
  return 1;
}

export function directorArmBodyClearanceDegrees(shoulderAngle: number, elbowAngle: number) {
  const crossing = THREE.MathUtils.clamp((Math.abs(shoulderAngle) - 24) / 54, 0, 1);
  const flexion = THREE.MathUtils.clamp((Math.abs(elbowAngle) - 24) / 68, 0, 1);
  return 28 * Math.sqrt(crossing * flexion);
}

export function directorArmHangForwardDegrees(shoulderAngle: number, elbowAngle: number) {
  const lowered = THREE.MathUtils.clamp((35 - Math.abs(shoulderAngle)) / 28, 0, 1);
  const straight = THREE.MathUtils.clamp((30 - Math.abs(elbowAngle)) / 24, 0, 1);
  return 10 * Math.sqrt(lowered * straight);
}

function builtInRigMotionAxis(
  target: THREE.Object3D,
  joint: DirectorRigJoint,
  subject: DirectorSubjectPlacement,
) {
  const frontAxis = target.userData.directorRigFrontAxis as THREE.Vector3 | undefined;
  const rightAxis = target.userData.directorRigRightAxis as THREE.Vector3 | undefined;
  if (
    (joint === 'leftShoulder' || joint === 'rightShoulder') &&
    !usesSagittalShoulderMotion(subject)
  ) {
    return frontAxis;
  }
  return rightAxis;
}

function applyBuiltInRig(
  group: THREE.Group,
  subject: DirectorSubjectPlacement,
  time: number,
  pathYaw?: number,
) {
  const frame = evaluateDirectorRigFrame(subject, time);
  const joints = group.userData.directorJoints as Map<string, THREE.Object3D> | undefined;
  const joint = (name: string) => joints?.get(name);
  const applyJointAngle = (
    target: THREE.Object3D | undefined,
    name: DirectorRigJoint,
    angle: number,
  ) => {
    if (!target) return;
    const rest = target.userData.directorRigRestQuaternion as THREE.Quaternion | undefined;
    const frontAxis = target.userData.directorRigFrontAxis as THREE.Vector3 | undefined;
    const rightAxis = target.userData.directorRigRightAxis as THREE.Vector3 | undefined;
    const axis = builtInRigMotionAxis(target, name, subject);
    if (rest && axis) {
      const calibration = (target.userData.directorRigCalibration as number | undefined) ?? 0;
      target.quaternion.copy(rest);
      if (frontAxis && calibration) {
        target.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(frontAxis, calibration),
        );
      }
      target.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          axis,
          degrees(angle * builtInRigAngleSign(name, subject)),
        ),
      );
      if (
        rightAxis &&
        !usesSagittalShoulderMotion(subject) &&
        (name === 'leftShoulder' || name === 'rightShoulder')
      ) {
        const elbow = name === 'leftShoulder' ? frame.joints.leftElbow : frame.joints.rightElbow;
        const frontOffset =
          directorArmBodyClearanceDegrees(angle, elbow) +
          directorArmHangForwardDegrees(angle, elbow);
        if (frontOffset > 0) {
          target.quaternion.premultiply(
            new THREE.Quaternion().setFromAxisAngle(rightAxis, degrees(-frontOffset)),
          );
        }
      }
      return;
    }
    target.rotation.z = degrees(angle);
  };
  for (const [name, angle] of Object.entries(frame.joints)) {
    if (name === 'spine' || name === 'neck') continue;
    const target = joint(name);
    applyJointAngle(target, name as DirectorRigJoint, angle);
  }
  const spine = joint('spine');
  const neck = joint('neck');
  applyJointAngle(spine, 'spine', frame.joints.spine + (subject.poseLean ?? 0));
  if (neck) {
    applyJointAngle(neck, 'neck', frame.joints.neck + (subject.headTilt ?? 0));
    const headTurn = pathYaw === undefined ? degrees(subject.headTurn ?? 0) : 0;
    const rest = neck.userData.directorRigRestQuaternion as THREE.Quaternion | undefined;
    const yawAxis = neck.userData.directorRigYawAxis as THREE.Vector3 | undefined;
    if (rest && yawAxis && headTurn) {
      neck.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(yawAxis, headTurn));
    } else if (!rest) {
      neck.rotation.y = headTurn;
    }
  }
  group.position.y = directorStageHeight(subject.height) + frame.rootY;
  group.rotation.y = pathYaw ?? degrees(-subject.bodyAngle) + frame.rootYaw;
}

export function applyDirectorPreviewPose(
  group: THREE.Group,
  subject: DirectorSubjectPlacement,
  time = 0,
) {
  applyBuiltInRig(group, subject, time);
}

export function directorPreviewWorldPosition(x: number, depth: number) {
  return worldPosition(x, depth);
}

function createSceneObject(object: DirectorSceneObject): DirectorRuntimeEntity {
  const group = new THREE.Group() as DirectorRuntimeEntity;
  group.name = object.label;
  group.userData = { directorRoot: true, directorKind: 'object', id: object.id };
  const material = new THREE.MeshStandardMaterial({
    color: object.color ?? (object.kind === 'landmark' ? '#d5a936' : '#c9682b'),
    roughness: 0.58,
    metalness: 0.12,
  });
  const addMesh = (geometry: THREE.BufferGeometry, y: number, x = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  switch (object.primitive ?? 'cube') {
    case 'sphere':
      addMesh(new THREE.SphereGeometry(0.68, 28, 18), 0.68);
      break;
    case 'cylinder':
      addMesh(new THREE.CylinderGeometry(0.58, 0.58, 1.45, 28), 0.725);
      break;
    case 'cone':
      addMesh(new THREE.ConeGeometry(0.72, 1.55, 28), 0.775);
      break;
    case 'wall':
      addMesh(new THREE.BoxGeometry(2.8, 1.75, 0.3), 0.875);
      break;
    case 'pillar':
      addMesh(new THREE.CylinderGeometry(0.43, 0.5, 2.2, 20), 1.1);
      addMesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 20), 0.09);
      addMesh(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 20), 2.11);
      break;
    case 'arch':
      addMesh(new THREE.BoxGeometry(0.48, 1.8, 0.5), 0.9, -0.9);
      addMesh(new THREE.BoxGeometry(0.48, 1.8, 0.5), 0.9, 0.9);
      addMesh(new THREE.BoxGeometry(2.28, 0.48, 0.5), 1.66);
      break;
    case 'stairs':
      for (let step = 0; step < 5; step += 1) {
        const height = 0.22 * (step + 1);
        addMesh(new THREE.BoxGeometry(2.1, height, 0.42), height / 2, 0, step * 0.4 - 0.8);
      }
      break;
    case 'cube':
    default:
      addMesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), 0.6);
      break;
  }
  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.84, 0.94, 40),
    new THREE.MeshBasicMaterial({
      color: '#f6c744',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.025;
  selectionRing.visible = false;
  group.add(selectionRing);
  group.userData.directorObjectMaterial = material;
  group.userData.directorSelectionRing = selectionRing;
  return group;
}

function createStageCamera(id: string, label: string): DirectorRuntimeEntity {
  const group = new THREE.Group() as DirectorRuntimeEntity;
  group.name = label;
  group.userData = { directorRoot: true, directorKind: 'camera', id };

  const aimPivot = new THREE.Group();
  aimPivot.name = `${label} · AIM`;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: '#f6c744',
    emissive: '#8a5700',
    emissiveIntensity: 0.36,
    roughness: 0.32,
    metalness: 0.46,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: '#172033',
    emissive: '#07111f',
    emissiveIntensity: 0.2,
    roughness: 0.38,
    metalness: 0.72,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.62), bodyMaterial);
  body.castShadow = true;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.36, 20), darkMaterial);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.46;
  const lensGlass = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 24),
    new THREE.MeshBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.88 }),
  );
  lensGlass.position.z = 0.655;

  const reelGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.15, 20);
  const reelLeft = new THREE.Mesh(reelGeometry, darkMaterial);
  const reelRight = new THREE.Mesh(reelGeometry, darkMaterial);
  for (const [reel, x] of [
    [reelLeft, -0.22],
    [reelRight, 0.22],
  ] as const) {
    reel.rotation.z = Math.PI / 2;
    reel.position.set(x, 0.4, -0.08);
    reel.castShadow = true;
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.16), darkMaterial);
  handle.position.set(0, 0.72, -0.05);

  const frustum = new THREE.Group();
  frustum.position.z = 0.68;
  const frustumPoints = [
    [-0.03, 0, 0, -0.72, -0.4, 1],
    [0.03, 0, 0, 0.72, -0.4, 1],
    [-0.03, 0, 0, -0.72, 0.4, 1],
    [0.03, 0, 0, 0.72, 0.4, 1],
    [-0.72, -0.4, 1, 0.72, -0.4, 1],
    [0.72, -0.4, 1, 0.72, 0.4, 1],
    [0.72, 0.4, 1, -0.72, 0.4, 1],
    [-0.72, 0.4, 1, -0.72, -0.4, 1],
  ].flat();
  const frustumMaterial = new THREE.LineBasicMaterial({
    color: '#67e8f9',
    transparent: true,
    opacity: 0.82,
  });
  const frustumLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(frustumPoints, 3),
    ),
    frustumMaterial,
  );
  const framePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.44, 0.8),
    new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  framePlane.position.z = 1;
  const framingVisual = new THREE.Group();
  framingVisual.add(frustumLines, framePlane);
  const direction = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, 0.04),
    1.16,
    '#f6c744',
    0.22,
    0.13,
  );
  frustum.add(framingVisual, direction);

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.82, 48),
    new THREE.MeshBasicMaterial({
      color: '#f6c744',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 1024;
  labelCanvas.height = 192;
  const context = labelCanvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(5, 10, 18, 0.9)';
    context.roundRect(8, 8, 1008, 176, 36);
    context.fill();
    context.strokeStyle = '#f6c744';
    context.lineWidth = 8;
    context.stroke();
    context.fillStyle = '#fff4bd';
    context.font = '600 68px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 512, 98, 920);
  }
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false }),
  );
  labelSprite.position.set(0, 1.14, 0);
  labelSprite.scale.set(2.8, 0.52, 1);
  labelSprite.renderOrder = 50;

  aimPivot.add(body, lens, lensGlass, reelLeft, reelRight, handle, frustum);
  group.add(aimPivot, selectionRing, labelSprite);
  group.userData.directorAimPivot = aimPivot;
  group.userData.directorFrustum = frustum;
  group.userData.directorFramingVisual = framingVisual;
  group.userData.directorSelectionRing = selectionRing;
  group.userData.directorCameraBodyMaterial = bodyMaterial;
  group.userData.directorCameraFrustumMaterial = frustumMaterial;
  return group;
}

function directorMotionPathLocalPoints(path: NonNullable<DirectorSubjectPlacement['motionPath']>) {
  const anchor = path.points[0] ?? { x: 50, depth: 50 };
  return path.points.map(
    (point) =>
      new THREE.Vector3(
        (point.x - anchor.x) * WORLD_UNIT,
        0.075,
        (point.depth - anchor.depth) * WORLD_UNIT,
      ),
  );
}

function createMotionPathGroup(subject: DirectorSubjectPlacement): DirectorRuntimeEntity | null {
  const path = subject.motionPath;
  const anchor = path?.points[0];
  if (!path || !anchor || path.points.length < 2) return null;
  const group = new THREE.Group() as DirectorRuntimeEntity;
  group.name = `${subject.label} · 根节点路径`;
  group.userData = {
    directorRoot: true,
    directorKind: 'path',
    id: subject.id,
    directorPathSignature: JSON.stringify(path),
  };
  group.position.copy(worldPosition(anchor.x, anchor.depth));
  const geometry = new THREE.BufferGeometry().setFromPoints(directorMotionPathLocalPoints(path));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: '#b36bff', transparent: true, opacity: 0.96 }),
  );
  line.name = 'director-motion-path-line';
  line.renderOrder = 42;
  const anchorRing = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.58, 32),
    new THREE.MeshBasicMaterial({
      color: '#f6c744',
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  anchorRing.name = 'director-motion-path-anchor';
  anchorRing.rotation.x = -Math.PI / 2;
  anchorRing.position.y = 0.08;
  anchorRing.visible = false;
  anchorRing.renderOrder = 43;
  group.add(line, anchorRing);
  group.userData.directorPathLine = line;
  group.userData.directorSelectionRing = anchorRing;
  return group;
}

function rootEntity(object: THREE.Object3D | undefined): DirectorRuntimeEntity | null {
  let current = object;
  while (current) {
    if (current.userData.directorRoot) return current as DirectorRuntimeEntity;
    current = current.parent ?? undefined;
  }
  return null;
}

function shouldIgnoreShortcut(event: KeyboardEvent) {
  if (event.isComposing) return true;
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Sprite
    ))
      return;
    object.geometry?.dispose();
    const materials = materialList(object.material);
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

export interface DirectorThreeStageHandle {
  captureLayout: () => string;
  captureAnimationFrames: (sampleCount?: number) => string[];
  captureAnimationVideo: () => Promise<DirectorPrevisCapture>;
}

export interface DirectorModelLoadStatus {
  loading: number;
  errors: number;
}

interface DirectorThreeStageProps {
  scene: DirectorSceneState;
  activeSubjectId: string | null;
  activeRigJoint?: ActiveRigJoint | null;
  activeSceneObjectId?: string | null;
  activeStageCameraId?: string | null;
  previewStageCameraId?: string | null;
  activeMotionPathSubjectId?: string | null;
  onSubjectChange: (id: string, patch: SubjectPatch) => void;
  onObjectChange: (id: string, patch: SceneObjectPatch) => void;
  onSceneObjectSelect?: (id: string | null) => void;
  onStageCameraChange?: (id: string, patch: Partial<Omit<DirectorStageCamera, 'id'>>) => void;
  onCameraChange: (patch: {
    cameraYaw: number;
    cameraPitch: number;
    cameraDistance: number;
  }) => void;
  onSubjectSelect: (id: string | null) => void;
  onRigJointSelect?: (selection: ActiveRigJoint | null) => void;
  onStageCameraSelect?: (id: string | null) => void;
  onMotionPathSelect?: (subjectId: string | null) => void;
  onCameraPresetDrop?: (presetKey: string, placement: { x: number; depth: number }) => void;
  onStagePrimaryPointerDown?: () => void;
  onKeyboardWalkStart?: () => void;
  onKeyboardViewPanStart?: () => void;
  playbackTime?: number;
  pathPreviewSubjectId?: string | null;
  transformMode?: TransformMode;
  cameraView?: CameraView;
  showRig?: boolean;
  onTransformModeChange?: (mode: TransformMode) => void;
  onModelLoadStatusChange?: (status: DirectorModelLoadStatus) => void;
}

export const DirectorThreeStage = forwardRef<DirectorThreeStageHandle, DirectorThreeStageProps>(
  (
    {
      scene,
      activeSubjectId,
      activeRigJoint = null,
      activeSceneObjectId = null,
      activeStageCameraId = null,
      previewStageCameraId = null,
      activeMotionPathSubjectId = null,
      onSubjectChange,
      onObjectChange,
      onSceneObjectSelect,
      onStageCameraChange,
      onCameraChange,
      onSubjectSelect,
      onRigJointSelect,
      onStageCameraSelect,
      onMotionPathSelect,
      onCameraPresetDrop,
      onStagePrimaryPointerDown,
      onKeyboardWalkStart,
      onKeyboardViewPanStart,
      playbackTime = 0,
      pathPreviewSubjectId = null,
      transformMode = 'translate',
      cameraView = 'shot',
      showRig = false,
      onTransformModeChange,
      onModelLoadStatusChange,
    },
    ref,
  ) => {
    const { t } = useAppTranslation();
    const hostRef = useRef<HTMLDivElement>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const orbitRef = useRef<OrbitControls | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const renderAtRef = useRef<((time: number) => void) | null>(null);
    const captureModeRef = useRef(false);
    const videoCaptureRef = useRef(false);
    const sceneRef = useRef(scene);
    const activeSubjectRef = useRef(activeSubjectId);
    const activeRigJointRef = useRef(activeRigJoint);
    const activeSceneObjectRef = useRef(activeSceneObjectId);
    const activeStageCameraRef = useRef(activeStageCameraId);
    const previewStageCameraRef = useRef(previewStageCameraId);
    const activeMotionPathSubjectRef = useRef(activeMotionPathSubjectId);
    const playbackRef = useRef(playbackTime);
    const pathPreviewRef = useRef(pathPreviewSubjectId);
    const transformModeRef = useRef(transformMode);
    const cameraViewRef = useRef(cameraView);
    const showRigRef = useRef(showRig);
    const zoomTargetRadiusRef = useRef<number | null>(null);
    const pendingCameraCommitRef = useRef<DirectorShotCameraState | null>(null);
    const appliedCameraViewRef = useRef<CameraView | null>(null);
    const [modelStates, setModelStates] = useState<ModelLoadState>({});
    const handlersRef = useRef({
      onSubjectChange,
      onObjectChange,
      onSceneObjectSelect,
      onStageCameraChange,
      onCameraChange,
      onSubjectSelect,
      onRigJointSelect,
      onStageCameraSelect,
      onMotionPathSelect,
      onCameraPresetDrop,
      onStagePrimaryPointerDown,
      onKeyboardWalkStart,
      onKeyboardViewPanStart,
      onTransformModeChange,
    });

    const entityKey = useMemo(
      () =>
        [
          scene.sceneUrl ?? '',
          ...scene.subjects.map(
            (item) => `${item.id}:${item.modelUrl ?? ''}:${item.motionPath?.type ?? ''}`,
          ),
          ...scene.sceneObjects.map((item) => `${item.id}:${item.primitive ?? 'cube'}`),
          ...(scene.stageCameras?.map((item) => `${item.id}:${item.label}`) ?? []),
        ].join('|'),
      [scene.sceneObjects, scene.sceneUrl, scene.stageCameras, scene.subjects],
    );

    useEffect(() => {
      sceneRef.current = scene;
      activeSubjectRef.current = activeSubjectId;
      activeRigJointRef.current = activeRigJoint;
      activeSceneObjectRef.current = activeSceneObjectId;
      activeStageCameraRef.current = activeStageCameraId;
      previewStageCameraRef.current = previewStageCameraId;
      activeMotionPathSubjectRef.current = activeMotionPathSubjectId;
      playbackRef.current = playbackTime;
      pathPreviewRef.current = pathPreviewSubjectId;
      transformModeRef.current = transformMode;
      cameraViewRef.current = cameraView;
      showRigRef.current = showRig;
      handlersRef.current = {
        onSubjectChange,
        onObjectChange,
        onSceneObjectSelect,
        onStageCameraChange,
        onCameraChange,
        onSubjectSelect,
        onRigJointSelect,
        onStageCameraSelect,
        onMotionPathSelect,
        onCameraPresetDrop,
        onStagePrimaryPointerDown,
        onKeyboardWalkStart,
        onKeyboardViewPanStart,
        onTransformModeChange,
      };
    }, [
      activeSubjectId,
      activeRigJoint,
      activeSceneObjectId,
      activeStageCameraId,
      previewStageCameraId,
      activeMotionPathSubjectId,
      cameraView,
      onCameraChange,
      onObjectChange,
      onSceneObjectSelect,
      onStageCameraChange,
      onSubjectChange,
      onSubjectSelect,
      onRigJointSelect,
      onStageCameraSelect,
      onMotionPathSelect,
      onCameraPresetDrop,
      onStagePrimaryPointerDown,
      onKeyboardWalkStart,
      onKeyboardViewPanStart,
      onTransformModeChange,
      pathPreviewSubjectId,
      playbackTime,
      scene,
      showRig,
      transformMode,
    ]);

    useImperativeHandle(ref, () => {
      const captureTimes = (sampleCount: number) =>
        sampleCount === 1
          ? [playbackRef.current]
          : directorAnimationSampleTimes(sceneRef.current.duration, sampleCount);
      const capture = (times: number[]) => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const renderAt = renderAtRef.current;
        if (!renderer || !camera || !renderAt) return [];
        const oldSize = renderer.getSize(new THREE.Vector2());
        const oldRatio = renderer.getPixelRatio();
        const oldAspect = camera.aspect;
        renderer.setPixelRatio(1);
        renderer.setSize(CAPTURE_WIDTH, CAPTURE_HEIGHT, false);
        camera.aspect = CAPTURE_WIDTH / CAPTURE_HEIGHT;
        camera.updateProjectionMatrix();
        captureModeRef.current = true;
        try {
          return times.map((time) => {
            renderAt(time);
            return renderer.domElement.toDataURL('image/jpeg', 0.9);
          });
        } finally {
          captureModeRef.current = false;
          renderer.setPixelRatio(oldRatio);
          renderer.setSize(oldSize.x, oldSize.y, false);
          camera.aspect = oldAspect;
          camera.updateProjectionMatrix();
          renderAt(playbackRef.current);
        }
      };

      const captureAnimationVideo = async (): Promise<DirectorPrevisCapture> => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const orbit = orbitRef.current;
        const renderAt = renderAtRef.current;
        if (!renderer || !camera || !orbit || !renderAt) {
          throw new Error('WebGL 舞台尚未准备好，无法录制 3D 动画。');
        }
        if (typeof MediaRecorder === 'undefined' || !renderer.domElement.captureStream) {
          throw new Error('当前浏览器不支持 3D 动画录制，请使用最新版 Chrome 或 Edge。');
        }
        const mimeType = selectDirectorPrevisMimeType((candidate) =>
          MediaRecorder.isTypeSupported(candidate),
        );
        if (!mimeType) throw new Error('当前浏览器没有可用的 WebM 视频编码器。');

        const oldSize = renderer.getSize(new THREE.Vector2());
        const oldRatio = renderer.getPixelRatio();
        const oldPosition = camera.position.clone();
        const oldQuaternion = camera.quaternion.clone();
        const oldUp = camera.up.clone();
        const oldAspect = camera.aspect;
        const oldFov = camera.fov;
        const oldOrbitTarget = orbit.target.clone();
        const currentScene = sceneRef.current;
        const selectedStageCamera = currentScene.stageCameras?.find(
          (candidate) => candidate.id === previewStageCameraRef.current,
        );
        let cameraLabel = '主镜头';
        if (selectedStageCamera) {
          const pose = getDirectorStageCameraCapturePose(selectedStageCamera);
          const target = new THREE.Vector3(
            pose.position.x + pose.direction.x,
            pose.position.y + pose.direction.y,
            pose.position.z + pose.direction.z,
          );
          camera.position.set(pose.position.x, pose.position.y, pose.position.z);
          camera.up.set(0, 1, 0);
          camera.lookAt(target);
          camera.fov = pose.fov;
          cameraLabel = selectedStageCamera.label;
        } else {
          const position = getDirectorShotCameraPosition(currentScene);
          camera.position.set(position.x, position.y, position.z);
          camera.up.set(0, 1, 0);
          camera.lookAt(
            DIRECTOR_CAMERA_TARGET.x,
            DIRECTOR_CAMERA_TARGET.y,
            DIRECTOR_CAMERA_TARGET.z,
          );
        }

        renderer.setPixelRatio(1);
        renderer.setSize(CAPTURE_WIDTH, CAPTURE_HEIGHT, false);
        camera.aspect = CAPTURE_WIDTH / CAPTURE_HEIGHT;
        camera.updateProjectionMatrix();
        captureModeRef.current = true;
        videoCaptureRef.current = true;

        const stream = renderer.domElement.captureStream(DIRECTOR_PREVIS_FPS);
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 5_000_000,
        });
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        });

        try {
          renderAt(0);
          const stopped = new Promise<void>((resolve, reject) => {
            recorder.addEventListener('stop', () => resolve(), { once: true });
            recorder.addEventListener(
              'error',
              () => reject(new Error('浏览器录制 3D 动画时发生错误。')),
              { once: true },
            );
          });
          recorder.start(250);
          const durationSeconds = Math.max(1, Math.min(15, currentScene.duration));
          const startedAt = performance.now();
          await new Promise<void>((resolve) => {
            const tick = (now: number) => {
              const elapsed = Math.min(durationSeconds, (now - startedAt) / 1000);
              renderAt(elapsed);
              if (elapsed >= durationSeconds) {
                resolve();
                return;
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          recorder.stop();
          await stopped;
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
          if (!blob.size) throw new Error('3D 动画录制结果为空，请重试。');
          return {
            blob,
            width: CAPTURE_WIDTH,
            height: CAPTURE_HEIGHT,
            durationSeconds,
            fps: DIRECTOR_PREVIS_FPS,
            cameraLabel,
          };
        } finally {
          if (recorder.state !== 'inactive') recorder.stop();
          for (const track of stream.getTracks()) track.stop();
          captureModeRef.current = false;
          videoCaptureRef.current = false;
          renderer.setPixelRatio(oldRatio);
          renderer.setSize(oldSize.x, oldSize.y, false);
          camera.position.copy(oldPosition);
          camera.quaternion.copy(oldQuaternion);
          camera.up.copy(oldUp);
          camera.aspect = oldAspect;
          camera.fov = oldFov;
          camera.updateProjectionMatrix();
          orbit.target.copy(oldOrbitTarget);
          orbit.update();
          renderAt(playbackRef.current);
        }
      };
      return {
        captureLayout: () => capture(captureTimes(1))[0] ?? '',
        captureAnimationFrames: (sampleCount = 3) => capture(captureTimes(sampleCount)),
        captureAnimationVideo,
      };
    }, []);

    useEffect(() => {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;
      if (!camera || !orbit) return;
      const viewChanged = appliedCameraViewRef.current !== cameraView;
      appliedCameraViewRef.current = cameraView;
      const pending = pendingCameraCommitRef.current;
      if (
        !viewChanged &&
        cameraView === 'shot' &&
        pending &&
        Math.abs(pending.cameraYaw - scene.cameraYaw) < 0.0001 &&
        Math.abs(pending.cameraPitch - scene.cameraPitch) < 0.0001 &&
        Math.abs(pending.cameraDistance - scene.cameraDistance) < 0.0001
      ) {
        pendingCameraCommitRef.current = null;
        return;
      }
      pendingCameraCommitRef.current = null;
      if (cameraView === 'director') {
        camera.position.set(9.5, 8.2, 11.5);
        orbit.target.set(0, 1.15, 0);
        camera.fov = 42;
      } else {
        const runtime = stageCameraRuntimePose(
          sceneRef.current,
          previewStageCameraRef.current,
          playbackRef.current,
        );
        if (runtime) {
          const { pose } = runtime;
          camera.position.set(pose.position.x, pose.position.y, pose.position.z);
          orbit.target.set(
            pose.position.x + pose.direction.x,
            pose.position.y + pose.direction.y,
            pose.position.z + pose.direction.z,
          );
          camera.fov = pose.fov;
        } else {
          const position = getDirectorShotCameraPosition(sceneRef.current);
          camera.position.set(position.x, position.y, position.z);
          orbit.target.set(
            DIRECTOR_CAMERA_TARGET.x,
            DIRECTOR_CAMERA_TARGET.y,
            DIRECTOR_CAMERA_TARGET.z,
          );
          camera.fov = 42;
        }
      }
      camera.updateProjectionMatrix();
      orbit.enabled =
        cameraView === 'director' ||
        !stageCameraRuntimePose(
          sceneRef.current,
          previewStageCameraRef.current,
          playbackRef.current,
        );
      zoomTargetRadiusRef.current = camera.position.distanceTo(orbit.target);
      orbit.update();
    }, [
      cameraView,
      previewStageCameraId,
      scene.cameraDistance,
      scene.cameraPitch,
      scene.cameraYaw,
      scene.stageCameras,
    ]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      let disposed = false;
      setModelStates(
        Object.fromEntries(
          sceneRef.current.subjects
            .filter((subject) =>
              Boolean(
                getDirectorCharacterPreset(subject.characterPreset).model || subject.modelUrl,
              ),
            )
            .map((subject) => [subject.id, 'loading' as const]),
        ),
      );
      const threeScene = new THREE.Scene();
      threeScene.background = new THREE.Color('#07090d');
      threeScene.fog = null;
      const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 1800);
      if (cameraViewRef.current === 'director') {
        camera.position.set(9.5, 8.2, 11.5);
      } else {
        const runtime = stageCameraRuntimePose(
          sceneRef.current,
          previewStageCameraRef.current,
          playbackRef.current,
        );
        if (runtime) {
          camera.position.set(
            runtime.pose.position.x,
            runtime.pose.position.y,
            runtime.pose.position.z,
          );
          camera.fov = runtime.pose.fov;
        } else {
          const position = getDirectorShotCameraPosition(sceneRef.current);
          camera.position.set(position.x, position.y, position.z);
        }
      }
      cameraRef.current = camera;
      appliedCameraViewRef.current = cameraViewRef.current;

      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      let panoramaTexture: THREE.Texture | null = null;
      let panoramaGroundMaterial: THREE.ShaderMaterial | null = null;
      rendererRef.current = renderer;
      renderer.setPixelRatio(getDirectorStagePixelRatio(window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      host.appendChild(renderer.domElement);

      const orbit = new OrbitControls(camera, renderer.domElement);
      const initialRuntime = stageCameraRuntimePose(
        sceneRef.current,
        previewStageCameraRef.current,
        playbackRef.current,
      );
      if (cameraViewRef.current === 'shot' && initialRuntime) {
        orbit.target.set(
          initialRuntime.pose.position.x + initialRuntime.pose.direction.x,
          initialRuntime.pose.position.y + initialRuntime.pose.direction.y,
          initialRuntime.pose.position.z + initialRuntime.pose.direction.z,
        );
      } else {
        orbit.target.set(
          DIRECTOR_CAMERA_TARGET.x,
          cameraViewRef.current === 'director' ? 1.15 : DIRECTOR_CAMERA_TARGET.y,
          DIRECTOR_CAMERA_TARGET.z,
        );
      }
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.12;
      orbit.rotateSpeed = 0.72;
      orbit.enablePan = false;
      orbit.enableZoom = false;
      orbit.enabled = cameraViewRef.current === 'director' || !initialRuntime;
      orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      orbit.minPolarAngle = degrees(35);
      orbit.maxPolarAngle = degrees(125);
      orbit.minDistance = DIRECTOR_CAMERA_RADIUS_MIN;
      orbit.maxDistance = DIRECTOR_CAMERA_RADIUS_MAX;
      orbit.update();
      orbitRef.current = orbit;
      zoomTargetRadiusRef.current = camera.position.distanceTo(orbit.target);

      const transform = new TransformControls(camera, renderer.domElement);
      transform.setMode(transformModeRef.current);
      transform.setSize(0.82);
      transform.setSpace('world');
      threeScene.add(transform.getHelper());
      let transformDragStart: THREE.Vector3 | null = null;
      transform.addEventListener('dragging-changed', (event) => {
        orbit.enabled = !event.value;
        transformDragStart = event.value
          ? (rootEntity(transform.object ?? undefined)?.position.clone() ?? null)
          : null;
      });
      transform.addEventListener('mouseUp', () => {
        const selected = rootEntity(transform.object ?? undefined);
        if (!selected) return;
        if (selected.userData.directorKind === 'path') {
          const subject = sceneRef.current.subjects.find(
            (candidate) => candidate.id === selected.userData.id,
          );
          if (!subject?.motionPath || !transformDragStart) return;
          const movedPath = translateDirectorMotionPath(
            subject.motionPath,
            (selected.position.x - transformDragStart.x) / WORLD_UNIT,
            (selected.position.z - transformDragStart.z) / WORLD_UNIT,
          );
          const anchor = movedPath.points[0];
          if (!anchor) return;
          const patch: SubjectPatch = {
            x: anchor.x,
            y: anchor.depth,
            depth: anchor.depth,
            motionPath: movedPath,
          };
          sceneRef.current = {
            ...sceneRef.current,
            subjects: sceneRef.current.subjects.map((candidate) =>
              candidate.id === subject.id ? { ...candidate, ...patch } : candidate,
            ),
          };
          handlersRef.current.onSubjectChange(subject.id, patch);
        } else if (selected.userData.directorKind === 'subject') {
          const position = directorPosition(selected.position);
          const patch: SubjectPatch = { ...position, y: position.depth };
          const subject = sceneRef.current.subjects.find(
            (candidate) => candidate.id === selected.userData.id,
          );
          if (transform.getMode() === 'translate') {
            const animationRootY =
              subject && !selected.userData.directorImported
                ? evaluateDirectorRigFrame(subject, playbackRef.current).rootY
                : 0;
            patch.height = directorStageHeight(selected.position.y - animationRootY);
          }
          let shiftedMotionPath = subject?.motionPath;
          if (transform.getMode() === 'translate' && subject?.motionPath?.points.length) {
            const deltaX = transformDragStart
              ? (selected.position.x - transformDragStart.x) / WORLD_UNIT
              : 0;
            const deltaDepth = transformDragStart
              ? (selected.position.z - transformDragStart.z) / WORLD_UNIT
              : 0;
            shiftedMotionPath = translateDirectorMotionPath(subject.motionPath, deltaX, deltaDepth);
          }
          if (transform.getMode() === 'rotate') {
            const animationYaw = subject
              ? evaluateDirectorRigFrame(subject, playbackRef.current).rootYaw
              : 0;
            patch.bodyAngle = Math.round(
              THREE.MathUtils.radToDeg(-(selected.rotation.y - animationYaw)),
            );
          }
          if (transform.getMode() === 'scale') {
            patch.scale = Math.round(Math.max(30, Math.min(300, selected.scale.x * 100)));
          }
          sceneRef.current = {
            ...sceneRef.current,
            subjects: sceneRef.current.subjects.map((subject) =>
              subject.id === selected.userData.id
                ? { ...subject, ...patch, motionPath: shiftedMotionPath }
                : subject,
            ),
          };
          handlersRef.current.onSubjectChange(selected.userData.id, {
            ...patch,
            ...(shiftedMotionPath ? { motionPath: shiftedMotionPath } : {}),
          });
        } else if (selected.userData.directorKind === 'object') {
          const position = directorPosition(selected.position);
          const patch: SceneObjectPatch = {};
          if (transform.getMode() === 'translate') {
            patch.x = position.x;
            patch.depth = position.depth;
            patch.y = position.depth;
            patch.height = directorStageHeight(selected.position.y);
          } else if (transform.getMode() === 'rotate') {
            const rawRotation = THREE.MathUtils.radToDeg(-selected.rotation.y);
            patch.rotationY = ((rawRotation + 180) % 360) - 180;
          } else if (transform.getMode() === 'scale') {
            const object = sceneRef.current.sceneObjects.find(
              (candidate) => candidate.id === selected.userData.id,
            );
            const uniformScale = Math.max(0.2, Math.min(10, (object?.scale ?? 100) / 100));
            patch.scaleX = Math.max(10, Math.min(2000, (selected.scale.x / uniformScale) * 100));
            patch.scaleY = Math.max(10, Math.min(5000, (selected.scale.y / uniformScale) * 100));
            patch.scaleZ = Math.max(10, Math.min(2000, (selected.scale.z / uniformScale) * 100));
          }
          sceneRef.current = {
            ...sceneRef.current,
            sceneObjects: sceneRef.current.sceneObjects.map((object) =>
              object.id === selected.userData.id ? { ...object, ...patch } : object,
            ),
          };
          handlersRef.current.onObjectChange(selected.userData.id, patch);
        } else if (selected.userData.directorKind === 'camera') {
          const cameraSpec = sceneRef.current.stageCameras?.find(
            (candidate) => candidate.id === selected.userData.id,
          );
          if (!cameraSpec) return;
          const position = directorPosition(selected.position);
          const patch: Partial<Omit<DirectorStageCamera, 'id'>> = {};
          if (transform.getMode() === 'translate') {
            const trackedSubject = sceneRef.current.subjects.find(
              (subject) => subject.id === cameraSpec.trackingSubjectId,
            );
            const progress = Math.max(
              0,
              Math.min(1, playbackRef.current / Math.max(0.01, sceneRef.current.duration)),
            );
            const initialTarget = trackedSubject
              ? subjectCameraTarget(trackedSubject, 0, sceneRef.current.sceneObjects)
              : undefined;
            const currentTarget = trackedSubject
              ? subjectCameraTarget(trackedSubject, progress, sceneRef.current.sceneObjects)
              : undefined;
            const followDeltaX =
              cameraSpec.trackingMode === 'follow-subject' && initialTarget && currentTarget
                ? (currentTarget.x - initialTarget.x) / WORLD_UNIT
                : 0;
            const followDeltaDepth =
              cameraSpec.trackingMode === 'follow-subject' && initialTarget && currentTarget
                ? (currentTarget.z - initialTarget.z) / WORLD_UNIT
                : 0;
            patch.x = Math.max(0, Math.min(100, position.x - followDeltaX));
            patch.depth = Math.max(0, Math.min(100, position.depth - followDeltaDepth));
            patch.height = Math.max(0.35, Math.min(8, selected.position.y));
          } else if (transform.getMode() === 'rotate') {
            const rawYaw = THREE.MathUtils.radToDeg(-selected.rotation.y);
            patch.yaw = ((rawYaw + 180) % 360) - 180;
          } else if (transform.getMode() === 'scale') {
            patch.distance = Math.max(20, Math.min(100, cameraSpec.distance * selected.scale.z));
            selected.scale.setScalar(1);
          }
          sceneRef.current = {
            ...sceneRef.current,
            stageCameras: sceneRef.current.stageCameras?.map((candidate) =>
              candidate.id === selected.userData.id ? { ...candidate, ...patch } : candidate,
            ),
          };
          handlersRef.current.onStageCameraChange?.(selected.userData.id, patch);
        }
      });
      let cameraInteractionDirty = false;
      let lastCameraMotionAt = 0;
      const markCameraInteraction = () => {
        if (cameraViewRef.current !== 'shot') return;
        cameraInteractionDirty = true;
        lastCameraMotionAt = performance.now();
      };
      const handleOrbitChange = () => {
        if (cameraInteractionDirty) lastCameraMotionAt = performance.now();
      };
      orbit.addEventListener('start', markCameraInteraction);
      orbit.addEventListener('change', handleOrbitChange);

      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        if (
          cameraViewRef.current === 'shot' &&
          stageCameraRuntimePose(
            sceneRef.current,
            previewStageCameraRef.current,
            playbackRef.current,
          )
        )
          return;
        const deltaScale =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? host.clientHeight
              : 1;
        const currentRadius = camera.position.distanceTo(orbit.target);
        zoomTargetRadiusRef.current = getDirectorWheelZoomTarget(
          zoomTargetRadiusRef.current ?? currentRadius,
          event.deltaY * deltaScale,
        );
        markCameraInteraction();
      };
      const preventContextMenu = (event: MouseEvent) => event.preventDefault();
      renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
      renderer.domElement.addEventListener('contextmenu', preventContextMenu);

      threeScene.add(new THREE.HemisphereLight('#ccecff', '#101118', 1.55));
      const keyLight = new THREE.DirectionalLight('#fff7e6', 2.9);
      keyLight.position.set(6, 11, 8);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      threeScene.add(keyLight);
      const fillLight = new THREE.PointLight('#57d7ff', 18, 18);
      fillLight.position.set(5, 3, -5);
      threeScene.add(fillLight);
      const rimLight = new THREE.PointLight('#8b5cf6', 24, 20);
      rimLight.position.set(-6, 5, -6);
      threeScene.add(rimLight);

      const floor = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(
        new THREE.PlaneGeometry(DIRECTOR_STAGE_SIZE, DIRECTOR_STAGE_SIZE),
        new THREE.MeshStandardMaterial({
          color: '#151922',
          roughness: 0.92,
          metalness: 0.05,
          side: THREE.DoubleSide,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      threeScene.add(floor);
      const panoramaShadowFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(DIRECTOR_STAGE_SIZE, DIRECTOR_STAGE_SIZE),
        new THREE.ShadowMaterial({
          color: '#000000',
          opacity: 0.24,
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      panoramaShadowFloor.rotation.x = -Math.PI / 2;
      panoramaShadowFloor.position.y = 0.003;
      panoramaShadowFloor.receiveShadow = true;
      panoramaShadowFloor.visible = false;
      threeScene.add(panoramaShadowFloor);
      const horizonGround = new THREE.Mesh<THREE.CircleGeometry, THREE.Material>(
        new THREE.CircleGeometry(DIRECTOR_HORIZON_GROUND_RADIUS, 128),
        new THREE.MeshStandardMaterial({
          color: '#11151d',
          roughness: 1,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
      );
      horizonGround.rotation.x = -Math.PI / 2;
      horizonGround.position.y = -0.04;
      horizonGround.receiveShadow = true;
      threeScene.add(horizonGround);
      const grid = new THREE.GridHelper(
        DIRECTOR_STAGE_SIZE,
        DIRECTOR_STAGE_GRID_DIVISIONS,
        '#4a91aa',
        '#315568',
      );
      grid.position.y = 0.012;
      const minorGrid = new THREE.GridHelper(
        DIRECTOR_STAGE_SIZE,
        DIRECTOR_STAGE_MINOR_GRID_DIVISIONS,
        '#25404d',
        '#21313b',
      );
      minorGrid.position.y = 0.008;
      const minorGridMaterials = Array.isArray(minorGrid.material)
        ? minorGrid.material
        : [minorGrid.material];
      for (const material of minorGridMaterials) {
        material.transparent = true;
        material.opacity = 0.28;
      }
      threeScene.add(minorGrid, grid);
      const axes = new THREE.AxesHelper(1.2);
      axes.position.set(-12, 0.025, 12);
      threeScene.add(axes);

      if (sceneRef.current.sceneUrl) {
        new THREE.TextureLoader().load(
          resolveMediaSourceUrl(sceneRef.current.sceneUrl),
          (texture) => {
            if (disposed) {
              texture.dispose();
              return;
            }
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            texture.generateMipmaps = true;
            texture.needsUpdate = true;
            panoramaTexture = texture;
            threeScene.background = texture;
            const previousFloorMaterial = floor.material;
            panoramaGroundMaterial = createDirectorPanoramaGroundMaterial(texture);
            floor.material = panoramaGroundMaterial;
            floor.receiveShadow = false;
            panoramaShadowFloor.visible = true;
            previousFloorMaterial.dispose();
            const previousHorizonMaterial = horizonGround.material;
            horizonGround.material = new THREE.MeshBasicMaterial({
              transparent: true,
              opacity: 0,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            previousHorizonMaterial.dispose();
            horizonGround.receiveShadow = false;
          },
        );
      }

      const actorGroups = new Map<string, DirectorRuntimeEntity>();
      const objectGroups = new Map<string, DirectorRuntimeEntity>();
      const motionPathGroups = new Map<string, DirectorRuntimeEntity>();
      const stageCameraGroups = new Map<string, DirectorRuntimeEntity>();
      const selectable: THREE.Object3D[] = [];

      sceneRef.current.subjects.forEach((subject) => {
        const group = createBuiltInSubject(subject);
        actorGroups.set(subject.id, group);
        selectable.push(group);
        threeScene.add(group);
        const pathGroup = createMotionPathGroup(subject);
        if (pathGroup) {
          motionPathGroups.set(subject.id, pathGroup);
          selectable.push(pathGroup);
          threeScene.add(pathGroup);
        }
        const builtInModel = getDirectorCharacterPreset(subject.characterPreset).model;
        if (builtInModel) {
          const loader = new GLTFLoader();
          loader.load(
            builtInModel.url,
            (gltf) => {
              const model = gltf.scene as THREE.Object3D;
              if (disposed) {
                disposeObject(model);
                return;
              }
              if (!installDirectorBuiltInSubjectModel(group, model, subject, builtInModel)) {
                disposeObject(model);
                group.userData.directorVisualReady = true;
                group.visible = true;
                setModelStates((current) => ({ ...current, [subject.id]: 'error' }));
                return;
              }
              applyBuiltInRig(group, subject, playbackRef.current);
              applySubjectColors(group, subject);
              group.visible = true;
              setModelStates((current) => ({ ...current, [subject.id]: 'ready' }));
            },
            undefined,
            () => {
              if (disposed) return;
              group.userData.directorVisualReady = true;
              group.visible = true;
              setModelStates((current) => ({ ...current, [subject.id]: 'error' }));
            },
          );
        } else if (subject.modelUrl) {
          setModelStates((current) => ({ ...current, [subject.id]: 'loading' }));
          void loadDirectorModelUrl(subject.modelUrl, subject.modelFormat)
            .then(({ scene: model, animations }) => {
              if (disposed) {
                disposeObject(model);
                return;
              }
              const bounds = new THREE.Box3().setFromObject(model);
              const size = bounds.getSize(new THREE.Vector3());
              const center = bounds.getCenter(new THREE.Vector3());
              const modelScale = size.y > 0 ? 2.78 / size.y : 1;
              model.scale.setScalar(modelScale);
              model.position.set(
                -center.x * modelScale,
                -bounds.min.y * modelScale,
                -center.z * modelScale,
              );
              const originalMaterials = new Set<THREE.Material>();
              model.traverse((child: THREE.Object3D) => {
                if (!(child instanceof THREE.Mesh)) return;
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = materialList(child.material).map((material) => {
                  originalMaterials.add(material);
                  return material.clone();
                });
                if (child.material.length === 1) child.material = child.material[0];
              });
              for (const material of originalMaterials) material.dispose();
              while (group.children.length > 0) {
                const child = group.children[0];
                if (!child) break;
                group.remove(child);
                disposeObject(child);
              }
              group.userData.directorImported = true;
              group.userData.directorVisualReady = true;
              group.userData.directorColorSignature = '';
              group.userData.directorJoints = new Map<string, THREE.Object3D>();
              group.userData.directorRigHelpers = [];
              group.userData.directorSelectionRing = undefined;
              group.add(model);
              const firstClip = animations[0];
              if (firstClip) {
                const mixer = new THREE.AnimationMixer(model);
                mixer.clipAction(firstClip).play();
                group.userData.directorMixer = mixer;
              }
              applySubjectColors(group, subject);
              group.visible = true;
              setModelStates((current) => ({ ...current, [subject.id]: 'ready' }));
            })
            .catch(() => {
              if (disposed) return;
              group.userData.directorVisualReady = true;
              group.visible = true;
              setModelStates((current) => ({ ...current, [subject.id]: 'error' }));
            });
        }
      });

      sceneRef.current.sceneObjects.forEach((object) => {
        const group = createSceneObject(object);
        objectGroups.set(object.id, group);
        selectable.push(group);
        threeScene.add(group);
      });
      sceneRef.current.stageCameras?.forEach((cameraSpec) => {
        const group = createStageCamera(cameraSpec.id, cameraSpec.label);
        stageCameraGroups.set(cameraSpec.id, group);
        selectable.push(group);
        threeScene.add(group);
      });

      const raycaster = new THREE.Raycaster();
      raycaster.params.Line = { threshold: 0.48 };
      const pointer = new THREE.Vector2();
      const setPointerFromEvent = (event: { clientX: number; clientY: number }) => {
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
      };
      const stageFloor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const handlePresetDragOver = (event: DragEvent) => {
        if (!Array.from(event.dataTransfer?.types ?? []).includes(DIRECTOR_CAMERA_PRESET_DRAG_TYPE))
          return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      };
      const handlePresetDrop = (event: DragEvent) => {
        const preset = event.dataTransfer?.getData(DIRECTOR_CAMERA_PRESET_DRAG_TYPE);
        if (!preset) return;
        event.preventDefault();
        setPointerFromEvent(event);
        const point = raycaster.ray.intersectPlane(stageFloor, new THREE.Vector3());
        if (!point) return;
        handlersRef.current.onCameraPresetDrop?.(preset, directorPosition(point));
      };
      let jointDrag:
        | {
            pointerId: number;
            subjectId: string;
            joint: DirectorRigJoint;
            jointObject: THREE.Object3D;
            plane: THREE.Plane;
            rigAxis?: THREE.Vector3;
            angleSign: number;
          }
        | undefined;

      const clearRigJointSelection = () => {
        activeRigJointRef.current = null;
        handlersRef.current.onRigJointSelect?.(null);
      };

      const beginRigJointDrag = (
        event: PointerEvent,
        entity: DirectorRuntimeEntity,
        helper: THREE.Object3D,
        joint: DirectorRigJoint,
      ) => {
        const jointObject = helper.parent;
        const jointParent = jointObject?.parent;
        if (!jointObject || !jointParent) return false;
        const subject = sceneRef.current.subjects.find(
          (candidate) => candidate.id === entity.userData.id,
        );
        if (!subject) return false;
        jointParent.updateWorldMatrix(true, false);
        jointObject.updateWorldMatrix(true, false);
        const origin = jointObject.getWorldPosition(new THREE.Vector3());
        const rigAxis = builtInRigMotionAxis(jointObject, joint, subject)?.clone();
        const normal = rigAxis
          ? rigAxis
              .clone()
              .applyQuaternion(jointParent.getWorldQuaternion(new THREE.Quaternion()))
              .normalize()
          : new THREE.Vector3(0, 0, 1)
              .applyQuaternion(entity.getWorldQuaternion(new THREE.Quaternion()))
              .normalize();
        jointDrag = {
          pointerId: event.pointerId,
          subjectId: entity.userData.id,
          joint,
          jointObject,
          plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin),
          rigAxis,
          angleSign: rigAxis ? builtInRigAngleSign(joint, subject) : 1,
        };
        activeRigJointRef.current = { subjectId: entity.userData.id, joint };
        transform.detach();
        orbit.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
        renderer.domElement.setPointerCapture?.(event.pointerId);
        handlersRef.current.onSubjectSelect(entity.userData.id);
        handlersRef.current.onSceneObjectSelect?.(null);
        handlersRef.current.onStageCameraSelect?.(null);
        handlersRef.current.onMotionPathSelect?.(null);
        handlersRef.current.onRigJointSelect?.({ subjectId: entity.userData.id, joint });
        return true;
      };

      const dragRigJoint = (event: PointerEvent) => {
        if (!jointDrag || event.pointerId !== jointDrag.pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setPointerFromEvent(event);
        const worldTarget = raycaster.ray.intersectPlane(jointDrag.plane, new THREE.Vector3());
        const jointParent = jointDrag.jointObject.parent;
        if (!worldTarget || !jointParent) return;
        const localTarget = jointParent.worldToLocal(worldTarget.clone());
        const localDirection = localTarget.sub(jointDrag.jointObject.position);
        if (localDirection.lengthSq() < 0.000001) return;
        const zeroDirection = jointDrag.jointObject.userData.directorRigZeroDirection as
          THREE.Vector3 | undefined;
        const rigAxis = jointDrag.rigAxis;
        const targetAngle =
          THREE.MathUtils.radToDeg(
            zeroDirection && rigAxis
              ? signedAngleAroundAxis(zeroDirection, localDirection.clone().normalize(), rigAxis)
              : Math.atan2(localDirection.x, -localDirection.y),
          ) / jointDrag.angleSign;
        const subject = sceneRef.current.subjects.find(
          (candidate) => candidate.id === jointDrag?.subjectId,
        );
        if (!subject) return;
        const baseAngle = evaluateDirectorRigFrame({ ...subject, rigPose: {} }, playbackRef.current)
          .joints[jointDrag.joint];
        const rigPose = patchDirectorJointFromTargetAngle(
          subject.rigPose,
          jointDrag.joint,
          targetAngle,
          baseAngle,
          subject.linkLimbs !== false,
        );
        sceneRef.current = {
          ...sceneRef.current,
          subjects: sceneRef.current.subjects.map((candidate) =>
            candidate.id === subject.id ? { ...candidate, rigPose } : candidate,
          ),
        };
        handlersRef.current.onSubjectChange(subject.id, { rigPose });
      };

      const endRigJointDrag = (event: PointerEvent) => {
        if (!jointDrag || event.pointerId !== jointDrag.pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        renderer.domElement.releasePointerCapture?.(event.pointerId);
        jointDrag = undefined;
        orbit.enabled = true;
        renderer.domElement.style.cursor = 'default';
      };

      const selectAtPointer = (event: PointerEvent) => {
        if (event.button !== 0) return;
        if (transform.dragging) return;
        handlersRef.current.onStagePrimaryPointerDown?.();
        setPointerFromEvent(event);
        const intersections = raycaster.intersectObjects(selectable, true);
        const jointHit = showRigRef.current
          ? intersections.find((intersection) => {
              const joint = intersection.object.userData.directorRigJoint;
              const entity = rootEntity(intersection.object);
              return (
                intersection.object.visible &&
                typeof joint === 'string' &&
                DIRECTOR_RIG_JOINTS.some((definition) => definition.id === joint) &&
                entity?.userData.directorKind === 'subject' &&
                entity.userData.id === activeSubjectRef.current &&
                !entity.userData.directorImported
              );
            })
          : undefined;
        if (jointHit) {
          const entity = rootEntity(jointHit.object);
          const joint = jointHit.object.userData.directorRigJoint as DirectorRigJoint;
          if (entity && beginRigJointDrag(event, entity, jointHit.object, joint)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
        }
        const entity = rootEntity(intersections[0]?.object);
        if (!entity) {
          transform.detach();
          clearRigJointSelection();
          handlersRef.current.onSubjectSelect(null);
          handlersRef.current.onSceneObjectSelect?.(null);
          handlersRef.current.onStageCameraSelect?.(null);
          handlersRef.current.onMotionPathSelect?.(null);
          return;
        }
        clearRigJointSelection();
        transform.attach(entity);
        if (entity.userData.directorKind === 'subject') {
          handlersRef.current.onSceneObjectSelect?.(null);
          handlersRef.current.onStageCameraSelect?.(null);
          handlersRef.current.onMotionPathSelect?.(null);
          handlersRef.current.onSubjectSelect(entity.userData.id);
        } else if (entity.userData.directorKind === 'object') {
          handlersRef.current.onSubjectSelect(null);
          handlersRef.current.onStageCameraSelect?.(null);
          handlersRef.current.onMotionPathSelect?.(null);
          handlersRef.current.onSceneObjectSelect?.(entity.userData.id);
        } else if (entity.userData.directorKind === 'camera') {
          handlersRef.current.onSubjectSelect(null);
          handlersRef.current.onSceneObjectSelect?.(null);
          handlersRef.current.onMotionPathSelect?.(null);
          handlersRef.current.onStageCameraSelect?.(entity.userData.id);
        } else if (entity.userData.directorKind === 'path') {
          handlersRef.current.onSceneObjectSelect?.(null);
          handlersRef.current.onStageCameraSelect?.(null);
          handlersRef.current.onSubjectSelect(entity.userData.id);
          handlersRef.current.onMotionPathSelect?.(entity.userData.id);
        } else {
          handlersRef.current.onSubjectSelect(null);
          handlersRef.current.onSceneObjectSelect?.(null);
          handlersRef.current.onStageCameraSelect?.(null);
          handlersRef.current.onMotionPathSelect?.(null);
        }
      };
      renderer.domElement.addEventListener('pointerdown', selectAtPointer, true);
      renderer.domElement.addEventListener('pointermove', dragRigJoint, true);
      renderer.domElement.addEventListener('pointerup', endRigJointDrag, true);
      renderer.domElement.addEventListener('pointercancel', endRigJointDrag, true);
      renderer.domElement.addEventListener('dragover', handlePresetDragOver);
      renderer.domElement.addEventListener('drop', handlePresetDrop);

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setPixelRatio(getDirectorStagePixelRatio(window.devicePixelRatio || 1));
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();

      const pressedArrowKeys = new Set<string>();
      const cameraForward = new THREE.Vector3();
      const cameraRight = new THREE.Vector3();
      const keyboardWalkDirection = new THREE.Vector3();
      let keyboardWalkSubjectId: string | null = null;
      let keyboardViewPanning = false;
      let keyboardWalkSeconds = 0;
      let lastKeyboardWalkCommitAt = 0;
      let pendingKeyboardWalk: { subjectId: string; patch: SubjectPatch } | null = null;

      const commitKeyboardWalk = (force = false, now = performance.now()) => {
        if (
          !pendingKeyboardWalk ||
          (!force && now - lastKeyboardWalkCommitAt < DIRECTOR_KEYBOARD_WALK_COMMIT_INTERVAL)
        ) {
          return;
        }
        const pending = pendingKeyboardWalk;
        pendingKeyboardWalk = null;
        lastKeyboardWalkCommitAt = now;
        handlersRef.current.onSubjectChange(pending.subjectId, pending.patch);
      };

      const stopKeyboardControl = () => {
        commitKeyboardWalk(true);
        pressedArrowKeys.clear();
        keyboardWalkSubjectId = null;
        keyboardViewPanning = false;
        keyboardWalkSeconds = 0;
      };

      const updateKeyboardGroundDirection = () => {
        const horizontal =
          Number(pressedArrowKeys.has('ArrowRight')) - Number(pressedArrowKeys.has('ArrowLeft'));
        const vertical =
          Number(pressedArrowKeys.has('ArrowUp')) - Number(pressedArrowKeys.has('ArrowDown'));
        if (!horizontal && !vertical) return false;

        camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        if (cameraForward.lengthSq() < 0.000001) cameraForward.set(0, 0, -1);
        cameraForward.normalize();
        cameraRight.crossVectors(cameraForward, camera.up).normalize();
        keyboardWalkDirection
          .copy(cameraForward)
          .multiplyScalar(vertical)
          .addScaledVector(cameraRight, horizontal)
          .normalize();
        return true;
      };

      const advanceKeyboardWalk = (deltaSeconds: number, now: number) => {
        if (!pressedArrowKeys.size || !keyboardWalkSubjectId) return;
        if (
          activeSubjectRef.current !== keyboardWalkSubjectId ||
          activeRigJointRef.current ||
          activeMotionPathSubjectRef.current
        ) {
          stopKeyboardControl();
          return;
        }
        const subject = sceneRef.current.subjects.find(
          (candidate) => candidate.id === keyboardWalkSubjectId,
        );
        if (!subject) {
          stopKeyboardControl();
          return;
        }
        if (!updateKeyboardGroundDirection()) return;

        keyboardWalkSeconds += deltaSeconds;
        const progress = Math.max(
          0,
          Math.min(1, playbackRef.current / Math.max(0.01, sceneRef.current.duration)),
        );
        const runtimePosition = directorPosition(
          subjectRuntimePlacement(subject, progress, sceneRef.current.sceneObjects).position,
        );
        const step = stepDirectorKeyboardWalk(
          { ...runtimePosition, bodyAngle: subject.bodyAngle },
          { x: keyboardWalkDirection.x, depth: keyboardWalkDirection.z },
          deltaSeconds,
        );
        if (!step.moved) return;

        const collision = constrainDirectorMotionToScene(
          {
            type: 'line',
            points: [
              { x: runtimePosition.x, depth: runtimePosition.depth },
              { x: step.x, depth: step.depth },
            ],
          },
          1,
          sceneRef.current.sceneObjects,
          subject.scale,
        );
        const x = collision?.x ?? step.x;
        const depth = collision?.depth ?? step.depth;
        const deltaX = x - runtimePosition.x;
        const deltaDepth = depth - runtimePosition.depth;
        if (Math.hypot(deltaX, deltaDepth) < 0.000001) return;

        const nextX = Math.max(4, Math.min(96, subject.x + deltaX));
        const nextDepth = Math.max(0, Math.min(100, (subject.depth ?? subject.y) + deltaDepth));
        const shiftedMotionPath = subject.motionPath
          ? translateDirectorMotionPath(subject.motionPath, deltaX, deltaDepth)
          : undefined;
        const patch: SubjectPatch = {
          x: nextX,
          y: nextDepth,
          depth: nextDepth,
          bodyAngle: step.bodyAngle,
          ...(shiftedMotionPath ? { motionPath: shiftedMotionPath } : {}),
        };
        sceneRef.current = {
          ...sceneRef.current,
          subjects: sceneRef.current.subjects.map((candidate) =>
            candidate.id === subject.id ? { ...candidate, ...patch } : candidate,
          ),
        };
        pendingKeyboardWalk = { subjectId: subject.id, patch };
        commitKeyboardWalk(false, now);
      };

      const advanceKeyboardViewPan = (deltaSeconds: number) => {
        if (!pressedArrowKeys.size || !keyboardViewPanning) return;
        if (
          activeSubjectRef.current ||
          activeRigJointRef.current ||
          activeSceneObjectRef.current ||
          activeStageCameraRef.current ||
          activeMotionPathSubjectRef.current
        ) {
          stopKeyboardControl();
          return;
        }
        if (cameraViewRef.current !== 'director' || !updateKeyboardGroundDirection()) return;

        const pan = stepDirectorKeyboardViewPan(
          { x: orbit.target.x, z: orbit.target.z },
          { x: keyboardWalkDirection.x, z: keyboardWalkDirection.z },
          deltaSeconds,
          DIRECTOR_STAGE_SIZE / 2,
        );
        if (!pan.moved) return;
        camera.position.x += pan.deltaX;
        camera.position.z += pan.deltaZ;
        orbit.target.x = pan.x;
        orbit.target.z = pan.z;
        zoomTargetRadiusRef.current = camera.position.distanceTo(orbit.target);
        orbit.update();
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (shouldIgnoreShortcut(event)) return;
        if (
          event.key === 'ArrowUp' ||
          event.key === 'ArrowDown' ||
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight'
        ) {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const selectedSubjectId = activeSubjectRef.current;
          const controlsSubject = Boolean(
            selectedSubjectId &&
            !activeRigJointRef.current &&
            !activeMotionPathSubjectRef.current &&
            !transform.dragging,
          );
          const controlsView = Boolean(
            !selectedSubjectId &&
            !activeRigJointRef.current &&
            !activeSceneObjectRef.current &&
            !activeStageCameraRef.current &&
            !activeMotionPathSubjectRef.current &&
            !transform.dragging,
          );
          if (!controlsSubject && !controlsView) return;
          event.preventDefault();
          event.stopPropagation();
          if (controlsSubject && keyboardWalkSubjectId !== selectedSubjectId) {
            stopKeyboardControl();
            keyboardWalkSubjectId = selectedSubjectId;
            handlersRef.current.onKeyboardWalkStart?.();
          } else if (controlsView && !keyboardViewPanning) {
            stopKeyboardControl();
            keyboardViewPanning = true;
            handlersRef.current.onKeyboardViewPanStart?.();
          }
          pressedArrowKeys.add(event.key);
          return;
        }
        const key = event.key.toLowerCase();
        const nextMode =
          key === 'g' ? 'translate' : key === 'r' ? 'rotate' : key === 's' ? 'scale' : null;
        if (!nextMode) return;
        transform.setMode(nextMode);
        transformModeRef.current = nextMode;
        handlersRef.current.onTransformModeChange?.(nextMode);
      };
      const handleKeyUp = (event: KeyboardEvent) => {
        if (!pressedArrowKeys.has(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        pressedArrowKeys.delete(event.key);
        if (!pressedArrowKeys.size) stopKeyboardControl();
      };
      const handleWindowBlur = () => stopKeyboardControl();
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleWindowBlur);

      const renderAt = (time: number) => {
        const current = sceneRef.current;
        threeScene.backgroundRotation.x = degrees(
          directorPanoramaBackgroundPitchDegrees(
            current.sceneHorizonPitch,
            current.scenePanoramaLift,
          ),
        );
        const panoramaVerticalOffset = panoramaGroundMaterial?.uniforms.panoramaVerticalOffset;
        if (panoramaVerticalOffset) {
          panoramaVerticalOffset.value = directorPanoramaGroundVerticalOffset(
            current.sceneHorizonPitch,
            current.scenePanoramaLift,
          );
        }
        const progress = Math.max(0, Math.min(1, time / Math.max(0.01, current.duration)));
        const lensRuntime =
          cameraViewRef.current === 'shot'
            ? stageCameraRuntimePose(current, previewStageCameraRef.current, time)
            : null;
        transform.setMode(
          activeMotionPathSubjectRef.current ? 'translate' : transformModeRef.current,
        );
        const rigEditing = showRigRef.current && Boolean(activeSubjectRef.current);
        transform.getHelper().visible = !captureModeRef.current && !lensRuntime && !rigEditing;
        grid.visible = !captureModeRef.current && !lensRuntime;
        minorGrid.visible = !captureModeRef.current && !lensRuntime;
        axes.visible = !captureModeRef.current && !lensRuntime;
        current.subjects.forEach((subject) => {
          const group = actorGroups.get(subject.id);
          if (!group) return;
          const keyboardWalking = keyboardWalkSubjectId === subject.id && pressedArrowKeys.size > 0;
          const renderedSubject: DirectorSubjectPlacement = keyboardWalking
            ? { ...subject, posePreset: 'stand', rigPose: {}, animationClip: 'walk' }
            : subject;
          const renderedTime = keyboardWalking ? keyboardWalkSeconds : time;
          const motionPath = subject.motionPath;
          const path = motionPath?.points;
          const placement = subjectRuntimePlacement(subject, progress, current.sceneObjects);
          const pathYaw = keyboardWalking ? undefined : placement.pathYaw;
          if (!(transform.dragging && transform.object === group)) {
            group.position.copy(placement.position);
            group.scale.setScalar(Math.max(0.3, Math.min(3, subject.scale / 100)));
            if (group.userData.directorImported) {
              group.rotation.y = pathYaw ?? degrees(-subject.bodyAngle);
              group.position.y = directorStageHeight(subject.height);
              const mixer = group.userData.directorMixer;
              if (mixer)
                mixer.setTime(Math.max(0, renderedTime * (renderedSubject.animationSpeed ?? 1)));
            } else {
              applyBuiltInRig(group, renderedSubject, renderedTime, pathYaw);
            }
          }
          applySubjectColors(group, subject);
          group.visible =
            group.userData.directorVisualReady !== false &&
            (captureModeRef.current || !pathPreviewRef.current);
          const rigHelpers = group.userData.directorRigHelpers as THREE.Object3D[] | undefined;
          for (const helper of rigHelpers ?? []) {
            const rigJoint = helper.userData.directorRigJoint as DirectorRigJoint | undefined;
            const selectedJoint =
              activeRigJointRef.current?.subjectId === subject.id &&
              activeRigJointRef.current.joint === rigJoint;
            helper.visible =
              !captureModeRef.current &&
              !lensRuntime &&
              showRigRef.current &&
              activeSubjectRef.current === subject.id;
            updateDirectorRigHelperAppearance(helper, selectedJoint);
          }
          const ring = group.userData.directorSelectionRing as THREE.Object3D | undefined;
          if (ring)
            ring.visible =
              !captureModeRef.current &&
              !lensRuntime &&
              activeSubjectRef.current === subject.id &&
              activeMotionPathSubjectRef.current !== subject.id;
          const pathGroup = motionPathGroups.get(subject.id);
          if (pathGroup && path && motionPath) {
            pathGroup.visible =
              !captureModeRef.current &&
              !lensRuntime &&
              (!pathPreviewRef.current || pathPreviewRef.current === subject.id);
            const signature = JSON.stringify(path);
            if (
              !(transform.dragging && transform.object === pathGroup) &&
              pathGroup.userData.directorPathSignature !== signature
            ) {
              const anchor = path[0] ?? { x: subject.x, depth: subject.depth ?? subject.y };
              pathGroup.position.copy(worldPosition(anchor.x, anchor.depth));
              const line = pathGroup.userData.directorPathLine as THREE.Line | undefined;
              if (line) {
                line.geometry.setFromPoints(
                  directorMotionPathLocalPoints({
                    ...motionPath,
                    points: path,
                  }),
                );
              }
              pathGroup.userData.directorPathSignature = signature;
            }
            const selectedPath = activeMotionPathSubjectRef.current === subject.id;
            const line = pathGroup.userData.directorPathLine as THREE.Line | undefined;
            const lineMaterial = line?.material as THREE.LineBasicMaterial | undefined;
            if (lineMaterial) {
              lineMaterial.color.set(selectedPath ? '#f6c744' : '#b36bff');
              lineMaterial.opacity = selectedPath ? 1 : 0.86;
            }
            const anchorRing = pathGroup.userData.directorSelectionRing as THREE.Mesh | undefined;
            if (anchorRing) {
              anchorRing.visible = selectedPath;
            }
          }
        });
        current.sceneObjects.forEach((object) => {
          const group = objectGroups.get(object.id);
          if (!group || (transform.dragging && transform.object === group)) return;
          group.position.copy(worldPosition(object.x, object.depth ?? object.y));
          group.position.y = directorStageHeight(object.height);
          const objectScale = getDirectorSceneObjectScale(object);
          group.scale.set(objectScale.x, objectScale.y, objectScale.z);
          group.rotation.y = degrees(-(object.rotationY ?? 0));
          const material = group.userData.directorObjectMaterial as
            THREE.MeshStandardMaterial | undefined;
          if (material) material.color.set(object.color ?? '#c9682b');
          const selectionRing = group.userData.directorSelectionRing as THREE.Object3D | undefined;
          if (selectionRing) {
            selectionRing.visible =
              !captureModeRef.current && !lensRuntime && activeSceneObjectRef.current === object.id;
          }
        });
        current.stageCameras?.forEach((cameraSpec) => {
          const group = stageCameraGroups.get(cameraSpec.id);
          if (!group) return;
          const trackedSubject = current.subjects.find(
            (subject) => subject.id === cameraSpec.trackingSubjectId,
          );
          const initialTarget = trackedSubject
            ? subjectCameraTarget(trackedSubject, 0, current.sceneObjects)
            : undefined;
          const currentTarget = trackedSubject
            ? subjectCameraTarget(trackedSubject, progress, current.sceneObjects)
            : undefined;
          const cameraPose = getDirectorTrackedStageCameraCapturePose(
            cameraSpec,
            initialTarget,
            currentTarget,
          );
          if (!(transform.dragging && transform.object === group)) {
            group.position.set(cameraPose.position.x, cameraPose.position.y, cameraPose.position.z);
            if (cameraSpec.trackingMode === 'follow-subject' && currentTarget) {
              group.lookAt(currentTarget.x, currentTarget.y, currentTarget.z);
            } else {
              group.rotation.set(0, degrees(-cameraSpec.yaw), 0);
            }
            group.scale.setScalar(1);
          }
          const aimPivot = group.userData.directorAimPivot as THREE.Group | undefined;
          if (aimPivot)
            aimPivot.rotation.x =
              cameraSpec.trackingMode === 'follow-subject' && currentTarget
                ? 0
                : degrees(cameraSpec.pitch);
          const selected = activeStageCameraRef.current === cameraSpec.id;
          const frustum = group.userData.directorFrustum as THREE.Group | undefined;
          if (frustum) {
            const frustumScale = getDirectorStageCameraFrustumScale(cameraSpec.distance);
            frustum.scale.set(frustumScale.spread, frustumScale.spread, frustumScale.length);
          }
          const framingVisual = group.userData.directorFramingVisual as THREE.Group | undefined;
          if (framingVisual) {
            framingVisual.visible = !captureModeRef.current && !lensRuntime && selected;
          }
          const selectionRing = group.userData.directorSelectionRing as THREE.Mesh | undefined;
          if (selectionRing) {
            selectionRing.position.y = -(cameraSpec.height ?? 1.6) + 0.035;
            selectionRing.visible = !captureModeRef.current && !lensRuntime && selected;
          }
          const bodyMaterial = group.userData.directorCameraBodyMaterial as
            THREE.MeshStandardMaterial | undefined;
          if (bodyMaterial) bodyMaterial.emissiveIntensity = selected ? 1.05 : 0.36;
          const frustumMaterial = group.userData.directorCameraFrustumMaterial as
            THREE.LineBasicMaterial | undefined;
          if (frustumMaterial) frustumMaterial.opacity = selected ? 1 : 0.72;
          group.visible = !captureModeRef.current && !lensRuntime;
        });
        const capturedRuntime = videoCaptureRef.current
          ? stageCameraRuntimePose(current, previewStageCameraRef.current, time)
          : null;
        const viewportRuntime = capturedRuntime ?? lensRuntime;
        if (viewportRuntime) {
          const { pose } = viewportRuntime;
          camera.position.set(pose.position.x, pose.position.y, pose.position.z);
          camera.up.set(0, 1, 0);
          camera.lookAt(
            pose.position.x + pose.direction.x,
            pose.position.y + pose.direction.y,
            pose.position.z + pose.direction.z,
          );
          camera.fov = pose.fov;
          camera.updateProjectionMatrix();
        }
        const activeCamera = activeStageCameraRef.current;
        const activeObject = activeSceneObjectRef.current;
        const activeSubject = activeSubjectRef.current;
        const activeMotionPathSubject = activeMotionPathSubjectRef.current;
        const activeRigJoint =
          activeRigJointRef.current?.subjectId === activeSubject ? activeRigJointRef.current : null;
        if (!transform.dragging) {
          const activeGroup = activeObject
            ? objectGroups.get(activeObject)
            : activeCamera
              ? stageCameraGroups.get(activeCamera)
              : activeMotionPathSubject
                ? motionPathGroups.get(activeMotionPathSubject)
                : activeSubject && !activeRigJoint && !rigEditing
                  ? actorGroups.get(activeSubject)
                  : undefined;
          if (activeGroup && transform.object !== activeGroup) transform.attach(activeGroup);
          if (!activeGroup) transform.detach();
          const cameraSelected = Boolean(activeCamera);
          const objectSelected = Boolean(activeObject);
          const pathSelected = Boolean(activeMotionPathSubject);
          const subjectSelected = Boolean(activeSubject && !activeRigJoint && !rigEditing);
          transform.showX = true;
          transform.showY =
            !pathSelected &&
            (cameraSelected || objectSelected || subjectSelected) &&
            transformModeRef.current === 'translate';
          transform.showZ = true;
          if ((cameraSelected || objectSelected) && transformModeRef.current === 'rotate') {
            transform.showX = false;
            transform.showY = true;
            transform.showZ = false;
          } else if (objectSelected && transformModeRef.current === 'scale') {
            transform.showX = true;
            transform.showY = true;
            transform.showZ = true;
          }
        }
        renderer.render(threeScene, camera);
      };
      renderAtRef.current = renderAt;

      let frame = 0;
      let previousFrameAt = performance.now();
      const render = (now = performance.now()) => {
        const deltaSeconds = Math.min(0.05, Math.max(0, (now - previousFrameAt) / 1000));
        previousFrameAt = now;
        if (!videoCaptureRef.current) {
          const lensActive = Boolean(
            cameraViewRef.current === 'shot' &&
            stageCameraRuntimePose(
              sceneRef.current,
              previewStageCameraRef.current,
              playbackRef.current,
            ),
          );
          orbit.enabled = !lensActive && !transform.dragging;
          if (!lensActive) {
            orbit.update(deltaSeconds);
            const currentRadius = camera.position.distanceTo(orbit.target);
            const targetRadius = zoomTargetRadiusRef.current ?? currentRadius;
            const nextRadius = stepDirectorSmoothZoom(currentRadius, targetRadius, deltaSeconds);
            if (Math.abs(nextRadius - currentRadius) > 0.000001) {
              const direction = camera.position.clone().sub(orbit.target).normalize();
              camera.position.copy(orbit.target).addScaledVector(direction, nextRadius);
              markCameraInteraction();
            }
            const groundedCamera = groundDirectorCameraPosition(camera.position, orbit.target);
            if (groundedCamera.y !== camera.position.y) {
              camera.position.set(groundedCamera.x, groundedCamera.y, groundedCamera.z);
              markCameraInteraction();
            }
            if (
              cameraInteractionDirty &&
              cameraViewRef.current === 'shot' &&
              now - lastCameraMotionAt >= 160 &&
              Math.abs(nextRadius - targetRadius) < 0.001
            ) {
              cameraInteractionDirty = false;
              const committed = getDirectorShotCameraState(camera.position, orbit.target);
              pendingCameraCommitRef.current = committed;
              handlersRef.current.onCameraChange(committed);
            }
          }
          advanceKeyboardWalk(deltaSeconds, now);
          advanceKeyboardViewPan(deltaSeconds);
          renderAt(playbackRef.current);
        }
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleWindowBlur);
        renderer.domElement.removeEventListener('pointerdown', selectAtPointer, true);
        renderer.domElement.removeEventListener('pointermove', dragRigJoint, true);
        renderer.domElement.removeEventListener('pointerup', endRigJointDrag, true);
        renderer.domElement.removeEventListener('pointercancel', endRigJointDrag, true);
        renderer.domElement.removeEventListener('dragover', handlePresetDragOver);
        renderer.domElement.removeEventListener('drop', handlePresetDrop);
        renderer.domElement.removeEventListener('wheel', handleWheel);
        renderer.domElement.removeEventListener('contextmenu', preventContextMenu);
        orbit.removeEventListener('start', markCameraInteraction);
        orbit.removeEventListener('change', handleOrbitChange);
        renderer.domElement.style.cursor = 'default';
        transform.detach();
        transform.dispose();
        orbit.dispose();
        renderAtRef.current = null;
        cameraRef.current = null;
        orbitRef.current = null;
        disposeObject(threeScene);
        panoramaTexture?.dispose();
        renderer.dispose();
        rendererRef.current = null;
        renderer.domElement.remove();
      };
    }, [entityKey]);

    const loadingCount = Object.values(modelStates).filter((state) => state === 'loading').length;
    const errorCount = Object.values(modelStates).filter((state) => state === 'error').length;

    useEffect(() => {
      onModelLoadStatusChange?.({ loading: loadingCount, errors: errorCount });
    }, [errorCount, loadingCount, onModelLoadStatusChange]);

    return (
      <div
        className="absolute inset-0 z-[500] bg-[#07090d]"
        aria-label={t('director3d.stage.ariaLabel', '3D 导演预演舞台')}
      >
        <div ref={hostRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center bg-gradient-to-b from-black/78 to-transparent px-4 pb-8 pt-3 text-[11px] text-slate-200/80">
          <span className="absolute left-4 rounded border border-cyan-300/35 bg-slate-950/75 px-2 py-1 font-medium tracking-[0.14em] text-cyan-100">
            HUMANOID PREVIS · 16:9
          </span>
          <span className="hidden max-w-[62%] rounded bg-slate-950/60 px-3 py-1 text-center min-[1320px]:block">
            {t(
              'director3d.stage.instructions',
              '选中人偶：方向键行走 · 未选中：方向键平移视角 · G 移动 / R 旋转 / S 缩放',
            )}
          </span>
        </div>
        {(loadingCount > 0 || errorCount > 0) && (
          <div className="pointer-events-none absolute right-3 top-12 rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-white/75">
            {loadingCount > 0 && (
              <div>
                {t('director3d.stage.loadingModels', '正在载入 {count} 个外部模型…', {
                  count: loadingCount,
                })}
              </div>
            )}
            {errorCount > 0 && (
              <div className="text-red-200">
                {t(
                  'director3d.stage.modelLoadErrors',
                  '{count} 个模型载入失败，已使用内置角色代替',
                  { count: errorCount },
                )}
              </div>
            )}
          </div>
        )}
        {showRig &&
          activeSubjectId &&
          !scene.subjects.find((subject) => subject.id === activeSubjectId)?.modelAssetId && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-cyan-300/25 bg-slate-950/82 px-3 py-2 text-center text-[10px] text-cyan-50/88 shadow-lg">
              {activeRigJoint?.subjectId === activeSubjectId
                ? t(
                    'director3d.stage.rigJointSelected',
                    '{joint}已选中 · 继续拖动黄色圆点调整姿势',
                    {
                      joint:
                        DIRECTOR_RIG_JOINTS.find((joint) => joint.id === activeRigJoint.joint)
                          ?.label ?? t('director3d.stage.joint', '关节'),
                    },
                  )
                : t(
                    'director3d.stage.rigHelp',
                    '拖动人偶身上的白色圆点调整姿势 · 开启镜像联动可同步左右四肢',
                  )}
            </div>
          )}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-white/10 bg-slate-950/75 px-3 py-2 text-[10px] text-slate-300/80">
          {t(
            'director3d.stage.capabilities',
            '分层 Humanoid 关节 · 实时材质 · 固定 1280×720 动画关键帧导出',
          )}
        </div>
      </div>
    );
  },
);

DirectorThreeStage.displayName = 'DirectorThreeStage';
