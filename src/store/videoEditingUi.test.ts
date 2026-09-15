import { beforeEach, describe, expect, it } from 'vitest';
import { useVideoEditingUi } from './videoEditingUi';

describe('video editing UI state', () => {
  beforeEach(() =>
    useVideoEditingUi.setState({ activeTrimNodeId: null, videoRemakePreviewRequest: null }),
  );

  it('tracks only the active trim panel and ignores stale cleanup from another node', () => {
    const { setTrimNodeOpen } = useVideoEditingUi.getState();

    setTrimNodeOpen('video-a', true);
    expect(useVideoEditingUi.getState().activeTrimNodeId).toBe('video-a');

    setTrimNodeOpen('video-b', true);
    setTrimNodeOpen('video-a', false);
    expect(useVideoEditingUi.getState().activeTrimNodeId).toBe('video-b');

    setTrimNodeOpen('video-b', false);
    expect(useVideoEditingUi.getState().activeTrimNodeId).toBeNull();
  });

  it('publishes finite remake preview requests without persisting them in canvas state', () => {
    const { previewVideoRemakeFrame } = useVideoEditingUi.getState();

    previewVideoRemakeFrame('video-a', 2.75);
    expect(useVideoEditingUi.getState().videoRemakePreviewRequest).toEqual({
      nodeId: 'video-a',
      time: 2.75,
      requestId: 1,
    });

    previewVideoRemakeFrame('video-a', -1);
    expect(useVideoEditingUi.getState().videoRemakePreviewRequest).toEqual({
      nodeId: 'video-a',
      time: 0,
      requestId: 2,
    });

    previewVideoRemakeFrame('video-b', Number.NaN);
    expect(useVideoEditingUi.getState().videoRemakePreviewRequest?.requestId).toBe(2);
  });
});
