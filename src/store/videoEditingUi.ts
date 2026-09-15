import { create } from 'zustand';

type VideoEditingUiState = {
  activeTrimNodeId: string | null;
  videoRemakePreviewRequest: {
    nodeId: string;
    time: number;
    requestId: number;
  } | null;
  setTrimNodeOpen: (nodeId: string, open: boolean) => void;
  previewVideoRemakeFrame: (nodeId: string, time: number) => void;
};

/** Transient video-editing UI state. It is intentionally excluded from canvas persistence. */
export const useVideoEditingUi = create<VideoEditingUiState>((set) => ({
  activeTrimNodeId: null,
  videoRemakePreviewRequest: null,
  setTrimNodeOpen: (nodeId, open) =>
    set((state) => {
      if (open) return state.activeTrimNodeId === nodeId ? state : { activeTrimNodeId: nodeId };
      return state.activeTrimNodeId === nodeId ? { activeTrimNodeId: null } : state;
    }),
  previewVideoRemakeFrame: (nodeId, time) => {
    if (!nodeId || !Number.isFinite(time)) return;
    set((state) => ({
      videoRemakePreviewRequest: {
        nodeId,
        time: Math.max(0, time),
        requestId: (state.videoRemakePreviewRequest?.requestId ?? 0) + 1,
      },
    }));
  },
}));
