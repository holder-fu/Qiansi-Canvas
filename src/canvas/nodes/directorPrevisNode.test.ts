import { describe, expect, it } from 'vitest';
import source from './ImageNode.tsx?raw';

describe('3D director previsualization node playback', () => {
  it('loads and autoplays the muted previsualization while retaining stored duration', () => {
    expect(source).toContain('const showingDirectorPrevis = Boolean(');
    expect(source).toContain('autoPlay={showingDirectorPrevis}');
    expect(source).toContain('muted={showingDirectorPrevis || previewMuted}');
    expect(source).toContain(
      "preload={showingDirectorPrevis || !videoPosterUrl ? 'auto' : 'none'}",
    );
    expect(source).toContain('const storedDuration = Number(data.durationSeconds)');
    expect(source).toContain('loop={!trimOpen || trimLoopPlayback}');
    expect(source).toContain('applyVideoPlaybackBoundary(');
  });

  it('keeps the standalone video upload state ahead of the poster placeholder', () => {
    expect(source).toContain(') : isVideoNode && !isEmpty ? (');
    expect(source).toContain("t('node.video.upload', '上传视频')");
  });

  it('normalizes persisted video URLs and supplies bridge-backed posters', () => {
    expect(source).toContain('const rawVideoUrl =');
    expect(source).toContain('directVideoUrl || effectVideoUrl ||');
    expect(source).toContain('const resolvedVideoUrl = rawVideoUrl');
    expect(source).toContain('const videoPosterUrl =');
    expect(source).toContain('poster={videoPosterUrl}');
  });

  it('does not duplicate a selected generation error below the composer', () => {
    expect(source).toContain("!(selected && typeof data.generationError === 'string')");
  });
});
