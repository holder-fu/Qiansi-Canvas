import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowDownUp,
  ArrowUpRight,
  Box,
  Check,
  Clapperboard,
  Image as ImageIcon,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import {
  isDirectorNodeKind,
  type DirectorBackgroundActor,
  type DirectorBodyFacing,
  type DirectorSceneObject,
  type DirectorSceneState,
  type DirectorSubjectFrameShape,
  type DirectorSubjectPlacement,
  type FlowNode,
} from '../canvas/nodeTypes';
import { flushCanvasPersistence, useCanvasStore, type GenParams } from '../store/canvasStore';
import {
  createDefaultDirectorScene,
  createDefaultDirectorSubject,
  DIRECTOR_BODY_FACING_ANGLES,
  DIRECTOR_BODY_FACING_LABELS,
  normalizeDirectorScene,
} from '../lib/directorConstraints';
import {
  buildFlatDirectorConstraintPrompt,
  buildFlatDirectorReferenceImages,
  buildFlatDirectorReferenceManifest,
  flatDirectorSubjectCode,
  getFlatDirectorReadiness,
  isUsableFlatDirectorReferenceUrl,
  MAX_FLAT_DIRECTOR_REFERENCES,
  removeFlatDirectorSubject,
} from '../lib/flatDirectorConstraints';
import { useAppTranslation } from '../i18n/appI18n';
import { getNodeOutputPorts, getNodeOutputValues } from '../graph/graph';
import {
  normalizeFlatDirectorControlAspectRatio,
  renderFlatDirectorControlImage,
} from '../lib/flatDirectorControlImage';
import {
  DIRECTOR_SUBJECT_FRAME_SHAPES,
  directorSubjectFrameStyle,
  normalizeDirectorSubjectFrameShape,
} from '../lib/directorSubjectFrame';
import { mediaPreviewUrl } from '../lib/mediaPreview';

const COLORS = ['#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#34d399'];
const BODY_FACING_KEYS: Record<DirectorBodyFacing, string> = {
  front: 'director2d.facing.front',
  'front-left': 'director2d.facing.front-left',
  'left-profile': 'director2d.facing.left-profile',
  back: 'director2d.facing.back',
  'right-profile': 'director2d.facing.right-profile',
  'front-right': 'director2d.facing.front-right',
};
const FRAME_SHAPE_LABELS: Record<DirectorSubjectFrameShape, string> = {
  arch: '拱门',
  rounded: '圆角',
  oval: '椭圆',
  hexagon: '六边形',
  shield: '盾牌',
  human: '人形',
};
const FRAME_SHAPE_KEYS: Record<DirectorSubjectFrameShape, string> = {
  arch: 'director2d.subject.frameShape.arch',
  rounded: 'director2d.subject.frameShape.rounded',
  oval: 'director2d.subject.frameShape.oval',
  hexagon: 'director2d.subject.frameShape.hexagon',
  shield: 'director2d.subject.frameShape.shield',
  human: 'director2d.subject.frameShape.human',
};
type Reference = { id: string; label: string; imageUrl: string; connected: boolean };
type ReferenceSortOrder = 'newest' | 'oldest';
type Selection =
  | { kind: 'subject'; id: string }
  | { kind: 'background'; id: string }
  | { kind: 'object'; id: string }
  | null;
type DragState = {
  selection: Exclude<Selection, null>;
  pointerId: number;
  /** Pointer offset from the selected marker's visual center, in stage percent. */
  offsetX: number;
  offsetY: number;
};

