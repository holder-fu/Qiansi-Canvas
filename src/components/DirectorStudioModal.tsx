import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  Camera,
  Check,
  Clapperboard,
  Image as ImageIcon,
  LayoutTemplate,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import type {
  DirectorBodyFacing,
  DirectorCameraMovement,
  DirectorCameraPreset,
  DirectorCameraSpeed,
  DirectorHeadDirection,
  DirectorSceneObject,
  DirectorSceneObjectKind,
  DirectorSceneState,
  DirectorSubjectMotion,
  DirectorSubjectPlacement,
  FlowNode,
} from '../canvas/nodeTypes';
import { flushCanvasPersistence, useCanvasStore } from '../store/canvasStore';
import { DirectorGuideModal } from './DirectorGuideModal';
import { DirectorThreeStage } from './DirectorThreeStage';
import {
  buildDirectorReferenceManifest,
  buildDirectorConstraintPrompt,
  createDefaultDirectorSubject,
  createDefaultDirectorScene,
  DIRECTOR_BODY_FACING_ANGLES,
  DIRECTOR_BODY_FACING_LABELS,
  DIRECTOR_CAMERA_LABELS,
  DIRECTOR_CAMERA_MOVEMENT_LABELS,
  DIRECTOR_CAMERA_SPEED_LABELS,
  DIRECTOR_HEAD_DIRECTION_LABELS,
  DIRECTOR_SCENE_OBJECT_KIND_LABELS,
  DIRECTOR_SUBJECT_MOTION_LABELS,
  directorBodyFacingFromAngle,
  getDirectorIntentReadiness,
  normalizeDirectorScene,
} from '../lib/directorConstraints';
import {
  applyDirectorCompositionPreset,
  DIRECTOR_COMPOSITION_PRESETS,
  getDirectorCompositionPreset,
  type DirectorCompositionPreset,
} from '../lib/directorPresets';
import { getDirectorDragPosition, getDirectorStagePoint } from '../lib/directorStage';
import { getDirectorCameraConePoints, getDirectorCameraGuide } from '../lib/directorCameraGuide';

const SUBJECT_COLORS = ['#67e8f9', '#f9a8d4', '#fde68a', '#c4b5fd', '#86efac'];

interface ConnectedReference {
  nodeId: string;
  label: string;
  imageUrl: string;
}

type DirectorLeftPanel = 'assets' | 'presets' | 'camera';

interface DirectorDragState {
  pointerId: number;
  subjectId: string;
  offsetX: number;
  offsetY: number;
}

function firstImage(node: FlowNode): string | undefined {
  return node.data.imageUrl || node.data.images?.[0];
}

function getSpatialStagePosition(
  x: number,
  depth: number,
  cameraYaw: number,
  cameraPitch: number,
  cameraDistance: number,
) {
  const radians = (cameraYaw * Math.PI) / 180;
  const worldX = x - 50;
  const worldDepth = depth - 50;
  const rotatedX = worldX * Math.cos(radians) + worldDepth * Math.sin(radians);
  const rotatedDepth = -worldX * Math.sin(radians) + worldDepth * Math.cos(radians);
  const distanceScale = 0.82 + ((100 - cameraDistance) / 100) * 0.28;
  return {
    left: Math.max(4, Math.min(96, 50 + rotatedX * 0.76 * distanceScale)),
    top: Math.max(16, Math.min(88, 62 + rotatedDepth * 0.31 - (cameraPitch - 12) * 0.12)),
    scale: Math.max(0.72, Math.min(1.2, 1 + rotatedDepth * 0.003)),
    zIndex: Math.round(200 + rotatedDepth),
  };
}

function renderLayoutGuide(scene: DirectorSceneState): string {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext('2d');
  if (!context) return '';

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#121820');
  gradient.addColorStop(1, '#202832');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(125,211,252,0.22)';
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 60) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.setLineDash([10, 10]);
  context.strokeStyle = 'rgba(255,255,255,0.18)';
  context.strokeRect(canvas.width / 3, 0, canvas.width / 3, canvas.height);
  context.strokeRect(0, canvas.height / 3, canvas.width, canvas.height / 3);
  context.setLineDash([]);

  scene.sceneObjects.forEach((object, index) => {
    const spatial = getSpatialStagePosition(
      object.x,
      object.depth ?? object.y,
      scene.cameraYaw,
      scene.cameraPitch,
      scene.cameraDistance,
    );
    const x = ((scene.stageMode === 'spatial' ? spatial.left : object.x) / 100) * canvas.width;
    const y = ((scene.stageMode === 'spatial' ? spatial.top : object.y) / 100) * canvas.height;
    const scale = Math.max(0.55, Math.min(1.8, object.scale / 100));
    const width = 116 * scale;
    const height = 54 * scale;
    context.fillStyle = 'rgba(15,23,42,0.82)';
    context.strokeStyle = 'rgba(251,191,36,0.78)';
    context.lineWidth = 2;
    context.fillRect(x - width / 2, y - height / 2, width, height);
    context.strokeRect(x - width / 2, y - height / 2, width, height);
    context.fillStyle = '#fde68a';
    context.font = `${Math.max(12, 14 * scale)}px sans-serif`;
    context.textAlign = 'center';
    context.fillText(`${index + 1}. ${object.label}`, x, y + 5);
  });

  scene.subjects.forEach((subject, index) => {
    const spatial = getSpatialStagePosition(
      subject.x,
      subject.depth ?? subject.y,
      scene.cameraYaw,
      scene.cameraPitch,
      scene.cameraDistance,
    );
    const x = ((scene.stageMode === 'spatial' ? spatial.left : subject.x) / 100) * canvas.width;
    const y = ((scene.stageMode === 'spatial' ? spatial.top : subject.y) / 100) * canvas.height;
    const scale = Math.max(0.55, Math.min(1.65, subject.scale / 100));
    const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length] ?? '#67e8f9';
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.fillStyle = color;
    context.globalAlpha = 0.88;
    context.beginPath();
    context.arc(0, -50, 24, 0, Math.PI * 2);
    context.fill();
    context.fillRect(-28, -22, 56, 92);
    context.beginPath();
    context.moveTo(-28, 62);
    context.lineTo(-45, 118);
    context.lineTo(-12, 118);
    context.lineTo(0, 68);
    context.lineTo(12, 118);
    context.lineTo(45, 118);
    context.lineTo(28, 62);
    context.closePath();
    context.fill();
    context.restore();

    context.fillStyle = 'rgba(0,0,0,0.78)';
    context.fillRect(x - 92, Math.min(canvas.height - 34, y + 74 * scale), 184, 26);
    context.fillStyle = '#ffffff';
    context.font = '14px sans-serif';
    context.textAlign = 'center';
    context.fillText(
      `${index + 1}. ${subject.label} · ${DIRECTOR_BODY_FACING_LABELS[subject.bodyFacing]} ${Math.round(subject.bodyAngle)}°`,
      x,
      Math.min(canvas.height - 16, y + 92 * scale),
    );
  });

  const cameraGuide = getDirectorCameraGuide(scene.cameraPreset);
  const conePoints = getDirectorCameraConePoints(cameraGuide)
    .split(' ')
    .map((point) => point.split(',').map(Number));
  context.beginPath();
  conePoints.forEach(([x = 0, y = 0], index) => {
    const canvasX = (x / 100) * canvas.width;
    const canvasY = (y / 100) * canvas.height;
    if (index === 0) context.moveTo(canvasX, canvasY);
    else context.lineTo(canvasX, canvasY);
  });
  context.closePath();
  context.fillStyle = 'rgba(56,189,248,0.10)';
  context.strokeStyle = 'rgba(103,232,249,0.68)';
  context.lineWidth = 2;
  context.fill();
  context.stroke();
  const cameraX = (cameraGuide.cameraX / 100) * canvas.width;
  const cameraY = (cameraGuide.cameraY / 100) * canvas.height;
  context.beginPath();
  context.arc(cameraX, cameraY, 18, 0, Math.PI * 2);
  context.fillStyle = '#082f49';
  context.fill();
  context.strokeStyle = '#67e8f9';
  context.stroke();
  context.fillStyle = '#cffafe';
  context.font = '12px sans-serif';
  context.textAlign = 'center';
  context.fillText('镜头', cameraX, cameraY + 4);

  context.textAlign = 'left';
  context.fillStyle = 'rgba(0,0,0,0.72)';
  context.fillRect(18, 16, 300, 38);
  context.fillStyle = '#e5e7eb';
  context.font = '16px sans-serif';
  context.fillText(
    `${scene.stageMode === 'spatial' ? '3D 导演预演' : '导演台构图'} · ${scene.sceneName.trim() || '未指定场景'} · ${DIRECTOR_CAMERA_LABELS[scene.cameraPreset]} · ${scene.subjects.length}人`,
    32,
    41,
  );
  return canvas.toDataURL('image/png');
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm text-white/75">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-white/15 transition-colors peer-checked:bg-sky-500/70 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}

