import { describe, expect, it } from 'vitest';
import { getDirectorCameraConePoints, getDirectorCameraGuide } from './directorCameraGuide';

describe('director camera stage guide', () => {
  it('places a front camera below the stage and points it toward the center', () => {
    const guide = getDirectorCameraGuide('medium-front');
    expect(guide).toMatchObject({ cameraX: 50, cameraY: 92, targetX: 50, targetY: 50 });
    expect(guide.description).toContain('正前方');
  });

  it('places a profile camera on the side of the stage', () => {
    const guide = getDirectorCameraGuide('profile');
    expect(guide.cameraX).toBeGreaterThan(guide.targetX);
    expect(guide.description).toContain('向左拍摄');
  });

  it('creates a visible triangular field of view', () => {
    expect(
      getDirectorCameraConePoints(getDirectorCameraGuide('over-shoulder')).split(' '),
    ).toHaveLength(3);
  });
});
