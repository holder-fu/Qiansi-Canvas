import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_CAMERA_RADIUS_MAX,
  DIRECTOR_CAMERA_RADIUS_MIN,
  DIRECTOR_CAMERA_FLOOR_Y,
  DIRECTOR_STAGE_WORLD_UNIT,
  constrainDirectorMotionToScene,
  getDirectorDragPosition,
  getDirectorGroundedCameraPitch,
  getDirectorSceneObjectScale,
  getDirectorStageCameraFov,
  getDirectorStageCameraFrustumScale,
  getDirectorStageCameraCapturePose,
  getDirectorStagePixelRatio,
  getDirectorTrackedStageCameraCapturePose,
  getDirectorShotCameraPosition,
  getDirectorShotCameraState,
  getDirectorStagePoint,
  getDirectorWheelZoomTarget,
  groundDirectorCameraPosition,
  stepDirectorKeyboardViewPan,
  stepDirectorKeyboardWalk,
  stepDirectorSmoothZoom,
} from './directorStage';

const stage = { left: 100, top: 50, width: 800, height: 450 };

describe('director stage dragging', () => {
  it('keeps the grabbed point offset so the subject does not jump on pointer down', () => {
    const pointer = getDirectorStagePoint(580, 320, stage);
    const subject = { x: 55, y: 56 };
    const offset = { x: pointer.x - subject.x, y: pointer.y - subject.y };

    expect(getDirectorDragPosition(580, 320, stage, offset)).toEqual(subject);
  });

  it('keeps a dragged subject inside the editable stage bounds', () => {
    expect(getDirectorDragPosition(-500, -500, stage, { x: 0, y: 0 })).toEqual({
      x: 4,
      y: 10,
    });
    expect(getDirectorDragPosition(5000, 5000, stage, { x: 0, y: 0 })).toEqual({
      x: 96,
      y: 92,
    });
  });
});

describe('director keyboard walking', () => {
  it('moves at a frame-rate-independent speed and faces the travel direction', () => {
    const forward = stepDirectorKeyboardWalk(
      { x: 50, depth: 50, bodyAngle: 90 },
      { x: 0, depth: -1 },
      0.1,
    );
    expect(forward).toMatchObject({ x: 50, depth: 49.4, bodyAngle: -180, moved: true });

    const right = stepDirectorKeyboardWalk(forward, { x: 1, depth: 0 }, 0.05);
    expect(right.x).toBeCloseTo(50.3, 8);
    expect(right.depth).toBeCloseTo(49.4, 8);
    expect(right.bodyAngle).toBe(-90);
  });

  it('normalizes diagonal input and keeps the subject inside the editable floor', () => {
    const diagonal = stepDirectorKeyboardWalk(
      { x: 50, depth: 50, bodyAngle: 0 },
      { x: 1, depth: 1 },
      0.1,
    );
    expect(Math.hypot(diagonal.x - 50, diagonal.depth - 50)).toBeCloseTo(0.6, 8);
    expect(diagonal.bodyAngle).toBe(-45);

    expect(
      stepDirectorKeyboardWalk({ x: 96, depth: 100, bodyAngle: 27 }, { x: 1, depth: 1 }, 0.1),
    ).toEqual({ x: 96, depth: 100, bodyAngle: 27, moved: false });
  });

  it('ignores zero, invalid and oversized frame deltas safely', () => {
    const position = { x: 50, depth: 50, bodyAngle: 15 };
    expect(stepDirectorKeyboardWalk(position, { x: 0, depth: 0 }, 0.1)).toEqual({
      ...position,
      moved: false,
    });
    expect(stepDirectorKeyboardWalk(position, { x: 0, depth: 1 }, Number.NaN)).toEqual({
      ...position,
      moved: false,
    });
    expect(stepDirectorKeyboardWalk(position, { x: 0, depth: 1 }, 1).depth).toBe(50.6);
  });
});

