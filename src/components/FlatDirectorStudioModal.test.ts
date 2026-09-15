import { describe, expect, it } from 'vitest';
import source from './FlatDirectorStudioModal.tsx?raw';

describe('2D director studio modal contract', () => {
  it('selects usable images from the whole canvas and connects them automatically', () => {
    expect(source).toContain('return nodes');
    expect(source).toContain('downstreamIds.has(item.id)');
    expect(source).toContain('const ensureReferenceConnection');
    expect(source).toContain("targetHandle: 'references'");
    expect(source).toContain('chooseScene(reference)');
    expect(source).toContain('toggleSubject(reference)');
  });

  it('sorts current-canvas references by newest or oldest node order', () => {
    expect(source).toContain("useState<ReferenceSortOrder>('newest')");
    expect(source).toContain('data-director-reference-sort="true"');
    expect(source).toContain("t('library.editor.canvasSortNewest', '最新节点优先')");
    expect(source).toContain("t('library.editor.canvasSortOldest', '最早节点优先')");
    expect(source).toContain('const sortedReferences = useMemo');
    expect(source).toContain('sortedReferences.map((reference)');
  });

  it('uses a feet-anchored, aspect-aware stage with precise placement controls', () => {
    expect(source).toContain('DIRECTOR_ASPECT_RATIOS');
    expect(source).toContain("aspectRatio: aspectRatio.replace(':', ' / ')");
    expect(source).toContain('onPointerDown={placeSelectedMarker}');
    expect(source).toContain("transform: 'translate(-50%, -100%)'");
    expect(source).toContain('height: `${figureHeightPercent(subject.scale)}%`');
    expect(source).toContain('height: `${figureHeightPercent(actor.scale)}%`');
    expect(source).not.toContain('scale(${subject.scale / 120})');
    expect(source).toContain('flatDirectorSubjectCode(index)');
    expect(source).toContain('POSITION_PRESETS.map');
    expect(source).toContain('depth: preset.y');
  });

  it('invalidates stale output and compiles the current draft into one reusable image task', () => {
    expect(source).toContain('directorOutputDirty: true');
    expect(source).toContain('directorConstraintPrompt: undefined');
    expect(source).toContain('propagate(modalNodeId)');
    expect(source).toContain('await createControlImage(scene, outputAspectRatio)');
    expect(source).toContain('buildFlatDirectorConstraintPrompt(scene, outputAspectRatio)');
    expect(source).toContain('directorReferenceLabels: referenceManifest.map');
    expect(source).toContain('createImageFromDirector(modalNodeId)');
    expect(source).toContain('disabled={!readiness.ready || buildingOutput || imageTaskBusy}');
    expect(source).not.toContain('generateNode(modalNodeId)');
  });

  it('cancels stale asynchronous builds instead of overwriting a newer draft', () => {
    expect(source).toContain('const applyRunId = useRef(0)');
    expect(source).toContain(
      'const draftSignature = directorDraftSignature(scene, outputAspectRatio)',
    );
    expect(source).toContain('runId !== applyRunId.current');
    expect(source).toContain('latestDraftSignature.current !== draftSignature');
    expect(source).toContain("currentStore.openModal !== 'director-studio-2d'");
    expect(source).toContain('currentStore.modalNodeId !== modalNodeId');
    expect(source).toContain('applyRunId.current += 1');
    expect(source).toContain('if (runId === applyRunId.current) setBuildingOutput(false)');
  });

  it('resolves every persisted director image only at the renderer boundary', () => {
    expect(source).toContain("mediaPreviewUrl(reference.imageUrl, 'image')");
    expect(source).toContain("mediaPreviewUrl(draft.sceneUrl, 'image')");
    expect(source).toContain("mediaPreviewUrl(subject.imageUrl, 'image')");
    expect(source).not.toContain('src={reference.imageUrl}');
    expect(source).not.toContain('src={draft.sceneUrl}');
    expect(source).not.toContain('src={subject.imageUrl}');
  });
});
