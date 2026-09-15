import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createDefaultDirectorSubject } from '../lib/directorConstraints';
import { DIRECTOR_RIG_JOINTS, getDirectorCharacterPreset } from '../lib/directorCharacters';
import {
  applyDirectorPreviewPose,
  createDirectorPreviewSubject,
  directorArmBodyClearanceDegrees,
  directorArmHangForwardDegrees,
  installDirectorBuiltInSubjectModel,
  updateDirectorRigHelperAppearance,
} from './DirectorThreeStage';
import {
  applyPluginPoseRigFrame,
  applyPoseLandmarksToDirectorRig,
  installPluginStudioMannequinRig,
  normalizePluginPoseRigFrame,
  PLUGIN_POSE_RETARGET_SKELETON,
} from '../../data/plugins/qiansi-motion-capture/studio/pluginPoseRigModel';
import { PLUGIN_STUDIO_MANNEQUIN } from '../../data/plugins/qiansi-motion-capture/studio/mannequin';

function loadPluginMannequin() {
  const bytes = readFileSync(
    fileURLToPath(
      new URL(
        '../../data/plugins/qiansi-motion-capture/standalone/vendor/studio-mannequin.glb',
        import.meta.url,
      ),
    ),
  );
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise<GLTF>((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, reject);
  });
}

function loadBundledMannequin() {
  const bytes = readFileSync(
    fileURLToPath(new URL('../assets/director/studio-mannequin.glb', import.meta.url)),
  );
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise<GLTF>((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, reject);
  });
}

function loadBundledStudioMan() {
  const bytes = readFileSync(
    fileURLToPath(new URL('../assets/director/studio-man.glb', import.meta.url)),
  );
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise<GLTF>((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, reject);
  });
}

function mannequinSubject() {
  const preset = getDirectorCharacterPreset('studio-mannequin');
  return createDefaultDirectorSubject({
    id: 'mannequin',
    sourceNodeId: '',
    label: preset.label,
    imageUrl: '',
    characterPreset: preset.id,
    characterColors: { ...preset.colors },
    animationClip: 'none',
    x: 50,
    y: 50,
    depth: 50,
    height: 0,
    scale: 100,
    rotation: 0,
  });
}

function studioManSubject() {
  const preset = getDirectorCharacterPreset('studio-man');
  return createDefaultDirectorSubject({
    id: 'studio-man',
    sourceNodeId: '',
    label: preset.label,
    imageUrl: '',
    characterPreset: preset.id,
    characterColors: { ...preset.colors },
    animationClip: 'none',
    x: 50,
    y: 50,
    depth: 50,
    height: 0,
    scale: 100,
    rotation: 0,
  });
}

function boneDirection(group: THREE.Object3D, fromName: string, toName: string) {
  const from = group.getObjectByName(fromName);
  const to = group.getObjectByName(toName);
  if (!from || !to) throw new Error(`Missing test bones: ${fromName} -> ${toName}`);
  group.updateWorldMatrix(true, true);
  return to
    .getWorldPosition(new THREE.Vector3())
    .sub(from.getWorldPosition(new THREE.Vector3()))
    .normalize();
}

function deformedBounds(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  object.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) child.skeleton.update();
  });
  return new THREE.Box3().setFromObject(object, true);
}

function neutralCapturePoints() {
  const points = Array.from({ length: 33 }, () => [0, 1, 0] as [number, number, number]);
  for (const [index, point] of [
    [0, [0, 1.72, 0]],
    [11, [0.28, 1.42, 0]],
    [12, [-0.28, 1.42, 0]],
    [13, [0.58, 1.42, 0]],
    [14, [-0.58, 1.42, 0]],
    [15, [0.86, 1.42, 0]],
    [16, [-0.86, 1.42, 0]],
    [17, [0.94, 1.41, -0.02]],
    [18, [-0.94, 1.41, -0.02]],
    [19, [0.96, 1.42, 0.025]],
    [20, [-0.96, 1.42, 0.025]],
    [21, [0.9, 1.35, 0.04]],
    [22, [-0.9, 1.35, 0.04]],
    [23, [0.16, 0.91, 0]],
    [24, [-0.16, 0.91, 0]],
    [25, [0.17, 0.49, 0.03]],
    [26, [-0.17, 0.49, -0.02]],
    [27, [0.17, 0.08, 0]],
    [28, [-0.17, 0.08, 0]],
    [29, [0.17, 0.035, -0.06]],
    [30, [-0.17, 0.035, -0.06]],
    [31, [0.17, 0.035, 0.23]],
    [32, [-0.17, 0.035, 0.23]],
  ] as Array<[number, [number, number, number]]>) {
    points[index] = point;
  }
  return points;
}