describe('director keyboard view panning', () => {
  it('moves the free-camera target at a frame-rate-independent normalized speed', () => {
    const forward = stepDirectorKeyboardViewPan({ x: 0, z: 0 }, { x: 0, z: -1 }, 0.1);
    expect(forward).toEqual({ x: 0, z: -1.8, deltaX: 0, deltaZ: -1.8, moved: true });

    const diagonal = stepDirectorKeyboardViewPan({ x: 0, z: 0 }, { x: 1, z: 1 }, 0.1);
    expect(Math.hypot(diagonal.deltaX, diagonal.deltaZ)).toBeCloseTo(1.8, 8);
  });

  it('keeps the free-camera target on the stage and reports the actual boundary delta', () => {
    expect(stepDirectorKeyboardViewPan({ x: 139.5, z: 0 }, { x: 1, z: 0 }, 0.1)).toEqual({
      x: 140,
      z: 0,
      deltaX: 0.5,
      deltaZ: 0,
      moved: true,
    });
    expect(stepDirectorKeyboardViewPan({ x: 140, z: 140 }, { x: 1, z: 1 }, 0.1)).toEqual({
      x: 140,
      z: 140,
      deltaX: 0,
      deltaZ: 0,
      moved: false,
    });
  });
});

describe('director stage camera controls', () => {
  it('supersamples the live viewport without exceeding the professional quality cap', () => {
    expect(getDirectorStagePixelRatio(1)).toBe(1.5);
    expect(getDirectorStagePixelRatio(1.75)).toBe(1.75);
    expect(getDirectorStagePixelRatio(3)).toBe(2);
    expect(getDirectorStagePixelRatio(Number.NaN)).toBe(1.5);
  });

  it('round-trips orbit direction and distance without a post-interaction rebound', () => {
    const state = {
      cameraYaw: 37.4,
      cameraPitch: 18.6,
      cameraDistance: 63.75,
    };

    const position = getDirectorShotCameraPosition(state);
    const committed = getDirectorShotCameraState(position);
    const positionAfterCommit = getDirectorShotCameraPosition(committed);

    expect(committed.cameraYaw).toBeCloseTo(state.cameraYaw, 10);
    expect(committed.cameraPitch).toBeCloseTo(state.cameraPitch, 10);
    expect(committed.cameraDistance).toBeCloseTo(state.cameraDistance, 10);
    expect(positionAfterCommit.x).toBeCloseTo(position.x, 10);
    expect(positionAfterCommit.y).toBeCloseTo(position.y, 10);
    expect(positionAfterCommit.z).toBeCloseTo(position.z, 10);
  });

  it('does not accumulate direction drift over repeated interaction commits', () => {
    const initial = {
      cameraYaw: -126.35,
      cameraPitch: 42.125,
      cameraDistance: 82.4,
    };
    let state = initial;

    for (let index = 0; index < 120; index += 1) {
      state = getDirectorShotCameraState(getDirectorShotCameraPosition(state));
    }

    expect(state.cameraYaw).toBeCloseTo(initial.cameraYaw, 9);
    expect(state.cameraPitch).toBeCloseTo(initial.cameraPitch, 9);
    expect(state.cameraDistance).toBeCloseTo(initial.cameraDistance, 9);
  });

  it('round-trips the extended near and far zoom ranges without changing legacy framing', () => {
    for (const cameraDistance of [5, 12.5, 20, 63.75, 100, 550, 1000]) {
      const state = { cameraYaw: 28, cameraPitch: 16, cameraDistance };
      const committed = getDirectorShotCameraState(getDirectorShotCameraPosition(state));
      expect(committed.cameraDistance).toBeCloseTo(cameraDistance, 9);
    }

    const legacyWide = getDirectorShotCameraPosition({
      cameraYaw: 0,
      cameraPitch: 0,
      cameraDistance: 100,
    });
    const fullStage = getDirectorShotCameraPosition({
      cameraYaw: 0,
      cameraPitch: 0,
      cameraDistance: 1000,
    });
    expect(Math.hypot(legacyWide.x, legacyWide.y - 1.1, legacyWide.z)).toBeCloseTo(18, 10);
    expect(Math.hypot(fullStage.x, fullStage.y - 1.1, fullStage.z)).toBeCloseTo(180, 10);
  });

  it('keeps low-angle shot presets above the physical stage floor', () => {
    const groundedPitch = getDirectorGroundedCameraPitch(52, -20);
    const position = getDirectorShotCameraPosition({
      cameraYaw: 24,
      cameraPitch: -20,
      cameraDistance: 52,
    });

    expect(groundedPitch).toBeGreaterThan(-20);
    expect(position.y).toBeCloseTo(DIRECTOR_CAMERA_FLOOR_Y, 10);
    expect(getDirectorShotCameraState(position).cameraPitch).toBeCloseTo(groundedPitch, 10);
  });

  it('grounds a live orbit position without changing its radius or yaw', () => {
    const position = { x: 6, y: -4, z: 8 };
    const target = { x: 0, y: 1.1, z: 0 };
    const grounded = groundDirectorCameraPosition(position, target);

    expect(grounded.y).toBe(DIRECTOR_CAMERA_FLOOR_Y);
    expect(Math.hypot(grounded.x, grounded.y - target.y, grounded.z)).toBeCloseTo(
      Math.hypot(position.x, position.y - target.y, position.z),
      10,
    );
    expect(Math.atan2(grounded.x, grounded.z)).toBeCloseTo(Math.atan2(position.x, position.z), 10);
  });

  it('leaves an already grounded orbit position unchanged', () => {
    expect(groundDirectorCameraPosition({ x: 3, y: 2, z: 4 })).toEqual({ x: 3, y: 2, z: 4 });
  });

  it('turns repeated wheel input into a continuous, bounded zoom target', () => {
    const initial = 12;
    const twoTrackpadTicks = getDirectorWheelZoomTarget(
      getDirectorWheelZoomTarget(initial, -60),
      -60,
    );
    const oneWheelTick = getDirectorWheelZoomTarget(initial, -120);

    expect(twoTrackpadTicks).toBeCloseTo(oneWheelTick, 12);
    expect(oneWheelTick).toBeLessThan(initial);
    expect(getDirectorWheelZoomTarget(initial, 120)).toBeGreaterThan(initial);
    expect(getDirectorWheelZoomTarget(initial, -100_000)).toBe(DIRECTOR_CAMERA_RADIUS_MIN);
    expect(getDirectorWheelZoomTarget(initial, 100_000)).toBe(DIRECTOR_CAMERA_RADIUS_MAX);
  });

  it('smoothly approaches the zoom target without overshoot and independently of frame rate', () => {
    const current = 16;
    const target = 8;
    const oneFrame = stepDirectorSmoothZoom(current, target, 1 / 30);
    const halfFrame = stepDirectorSmoothZoom(current, target, 1 / 60);
    const twoFrames = stepDirectorSmoothZoom(halfFrame, target, 1 / 60);

    expect(oneFrame).toBeGreaterThan(target);
    expect(oneFrame).toBeLessThan(current);
    expect(twoFrames).toBeCloseTo(oneFrame, 12);

    let settled = current;
    for (let frame = 0; frame < 120; frame += 1) {
      const next = stepDirectorSmoothZoom(settled, target, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(target);
      expect(next).toBeLessThanOrEqual(settled);
      settled = next;
    }
    expect(settled).toBeCloseTo(target, 5);
  });

  it('turns a visible stage-camera rig into a level capture pose with the same forward axis', () => {
    const front = getDirectorStageCameraCapturePose({
      id: 'cam-front',
      label: '正面全景',
      x: 50,
      depth: 25,
      height: 1.7,
      yaw: 0,
      pitch: 0,
      distance: 82,
    });
    const right = getDirectorStageCameraCapturePose({
      id: 'cam-right',
      label: '右侧机位',
      x: 75,
      depth: 50,
      height: 2,
      yaw: 90,
      pitch: 10,
      distance: 40,
    });

    expect(front.position).toEqual({ x: 0, y: 1.7, z: -40 });
    expect(front.direction).toEqual({ x: -0, y: -0, z: 1 });
    expect(front.fov).toBeCloseTo(62.44, 10);
    expect(right.direction.x).toBeCloseTo(-Math.cos((10 * Math.PI) / 180), 10);
    expect(right.direction.y).toBeCloseTo(-Math.sin((10 * Math.PI) / 180), 10);
    expect(right.direction.z).toBeCloseTo(0, 10);
  });

  it('keeps framing semantics and the visible camera cone in the same direction', () => {
    const tightFov = getDirectorStageCameraFov(20);
    const wideFov = getDirectorStageCameraFov(100);
    const tightFrustum = getDirectorStageCameraFrustumScale(20);
    const wideFrustum = getDirectorStageCameraFrustumScale(100);

    expect(tightFov).toBeCloseTo(36.4, 10);
    expect(wideFov).toBe(70);
    expect(wideFov).toBeGreaterThan(tightFov);
    expect(wideFrustum.length).toBeGreaterThan(tightFrustum.length);
    expect(wideFrustum.spread / wideFrustum.length).toBeGreaterThan(
      tightFrustum.spread / tightFrustum.length,
    );
  });

  it('keeps a follow camera offset while translating with and aiming at its subject', () => {
    const camera = {
      id: 'cam-follow',
      label: '跟随机位',
      x: 50,
      depth: 25,
      height: 2,
      yaw: 0,
      pitch: 0,
      distance: 65,
      trackingMode: 'follow-subject' as const,
      trackingSubjectId: 'actor-a',
    };
    const pose = getDirectorTrackedStageCameraCapturePose(
      camera,
      { x: 0, y: 1.35, z: 0 },
      { x: 12, y: 1.35, z: 8 },
    );

    expect(pose.position).toEqual({ x: 12, y: 2, z: -32 });
    expect(pose.direction.x).toBeCloseTo(0, 10);
    expect(pose.direction.y).toBeCloseTo(-0.65 / Math.hypot(0.65, 40), 10);
    expect(pose.direction.z).toBeCloseTo(40 / Math.hypot(0.65, 40), 10);
  });
});

describe('director scene-object building scale', () => {
  it('supports independent building dimensions up to a fifty-times height', () => {
    expect(
      getDirectorSceneObjectScale({ scale: 100, scaleX: 250, scaleY: 5000, scaleZ: 180 }),
    ).toEqual({ x: 2.5, y: 50, z: 1.8 });
    expect(getDirectorSceneObjectScale({ scale: 1000, scaleY: 5000 })).toEqual({
      x: 10,
      y: 500,
      z: 10,
    });
  });

  it('keeps legacy and invalid object dimensions safe', () => {
    expect(getDirectorSceneObjectScale({ scale: 100 })).toEqual({ x: 1, y: 1, z: 1 });
    expect(
      getDirectorSceneObjectScale({
        scale: Number.NaN,
        scaleX: -500,
        scaleY: Number.POSITIVE_INFINITY,
        scaleZ: 9000,
      }),
    ).toEqual({ x: 0.1, y: 1, z: 20 });
  });
});

describe('director root-motion collision', () => {
  const wall = {
    id: 'wall-a',
    label: '主墙',
    kind: 'landmark' as const,
    primitive: 'wall' as const,
    x: 50,
    y: 50,
    depth: 50,
    scale: 100,
    scaleX: 600,
    scaleY: 100,
    scaleZ: 100,
    rotationY: 0,
    color: '#ffffff',
    description: '',
  };
  const path = {
    type: 'line' as const,
    points: [
      { x: 50, depth: 42 },
      { x: 50, depth: 58 },
    ],
  };

  it('uses the ten-times-expanded spatial coordinate scale', () => {
    expect(DIRECTOR_STAGE_WORLD_UNIT).toBe(1.6);
    expect(100 * DIRECTOR_STAGE_WORLD_UNIT).toBe(160);
  });

  it('stops a walking root before a wall even when seeking beyond it', () => {
    const before = constrainDirectorMotionToScene(path, 0.25, [wall]);
    const after = constrainDirectorMotionToScene(path, 0.95, [wall]);

    expect(before).toMatchObject({ blocked: false, depth: 46 });
    expect(after?.blocked).toBe(true);
    expect(after?.obstacleId).toBe('wall-a');
    expect(after?.depth).toBeLessThan(50);
    expect(after?.depth).toBeGreaterThan(49);
  });

  it('respects wall yaw and object scale while leaving arches walkable', () => {
    const rotatedWall = { ...wall, rotationY: 90, scaleX: 100, scaleZ: 600 };
    const horizontalPath = {
      type: 'line' as const,
      points: [
        { x: 42, depth: 50 },
        { x: 58, depth: 50 },
      ],
    };
    expect(constrainDirectorMotionToScene(horizontalPath, 1, [rotatedWall])?.blocked).toBe(true);
    expect(
      constrainDirectorMotionToScene(horizontalPath, 1, [
        { ...wall, id: 'arch-a', primitive: 'arch' as const },
      ])?.blocked,
    ).toBe(false);
  });
});
