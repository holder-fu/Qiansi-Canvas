import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { Modal } from './Modal';
import { useCanvasStore, type GenParams } from '../store/canvasStore';
import { useAppTranslation } from '../i18n/appI18n';

const MODES: { value: GenParams['mode']; label: string }[] = [
  { value: 'first-frame', label: '首帧' },
  { value: 'last-frame', label: '尾帧' },
  { value: 'both-frames', label: '首尾帧' },
  { value: 'lighting', label: '打光' },
  { value: 'redraw', label: '变画' },
];

const RATIOS: GenParams['aspectRatio'][] = [
  '16:9',
  '9:16',
  '1:1',
  '3:4',
  '4:3',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
  '21:9',
];
const RESOLUTIONS: GenParams['resolution'][] = ['720P', '1080P', '2K', '4K'];
const DURATIONS: GenParams['duration'][] = [5, 10];
const QUALITIES: GenParams['quality'][] = ['standard', '2K', '4K'];
const COUNTS: GenParams['count'][] = [1, 2, 4];
const VIEW_COUNTS: GenParams['viewCount'][] = [3, 4, 6];

export function NodeParamsPanel() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((s) => s.openModal);
  const closeModal = useCanvasStore((s) => s.closeModal);
  const modalNodeId = useCanvasStore((s) => s.modalNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeGenParams = useCanvasStore((s) => s.updateNodeGenParams);
  const generateNode = useCanvasStore((s) => s.generateNode);

  const node = nodes.find((n) => n.id === modalNodeId);
  const params =
    (node?.data.genParams as GenParams | undefined) ?? useCanvasStore.getState().genParams;

  const [draft, setDraft] = useState<GenParams>(params);

  useEffect(() => {
    if (openModal === 'node-params' && node) {
      setDraft(
        (node.data.genParams as GenParams | undefined) ?? useCanvasStore.getState().genParams,
      );
    }
  }, [openModal, node]);

  const apply = () => {
    if (!node) return;
    updateNodeGenParams(node.id, draft);
    closeModal();
    void generateNode(node.id).catch(() => {});
  };

  return (
    <Modal
      open={openModal === 'node-params'}
      onClose={closeModal}
      title={t('nodeParams.title', '参数配置 · {name}', {
        name: node?.data.title ?? t('nodeParams.defaultNode', '节点'),
      })}
      width="w-[520px]"
    >
      <div className="flex h-auto max-h-[70vh] flex-col gap-4 overflow-y-auto p-5">
        {/* Generation mode */}
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
            {t('nodeParams.generationMode', '生成模式')}
          </h4>
          <div className="grid grid-cols-5 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, mode: m.value }))}
                className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  draft.mode === m.value
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/[0.06] bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {t(`nodeParams.mode.${m.value}`, m.label)}
              </button>
            ))}
          </div>
        </section>

        {/* Aspect ratio */}
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
            {t('nodeParams.aspectRatio', '画面比例')}
          </h4>
          <div className="flex gap-2">
            {RATIOS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, aspectRatio: r }))}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  draft.aspectRatio === r
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/[0.06] bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        {/* Resolution & Duration */}
        <div className="grid grid-cols-2 gap-4">
          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
              {t('nodeParams.resolution', '分辨率')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, resolution: r }))}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    draft.resolution === r
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/[0.06] bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
              {t('nodeParams.duration', '时长')}
            </h4>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, duration: d }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    draft.duration === d
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/[0.06] bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {t('nodeParams.seconds', '{count}s', { count: d ?? '' })}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Quality & Count */}
        <div className="grid grid-cols-2 gap-4">
          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
              {t('nodeParams.quality', '画质')}
            </h4>
            <select
              value={draft.quality}
              onChange={(e) =>
                setDraft((d) => ({ ...d, quality: e.target.value as GenParams['quality'] }))
              }
              className="h-8 w-full rounded-lg border border-white/[0.06] bg-white/5 px-2 text-xs text-white/80 outline-none"
            >
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q === 'standard' ? t('nodeParams.standardQuality', '标准画质') : q}
                </option>
              ))}
            </select>
          </section>
          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
              {t('nodeParams.imageCount', '生成张数')}
            </h4>
            <div className="flex gap-2">
              {COUNTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, count: c }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    draft.count === c
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/[0.06] bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {t('nodeParams.images', '{count} 张', { count: c })}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* View count (for views workspace / character nodes) */}
        {node?.data.kind === 'views' && (
          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
              {t('nodeParams.viewCount', '视图数')}
            </h4>
            <div className="flex gap-2">
              {VIEW_COUNTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, viewCount: v }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    draft.viewCount === v
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/[0.06] bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {t('nodeParams.views', '{count} 视图', { count: v })}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Strength / Refinement */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-medium uppercase tracking-wider text-white/40">
              {t('nodeParams.strength', '精细度 / 重绘幅度')}
            </h4>
            <span className="text-xs text-white/60">
              {Math.round((draft.strength ?? 0.5) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.strength ?? 0.5}
            onChange={(e) => setDraft((d) => ({ ...d, strength: Number(e.target.value) }))}
            className="w-full accent-emerald-400"
          />
          <div className="mt-1 flex justify-between text-[11px] text-white/30">
            <span>{t('nodeParams.conservative', '保守')}</span>
            <span>{t('nodeParams.creative', '创意')}</span>
          </div>
        </section>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg border border-white/[0.06] bg-white/5 px-4 py-2 text-xs text-white/70 transition-colors hover:bg-white/10"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={apply}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
          >
            <Check className="h-3.5 w-3.5" />
            {t('nodeParams.applyAndGenerate', '应用并生成')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
