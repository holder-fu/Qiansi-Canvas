import type { DirectorMotionPath, DirectorMotionPathType } from '../canvas/nodeTypes';

export const DIRECTOR_MOTION_PATH_OPTIONS: ReadonlyArray<{
  id: Exclude<DirectorMotionPathType, 'pencil' | 'pen'>;
  label: string;
  detail: string;
}> = [
  { id: 'line', label: '直线', detail: '斜向推进' },
  { id: 'arc', label: '弧线', detail: '单弧绕行' },
  { id: 's-curve', label: 'S 曲线', detail: '平滑蛇形' },
  { id: 'circle', label: '环绕', detail: '椭圆闭环' },
  { id: 'figure-eight', label: '8 字', detail: '双环交叉' },
  { id: 'rectangle', label: '矩形', detail: '四边巡场' },
  { id: 'zigzag', label: '折线', detail: '连续变向' },
];

export const DIRECTOR_MOTION_PATH_LABELS: Record<DirectorMotionPathType, string> = {
  line: '直线',
  arc: '弧线',
  's-curve': 'S 曲线',
  circle: '环绕',
  'figure-eight': '8 字',
  rectangle: '矩形',
  zigzag: '折线',
  pencil: '手绘路径',
  pen: '钢笔路径',
};

const PATH_TYPES = new Set<DirectorMotionPathType>([
  ...DIRECTOR_MOTION_PATH_OPTIONS.map((option) => option.id),
  'pencil',
  'pen',
]);
export const DIRECTOR_MOTION_PATH_RANGE_MIN = 8;
export const DIRECTOR_MOTION_PATH_RANGE_MAX = 92;
const X_MIN = 4;
const X_MAX = 96;
const DEPTH_MIN = 0;
const DEPTH_MAX = 100;

type PathPoint = DirectorMotionPath['points'][number];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function safeRange(value: number | undefined, fallback: number) {
  return clamp(
    Number.isFinite(value) ? (value as number) : fallback,
    DIRECTOR_MOTION_PATH_RANGE_MIN,
    DIRECTOR_MOTION_PATH_RANGE_MAX,
  );
}

function localPathPoints(type: DirectorMotionPathType): PathPoint[] {
  switch (type) {
    case 'arc':
      return Array.from({ length: 21 }, (_, index) => {
        const progress = index / 20;
        return { x: progress, depth: -Math.sin(progress * Math.PI) };
      });
    case 's-curve':
      return Array.from({ length: 25 }, (_, index) => {
        const progress = index / 24;
        return { x: progress, depth: Math.sin(progress * Math.PI * 2) / 2 };
      });
    case 'circle':
      return Array.from({ length: 33 }, (_, index) => {
        const angle = (index / 32) * Math.PI * 2;
        return { x: (Math.cos(angle) - 1) / 2, depth: Math.sin(angle) / 2 };
      });
    case 'figure-eight':
      return Array.from({ length: 41 }, (_, index) => {
        const angle = (index / 40) * Math.PI * 2;
        return { x: Math.sin(angle) / 2, depth: Math.sin(angle * 2) / 2 };
      });
    case 'rectangle':
      return [
        { x: 0, depth: 0 },
        { x: 1, depth: 0 },
        { x: 1, depth: -1 },
        { x: 0, depth: -1 },
        { x: 0, depth: 0 },
      ];
    case 'zigzag':
      return Array.from({ length: 8 }, (_, index) => ({
        x: index / 7,
        depth: index === 0 ? 0 : index % 2 ? -0.5 : 0.5,
      }));
    case 'line':
    default:
      return [
        { x: 0, depth: 0 },
        { x: 1, depth: -1 },
      ];
  }
}

