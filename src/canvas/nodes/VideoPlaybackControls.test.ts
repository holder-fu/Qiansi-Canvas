import { describe, expect, it } from 'vitest';
import imageNodeSource from './ImageNode.tsx?raw';
import controlsSource from './VideoPlaybackControls.tsx?raw';

describe('video playback UI scheduling', () => {
  it('isolates frequent timeline updates from the full React Flow image node', () => {
    expect(imageNodeSource).toContain('<VideoPlaybackControls');
    expect(controlsSource).toContain('const [currentTime, setCurrentTime] = useState(0)');
    expect(controlsSource).toContain('export const VideoPlaybackControls = memo(');
  });

  it('refreshes only the lightweight controls at a bounded cadence during normal playback', () => {
    expect(controlsSource).toContain('const PLAYBACK_UI_SYNC_INTERVAL_MS = 100');
    expect(controlsSource).toContain('window.requestAnimationFrame(syncTimeline)');

    const parentTimelineStart = imageNodeSource.indexOf(
      'if (!isVideoNode || !selected || !trimOpen || !previewPlaying) return;',
    );
    expect(parentTimelineStart).toBeGreaterThan(-1);
  });

  it('keeps parent playback-time state updates behind the trim-panel gate', () => {
    const handlerStart = imageNodeSource.indexOf('const handleVideoTimeUpdate = useCallback(');
    const handlerEnd = imageNodeSource.indexOf(
      'const handleCaptureFrame = useCallback(',
      handlerStart,
    );
    const handlerSource = imageNodeSource.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('if (trimOpen) setPreviewTime(range.end)');
    expect(handlerSource).toContain('if (trimOpen) setPreviewTime(range.start)');
    expect(handlerSource).toContain('if (trimOpen) setPreviewTime(video.currentTime)');
    expect(handlerSource).not.toContain('\n      setPreviewTime(video.currentTime);');
  });
});
