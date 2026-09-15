import { memo, useCallback, useEffect, useState } from 'react';
import { Camera, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useAppTranslation } from '../../i18n/appI18n';
import { formatVideoPlayerTime, videoPlayerProgressPercent } from '../../lib/videoPlayerTimeline';

const PLAYBACK_UI_SYNC_INTERVAL_MS = 100;

interface VideoPlaybackControlsProps {
  sourceRevision: string;
  duration: number;
  playing: boolean;
  muted: boolean;
  capturingFrame: boolean;
  getVideoElement: () => HTMLVideoElement | undefined;
  onTogglePlayback: () => void;
  onSeek: (time: number) => void;
  onToggleSound: () => void;
  onToggleCaptureMenu: () => void;
}

/**
 * Keep the frequently changing playback timeline outside ImageNode.
 *
 * A video frame must not invalidate the full React Flow node: that node also
 * resolves graph state, media actions and editing panels. This small memoized
 * control surface is the only React subtree refreshed while native playback is
 * running.
 */
function VideoPlaybackControlsBase({
  sourceRevision,
  duration,
  playing,
  muted,
  capturingFrame,
  getVideoElement,
  onTogglePlayback,
  onSeek,
  onToggleSound,
  onToggleCaptureMenu,
}: VideoPlaybackControlsProps) {
  const { t } = useAppTranslation();
  const [currentTime, setCurrentTime] = useState(0);

  const syncFromVideo = useCallback(() => {
    const video = getVideoElement();
    const nextTime = video?.currentTime;
    if (typeof nextTime !== 'number' || !Number.isFinite(nextTime) || nextTime < 0) return;
    setCurrentTime((previousTime) =>
      Math.abs(previousTime - nextTime) < 0.01 ? previousTime : nextTime,
    );
  }, [getVideoElement]);

  useEffect(() => {
    const video = getVideoElement();
    const nextTime = video?.currentTime;
    setCurrentTime(
      typeof nextTime === 'number' && Number.isFinite(nextTime) && nextTime >= 0 ? nextTime : 0,
    );
  }, [getVideoElement, sourceRevision]);

  useEffect(() => {
    syncFromVideo();
    if (!playing) return;

    let frame = 0;
    let lastSync = -PLAYBACK_UI_SYNC_INTERVAL_MS;
    const syncTimeline = (timestamp: number) => {
      if (timestamp - lastSync >= PLAYBACK_UI_SYNC_INTERVAL_MS) {
        lastSync = timestamp;
        syncFromVideo();
      }
      frame = window.requestAnimationFrame(syncTimeline);
    };
    frame = window.requestAnimationFrame(syncTimeline);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, syncFromVideo]);

  const safeDuration = Math.max(duration, 0.01);
  const displayedTime = Math.min(currentTime, safeDuration);

  return (
    <div
      className="nodrag nopan pointer-events-auto flex h-8 w-full items-center gap-2 text-white"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={onTogglePlayback}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/10 hover:text-white"
        title={playing ? t('imageNode.player.pause', '暂停') : t('imageNode.player.play', '播放')}
        aria-label={
          playing
            ? t('imageNode.player.pauseVideo', '暂停视频')
            : t('imageNode.player.playVideo', '播放视频')
        }
      >
        {playing ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
      </button>
      <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-white/90">
        {formatVideoPlayerTime(displayedTime)}
      </span>
      <input
        type="range"
        min={0}
        max={safeDuration}
        step={0.01}
        value={displayedTime}
        onChange={(event) => {
          const nextTime = Number(event.target.value);
          setCurrentTime(nextTime);
          onSeek(nextTime);
        }}
        style={{
          background: `linear-gradient(to right, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.96) ${videoPlayerProgressPercent(displayedTime, duration)}%, rgba(255,255,255,0.28) ${videoPlayerProgressPercent(displayedTime, duration)}%, rgba(255,255,255,0.28) 100%)`,
        }}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-white [&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-white [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        aria-label={t('imageNode.player.progress', '视频播放进度')}
        aria-valuetext={`${formatVideoPlayerTime(displayedTime)} / ${formatVideoPlayerTime(duration, 'duration')}`}
      />
      <span className="w-9 shrink-0 text-xs font-medium tabular-nums text-white/90">
        {formatVideoPlayerTime(duration, 'duration')}
      </span>
      <button
        type="button"
        onClick={onToggleSound}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/10 hover:text-white"
        title={
          muted
            ? t('imageNode.player.enableSound', '打开声音')
            : t('imageNode.player.disableSound', '关闭声音')
        }
        aria-label={
          muted
            ? t('imageNode.player.enableVideoSound', '打开视频声音')
            : t('imageNode.player.disableVideoSound', '关闭视频声音')
        }
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <button
        type="button"
        disabled={capturingFrame}
        onClick={onToggleCaptureMenu}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"
        title={t('imageNode.capture.action', '截取视频画面')}
        aria-label={t('imageNode.capture.action', '截取视频画面')}
      >
        {capturingFrame ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export const VideoPlaybackControls = memo(VideoPlaybackControlsBase);
