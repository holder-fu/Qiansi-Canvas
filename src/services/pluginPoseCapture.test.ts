import { describe, expect, it } from 'vitest';
import {
  isPluginPoseEngineId,
  listPluginPoseEngines,
  normalizePluginPoseResult,
  normalizePluginPoseResults,
  pluginPoseIntegrity,
  selectReliablePluginPoses,
  shouldRecoverPluginPoseEnsemble,
  type PluginPose,
} from './pluginPoseCapture';

function personPose(centerX: number, confidence = 0.85): PluginPose {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: centerX,
    y: 0.42,
    z: 0,
    visibility: 0.95,
  }));
  const set = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0, visibility: 0.95 };
  };
  set(0, centerX, 0.17);
  set(11, centerX - 0.08, 0.33);
  set(12, centerX + 0.08, 0.33);
  set(13, centerX - 0.14, 0.47);
  set(14, centerX + 0.14, 0.47);
  set(15, centerX - 0.18, 0.61);
  set(16, centerX + 0.18, 0.61);
  set(23, centerX - 0.06, 0.57);
  set(24, centerX + 0.06, 0.57);
  set(25, centerX - 0.07, 0.75);
  set(26, centerX + 0.07, 0.75);
  set(27, centerX - 0.07, 0.93);
  set(28, centerX + 0.07, 0.93);
  return {
    confidence,
    landmarks,
    worldLandmarks: landmarks.map((landmark) => ({ ...landmark })),
  };
}

describe('plugin pose capture', () => {
  it('publishes only the two managed AI engines while retaining legacy ID validation', () => {
    const engines = listPluginPoseEngines();

    expect(engines.map((engine) => engine.id)).toEqual(['gem-x', 'rtmw3d']);
    expect(engines[0]).toMatchObject({
      skeleton: 'qiansi-soma-77',
      jointCount: 77,
      dimensions: '3d',
      supportsMultiplePeople: false,
      available: false,
      availability: 'runtime-required',
    });
    expect(engines[1]).toMatchObject({ skeleton: 'qiansi-coco-wholebody-133', jointCount: 133 });
    expect(isPluginPoseEngineId('gem-x')).toBe(true);
    expect(isPluginPoseEngineId('mediapipe-full')).toBe(true);
    expect(isPluginPoseEngineId('unknown')).toBe(false);

    const firstEngine = engines[0];
    if (!firstEngine) throw new Error('Expected the GEM-X catalog entry.');
    firstEngine.available = true;
    expect(listPluginPoseEngines()[0]?.available).toBe(false);
  });

  it('reports model package installation separately from worker availability', () => {
    const engines = listPluginPoseEngines([
      {
        id: 'rtmw3d',
        installed: true,
        installAvailable: true,
        bytes: 230_771_611,
        runtimeNote: 'Qiansi AI Motion Worker required',
      },
    ]);
    expect(engines[1]).toMatchObject({
      id: 'rtmw3d',
      modelInstalled: true,
      installAvailable: true,
      modelBytes: 230_771_611,
      available: false,
      availability: 'runtime-required',
    });
    expect(engines[1]?.unavailableReason).toContain('Qiansi AI Motion Worker');
  });

  it('enables an installed AI engine only after its worker health check succeeds', () => {
    const engines = listPluginPoseEngines([
      {
        id: 'gem-x',
        installed: true,
        installAvailable: true,
        bytes: 542_431_121,
        runtimeNote: 'official runtime',
        workerAvailable: true,
        workerAvailability: 'ready',
        workerBackend: 'NVIDIA GEM-X · CUDA',
        workerMessage: 'ready',
      },
    ]);

    expect(engines[0]).toMatchObject({
      id: 'gem-x',
      modelInstalled: true,
      available: true,
      availability: 'ready',
      runtimeNote: 'NVIDIA GEM-X · CUDA · AI Motion Worker 已连接。',
    });
  });

  it('returns a bounded public 33-point result with averaged visibility', () => {
    const landmarks = Array.from({ length: 36 }, (_, index) => ({
      x: index / 36,
      y: 1 - index / 36,
      z: -index / 100,
      visibility: index === 0 ? 2 : 0.75,
    }));
    const world = landmarks.map((landmark) => ({ ...landmark }));
    const result = normalizePluginPoseResult(240, landmarks, world);

    expect(result.detected).toBe(true);
    expect(result.landmarks).toHaveLength(33);
    expect(result.worldLandmarks).toHaveLength(33);
    expect(result.landmarks[0]?.visibility).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.75);
    expect(result.confidence).toBeLessThan(0.77);
    expect(result.poses).toHaveLength(1);
  });

  it('reports an empty frame without inventing a skeleton', () => {
    expect(normalizePluginPoseResult(0)).toEqual({
      timestampMs: 0,
      detected: false,
      confidence: 0,
      landmarks: [],
      worldLandmarks: [],
      poses: [],
    });
  });

  it('returns every complete bounded pose while preserving the strongest legacy pose', () => {
    const pose = (visibility: number, xOffset: number) =>
      Array.from({ length: 33 }, (_, index) => ({
        x: xOffset + index / 1000,
        y: index / 100,
        z: -index / 100,
        visibility,
      }));
    const landmarks = [pose(0.7, 0.1), pose(0.9, 0.5), pose(0.6, 0.8)];
    const result = normalizePluginPoseResults(500, landmarks, landmarks, 2);

    expect(result.detected).toBe(true);
    expect(result.poses).toHaveLength(2);
    expect(result.poses[0]?.landmarks[0]?.x).toBe(0.1);
    expect(result.poses[1]?.landmarks[0]?.x).toBe(0.5);
    expect(result.confidence).toBeCloseTo(0.9);
    expect(result.landmarks[0]?.x).toBe(0.5);
  });

  it('rejects a cross-person limb splice in favor of two coherent local poses', () => {
    const left = personPose(0.28, 0.82);
    const right = personPose(0.72, 0.8);
    const spliced = personPose(0.36, 0.98);
    const elbow = spliced.landmarks[13];
    const wrist = spliced.landmarks[15];
    if (!elbow || !wrist) throw new Error('Expected complete pose fixture.');
    spliced.landmarks[13] = { ...elbow, x: 0.7 };
    spliced.landmarks[15] = { ...wrist, x: 0.78 };

    expect(pluginPoseIntegrity(left)).toBeGreaterThan(0.8);
    expect(pluginPoseIntegrity(spliced)).toBeLessThan(0.5);

    const selected = selectReliablePluginPoses([spliced, left, right, personPose(0.285, 0.76)], 2);
    expect(selected).toHaveLength(2);
    expect(selected[0]?.landmarks[0]?.x).toBeCloseTo(0.28, 2);
    expect(selected[1]?.landmarks[0]?.x).toBeCloseTo(0.72, 2);
  });

  it('requests local recovery only when a two-person result is missing or incoherent', () => {
    const left = personPose(0.28);
    const right = personPose(0.72);
    const spliced = personPose(0.36);
    const elbow = spliced.landmarks[13];
    if (!elbow) throw new Error('Expected complete pose fixture.');
    spliced.landmarks[13] = { ...elbow, x: 0.75 };

    expect(shouldRecoverPluginPoseEnsemble([left, right], 2)).toBe(false);
    expect(shouldRecoverPluginPoseEnsemble([left], 2)).toBe(true);
    expect(shouldRecoverPluginPoseEnsemble([spliced, right], 2)).toBe(true);
    expect(shouldRecoverPluginPoseEnsemble([left], 1)).toBe(false);
  });
});