function fittedScale(
  anchor: number,
  desired: number,
  minimumLocal: number,
  maximumLocal: number,
  minimum: number,
  maximum: number,
) {
  let result = desired;
  if (minimumLocal < 0) result = Math.min(result, (anchor - minimum) / -minimumLocal);
  if (maximumLocal > 0) result = Math.min(result, (maximum - anchor) / maximumLocal);
  return Math.max(0, result);
}

function pointExtents(points: PathPoint[]) {
  const x = points.map((point) => point.x);
  const depth = points.map((point) => point.depth);
  return {
    width: Math.max(...x) - Math.min(...x),
    depthRange: Math.max(...depth) - Math.min(...depth),
  };
}

export function createDirectorMotionPath(
  type: Exclude<DirectorMotionPathType, 'pencil' | 'pen'>,
  anchor: PathPoint,
  requestedWidth = 32,
  requestedDepthRange = 24,
): DirectorMotionPath {
  const horizontalDirection = anchor.x <= (X_MIN + X_MAX) / 2 ? 1 : -1;
  const depthDirection = anchor.depth >= (DEPTH_MIN + DEPTH_MAX) / 2 ? 1 : -1;
  const local = localPathPoints(type).map((point) => ({
    x: point.x * horizontalDirection,
    depth: point.depth * depthDirection,
  }));
  const xValues = local.map((point) => point.x);
  const depthValues = local.map((point) => point.depth);
  const width = fittedScale(
    anchor.x,
    safeRange(requestedWidth, 32),
    Math.min(...xValues),
    Math.max(...xValues),
    X_MIN,
    X_MAX,
  );
  const depthRange = fittedScale(
    anchor.depth,
    safeRange(requestedDepthRange, 24),
    Math.min(...depthValues),
    Math.max(...depthValues),
    DEPTH_MIN,
    DEPTH_MAX,
  );
  return {
    type,
    width,
    depthRange,
    points: local.map((point) => ({
      x: clamp(anchor.x + point.x * width, X_MIN, X_MAX),
      depth: clamp(anchor.depth + point.depth * depthRange, DEPTH_MIN, DEPTH_MAX),
    })),
  };
}

export function getDirectorMotionPathRange(path: DirectorMotionPath) {
  const extents = pointExtents(path.points);
  return {
    width: safeRange(path.width, Math.max(DIRECTOR_MOTION_PATH_RANGE_MIN, extents.width)),
    depthRange: safeRange(
      path.depthRange,
      Math.max(DIRECTOR_MOTION_PATH_RANGE_MIN, extents.depthRange),
    ),
  };
}

export function translateDirectorMotionPath(
  path: DirectorMotionPath,
  requestedDeltaX: number,
  requestedDeltaDepth: number,
): DirectorMotionPath {
  const xValues = path.points.map((point) => point.x);
  const depthValues = path.points.map((point) => point.depth);
  const deltaX = clamp(
    Number.isFinite(requestedDeltaX) ? requestedDeltaX : 0,
    X_MIN - Math.min(...xValues),
    X_MAX - Math.max(...xValues),
  );
  const deltaDepth = clamp(
    Number.isFinite(requestedDeltaDepth) ? requestedDeltaDepth : 0,
    DEPTH_MIN - Math.min(...depthValues),
    DEPTH_MAX - Math.max(...depthValues),
  );
  return {
    ...path,
    points: path.points.map((point) => ({
      x: point.x + deltaX,
      depth: point.depth + deltaDepth,
    })),
  };
}

/**
 * Schema 13 expands the spatial X/Z unit tenfold. Keep a legacy path's start
 * at the same world position while retaining its percentage deltas, which
 * makes the route match the enlarged operation floor instead of one old cell.
 */
export function migrateDirectorMotionPathToExpandedStage(
  path: DirectorMotionPath | undefined,
): DirectorMotionPath | undefined {
  const normalized = normalizeDirectorMotionPath(path);
  const anchor = normalized?.points[0];
  if (!normalized || !anchor) return normalized;
  const nextAnchor = {
    x: 50 + (anchor.x - 50) / 10,
    depth: 50 + (anchor.depth - 50) / 10,
  };
  return normalizeDirectorMotionPath({
    ...normalized,
    points: normalized.points.map((point) => ({
      x: nextAnchor.x + (point.x - anchor.x),
      depth: nextAnchor.depth + (point.depth - anchor.depth),
    })),
  });
}

