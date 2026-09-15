export interface DirectorStageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DirectorStagePoint {
  x: number;
  y: number;
}

export interface DirectorDragOffset {
  x: number;
  y: number;
}

export interface DirectorCameraVector {
  x: number;
  y: number;
  z: number;
}

export interface DirectorShotCameraState {
  cameraYaw: number;
  cameraPitch: number;
  cameraDistance: number;
}

export interface DirectorSceneObjectScaleState {
  scale: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
}

export const DIRECTOR_CAMERA_TARGET: Readonly<DirectorCameraVector> = {
  x: 0,
  y: 1.1,
  z: 0,
};

/** Spatial X/Z scale used by the 280×280 professional operation floor. */
export const DIRECTOR_STAGE_WORLD_UNIT = 1.6;

export const DIRECTOR_CAMERA_DISTANCE_MIN = 5;
export const DIRECTOR_CAMERA_DISTANCE_LEGACY_MIN = 20;
export const DIRECTOR_CAMERA_DISTANCE_LEGACY_MAX = 100;
export const DIRECTOR_CAMERA_DISTANCE_MAX = 1000;
export const DIRECTOR_CAMERA_RADIUS_BASE = 4;
export const DIRECTOR_CAMERA_RADIUS_SCALE = 14;
export const DIRECTOR_CAMERA_RADIUS_MIN = 2;
export const DIRECTOR_CAMERA_RADIUS_LEGACY_MIN =
  DIRECTOR_CAMERA_RADIUS_BASE +
  (DIRECTOR_CAMERA_DISTANCE_LEGACY_MIN / 100) * DIRECTOR_CAMERA_RADIUS_SCALE;
export const DIRECTOR_CAMERA_RADIUS_LEGACY_MAX =
  DIRECTOR_CAMERA_RADIUS_BASE +
  (DIRECTOR_CAMERA_DISTANCE_LEGACY_MAX / 100) * DIRECTOR_CAMERA_RADIUS_SCALE;
export const DIRECTOR_CAMERA_RADIUS_MAX = 180;
export const DIRECTOR_CAMERA_FLOOR_Y = 0.35;
export const DIRECTOR_STAGE_PIXEL_RATIO_MIN = 1.5;
export const DIRECTOR_STAGE_PIXEL_RATIO_MAX = 2;
export const DIRECTOR_KEYBOARD_WALK_SPEED = 6;
export const DIRECTOR_KEYBOARD_VIEW_SPEED = 18;

const DIRECTOR_WHEEL_ZOOM_SENSITIVITY = 0.0015;
const DIRECTOR_ZOOM_RESPONSE = 14;
const CAMERA_EPSILON = 1e-6;

/**
 * Keeps the interactive viewport crisp on both 100% Windows scaling and HiDPI
 * displays. Export capture temporarily overrides this value with its fixed
 * delivery resolution, so supersampling only affects the live editor.
 */
export function getDirectorStagePixelRatio(devicePixelRatio: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return clamp(ratio, DIRECTOR_STAGE_PIXEL_RATIO_MIN, DIRECTOR_STAGE_PIXEL_RATIO_MAX);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export interface DirectorKeyboardWalkStep {
  x: number;
  depth: number;
  bodyAngle: number;
  moved: boolean;
}

/**
 * Advances a selected subject across the editable stage at a frame-rate-independent
 * speed. Direction is supplied in stage X/Z coordinates so the viewport can map
 * arrow keys against the active camera before calling this pure boundary helper.
 */
export function stepDirectorKeyboardWalk(
  position: { x: number; depth: number; bodyAngle: number },
  direction: { x: number; depth: number },
  deltaSeconds: number,
): DirectorKeyboardWalkStep {
  const directionLength = Math.hypot(direction.x, direction.depth);
  const safeDelta = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.1);
  if (directionLength <= CAMERA_EPSILON || safeDelta <= 0) {
    return { ...position, moved: false };
  }

  const distance = DIRECTOR_KEYBOARD_WALK_SPEED * safeDelta;
  const requestedX = direction.x / directionLength;
  const requestedDepth = direction.depth / directionLength;
  const x = clamp(position.x + requestedX * distance, 4, 96);
  const depth = clamp(position.depth + requestedDepth * distance, 0, 100);
  const movedX = x - position.x;
  const movedDepth = depth - position.depth;
  if (Math.hypot(movedX, movedDepth) <= CAMERA_EPSILON) {
    return { x, depth, bodyAngle: position.bodyAngle, moved: false };
  }

  const rawAngle = -(Math.atan2(movedX, movedDepth) * 180) / Math.PI;
  const bodyAngle = ((((rawAngle + 180) % 360) + 360) % 360) - 180;
  return { x, depth, bodyAngle, moved: true };
}