function capturedHandPoints(side: 'left' | 'right', closed: boolean) {
  const direction = side === 'left' ? 1 : -1;
  const wristX = direction * 0.86;
  const points = Array.from({ length: 21 }, () => [wristX, 1.42, 0] as [number, number, number]);
  const fingers = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];
  fingers.forEach((indices, fingerIndex) => {
    const y = 1.49 - fingerIndex * 0.035;
    const base = wristX + direction * (0.045 + fingerIndex * 0.004);
    points[indices[0] as number] = [base, y, 0];
    if (closed) {
      points[indices[1] as number] = [base + direction * 0.085, y, 0];
      points[indices[2] as number] = [base + direction * 0.085, y - 0.08, 0.015];
      points[indices[3] as number] = [base, y - 0.08, 0.03];
    } else {
      points[indices[1] as number] = [base + direction * 0.08, y, 0];
      points[indices[2] as number] = [base + direction * 0.16, y, 0];
      points[indices[3] as number] = [base + direction * 0.24, y, 0];
    }
  });
  return points;
}

afterEach(() => vi.unstubAllGlobals());

describe('bundled director mannequin rig', () => {
  it('normalizes and applies AI retarget rotations, root motion, wrists and ankles', async () => {
    const frame = normalizePluginPoseRigFrame({
      type: 'frame',
      width: 1280,
      height: 720,
      pixelRatio: 1,
      retarget: {
        skeleton: PLUGIN_POSE_RETARGET_SKELETON,
        rotationSpace: 'local-rest-relative',
        rootTranslation: [0.4, 0.1, -0.2],
        rootRotation: [0, 0, 0, 2],
        jointRotations: {
          leftWrist: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)],
          leftAnkle: [Math.sin(Math.PI / 12), 0, 0, Math.cos(Math.PI / 12)],
        },
      },
    });
    expect(frame?.retarget?.rootRotation).toEqual([0, 0, 0, 1]);
    expect(
      normalizePluginPoseRigFrame({
        type: 'frame',
        width: 1,
        height: 1,
        pixelRatio: 1,
        retarget: {
          skeleton: PLUGIN_POSE_RETARGET_SKELETON,
          rotationSpace: 'local-rest-relative',
          rootTranslation: [0, 0, 0],
          rootRotation: [0, 0, 0, 1],
          jointRotations: { unknownJoint: [0, 0, 0, 1] },
        },
      }),
    ).toBeNull();

    const gltf = await loadPluginMannequin();
    const group = new THREE.Group();
    expect(installPluginStudioMannequinRig(group, gltf.scene)).toBe(true);
    const joints = group.userData.directorJoints as Map<string, THREE.Object3D>;
    const wristBefore = joints.get('leftWrist')?.quaternion.clone();
    const ankleBefore = joints.get('leftAnkle')?.quaternion.clone();
    if (!frame || !wristBefore || !ankleBefore)
      throw new Error('Expected complete AI rig fixture.');
    const wrist = joints.get('leftWrist');
    const ankle = joints.get('leftAnkle');
    if (!wrist || !ankle) throw new Error('Expected wrist and ankle rig targets.');

    expect(applyPluginPoseRigFrame(group, frame)).toBe(true);
    expect(group.position.toArray()).toEqual([0.4, 0.1, -0.2]);
    expect(wristBefore.angleTo(wrist.quaternion)).toBeCloseTo(Math.PI / 4, 5);
    expect(ankleBefore.angleTo(ankle.quaternion)).toBeCloseTo(Math.PI / 6, 5);
  });

  it('accepts full-range editor rotations and applies them to the plugin mannequin', async () => {
    const frame = normalizePluginPoseRigFrame({
      type: 'frame',
      points: neutralCapturePoints(),
      width: 1280,
      height: 720,
      pixelRatio: 1,
      edit: {
        rootPosition: [0.25, 0, -0.1],
        rootRotation: [0, 90, 0],
        jointRotations: { spine: [120, 0, 0], leftWrist: [0, 0, 220] },
      },
      editor: { enabled: true, selectedJoint: 'leftWrist', axis: 'z' },
    });
    expect(frame?.edit).toMatchObject({
      rootPosition: [0.25, 0, -0.1],
      rootRotation: [0, 90, 0],
      jointRotations: { spine: [120, 0, 0], leftWrist: [0, 0, 180] },
    });

    const gltf = await loadPluginMannequin();
    const group = new THREE.Group();
    expect(installPluginStudioMannequinRig(group, gltf.scene)).toBe(true);
    const spine = (group.userData.directorJoints as Map<string, THREE.Object3D>).get('spine');
    if (!frame || !spine) throw new Error('Expected a valid editor rig fixture.');
    const neutral = normalizePluginPoseRigFrame({ ...frame, edit: undefined, editor: undefined });
    if (!neutral) throw new Error('Expected a neutral editor rig fixture.');
    expect(applyPluginPoseRigFrame(group, neutral)).toBe(true);
    const neutralSpine = spine.quaternion.clone();

    expect(applyPluginPoseRigFrame(group, frame)).toBe(true);
    expect(neutralSpine.angleTo(spine.quaternion)).toBeGreaterThan(1.5);
    expect(group.position.x).toBeCloseTo(0.25, 4);
    expect(group.position.z).toBeCloseTo(-0.1, 4);
  });

  it('drives the same bundled skinned mannequin from motion-capture landmarks', async () => {
    const gltf = await loadPluginMannequin();
    const group = new THREE.Group();
    expect(installPluginStudioMannequinRig(group, gltf.scene)).toBe(true);

    const points = neutralCapturePoints();
    expect(applyPoseLandmarksToDirectorRig(group, points)).toBe(true);
    expect(group.scale.x).toBeCloseTo((1.72 - 0.035) / PLUGIN_STUDIO_MANNEQUIN.targetHeight, 2);
    const modelFront = group.userData.pluginPoseRigModelFront as THREE.Vector3;
    expect(modelFront.clone().applyQuaternion(group.quaternion).z).toBeGreaterThan(0.9);
    const joints = group.userData.directorJoints as Map<string, THREE.Object3D>;
    expect(joints.has('leftWrist')).toBe(true);
    expect(joints.has('rightWrist')).toBe(true);
    const neutralArm = boneDirection(group, 'mixamorigLeftArm', 'mixamorigLeftForeArm');
    expect(neutralArm.x).toBeGreaterThan(0.8);
    expect(Math.abs(neutralArm.y)).toBeLessThan(0.35);
    const leftPalm = boneDirection(group, 'mixamorigLeftHand', 'mixamorigLeftHandMiddle1');
    const rightPalm = boneDirection(group, 'mixamorigRightHand', 'mixamorigRightHandMiddle1');
    expect(leftPalm.x).toBeGreaterThan(0.65);
    expect(rightPalm.x).toBeLessThan(-0.65);

    const mirroredPoints = neutralCapturePoints().map(
      ([x, y, z]) => [-x, y, z] as [number, number, number],
    );
    expect(applyPoseLandmarksToDirectorRig(group, mirroredPoints)).toBe(true);
    expect(modelFront.clone().applyQuaternion(group.quaternion).z).toBeGreaterThan(0.9);

    const readableScale = group.scale.x;
    const collapsedPoints = neutralCapturePoints().map(
      ([x, _y, z]) => [x * 0.01, 0.01, z * 0.01] as [number, number, number],
    );
    expect(applyPoseLandmarksToDirectorRig(group, collapsedPoints)).toBe(false);
    expect(group.scale.x).toBeCloseTo(readableScale, 6);

    points[13] = [0.46, 1.2, 0.08];
    expect(applyPoseLandmarksToDirectorRig(group, points)).toBe(true);
    const loweredArm = boneDirection(group, 'mixamorigLeftArm', 'mixamorigLeftForeArm');
    expect(loweredArm.y).toBeLessThan(-0.45);

    const crossedPoints = neutralCapturePoints();
    crossedPoints[13] = [0.22, 1.3, 0];
    crossedPoints[14] = [-0.22, 1.3, 0];
    crossedPoints[15] = [0.04, 1.2, 0];
    crossedPoints[16] = [-0.04, 1.2, 0];
    for (const index of [17, 19, 21]) crossedPoints[index] = [0.03, 1.18, 0.02];
    for (const index of [18, 20, 22]) crossedPoints[index] = [-0.03, 1.18, 0.02];
    expect(applyPoseLandmarksToDirectorRig(group, crossedPoints)).toBe(true);
    group.updateWorldMatrix(true, true);
    const torsoDepth = group
      .getObjectByName('mixamorigSpine')
      ?.getWorldPosition(new THREE.Vector3()).z;
    const leftHandDepth = group
      .getObjectByName('mixamorigLeftHand')
      ?.getWorldPosition(new THREE.Vector3()).z;
    const rightHandDepth = group
      .getObjectByName('mixamorigRightHand')
      ?.getWorldPosition(new THREE.Vector3()).z;
    expect((leftHandDepth ?? 0) - (torsoDepth ?? 0)).toBeGreaterThan(0.08);
    expect((rightHandDepth ?? 0) - (torsoDepth ?? 0)).toBeGreaterThan(0.08);
    let skin: THREE.SkinnedMesh | undefined;
    group.traverse((object) => {
      if (!skin && object instanceof THREE.SkinnedMesh) skin = object;
    });
    expect(skin).toBeDefined();
  });

  it('keeps the deformed foot surface above the director-stage floor', async () => {
    const points = neutralCapturePoints();
    const capturedFloorY = [27, 28, 29, 30, 31, 32].reduce(
      (sum, index) => sum + (points[index]?.[1] ?? 0) / 6,
      0,
    );
    for (const point of points) point[1] -= capturedFloorY;
    points[29] = [points[29]?.[0] ?? 0, -0.07, points[29]?.[2] ?? 0];

    const frame = normalizePluginPoseRigFrame({
      type: 'frame',
      points,
      width: 1280,
      height: 720,
      pixelRatio: 1,
      showGrid: true,
    });
    const gltf = await loadPluginMannequin();
    const group = new THREE.Group();
    expect(installPluginStudioMannequinRig(group, gltf.scene)).toBe(true);
    if (!frame) throw new Error('Expected a valid floor-contact fixture.');

    expect(applyPluginPoseRigFrame(group, frame)).toBe(true);
    const bounds = deformedBounds(group);
    expect(bounds.min.y).toBeGreaterThanOrEqual(0.006);
    expect(bounds.min.y).toBeLessThan(0.012);

    expect(applyPluginPoseRigFrame(group, frame)).toBe(true);
    expect(deformedBounds(group).min.y).toBeCloseTo(0.008, 3);

    const unlockedFrame = normalizePluginPoseRigFrame({ ...frame, floorLock: false });
    const unlockedGltf = await loadPluginMannequin();
    const unlockedGroup = new THREE.Group();
    expect(installPluginStudioMannequinRig(unlockedGroup, unlockedGltf.scene)).toBe(true);
    expect(unlockedFrame?.floorLock).toBe(false);
    if (!unlockedFrame) throw new Error('Expected a valid unlocked-floor fixture.');
    expect(applyPluginPoseRigFrame(unlockedGroup, unlockedFrame)).toBe(true);
    expect(deformedBounds(unlockedGroup).min.y).toBeLessThan(-0.05);
  });

  it('drives all Mixamo finger chains from RTMW3D hand landmarks, including a closed fist', async () => {
    const gltf = await loadPluginMannequin();
    const group = new THREE.Group();
    expect(installPluginStudioMannequinRig(group, gltf.scene)).toBe(true);
    const baseFrame = {
      type: 'frame',
      points: neutralCapturePoints(),
      width: 1280,
      height: 720,
      pixelRatio: 1,
    } as const;
    const openFrame = normalizePluginPoseRigFrame({
      ...baseFrame,
      hands: {
        left: capturedHandPoints('left', false),
        right: capturedHandPoints('right', false),
      },
    });
    const closedFrame = normalizePluginPoseRigFrame({
      ...baseFrame,
      hands: {
        left: capturedHandPoints('left', true),
        right: capturedHandPoints('right', true),
      },
    });
    expect(openFrame?.hands?.left).toHaveLength(21);
    expect(closedFrame?.hands?.right).toHaveLength(21);
    expect(normalizePluginPoseRigFrame({ ...baseFrame, hands: { left: [[0, 0, 0]] } })).toBeNull();
    if (!openFrame || !closedFrame) throw new Error('Expected valid RTMW3D hand fixtures.');

    expect(applyPluginPoseRigFrame(group, openFrame)).toBe(true);
    const hand = group.getObjectByName('mixamorigLeftHand');
    const fingertip = group.getObjectByName('mixamorigLeftHandIndex4');
    const middleJoint = group.getObjectByName('mixamorigLeftHandIndex2');
    if (!hand || !fingertip || !middleJoint) throw new Error('Expected Mixamo finger bones.');
    group.updateWorldMatrix(true, true);
    const openDistance = hand
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(fingertip.getWorldPosition(new THREE.Vector3()));
    const openMiddleRotation = middleJoint.quaternion.clone();

    expect(applyPluginPoseRigFrame(group, closedFrame)).toBe(true);
    group.updateWorldMatrix(true, true);
    const closedDistance = hand
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(fingertip.getWorldPosition(new THREE.Vector3()));
    expect(closedDistance).toBeLessThan(openDistance * 0.82);
    expect(openMiddleRotation.angleTo(middleJoint.quaternion)).toBeGreaterThan(0.5);
    const fingerBones = group.userData.pluginPoseRigFingerBones as Map<string, THREE.Object3D>;
    expect(fingerBones.size).toBe(30);
  });

  it('keeps the procedural placeholder hidden while a real model is pending', () => {
    const bundledPreview = createDirectorPreviewSubject(mannequinSubject());
    expect(bundledPreview.visible).toBe(false);
    expect(bundledPreview.userData.directorVisualReady).toBe(false);

    const proceduralPreview = createDirectorPreviewSubject(
      createDefaultDirectorSubject({
        ...mannequinSubject(),
        id: 'procedural',
        characterPreset: 'cinematic-male',
        modelAssetId: undefined,
        modelUrl: undefined,
      }),
    );
    expect(proceduralPreview.visible).toBe(true);
    expect(proceduralPreview.userData.directorVisualReady).toBe(true);
  });

  it('resolves GLTFLoader-normalized Mixamo names and deforms the real skin bones', async () => {
    const preset = getDirectorCharacterPreset('studio-mannequin');
    const gltf = await loadBundledMannequin();
    const group = new THREE.Group();
    const subject = mannequinSubject();
    const spec = preset.model;
    expect(spec).toBeDefined();
    if (!spec) throw new Error('Studio mannequin model spec is missing.');
    expect(spec.faceDirection).toEqual([0, 0, 1]);

    expect(gltf.scene.getObjectByName('mixamorig:LeftArm')).toBeUndefined();
    expect(gltf.scene.getObjectByName('mixamorigLeftArm')).toBeInstanceOf(THREE.Bone);
    expect(installDirectorBuiltInSubjectModel(group, gltf.scene, subject, spec)).toBe(true);

    const joints = group.userData.directorJoints as Map<string, THREE.Object3D>;
    const helpers = group.userData.directorRigHelpers as THREE.Object3D[];
    expect(joints.size).toBe(DIRECTOR_RIG_JOINTS.length);
    expect(helpers).toHaveLength(DIRECTOR_RIG_JOINTS.length);
    const firstHelper = helpers[0];
    expect(firstHelper).toBeDefined();
    if (!firstHelper) throw new Error('Expected a real-model rig helper.');
    const baseScale = firstHelper.userData.directorRigBaseScale as number;
    expect(baseScale).toBeGreaterThan(1);
    updateDirectorRigHelperAppearance(firstHelper, false);
    expect(firstHelper.scale.x).toBeCloseTo(baseScale);
    updateDirectorRigHelperAppearance(firstHelper, true);
    expect(firstHelper.scale.x).toBeCloseTo(baseScale * 1.45);
    expect((firstHelper as THREE.Mesh).material).toMatchObject({
      depthTest: false,
      depthWrite: false,
      opacity: 1,
    });

    let skin: THREE.SkinnedMesh | undefined;
    group.traverse((object) => {
      if (!skin && object instanceof THREE.SkinnedMesh) skin = object;
    });
    expect(skin).toBeDefined();
    expect(
      [...joints.values()].every((joint) => skin?.skeleton.bones.includes(joint as THREE.Bone)),
    ).toBe(true);

    applyDirectorPreviewPose(group, subject, 0);
    group.updateWorldMatrix(true, true);
    const shoulder = joints.get('leftShoulder');
    const forearm = group.getObjectByName('mixamorigLeftForeArm');
    const elbow = joints.get('leftElbow');
    expect(shoulder).toBeDefined();
    expect(forearm).toBeDefined();
    expect(elbow).toBeDefined();
    if (!shoulder || !forearm || !elbow) throw new Error('Expected mapped arm bones.');
    const armDirection = forearm
      .getWorldPosition(new THREE.Vector3())
      .sub(shoulder.getWorldPosition(new THREE.Vector3()))
      .normalize();
    expect(armDirection.y).toBeLessThan(-0.9);
    expect(Math.abs(armDirection.z)).toBeLessThan(0.25);
    expect(directorArmHangForwardDegrees(-7, 3)).toBe(10);
    expect(directorArmHangForwardDegrees(-90, 0)).toBe(0);
    expect(directorArmHangForwardDegrees(-58, 104)).toBe(0);
    const hipsDepth = group
      .getObjectByName('mixamorigHips')
      ?.getWorldPosition(new THREE.Vector3()).z;
    const leftStandingHandDepth = group
      .getObjectByName('mixamorigLeftHand')
      ?.getWorldPosition(new THREE.Vector3()).z;
    const rightStandingHandDepth = group
      .getObjectByName('mixamorigRightHand')
      ?.getWorldPosition(new THREE.Vector3()).z;
    expect((leftStandingHandDepth ?? 0) - (hipsDepth ?? 0)).toBeGreaterThan(0);
    expect((rightStandingHandDepth ?? 0) - (hipsDepth ?? 0)).toBeGreaterThan(0);

    const neutral = elbow.quaternion.clone();
    applyDirectorPreviewPose(group, { ...subject, rigPose: { leftElbow: 45 } }, 0);
    expect(neutral.angleTo(elbow.quaternion)).toBeGreaterThan(0.2);

    applyDirectorPreviewPose(group, { ...subject, posePreset: 't-pose' }, 0);
    const leftTPoseArm = boneDirection(group, 'mixamorigLeftArm', 'mixamorigLeftForeArm');
    const rightTPoseArm = boneDirection(group, 'mixamorigRightArm', 'mixamorigRightForeArm');
    const leftTPoseHand = group
      .getObjectByName('mixamorigLeftHand')
      ?.getWorldPosition(new THREE.Vector3());
    const rightTPoseHand = group
      .getObjectByName('mixamorigRightHand')
      ?.getWorldPosition(new THREE.Vector3());
    expect(leftTPoseArm.x).toBeGreaterThan(0.9);
    expect(rightTPoseArm.x).toBeLessThan(-0.9);
    expect(leftTPoseArm.x * rightTPoseArm.x).toBeLessThan(-0.8);
    expect(Math.abs(leftTPoseArm.y)).toBeLessThan(0.12);
    expect(Math.abs(rightTPoseArm.y)).toBeLessThan(0.12);
    expect(Math.abs((leftTPoseHand?.x ?? 0) - (rightTPoseHand?.x ?? 0))).toBeGreaterThan(
      spec.targetHeight * 0.7,
    );

    applyDirectorPreviewPose(group, { ...subject, posePreset: 'sit' }, 0);
    const leftThigh = boneDirection(group, 'mixamorigLeftUpLeg', 'mixamorigLeftLeg');
    const rightThigh = boneDirection(group, 'mixamorigRightUpLeg', 'mixamorigRightLeg');
    const leftShin = boneDirection(group, 'mixamorigLeftLeg', 'mixamorigLeftFoot');
    const rightShin = boneDirection(group, 'mixamorigRightLeg', 'mixamorigRightFoot');
    expect(leftThigh.z).toBeGreaterThan(0.85);
    expect(rightThigh.z).toBeGreaterThan(0.85);
    expect(leftThigh.dot(rightThigh)).toBeGreaterThan(0.9);
    expect(leftShin.y).toBeLessThan(-0.85);
    expect(rightShin.y).toBeLessThan(-0.85);

    applyDirectorPreviewPose(group, { ...subject, posePreset: 'fold-arms' }, 0);
    expect(directorArmBodyClearanceDegrees(-58, 104)).toBeGreaterThan(18);
    expect(directorArmBodyClearanceDegrees(-7, 3)).toBe(0);
    const leftHugUpperArm = boneDirection(group, 'mixamorigLeftArm', 'mixamorigLeftForeArm');
    const rightHugUpperArm = boneDirection(group, 'mixamorigRightArm', 'mixamorigRightForeArm');
    const leftHugForearm = boneDirection(group, 'mixamorigLeftForeArm', 'mixamorigLeftHand');
    const rightHugForearm = boneDirection(group, 'mixamorigRightForeArm', 'mixamorigRightHand');
    const torsoDepth = group
      .getObjectByName('mixamorigSpine')
      ?.getWorldPosition(new THREE.Vector3()).z;
    const leftHandDepth = group
      .getObjectByName('mixamorigLeftHand')
      ?.getWorldPosition(new THREE.Vector3()).z;
    const rightHandDepth = group
      .getObjectByName('mixamorigRightHand')
      ?.getWorldPosition(new THREE.Vector3()).z;
    expect(leftHugUpperArm.z).toBeGreaterThan(0.15);
    expect(rightHugUpperArm.z).toBeGreaterThan(0.15);
    expect(leftHugForearm.z).toBeGreaterThan(0.7);
    expect(rightHugForearm.z).toBeGreaterThan(0.7);
    expect((leftHandDepth ?? 0) - (torsoDepth ?? 0)).toBeGreaterThan(0.25);
    expect((rightHandDepth ?? 0) - (torsoDepth ?? 0)).toBeGreaterThan(0.25);

    applyDirectorPreviewPose(group, { ...subject, posePreset: 'walk' }, 0);
    const leftWalkThigh = boneDirection(group, 'mixamorigLeftUpLeg', 'mixamorigLeftLeg');
    const rightWalkThigh = boneDirection(group, 'mixamorigRightUpLeg', 'mixamorigRightLeg');
    expect(leftWalkThigh.z * rightWalkThigh.z).toBeLessThan(-0.15);
  });

  it('keeps the procedural fallback intact when a bundled asset has no complete rig', () => {
    const preset = getDirectorCharacterPreset('studio-mannequin');
    const spec = preset.model;
    expect(spec).toBeDefined();
    if (!spec) throw new Error('Studio mannequin model spec is missing.');
    const group = new THREE.Group();
    const fallback = new THREE.Object3D();
    group.add(fallback);

    expect(
      installDirectorBuiltInSubjectModel(group, new THREE.Group(), mannequinSubject(), spec),
    ).toBe(false);
    expect(group.children).toContain(fallback);
  });

  it('binds the lightweight studio man through its mixamorig1 namespace and shared pose controls', async () => {
    const preset = getDirectorCharacterPreset('studio-man');
    const spec = preset.model;
    expect(spec).toBeDefined();
    if (!spec) throw new Error('Studio man model spec is missing.');
    expect(
      readFileSync(fileURLToPath(new URL('../assets/director/studio-man.glb', import.meta.url)))
        .byteLength,
    ).toBeLessThan(2 * 1024 * 1024);
    const gltf = await loadBundledStudioMan();
    const group = new THREE.Group();
    const subject = studioManSubject();

    expect(gltf.scene.getObjectByName('mixamorig1:LeftArm')).toBeUndefined();
    expect(gltf.scene.getObjectByName('mixamorig1LeftArm')).toBeInstanceOf(THREE.Bone);
    expect(installDirectorBuiltInSubjectModel(group, gltf.scene, subject, spec)).toBe(true);

    const joints = group.userData.directorJoints as Map<string, THREE.Object3D>;
    expect(joints.size).toBe(DIRECTOR_RIG_JOINTS.length);
    let skin: THREE.SkinnedMesh | undefined;
    group.traverse((object) => {
      if (!skin && object instanceof THREE.SkinnedMesh) skin = object;
    });
    expect(skin?.skeleton.bones).toHaveLength(65);
    const materials = skin ? (Array.isArray(skin.material) ? skin.material : [skin.material]) : [];
    expect(
      materials.every(
        (material) =>
          material instanceof THREE.MeshStandardMaterial &&
          material.map === null &&
          material.normalMap === null &&
          material.metalnessMap === null &&
          material.roughnessMap === null,
      ),
    ).toBe(true);
    expect(
      [...joints.values()].every((joint) => skin?.skeleton.bones.includes(joint as THREE.Bone)),
    ).toBe(true);

    applyDirectorPreviewPose(group, subject, 0);
    const leftStandingArm = boneDirection(group, 'mixamorig1LeftArm', 'mixamorig1LeftForeArm');
    const rightStandingArm = boneDirection(group, 'mixamorig1RightArm', 'mixamorig1RightForeArm');
    expect(leftStandingArm.y).toBeLessThan(-0.9);
    expect(rightStandingArm.y).toBeLessThan(-0.9);
    const leftElbow = joints.get('leftElbow');
    expect(leftElbow).toBeDefined();
    if (!leftElbow) throw new Error('Expected the studio man left elbow.');
    const neutralElbow = leftElbow.quaternion.clone();
    applyDirectorPreviewPose(group, { ...subject, rigPose: { leftElbow: 45 } }, 0);
    expect(neutralElbow.angleTo(leftElbow.quaternion)).toBeGreaterThan(0.2);

    applyDirectorPreviewPose(group, { ...subject, posePreset: 't-pose' }, 0);
    const leftTPoseArm = boneDirection(group, 'mixamorig1LeftArm', 'mixamorig1LeftForeArm');
    const rightTPoseArm = boneDirection(group, 'mixamorig1RightArm', 'mixamorig1RightForeArm');
    const leftTPoseHand = group
      .getObjectByName('mixamorig1LeftHand')
      ?.getWorldPosition(new THREE.Vector3());
    const rightTPoseHand = group
      .getObjectByName('mixamorig1RightHand')
      ?.getWorldPosition(new THREE.Vector3());
    expect(leftTPoseArm.x).toBeGreaterThan(0.9);
    expect(rightTPoseArm.x).toBeLessThan(-0.9);
    expect(leftTPoseArm.x * rightTPoseArm.x).toBeLessThan(-0.8);
    expect(Math.abs((leftTPoseHand?.x ?? 0) - (rightTPoseHand?.x ?? 0))).toBeGreaterThan(
      spec.targetHeight * 0.7,
    );

    applyDirectorPreviewPose(group, { ...subject, posePreset: 'reach' }, 0);
    const leftReachArm = boneDirection(group, 'mixamorig1LeftArm', 'mixamorig1LeftForeArm');
    const rightReachArm = boneDirection(group, 'mixamorig1RightArm', 'mixamorig1RightForeArm');
    const leftReachForearm = boneDirection(group, 'mixamorig1LeftForeArm', 'mixamorig1LeftHand');
    const rightReachForearm = boneDirection(group, 'mixamorig1RightForeArm', 'mixamorig1RightHand');
    const leftReachHand = group
      .getObjectByName('mixamorig1LeftHand')
      ?.getWorldPosition(new THREE.Vector3());
    const rightReachHand = group
      .getObjectByName('mixamorig1RightHand')
      ?.getWorldPosition(new THREE.Vector3());
    expect(leftReachArm.x).toBeGreaterThan(0.9);
    expect(rightReachArm.x).toBeLessThan(-0.9);
    expect(leftReachArm.dot(leftReachForearm)).toBeGreaterThan(0.95);
    expect(rightReachArm.dot(rightReachForearm)).toBeGreaterThan(0.95);
    expect(Math.abs((leftReachHand?.x ?? 0) - (rightReachHand?.x ?? 0))).toBeGreaterThan(
      spec.targetHeight * 0.7,
    );

    applyDirectorPreviewPose(group, { ...subject, posePreset: 'sit' }, 0);
    const leftThigh = boneDirection(group, 'mixamorig1LeftUpLeg', 'mixamorig1LeftLeg');
    const rightThigh = boneDirection(group, 'mixamorig1RightUpLeg', 'mixamorig1RightLeg');
    expect(leftThigh.z).toBeGreaterThan(0.8);
    expect(rightThigh.z).toBeGreaterThan(0.8);

    applyDirectorPreviewPose(group, { ...subject, posePreset: 'fold-arms' }, 0);
    const torsoPosition = group
      .getObjectByName('mixamorig1Spine')
      ?.getWorldPosition(new THREE.Vector3());
    const leftFoldedHand = group
      .getObjectByName('mixamorig1LeftHand')
      ?.getWorldPosition(new THREE.Vector3());
    const rightFoldedHand = group
      .getObjectByName('mixamorig1RightHand')
      ?.getWorldPosition(new THREE.Vector3());
    expect((leftFoldedHand?.z ?? 0) - (torsoPosition?.z ?? 0)).toBeGreaterThan(0.2);
    expect((rightFoldedHand?.z ?? 0) - (torsoPosition?.z ?? 0)).toBeGreaterThan(0.2);
    expect(Math.abs((leftFoldedHand?.x ?? 0) - (torsoPosition?.x ?? 0))).toBeLessThan(
      spec.targetHeight * 0.08,
    );
    expect(Math.abs((rightFoldedHand?.x ?? 0) - (torsoPosition?.x ?? 0))).toBeLessThan(
      spec.targetHeight * 0.08,
    );

    applyDirectorPreviewPose(group, { ...subject, posePreset: 'walk' }, 0);
    const leftWalkThigh = boneDirection(group, 'mixamorig1LeftUpLeg', 'mixamorig1LeftLeg');
    const rightWalkThigh = boneDirection(group, 'mixamorig1RightUpLeg', 'mixamorig1RightLeg');
    expect(leftWalkThigh.z * rightWalkThigh.z).toBeLessThan(-0.1);
  });
});