export function DirectorStudioModal() {
  const openModal = useCanvasStore((state) => state.openModal);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const takeSnapshot = useCanvasStore((state) => state.takeSnapshot);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const propagate = useCanvasStore((state) => state.propagate);
  const createVideoFromDirector = useCanvasStore((state) => state.createVideoFromDirector);
  const stageRef = useRef<HTMLDivElement>(null);
  const scenePromptRef = useRef<HTMLTextAreaElement>(null);
  const timelineSectionRef = useRef<HTMLDivElement>(null);
  const sceneSpaceSectionRef = useRef<HTMLDivElement>(null);
  const performanceSectionRef = useRef<HTMLDivElement>(null);
  const actionInputRef = useRef<HTMLTextAreaElement>(null);
  const dragStateRef = useRef<DirectorDragState | null>(null);
  const loadedModalNodeIdRef = useRef<string | null>(null);
  const skipNextDraftSaveRef = useRef(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<DirectorSceneState>(createDefaultDirectorScene);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [draggingSubjectId, setDraggingSubjectId] = useState<string | null>(null);
  const [leftPanel, setLeftPanel] = useState<DirectorLeftPanel>('assets');
  const [newSceneObjectLabel, setNewSceneObjectLabel] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');
  const [showGuide, setShowGuide] = useState(false);

  const isOpen = openModal === 'director-studio-2d';
  const node = nodes.find((item) => item.id === modalNodeId && item.data.kind === 'director');
  const connectedReferences = useMemo<ConnectedReference[]>(() => {
    if (!modalNodeId) return [];
    const sourceIds = edges
      .filter((edge) => edge.target === modalNodeId)
      .map((edge) => edge.source);
    return nodes.flatMap((sourceNode) => {
      if (!sourceIds.includes(sourceNode.id)) return [];
      const imageUrl = firstImage(sourceNode);
      if (!imageUrl) return [];
      return [
        {
          nodeId: sourceNode.id,
          label: sourceNode.data.imageFileName || sourceNode.data.title || '参考图片',
          imageUrl,
        },
      ];
    });
  }, [edges, modalNodeId, nodes]);
  const cameraGuide = getDirectorCameraGuide(draft.cameraPreset);
  const cameraConePoints = getDirectorCameraConePoints(cameraGuide);

  useEffect(() => {
    if (!isOpen || !node) {
      loadedModalNodeIdRef.current = null;
      return;
    }
    if (loadedModalNodeIdRef.current === node.id) return;
    loadedModalNodeIdRef.current = node.id;
    skipNextDraftSaveRef.current = true;
    const nextScene = normalizeDirectorScene(node.data.directorScene);
    nextScene.stageMode = 'flat';
    setDraft(nextScene);
    setActiveSubjectId(nextScene.subjects[0]?.id ?? null);
    setDraggingSubjectId(null);
    setLeftPanel('assets');
    setNewSceneObjectLabel('');
    setSaveStatus('saved');
    setShowGuide(false);
    dragStateRef.current = null;
  }, [isOpen, node]);

  useEffect(() => {
    if (!isOpen || !modalNodeId || loadedModalNodeIdRef.current !== modalNodeId) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    setSaveStatus('saving');
    updateNodeData(modalNodeId, { directorScene: normalizeDirectorScene(draft) });
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => {
      setSaveStatus('saved');
      saveStatusTimerRef.current = null;
    }, 500);
  }, [draft, isOpen, modalNodeId, updateNodeData]);

  useEffect(
    () => () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    },
    [],
  );

  const patchDraft = useCallback((patch: Partial<DirectorSceneState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const closeDirectorStudio = useCallback(() => {
    if (modalNodeId && loadedModalNodeIdRef.current === modalNodeId) {
      updateNodeData(modalNodeId, { directorScene: normalizeDirectorScene(draft) });
      void flushCanvasPersistence();
    }
    closeModal();
  }, [closeModal, draft, modalNodeId, updateNodeData]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showGuide) {
        setShowGuide(false);
        return;
      }
      closeDirectorStudio();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeDirectorStudio, isOpen, showGuide]);

  const addSubject = useCallback((reference: ConnectedReference) => {
    setDraft((current) => {
      if (current.subjects.some((subject) => subject.sourceNodeId === reference.nodeId)) {
        return current;
      }
      const index = current.subjects.length;
      const subject = createDefaultDirectorSubject({
        id: `director-subject-${Date.now()}-${index}`,
        sourceNodeId: reference.nodeId,
        label: reference.label,
        imageUrl: reference.imageUrl,
        x: Math.min(78, 32 + index * 18),
        y: 64 - (index % 2) * 12,
        scale: 100,
        rotation: 0,
      });
      setActiveSubjectId(subject.id);
      const nextScene = { ...current, subjects: [...current.subjects, subject] };
      const preset = getDirectorCompositionPreset(current.compositionPresetId);
      return preset ? applyDirectorCompositionPreset(nextScene, preset) : nextScene;
    });
  }, []);

  const setSceneReference = useCallback(
    (reference: ConnectedReference) => {
      patchDraft({ sceneSourceId: reference.nodeId, sceneUrl: reference.imageUrl });
    },
    [patchDraft],
  );

  const updateSubject = useCallback(
    (id: string, patch: Partial<DirectorSubjectPlacement>, invalidatePreset = false) => {
      setDraft((current) => ({
        ...current,
        compositionPresetId: invalidatePreset ? undefined : current.compositionPresetId,
        subjects: current.subjects.map((subject) =>
          subject.id === id ? { ...subject, ...patch } : subject,
        ),
      }));
    },
    [],
  );

  const removeSubject = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      subjects: current.subjects.filter((subject) => subject.id !== id),
    }));
    setActiveSubjectId((current) => (current === id ? null : current));
  }, []);

  const addSceneObject = useCallback(() => {
    const label = newSceneObjectLabel.trim();
    if (!label) return;
    setDraft((current) => {
      const index = current.sceneObjects.length;
      const sceneObject: DirectorSceneObject = {
        id: `director-object-${Date.now()}-${index}`,
        label,
        kind: 'prop',
        x: 28 + (index % 3) * 22,
        y: 35 + (index % 2) * 32,
        scale: 100,
        description: '',
      };
      return { ...current, sceneObjects: [...current.sceneObjects, sceneObject] };
    });
    setNewSceneObjectLabel('');
  }, [newSceneObjectLabel]);

  const updateSceneObject = useCallback((id: string, patch: Partial<DirectorSceneObject>) => {
    setDraft((current) => ({
      ...current,
      sceneObjects: current.sceneObjects.map((object) =>
        object.id === id ? { ...object, ...patch } : object,
      ),
    }));
  }, []);

  const removeSceneObject = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      sceneObjects: current.sceneObjects.filter((object) => object.id !== id),
    }));
  }, []);

  const beginSubjectDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, subject: DirectorSubjectPlacement) => {
      if (event.button !== 0) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pointer = getDirectorStagePoint(event.clientX, event.clientY, rect);
      dragStateRef.current = {
        pointerId: event.pointerId,
        subjectId: subject.id,
        offsetX: pointer.x - subject.x,
        offsetY: pointer.y - subject.y,
      };
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setActiveSubjectId(subject.id);
      setDraggingSubjectId(subject.id);
    },
    [],
  );

  const moveSubject = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();
      const position = getDirectorDragPosition(event.clientX, event.clientY, rect, {
        x: dragState.offsetX,
        y: dragState.offsetY,
      });
      updateSubject(
        dragState.subjectId,
        draft.stageMode === 'spatial' ? { ...position, depth: position.y } : position,
        true,
      );
    },
    [draft.stageMode, updateSubject],
  );

  const finishSubjectDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setDraggingSubjectId(null);
  }, []);

  const applyCompositionPreset = useCallback((preset: DirectorCompositionPreset) => {
    setDraft((current) => applyDirectorCompositionPreset(current, preset));
  }, []);

  const applyDirectorScene = (createFinalVideo = false) => {
    if (!node || !modalNodeId) return;
    const normalizedDraft = normalizeDirectorScene(draft);
    const directorConstraintPrompt = buildDirectorConstraintPrompt(normalizedDraft);
    const directorLayoutUrl = renderLayoutGuide(normalizedDraft);
    const manifest = buildDirectorReferenceManifest(normalizedDraft);
    const mediaOutput = [
      directorLayoutUrl,
      ...manifest.flatMap((item) =>
        item.kind !== 'layout' && item.imageUrl ? [item.imageUrl] : [],
      ),
    ].filter(
      (value, index, all): value is string => Boolean(value) && all.indexOf(value) === index,
    );
    takeSnapshot();
    updateNodeData(modalNodeId, {
      directorScene: normalizedDraft,
      directorConstraintPrompt,
      directorLayoutUrl,
      imageUrl: directorLayoutUrl || undefined,
      images: mediaOutput.slice(0, 5),
      output: mediaOutput.slice(0, 5),
      prompt: normalizedDraft.prompt,
      description: `${normalizedDraft.stageMode === 'spatial' ? '3D 预演 · ' : ''}${DIRECTOR_CAMERA_LABELS[normalizedDraft.cameraPreset]} · ${DIRECTOR_CAMERA_MOVEMENT_LABELS[normalizedDraft.cameraMovement]} · ${normalizedDraft.subjects.length}人`,
    });
    propagate(modalNodeId);
    if (createFinalVideo) createVideoFromDirector(modalNodeId);
    void flushCanvasPersistence();
    closeModal();
  };

  if (!isOpen || !node) return null;

  const activeSubject = draft.subjects.find((subject) => subject.id === activeSubjectId);
  const readiness = getDirectorIntentReadiness(draft);
  const navigateToReadinessCheck = (checkId: string) => {
    if (checkId === 'subjects') {
      setLeftPanel('assets');
      return;
    }
    if (checkId === 'story') {
      scenePromptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scenePromptRef.current?.focus({ preventScroll: true });
      return;
    }
    if (checkId === 'scene-space') {
      sceneSpaceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (checkId === 'camera') {
      setLeftPanel('camera');
      return;
    }
    if (checkId === 'timeline') {
      timelineSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (checkId === 'performance') {
      const subjectId = activeSubjectId ?? draft.subjects[0]?.id;
      if (!subjectId) {
        setLeftPanel('assets');
        return;
      }
      setActiveSubjectId(subjectId);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          performanceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          actionInputRef.current?.focus({ preventScroll: true });
        });
      });
    }
  };
  const workflowStep =
    connectedReferences.length === 0
      ? 1
      : draft.subjects.length === 0
        ? 2
        : readiness.checks.find((check) => check.id === 'performance')?.ready
          ? readiness.checks.find((check) => check.id === 'timeline')?.ready
            ? 5
            : 4
          : 3;

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col bg-[#0b0c0e] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="导演台"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#151619] px-5">
        <div className="flex items-center gap-2.5">
          <Clapperboard className="h-5 w-5 text-sky-300" />
          <span className="text-sm font-semibold">导演台</span>
          <span className="rounded bg-sky-400/10 px-2 py-0.5 text-[9px] text-sky-200/75">
            AI 视频导演
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`mr-1 text-[9px] ${
              saveStatus === 'saving' ? 'text-amber-200/70' : 'text-emerald-200/55'
            }`}
            aria-live="polite"
          >
            {saveStatus === 'saving' ? '正在自动保存…' : '已自动保存到本机'}
          </span>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <BookOpen className="h-4 w-4" />
            使用说明
          </button>
          <button
            type="button"
            onClick={closeDirectorStudio}
            className="rounded-lg px-4 py-2 text-sm text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => applyDirectorScene()}
            className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-400"
          >
            <Check className="h-4 w-4" />
            应用到画布
          </button>
          <button
            type="button"
            onClick={() => applyDirectorScene(true)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-300/35 bg-violet-400/15 px-4 py-2 text-sm font-medium text-violet-100 transition-colors hover:bg-violet-400/25"
            title="导出 3D 构图、机位、运镜和参考素材，并在画布右侧创建可直接选择模型生成的最终视频节点"
          >
            <Clapperboard className="h-4 w-4" />
            导出到最终视频
          </button>
          <button
            type="button"
            onClick={closeDirectorStudio}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭导演台"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#151619]">
          <div className="border-b border-white/10 p-3">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setLeftPanel('assets')}
                className={`flex items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] transition-colors ${
                  leftPanel === 'assets'
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                素材
              </button>
              <button
                type="button"
                onClick={() => setLeftPanel('presets')}
                className={`flex items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] transition-colors ${
                  leftPanel === 'presets'
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <LayoutTemplate className="h-3.5 w-3.5" />
                样板
              </button>
              <button
                type="button"
                onClick={() => setLeftPanel('camera')}
                className={`flex items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] transition-colors ${
                  leftPanel === 'camera'
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                机位
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {leftPanel === 'assets' && (
              <div className="space-y-2">
                <p className="mb-3 px-1 text-[10px] leading-relaxed text-white/35">
                  将图片节点连接到导演台左侧，再指定为场景或人物。
                </p>
                {connectedReferences.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs leading-relaxed text-white/35">
                    暂无连接图片
                    <br />
                    关闭导演台后拖动连接线即可添加
                  </div>
                ) : (
                  connectedReferences.map((reference) => {
                    const isScene = draft.sceneSourceId === reference.nodeId;
                    const isSubject = draft.subjects.some(
                      (subject) => subject.sourceNodeId === reference.nodeId,
                    );
                    return (
                      <div
                        key={reference.nodeId}
                        className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                      >
                        <div className="flex gap-3 p-2.5">
                          <img
                            src={reference.imageUrl}
                            alt=""
                            draggable={false}
                            className="h-14 w-14 shrink-0 select-none rounded-lg bg-black object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs text-white/80">{reference.label}</div>
                            <div className="mt-2 flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSceneReference(reference)}
                                className={`rounded-md px-2 py-1 text-[9px] transition-colors ${
                                  isScene
                                    ? 'bg-sky-400/20 text-sky-200'
                                    : 'bg-white/[0.06] text-white/45 hover:text-white/75'
                                }`}
                              >
                                {isScene ? '已设场景' : '设为场景'}
                              </button>
                              <button
                                type="button"
                                disabled={isSubject}
                                onClick={() => addSubject(reference)}
                                className="flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[9px] text-white/55 transition-colors hover:text-white disabled:cursor-default disabled:text-emerald-300/70"
                              >
                                {isSubject ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Plus className="h-3 w-3" />
                                )}
                                {isSubject ? '已添加' : '人物'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {leftPanel === 'presets' && (
              <div>
                <div className="mb-3 px-1">
                  <div className="text-xs font-medium text-white/70">构图样板</div>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/35">
                    套用后只调整现有人物的站位与机位，不会替换身份图片。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DIRECTOR_COMPOSITION_PRESETS.map((preset) => {
                    const isActive = draft.compositionPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={draft.subjects.length === 0}
                        onClick={() => applyCompositionPreset(preset)}
                        title={
                          draft.subjects.length === 0 ? '请先从素材中添加人物' : preset.description
                        }
                        className={`group overflow-hidden rounded-xl border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          isActive
                            ? 'border-sky-300/60 bg-sky-400/10'
                            : 'border-white/10 bg-white/[0.025] hover:border-white/25'
                        }`}
                      >
                        <span className="relative block h-20 overflow-hidden bg-[#101820]">
                          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-sky-400/10 to-transparent" />
                          {preset.slots.map((slot) => (
                            <span
                              key={`${preset.id}-${slot.x}-${slot.y}`}
                              className="absolute block rounded-t-full rounded-b-md border border-white/45 bg-sky-300/35"
                              style={{
                                left: `${slot.x}%`,
                                top: `${slot.y}%`,
                                width: `${Math.max(8, slot.scale * 0.1)}px`,
                                height: `${Math.max(18, slot.scale * 0.22)}px`,
                                transform: `translate(-50%, -75%) rotate(${slot.rotation}deg)`,
                              }}
                            />
                          ))}
                        </span>
                        <span className="block px-2.5 py-2">
                          <span className="flex items-center justify-between gap-1 text-[9px] text-white/75">
                            <span className="truncate">{preset.title}</span>
                            <span className="shrink-0 text-[9px] text-sky-200/55">
                              {preset.recommendedSubjects}
                            </span>
                          </span>
                          <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed text-white/30">
                            {preset.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {draft.subjects.length === 0 && (
                  <p className="mt-3 text-center text-[10px] text-amber-200/45">
                    请先在“素材”中添加人物
                  </p>
                )}
              </div>
            )}

            {leftPanel === 'camera' && (
              <div>
                <div className="mb-3 px-1">
                  <div className="text-xs font-medium text-white/70">机位预设</div>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/35">
                    单独调整镜头语言，不改变当前人物站位。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(DIRECTOR_CAMERA_LABELS) as DirectorCameraPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        patchDraft({ cameraPreset: preset, compositionPresetId: undefined })
                      }
                      className={`rounded-lg border px-2 py-3 text-[10px] transition-colors ${
                        draft.cameraPreset === preset
                          ? 'border-sky-300/55 bg-sky-400/15 text-sky-100'
                          : 'border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/75'
                      }`}
                    >
                      {DIRECTOR_CAMERA_LABELS[preset]}
                    </button>
                  ))}
                </div>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <div className="mb-2 text-xs font-medium text-white/70">运镜方式</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(DIRECTOR_CAMERA_MOVEMENT_LABELS) as DirectorCameraMovement[]).map(
                      (movement) => (
                        <button
                          key={movement}
                          type="button"
                          onClick={() => patchDraft({ cameraMovement: movement })}
                          className={`rounded-lg border px-2 py-2.5 text-[10px] transition-colors ${
                            draft.cameraMovement === movement
                              ? 'border-sky-300/55 bg-sky-400/15 text-sky-100'
                              : 'border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/75'
                          }`}
                        >
                          {DIRECTOR_CAMERA_MOVEMENT_LABELS[movement]}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[10px] text-white/50">
                    <span>运镜速度</span>
                    <span>{DIRECTOR_CAMERA_SPEED_LABELS[draft.cameraSpeed]}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(DIRECTOR_CAMERA_SPEED_LABELS) as DirectorCameraSpeed[]).map(
                      (speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() => patchDraft({ cameraSpeed: speed })}
                          className={`rounded-lg border py-2 text-[10px] ${
                            draft.cameraSpeed === speed
                              ? 'border-white/55 bg-white/15 text-white'
                              : 'border-white/10 text-white/40'
                          }`}
                        >
                          {DIRECTOR_CAMERA_SPEED_LABELS[speed]}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <label className="mt-4 block text-[10px] text-white/50">
                  <span className="mb-2 flex justify-between">
                    <span>视频时长</span>
                    <span className="tabular-nums text-white/70">{draft.duration} 秒</span>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={draft.duration}
                    onChange={(event) => patchDraft({ duration: Number(event.target.value) })}
                    className="w-full accent-sky-400"
                  />
                </label>
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-[#090a0c] p-6">
          <div className="flex w-full max-w-5xl items-center rounded-xl border border-white/10 bg-[#151619] p-1">
            {[
              { step: 1, label: '连接图片', panel: 'assets' as const },
              { step: 2, label: '场景与人物', panel: 'assets' as const },
              { step: 3, label: '设计表演', panel: 'presets' as const },
              { step: 4, label: '设置镜头', panel: 'camera' as const },
              { step: 5, label: '连接视频', panel: null },
            ].map((item) => (
              <button
                key={item.step}
                type="button"
                onClick={() => (item.panel ? setLeftPanel(item.panel) : setShowGuide(true))}
                className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-[10px] transition-colors ${
                  workflowStep === item.step
                    ? 'bg-sky-400/15 text-sky-100'
                    : workflowStep > item.step
                      ? 'text-emerald-200/65'
                      : 'text-white/30'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] ${
                    workflowStep > item.step
                      ? 'border-emerald-300/35 bg-emerald-400/10'
                      : 'border-white/15'
                  }`}
                >
                  {workflowStep > item.step ? <Check className="h-3 w-3" /> : item.step}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#191a1e] p-1 text-xs text-white/55">
            <span className="rounded-lg bg-white/10 px-4 py-2 text-white/85">导演视角</span>
            <span className="px-3 py-2">{DIRECTOR_CAMERA_LABELS[draft.cameraPreset]}</span>
            <span className="mx-1 h-5 w-px bg-white/10" />
            <button
              type="button"
              onClick={() => patchDraft({ stageMode: 'flat' })}
              className={`rounded-lg px-3 py-2 transition-colors ${
                draft.stageMode === 'flat'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/75'
              }`}
            >
              2D 构图
            </button>
            <button
              type="button"
              onClick={() => patchDraft({ stageMode: 'spatial' })}
              className={`rounded-lg px-3 py-2 transition-colors ${
                draft.stageMode === 'spatial'
                  ? 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/35'
                  : 'text-white/40 hover:text-white/75'
              }`}
              title="3D 预演会记录人物与物件的前后景深、摄影机角度和距离，并导出给最终视频节点"
            >
              3D 预演
            </button>
          </div>
          {draft.stageMode === 'spatial' && (
            <div className="flex w-full max-w-5xl items-center justify-center gap-4 rounded-lg border border-cyan-300/20 bg-cyan-950/20 px-4 py-2 text-[10px] text-cyan-50/75">
              <span className="font-medium text-cyan-100">3D 镜头控制</span>
              <label className="flex items-center gap-2">
                环绕 {Math.round(draft.cameraYaw)}°
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={draft.cameraYaw}
                  onChange={(event) => patchDraft({ cameraYaw: Number(event.target.value) })}
                  className="w-24 accent-cyan-300"
                />
              </label>
              <label className="flex items-center gap-2">
                俯仰 {Math.round(draft.cameraPitch)}°
                <input
                  type="range"
                  min={-35}
                  max={55}
                  value={draft.cameraPitch}
                  onChange={(event) => patchDraft({ cameraPitch: Number(event.target.value) })}
                  className="w-20 accent-cyan-300"
                />
              </label>
              <label className="flex items-center gap-2">
                距离 {Math.round(draft.cameraDistance)}%
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={draft.cameraDistance}
                  onChange={(event) => patchDraft({ cameraDistance: Number(event.target.value) })}
                  className="w-20 accent-cyan-300"
                />
              </label>
            </div>
          )}
          <div
            ref={stageRef}
            className={`relative aspect-video w-full max-w-5xl overflow-hidden rounded-xl border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.45)] ${
              draft.stageMode === 'spatial' ? 'bg-[#05070b]' : 'bg-[#12161c]'
            }`}
          >
            {draft.stageMode === 'spatial' && (
              <DirectorThreeStage
                scene={draft}
                activeSubjectId={activeSubjectId}
                onSubjectChange={(id, patch) => updateSubject(id, patch, true)}
                onObjectChange={updateSceneObject}
                onCameraChange={patchDraft}
                onSubjectSelect={setActiveSubjectId}
              />
            )}
            {draft.sceneUrl && (
              <img
                src={draft.sceneUrl}
                alt="场景背景"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/55" />
            <div
              className={`pointer-events-none absolute inset-x-[-8%] bottom-[-22%] h-[74%] origin-bottom ${
                draft.stageMode === 'spatial' ? 'opacity-100' : 'opacity-80'
              }`}
              style={{
                backgroundImage:
                  'linear-gradient(rgba(56,189,248,0.24) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,0.24) 1px,transparent 1px)',
                backgroundSize: '64px 48px',
                transform:
                  draft.stageMode === 'spatial'
                    ? `perspective(540px) rotateX(${58 - draft.cameraPitch * 0.22}deg) rotateZ(${draft.cameraYaw * 0.035}deg) scale(${0.92 + (100 - draft.cameraDistance) * 0.0015})`
                    : 'perspective(540px) rotateX(58deg)',
              }}
            />
            {draft.stageMode === 'spatial' && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] flex items-center justify-center gap-2 bg-gradient-to-b from-cyan-950/35 to-transparent py-3 text-[10px] text-cyan-100/75">
                <span className="rounded bg-cyan-300/10 px-2 py-1 font-medium text-cyan-100">
                  3D PREVIS
                </span>
                <span>拖动人物改变站位与景深 · 机位参数将导出至最终视频</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-dashed border-white/15" />
            <div className="pointer-events-none absolute inset-y-0 right-1/3 border-l border-dashed border-white/15" />
            <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-dashed border-white/15" />
            <div className="pointer-events-none absolute inset-x-0 bottom-1/3 border-t border-dashed border-white/15" />

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 z-[2] h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="director-camera-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(103,232,249,0.9)" />
                </marker>
              </defs>
              <polygon
                points={cameraConePoints}
                fill="rgba(56,189,248,0.07)"
                stroke="rgba(103,232,249,0.28)"
                strokeWidth="0.35"
                strokeDasharray="1.2 1.2"
              />
              <line
                x1={cameraGuide.cameraX}
                y1={cameraGuide.cameraY}
                x2={cameraGuide.targetX}
                y2={cameraGuide.targetY}
                stroke="rgba(103,232,249,0.82)"
                strokeWidth="0.55"
                markerEnd="url(#director-camera-arrow)"
              />
              <circle
                cx={cameraGuide.targetX}
                cy={cameraGuide.targetY}
                r="1.2"
                fill="rgba(103,232,249,0.92)"
              />
            </svg>
            <div className="pointer-events-none absolute left-3 top-3 z-[110] max-w-[21rem] rounded-lg border border-cyan-300/25 bg-[#07141d]/85 px-3 py-2 shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[10px] font-medium text-cyan-100">
                <Camera className="h-3.5 w-3.5 text-cyan-300" />
                镜头位置：{cameraGuide.label}
              </div>
              <div className="mt-1 text-[10px] text-white/45">{cameraGuide.description}</div>
            </div>
            <div
              className="pointer-events-none absolute z-[105] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${cameraGuide.cameraX}%`, top: `${cameraGuide.cameraY}%` }}
              role="img"
              aria-label={`镜头位置：${cameraGuide.description}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200/70 bg-[#082f49]/95 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.35)]">
                <Camera className="h-4 w-4" />
              </span>
              <span className="mt-1 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100">
                镜头
              </span>
            </div>

            {draft.sceneObjects.map((object, index) => {
              const spatial = getSpatialStagePosition(
                object.x,
                object.depth ?? object.y,
                draft.cameraYaw,
                draft.cameraPitch,
                draft.cameraDistance,
              );
              return (
                <div
                  key={object.id}
                  className="pointer-events-none absolute flex flex-col items-center"
                  style={{
                    left: `${draft.stageMode === 'spatial' ? spatial.left : object.x}%`,
                    top: `${draft.stageMode === 'spatial' ? spatial.top : object.y}%`,
                    transform: `translate(-50%, -50%) scale(${(object.scale / 100) * (draft.stageMode === 'spatial' ? spatial.scale : 1)})`,
                    zIndex:
                      draft.stageMode === 'spatial'
                        ? spatial.zIndex
                        : Math.max(2, Math.round(object.y) - 12),
                  }}
                  aria-label={`场景物件：${object.label}`}
                >
                  <div className="flex min-h-10 min-w-20 items-center justify-center gap-1.5 rounded-lg border border-amber-300/55 bg-[#17191d]/85 px-3 py-2 text-[10px] text-amber-100/85 shadow-lg backdrop-blur-sm">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="max-w-28 truncate">{object.label}</span>
                  </div>
                  <span className="mt-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white/45">
                    物件 {index + 1}
                  </span>
                </div>
              );
            })}

            {draft.subjects.map((subject, index) => {
              const spatial = getSpatialStagePosition(
                subject.x,
                subject.depth ?? subject.y,
                draft.cameraYaw,
                draft.cameraPitch,
                draft.cameraDistance,
              );
              return (
                <button
                  key={subject.id}
                  type="button"
                  onPointerDown={(event) => beginSubjectDrag(event, subject)}
                  onPointerMove={moveSubject}
                  onPointerUp={finishSubjectDrag}
                  onPointerCancel={finishSubjectDrag}
                  onLostPointerCapture={(event) => {
                    if (dragStateRef.current?.pointerId !== event.pointerId) return;
                    dragStateRef.current = null;
                    setDraggingSubjectId(null);
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  className={`absolute flex touch-none select-none flex-col items-center outline-none ${
                    draggingSubjectId === subject.id ? 'cursor-grabbing' : 'cursor-grab'
                  } ${activeSubjectId === subject.id ? 'z-[120]' : ''}`}
                  style={{
                    left: `${draft.stageMode === 'spatial' ? spatial.left : subject.x}%`,
                    top: `${draft.stageMode === 'spatial' ? spatial.top : subject.y}%`,
                    transform: `translate(-50%, -72%) scale(${(subject.scale / 100) * (draft.stageMode === 'spatial' ? spatial.scale : 1)})`,
                    zIndex:
                      activeSubjectId === subject.id
                        ? 300
                        : draft.stageMode === 'spatial'
                          ? spatial.zIndex
                          : Math.round(subject.y),
                  }}
                  aria-label={`拖动${subject.label}调整站位`}
                >
                  <div
                    className={`relative h-32 w-20 overflow-hidden rounded-t-full rounded-b-2xl border-2 bg-[#263342] shadow-[0_14px_30px_rgba(0,0,0,0.5)] ${
                      activeSubjectId === subject.id ? 'border-sky-300' : 'border-white/35'
                    }`}
                    style={{ transform: `rotate(${subject.rotation}deg)` }}
                  >
                    <img
                      src={subject.imageUrl}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-full w-full select-none object-cover"
                    />
                    <span
                      className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-black"
                      style={{ backgroundColor: SUBJECT_COLORS[index % SUBJECT_COLORS.length] }}
                    >
                      {index + 1}
                    </span>
                  </div>
                  <span className="mt-1 max-w-32 truncate rounded-md bg-black/80 px-2 py-1 text-[10px] text-white shadow-lg">
                    {subject.label}
                  </span>
                  <span className="mt-1 rounded bg-sky-400/15 px-2 py-0.5 text-[10px] text-sky-100/75">
                    {DIRECTOR_BODY_FACING_LABELS[subject.bodyFacing]} ·{' '}
                    {Math.round(subject.bodyAngle)}°
                  </span>
                </button>
              );
            })}

            {draft.subjects.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/30">
                <Users className="h-12 w-12" strokeWidth={1.15} />
                <span className="text-sm text-white/50">
                  {connectedReferences.length > 0
                    ? `已有 ${connectedReferences.length} 张素材，请在左侧点“人物”`
                    : '先把图片节点连接到导演台左侧输入口'}
                </span>
                <span className="max-w-md text-[10px] leading-relaxed text-white/25">
                  添加人物后可直接拖动调整站位，或打开左侧“样板”一键套用单人、对话、对峙、群像等构图。
                </span>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white/65 backdrop-blur-sm">
              {draft.lockSubjectCount
                ? `锁定 ${draft.subjects.length} 人`
                : `${draft.subjects.length} 人`}{' '}
              · 约束 {Math.round(draft.constraintStrength)}%
            </div>
          </div>
          <div className="w-full max-w-5xl rounded-xl border border-white/10 bg-[#191a1e] p-3 transition-colors focus-within:border-sky-300/45">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="director-story-prompt" className="text-xs font-medium text-white/75">
                场景与剧情
              </label>
              <span className="text-[10px] text-white/30">
                写清地点、发生的事件和人物之间的关系
              </span>
            </div>
            <textarea
              id="director-story-prompt"
              ref={scenePromptRef}
              value={draft.prompt}
              onChange={(event) => patchDraft({ prompt: event.target.value })}
              placeholder="例如：雨夜车站，女主发现远处的人后停下脚步；人物站位、朝向、动作、镜头和时间轴会自动追加"
              className="h-20 w-full resize-none bg-transparent text-sm leading-relaxed text-white/80 outline-none placeholder:text-white/25"
            />
          </div>
        </section>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-[#151619] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/90">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            AI 视频导演指令
          </div>
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/55">意图完整度</span>
              <span className={readiness.score >= 80 ? 'text-emerald-300' : 'text-amber-200'}>
                {readiness.level} · {readiness.score}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width]"
                style={{ width: `${readiness.score}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-white/30">点击下面的设置项，可直接跳到对应位置。</p>
            <div className="mt-3 space-y-1.5">
              {readiness.checks.map((check) => (
                <button
                  key={check.id}
                  type="button"
                  onClick={() => navigateToReadinessCheck(check.id)}
                  className="flex w-full items-center gap-2 text-left text-[11px]"
                  title={check.hint}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                      check.ready
                        ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-200'
                        : 'border-white/15 text-white/25'
                    }`}
                  >
                    {check.ready && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className={check.ready ? 'text-white/55' : 'text-white/30'}>
                    {check.label}
                  </span>
                  <span className="ml-auto text-white/25">{check.ready ? '查看' : '去填写'} →</span>
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-white/[0.07] rounded-xl border border-white/10 bg-white/[0.025] px-3">
            <Toggle
              checked={draft.lockSubjectCount}
              label={`锁定人物数量（${draft.subjects.length}）`}
              onChange={(lockSubjectCount) => patchDraft({ lockSubjectCount })}
            />
            <Toggle
              checked={draft.forbidExtraSubjects}
              label="禁止生成额外人物"
              onChange={(forbidExtraSubjects) => patchDraft({ forbidExtraSubjects })}
            />
            <Toggle
              checked={draft.preservePositions}
              label="保持人物站位"
              onChange={(preservePositions) => patchDraft({ preservePositions })}
            />
            <Toggle
              checked={draft.preserveIdentity}
              label="保持身份与服装"
              onChange={(preserveIdentity) => patchDraft({ preserveIdentity })}
            />
          </div>

          <label className="mt-5 block text-xs text-white/55">
            <span className="mb-2 flex items-center justify-between">
              <span>站位约束强度</span>
              <span className="tabular-nums text-white/75">
                {Math.round(draft.constraintStrength)}%
              </span>
            </span>
            <input
              type="range"
              min={20}
              max={100}
              value={draft.constraintStrength}
              onChange={(event) => patchDraft({ constraintStrength: Number(event.target.value) })}
              className="w-full accent-sky-400"
            />
          </label>

          <div ref={sceneSpaceSectionRef} className="mt-6 scroll-m-5 border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/90">
              <MapPin className="h-4 w-4 text-amber-300" />
              场景空间与物件
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-white/30">
              在这里固定黑板、书桌、门窗和道具的位置。人物可以把这些名称设为身体朝向或视线目标。
            </p>
            <label className="block text-xs text-white/50">
              场景名称
              <input
                value={draft.sceneName}
                onChange={(event) => patchDraft({ sceneName: event.target.value })}
                placeholder="例：高中教室、地铁站、医院走廊"
                className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 outline-none placeholder:text-white/20 focus:border-amber-300/40"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <input
                value={newSceneObjectLabel}
                onChange={(event) => setNewSceneObjectLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addSceneObject();
                  }
                }}
                placeholder="新增物件，例如：黑板"
                aria-label="新增场景物件"
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 outline-none placeholder:text-white/20 focus:border-amber-300/40"
              />
              <button
                type="button"
                disabled={!newSceneObjectLabel.trim()}
                onClick={addSceneObject}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 text-[11px] text-amber-100/75 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['黑板', '书桌', '讲台', '教室门'].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setNewSceneObjectLabel(label)}
                  className="rounded-md bg-white/[0.045] px-2 py-1 text-[11px] text-white/35 hover:text-white/65"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {draft.sceneObjects.map((object, index) => (
                <div
                  key={object.id}
                  className="rounded-xl border border-amber-300/15 bg-amber-400/[0.035] p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[11px] text-amber-100/75">
                      {index + 1}
                    </span>
                    <input
                      value={object.label}
                      onChange={(event) =>
                        updateSceneObject(object.id, { label: event.target.value })
                      }
                      aria-label={`物件${index + 1}名称`}
                      className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white/75 outline-none focus:border-amber-300/40"
                    />
                    <button
                      type="button"
                      onClick={() => removeSceneObject(object.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/30 hover:bg-red-400/10 hover:text-red-200"
                      aria-label={`删除物件${object.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <select
                    value={object.kind}
                    onChange={(event) =>
                      updateSceneObject(object.id, {
                        kind: event.target.value as DirectorSceneObjectKind,
                      })
                    }
                    aria-label={`${object.label}类型`}
                    className="mt-2 h-8 w-full rounded-md border border-white/10 bg-[#222327] px-2 text-[11px] text-white/60 outline-none"
                  >
                    {(
                      Object.keys(DIRECTOR_SCENE_OBJECT_KIND_LABELS) as DirectorSceneObjectKind[]
                    ).map((kind) => (
                      <option key={kind} value={kind}>
                        {DIRECTOR_SCENE_OBJECT_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                  {(
                    [
                      ['x', '左右位置', 4, 96],
                      ['y', '前后位置', 10, 92],
                      ['scale', '相对大小', 40, 180],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key} className="mt-2 block text-[11px] text-white/35">
                      <span className="mb-1 flex justify-between">
                        <span>{label}</span>
                        <span>{Math.round(object[key])}%</span>
                      </span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={object[key]}
                        onChange={(event) =>
                          updateSceneObject(object.id, { [key]: Number(event.target.value) })
                        }
                        className="w-full accent-amber-300"
                      />
                    </label>
                  ))}
                  <label className="mt-2 block text-[11px] text-white/35">
                    内容与摆放关系
                    <textarea
                      value={object.description}
                      onChange={(event) =>
                        updateSceneObject(object.id, { description: event.target.value })
                      }
                      placeholder="例：书桌上摆放几本课本、笔记本、铅笔和文具盒"
                      className="mt-1.5 h-16 w-full resize-none rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-[11px] leading-relaxed text-white/65 outline-none placeholder:text-white/20 focus:border-amber-300/40"
                    />
                  </label>
                </div>
              ))}
              {draft.sceneObjects.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] leading-relaxed text-white/25">
                  尚未登记固定物件
                  <br />
                  例如添加“黑板”，再设置它位于后景中央
                </div>
              )}
            </div>
          </div>

          <div ref={timelineSectionRef} className="mt-6 scroll-m-5 border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/90">
              <Clapperboard className="h-4 w-4 text-violet-300" />
              时间轴与结果
            </div>
            <div className="space-y-3">
              <label className="block text-[11px] text-white/45">
                0 秒开始画面
                <textarea
                  value={draft.startFrame}
                  onChange={(event) => patchDraft({ startFrame: event.target.value })}
                  placeholder="例：人物1背对镜头站在门口，人物2尚未入画"
                  className="mt-1.5 h-16 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-white/75 outline-none placeholder:text-white/20 focus:border-sky-300/40"
                />
              </label>
              <label className="block text-[11px] text-white/45">
                {draft.duration} 秒结束画面
                <textarea
                  value={draft.endFrame}
                  onChange={(event) => patchDraft({ endFrame: event.target.value })}
                  placeholder="例：人物1转身看向人物2，镜头停在双人中景"
                  className="mt-1.5 h-16 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-white/75 outline-none placeholder:text-white/20 focus:border-sky-300/40"
                />
              </label>
              <label className="block text-[11px] text-white/45">
                禁止事项
                <textarea
                  value={draft.negativePrompt}
                  onChange={(event) => patchDraft({ negativePrompt: event.target.value })}
                  className="mt-1.5 h-20 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-white/70 outline-none focus:border-sky-300/40"
                />
              </label>
            </div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/90">
              <User className="h-4 w-4 text-sky-300" />
              人物与动作
            </div>
            {activeSubject ? (
              <div className="space-y-4">
                <label className="block text-xs text-white/50">
                  名称
                  <input
                    value={activeSubject.label}
                    onChange={(event) =>
                      updateSubject(activeSubject.id, { label: event.target.value })
                    }
                    className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white/80 outline-none focus:border-sky-300/40"
                  />
                </label>
                <div
                  ref={performanceSectionRef}
                  className="scroll-m-5 space-y-3 rounded-xl border border-sky-300/15 bg-sky-400/[0.045] p-3"
                >
                  <div>
                    <div className="text-xs font-medium text-sky-100/80">人物动作</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/30">
                      每个人物都要分别填写。先在中间画面点击人物，再设置他的移动和表演。
                    </p>
                  </div>
                  <label className="block text-xs text-white/50">
                    移动方式
                    <select
                      value={activeSubject.motion}
                      onChange={(event) =>
                        updateSubject(activeSubject.id, {
                          motion: event.target.value as DirectorSubjectMotion,
                        })
                      }
                      className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-[#222327] px-3 text-xs text-white/75 outline-none focus:border-sky-300/40"
                    >
                      {(Object.keys(DIRECTOR_SUBJECT_MOTION_LABELS) as DirectorSubjectMotion[]).map(
                        (motion) => (
                          <option key={motion} value={motion}>
                            {DIRECTOR_SUBJECT_MOTION_LABELS[motion]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block text-xs text-white/50">
                    动作表演
                    <textarea
                      ref={actionInputRef}
                      value={activeSubject.action}
                      onChange={(event) =>
                        updateSubject(activeSubject.id, { action: event.target.value })
                      }
                      placeholder="例：先停下脚步，再缓慢抬手指向门外"
                      className="mt-1.5 h-16 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-white/75 outline-none placeholder:text-white/20 focus:border-sky-300/40"
                    />
                  </label>
                  <label className="block text-xs text-white/50">
                    表情与情绪
                    <input
                      value={activeSubject.emotion}
                      onChange={(event) =>
                        updateSubject(activeSubject.id, { emotion: event.target.value })
                      }
                      placeholder="例：警惕、克制，眉头轻皱"
                      className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 outline-none placeholder:text-white/20 focus:border-sky-300/40"
                    />
                  </label>
                </div>
                {(
                  [
                    ['x', '左右位置', 4, 96],
                    ['y', '前后位置', 10, 92],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key} className="block text-xs text-white/50">
                    <span className="mb-1.5 flex items-center justify-between">
                      <span>{label}</span>
                      <span className="tabular-nums text-white/70">
                        {Math.round(activeSubject[key])}%
                      </span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={activeSubject[key]}
                      onChange={(event) =>
                        updateSubject(activeSubject.id, { [key]: Number(event.target.value) }, true)
                      }
                      className="w-full accent-sky-400"
                    />
                  </label>
                ))}
                <label className="block text-xs text-white/50">
                  <span className="mb-1.5 flex items-center justify-between">
                    <span>人物大小</span>
                    <span className="tabular-nums text-white/70">
                      {Math.round(activeSubject.scale)}%
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSubject(
                          activeSubject.id,
                          { scale: Math.max(55, activeSubject.scale - 10) },
                          true,
                        )
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
                      aria-label="缩小人物"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="range"
                      min={55}
                      max={165}
                      value={activeSubject.scale}
                      onChange={(event) =>
                        updateSubject(activeSubject.id, { scale: Number(event.target.value) }, true)
                      }
                      className="min-w-0 flex-1 accent-sky-400"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateSubject(
                          activeSubject.id,
                          { scale: Math.min(165, activeSubject.scale + 10) },
                          true,
                        )
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
                      aria-label="放大人物"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </label>
                <label className="block text-xs text-white/50">
                  <span className="mb-1.5 flex items-center justify-between">
                    <span>画面姿态倾斜</span>
                    <span className="tabular-nums text-white/70">
                      {Math.round(activeSubject.rotation)}°
                    </span>
                  </span>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    value={activeSubject.rotation}
                    onChange={(event) =>
                      updateSubject(
                        activeSubject.id,
                        { rotation: Number(event.target.value) },
                        true,
                      )
                    }
                    className="w-full accent-sky-400"
                  />
                  <span className="mt-1 block text-[11px] text-white/25">
                    仅改变构图中的视觉倾斜，不代表身体朝向
                  </span>
                </label>
                <div>
                  <label className="mb-3 block text-xs text-white/50">
                    <span className="mb-1.5 flex items-center justify-between gap-3">
                      <span>人物朝向角度</span>
                      <span className="tabular-nums text-sky-100/80">
                        {Math.round(activeSubject.bodyAngle)}° ·{' '}
                        {DIRECTOR_BODY_FACING_LABELS[activeSubject.bodyFacing]}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={5}
                      value={activeSubject.bodyAngle}
                      onChange={(event) => {
                        const bodyAngle = Number(event.target.value);
                        updateSubject(activeSubject.id, {
                          bodyAngle,
                          bodyFacing: directorBodyFacingFromAngle(bodyAngle),
                        });
                      }}
                      className="w-full accent-sky-400"
                      aria-label="人物朝向角度"
                    />
                    <span className="mt-1 flex justify-between text-[11px] text-white/25">
                      <span>背面 -180°</span>
                      <span>左侧 -90°</span>
                      <span>正面 0°</span>
                      <span>右侧 90°</span>
                      <span>背面 180°</span>
                    </span>
                  </label>
                  <div className="mb-2 text-xs text-white/50">常用朝向预设</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(DIRECTOR_BODY_FACING_LABELS) as DirectorBodyFacing[]).map(
                      (facing) => (
                        <button
                          key={facing}
                          type="button"
                          onClick={() =>
                            updateSubject(activeSubject.id, {
                              bodyFacing: facing,
                              bodyAngle: DIRECTOR_BODY_FACING_ANGLES[facing],
                            })
                          }
                          className={`rounded-lg border px-2 py-2 text-[11px] transition-colors ${
                            activeSubject.bodyFacing === facing
                              ? 'border-sky-300/55 bg-sky-400/15 text-sky-100'
                              : 'border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70'
                          }`}
                        >
                          {DIRECTOR_BODY_FACING_LABELS[facing]}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <div className="text-xs text-white/50">
                  <label htmlFor="director-body-target">身体朝向目标</label>
                  <input
                    id="director-body-target"
                    value={activeSubject.bodyTarget}
                    onChange={(event) =>
                      updateSubject(activeSubject.id, { bodyTarget: event.target.value })
                    }
                    placeholder="例：黑板、人物2、教室门"
                    className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 outline-none placeholder:text-white/20 focus:border-sky-300/40"
                  />
                  <span className="mt-1 block text-[11px] leading-relaxed text-white/25">
                    填写后会成为硬性导演指令，例如“身体明确朝向黑板”。
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      { id: 'camera', label: '镜头' },
                      ...draft.sceneObjects.map((object) => ({
                        id: object.id,
                        label: object.label,
                      })),
                      ...draft.subjects
                        .filter((subject) => subject.id !== activeSubject.id)
                        .map((subject) => ({ id: subject.id, label: subject.label })),
                    ].map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() =>
                          updateSubject(activeSubject.id, { bodyTarget: target.label })
                        }
                        className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                          activeSubject.bodyTarget === target.label
                            ? 'bg-sky-400/15 text-sky-100/80'
                            : 'bg-white/[0.045] text-white/35 hover:text-white/65'
                        }`}
                      >
                        {target.label}
                      </button>
                    ))}
                  </span>
                </div>
                <label className="block text-xs text-white/50">
                  头部方向
                  <select
                    value={activeSubject.headDirection}
                    onChange={(event) =>
                      updateSubject(activeSubject.id, {
                        headDirection: event.target.value as DirectorHeadDirection,
                      })
                    }
                    className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-[#222327] px-3 text-xs text-white/75 outline-none focus:border-sky-300/40"
                  >
                    {(Object.keys(DIRECTOR_HEAD_DIRECTION_LABELS) as DirectorHeadDirection[]).map(
                      (direction) => (
                        <option key={direction} value={direction}>
                          {DIRECTOR_HEAD_DIRECTION_LABELS[direction]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="block text-xs text-white/50">
                  视线目标
                  <input
                    value={activeSubject.gazeTarget}
                    onChange={(event) =>
                      updateSubject(activeSubject.id, { gazeTarget: event.target.value })
                    }
                    placeholder="例：人物2、门外、镜头"
                    className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 outline-none placeholder:text-white/20 focus:border-sky-300/40"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeSubject(activeSubject.id)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300/15 bg-red-400/[0.06] py-2 text-xs text-red-200/70 transition-colors hover:bg-red-400/10 hover:text-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  移除人物
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-white/30">
                <p>
                  {draft.subjects.length > 0
                    ? '点击中间画面中的人物，即可设置他的动作'
                    : '需要先从左侧素材中添加人物，才能填写人物动作'}
                </p>
                <button
                  type="button"
                  onClick={() => setLeftPanel('assets')}
                  className="mt-3 rounded-lg border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-[11px] text-sky-100/75 hover:bg-sky-400/15"
                >
                  {draft.subjects.length > 0 ? '查看人物素材' : '去添加人物'}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
      {showGuide && (
        <DirectorGuideModal
          constraintPrompt={buildDirectorConstraintPrompt(draft)}
          onClose={() => setShowGuide(false)}
        />
      )}
    </div>
  );
}
