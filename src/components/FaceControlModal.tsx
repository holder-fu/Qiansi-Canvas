import { Eye, Loader2, RotateCcw, Smile, Sparkles, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import emotionControlAtlas from '../assets/face-control/emotion-control-atlas.png';
import gazeControlAtlas from '../assets/face-control/gaze-control-atlas.png';
import mouthControlAtlas from '../assets/face-control/mouth-control-atlas.png';
import neutralControlFace from '../assets/face-control/neutral-control-face.png';
import {
  applyFaceControlSettingsPatch,
  buildFaceControlInstruction,
  getFaceExpressionLabel,
  getFaceGazeLabel,
  getFaceControlSectionConstraint,
  normalizeFaceControlPointerPosition,
  type FaceControlSection,
  type FaceControlSettings,
  type FaceMouthShape,
} from '../lib/imageEnhancement';
import { detectFaceRegions, type DetectedFaceRegion } from '../lib/faceDetection';
import { useAppTranslation } from '../i18n/appI18n';
import { useCanvasStore } from '../store/canvasStore';

const CONTROL_PAD_KEYBOARD_STEP = 0.12;
const CONTROL_PAD_FAST_KEYBOARD_STEP = 0.35;

const DEFAULT_SETTINGS: FaceControlSettings = {
  emotionX: 0,
  emotionY: 0,
  gazeX: 0,
  gazeY: 0,
  mouth: 'neutral',
};

const EXPRESSION_PRESETS = [
  { label: '开心', labelKey: 'face.expression.happy', emotionX: 0.72, emotionY: 0.12 },
  { label: '兴奋', labelKey: 'face.expression.excited', emotionX: 0.68, emotionY: 0.72 },
  { label: '低落', labelKey: 'face.expression.low', emotionX: 0, emotionY: -0.72 },
  { label: '难过', labelKey: 'face.expression.sad', emotionX: -0.72, emotionY: -0.38 },
] as const;

const GAZE_PRESETS = [
  { label: '左上', labelKey: 'face.gaze.upperLeft', gazeX: -0.78, gazeY: 0.78 },
  { label: '上方', labelKey: 'face.gaze.up', gazeX: 0, gazeY: 0.78 },
  { label: '右上', labelKey: 'face.gaze.upperRight', gazeX: 0.78, gazeY: 0.78 },
  { label: '左侧', labelKey: 'face.gaze.left', gazeX: -0.78, gazeY: 0 },
  { label: '正视', labelKey: 'face.gaze.forward', gazeX: 0, gazeY: 0 },
  { label: '右侧', labelKey: 'face.gaze.right', gazeX: 0.78, gazeY: 0 },
  { label: '左下', labelKey: 'face.gaze.lowerLeft', gazeX: -0.78, gazeY: -0.78 },
  { label: '下方', labelKey: 'face.gaze.down', gazeX: 0, gazeY: -0.78 },
  { label: '右下', labelKey: 'face.gaze.lowerRight', gazeX: 0.78, gazeY: -0.78 },
] as const;

const MOUTH_PRESETS: {
  id: FaceMouthShape;
  label: string;
  labelKey: string;
  hint: string;
  hintKey: string;
  atlasIndex: number;
}[] = [
  {
    id: 'smirk',
    label: '单侧咧笑',
    labelKey: 'face.mouth.smirk',
    hint: '单侧上扬',
    hintKey: 'face.mouth.hint.smirk',
    atlasIndex: 0,
  },
  {
    id: 'laugh',
    label: '大笑',
    labelKey: 'face.mouth.laugh',
    hint: '自然露齿',
    hintKey: 'face.mouth.hint.laugh',
    atlasIndex: 1,
  },
  {
    id: 'pout',
    label: '嘟嘴',
    labelKey: 'face.mouth.pout',
    hint: '双唇收拢',
    hintKey: 'face.mouth.hint.pout',
    atlasIndex: 2,
  },
  {
    id: 'crooked',
    label: '歪嘴',
    labelKey: 'face.mouth.crooked',
    hint: '轻微不对称',
    hintKey: 'face.mouth.hint.crooked',
    atlasIndex: 3,
  },
  {
    id: 'smile',
    label: '微笑',
    labelKey: 'face.mouth.smile',
    hint: '嘴角上扬',
    hintKey: 'face.mouth.hint.smile',
    atlasIndex: 4,
  },
  {
    id: 'pressed',
    label: '瘪嘴',
    labelKey: 'face.mouth.pressed',
    hint: '双唇收紧',
    hintKey: 'face.mouth.hint.pressed',
    atlasIndex: 5,
  },
  {
    id: 'bite',
    label: '咬嘴唇',
    labelKey: 'face.mouth.bite',
    hint: '轻咬下唇',
    hintKey: 'face.mouth.hint.bite',
    atlasIndex: 6,
  },
  {
    id: 'open',
    label: '张嘴',
    labelKey: 'face.mouth.open',
    hint: '自然微张',
    hintKey: 'face.mouth.hint.open',
    atlasIndex: 7,
  },
  {
    id: 'downturned',
    label: '嘴角下垂',
    labelKey: 'face.mouth.downturned',
    hint: '嘴角向下',
    hintKey: 'face.mouth.hint.downturned',
    atlasIndex: 8,
  },
];

const MOUTH_LABELS: Record<FaceMouthShape, string> = {
  neutral: '默认',
  smirk: '单侧咧笑',
  laugh: '大笑',
  pout: '嘟嘴',
  crooked: '歪嘴',
  smile: '微笑',
  pressed: '瘪嘴',
  bite: '咬嘴唇',
  open: '张嘴',
  downturned: '嘴角下垂',
};

const MOUTH_LABEL_KEYS: Record<FaceMouthShape, string> = {
  neutral: 'face.mouth.neutral',
  smirk: 'face.mouth.smirk',
  laugh: 'face.mouth.laugh',
  pout: 'face.mouth.pout',
  crooked: 'face.mouth.crooked',
  smile: 'face.mouth.smile',
  pressed: 'face.mouth.pressed',
  bite: 'face.mouth.bite',
  open: 'face.mouth.open',
  downturned: 'face.mouth.downturned',
};

const EXPRESSION_LABEL_KEYS: Record<string, string> = {
  开心: 'face.expression.happy',
  兴奋: 'face.expression.excited',
  低落: 'face.expression.low',
  难过: 'face.expression.sad',
  惊喜: 'face.expression.surprised',
  忧郁: 'face.expression.melancholy',
  自然中性: 'face.expression.neutral',
};

const GAZE_LABEL_KEYS: Record<string, string> = {
  左上: 'face.gaze.upperLeft',
  上: 'face.gaze.up',
  上方: 'face.gaze.up',
  右上: 'face.gaze.upperRight',
  左: 'face.gaze.left',
  左侧: 'face.gaze.left',
  正视: 'face.gaze.forward',
  右: 'face.gaze.right',
  右侧: 'face.gaze.right',
  左下: 'face.gaze.lowerLeft',
  下: 'face.gaze.down',
  下方: 'face.gaze.down',
  右下: 'face.gaze.lowerRight',
};

const TABS: { id: FaceControlSection; label: string; labelKey: string; icon: LucideIcon }[] = [
  { id: 'emotion', label: '情绪控制', labelKey: 'face.tab.emotion', icon: Smile },
  { id: 'gaze', label: '视线方向', labelKey: 'face.tab.gaze', icon: Eye },
  { id: 'mouth', label: '嘴巴形态', labelKey: 'face.tab.mouth', icon: Sparkles },
];

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}

