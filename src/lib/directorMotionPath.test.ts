import { describe, expect, it } from 'vitest';
import type { DirectorMotionPathType } from '../canvas/nodeTypes';
import {
  createDirectorMotionPath,
  getDirectorMotionPathRange,
  migrateDirectorMotionPathToExpandedStage,
  normalizeDirectorMotionPath,
  resizeDirectorMotionPath,
  sampleDirectorMotionPath,
  translateDirectorMotionPath,
} from './directorMotionPath';

describe('3D director motion paths', () => {
  it.each<Exclude<DirectorMotionPathType, 'pencil' | 'pen'>>([
    'line',
    'arc',
    's-curve',
    'circle',
    'figure-eight',
    'rectangle',
    'zigzag',
  ])('creates a bounded %s path anchored at the actor', (type) => {
    const path = createDirectorMotionPath(type, { x: 50, depth: 50 }, 36, 28);

    expect(path.type).toBe(type);
    expect(path.points.length).toBeGreaterThanOrEqual(2);
    expect(path.points[0]).toEqual({ x: 50, depth: 50 });
    expect(path.points.every((point) => point.x >= 4 && point.x <= 96)).toBe(true);
    expect(path.points.every((point) => point.depth >= 0 && point.depth <= 100)).toBe(true);
  });

  it('resizes width and depth range without moving the path anchor', () => {
    const initial = createDirectorMotionPath('s-curve', { x: 28, depth: 65 }, 24, 18);
    const resized = resizeDirectorMotionPath(initial, 48, 34);

    expect(resized.points[0]).toEqual(initial.points[0]);
    expect(getDirectorMotionPathRange(resized)).toEqual({ width: 48, depthRange: 34 });
    expect(Math.max(...resized.points.map((point) => point.x))).toBeGreaterThan(
      Math.max(...initial.points.map((point) => point.x)),
    );
  });

  it('moves a complete path as one bounded root route', () => {
    const initial = createDirectorMotionPath('rectangle', { x: 50, depth: 50 }, 36, 28);
    const moved = translateDirectorMotionPath(initial, 18, -12);
    const movedAnchor = moved.points[0];
    const initialAnchor = initial.points[0];
    expect(movedAnchor).toBeDefined();
    expect(initialAnchor).toBeDefined();
    if (!movedAnchor || !initialAnchor) throw new Error('路径缺少锚点');

    expect(movedAnchor).toEqual({ x: 60, depth: 38 });
    expect(getDirectorMotionPathRange(moved)).toEqual(getDirectorMotionPathRange(initial));
    expect(moved.points.map((point) => point.x - movedAnchor.x)).toEqual(
      initial.points.map((point) => point.x - initialAnchor.x),
    );

    const bounded = translateDirectorMotionPath(moved, 200, -200);
    expect(Math.max(...bounded.points.map((point) => point.x))).toBe(96);
    expect(Math.min(...bounded.points.map((point) => point.depth))).toBe(0);
  });

  it('migrates an old spatial path onto the enlarged floor without moving its anchor in world space', () => {
    const old = createDirectorMotionPath('line', { x: 38, depth: 60 }, 32, 24);
    const migrated = migrateDirectorMotionPathToExpandedStage(old);
    expect(migrated).toBeDefined();
    if (!migrated) throw new Error('路径迁移失败');
    const migratedStart = migrated.points[0];
    const migratedEnd = migrated.points[1];
    const oldStart = old.points[0];
    const oldEnd = old.points[1];
    if (!migratedStart || !migratedEnd || !oldStart || !oldEnd) throw new Error('路径点不完整');

    expect(migratedStart).toEqual({ x: 48.8, depth: 51 });
    expect(migratedEnd.x - migratedStart.x).toBe(oldEnd.x - oldStart.x);
    expect((migratedStart.x - 50) * 1.6).toBeCloseTo((oldStart.x - 50) * 0.16);
  });

  it('automatically grows toward the larger available side near stage edges', () => {
    const rightEdge = createDirectorMotionPath('rectangle', { x: 90, depth: 12 }, 40, 32);

    expect(Math.min(...rightEdge.points.map((point) => point.x))).toBe(50);
    expect(Math.max(...rightEdge.points.map((point) => point.x))).toBe(90);
    expect(Math.min(...rightEdge.points.map((point) => point.depth))).toBe(12);
    expect(Math.max(...rightEdge.points.map((point) => point.depth))).toBe(44);
  });

  it('samples by distance rather than point index and returns the forward tangent', () => {
    const path = {
      type: 'line' as const,
      points: [
        { x: 10, depth: 10 },
        { x: 20, depth: 10 },
        { x: 20, depth: 40 },
      ],
    };

    expect(sampleDirectorMotionPath(path, 0.25)).toMatchObject({
      x: 20,
      depth: 10,
      tangentX: 1,
      tangentDepth: 0,
    });
    const halfway = sampleDirectorMotionPath(path, 0.5);
    expect(halfway).toMatchObject({ x: 20, depth: 20, tangentX: 0, tangentDepth: 1 });
    expect(halfway?.yawRadians).toBeCloseTo(0, 10);
  });

  it('normalizes legacy paths and removes invalid points without losing compatibility', () => {
    const normalized = normalizeDirectorMotionPath({
      type: 'pencil',
      points: [
        { x: -20, depth: 140 },
        { x: 60, depth: 45 },
        { x: Number.NaN, depth: 20 },
      ],
    });

    expect(normalized).toMatchObject({
      type: 'pencil',
      points: [
        { x: 4, depth: 100 },
        { x: 60, depth: 45 },
      ],
      width: 56,
      depthRange: 55,
    });
  });
});
