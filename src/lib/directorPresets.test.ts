import { describe, expect, it } from 'vitest';
import type { DirectorSubjectPlacement } from '../canvas/nodeTypes';
import { createDefaultDirectorScene, createDefaultDirectorSubject } from './directorConstraints';
import {
  applyDirectorCompositionPreset,
  getDirectorCompositionPreset,
  type DirectorCompositionPreset,
} from './directorPresets';

function subject(id: string): DirectorSubjectPlacement {
  return createDefaultDirectorSubject({
    id,
    sourceNodeId: `source-${id}`,
    label: id,
    imageUrl: `${id}.png`,
    x: 50,
    y: 50,
    scale: 100,
    rotation: 0,
  });
}

function preset(id: string): DirectorCompositionPreset {
  const result = getDirectorCompositionPreset(id);
  if (!result) throw new Error(`Missing director preset: ${id}`);
  return result;
}

describe('director composition presets', () => {
  it('repositions existing subjects without replacing their identity images', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [subject('hero'), subject('partner')];
    const result = applyDirectorCompositionPreset(scene, preset('dialogue'));

    expect(result.compositionPresetId).toBe('dialogue');
    expect(result.cameraPreset).toBe('medium-front');
    expect(result.subjects).toMatchObject([
      { id: 'hero', imageUrl: 'hero.png', x: 34, y: 64, bodyFacing: 'front-right' },
      { id: 'partner', imageUrl: 'partner.png', x: 66, y: 64, bodyFacing: 'front-left' },
    ]);
  });

  it('keeps additional subjects inside the stage instead of creating fake subjects', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [subject('one'), subject('two'), subject('three')];
    const result = applyDirectorCompositionPreset(scene, preset('solo-center'));

    expect(result.subjects).toHaveLength(3);
    expect(result.subjects.map((item) => item.id)).toEqual(['one', 'two', 'three']);
    for (const item of result.subjects) {
      expect(item.x).toBeGreaterThanOrEqual(4);
      expect(item.x).toBeLessThanOrEqual(96);
      expect(item.y).toBeGreaterThanOrEqual(10);
      expect(item.y).toBeLessThanOrEqual(92);
    }
  });

  it('does not invent subjects when a preset is applied to an empty stage', () => {
    const scene = createDefaultDirectorScene();
    const result = applyDirectorCompositionPreset(scene, preset('solo-center'));
    expect(result.subjects).toEqual([]);
  });
});
