import { Lock, LockOpen, Loader2, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  buildPoseControlInstruction,
  createDefaultPoseSettings,
  DEFAULT_POSE_PROTECTION,
  POSE_BONES,
  POSE_JOINT_LABELS,
  renderPoseControlPng,
  updatePoseJoint,
  type PoseControlSettings,
  type PoseJointId,
  type PoseProtectionOptions,
} from '../lib/poseControl';
import { useAppTranslation } from '../i18n/appI18n';
import { useCanvasStore, type GenParams } from '../store/canvasStore';

const JOINT_IDS = Object.keys(POSE_JOINT_LABELS) as PoseJointId[];

const POSE_JOINT_LABEL_KEYS: Record<PoseJointId, string> = {
  head: 'pose.joint.head',
  neck: 'pose.joint.neck',
  chest: 'pose.joint.chest',
  leftShoulder: 'pose.joint.leftShoulder',
  leftElbow: 'pose.joint.leftElbow',
  leftWrist: 'pose.joint.leftWrist',
  rightShoulder: 'pose.joint.rightShoulder',
  rightElbow: 'pose.joint.rightElbow',
  rightWrist: 'pose.joint.rightWrist',
  pelvis: 'pose.joint.pelvis',
  leftHip: 'pose.joint.leftHip',
  leftKnee: 'pose.joint.leftKnee',
  leftAnkle: 'pose.joint.leftAnkle',
  rightHip: 'pose.joint.rightHip',
  rightKnee: 'pose.joint.rightKnee',
  rightAnkle: 'pose.joint.rightAnkle',
};

