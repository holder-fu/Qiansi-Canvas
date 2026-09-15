import { Eye, Loader2, Palette, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  COLOR_GRADE_PRESETS,
  DEFAULT_COLOR_GRADE,
  applyColorGradeToPixels,
  isDefaultColorGrade,
  type ColorGradeSettings,
} from '../lib/colorGrading';
import { editedImageName } from '../lib/imageEditing';
import { useAppTranslation } from '../i18n/appI18n';
import { useCanvasStore } from '../store/canvasStore';

type ControlKey = keyof ColorGradeSettings;

const CONTROLS: Array<{
  key: ControlKey;
  label: string;
  labelKey: string;
  min: number;
  max: number;
  accent: string;
}> = [
  {
    key: 'exposure',
    label: '曝光',
    labelKey: 'colorGrading.control.exposure',
    min: -100,
    max: 100,
    accent: 'from-black via-zinc-400 to-white',
  },
  {
    key: 'contrast',
    label: '对比度',
    labelKey: 'colorGrading.control.contrast',
    min: -100,
    max: 100,
    accent: 'from-zinc-500 via-zinc-300 to-white',
  },
  {
    key: 'highlights',
    label: '高光',
    labelKey: 'colorGrading.control.highlights',
    min: -100,
    max: 100,
    accent: 'from-zinc-700 via-zinc-300 to-white',
  },
  {
    key: 'shadows',
    label: '阴影',
    labelKey: 'colorGrading.control.shadows',
    min: -100,
    max: 100,
    accent: 'from-black via-zinc-600 to-zinc-200',
  },
  {
    key: 'saturation',
    label: '饱和度',
    labelKey: 'colorGrading.control.saturation',
    min: -100,
    max: 100,
    accent: 'from-zinc-500 via-rose-500 to-amber-400',
  },
  {
    key: 'temperature',
    label: '色温',
    labelKey: 'colorGrading.control.temperature',
    min: -100,
    max: 100,
    accent: 'from-sky-500 via-zinc-200 to-orange-400',
  },
  {
    key: 'tint',
    label: '色调',
    labelKey: 'colorGrading.control.tint',
    min: -100,
    max: 100,
    accent: 'from-emerald-500 via-zinc-200 to-fuchsia-500',
  },
  {
    key: 'fade',
    label: '褪色',
    labelKey: 'colorGrading.control.fade',
    min: 0,
    max: 100,
    accent: 'from-zinc-800 to-zinc-300',
  },
  {
    key: 'vignette',
    label: '暗角',
    labelKey: 'colorGrading.control.vignette',
    min: 0,
    max: 100,
    accent: 'from-zinc-300 to-black',
  },
];

function canvasDataUrl(canvas: HTMLCanvasElement, crossOriginError: string) {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error(crossOriginError);
  }
}

