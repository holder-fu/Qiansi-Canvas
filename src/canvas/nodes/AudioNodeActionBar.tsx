import { NodeToolbar, Position } from '@xyflow/react';
import { ArrowUp, Download, Gauge, Library, Mic, Scissors, Upload, X } from 'lucide-react';
import { useAppTranslation } from '../../i18n/appI18n';
import {
  AUDIO_EDIT_RATE_MAX,
  AUDIO_EDIT_RATE_MIN,
  AUDIO_TRIM_MIN_DURATION_SECONDS,
  type AudioTrimBoundary,
} from '../../lib/audioEditing';

export type AudioToolMode = 'trim' | 'speed' | null;

type AudioNodeActionBarProps = {
  activeMode: AudioToolMode;
  trimStart: number;
  trimEnd: number;
  trimDuration: number;
  speed: number;
  busy: boolean;
  onTrim: () => void;
  onSpeed: () => void;
  onCloseEditor: () => void;
  onTrimBoundaryChange: (boundary: AudioTrimBoundary, value: number) => void;
  onSpeedChange: (speed: number) => void;
  onApplyTrim: () => void;
  onApplySpeed: () => void;
  onReplaceAudio: () => void;
  onChooseAssetAudio: () => void;
  onRecordAgain: () => void;
  onDownload: () => void;
};

