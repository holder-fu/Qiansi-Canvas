export interface StoredVideoPosterState {
  isVideoNode: boolean;
  hasDirectVideoUrl: boolean;
  hasStoredVideoId: boolean;
  zoom: number;
  decoderGranted: boolean;
  posterUrl?: string;
  failedPosterUrl?: string | null;
}

/**
 * A browser-stored video needs a short-lived object URL to create or repair its
 * static poster. Playback still remains behind the shared decoder budget.
 */
export function shouldHydrateStoredVideoSource(state: StoredVideoPosterState) {
  if (
    !state.isVideoNode ||
    state.hasDirectVideoUrl ||
    !state.hasStoredVideoId ||
    state.zoom < 0.3
  ) {
    return false;
  }
  return (
    state.decoderGranted ||
    !state.posterUrl ||
    (Boolean(state.failedPosterUrl) && state.failedPosterUrl === state.posterUrl)
  );
}