export interface DirectorKeyboardViewPanStep {
  x: number;
  z: number;
  deltaX: number;
  deltaZ: number;
  moved: boolean;
}

/** Moves the free-director camera target across the ground without changing zoom or orbit angle. */
export function stepDirectorKeyboardViewPan(
  target: { x: number; z: number },
  direction: { x: number; z: number },
  deltaSeconds: number,
  boundary = 140,
): DirectorKeyboardViewPanStep {
  const directionLength = Math.hypot(direction.x, direction.z);
  const safeDelta = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.1);
  const safeBoundary = Math.max(0, Number.isFinite(boundary) ? boundary : 140);
  if (directionLength <= CAMERA_EPSILON || safeDelta <= 0) {
    return { ...target, deltaX: 0, deltaZ: 0, moved: false };
  }

  const distance = DIRECTOR_KEYBOARD_VIEW_SPEED * safeDelta;
  const x = clamp(
    target.x + (direction.x / directionLength) * distance,
    -safeBoundary,
    safeBoundary,
  );
  const z = clamp(
    target.z + (direction.z / directionLength) * distance,
    -safeBoundary,
    safeBoundary,
  );
  const deltaX = x - target.x;
  const deltaZ = z - target.z;
  return {
    x,
    z,
    deltaX,
    deltaZ,
    moved: Math.hypot(deltaX, deltaZ) > CAMERA_EPSILON,
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export interface DirectorStageCameraCapturePose {
  position: DirectorCameraVector;
  direction: DirectorCameraVector;
  fov: number;
}

export function getDirectorStageCameraFov(distance: number): number {
  const normalizedDistance = clamp(Number.isFinite(distance) ? distance : 50, 0, 100);
  return clamp(28 + (normalizedDistance / 100) * 42, 28, 70);
}

export function getDirectorStageCameraFrustumScale(distance: number): {
  spread: number;
  length: number;
} {
  const normalizedDistance = clamp(Number.isFinite(distance) ? distance : 50, 20, 100);
  const progress = (normalizedDistance - 20) / 80;
  const length = 1.55 + progress * 1.9;
  const fov = getDirectorStageCameraFov(normalizedDistance);
  const spread = (Math.tan(degreesToRadians(fov / 2)) * length) / 0.4;
  return { spread, length };
}

/** Converts the visible stage-camera rig into the actual render-camera pose.
 * The rig lens points along local +Z, so the capture camera must use the same
 * yaw/pitch convention rather than the editor orbit convention. */
export function getDirectorStageCameraCapturePose(
  camera: DirectorStageCamera,
): DirectorStageCameraCapturePose {
  const yaw = degreesToRadians(Number.isFinite(camera.yaw) ? camera.yaw : 0);
  const pitch = degreesToRadians(Number.isFinite(camera.pitch) ? camera.pitch : 0);
  const cosinePitch = Math.cos(pitch);
  return {
    position: {
      x: (clamp(camera.x, 0, 100) - 50) * DIRECTOR_STAGE_WORLD_UNIT,
      y: clamp(Number.isFinite(camera.height) ? camera.height : 1.6, 0.2, 50),
      z: (clamp(camera.depth, 0, 100) - 50) * DIRECTOR_STAGE_WORLD_UNIT,
    },
    direction: {
      x: -Math.sin(yaw) * cosinePitch,
      y: -Math.sin(pitch),
      z: Math.cos(yaw) * cosinePitch,
    },
    // The stage camera's composition-distance slider doubles as a practical
    // wide/tele field-of-view control for the exported previsualization.
    fov: getDirectorStageCameraFov(camera.distance),
  };
}

/** Moves a follow camera by the subject root delta and keeps its lens aimed at that subject. */
export function getDirectorTrackedStageCameraCapturePose(
  camera: DirectorStageCamera,
  initialTarget?: DirectorCameraVector,
  currentTarget?: DirectorCameraVector,
): DirectorStageCameraCapturePose {
  const base = getDirectorStageCameraCapturePose(camera);
  if (camera.trackingMode !== 'follow-subject' || !initialTarget || !currentTarget) return base;

  const position = {
    x: base.position.x + currentTarget.x - initialTarget.x,
    y: base.position.y + currentTarget.y - initialTarget.y,
    z: base.position.z + currentTarget.z - initialTarget.z,
  };
  const directionLength = Math.hypot(
    currentTarget.x - position.x,
    currentTarget.y - position.y,
    currentTarget.z - position.z,
  );
  if (directionLength <= CAMERA_EPSILON) return { ...base, position };
  return {
    ...base,
    position,
    direction: {
      x: (currentTarget.x - position.x) / directionLength,
      y: (currentTarget.y - position.y) / directionLength,
      z: (currentTarget.z - position.z) / directionLength,
    },
  };
}

/** Converts persisted uniform and per-axis percentages to the final Three.js object scale. */
export function getDirectorSceneObjectScale(object: DirectorSceneObjectScaleState) {
  const uniform = clamp(Number.isFinite(object.scale) ? object.scale / 100 : 1, 0.2, 10);
  const axis = (value: number | undefined, maximum: number) =>
    clamp(typeof value === 'number' && Number.isFinite(value) ? value / 100 : 1, 0.1, maximum);
  return {
    x: uniform * axis(object.scaleX, 20),
    y: uniform * axis(object.scaleY, 50),
    z: uniform * axis(object.scaleZ, 20),
  };
}

interface DirectorMotionCollisionSample {
  x: number;
  depth: number;
  tangentX: number;
  tangentDepth: number;
  yawRadians: number;
  blocked: boolean;
  obstacleId?: string;
}

const OBJECT_FOOTPRINTS: Record<
  NonNullable<DirectorSceneObject['primitive']>,
  { halfX: number; halfZ: number; collides: boolean }
> = {
  cube: { halfX: 0.6, halfZ: 0.6, collides: true },
  sphere: { halfX: 0.68, halfZ: 0.68, collides: true },
  cylinder: { halfX: 0.58, halfZ: 0.58, collides: true },
  cone: { halfX: 0.72, halfZ: 0.72, collides: true },
  wall: { halfX: 1.4, halfZ: 0.15, collides: true },
  pillar: { halfX: 0.58, halfZ: 0.58, collides: true },
  // The center of an arch and the rise of stairs are intended walkable openings.
  arch: { halfX: 1.14, halfZ: 0.25, collides: false },
  stairs: { halfX: 1.05, halfZ: 1.01, collides: false },
};

function segmentBoxEntry(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  halfX: number,
  halfZ: number,
) {
  if (Math.abs(startX) <= halfX && Math.abs(startZ) <= halfZ) return null;
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  let enter = 0;
  let exit = 1;
  for (const [start, delta, minimum, maximum] of [
    [startX, deltaX, -halfX, halfX],
    [startZ, deltaZ, -halfZ, halfZ],
  ] as const) {
    if (Math.abs(delta) <= CAMERA_EPSILON) {
      if (start < minimum || start > maximum) return null;
      continue;
    }
    const first = (minimum - start) / delta;
    const second = (maximum - start) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return null;
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}

function segmentObjectEntry(
  start: { x: number; depth: number },
  end: { x: number; depth: number },
  object: DirectorSceneObject,
  actorRadiusWorld: number,
) {
  const footprint = OBJECT_FOOTPRINTS[object.primitive ?? 'cube'];
  if (!footprint.collides) return null;
  const scale = getDirectorSceneObjectScale(object);
  const halfX = (footprint.halfX * scale.x + actorRadiusWorld) / DIRECTOR_STAGE_WORLD_UNIT;
  const halfZ = (footprint.halfZ * scale.z + actorRadiusWorld) / DIRECTOR_STAGE_WORLD_UNIT;
  const centerX = object.x;
  const centerZ = object.depth ?? object.y;
  const rotation = degreesToRadians(object.rotationY ?? 0);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const local = (point: { x: number; depth: number }) => {
    const x = point.x - centerX;
    const z = point.depth - centerZ;
    return {
      x: x * cosine - z * sine,
      z: x * sine + z * cosine,
    };
  };
  const localStart = local(start);
  const localEnd = local(end);
  return segmentBoxEntry(localStart.x, localStart.z, localEnd.x, localEnd.z, halfX, halfZ);
}

/**
 * Sweeps an actor root from the beginning of its route to the requested time.
 * The first solid primitive stops the root just before contact, so seeking or
 * exporting a later frame cannot teleport the actor through a wall.
 */
export function constrainDirectorMotionToScene(
  path: DirectorMotionPath,
  progress: number,
  objects: DirectorSceneObject[],
  actorScale = 100,
): DirectorMotionCollisionSample | undefined {
  const target = sampleDirectorMotionPath(path, progress);
  if (!target) return undefined;
  const segments = path.points.slice(0, -1).flatMap((start, index) => {
    const end = path.points[index + 1];
    if (!end) return [];
    const length = Math.hypot(end.x - start.x, end.depth - start.depth);
    return length > CAMERA_EPSILON ? [{ start, end, length }] : [];
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * totalLength;
  const actorRadiusWorld = 0.42 * clamp(actorScale / 100, 0.3, 3);

  for (const segment of segments) {
    const travelled = Math.min(segment.length, remaining);
    const fraction = travelled / segment.length;
    const end = {
      x: segment.start.x + (segment.end.x - segment.start.x) * fraction,
      depth: segment.start.depth + (segment.end.depth - segment.start.depth) * fraction,
    };
    let earliest = 1;
    let obstacleId: string | undefined;
    for (const object of objects) {
      const entry = segmentObjectEntry(segment.start, end, object, actorRadiusWorld);
      if (entry !== null && entry < earliest) {
        earliest = entry;
        obstacleId = object.id;
      }
    }
    if (obstacleId) {
      const safeFraction = Math.max(0, earliest - 0.002 / Math.max(travelled, 0.002));
      const tangentX = (segment.end.x - segment.start.x) / segment.length;
      const tangentDepth = (segment.end.depth - segment.start.depth) / segment.length;
      return {
        x: segment.start.x + (end.x - segment.start.x) * safeFraction,
        depth: segment.start.depth + (end.depth - segment.start.depth) * safeFraction,
        tangentX,
        tangentDepth,
        yawRadians: Math.atan2(tangentX, tangentDepth),
        blocked: true,
        obstacleId,
      };
    }
    remaining -= travelled;
    if (remaining <= CAMERA_EPSILON) break;
  }
  return { ...target, blocked: false };
}

function directorCameraRadius(cameraDistance: number): number {
  const normalizedDistance = clamp(
    Number.isFinite(cameraDistance) ? cameraDistance : DIRECTOR_CAMERA_DISTANCE_MIN,
    DIRECTOR_CAMERA_DISTANCE_MIN,
    DIRECTOR_CAMERA_DISTANCE_MAX,
  );
  if (normalizedDistance < DIRECTOR_CAMERA_DISTANCE_LEGACY_MIN) {
    const progress =
      (normalizedDistance - DIRECTOR_CAMERA_DISTANCE_MIN) /
      (DIRECTOR_CAMERA_DISTANCE_LEGACY_MIN - DIRECTOR_CAMERA_DISTANCE_MIN);
    return (
      DIRECTOR_CAMERA_RADIUS_MIN +
      progress * (DIRECTOR_CAMERA_RADIUS_LEGACY_MIN - DIRECTOR_CAMERA_RADIUS_MIN)
    );
  }
  if (normalizedDistance <= DIRECTOR_CAMERA_DISTANCE_LEGACY_MAX) {
    return DIRECTOR_CAMERA_RADIUS_BASE + (normalizedDistance / 100) * DIRECTOR_CAMERA_RADIUS_SCALE;
  }
  const progress =
    (normalizedDistance - DIRECTOR_CAMERA_DISTANCE_LEGACY_MAX) /
    (DIRECTOR_CAMERA_DISTANCE_MAX - DIRECTOR_CAMERA_DISTANCE_LEGACY_MAX);
  return (
    DIRECTOR_CAMERA_RADIUS_LEGACY_MAX +
    progress * (DIRECTOR_CAMERA_RADIUS_MAX - DIRECTOR_CAMERA_RADIUS_LEGACY_MAX)
  );
}

function directorCameraDistance(radius: number): number {
  const normalizedRadius = clamp(radius, DIRECTOR_CAMERA_RADIUS_MIN, DIRECTOR_CAMERA_RADIUS_MAX);
  if (normalizedRadius < DIRECTOR_CAMERA_RADIUS_LEGACY_MIN) {
    const progress =
      (normalizedRadius - DIRECTOR_CAMERA_RADIUS_MIN) /
      (DIRECTOR_CAMERA_RADIUS_LEGACY_MIN - DIRECTOR_CAMERA_RADIUS_MIN);
    return (
      DIRECTOR_CAMERA_DISTANCE_MIN +
      progress * (DIRECTOR_CAMERA_DISTANCE_LEGACY_MIN - DIRECTOR_CAMERA_DISTANCE_MIN)
    );
  }
  if (normalizedRadius <= DIRECTOR_CAMERA_RADIUS_LEGACY_MAX) {
    return ((normalizedRadius - DIRECTOR_CAMERA_RADIUS_BASE) / DIRECTOR_CAMERA_RADIUS_SCALE) * 100;
  }
  const progress =
    (normalizedRadius - DIRECTOR_CAMERA_RADIUS_LEGACY_MAX) /
    (DIRECTOR_CAMERA_RADIUS_MAX - DIRECTOR_CAMERA_RADIUS_LEGACY_MAX);
  return (
    DIRECTOR_CAMERA_DISTANCE_LEGACY_MAX +
    progress * (DIRECTOR_CAMERA_DISTANCE_MAX - DIRECTOR_CAMERA_DISTANCE_LEGACY_MAX)
  );
}

/** Returns the lowest pitch that keeps the orbit camera above the stage floor. */
export function getDirectorGroundedCameraPitch(
  cameraDistance: number,
  requestedPitch: number,
  target: DirectorCameraVector = DIRECTOR_CAMERA_TARGET,
  floorY = DIRECTOR_CAMERA_FLOOR_Y,
): number {
  const radius = directorCameraRadius(cameraDistance);
  const minimumPitch = radiansToDegrees(
    Math.asin(clamp((floorY - target.y) / Math.max(radius, CAMERA_EPSILON), -1, 1)),
  );
  return clamp(Number.isFinite(requestedPitch) ? requestedPitch : 0, minimumPitch, 55);
}

/**
 * Lifts a live orbit camera back above the floor while preserving its radius
 * and horizontal direction. This keeps low-angle shots without allowing the
 * editor camera to pass under the one-sided stage and make actors look airborne.
 */
export function groundDirectorCameraPosition(
  position: DirectorCameraVector,
  target: DirectorCameraVector = DIRECTOR_CAMERA_TARGET,
  floorY = DIRECTOR_CAMERA_FLOOR_Y,
): DirectorCameraVector {
  if (position.y >= floorY) return { ...position };
  const x = position.x - target.x;
  const z = position.z - target.z;
  const radius = Math.hypot(x, position.y - target.y, z);
  const groundedY = Math.max(floorY, target.y - Math.max(0, radius - CAMERA_EPSILON));
  const groundedVertical = groundedY - target.y;
  const groundedHorizontal = Math.sqrt(Math.max(0, radius * radius - groundedVertical ** 2));
  const horizontal = Math.hypot(x, z);
  if (horizontal <= CAMERA_EPSILON) {
    return { x: target.x, y: groundedY, z: target.z + groundedHorizontal };
  }
  const scale = groundedHorizontal / horizontal;
  return {
    x: target.x + x * scale,
    y: groundedY,
    z: target.z + z * scale,
  };
}

/**
 * Converts the persisted shot-camera values into the orbit camera position.
 * Both directions deliberately share the same target so committing an orbit
 * interaction cannot move the camera on the next React render.
 */
export function getDirectorShotCameraPosition(
  state: DirectorShotCameraState,
  target: DirectorCameraVector = DIRECTOR_CAMERA_TARGET,
): DirectorCameraVector {
  const yaw = degreesToRadians(state.cameraYaw);
  const pitch = degreesToRadians(
    getDirectorGroundedCameraPitch(state.cameraDistance, state.cameraPitch, target),
  );
  const radius = directorCameraRadius(state.cameraDistance);
  const horizontalRadius = Math.cos(pitch) * radius;

  const rawPosition = {
    x: target.x + Math.sin(yaw) * horizontalRadius,
    y: target.y + Math.sin(pitch) * radius,
    z: target.z + Math.cos(yaw) * horizontalRadius,
  };
  return groundDirectorCameraPosition(rawPosition, target);
}

/**
 * Converts a live orbit position back to persisted values without rounding.
 * Preserving sub-degree and sub-percent precision prevents visible snap-back.
 */
export function getDirectorShotCameraState(
  position: DirectorCameraVector,
  target: DirectorCameraVector = DIRECTOR_CAMERA_TARGET,
): DirectorShotCameraState {
  const x = position.x - target.x;
  const y = position.y - target.y;
  const z = position.z - target.z;
  const radius = Math.hypot(x, y, z);
  if (!Number.isFinite(radius) || radius <= CAMERA_EPSILON) {
    return {
      cameraYaw: 0,
      cameraPitch: 0,
      cameraDistance: DIRECTOR_CAMERA_DISTANCE_MIN,
    };
  }

  const cameraDistance = directorCameraDistance(radius);
  return {
    cameraYaw: radiansToDegrees(Math.atan2(x, z)),
    cameraPitch: getDirectorGroundedCameraPitch(
      cameraDistance,
      radiansToDegrees(Math.asin(clamp(y / radius, -1, 1))),
      target,
    ),
    cameraDistance,
  };
}

/** Converts wheel input into a bounded target radius. Small trackpad deltas and
 * larger mouse-wheel deltas follow the same multiplicative curve. */
export function getDirectorWheelZoomTarget(
  currentTargetRadius: number,
  wheelDeltaY: number,
  sensitivity = DIRECTOR_WHEEL_ZOOM_SENSITIVITY,
): number {
  const current = clamp(
    Number.isFinite(currentTargetRadius) ? currentTargetRadius : DIRECTOR_CAMERA_RADIUS_MIN,
    DIRECTOR_CAMERA_RADIUS_MIN,
    DIRECTOR_CAMERA_RADIUS_MAX,
  );
  if (!Number.isFinite(wheelDeltaY) || wheelDeltaY === 0) return current;
  const safeSensitivity = Number.isFinite(sensitivity) ? Math.max(0, sensitivity) : 0;
  return clamp(
    current * Math.exp(wheelDeltaY * safeSensitivity),
    DIRECTOR_CAMERA_RADIUS_MIN,
    DIRECTOR_CAMERA_RADIUS_MAX,
  );
}

/** Advances zoom with frame-rate-independent exponential smoothing. */
export function stepDirectorSmoothZoom(
  currentRadius: number,
  targetRadius: number,
  deltaSeconds: number,
  response = DIRECTOR_ZOOM_RESPONSE,
): number {
  const current = clamp(
    Number.isFinite(currentRadius) ? currentRadius : DIRECTOR_CAMERA_RADIUS_MIN,
    DIRECTOR_CAMERA_RADIUS_MIN,
    DIRECTOR_CAMERA_RADIUS_MAX,
  );
  const target = clamp(
    Number.isFinite(targetRadius) ? targetRadius : current,
    DIRECTOR_CAMERA_RADIUS_MIN,
    DIRECTOR_CAMERA_RADIUS_MAX,
  );
  const elapsed = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const safeResponse = Number.isFinite(response) ? Math.max(0, response) : 0;
  if (elapsed === 0 || safeResponse === 0 || current === target) return current;

  const next = current + (target - current) * (1 - Math.exp(-safeResponse * elapsed));
  return Math.abs(next - target) <= CAMERA_EPSILON ? target : next;
}

export function getDirectorStagePoint(
  clientX: number,
  clientY: number,
  rect: DirectorStageRect,
): DirectorStagePoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

export function getDirectorDragPosition(
  clientX: number,
  clientY: number,
  rect: DirectorStageRect,
  offset: DirectorDragOffset,
): DirectorStagePoint {
  const pointer = getDirectorStagePoint(clientX, clientY, rect);
  return {
    x: clamp(pointer.x - offset.x, 4, 96),
    y: clamp(pointer.y - offset.y, 10, 92),
  };
}
import type {
  DirectorMotionPath,
  DirectorSceneObject,
  DirectorStageCamera,
} from '../canvas/nodeTypes';
import { sampleDirectorMotionPath } from './directorMotionPath';