export function AudioNodeActionBar({
  activeMode,
  trimStart,
  trimEnd,
  trimDuration,
  speed,
  busy,
  onTrim,
  onSpeed,
  onCloseEditor,
  onTrimBoundaryChange,
  onSpeedChange,
  onApplyTrim,
  onApplySpeed,
  onReplaceAudio,
  onChooseAssetAudio,
  onRecordAgain,
  onDownload,
}: AudioNodeActionBarProps) {
  const { t } = useAppTranslation();
  const tools = [
    {
      id: 'trim',
      label: t('node.audio.toolbar.trim', '截取'),
      icon: Scissors,
      active: activeMode === 'trim',
      onClick: onTrim,
    },
    {
      id: 'speed',
      label: t('node.audio.toolbar.speed', '变速'),
      icon: Gauge,
      active: activeMode === 'speed',
      onClick: onSpeed,
    },
  ] as const;
  const sourceTools = [
    {
      id: 'replace-audio',
      label: t('node.audio.replace', '替换音频'),
      icon: Upload,
      onClick: onReplaceAudio,
    },
    {
      id: 'choose-asset-audio',
      label: t('node.audio.asset.choose', '从资产库中'),
      icon: Library,
      onClick: onChooseAssetAudio,
    },
    {
      id: 'record-again',
      label: t('node.audio.recorder.recordAgain', '重新录制'),
      icon: Mic,
      onClick: onRecordAgain,
    },
  ] as const;

  const stopCanvasInteraction = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <>
      <NodeToolbar
        isVisible
        position={Position.Top}
        offset={44}
        align="center"
        className="nodrag nopan pointer-events-auto z-[70]"
        onPointerDown={stopCanvasInteraction}
        onClick={stopCanvasInteraction}
      >
        <div
          data-audio-node-action-bar
          className="flex h-11 w-max max-w-[calc(100vw-24px)] items-center gap-0.5 overflow-x-auto rounded-xl border border-white/[0.1] bg-[#18181b]/95 px-2 shadow-[0_12px_35px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          {tools.map(({ id, label, icon: Icon, active, onClick }) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={onClick}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition-colors disabled:cursor-wait disabled:opacity-35 ${
                active
                  ? 'bg-white/[0.13] text-white'
                  : 'text-white/78 hover:bg-white/[0.08] hover:text-white'
              }`}
              aria-pressed={active}
            >
              <Icon className="h-3.5 w-3.5 text-white/65" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
          <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
          {sourceTools.map(({ id, label, icon: Icon, onClick }) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={onClick}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-white/72 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:opacity-35"
              title={label}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-white/58" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
          <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
          <button
            type="button"
            disabled={busy}
            onClick={onDownload}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/72 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:opacity-35"
            title={t('node.audio.download', '下载音频')}
            aria-label={t('node.audio.download', '下载音频')}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </NodeToolbar>

      {activeMode && (
        <NodeToolbar
          isVisible
          position={Position.Bottom}
          offset={14}
          align="center"
          className="nodrag nopan pointer-events-auto z-[70]"
          onPointerDown={stopCanvasInteraction}
          onClick={stopCanvasInteraction}
        >
          {activeMode === 'trim' ? (
            <div className="flex h-12 w-[430px] max-w-[calc(100vw-24px)] items-center gap-2 rounded-xl border border-white/[0.1] bg-[#202023]/95 px-2 shadow-[0_12px_35px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              <button
                type="button"
                onClick={onCloseEditor}
                disabled={busy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                title={t('node.audio.editor.close', '关闭音频编辑')}
                aria-label={t('node.audio.editor.close', '关闭音频编辑')}
              >
                <X className="h-4 w-4" />
              </button>
              <span className="shrink-0 text-xs font-semibold text-white/90">
                {t('node.audio.toolbar.trim', '截取')}
              </span>
              <label className="ml-auto flex h-8 w-[112px] shrink-0 items-center gap-1 rounded-lg bg-white/[0.09] px-2 text-white/80 focus-within:ring-1 focus-within:ring-cyan-300/70">
                <span className="shrink-0 text-[10px] text-white/45">
                  {t('node.audio.trim.start', '开始')}
                </span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, trimEnd - AUDIO_TRIM_MIN_DURATION_SECONDS)}
                  step={0.01}
                  value={trimStart.toFixed(2)}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(value)) onTrimBoundaryChange('start', value);
                  }}
                  disabled={busy}
                  className="nodrag nopan min-w-0 flex-1 bg-transparent text-right text-[11px] tabular-nums text-white outline-none disabled:cursor-wait"
                  aria-label={t('node.audio.trim.startInput', '截取开始时间（秒）')}
                />
                <span className="text-[10px] text-white/45">s</span>
              </label>
              <span className="shrink-0 text-[10px] text-white/35">—</span>
              <label className="flex h-8 w-[112px] shrink-0 items-center gap-1 rounded-lg bg-white/[0.09] px-2 text-white/80 focus-within:ring-1 focus-within:ring-cyan-300/70">
                <span className="shrink-0 text-[10px] text-white/45">
                  {t('node.audio.trim.end', '结束')}
                </span>
                <input
                  type="number"
                  min={Math.min(trimDuration, trimStart + AUDIO_TRIM_MIN_DURATION_SECONDS)}
                  max={trimDuration}
                  step={0.01}
                  value={trimEnd.toFixed(2)}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(value)) onTrimBoundaryChange('end', value);
                  }}
                  disabled={busy}
                  className="nodrag nopan min-w-0 flex-1 bg-transparent text-right text-[11px] tabular-nums text-white outline-none disabled:cursor-wait"
                  aria-label={t('node.audio.trim.endInput', '截取结束时间（秒）')}
                />
                <span className="text-[10px] text-white/45">s</span>
              </label>
              <button
                type="button"
                onClick={onApplyTrim}
                disabled={busy || trimEnd - trimStart < AUDIO_TRIM_MIN_DURATION_SECONDS}
                className="h-8 shrink-0 rounded-lg bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t('node.audio.trim.generate', '生成')}
              </button>
            </div>
          ) : (
            <div className="flex h-12 w-[408px] max-w-[calc(100vw-24px)] items-center gap-2 rounded-xl border border-white/[0.1] bg-[#202023]/95 px-2 shadow-[0_12px_35px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              <button
                type="button"
                onClick={onCloseEditor}
                disabled={busy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                title={t('node.audio.editor.close', '关闭音频编辑')}
                aria-label={t('node.audio.editor.close', '关闭音频编辑')}
              >
                <X className="h-4 w-4" />
              </button>
              <span className="shrink-0 text-xs font-semibold text-white/90">
                {t('node.audio.toolbar.speed', '变速')}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-white/48">0.1×</span>
              <input
                type="range"
                min={AUDIO_EDIT_RATE_MIN}
                max={AUDIO_EDIT_RATE_MAX}
                step={0.05}
                value={speed}
                onChange={(event) => onSpeedChange(Number(event.currentTarget.value))}
                disabled={busy}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-cyan-400 disabled:cursor-wait"
                aria-label={t('node.audio.speed.value', '音频速度')}
              />
              <span className="shrink-0 text-[10px] tabular-nums text-white/48">4.0×</span>
              <label className="flex h-8 w-[70px] shrink-0 items-center rounded-lg bg-white/[0.12] px-2 text-white/90 focus-within:ring-1 focus-within:ring-cyan-300/70">
                <input
                  type="number"
                  min={AUDIO_EDIT_RATE_MIN}
                  max={AUDIO_EDIT_RATE_MAX}
                  step={0.05}
                  value={speed.toFixed(2)}
                  onChange={(event) => onSpeedChange(Number(event.currentTarget.value))}
                  disabled={busy}
                  className="nodrag nopan min-w-0 flex-1 bg-transparent text-right text-[11px] tabular-nums text-white outline-none disabled:cursor-wait"
                  aria-label={t('node.audio.speed.value', '音频速度')}
                />
                <span className="ml-0.5 text-[10px] text-white/60">×</span>
              </label>
              <button
                type="button"
                onClick={onApplySpeed}
                disabled={busy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black transition-colors hover:bg-white/90 disabled:cursor-wait disabled:opacity-35"
                title={t('node.audio.speed.generate', '生成变速音频')}
                aria-label={t('node.audio.speed.generate', '生成变速音频')}
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>
          )}
        </NodeToolbar>
      )}
    </>
  );
}
