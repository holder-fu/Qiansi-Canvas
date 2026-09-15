import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useNodes, useStore, useReactFlow, type XYPosition } from '@xyflow/react';
import { Plus, FileText, Image, Video, Clapperboard, ScrollText } from 'lucide-react';
import { runCanvasHistoryTransaction, useCanvasStore } from '../store/canvasStore';
import type { FlowNode, NodeKind } from './nodeTypes';
import { NODE_W, NODE_H } from './constants';
import { nodeSelectionRect, selectionBounds } from './selectionGeometry';
import { FlowConnectionPreview } from './edges/FlowRibbonLayer';
import {
  CONTEXT_MENU_ITEM_CLASS,
  CONTEXT_MENU_ITEM_CONTENT_CLASS,
  CONTEXT_MENU_ITEM_ICON_CLASS,
  CONTEXT_MENU_SECTION_TITLE_CLASS,
  CONTEXT_MENU_SURFACE_CLASS,
} from '../components/contextMenuStyles';
import { contextMenuViewportPlacement } from '../components/contextMenuPosition';
import {
  batchGenerationLabel,
  batchGenerationTargetIds,
  resolveMultiNodeGenerationTargets,
  runNodeGenerationBatch,
} from '../lib/multiNodeGeneration';
import { useCanvasPreferences } from '../store/canvasPreferences';
import { useAppTranslation } from '../i18n/appI18n';
import {
  resolveSelectionConnectTargetKinds,
  type SelectionConnectTargetKind,
} from '../lib/selectionConnectTargets';
import { isActiveSelectionDragPointer } from './selectionPointerDrag';