export function resizeDirectorMotionPath(
  path: DirectorMotionPath,
  width: number,
  depthRange: number,
): DirectorMotionPath {
  const anchor = path.points[0] ?? { x: 50, depth: 50 };
  if (path.type !== 'pencil' && path.type !== 'pen') {
    return createDirectorMotionPath(path.type, anchor, width, depthRange);
  }
  const current = getDirectorMotionPathRange(path);
  const nextWidth = safeRange(width, current.width);
  const nextDepthRange = safeRange(depthRange, current.depthRange);
  return {
    ...path,
    width: nextWidth,
    depthRange: nextDepthRange,
    points: path.points.map((point) => ({
      x: clamp(anchor.x + (point.x - anchor.x) * (nextWidth / current.width), X_MIN, X_MAX),
      depth: clamp(
        anchor.depth + (point.depth - anchor.depth) * (nextDepthRange / current.depthRange),
        DEPTH_MIN,
        DEPTH_MAX,
      ),
    })),
  };
}

export function normalizeDirectorMotionPath(
  path: DirectorMotionPath | undefined,
): DirectorMotionPath | undefined {
  if (!path || !Array.isArray(path.points)) return undefined;
  const points = path.points.flatMap((point) =>
    point && Number.isFinite(point.x) && Number.isFinite(point.depth)
      ? [
          {
            x: clamp(point.x, X_MIN, X_MAX),
            depth: clamp(point.depth, DEPTH_MIN, DEPTH_MAX),
          },
        ]
      : [],
  );
  if (points.length < 2) return undefined;
  const type = PATH_TYPES.has(path.type) ? path.type : 'line';
  const extents = pointExtents(points);
  return {
    type,
    points,
    width: safeRange(path.width, Math.max(DIRECTOR_MOTION_PATH_RANGE_MIN, extents.width)),
    depthRange: safeRange(
      path.depthRange,
      Math.max(DIRECTOR_MOTION_PATH_RANGE_MIN, extents.depthRange),
    ),
  };
}

export interface DirectorMotionPathSample extends PathPoint {
  tangentX: number;
  tangentDepth: number;
  /** Three.js root rotation that aligns the actor's local forward (+Z) to the path tangent. */
  yawRadians: number;
}

/** Samples by accumulated segment length, so dense curves and sparse straight paths move evenly. */
export function sampleDirectorMotionPath(
  path: DirectorMotionPath,
  progress: number,
): DirectorMotionPathSample | undefined {
  if (path.points.length < 2) return undefined;
  const segments = path.points.slice(0, -1).flatMap((start, index) => {
    const end = path.points[index + 1];
    if (!end) return [];
    const length = Math.hypot(end.x - start.x, end.depth - start.depth);
    return length > 1e-6 ? [{ start, end, length }] : [];
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength <= 1e-6) return undefined;
  let target = clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * totalLength;
  let selected = segments[segments.length - 1];
  for (const segment of segments) {
    selected = segment;
    if (target <= segment.length) break;
    target -= segment.length;
  }
  if (!selected) return undefined;
  const fraction = clamp(target / selected.length, 0, 1);
  const tangentX = (selected.end.x - selected.start.x) / selected.length;
  const tangentDepth = (selected.end.depth - selected.start.depth) / selected.length;
  return {
    x: selected.start.x + (selected.end.x - selected.start.x) * fraction,
    depth: selected.start.depth + (selected.end.depth - selected.start.depth) * fraction,
    tangentX,
    tangentDepth,
    yawRadians: Math.atan2(tangentX, tangentDepth),
  };
}