export function PoseControlModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const createPoseControlResult = useCanvasStore((state) => state.createPoseControlResult);
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.modalNodeId));
  const [settings, setSettings] = useState<PoseControlSettings>(createDefaultPoseSettings);
  const [protection, setProtection] = useState<PoseProtectionOptions>({
    ...DEFAULT_POSE_PROTECTION,
  });
  const [protectionOpen, setProtectionOpen] = useState(false);
  const [quality, setQuality] = useState<GenParams['quality']>('2K');
  const [count, setCount] = useState<GenParams['count']>(1);
  const [activeJoint, setActiveJoint] = useState<PoseJointId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const isOpen = openModal === 'pose-control';
  const sourceImageUrl = node?.data.imageUrl || node?.data.images?.[0];
  const nodeQuality =
    node?.data.genParams &&
    typeof node.data.genParams === 'object' &&
    ['standard', '2K', '4K'].includes(String(node.data.genParams.quality))
      ? (node.data.genParams.quality as GenParams['quality'])
      : '2K';
  const instruction = useMemo(
    () => buildPoseControlInstruction(settings, protection),
    [protection, settings],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSettings(createDefaultPoseSettings());
    setProtection({ ...DEFAULT_POSE_PROTECTION });
    setProtectionOpen(false);
    setQuality(nodeQuality);
    setCount(1);
    setSubmitting(false);
    setError(null);
    setActiveJoint(null);
  }, [isOpen, node?.id, nodeQuality]);

  useEffect(() => {
    if (!activeJoint) return;
    const release = () => setActiveJoint(null);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [activeJoint]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) closeModal();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeModal, isOpen, submitting]);

  if (!isOpen || !node || !sourceImageUrl) return null;

  const moveJoint = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeJoint || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setSettings((current) =>
      updatePoseJoint(current, activeJoint, {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      }),
    );
  };

  const applyPose = async () => {
    if (submitting || node.data.generating === true) return;
    setSubmitting(true);
    setError(null);
    try {
      const poseGuideUrl = await renderPoseControlPng(settings);
      const generation = createPoseControlResult(node.id, instruction, poseGuideUrl, {
        quality,
        count,
      });
      closeModal();
      void generation.catch(() => null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('pose.error.applyFailed', '姿态调整失败，请重试。'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/72 p-3 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pose-control-title"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !submitting) closeModal();
      }}
    >
      <section className="flex h-[660px] max-h-[calc(100vh-24px)] w-[900px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151517] shadow-[0_28px_100px_rgba(0,0,0,0.72)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 id="pose-control-title" className="text-xl font-semibold text-white">
              {t('pose.title', '姿态调整')}
            </h2>
            <p className="truncate text-xs text-white/42">
              {t('pose.description', '改变选中人物的姿态，其余内容保持不变')}
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={submitting}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/48 hover:bg-white/10 hover:text-white disabled:opacity-35"
            aria-label={t('pose.close', '关闭姿态调整')}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-white/88">
                  {t('pose.controls', '姿态控制')}
                </span>
                <button
                  type="button"
                  aria-label={t('pose.proportionLockAria', '比例锁定{status}', {
                    status: settings.proportionLocked
                      ? t('pose.status.enabled', '已开启')
                      : t('pose.status.disabled', '已关闭'),
                  })}
                  aria-pressed={settings.proportionLocked}
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      proportionLocked: !current.proportionLocked,
                    }))
                  }
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${
                    settings.proportionLocked
                      ? 'border-emerald-300/22 bg-emerald-300/10 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-white/50'
                  }`}
                >
                  {settings.proportionLocked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5" />
                  )}
                  {t('pose.proportionLock', '比例锁定')}
                </button>
                <span className="hidden text-xs text-white/38 sm:inline">
                  {t('pose.proportionLockHint', '开启后骨骼长度固定，拖动手脚时肘膝会自然联动')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettings(createDefaultPoseSettings())}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-white/58 hover:bg-white/[0.07] hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('pose.reset', '重置')}
              </button>
            </div>

            <div
              role="application"
              aria-label={t('pose.stageAria', '可拖动人体骨架姿态控制区')}
              className="relative min-h-0 flex-1 touch-none overflow-hidden rounded-2xl border border-white/[0.06] bg-black"
            >
              <div
                ref={stageRef}
                onPointerMove={moveJoint}
                className="absolute inset-y-0 left-1/2 h-full max-w-full -translate-x-1/2 aspect-square"
              >
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                >
                  <polygon
                    points={`${settings.joints.leftShoulder.x * 100},${settings.joints.leftShoulder.y * 100} ${settings.joints.rightShoulder.x * 100},${settings.joints.rightShoulder.y * 100} ${settings.joints.rightHip.x * 100},${settings.joints.rightHip.y * 100} ${settings.joints.leftHip.x * 100},${settings.joints.leftHip.y * 100}`}
                    fill="rgba(120,120,126,0.45)"
                  />
                  {POSE_BONES.map(([from, to]) => (
                    <g key={`${from}-${to}`}>
                      <line
                        x1={settings.joints[from].x * 100}
                        y1={settings.joints[from].y * 100}
                        x2={settings.joints[to].x * 100}
                        y2={settings.joints[to].y * 100}
                        stroke="rgba(138,138,144,0.7)"
                        strokeWidth="11"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1={settings.joints[from].x * 100}
                        y1={settings.joints[from].y * 100}
                        x2={settings.joints[to].x * 100}
                        y2={settings.joints[to].y * 100}
                        stroke="rgba(255,255,255,0.38)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  ))}
                  {(['leftAnkle', 'rightAnkle'] as const).map((id) => (
                    <line
                      key={`${id}-foot`}
                      x1={settings.joints[id].x * 100 - 2.1}
                      y1={settings.joints[id].y * 100 + 1.2}
                      x2={settings.joints[id].x * 100 + 2.7}
                      y2={settings.joints[id].y * 100 + 1.2}
                      stroke="rgba(138,138,144,0.72)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
                {JOINT_IDS.map((id) => {
                  const point = settings.joints[id];
                  const selected = activeJoint === id;
                  const jointLabel = t(POSE_JOINT_LABEL_KEYS[id], POSE_JOINT_LABELS[id]);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={t('pose.jointDragAria', '拖动{joint}关节点', {
                        joint: jointLabel,
                      })}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setActiveJoint(id);
                      }}
                      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.08)] transition-[width,height,box-shadow] active:cursor-grabbing ${
                        id === 'head' ? 'h-9 w-9 bg-white/35' : 'h-4 w-4'
                      } ${selected ? 'border-emerald-300 shadow-[0_0_0_8px_rgba(52,211,153,0.23)]' : 'border-white/70'}`}
                      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                      title={jointLabel}
                    />
                  );
                })}
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-2 text-xs text-white/48">
                {t('pose.dragHint', '拖动手脚调整动作 · 拖动肘膝旋转肢体 · 拖动身体中心移动整个人')}
              </div>
            </div>
          </main>
        </div>

        <footer className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-2">
          <div className="min-w-0 text-xs text-white/42">
            {error ? (
              <span className="text-red-300">{error}</span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="relative hidden sm:inline-flex">
                  <button
                    type="button"
                    onClick={() => setProtectionOpen((open) => !open)}
                    className="flex items-center gap-1.5 rounded-md border border-emerald-300/12 bg-emerald-300/[0.05] px-2 py-1 text-emerald-100/65 hover:bg-emerald-300/10 hover:text-emerald-50"
                    aria-expanded={protectionOpen}
                    aria-haspopup="dialog"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {protection.style && protection.background
                      ? t('pose.protection.all', '已启用全部保护项')
                      : t('pose.protection.count', '已启用 {count} 项保护', {
                          count: Number(protection.style) + Number(protection.background),
                        })}
                  </button>
                  {protectionOpen ? (
                    <div
                      role="dialog"
                      aria-label={t('pose.protection.dialog', '保护项选择')}
                      className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-xl border border-white/10 bg-[#202023] p-3 text-white shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/88">
                          {t('pose.protection.dialog', '保护项选择')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setProtectionOpen(false)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-white/38 hover:bg-white/10 hover:text-white"
                          aria-label={t('pose.protection.close', '关闭保护项选择')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mb-3 text-[11px] leading-4 text-white/38">
                        {t('pose.protection.hint', '开启后对应参考图背景或风格不进行改动')}
                      </p>
                      {(
                        [
                          ['style', 'pose.protection.style', '风格保护'],
                          ['background', 'pose.protection.background', '背景保护'],
                        ] as const
                      ).map(([key, labelKey, label]) => (
                        <label
                          key={key}
                          className="flex h-9 cursor-pointer items-center justify-between border-t border-white/[0.06] text-sm text-white/78 first:border-t-0"
                        >
                          <span>{t(labelKey, label)}</span>
                          <input
                            type="checkbox"
                            checked={protection[key]}
                            onChange={(event) =>
                              setProtection((current) => ({
                                ...current,
                                [key]: event.target.checked,
                              }))
                            }
                            className="peer sr-only"
                          />
                          <span className="relative h-5 w-9 rounded-full bg-white/18 transition-colors peer-checked:bg-emerald-400/80 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </span>
                {t('pose.resultHint', '结果会生成到新节点，原图不会被覆盖。')}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={quality}
              onChange={(event) => setQuality(event.target.value as GenParams['quality'])}
              className="h-10 rounded-xl border border-white/10 bg-[#252528] px-3 text-sm text-white/75 outline-none"
              aria-label={t('pose.qualityAria', '姿态生成清晰度')}
            >
              <option value="standard">{t('pose.quality.standard', '标准')}</option>
              <option value="2K">2K</option>
              <option value="4K">4K</option>
            </select>
            <select
              value={count}
              onChange={(event) => setCount(Number(event.target.value) as GenParams['count'])}
              className="h-10 rounded-xl border border-white/10 bg-[#252528] px-3 text-sm text-white/75 outline-none"
              aria-label={t('pose.countAria', '姿态生成张数')}
            >
              <option value={1}>{t('pose.count', '{count} 张', { count: 1 })}</option>
              <option value={2}>{t('pose.count', '{count} 张', { count: 2 })}</option>
              <option value={4}>{t('pose.count', '{count} 张', { count: 4 })}</option>
            </select>
            <button
              type="button"
              onClick={() => void applyPose()}
              disabled={submitting || node.data.generating === true}
              className="flex h-10 min-w-32 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black hover:bg-white/88 disabled:cursor-wait disabled:opacity-45"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {submitting ? t('pose.generating', '正在生成') : t('pose.apply', '应用姿态')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