type FaceAtlas = 'emotion' | 'gaze' | 'mouth' | 'neutral';

const FACE_ATLAS_URLS: Record<FaceAtlas, string> = {
  emotion: emotionControlAtlas,
  gaze: gazeControlAtlas,
  mouth: mouthControlAtlas,
  neutral: neutralControlFace,
};

function expressionAtlasIndex(x: number, y: number) {
  const column = x < -0.32 ? 0 : x > 0.32 ? 2 : 1;
  const row = y > 0.32 ? 0 : y < -0.32 ? 2 : 1;
  return row * 3 + column;
}

function FaceSprite({
  atlas,
  index = 4,
  className = '',
}: {
  atlas: FaceAtlas;
  index?: number;
  className?: string;
}) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  if (atlas === 'neutral') {
    return (
      <img
        src={FACE_ATLAS_URLS.neutral}
        alt=""
        draggable={false}
        className={`pointer-events-none select-none object-contain ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none block bg-black bg-[length:300%_300%] bg-no-repeat ${className}`}
      style={{
        backgroundImage: `url(${FACE_ATLAS_URLS[atlas]})`,
        backgroundPosition: `${column * 50}% ${row * 50}%`,
      }}
    />
  );
}

function ControlPad({
  previewIndex,
  x,
  y,
  onChange,
  labels,
  ariaLabel,
}: {
  previewIndex: number;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  labels: { top: string; right: string; bottom: string; left: string };
  ariaLabel: string;
}) {
  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(
      normalizeFaceControlPointerPosition(event.clientX - rect.left, rect.width),
      -normalizeFaceControlPointerPosition(event.clientY - rect.top, rect.height),
    );
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? CONTROL_PAD_FAST_KEYBOARD_STEP : CONTROL_PAD_KEYBOARD_STEP;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') onChange(0, 0);
    if (event.key === 'ArrowLeft') onChange(clamp(x - step), y);
    if (event.key === 'ArrowRight') onChange(clamp(x + step), y);
    if (event.key === 'ArrowUp') onChange(x, clamp(y + step));
    if (event.key === 'ArrowDown') onChange(x, clamp(y - step));
  };

  return (
    <div
      role="application"
      tabIndex={0}
      aria-label={ariaLabel}
      className="relative min-h-0 flex-1 touch-none overflow-hidden rounded-2xl border border-white/[0.07] bg-black outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/65"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onKeyDown={handleKeyDown}
    >
      <FaceSprite
        atlas="emotion"
        index={previewIndex}
        className="absolute inset-0 h-full w-full opacity-72"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.18)_55%,rgba(0,0,0,0.78)_100%)]" />
      <div className="pointer-events-none absolute inset-[15%]">
        {Array.from({ length: 35 }, (_, index) => {
          const column = index % 7;
          const row = Math.floor(index / 7);
          return (
            <span
              key={index}
              className="absolute h-1 w-1 rounded-full bg-white/42"
              style={{ left: `${(column / 6) * 100}%`, top: `${(row / 4) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="pointer-events-none absolute left-[15%] right-[15%] top-1/2 h-px bg-white/22" />
      <div className="pointer-events-none absolute bottom-[15%] top-[15%] left-1/2 w-px bg-white/22" />
      <span className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-xs text-white/75">
        {labels.top}
      </span>
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/75">
        {labels.right}
      </span>
      <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/75">
        {labels.bottom}
      </span>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs text-white/75">
        {labels.left}
      </span>
      <span
        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/65 shadow-[0_0_0_5px_rgba(255,255,255,0.08),0_0_18px_rgba(125,211,252,0.8)]"
        style={{ left: `${((x + 1) / 2) * 100}%`, top: `${((1 - y) / 2) * 100}%` }}
      />
    </div>
  );
}

function FacePreview({ atlas, index, label }: { atlas: FaceAtlas; index?: number; label: string }) {
  const { t } = useAppTranslation();

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-black">
      <FaceSprite atlas={atlas} index={index} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14">
        <div className="text-sm font-medium text-white">
          {t('face.control.previewCurrent', '当前：{label}', { label })}
        </div>
        <div className="mt-1 text-xs text-white/48">
          {t('face.control.previewApplyHint', '所选参数将在生成时应用到人物面部')}
        </div>
      </div>
    </div>
  );
}

export function FaceControlModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const createFaceControlResult = useCanvasStore((state) => state.createFaceControlResult);
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.modalNodeId));
  const [tab, setTab] = useState<FaceControlSection>('emotion');
  const [settings, setSettings] = useState<FaceControlSettings>(DEFAULT_SETTINGS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [constraintNotice, setConstraintNotice] = useState<string | null>(null);
  const [stage, setStage] = useState<'detecting' | 'selecting' | 'controls'>('detecting');
  const [detectedFaces, setDetectedFaces] = useState<DetectedFaceRegion[]>([]);
  const [selectedFace, setSelectedFace] = useState<DetectedFaceRegion | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [detectionAttempt, setDetectionAttempt] = useState(0);

  const isOpen = openModal === 'face-control';
  const sourceImageUrl = node?.data.imageUrl || node?.data.images?.[0];
  const rawExpressionLabel = getFaceExpressionLabel(settings);
  const rawGazeLabel = getFaceGazeLabel(settings);
  const rawMouthLabel = MOUTH_LABELS[settings.mouth];
  const expressionLabelKey = EXPRESSION_LABEL_KEYS[rawExpressionLabel];
  const gazeLabelKey = GAZE_LABEL_KEYS[rawGazeLabel];
  const expressionLabel = expressionLabelKey
    ? t(expressionLabelKey, rawExpressionLabel)
    : rawExpressionLabel;
  const gazeLabel = gazeLabelKey ? t(gazeLabelKey, rawGazeLabel) : rawGazeLabel;
  const mouthLabel = t(MOUTH_LABEL_KEYS[settings.mouth], rawMouthLabel);
  const emotionPreviewIndex = expressionAtlasIndex(settings.emotionX, settings.emotionY);
  const gazePreviewIndex = GAZE_PRESETS.findIndex((preset) => preset.label === rawGazeLabel);
  const mouthPreviewIndex = MOUTH_PRESETS.find(
    (preset) => preset.id === settings.mouth,
  )?.atlasIndex;
  const instruction = useMemo(() => {
    const controlInstruction = buildFaceControlInstruction(settings);
    if (!selectedFace) return controlInstruction;
    const left = Math.round(selectedFace.x * 100);
    const top = Math.round(selectedFace.y * 100);
    const width = Math.round(selectedFace.width * 100);
    const height = Math.round(selectedFace.height * 100);
    return `${controlInstruction}\n目标人物：只调整已识别框选的人脸。该人脸位于原图左侧约 ${left}%、顶部约 ${top}%，范围宽约 ${width}%、高约 ${height}%。不得修改同画面中的其他人物。`;
  }, [selectedFace, settings]);

  useEffect(() => {
    if (!isOpen) return;
    setTab('emotion');
    setSettings(DEFAULT_SETTINGS);
    setSubmitting(false);
    setError(null);
    setConstraintNotice(null);
    setStage('detecting');
    setDetectedFaces([]);
    setSelectedFace(null);
    setDetectionError(null);
  }, [isOpen, modalNodeId]);

  useEffect(() => {
    if (!isOpen || !sourceImageUrl) return;
    let cancelled = false;
    setStage('detecting');
    setDetectedFaces([]);
    setSelectedFace(null);
    setDetectionError(null);

    void detectFaceRegions(sourceImageUrl)
      .then((faces) => {
        if (cancelled) return;
        setDetectedFaces(faces);
        setStage('selecting');
        if (faces.length === 0) {
          setDetectionError(t('face.error.noClearFace', '未识别到清晰人脸，请更换图片或重试。'));
        }
      })
      .catch((reason) => {
        if (cancelled) return;
        setStage('selecting');
        setDetectionError(
          reason instanceof Error
            ? reason.message
            : t('face.error.detectionFailed', '人脸识别失败，请重试。'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [detectionAttempt, isOpen, sourceImageUrl, t]);

  useEffect(() => {
    if (!constraintNotice) return;
    const timeout = window.setTimeout(() => setConstraintNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [constraintNotice]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) closeModal();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeModal, isOpen, submitting]);

  if (!isOpen || !node || !sourceImageUrl) return null;

  const updateSettings = (patch: Partial<FaceControlSettings>) =>
    setSettings((current) => applyFaceControlSettingsPatch(current, patch));

  const selectSection = (nextSection: FaceControlSection) => {
    const constraint = getFaceControlSectionConstraint(settings, nextSection);
    if (constraint) {
      setConstraintNotice(
        nextSection === 'mouth'
          ? t('face.constraint.mouthAfterEmotion', constraint)
          : t('face.constraint.emotionAfterMouth', constraint),
      );
      return;
    }
    setConstraintNotice(null);
    setTab(nextSection);
  };

  const applyFaceControl = async () => {
    if (submitting || node.data.generating === true || !selectedFace) return;
    setSubmitting(true);
    setError(null);
    try {
      const applied = await createFaceControlResult(node.id, instruction);
      if (applied) closeModal();
      else {
        const currentNode = useCanvasStore.getState().nodes.find((item) => item.id === node.id);
        const message =
          typeof currentNode?.data.enhancementError === 'string'
            ? currentNode.data.enhancementError
            : t('face.error.unavailable', '当前图片暂时无法进行面部控制，请检查图片模型连接。');
        setError(message);
        setConstraintNotice(message);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('face.error.applyFailed', '面部控制失败，请重试。'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (stage !== 'controls') {
    return (
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="face-selection-title"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}
      >
        <section className="flex h-[600px] max-h-[calc(100vh-24px)] w-[670px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151517] shadow-[0_28px_100px_rgba(0,0,0,0.72)]">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
            <div className="min-w-0">
              <h2 id="face-selection-title" className="text-lg font-semibold text-white">
                {t('face.selection.title', '选择要调整的人脸')}
              </h2>
              <p className="mt-0.5 truncate text-xs text-white/42">
                {t('face.selection.description', '识别完成后，点击人脸框进入面部控制台')}
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/48 hover:bg-white/10 hover:text-white"
              aria-label={t('face.selection.close', '关闭人脸选择')}
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/35 p-4">
            <div className="relative max-h-full max-w-full">
              <img
                src={sourceImageUrl}
                alt={t('face.selection.sourceAlt', '待识别人物的原始图片')}
                draggable={false}
                className="block max-h-[490px] max-w-[638px] rounded-xl object-contain shadow-[0_14px_44px_rgba(0,0,0,0.45)]"
              />
              {stage === 'selecting' &&
                detectedFaces.map((face, index) => (
                  <button
                    key={face.id}
                    type="button"
                    onClick={() => {
                      setSelectedFace(face);
                      setStage('controls');
                    }}
                    aria-label={t('face.selection.selectAria', '选择识别到的人脸 {number}', {
                      number: index + 1,
                    })}
                    className="absolute rounded-lg border-2 border-emerald-300 bg-emerald-300/[0.06] shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_0_24px_rgba(52,211,153,0.28)] transition hover:bg-emerald-300/[0.14] hover:shadow-[0_0_0_2px_rgba(255,255,255,0.72),0_0_30px_rgba(52,211,153,0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    style={{
                      left: `${face.x * 100}%`,
                      top: `${face.y * 100}%`,
                      width: `${face.width * 100}%`,
                      height: `${face.height * 100}%`,
                    }}
                  >
                    <span className="absolute -top-7 left-0 rounded-md bg-emerald-300 px-2 py-1 text-[11px] font-semibold text-black shadow-lg">
                      {t('face.selection.faceLabel', '人脸 {number}', { number: index + 1 })}
                    </span>
                  </button>
                ))}
            </div>

            {stage === 'detecting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/58 text-sm text-white/72 backdrop-blur-[2px]">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-300" />
                {t('face.selection.detecting', '正在本地识别人脸位置…')}
              </div>
            )}
          </div>

          <footer className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-2">
            <div className={`text-xs ${detectionError ? 'text-amber-200' : 'text-white/48'}`}>
              {detectionError ??
                (detectedFaces.length > 0
                  ? t('face.selection.detected', '已识别 {count} 张人脸，请点击要调整的人物。', {
                      count: detectedFaces.length,
                    })
                  : t('face.selection.localOnly', '图片仅在本机进行人脸定位。'))}
            </div>
            {stage === 'selecting' && detectionError && (
              <button
                type="button"
                onClick={() => setDetectionAttempt((attempt) => attempt + 1)}
                className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-white/70 hover:bg-white/[0.08] hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                {t('face.selection.retry', '重新识别')}
              </button>
            )}
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="face-control-title"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !submitting) closeModal();
      }}
    >
      <section className="relative flex h-[600px] max-h-[calc(100vh-24px)] w-[670px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151517] shadow-[0_28px_100px_rgba(0,0,0,0.72)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 id="face-control-title" className="text-xl font-semibold text-white">
              {t('face.control.title', '面部控制')}
            </h2>
            <p className="truncate text-xs text-white/42">
              {t('face.control.description', '改变选中人物的表情，其余内容保持不变')}
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/48 hover:bg-white/10 hover:text-white"
            aria-label={t('face.control.close', '关闭面部控制')}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <nav className="grid h-12 shrink-0 grid-cols-3 gap-1.5 border-b border-white/[0.06] p-1.5">
          {TABS.map((item) => {
            const Icon = item.icon;
            const blocked = getFaceControlSectionConstraint(settings, item.id) !== null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectSection(item.id)}
                aria-disabled={blocked}
                className={`flex items-center justify-center gap-2 rounded-lg text-sm transition-colors ${
                  tab === item.id
                    ? 'bg-white/[0.09] text-white'
                    : blocked
                      ? 'cursor-not-allowed text-white/24 hover:bg-white/[0.025]'
                      : 'text-white/46 hover:bg-white/[0.05] hover:text-white/75'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(item.labelKey, item.label)}
              </button>
            );
          })}
        </nav>

        {constraintNotice && (
          <div
            role="status"
            className="absolute top-[110px] left-1/2 z-20 max-w-[calc(100%-24px)] -translate-x-1/2 rounded-lg border border-white/10 bg-[#29292d] px-3 py-2 text-xs leading-5 text-white/78 shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
          >
            {constraintNotice}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_216px]">
          <main className="flex min-h-0 flex-col gap-2.5 border-r border-white/[0.07] p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-white/88">
                {tab === 'emotion'
                  ? t('face.tab.emotion', '情绪控制')
                  : tab === 'gaze'
                    ? t('face.tab.gaze', '视线方向')
                    : t('face.tab.mouth', '嘴巴形态')}
                <span className="ml-2 font-normal text-white/42">
                  {t('face.control.current', '当前：')}
                  {tab === 'emotion' ? expressionLabel : tab === 'gaze' ? gazeLabel : mouthLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-white/48 hover:bg-white/[0.07] hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('face.control.reset', '重置')}
              </button>
            </div>

            {tab === 'emotion' && (
              <ControlPad
                previewIndex={emotionPreviewIndex}
                x={settings.emotionX}
                y={settings.emotionY}
                onChange={(emotionX, emotionY) => updateSettings({ emotionX, emotionY })}
                labels={{
                  top: t('face.expression.excited', '兴奋'),
                  right: t('face.expression.happy', '开心'),
                  bottom: t('face.expression.low', '低落'),
                  left: t('face.expression.sad', '难过'),
                }}
                ariaLabel={t('face.control.padAria', '表情二维控制盘，方向键调节，Home 键复位')}
              />
            )}
            {tab === 'gaze' && (
              <FacePreview
                atlas="gaze"
                index={Math.max(0, gazePreviewIndex)}
                label={t('face.control.summaryGaze', '视线 · {label}', { label: gazeLabel })}
              />
            )}
            {tab === 'mouth' && (
              <FacePreview
                atlas={settings.mouth === 'neutral' ? 'neutral' : 'mouth'}
                index={mouthPreviewIndex}
                label={t('face.control.summaryMouth', '嘴巴 · {label}', { label: mouthLabel })}
              />
            )}
            {tab === 'emotion' && (
              <p className="shrink-0 text-xs text-white/36">
                {t(
                  'face.control.padHint',
                  '拖动控制点调整参数；方向键微调，Shift + 方向键快速调整。',
                )}
              </p>
            )}
          </main>

          <aside className="flex min-h-0 flex-col gap-2.5 bg-[#1b1b1e] p-3">
            {tab === 'emotion' && (
              <>
                <h3 className="text-sm font-semibold text-white/88">
                  {t('face.control.parameterPreview', '参数预览')}
                </h3>
                <div className="relative aspect-square overflow-hidden rounded-xl border border-white/[0.06] bg-black">
                  <FaceSprite
                    atlas="emotion"
                    index={emotionPreviewIndex}
                    className="h-full w-full"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-10">
                    <div className="text-sm font-medium text-white">{expressionLabel}</div>
                    <div className="mt-1 text-[11px] text-white/55">
                      {t('face.control.subtleOnly', '生成时仅修改面部细微状态')}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.035] p-2.5">
                  <div className="mb-1.5 text-sm font-semibold text-white/85">
                    {t('face.control.quickPosition', '快速定位')}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {EXPRESSION_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          updateSettings({ emotionX: preset.emotionX, emotionY: preset.emotionY })
                        }
                        className="rounded-lg px-2 py-1.5 text-xs text-white/58 hover:bg-white/[0.08] hover:text-white"
                      >
                        {t(preset.labelKey, preset.label)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-[11px] leading-4.5 text-white/45">
                  {instruction}
                </div>
              </>
            )}

            {tab === 'gaze' && (
              <>
                <h3 className="text-sm font-semibold text-white/88">
                  {t('face.control.gazePosition', '视线定位')}
                </h3>
                <div className="grid grid-cols-3 content-start gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 p-1.5">
                  {GAZE_PRESETS.map((preset) => {
                    const selected = gazeLabel === preset.label;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => updateSettings({ gazeX: preset.gazeX, gazeY: preset.gazeY })}
                        aria-pressed={selected}
                        className={`group relative aspect-square overflow-hidden rounded-xl border text-left transition-colors ${
                          selected
                            ? 'border-white/35 bg-white/[0.12] text-white'
                            : 'border-white/[0.05] bg-black/30 text-white/45 hover:border-white/18 hover:text-white/80'
                        }`}
                      >
                        <FaceSprite
                          atlas="gaze"
                          index={GAZE_PRESETS.indexOf(preset)}
                          className={`absolute inset-0 h-full w-full transition-opacity ${selected ? 'opacity-80' : 'opacity-28 group-hover:opacity-48'}`}
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6 text-[11px] font-medium">
                          {t(preset.labelKey, preset.label)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {tab === 'mouth' && (
              <>
                <h3 className="text-sm font-semibold text-white/88">
                  {t('face.control.mouthSelection', '嘴型选择')}
                </h3>
                <div className="grid grid-cols-3 content-start gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 p-1.5">
                  {MOUTH_PRESETS.map((preset) => {
                    const selected = settings.mouth === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => updateSettings({ mouth: preset.id })}
                        aria-pressed={selected}
                        title={t(preset.hintKey, preset.hint)}
                        className={`group relative aspect-square overflow-hidden rounded-xl border text-left transition-colors ${
                          selected
                            ? 'border-white/35 bg-white/[0.12] text-white'
                            : 'border-white/[0.05] bg-black/30 text-white/45 hover:border-white/18 hover:text-white/80'
                        }`}
                      >
                        <FaceSprite
                          atlas="mouth"
                          index={preset.atlasIndex}
                          className={`absolute inset-0 h-full w-full transition-opacity ${selected ? 'opacity-80' : 'opacity-28 group-hover:opacity-48'}`}
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6 text-[11px] font-medium">
                          {t(preset.labelKey, preset.label)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <span className="sr-only">{instruction}</span>
          </aside>
        </div>

        <div className="flex min-h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-t border-white/[0.07] px-3 text-xs whitespace-nowrap">
          <span className="mr-1 font-medium text-white/72">
            {t('face.control.summary', '本次人物调节操作')}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-white/55">
            {t('face.control.summaryEmotion', '情绪 · {label}', { label: expressionLabel })}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-white/55">
            {t('face.control.summaryGaze', '视线 · {label}', { label: gazeLabel })}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-white/55">
            {t('face.control.summaryMouth', '嘴巴 · {label}', { label: mouthLabel })}
          </span>
        </div>

        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-2">
          <div className="min-w-0 text-xs text-white/42">
            {error ? (
              <span className="text-red-300">{error}</span>
            ) : (
              t(
                'face.control.modelHint',
                '控制面板使用独立示意人脸；提交时才把原图作为参考图发送给图片模型生成。',
              )
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={submitting}
              className="h-10 rounded-xl border border-white/[0.08] px-4 text-sm text-white/65 hover:bg-white/[0.07] hover:text-white disabled:opacity-35"
            >
              {t('face.control.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={() => void applyFaceControl()}
              disabled={submitting || node.data.generating === true || !selectedFace}
              className="flex h-10 min-w-32 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black hover:bg-white/88 disabled:cursor-wait disabled:opacity-45"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {submitting
                ? t('face.control.generating', '正在生成')
                : t('face.control.apply', '应用表情')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