const NEXT_ACTIONS: {
  kind: SelectionConnectTargetKind;
  labelKey: string;
  fallback: string;
  icon: React.ElementType;
}[] = [
  { kind: 'text', labelKey: 'selectionOverlay.action.text', fallback: '文本生成', icon: FileText },
  { kind: 'image', labelKey: 'selectionOverlay.action.image', fallback: '图片生成', icon: Image },
  { kind: 'video', labelKey: 'selectionOverlay.action.video', fallback: '视频生成', icon: Video },
  {
    kind: 'video-comp',
    labelKey: 'selectionOverlay.action.videoComp',
    fallback: '视频合成',
    icon: Clapperboard,
  },
  {
    kind: 'script',
    labelKey: 'selectionOverlay.action.script',
    fallback: '脚本生成',
    icon: ScrollText,
  },
];

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export function SelectionOverlay() {
  const { t } = useAppTranslation();
  const nodes = useNodes<FlowNode>();
  const transform = useStore((s) => s.transform);
  const nodeLookup = useStore((s) => s.nodeLookup);
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const generateNode = useCanvasStore((s) => s.generateNode);
  const imageBatchSize = useCanvasPreferences((state) => state.imageBatchSize);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeDragPointerId = dragState?.pointerId ?? null;

  const selected = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selectedIds = useMemo(() => new Set(selected.map((n) => n.id)), [selected]);
  const batchGenerationTargets = useMemo(
    () =>
      resolveMultiNodeGenerationTargets(
        selected,
        selected.map((node) => node.id),
      ),
    [selected],
  );
  const imageBatchTargetIds = useMemo(
    () => batchGenerationTargetIds('image', batchGenerationTargets.imageIds, imageBatchSize),
    [batchGenerationTargets.imageIds, imageBatchSize],
  );
  const availableNextActionKinds = useMemo(
    () => new Set(resolveSelectionConnectTargetKinds(selected)),
    [selected],
  );
  const availableNextActions = useMemo(
    () => NEXT_ACTIONS.filter((action) => availableNextActionKinds.has(action.kind)),
    [availableNextActionKinds],
  );
  const hasBatchGenerationActions =
    batchGenerationTargets.imageIds.length > 0 || batchGenerationTargets.videoIds.length > 0;
  const hasCreateMenuActions = hasBatchGenerationActions || availableNextActions.length > 0;
  const nodeRects = useMemo(() => {
    const map = new Map<string, ReturnType<typeof nodeSelectionRect>>();
    if (selected.length < 2) return map;
    for (const node of nodes) {
      map.set(
        node.id,
        nodeSelectionRect(node, nodeLookup.get(node.id)?.internals.positionAbsolute),
      );
    }
    return map;
  }, [nodes, nodeLookup, selected.length]);

  const box = useMemo(() => {
    if (selected.length < 2) return null;
    return selectionBounds(
      selected.flatMap((node) => {
        const rect = nodeRects.get(node.id);
        return rect ? [rect] : [];
      }),
    );
  }, [selected, nodeRects]);

  const screenBox = useMemo<(XYPosition & { width: number; height: number }) | null>(() => {
    if (!box) return null;
    const [tx, ty, zoom] = transform;
    return {
      x: box.minX * zoom + tx,
      y: box.minY * zoom + ty,
      width: (box.maxX - box.minX) * zoom,
      height: (box.maxY - box.minY) * zoom,
    };
  }, [box, transform]);

  // Compute screen rects for all non-selected nodes to detect drop targets
  const screenRects = useMemo(() => {
    const [tx, ty, zoom] = transform;
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    if (!dragState) return map;
    for (const n of nodes) {
      if (selectedIds.has(n.id)) continue;
      const rect = nodeRects.get(n.id);
      if (!rect) continue;
      map.set(n.id, {
        x: rect.x * zoom + tx,
        y: rect.y * zoom + ty,
        width: rect.width * zoom,
        height: rect.height * zoom,
      });
    }
    return map;
  }, [dragState, nodes, transform, selectedIds, nodeRects]);

  const findTargetAt = useCallback(
    (x: number, y: number) => {
      for (const [id, r] of screenRects) {
        if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
          return id;
        }
      }
      return null;
    },
    [screenRects],
  );

  const plusX = screenBox ? screenBox.x + screenBox.width : 0;
  const plusY = screenBox ? screenBox.y + screenBox.height / 2 : 0;

  // Screen rects for selected nodes (source endpoints)
  const selectedRects = useMemo(() => {
    const [tx, ty, zoom] = transform;
    return selected.flatMap((n) => {
      const rect = nodeRects.get(n.id);
      if (!rect) return [];
      return {
        id: n.id,
        x: rect.x * zoom + tx,
        y: rect.y * zoom + ty,
        w: rect.width * zoom,
        h: rect.height * zoom,
      };
    });
  }, [selected, transform, nodeRects]);

  type Line = {
    id: string;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    cp1x: number;
    cp1y: number;
    cp2x: number;
    cp2y: number;
  };

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      activePointerIdRef.current = e.pointerId;
      setMenuPos(null);
      setDragState({
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
      setHoverTarget(findTargetAt(e.clientX, e.clientY));
    },
    [findTargetAt],
  );

  const handleCreate = useCallback(
    (kind: NodeKind) => {
      if (!box || selected.length < 2 || !menuPos) return;
      const flow = screenToFlowPosition({ x: menuPos.x, y: menuPos.y });
      const newX = flow.x - NODE_W / 2;
      const newY = flow.y - NODE_H / 2;
      runCanvasHistoryTransaction(() => {
        const newId = addNode(kind, { x: newX, y: newY });
        for (const n of selected) {
          onConnect({ source: n.id, target: newId, sourceHandle: null, targetHandle: null });
        }
      });
      setMenuPos(null);
    },
    [box, selected, menuPos, screenToFlowPosition, addNode, onConnect],
  );

  const handleBatchGenerate = useCallback(
    (media: 'image' | 'video', targetIds: string[]) => {
      setMenuPos(null);
      void runNodeGenerationBatch(
        selected,
        targetIds,
        media,
        generateNode,
        useCanvasPreferences.getState(),
      );
    },
    [selected, generateNode],
  );

  useEffect(() => {
    if (activeDragPointerId === null) return;
    const onMove = (e: PointerEvent) => {
      if (!isActiveSelectionDragPointer(activePointerIdRef.current, e.pointerId)) return;
      setDragState((prev) => (prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : prev));
      setHoverTarget(findTargetAt(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      if (!isActiveSelectionDragPointer(activePointerIdRef.current, e.pointerId)) return;
      activePointerIdRef.current = null;
      const targetId = findTargetAt(e.clientX, e.clientY);
      if (targetId) {
        runCanvasHistoryTransaction(() => {
          for (const n of selected) {
            onConnect({ source: n.id, target: targetId, sourceHandle: null, targetHandle: null });
          }
        });
      } else if (hasCreateMenuActions) {
        setMenuPos({ x: e.clientX, y: e.clientY });
      } else {
        setMenuPos(null);
      }
      setDragState(null);
      setHoverTarget(null);
    };
    const onCancel = (e: PointerEvent) => {
      if (!isActiveSelectionDragPointer(activePointerIdRef.current, e.pointerId)) return;
      activePointerIdRef.current = null;
      setDragState(null);
      setHoverTarget(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [activeDragPointerId, selected, findTargetAt, onConnect, hasCreateMenuActions]);

  // Close menus when selection changes or drops below 2
  useEffect(() => {
    if (selected.length < 2) {
      activePointerIdRef.current = null;
      setMenuPos(null);
      setDragState(null);
      setHoverTarget(null);
    }
  }, [selected.length]);

  useEffect(() => {
    if (!menuPos) return;
    const cancelMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuPos(null);
    };
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuPos(null);
    };
    document.addEventListener('pointerdown', cancelMenu, true);
    window.addEventListener('keydown', cancelOnEscape);
    return () => {
      document.removeEventListener('pointerdown', cancelMenu, true);
      window.removeEventListener('keydown', cancelOnEscape);
    };
  }, [menuPos]);

  // Build a flow line from each selected node to the drag handle
  const { handlePos, lines } = useMemo(() => {
    if (!dragState && !menuPos) return { handlePos: null, lines: [] as Line[] };
    let tx: number;
    let ty: number;
    if (dragState && hoverTarget && screenRects.has(hoverTarget)) {
      const r = screenRects.get(hoverTarget)!;
      tx = r.x - 8;
      ty = r.y + r.height / 2;
    } else if (dragState) {
      tx = dragState.currentX;
      ty = dragState.currentY;
    } else {
      tx = menuPos!.x;
      ty = menuPos!.y;
    }
    const list = selectedRects.map((r) => {
      const sx = r.x + r.w;
      const sy = r.y + r.h / 2;
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const offset = Math.min(dist * 0.5, 120);
      return {
        id: r.id,
        sx,
        sy,
        tx,
        ty,
        cp1x: sx + ux * offset,
        cp1y: sy + uy * offset,
        cp2x: tx - ux * offset,
        cp2y: ty - uy * offset,
      };
    });
    return { handlePos: { x: tx, y: ty }, lines: list };
  }, [dragState, menuPos, hoverTarget, screenRects, selectedRects]);

  if (!screenBox) return null;

  const handleX = handlePos ? handlePos.x : plusX;
  const handleY = handlePos ? handlePos.y : plusY;
  const menuPlacement = menuPos
    ? contextMenuViewportPlacement(
        { x: menuPos.x + 8, y: menuPos.y - 12 },
        {
          width: typeof window === 'undefined' ? 1280 : window.innerWidth,
          height: typeof window === 'undefined' ? 720 : window.innerHeight,
        },
      )
    : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Dashed selection box */}
      <div
        className="absolute rounded-xl border border-dashed border-white/40"
        style={{
          left: screenBox.x,
          top: screenBox.y,
          width: screenBox.width,
          height: screenBox.height,
        }}
      />

      {/* Hover highlight around the node being targeted */}
      {hoverTarget && screenRects.has(hoverTarget) && (
        <div
          className="absolute rounded-lg border-2 border-emerald-400/70 bg-emerald-400/10"
          style={{
            left: screenRects.get(hoverTarget)!.x,
            top: screenRects.get(hoverTarget)!.y,
            width: screenRects.get(hoverTarget)!.width,
            height: screenRects.get(hoverTarget)!.height,
          }}
        />
      )}

      {/* Flowing drag lines from each selected node to the handle */}
      {lines.length > 0 && (
        <svg className="absolute inset-0 z-30 overflow-visible" style={{ pointerEvents: 'none' }}>
          {lines.map((line) => {
            const path = `M ${line.sx} ${line.sy} C ${line.cp1x} ${line.cp1y}, ${line.cp2x} ${line.cp2y}, ${line.tx} ${line.ty}`;
            return (
              <FlowConnectionPreview
                key={line.id}
                path={path}
                fallbackLength={Math.hypot(line.tx - line.sx, line.ty - line.sy)}
              />
            );
          })}
        </svg>
      )}

      {/* + button on the right edge */}
      <button
        type="button"
        onPointerDown={startDrag}
        className={`pointer-events-auto absolute z-40 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-[#1a1a1c] text-white/80 shadow-lg transition-colors hover:border-white/50 hover:bg-white/10 hover:text-white ${
          dragState || menuPos ? 'border-emerald-400/70 text-emerald-300' : 'border-white/30'
        }`}
        style={{ left: handleX, top: handleY, touchAction: 'none' }}
        aria-label={t('selectionOverlay.dragReference', '拖拽引用选中节点到目标')}
        title={t('selectionOverlay.dragReference', '拖拽引用选中节点到目标')}
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Create-node menu when dropped on empty canvas */}
      {menuPos && !dragState && (
        <div
          ref={menuRef}
          className={`pointer-events-auto absolute z-50 w-[220px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain ${CONTEXT_MENU_SURFACE_CLASS}`}
          style={{
            left: menuPlacement?.left,
            top: menuPlacement?.top,
            maxHeight: menuPlacement?.maxHeight,
            transform: menuPlacement?.openUpward ? 'translateY(-100%)' : undefined,
          }}
          role="menu"
          aria-label={t('selectionOverlay.selectedNodes', '引用选中的 {count} 个节点', {
            count: selected.length,
          })}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className={CONTEXT_MENU_SECTION_TITLE_CLASS}>
            {t('selectionOverlay.selectedNodes', '引用选中的 {count} 个节点', {
              count: selected.length,
            })}
          </div>
          {hasBatchGenerationActions && (
            <>
              {batchGenerationTargets.imageIds.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleBatchGenerate('image', batchGenerationTargets.imageIds)}
                  disabled={batchGenerationTargets.imageIds.every(
                    (nodeId) =>
                      selected.find((node) => node.id === nodeId)?.data.generating === true,
                  )}
                  className={`${CONTEXT_MENU_ITEM_CLASS} text-white/[0.92] hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:text-white/[0.38]`}
                >
                  <span className={CONTEXT_MENU_ITEM_CONTENT_CLASS}>
                    <span className={CONTEXT_MENU_ITEM_ICON_CLASS}>
                      <Image className="h-3.5 w-3.5 text-emerald-300" />
                    </span>
                    {t(
                      'context.batchGenerateImage',
                      batchGenerationLabel('image', batchGenerationTargets.imageIds.length),
                      { count: batchGenerationTargets.imageIds.length },
                    )}
                    <span className="ml-2 text-[10px] text-white/[0.45]">
                      {t('context.nodeCount', '{count} 个节点', {
                        count: imageBatchTargetIds.length,
                      })}
                    </span>
                  </span>
                </button>
              )}
              {batchGenerationTargets.videoIds.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleBatchGenerate('video', batchGenerationTargets.videoIds)}
                  disabled={batchGenerationTargets.videoIds.every(
                    (nodeId) =>
                      selected.find((node) => node.id === nodeId)?.data.generating === true,
                  )}
                  className={`${CONTEXT_MENU_ITEM_CLASS} text-white/[0.92] hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:text-white/[0.38]`}
                >
                  <span className={CONTEXT_MENU_ITEM_CONTENT_CLASS}>
                    <span className={CONTEXT_MENU_ITEM_ICON_CLASS}>
                      <Video className="h-3.5 w-3.5 text-cyan-300" />
                    </span>
                    {t(
                      'context.batchGenerateVideo',
                      batchGenerationLabel('video', batchGenerationTargets.videoIds.length),
                      { count: batchGenerationTargets.videoIds.length },
                    )}
                    <span className="ml-2 text-[10px] text-white/[0.45]">
                      {t('context.nodeCount', '{count} 个节点', {
                        count: batchGenerationTargets.videoIds.length,
                      })}
                    </span>
                  </span>
                </button>
              )}
              <div className="my-1 h-px bg-white/[0.08]" />
            </>
          )}
          {availableNextActions.map((action) => (
            <button
              key={action.kind}
              type="button"
              role="menuitem"
              onClick={() => handleCreate(action.kind)}
              className={`${CONTEXT_MENU_ITEM_CLASS} text-white/[0.92] hover:bg-white/[0.08] hover:text-white`}
            >
              <span className={CONTEXT_MENU_ITEM_CONTENT_CLASS}>
                <span className={CONTEXT_MENU_ITEM_ICON_CLASS}>
                  <action.icon className="h-3.5 w-3.5" />
                </span>
                {t(action.labelKey, action.fallback)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