export function ColorGradingModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.modalNodeId));
  const isOpen = openModal === 'color-grading';
  const sourceUrl = node?.data.imageUrl || node?.data.images?.[0];
  const sourceName =
    node?.data.imageFileName || node?.data.title || t('colorGrading.sourceName', '图片');
  const [settings, setSettings] = useState<ColorGradeSettings>(DEFAULT_COLOR_GRADE);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const activePreset = useMemo(
    () =>
      COLOR_GRADE_PRESETS.find((preset) =>
        (Object.keys(settings) as ControlKey[]).every(
          (key) => settings[key] === preset.settings[key],
        ),
      )?.id,
    [settings],
  );

  const drawPreview = useCallback(() => {
    const image = imageRef.current;
    const canvas = previewRef.current;
    if (!image || !canvas || !natural) return;
    const scale = Math.min(1, 1200 / natural.width, 760 / natural.height);
    canvas.width = Math.max(1, Math.round(natural.width * scale));
    canvas.height = Math.max(1, Math.round(natural.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (compareOriginal || isDefaultColorGrade(settings)) return;
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    frame.data.set(applyColorGradeToPixels(frame.data, canvas.width, canvas.height, settings));
    context.putImageData(frame, 0, 0);
  }, [compareOriginal, natural, settings]);

  useEffect(() => {
    if (!isOpen) return;
    setSettings(DEFAULT_COLOR_GRADE);
    setNatural(null);
    setCompareOriginal(false);
    setBusy(false);
    setError(null);
  }, [isOpen, node?.id]);

  useEffect(() => {
    if (!isOpen || !natural) return;
    const frame = window.requestAnimationFrame(drawPreview);
    return () => window.cancelAnimationFrame(frame);
  }, [drawPreview, isOpen, natural]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, closeModal, isOpen]);

  if (!isOpen || !node || !sourceUrl) return null;

  function updateSetting(key: ControlKey, value: number) {
    setSettings((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function applyGrade() {
    const image = imageRef.current;
    const currentNode = node;
    if (!image || !natural || !currentNode || busy) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = natural.width;
      canvas.height = natural.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        throw new Error(t('colorGrading.error.canvasUnavailable', '浏览器无法创建图片调色画布。'));
      }
      context.drawImage(image, 0, 0, natural.width, natural.height);
      const frame = context.getImageData(0, 0, natural.width, natural.height);
      frame.data.set(applyColorGradeToPixels(frame.data, natural.width, natural.height, settings));
      context.putImageData(frame, 0, 0);
      const resultUrl = canvasDataUrl(
        canvas,
        t(
          'colorGrading.error.crossOrigin',
          '当前图片受跨域限制，无法在浏览器中导出调色结果。请下载后重新上传。',
        ),
      );
      const store = useCanvasStore.getState();
      const references = Array.isArray(currentNode.data.composerReferences)
        ? (currentNode.data.composerReferences as Array<Record<string, unknown>>)
        : [];
      store.takeSnapshot();
      store.updateNodeData(currentNode.id, {
        imageUrl: resultUrl,
        images: [resultUrl],
        output: resultUrl,
        imageFileName: editedImageName(sourceName, 'cinematic_grade'),
        aspectRatio: `${natural.width}:${natural.height}`,
        composerReferences: references,
      });
      store.propagate(currentNode.id);
      closeModal();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('colorGrading.error.failed', '图片调色失败，请重试。'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/68 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('colorGrading.dialogLabel', '电影调色')}
      onMouseDown={() => !busy && closeModal()}
    >
      <div
        className="flex h-[min(760px,94vh)] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#19191b] shadow-[0_28px_90px_rgba(0,0,0,0.72)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-16 shrink-0 items-center border-b border-white/[0.07] px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.07] text-white/80">
              <Palette className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white/92">
                {t('colorGrading.title', '电影调色')}
              </h2>
              <p className="mt-0.5 text-[11px] text-white/38">
                {t('colorGrading.description', '实时调整图片色调，应用后写回当前图片节点')}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onPointerDown={() => setCompareOriginal(true)}
              onPointerUp={() => setCompareOriginal(false)}
              onPointerCancel={() => setCompareOriginal(false)}
              onPointerLeave={() => setCompareOriginal(false)}
              className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white"
              title={t('colorGrading.compareTitle', '按住查看原图')}
            >
              <Eye className="h-4 w-4" />
              {t('colorGrading.compare', '按住对比')}
            </button>
            <button
              type="button"
              onClick={() => setSettings(DEFAULT_COLOR_GRADE)}
              className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              {t('colorGrading.reset', '重置')}
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
              aria-label={t('colorGrading.close', '关闭电影调色')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#0d0d0f] p-5">
            <img
              ref={imageRef}
              src={sourceUrl}
              alt=""
              className="hidden"
              onLoad={(event) => {
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
                setError(null);
              }}
              onError={() =>
                setError(t('colorGrading.error.loadFailed', '图片加载失败，无法进入调色。'))
              }
            />
            <canvas
              ref={previewRef}
              className="block max-h-full max-w-full rounded-lg object-contain shadow-[0_18px_55px_rgba(0,0,0,0.55)]"
              aria-label={t('colorGrading.previewAria', '电影调色实时预览')}
            />
            {compareOriginal && (
              <span className="pointer-events-none absolute left-7 top-7 rounded-full border border-white/12 bg-black/55 px-3 py-1 text-[11px] text-white/75 backdrop-blur">
                {t('colorGrading.originalBadge', '原图')}
              </span>
            )}
            {natural && (
              <span className="pointer-events-none absolute bottom-5 left-5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] tabular-nums text-white/38 backdrop-blur">
                {natural.width} × {natural.height}
              </span>
            )}
          </section>

          <aside className="flex w-[390px] shrink-0 flex-col border-l border-white/[0.07] bg-[#1d1d20]">
            <div className="border-b border-white/[0.07] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-white/70">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('colorGrading.presets', '电影预设')}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {COLOR_GRADE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSettings({ ...preset.settings })}
                    className={`h-9 rounded-lg border text-[11px] transition-colors ${
                      activePreset === preset.id
                        ? 'border-white/35 bg-white text-black'
                        : 'border-white/[0.08] bg-white/[0.035] text-white/58 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    {preset.id === 'original'
                      ? t('colorGrading.preset.original', '原片')
                      : preset.id === 'cinema-warm'
                        ? t('colorGrading.preset.cinemaWarm', '电影暖调')
                        : preset.id === 'teal-orange'
                          ? t('colorGrading.preset.tealOrange', '青橙')
                          : preset.id === 'cold-night'
                            ? t('colorGrading.preset.coldNight', '冷月')
                            : preset.id === 'film-fade'
                              ? t('colorGrading.preset.filmFade', '复古胶片')
                              : preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {CONTROLS.map((control) => (
                <label key={control.key} className="block">
                  <span className="mb-2 flex items-center justify-between text-[11px] text-white/58">
                    <span>{t(control.labelKey, control.label)}</span>
                    <input
                      type="number"
                      min={control.min}
                      max={control.max}
                      value={settings[control.key]}
                      onChange={(event) =>
                        updateSetting(
                          control.key,
                          Math.max(control.min, Math.min(control.max, Number(event.target.value))),
                        )
                      }
                      className="h-6 w-14 rounded-md border border-white/[0.08] bg-black/20 px-1.5 text-right text-[11px] tabular-nums text-white/68 outline-none focus:border-white/25"
                      aria-label={t('colorGrading.controlValueAria', '{label}数值', {
                        label: t(control.labelKey, control.label),
                      })}
                    />
                  </span>
                  <div className="relative h-2">
                    <div
                      className={`absolute inset-x-0 top-0.5 h-1 rounded-full bg-gradient-to-r ${control.accent} opacity-70`}
                    />
                    <input
                      type="range"
                      min={control.min}
                      max={control.max}
                      value={settings[control.key]}
                      onChange={(event) => updateSetting(control.key, Number(event.target.value))}
                      className="absolute inset-0 h-2 w-full cursor-pointer opacity-80"
                      aria-label={t(control.labelKey, control.label)}
                    />
                  </div>
                </label>
              ))}
            </div>
          </aside>
        </div>

        <footer className="flex min-h-16 shrink-0 items-center border-t border-white/[0.07] px-5">
          <p className="text-[11px] text-white/35">
            {t(
              'colorGrading.localProcessingHint',
              '本地实时处理，不消耗模型额度；可通过画布撤销恢复原图。',
            )}
          </p>
          {error && <p className="ml-4 max-w-xl text-xs text-red-300">{error}</p>}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={busy}
              className="h-9 rounded-xl border border-white/10 px-4 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              {t('colorGrading.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={() => void applyGrade()}
              disabled={busy || !natural || isDefaultColorGrade(settings)}
              className="flex h-9 min-w-24 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Palette className="h-3.5 w-3.5" />
              )}
              {busy ? t('colorGrading.processing', '处理中') : t('colorGrading.apply', '应用调色')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
