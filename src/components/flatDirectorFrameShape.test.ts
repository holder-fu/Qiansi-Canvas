import { describe, expect, it } from 'vitest';
import studioSource from './FlatDirectorStudioModal.tsx?raw';
import nodeSource from '../canvas/nodes/DirectorNode.tsx?raw';

describe('2D director subject frame integration', () => {
  it('exposes every frame shape and persists the selected subject value', () => {
    expect(studioSource).toContain('DIRECTOR_SUBJECT_FRAME_SHAPES.map((shape) =>');
    expect(studioSource).toContain("t('director2d.subject.frameShape', '人物边框形状')");
    expect(studioSource).toContain('patchSubject(selectedSubject.id, { frameShape: shape })');
    expect(studioSource).toContain('aria-pressed={active}');
  });

  it('uses the persisted shape in the stage and the canvas node preview', () => {
    expect(studioSource).toContain('directorSubjectFrameStyle(subject.frameShape)');
    expect(nodeSource).toContain('directorSubjectFrameStyle(subject.frameShape)');
  });
});
