import { describe, expect, it } from 'vitest';
import source from './ImageNode.tsx?raw';

describe('ImageNode video poster rendering', () => {
  it('renders the resolved bridge poster while the hover decoder is released', () => {
    expect(source).toContain(') : isVideoNode && videoPosterUrl ? (');
    expect(source).toContain('src={videoPosterUrl}');
    expect(source).toContain('loading="eager"');
    expect(source).not.toContain(') : isVideoNode && displayPreviewUrl ? (');
  });

  it('does not preload full video data when a static poster is available', () => {
    expect(source).toContain(
      "preload={showingDirectorPrevis || !videoPosterUrl ? 'auto' : 'none'}",
    );
    expect(source).not.toContain(
      "preload={showingDirectorPrevis || !displayPreviewUrl ? 'auto' : 'none'}",
    );
  });

  it('shows the locally decoded poster without waiting for the Bridge original upload', () => {
    expect(source).toContain('replaceSessionVideoPoster(sessionVideoUrl, poster.blob)');
    expect(source).toContain('sessionVideoPosterUrl ||');
    expect(source).toContain('persistVideoFile(file, projectId, (poster) => {');
  });

  it('keeps the durable source until an edited video has been persisted', () => {
    const editStart = source.indexOf('const replaceVideoWithEditedResult = useCallback(');
    const editEnd = source.indexOf('const handleApplyVideoTrim = useCallback(', editStart);
    const editSource = source.slice(editStart, editEnd);

    expect(editSource).toContain(
      'const bridgeItem = await persistVideoFile(file, store.activeProjectId);',
    );
    expect(editSource.indexOf('const bridgeItem = await persistVideoFile(')).toBeLessThan(
      editSource.indexOf('store.takeSnapshot();'),
    );
    expect(editSource).not.toContain('sessionVideoUrl');
    expect(editSource).not.toContain("mediaPersistenceState: 'session-only'");
    expect(source).toContain('await replaceVideoWithEditedResult(');
  });

  it('does not present an inherited source video as a masked-repair result', () => {
    expect(source).toContain("data.composerParams?.videoTool === 'masked-repair'");
    expect(source).toContain('const directVideoUrl = isPendingMaskedRepair');
    expect(source).toContain('const storedPreviewUrl = isPendingMaskedRepair');
  });
});