function nodeImage(node: FlowNode) {
  const output = getNodeOutputPorts(node).find(
    (port) => port.assetType === 'image' || port.assetType === 'reference',
  );
  if (!output) return;
  return getNodeOutputValues(node, output).find(
    (value): value is string =>
      typeof value === 'string' && isUsableFlatDirectorReferenceUrl(value),
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function directorDraftSignature(scene: DirectorSceneState, aspectRatio: GenParams['aspectRatio']) {
  return JSON.stringify({
    scene: normalizeDirectorScene({ ...scene, stageMode: 'flat' }),
    aspectRatio,
  });
}

const DIRECTOR_ASPECT_RATIOS: GenParams['aspectRatio'][] = [
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
];

const POSITION_PRESETS = [
  { id: 'back-left', label: '左后', x: 18, y: 42 },
  { id: 'back-center', label: '中后', x: 50, y: 42 },
  { id: 'back-right', label: '右后', x: 82, y: 42 },
  { id: 'middle-left', label: '左中', x: 18, y: 66 },
  { id: 'middle-center', label: '中央', x: 50, y: 66 },
  { id: 'middle-right', label: '右中', x: 82, y: 66 },
  { id: 'front-left', label: '左前', x: 18, y: 90 },
  { id: 'front-center', label: '中前', x: 50, y: 90 },
  { id: 'front-right', label: '右前', x: 82, y: 90 },
] as const;

function figureHeightPercent(scale: number) {
  return clamp(scale * 0.3, 9, 90);
}

async function createControlImage(
  scene: DirectorSceneState,
  aspectRatio: GenParams['aspectRatio'],
) {
  return renderFlatDirectorControlImage(scene, aspectRatio);
}

export function FlatDirectorStudioModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const createImageFromDirector = useCanvasStore((state) => state.createImageFromDirector);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const propagate = useCanvasStore((state) => state.propagate);
  const [draft, setDraft] = useState<DirectorSceneState>(createDefaultDirectorScene);
  const [aspectRatio, setAspectRatio] = useState<GenParams['aspectRatio']>('16:9');
  const [selection, setSelection] = useState<Selection>(null);
  const [newObject, setNewObject] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [operationNotice, setOperationNotice] = useState('');
  const [buildingOutput, setBuildingOutput] = useState(false);
  const [referenceSortOrder, setReferenceSortOrder] = useState<ReferenceSortOrder>('newest');
  const [referenceSortMenuOpen, setReferenceSortMenuOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const loadedId = useRef<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignature = useRef('');
  const latestDraftSignature = useRef('');
  const applyRunId = useRef(0);
  const isOpen = openModal === 'director-studio-2d';
  latestDraftSignature.current = directorDraftSignature(draft, aspectRatio);
  const node = nodes.find(
    (item) =>
      item.id === modalNodeId &&
      (item.data.kind === 'director-2d' ||
        (item.data.kind === 'director' && item.data.directorMode === '2d')),
  );
  const references = useMemo<Reference[]>(() => {
    if (!modalNodeId) return [];
    const connectedIds = new Set(
      edges.filter((edge) => edge.target === modalNodeId).map((edge) => edge.source),
    );
    const downstreamIds = new Set<string>();
    const queue = [modalNodeId];
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) continue;
      edges
        .filter((edge) => edge.source === source)
        .forEach((edge) => {
          if (downstreamIds.has(edge.target)) return;
          downstreamIds.add(edge.target);
          queue.push(edge.target);
        });
    }
    return nodes
      .flatMap((item) => {
        if (
          item.id === modalNodeId ||
          downstreamIds.has(item.id) ||
          isDirectorNodeKind(item.data.kind)
        ) {
          return [];
        }
        const imageUrl = nodeImage(item);
        return imageUrl
          ? [
              {
                id: item.id,
                label: item.data.imageFileName || item.data.title || '画布图片',
                imageUrl,
                connected: connectedIds.has(item.id),
              },
            ]
          : [];
      })
      .sort((left, right) => Number(right.connected) - Number(left.connected));
  }, [edges, modalNodeId, nodes]);
  const sortedReferences = useMemo(() => {
    const nodeOrder = new Map(nodes.map((item, index) => [item.id, index]));
    const direction = referenceSortOrder === 'newest' ? -1 : 1;
    return [...references].sort(
      (left, right) =>
        ((nodeOrder.get(left.id) ?? -1) - (nodeOrder.get(right.id) ?? -1)) * direction,
    );
  }, [nodes, referenceSortOrder, references]);

  useEffect(() => {
    if (!isOpen || !node || loadedId.current === node.id) return;
    loadedId.current = node.id;
    const scene = normalizeDirectorScene(node.data.directorScene);
    scene.stageMode = 'flat';
    const restoredAspectRatio = normalizeFlatDirectorControlAspectRatio(
      node.data.aspectRatio ?? node.data.genParams?.aspectRatio,
    );
    lastSavedSignature.current = directorDraftSignature(scene, restoredAspectRatio);
    setDraftReady(false);
    setDraft(scene);
    setAspectRatio(restoredAspectRatio);
    setSelection(scene.subjects[0] ? { kind: 'subject', id: scene.subjects[0].id } : null);
    setDraftReady(true);
  }, [isOpen, node]);
  useEffect(() => {
    if (!isOpen) {
      applyRunId.current += 1;
      loadedId.current = null;
      setDraftReady(false);
      setAutoSaveState('idle');
      setOperationNotice('');
      setBuildingOutput(false);
      setReferenceSortMenuOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !draftReady || references.length === 0) return;
    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    setDraft((scene) => {
      let changed = false;
      const sceneReference = scene.sceneSourceId
        ? referenceById.get(scene.sceneSourceId)
        : undefined;
      const sceneUrl = sceneReference?.imageUrl ?? scene.sceneUrl;
      if (sceneUrl !== scene.sceneUrl) changed = true;
      const subjects = scene.subjects.map((subject) => {
        const reference = subject.sourceNodeId
          ? referenceById.get(subject.sourceNodeId)
          : undefined;
        if (!reference || reference.imageUrl === subject.imageUrl) return subject;
        changed = true;
        return { ...subject, imageUrl: reference.imageUrl };
      });
      return changed ? { ...scene, sceneUrl, subjects } : scene;
    });
  }, [draftReady, isOpen, references]);

  const patchScene = useCallback((value: Partial<DirectorSceneState>) => {
    setDraft((scene) => ({ ...scene, ...value }));
  }, []);
  const patchSubject = useCallback((id: string, value: Partial<DirectorSubjectPlacement>) => {
    setDraft((scene) => ({
      ...scene,
      subjects: scene.subjects.map((subject) =>
        subject.id === id ? { ...subject, ...value } : subject,
      ),
    }));
  }, []);
  const patchBackgroundActor = useCallback(
    (id: string, value: Partial<DirectorBackgroundActor>) => {
      setDraft((scene) => ({
        ...scene,
        backgroundActors: (scene.backgroundActors ?? []).map((actor) =>
          actor.id === id ? { ...actor, ...value } : actor,
        ),
      }));
    },
    [],
  );
  const patchObject = useCallback((id: string, value: Partial<DirectorSceneObject>) => {
    setDraft((scene) => ({
      ...scene,
      sceneObjects: scene.sceneObjects.map((item) =>
        item.id === id ? { ...item, ...value } : item,
      ),
    }));
  }, []);

  const removeSubject = useCallback((id: string) => {
    setDraft((scene) => removeFlatDirectorSubject(scene, id));
    setSelection((current) => (current?.kind === 'subject' && current.id === id ? null : current));
    setOperationNotice('');
  }, []);

  const saveDraft = useCallback(
    (value: DirectorSceneState, outputAspectRatio: GenParams['aspectRatio']) => {
      if (!modalNodeId) return;
      const scene = normalizeDirectorScene({ ...value, stageMode: 'flat' });
      const current = useCanvasStore.getState().nodes.find((item) => item.id === modalNodeId);
      updateNodeData(modalNodeId, {
        directorScene: scene,
        prompt: scene.prompt,
        aspectRatio: outputAspectRatio,
        genParams: { ...current?.data.genParams, aspectRatio: outputAspectRatio },
        directorOutputDirty: true,
        directorConstraintPrompt: undefined,
        directorReferenceLabels: undefined,
        directorLayoutUrl: undefined,
        directorThumbnailUrl: undefined,
        imageUrl: undefined,
        images: undefined,
        output: undefined,
        originalUrl: undefined,
        previewUrl: undefined,
        description: `2D 分镜约束 · ${scene.subjects.length} 主角 · ${(scene.backgroundActors ?? []).length} 群演 · ${scene.sceneObjects.length} 个固定物品`,
      });
      propagate(modalNodeId);
      lastSavedSignature.current = directorDraftSignature(scene, outputAspectRatio);
      void flushCanvasPersistence();
      setAutoSaveState('saved');
    },
    [modalNodeId, propagate, updateNodeData],
  );

  useEffect(() => {
    if (!isOpen || !draftReady || !modalNodeId) return;
    if (directorDraftSignature(draft, aspectRatio) === lastSavedSignature.current) {
      setAutoSaveState('saved');
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveState('saving');
    autoSaveTimer.current = setTimeout(() => saveDraft(draft, aspectRatio), 300);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [aspectRatio, draft, draftReady, isOpen, modalNodeId, saveDraft]);

  const closeWithAutoSave = useCallback(() => {
    applyRunId.current += 1;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const signature = directorDraftSignature(draft, aspectRatio);
    if (draftReady && signature !== lastSavedSignature.current) saveDraft(draft, aspectRatio);
    closeModal();
  }, [aspectRatio, closeModal, draft, draftReady, saveDraft]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWithAutoSave();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeWithAutoSave, isOpen]);

  const selectedSubject =
    selection?.kind === 'subject'
      ? (draft.subjects.find((subject) => subject.id === selection.id) ?? null)
      : null;
  const selectedBackgroundActor =
    selection?.kind === 'background'
      ? ((draft.backgroundActors ?? []).find((actor) => actor.id === selection.id) ?? null)
      : null;
  const selectedObject =
    selection?.kind === 'object'
      ? (draft.sceneObjects.find((object) => object.id === selection.id) ?? null)
      : null;
  const existingImageTask = nodes.find(
    (item) =>
      item.data.kind === 'image' && item.data.composerParams?.directorSourceId === modalNodeId,
  );
  const imageTaskBusy = existingImageTask?.data.generating === true;
  const readiness = getFlatDirectorReadiness(draft);
  const identityReferenceCount = draft.subjects.filter((subject) => subject.imageUrl).length;
  const subjectReferenceLimit = MAX_FLAT_DIRECTOR_REFERENCES - 1 - (draft.sceneUrl ? 1 : 0);
  const ensureReferenceConnection = (reference: Reference) => {
    if (!modalNodeId || reference.connected) return Boolean(modalNodeId);
    onConnect({
      source: reference.id,
      sourceHandle: null,
      target: modalNodeId,
      targetHandle: 'references',
    });
    const connected = useCanvasStore
      .getState()
      .edges.some((edge) => edge.source === reference.id && edge.target === modalNodeId);
    if (!connected) {
      setOperationNotice(
        t(
          'director2d.error.connectReference',
          '这张图片无法连接到当前导演台，请确认它不是导演台的下游结果。',
        ),
      );
    }
    return connected;
  };
  const chooseScene = (reference: Reference) => {
    if (draft.sceneSourceId === reference.id) {
      patchScene({ sceneSourceId: undefined, sceneUrl: undefined, sceneName: '' });
      setOperationNotice('');
      return;
    }
    if (
      draft.subjects.some(
        (subject) =>
          subject.sourceNodeId === reference.id || subject.imageUrl === reference.imageUrl,
      )
    ) {
      setOperationNotice(
        t(
          'director2d.error.referenceRoleConflict',
          '同一张图片不能同时作为场景图和人物身份图，请为场景选择另一张图片。',
        ),
      );
      return;
    }
    if (!draft.sceneUrl && identityReferenceCount > MAX_FLAT_DIRECTOR_REFERENCES - 2) {
      setOperationNotice(
        t(
          'director2d.error.sceneCapacity',
          '场景图需要占用 1 个参考位。请先把主要人物减少到 3 名以内。',
        ),
      );
      return;
    }
    if (!ensureReferenceConnection(reference)) return;
    setOperationNotice('');
    patchScene({
      sceneSourceId: reference.id,
      sceneUrl: reference.imageUrl,
      sceneName:
        draft.sceneSourceId === reference.id && draft.sceneName.trim()
          ? draft.sceneName
          : '场景参考',
    });
  };
  const toggleSubject = (reference: Reference) => {
    const existing = draft.subjects.find((subject) => subject.sourceNodeId === reference.id);
    if (existing) {
      removeSubject(existing.id);
      return;
    }
    if (draft.sceneSourceId === reference.id || draft.sceneUrl === reference.imageUrl) {
      setOperationNotice(
        t(
          'director2d.error.referenceRoleConflict',
          '同一张图片不能同时作为场景图和人物身份图，请选择另一张人物图片。',
        ),
      );
      return;
    }
    if (draft.subjects.some((subject) => subject.imageUrl === reference.imageUrl)) {
      setOperationNotice(t('director2d.error.duplicateIdentity', '这张人物身份图已经加入导演台。'));
      return;
    }
    if (identityReferenceCount >= subjectReferenceLimit) {
      setOperationNotice(
        draft.sceneUrl
          ? t(
              'director2d.error.referenceLimitWithScene',
              '当前已达到“控制图 + 场景图 + 3 名人物图”的 5 张参考上限。',
            )
          : t(
              'director2d.error.referenceLimitWithoutScene',
              '当前已达到“控制图 + 4 名人物图”的 5 张参考上限。',
            ),
      );
      return;
    }
    if (!ensureReferenceConnection(reference)) return;
    const subject = createDefaultDirectorSubject({
      id: `flat-subject-${Date.now()}-${draft.subjects.length}`,
      sourceNodeId: reference.id,
      label: reference.label.trim() || `人物 ${draft.subjects.length + 1}`,
      imageUrl: reference.imageUrl,
      x: Math.min(84, 28 + draft.subjects.length * 23),
      y: 62,
      scale: 120,
      rotation: 0,
    });
    setDraft((scene) => ({ ...scene, subjects: [...scene.subjects, subject] }));
    setSelection({ kind: 'subject', id: subject.id });
    setOperationNotice('');
  };
  const addBackgroundActor = () => {
    const actor: DirectorBackgroundActor = {
      id: `flat-background-${Date.now()}-${(draft.backgroundActors ?? []).length}`,
      label: `群演 ${(draft.backgroundActors ?? []).length + 1}`,
      x: Math.min(88, 62 + (draft.backgroundActors ?? []).length * 8),
      y: 38,
      scale: 65,
      description: '作为背景环境人物，不突出脸部身份',
    };
    setDraft((scene) => ({
      ...scene,
      backgroundActors: [...(scene.backgroundActors ?? []), actor],
    }));
    setSelection({ kind: 'background', id: actor.id });
  };
  const addObject = () => {
    const label = newObject.trim();
    if (!label) return;
    const object: DirectorSceneObject = {
      id: `flat-object-${Date.now()}`,
      label,
      kind: 'prop',
      x: 50,
      y: 32,
      depth: 32,
      scale: 100,
      description: '',
    };
    setDraft((scene) => ({ ...scene, sceneObjects: [...scene.sceneObjects, object] }));
    setNewObject('');
    setSelection({ kind: 'object', id: object.id });
  };

  const updateDragPosition = useCallback(
    (
      selectionToMove: Exclude<Selection, null>,
      clientX: number,
      clientY: number,
      offsetX = 0,
      offsetY = 0,
    ) => {
      const bounds = stageRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = clamp(((clientX - bounds.left) / bounds.width) * 100 - offsetX, 5, 95);
      const y = clamp(((clientY - bounds.top) / bounds.height) * 100 - offsetY, 10, 92);
      if (selectionToMove.kind === 'subject') {
        patchSubject(selectionToMove.id, { x, y, depth: y });
      } else if (selectionToMove.kind === 'background') {
        patchBackgroundActor(selectionToMove.id, { x, y });
      } else {
        patchObject(selectionToMove.id, { x, y, depth: y });
      }
    },
    [patchBackgroundActor, patchObject, patchSubject],
  );
  const startDrag = (event: PointerEvent<HTMLButtonElement>, value: Exclude<Selection, null>) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const current =
      value.kind === 'subject'
        ? draft.subjects.find((subject) => subject.id === value.id)
        : value.kind === 'background'
          ? (draft.backgroundActors ?? []).find((actor) => actor.id === value.id)
          : draft.sceneObjects.find((object) => object.id === value.id);
    if (!current) return;
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * 100;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * 100;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      selection: value,
      pointerId: event.pointerId,
      offsetX: pointerX - current.x,
      offsetY: pointerY - current.y,
    };
    setSelection(value);
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const dragging = dragRef.current;
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    updateDragPosition(
      dragging.selection,
      event.clientX,
      event.clientY,
      dragging.offsetX,
      dragging.offsetY,
    );
  };
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const placeSelectedMarker = (event: PointerEvent<HTMLDivElement>) => {
    if (!selection || event.button !== 0) return;
    updateDragPosition(selection, event.clientX, event.clientY);
  };

  const apply = async () => {
    if (!modalNodeId || !readiness.ready || buildingOutput) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const runId = ++applyRunId.current;
    const scene = normalizeDirectorScene({ ...draft, stageMode: 'flat' });
    const outputAspectRatio = aspectRatio;
    const draftSignature = directorDraftSignature(scene, outputAspectRatio);
    setBuildingOutput(true);
    setOperationNotice('');
    try {
      const controlImage = await createControlImage(scene, outputAspectRatio);
      const currentStore = useCanvasStore.getState();
      if (
        runId !== applyRunId.current ||
        latestDraftSignature.current !== draftSignature ||
        currentStore.openModal !== 'director-studio-2d' ||
        currentStore.modalNodeId !== modalNodeId
      ) {
        return;
      }
      if (!controlImage) {
        setOperationNotice(
          t('director2d.error.controlImage', '控制图生成失败，请刷新页面后重试。'),
        );
        return;
      }
      const images = buildFlatDirectorReferenceImages(scene, controlImage);
      const referenceManifest = buildFlatDirectorReferenceManifest(scene);
      updateNodeData(modalNodeId, {
        directorScene: scene,
        directorConstraintPrompt: buildFlatDirectorConstraintPrompt(scene, outputAspectRatio),
        directorReferenceLabels: referenceManifest.map(
          (reference) => `参考图 ${reference.index} · ${reference.label}`,
        ),
        directorLayoutUrl: controlImage,
        imageUrl: controlImage,
        images,
        output: images,
        prompt: scene.prompt,
        aspectRatio: outputAspectRatio,
        genParams: { ...node?.data.genParams, aspectRatio: outputAspectRatio },
        directorOutputDirty: false,
        description: `2D 分镜约束 · ${scene.subjects.length} 主角 · ${(scene.backgroundActors ?? []).length} 群演 · ${scene.sceneObjects.length} 个固定物品`,
      });
      lastSavedSignature.current = draftSignature;
      const imageTaskId = createImageFromDirector(modalNodeId);
      if (!imageTaskId) {
        propagate(modalNodeId);
        void flushCanvasPersistence();
        setOperationNotice(
          t(
            'director2d.error.createImageTask',
            '图片生成任务创建失败。请确认当前没有正在生成的旧任务，然后重试。',
          ),
        );
        return;
      }
      void flushCanvasPersistence();
      closeModal();
    } catch {
      setOperationNotice(
        t(
          'director2d.error.createImageTask',
          '图片生成任务创建失败，当前站位草稿已经保留，请重试。',
        ),
      );
    } finally {
      if (runId === applyRunId.current) setBuildingOutput(false);
    }
  };

  if (!isOpen || !node) return null;

  return (
    <div
      className="director-settings-shell fixed inset-0 z-[1000] flex flex-col text-white"
      role="dialog"
      aria-modal="true"
      aria-label={t('director2d.dialogLabel', '2D 分镜导演台')}
    >
      <header className="director-settings-header flex h-14 shrink-0 items-center justify-between border-b px-5">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-4 w-4 text-[#eabf35]" />
          <span className="text-sm font-semibold">
            {t('director2d.title', 'Qiansi-Canvas · 2D 导演台')}
          </span>
          <span className="text-xs text-white/45">
            {t('director2d.subtitle', '故事板 / 九宫格图片约束')}
          </span>
          <span className="text-xs text-[#eabf35]/85">
            {autoSaveState === 'saving'
              ? t('director.autosave.saving', '正在自动保存…')
              : node.data.directorOutputDirty
                ? t('director2d.autosave.outputPending', '草稿已保存 · 输出待应用')
                : t('director.autosave.enabled', '自动保存已开启')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/45">
            {t('director2d.header.dragHint', '拖动人物脚底站位，创建后在图片节点选择模型并生成')}
          </span>
          <button
            type="button"
            onClick={apply}
            disabled={!readiness.ready || buildingOutput || imageTaskBusy}
            title={
              imageTaskBusy
                ? t('director2d.apply.taskBusyHelp', '当前图片任务生成结束后才能更新站位约束')
                : readiness.issues.join('；') ||
                  t('director2d.apply.help', '编译当前站位并创建可直接提交的下游图片节点')
            }
            className="director-settings-action-primary px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="mr-1.5 inline h-4 w-4" />
            {imageTaskBusy
              ? t('director2d.apply.taskBusy', '图片任务生成中')
              : buildingOutput
                ? t('director2d.apply.building', '正在构建图片任务…')
                : existingImageTask
                  ? t('director2d.apply.update', '更新图片生成节点')
                  : t('director2d.apply', '创建图片生成节点')}
          </button>
          <button
            type="button"
            aria-label={t('common.close', '关闭')}
            onClick={closeWithAutoSave}
            className="director-settings-action p-1.5 text-white/55"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[300px_minmax(460px,1fr)_300px]">
        <aside className="director-settings-sidebar overflow-y-auto border-r p-4">
          <h2 className="text-base font-semibold">
            {t('director2d.references.title', '画布参考图')}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/50">
            {t(
              'director2d.references.description',
              '直接从当前画布选择。每张图可设为场景，或加入为需要精确站位的人物；选择后会自动建立参考连接。',
            )}
          </p>
          <div className="director-settings-card mt-3 rounded-lg border px-3 py-2 text-xs text-white/55">
            {t('director2d.references.capacity', '参考图容量：{current} / {max}', {
              current: 1 + (draft.sceneUrl ? 1 : 0) + identityReferenceCount,
              max: MAX_FLAT_DIRECTOR_REFERENCES,
            })}
            <span className="ml-2 text-white/35">
              {t('director2d.references.controlImageIncluded', '含 1 张构图控制图')}
            </span>
          </div>
          {(operationNotice || readiness.issues.length > 0) && (
            <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
              {operationNotice || readiness.issues.join('；')}
            </p>
          )}

          {references.length === 0 && (
            <p className="director-settings-card mt-4 rounded-lg border border-dashed p-3 text-sm leading-relaxed text-white/45">
              {t(
                'director2d.references.empty',
                '当前画布还没有可用图片。请先在画布添加场景图和人物身份图，再打开导演台。',
              )}
            </p>
          )}

          <section className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/80">
                {t('director2d.references.canvasSource', '当前画布图片')}
              </h3>
              <div className="flex items-center gap-1">
                <span className="mr-1 text-xs text-white/40">{references.length}</span>
                <div className="relative">
                  <button
                    type="button"
                    data-director-reference-sort="true"
                    onClick={() => setReferenceSortMenuOpen((current) => !current)}
                    className={`rounded p-1 transition ${
                      referenceSortMenuOpen || referenceSortOrder !== 'newest'
                        ? 'bg-white/10 text-white/80'
                        : 'text-white/40 hover:bg-white/10 hover:text-white'
                    }`}
                    title={t('library.editor.canvasSort', '节点图片排序')}
                    aria-label={t('library.editor.canvasSort', '节点图片排序')}
                    aria-haspopup="menu"
                    aria-expanded={referenceSortMenuOpen}
                  >
                    <ArrowDownUp className="h-4 w-4" />
                  </button>
                  {referenceSortMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-white/10 bg-[#262629] p-1 shadow-xl"
                    >
                      {(
                        [
                          {
                            id: 'newest',
                            label: t('library.editor.canvasSortNewest', '最新节点优先'),
                          },
                          {
                            id: 'oldest',
                            label: t('library.editor.canvasSortOldest', '最早节点优先'),
                          },
                        ] as Array<{ id: ReferenceSortOrder; label: string }>
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={referenceSortOrder === item.id}
                          onClick={() => {
                            setReferenceSortOrder(item.id);
                            setReferenceSortMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-white/65 hover:bg-white/10 hover:text-white"
                        >
                          <Check
                            className={`h-3.5 w-3.5 ${referenceSortOrder === item.id ? 'opacity-100' : 'opacity-0'}`}
                          />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {sortedReferences.map((reference) => {
                const subject = draft.subjects.find((item) => item.sourceNodeId === reference.id);
                const sceneActive = draft.sceneSourceId === reference.id;
                const roleConflict = Boolean(subject) || sceneActive;
                const characterFull = !subject && identityReferenceCount >= subjectReferenceLimit;
                return (
                  <div
                    key={reference.id}
                    className={`director-settings-card rounded-lg border p-2 ${roleConflict ? 'director-settings-card--selected' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={mediaPreviewUrl(reference.imageUrl, 'image')}
                        alt=""
                        className="h-14 w-16 shrink-0 rounded-lg bg-black/30 object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white/90">
                          {reference.label}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-white/40">
                          {reference.connected && <Check className="h-3 w-3 text-emerald-300" />}
                          {reference.connected
                            ? t('director2d.references.connected', '已连接导演台')
                            : t('director2d.references.clickToConnect', '选择角色后自动连接')}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => chooseScene(reference)}
                        disabled={Boolean(subject) && !sceneActive}
                        className={`rounded-md border px-2 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-35 ${sceneActive ? 'border-amber-300/60 bg-amber-300/15 text-amber-100' : 'border-white/10 text-white/60 hover:border-amber-300/35 hover:text-amber-100'}`}
                      >
                        <ImageIcon className="mr-1 inline h-3.5 w-3.5" />
                        {sceneActive
                          ? t('director2d.references.removeScene', '取消场景')
                          : t('director2d.references.useScene', '设为场景')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSubject(reference)}
                        disabled={(sceneActive && !subject) || characterFull}
                        className={`rounded-md border px-2 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-35 ${subject ? 'border-sky-300/60 bg-sky-300/15 text-sky-100' : 'border-white/10 text-white/60 hover:border-sky-300/35 hover:text-sky-100'}`}
                      >
                        <UserRound className="mr-1 inline h-3.5 w-3.5" />
                        {subject
                          ? t('director2d.references.removeCharacter', '移除人物')
                          : characterFull
                            ? t('director2d.references.full', '容量已满')
                            : t('director2d.references.addCharacter', '加入人物')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="director-settings-content min-h-0 overflow-auto p-6">
          <div className="mx-auto max-w-[960px]">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {t('director2d.stage.title', '二维构图控制图')}
                </h2>
                <p className="mt-1.5 text-sm text-white/50">
                  {t(
                    'director2d.stage.description',
                    '直接拖动标记定位。彩色人物为主要身份参考；灰色为不具名群演；黄色为必须出现的固定物品。',
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-end gap-2 text-xs">
                <label className="text-left text-white/50">
                  <span className="mb-1 block">
                    {t('director2d.stage.aspectRatio', '成图比例')}
                  </span>
                  <select
                    value={aspectRatio}
                    onChange={(event) =>
                      setAspectRatio(event.target.value as GenParams['aspectRatio'])
                    }
                    className="director-settings-input h-8 min-w-24 border px-2 text-xs text-white outline-none"
                  >
                    {DIRECTOR_ASPECT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="rounded-md bg-sky-400/10 px-2.5 py-1.5 text-sky-100">
                  {t('director2d.stage.subjectCount', '{count} 名主角', {
                    count: draft.subjects.length,
                  })}
                </span>
                <span className="rounded-md bg-slate-200/10 px-2.5 py-1.5 text-slate-200">
                  {t('director2d.stage.extraCount', '{count} 名群演', {
                    count: (draft.backgroundActors ?? []).length,
                  })}
                </span>
              </div>
            </div>
            <div
              ref={stageRef}
              onPointerDown={placeSelectedMarker}
              className="director-settings-stage relative mx-auto touch-none overflow-hidden border"
              style={{
                aspectRatio: aspectRatio.replace(':', ' / '),
                width:
                  aspectRatio === '9:16'
                    ? 'min(100%, 420px)'
                    : aspectRatio === '2:3'
                      ? 'min(100%, 540px)'
                      : aspectRatio === '3:4' || aspectRatio === '4:5'
                        ? 'min(100%, 600px)'
                        : aspectRatio === '1:1'
                          ? 'min(100%, 720px)'
                          : '100%',
              }}
            >
              {draft.sceneUrl ? (
                <img
                  src={mediaPreviewUrl(draft.sceneUrl, 'image')}
                  alt={t('director2d.stage.sceneReferenceAlt', '场景参考')}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-80"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white/40">
                  <span>
                    <ImageIcon className="mr-2 inline h-5 w-5" />
                    {draft.subjects.length > 0
                      ? t('director2d.stage.sceneOptional', '场景图可选；人物站位仍可直接使用')
                      : t('director2d.stage.selectCharacter', '请先从左侧加入至少一名人物')}
                  </span>
                </div>
              )}
              <div
                className="pointer-events-none absolute inset-0 z-[1] grid grid-cols-3 grid-rows-3"
                aria-hidden="true"
              >
                {Array.from({ length: 9 }, (_, index) => (
                  <span key={index} className="border border-white/[0.07]" />
                ))}
              </div>
              {draft.sceneObjects.map((object) => (
                <button
                  key={object.id}
                  type="button"
                  data-selected={selection?.kind === 'object' && selection.id === object.id}
                  onPointerDown={(event) => startDrag(event, { kind: 'object', id: object.id })}
                  onPointerMove={moveDrag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  className={`director-stage-object absolute z-10 cursor-grab rounded-lg border bg-amber-400/20 px-3 py-2 text-sm text-amber-50 shadow-lg active:cursor-grabbing ${selection?.kind === 'object' && selection.id === object.id ? 'border-amber-100' : 'border-amber-300'}`}
                  style={{
                    left: `${object.x}%`,
                    top: `${object.y}%`,
                    transform: `translate(-50%, -50%) scale(${object.scale / 100})`,
                    zIndex: 10 + Math.round(object.y),
                  }}
                >
                  <Box className="mr-1.5 inline h-4 w-4" />
                  {object.label}
                </button>
              ))}
              {(draft.backgroundActors ?? []).map((actor, index) => (
                <button
                  key={actor.id}
                  type="button"
                  onPointerDown={(event) => startDrag(event, { kind: 'background', id: actor.id })}
                  onPointerMove={moveDrag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  className={`absolute cursor-grab text-center active:cursor-grabbing ${selection?.kind === 'background' && selection.id === actor.id ? 'drop-shadow-[0_0_12px_rgba(226,232,240,.8)]' : ''}`}
                  style={{
                    left: `${actor.x}%`,
                    top: `${actor.y}%`,
                    height: `${figureHeightPercent(actor.scale)}%`,
                    aspectRatio: '1 / 2',
                    transform: 'translate(-50%, -100%)',
                    zIndex: 20 + Math.round(actor.y),
                  }}
                >
                  <span className="flex h-full w-full items-center justify-center rounded-t-full bg-slate-200/80 shadow-lg">
                    <UsersRound className="h-1/2 w-1/2 text-slate-800" />
                  </span>
                  <span className="absolute left-1/2 top-full mt-1 block -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-1 text-xs text-slate-100">
                    {t('director2d.marker.extra', '群演 {index} · {label}', {
                      index: index + 1,
                      label: actor.label,
                    })}
                  </span>
                </button>
              ))}
              {draft.subjects.map((subject, index) => {
                const color = COLORS[index % COLORS.length] ?? '#38bdf8';
                const selected = selection?.kind === 'subject' && selection.id === subject.id;
                const frameStyle = directorSubjectFrameStyle(subject.frameShape);
                return (
                  <button
                    key={subject.id}
                    type="button"
                    onPointerDown={(event) => startDrag(event, { kind: 'subject', id: subject.id })}
                    onPointerMove={moveDrag}
                    onPointerUp={stopDrag}
                    onPointerCancel={stopDrag}
                    className={`absolute cursor-grab text-center active:cursor-grabbing ${selected ? 'drop-shadow-[0_0_14px_rgba(125,211,252,.9)]' : ''}`}
                    style={{
                      left: `${subject.x}%`,
                      top: `${subject.y}%`,
                      height: `${figureHeightPercent(subject.scale)}%`,
                      aspectRatio: '1 / 2',
                      transform: 'translate(-50%, -100%)',
                      zIndex: 30 + Math.round(subject.y),
                    }}
                  >
                    <span className="relative block h-full w-full overflow-visible">
                      <span
                        className="absolute inset-0 shadow-lg"
                        style={{ ...frameStyle, backgroundColor: color }}
                      >
                        <span
                          className="absolute inset-[2px] overflow-hidden bg-black/40"
                          style={frameStyle}
                        >
                          <img
                            src={mediaPreviewUrl(subject.imageUrl, 'image')}
                            alt=""
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-cover opacity-90"
                          />
                        </span>
                      </span>
                      <ArrowUpRight
                        className="absolute -top-4 h-8 w-8 text-white drop-shadow"
                        style={{ transform: `rotate(${subject.bodyAngle - 45}deg)` }}
                      />
                      <span
                        className="absolute -bottom-2 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full text-[9px] font-black text-black shadow"
                        style={{ backgroundColor: color }}
                      >
                        {flatDirectorSubjectCode(index)}
                      </span>
                    </span>
                    <span className="absolute left-1/2 top-full mt-2 block -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2.5 py-1 text-xs font-medium text-white">
                      {flatDirectorSubjectCode(index)} · {subject.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-center text-xs text-white/40">
              {t(
                'director2d.stage.clickHint',
                '人物坐标以脚底为锚点。可拖动，也可先选中人物后点击画面快速放置。',
              )}
            </p>
            <label className="mt-6 block text-sm font-medium text-white/70">
              {t('director2d.storyboard.description', '分镜画面描述')}
              <textarea
                value={draft.prompt}
                onChange={(event) => patchScene({ prompt: event.target.value })}
                placeholder={t(
                  'director2d.storyboard.placeholder',
                  '例：女主站在咖啡吧台左侧，背对镜头看向咖啡师；这是商业故事板第 3 格。',
                )}
                className="director-settings-input mt-2 h-24 w-full resize-none border p-3 text-sm text-white outline-none transition"
              />
            </label>
          </div>
        </section>

        <aside className="director-settings-sidebar overflow-y-auto border-l p-4">
          <h2 className="text-base font-semibold">
            {t('director2d.constraints.title', '画面约束')}
          </h2>
          <section className="director-settings-card mt-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="director-accent-text text-sm font-semibold text-amber-100">
                {t('director2d.constraints.sceneSettings', '场景设置')}
              </span>
              {draft.sceneUrl && (
                <button
                  type="button"
                  onClick={() =>
                    patchScene({ sceneSourceId: undefined, sceneUrl: undefined, sceneName: '' })
                  }
                  className="text-xs text-white/45 hover:text-white"
                >
                  {t('director2d.constraints.clearScene', '清除场景图')}
                </button>
              )}
            </div>
            <label className="mt-3 block text-sm text-white/65">
              {t('director2d.constraints.sceneName', 'AI 可理解的场景名称')}
              <input
                value={draft.sceneName}
                onChange={(event) => patchScene({ sceneName: event.target.value })}
                placeholder={t(
                  'director2d.constraints.sceneNamePlaceholder',
                  '如：高中教室、夜晚停车场',
                )}
                className="director-settings-input mt-1.5 h-10 w-full border px-3 text-sm text-white outline-none"
              />
              <span className="mt-1 block text-xs text-white/40">
                {t(
                  'director2d.constraints.sceneNameHelp',
                  '文件名只用于左侧辨认；生成提示使用这里的语义名称。',
                )}
              </span>
            </label>
          </section>
          {selectedSubject && (
            <section className="director-settings-card mt-4 rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-sky-100">
                  {t('director2d.constraints.mainCharacter', '主要人物')}
                </span>
                <span className="text-xs text-sky-100/60">
                  {t('director.common.draggable', '可拖动')}
                </span>
              </div>
              <label className="block text-sm text-white/65">
                {t('director2d.constraints.characterName', '人物名称')}
                <input
                  value={selectedSubject.label}
                  onChange={(event) =>
                    patchSubject(selectedSubject.id, { label: event.target.value })
                  }
                  className="director-settings-input mt-1.5 h-10 w-full border px-3 text-sm text-white outline-none"
                />
              </label>
              <div className="mt-4 text-sm text-white/65">
                {t('director2d.subject.quickPosition', '快速站位')}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {POSITION_PRESETS.map((preset) => {
                  const active =
                    Math.abs(selectedSubject.x - preset.x) < 2 &&
                    Math.abs(selectedSubject.y - preset.y) < 2;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        patchSubject(selectedSubject.id, {
                          x: preset.x,
                          y: preset.y,
                          depth: preset.y,
                        });
                        setOperationNotice('');
                      }}
                      className={`rounded-md border px-1 py-1.5 text-[11px] ${active ? 'border-sky-300/60 bg-sky-300/15 text-sky-100' : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'}`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-sm text-white/65">
                {t('director2d.subject.frameShape', '人物边框形状')}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {DIRECTOR_SUBJECT_FRAME_SHAPES.map((shape) => {
                  const active =
                    normalizeDirectorSubjectFrameShape(selectedSubject.frameShape) === shape;
                  const shapeStyle = directorSubjectFrameStyle(shape);
                  return (
                    <button
                      key={shape}
                      type="button"
                      aria-pressed={active}
                      onClick={() => patchSubject(selectedSubject.id, { frameShape: shape })}
                      className={`flex min-h-14 items-center gap-2 rounded-lg border px-2 py-2 text-[11px] transition ${active ? 'border-sky-300/60 bg-sky-300/15 text-sky-100' : 'border-white/10 text-white/55 hover:border-white/25 hover:text-white/80'}`}
                    >
                      <span
                        className="relative h-9 w-5 shrink-0 bg-sky-300"
                        style={shapeStyle}
                        aria-hidden="true"
                      >
                        <span className="absolute inset-[2px] bg-[#1a2230]" style={shapeStyle} />
                      </span>
                      <span>{t(FRAME_SHAPE_KEYS[shape], FRAME_SHAPE_LABELS[shape])}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-sm text-white/65">
                {t('director2d.subject.bodyFacing', '身体朝向（硬约束）')}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(Object.keys(DIRECTOR_BODY_FACING_LABELS) as DirectorBodyFacing[]).map(
                  (facing) => (
                    <button
                      key={facing}
                      type="button"
                      onClick={() =>
                        patchSubject(selectedSubject.id, {
                          bodyFacing: facing,
                          bodyAngle: DIRECTOR_BODY_FACING_ANGLES[facing],
                        })
                      }
                      className={`rounded-lg px-2 py-2 text-xs ${selectedSubject.bodyFacing === facing ? 'director-settings-action-primary director-settings-segment--selected font-semibold' : 'director-settings-action text-white/70'}`}
                    >
                      {t(BODY_FACING_KEYS[facing], DIRECTOR_BODY_FACING_LABELS[facing])}
                    </button>
                  ),
                )}
              </div>
              <label className="mt-4 block text-sm text-white/65">
                {t('director2d.subject.bodyTarget', '身体面向目标（可选）')}
                <input
                  value={selectedSubject.bodyTarget}
                  onChange={(event) =>
                    patchSubject(selectedSubject.id, { bodyTarget: event.target.value })
                  }
                  placeholder={t(
                    'director2d.subject.bodyTargetPlaceholder',
                    '例：黑板、咖啡师、画面右侧出口',
                  )}
                  className="director-settings-input mt-1.5 h-10 w-full border px-3 text-sm text-white outline-none"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.subject.horizontal', '左右位置 {value}%', {
                  value: Math.round(selectedSubject.x),
                })}
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={selectedSubject.x}
                  onChange={(event) =>
                    patchSubject(selectedSubject.id, { x: Number(event.target.value) })
                  }
                  className="mt-2 w-full accent-sky-300"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.subject.depth', '前后层级 {value}%', {
                  value: Math.round(selectedSubject.y),
                })}
                <input
                  type="range"
                  min={10}
                  max={92}
                  value={selectedSubject.y}
                  onChange={(event) =>
                    patchSubject(selectedSubject.id, {
                      y: Number(event.target.value),
                      depth: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full accent-sky-300"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.subject.size', '人物大小 {value}%', {
                  value: Math.round(selectedSubject.scale),
                })}
                <input
                  type="range"
                  min={30}
                  max={300}
                  value={selectedSubject.scale}
                  onChange={(event) =>
                    patchSubject(selectedSubject.id, { scale: Number(event.target.value) })
                  }
                  className="mt-2 w-full accent-[#eabf35]"
                />
                <span className="mt-1 block text-xs text-white/40">
                  {t(
                    'director2d.subject.sizeHelp',
                    '调整后会同步到画布预览、控制图和图片生成约束。',
                  )}
                </span>
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.subject.action', '静态动作')}
                <textarea
                  value={selectedSubject.action}
                  onChange={(event) =>
                    patchSubject(selectedSubject.id, { action: event.target.value })
                  }
                  placeholder={t('director2d.subject.actionPlaceholder', '例：双手扶在吧台边缘')}
                  className="director-settings-input mt-1.5 h-16 w-full resize-none border p-2 text-sm text-white outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => removeSubject(selectedSubject.id)}
                className="mt-4 w-full rounded-lg border border-red-300/25 py-2 text-sm text-red-100/80"
              >
                <Trash2 className="mr-1 inline h-4 w-4" />
                {t('director2d.constraints.removeMainCharacter', '移除主要人物')}
              </button>
            </section>
          )}
          {selectedBackgroundActor && (
            <section className="director-settings-card mt-4 rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">
                  {t('director2d.constraints.extraPosition', '群演位置')}
                </span>
                <span className="text-xs text-slate-200/60">
                  {t('director2d.constraints.extraNoIdentity', '不占用身份图')}
                </span>
              </div>
              <label className="block text-sm text-white/65">
                {t('director2d.constraints.markerName', '标记名称')}
                <input
                  value={selectedBackgroundActor.label}
                  onChange={(event) =>
                    patchBackgroundActor(selectedBackgroundActor.id, { label: event.target.value })
                  }
                  className="director-settings-input mt-1.5 h-10 w-full border px-3 text-sm text-white outline-none"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.extra.horizontal', '左右位置 {value}%', {
                  value: Math.round(selectedBackgroundActor.x),
                })}
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={selectedBackgroundActor.x}
                  onChange={(event) =>
                    patchBackgroundActor(selectedBackgroundActor.id, {
                      x: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full accent-slate-200"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.extra.depth', '前后层级 {value}%', {
                  value: Math.round(selectedBackgroundActor.y),
                })}
                <input
                  type="range"
                  min={10}
                  max={92}
                  value={selectedBackgroundActor.y}
                  onChange={(event) =>
                    patchBackgroundActor(selectedBackgroundActor.id, {
                      y: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full accent-slate-200"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.extra.size', '群演大小 {value}%', {
                  value: Math.round(selectedBackgroundActor.scale),
                })}
                <input
                  type="range"
                  min={30}
                  max={300}
                  value={selectedBackgroundActor.scale}
                  onChange={(event) =>
                    patchBackgroundActor(selectedBackgroundActor.id, {
                      scale: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full accent-slate-200"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.extra.behavior', '群演行为')}
                <textarea
                  value={selectedBackgroundActor.description}
                  onChange={(event) =>
                    patchBackgroundActor(selectedBackgroundActor.id, {
                      description: event.target.value,
                    })
                  }
                  placeholder={t(
                    'director2d.extra.behaviorPlaceholder',
                    '例：坐在教室后排，低头写字',
                  )}
                  className="director-settings-input mt-1.5 h-16 w-full resize-none border p-2 text-sm text-white outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setDraft((scene) => ({
                    ...scene,
                    backgroundActors: (scene.backgroundActors ?? []).filter(
                      (actor) => actor.id !== selectedBackgroundActor.id,
                    ),
                  }));
                  setSelection(null);
                }}
                className="mt-4 w-full rounded-lg border border-red-300/25 py-2 text-sm text-red-100/80"
              >
                <Trash2 className="mr-1 inline h-4 w-4" />
                {t('director2d.constraints.removeExtra', '移除群演')}
              </button>
            </section>
          )}
          {selectedObject && (
            <section className="director-settings-card mt-4 rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="director-accent-text text-sm font-semibold text-amber-100">
                  {t('director2d.constraints.fixedObject', '固定场景物品')}
                </span>
                <span className="director-accent-text text-xs text-amber-100/60">
                  {t('director.common.draggable', '可拖动')}
                </span>
              </div>
              <label className="block text-sm text-white/65">
                {t('director2d.constraints.objectName', '物品名称')}
                <input
                  value={selectedObject.label}
                  onChange={(event) =>
                    patchObject(selectedObject.id, { label: event.target.value })
                  }
                  className="director-settings-input mt-1.5 h-10 w-full border px-3 text-sm text-white outline-none"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.constraints.objectType', '物品类型')}
                <select
                  value={selectedObject.kind}
                  onChange={(event) =>
                    patchObject(selectedObject.id, {
                      kind: event.target.value as DirectorSceneObject['kind'],
                    })
                  }
                  className="director-settings-input mt-1.5 h-10 w-full border px-3 text-sm text-white outline-none"
                >
                  <option value="landmark">
                    {t('director2d.object.kind.landmark', '固定结构')}
                  </option>
                  <option value="furniture">{t('director2d.object.kind.furniture', '家具')}</option>
                  <option value="prop">{t('director2d.object.kind.prop', '道具')}</option>
                  <option value="decoration">
                    {t('director2d.object.kind.decoration', '装饰')}
                  </option>
                </select>
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.object.horizontal', '左右位置 {value}%', {
                  value: Math.round(selectedObject.x),
                })}
                <input
                  type="range"
                  min={4}
                  max={96}
                  value={selectedObject.x}
                  onChange={(event) =>
                    patchObject(selectedObject.id, { x: Number(event.target.value) })
                  }
                  className="mt-2 w-full accent-amber-300"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.object.depth', '前后层级 {value}%', {
                  value: Math.round(selectedObject.y),
                })}
                <input
                  type="range"
                  min={10}
                  max={92}
                  value={selectedObject.y}
                  onChange={(event) =>
                    patchObject(selectedObject.id, {
                      y: Number(event.target.value),
                      depth: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full accent-amber-300"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.object.size', '物品大小 {value}%', {
                  value: Math.round(selectedObject.scale),
                })}
                <input
                  type="range"
                  min={40}
                  max={180}
                  value={selectedObject.scale}
                  onChange={(event) =>
                    patchObject(selectedObject.id, { scale: Number(event.target.value) })
                  }
                  className="mt-2 w-full accent-amber-300"
                />
              </label>
              <label className="mt-3 block text-sm text-white/65">
                {t('director2d.object.appearance', '外观与摆放要求')}
                <textarea
                  value={selectedObject.description}
                  onChange={(event) =>
                    patchObject(selectedObject.id, { description: event.target.value })
                  }
                  placeholder={t(
                    'director2d.object.appearancePlaceholder',
                    '例：固定在后墙中央，表面保留少量粉笔字',
                  )}
                  className="director-settings-input mt-1.5 h-20 w-full resize-none border p-2 text-sm text-white outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setDraft((scene) => ({
                    ...scene,
                    sceneObjects: scene.sceneObjects.filter(
                      (object) => object.id !== selectedObject.id,
                    ),
                  }));
                  setSelection(null);
                }}
                className="mt-4 w-full rounded-lg border border-red-300/25 py-2 text-sm text-red-100/80"
              >
                <Trash2 className="mr-1 inline h-4 w-4" />
                {t('director2d.constraints.removeObject', '移除物品')}
              </button>
            </section>
          )}
          {!selectedSubject && !selectedBackgroundActor && !selectedObject && (
            <p className="director-settings-card mt-4 rounded-lg border border-dashed p-4 text-sm leading-relaxed text-white/45">
              {t(
                'director2d.constraints.emptySelection',
                '从左侧加入人物，或点击中央画布上的人物、群演、物品。拖动后，控制图和图片提示词会使用新的位置。',
              )}
            </p>
          )}

          <section className="mt-5 border-t border-[#36363a] pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                {t('director2d.extras.title', '群演 / 背景人物')}
              </h3>
              <button
                type="button"
                onClick={addBackgroundActor}
                className="director-settings-action px-3 py-2 text-xs font-semibold"
              >
                <UsersRound className="mr-1 inline h-4 w-4" />
                {t('director2d.extras.add', '添加群演')}
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              {t(
                'director2d.extras.description',
                '群演没有人物身份图，只记录数量、站位和行为，避免模型把他们误当主角。',
              )}
            </p>
            <div className="mt-3 space-y-2">
              {(draft.backgroundActors ?? []).map((actor, index) => (
                <button
                  key={actor.id}
                  type="button"
                  onClick={() => setSelection({ kind: 'background', id: actor.id })}
                  className={`director-settings-card flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${selection?.kind === 'background' && selection.id === actor.id ? 'director-settings-card--selected text-white' : 'text-white/65'}`}
                >
                  <span>
                    {t('director2d.marker.extra', '群演 {index} · {label}', {
                      index: index + 1,
                      label: actor.label,
                    })}
                  </span>
                  <span className="text-xs text-white/40">
                    {Math.round(actor.x)}%, {Math.round(actor.y)}%
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-[#36363a] pt-5">
            <h3 className="director-accent-text text-sm font-semibold text-amber-100">
              {t('director2d.requiredObjects.title', '必须出现的场景物品')}
            </h3>
            <div className="mt-3 flex gap-2">
              <input
                value={newObject}
                onChange={(event) => setNewObject(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addObject();
                }}
                placeholder={t('director2d.requiredObjects.placeholder', '如：咖啡吧台、门、沙发')}
                className="director-settings-input min-w-0 flex-1 border px-3 text-sm text-white outline-none"
              />
              <button
                type="button"
                onClick={addObject}
                className="director-settings-action-primary px-3"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {draft.sceneObjects.map((object) => (
                <button
                  key={object.id}
                  type="button"
                  onClick={() => setSelection({ kind: 'object', id: object.id })}
                  className={`director-settings-card flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${selection?.kind === 'object' && selection.id === object.id ? 'director-settings-card--selected text-amber-50' : 'text-white/70'}`}
                >
                  <span>
                    <Box className="director-accent-text mr-1.5 inline h-4 w-4 text-amber-200" />
                    {object.label}
                  </span>
                  <span className="text-xs text-white/40">
                    {t('director.common.draggable', '可拖动')}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
