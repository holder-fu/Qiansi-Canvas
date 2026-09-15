export const GENERATED_VIDEO_AUDIO_TRACK_STATUSES = Object.freeze([
  'present',
  'absent',
  'unverified',
]);

export function parseGeneratedVideoAudioTrackProbe(stdout) {
  let payload;
  try {
    payload = JSON.parse(String(stdout || ''));
  } catch {
    return 'unverified';
  }
  if (!Array.isArray(payload?.streams)) return 'unverified';
  return payload.streams.some((stream) => stream?.codec_type === 'audio') ? 'present' : 'absent';
}
