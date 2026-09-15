import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  useReactFlow,
  useNodesInitialized,
  useKeyPress,
  useStore,
  Position,
  SelectionMode,
  Background,
  BackgroundVariant,
  MiniMap,
  type OnSelectionChangeParams,
  type Node,
  type Edge,
  type Connection,
  type OnConnectEnd,
  type OnConnectStart,
  type ConnectionLineComponentProps,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react';
import type { FlowEdge as FlowEdgeData, FlowNode, NodeKind } from './nodeTypes';
import '@xyflow/react/dist/style.css';
import { useCanvasStore, _setInteracting } from '../store/canvasStore';
import { CANVAS_NODE_TYPES } from './nodeRendererRegistry';
import { FlowEdge } from './edges/FlowEdge';
import {
  FlowConnectionLine,
  FlowConnectionPath,
  type FlowConnectionPathProps,
} from './edges/FlowConnectionLine';
import {
  CanvasContextMenu,
  type MenuState,
  type PendingConnection,
} from '../components/CanvasContextMenu';
import { NODE_W, NODE_H } from './constants';
import { SelectionOverlay } from './SelectionOverlay';
import { AlignmentGuides } from './AlignmentGuides';
import { FloatingAIComposer } from '../composer/FloatingAIComposer';
import { calculateSnap, type Guide } from './snap';
import {
  isValidConnection as isGraphConnectionValid,
  resolveConnectionPorts,
} from '../graph/graph';
import { PORT_REST_OFFSET } from '../interaction/ports/portConstants';
import {
  connectionRadiusForZoom,
  resolveGestureConnection,
  resolveNodeBodyConnection,
  type ActiveConnectionGesture,
} from '../interaction/ports/connectionGesture';
import { resolveContextMenuNodeIds } from '../lib/multiNodeGeneration';
import {
  AI_SKILL_IMAGE_MIME,
  AI_SKILL_NODE_DROP_EVENT,
  AI_SKILL_PROMPT_DROP_SELECTOR,
  parseAiSkillImageDrag,
} from '../lib/aiSkillDragDrop';
import { useCanvasPreferences } from '../store/canvasPreferences';
import { resolveCanvasTheme, useCanvasThemeStore } from '../store/canvasThemeStore';
import { useAppTranslation } from '../i18n/appI18n';
import { connectedNodePosition } from './connectedNodePlacement';
import { viewportStableGridMetrics } from './gridBackground';
import { NodeSelectionControlsProvider } from './nodes/nodeSelectionControls';
import { countSelectedNodes } from './nodes/nodeSelectionState';
import { createRenderedNodeProjector } from './renderedNodes';
import {
  nodeSelectionRect,
  pointInsideSelectionBounds,
  selectionBounds,
} from './selectionGeometry';
import {
  selectedNodeIdAtContextTarget,
  shouldCaptureSelectionContextMenu,
} from './selectionContextMenu';
import {
  advanceNodeDragAcceleration,
  beginNodeDragAcceleration,
  compensateViewportForAcceleratedDrag,
  type NodeDragAccelerationState,
} from './nodeDragAcceleration';

const edgeTypes = { flow: FlowEdge };
const EDGE_Z_INDEX = 0;
function oppositePosition(position: Position): Position {
  switch (position) {
    case Position.Left:
      return Position.Right;
    case Position.Right:
      return Position.Left;
    case Position.Top:
      return Position.Bottom;
    case Position.Bottom:
      return Position.Top;
  }
}

function clientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function pointInsideElement(
  point: { x: number; y: number },
  element: HTMLElement | null,
): { x: number; y: number } {
  const rect = element?.getBoundingClientRect();
  return { x: point.x - (rect?.left ?? 0), y: point.y - (rect?.top ?? 0) };
}

function pointOutsideElement(
  point: { x: number; y: number },
  element: HTMLElement | null,
): { x: number; y: number } {
  const rect = element?.getBoundingClientRect();
  return { x: point.x + (rect?.left ?? 0), y: point.y + (rect?.top ?? 0) };
}

function handlePositionFromEvent(event: MouseEvent | TouchEvent): Position {
  const target = event.target instanceof Element ? event.target : null;
  const handle = target?.closest('.react-flow__handle');
  if (handle?.classList.contains('react-flow__handle-left')) return Position.Left;
  if (handle?.classList.contains('react-flow__handle-top')) return Position.Top;
  if (handle?.classList.contains('react-flow__handle-bottom')) return Position.Bottom;
  return Position.Right;
}

function nodeIdAt(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
}

function isAggregateInputHandle(
  root: HTMLElement | null,
  nodeId: string | null | undefined,
  handleId: string | null | undefined,
): boolean {
  if (!root || !nodeId) return false;
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '.react-flow__handle.target[data-qiansi-aggregate-input="true"]',
    ),
  ).some(
    (handle) =>
      handle.getAttribute('data-nodeid') === nodeId &&
      handle.getAttribute('data-handleid') === handleId,
  );
}

export function FlowCanvas({
  edgesVisible = true,
  miniMapVisible = false,
}: {
  edgesVisible?: boolean;
  miniMapVisible?: boolean;
}) {
  const { t } = useAppTranslation();
  const workspace = useCanvasStore((s) => s.workspace);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const openModal = useCanvasStore((s) => s.openModal);
  const deleteConfirmOpen = useCanvasStore((s) => s.deleteConfirm !== null);
  const storeOnNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const storeOnConnect = useCanvasStore((s) => s.onConnect);
  const takeSnapshot = useCanvasStore((s) => s.takeSnapshot);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const fitGroupsToChildren = useCanvasStore((s) => s.fitGroupsToChildren);
  const addNode = useCanvasStore((s) => s.addNode);
  const addNodeWithImage = useCanvasStore((s) => s.addNodeWithImage);
  const copyNodeAt = useCanvasStore((s) => s.copyNodeAt);
  const setNodePosition = useCanvasStore((s) => s.setNodePosition);
  const assets = useCanvasStore((s) => s.assets);
  const addAssetToCanvas = useCanvasStore((s) => s.addAssetToCanvas);
  const wheelMode = useCanvasPreferences((state) => state.wheelMode);
  const defaultZoom = useCanvasPreferences((state) => state.defaultZoom);
  const miniMapPosition = useCanvasPreferences((state) => state.miniMapPosition);
  const activeProjectId = useCanvasStore((state) => state.activeProjectId);
  const initialViewportZoom = useCanvasStore((state) => state.initialViewportZoom);
  const customThemes = useCanvasThemeStore((state) => state.customThemes);
  const globalThemeId = useCanvasThemeStore((state) => state.globalThemeId);
  const projectThemeIds = useCanvasThemeStore((state) => state.projectThemeIds);
  const canvasTheme = resolveCanvasTheme(
    { customThemes, globalThemeId, projectThemeIds },
    activeProjectId,
  );
  const deleteShortcutEnabled = useCanvasPreferences((state) => state.deleteShortcutEnabled);
  const snapEnabled = useCanvasStore((s) => s.snapEnabled);
  const setPanelOpen = useCanvasStore((s) => s.setPanelOpen);
  const setReferencePickerTargetId = useCanvasStore((s) => s.setReferencePickerTargetId);
  const setMarkPickerTargetId = useCanvasStore((s) => s.setMarkPickerTargetId);
  const selectedNodeCount = useMemo(() => countSelectedNodes(nodes), [nodes]);
  const [altNodeDragging, setAltNodeDragging] = useState(false);
  const nodeDragging = altNodeDragging || nodes.some((node) => node.dragging);
  const temporaryPanActive = useKeyPress('Space');

  useEffect(
    () => () => {
      _setInteracting(false, 'viewport');
      _setInteracting(false);
    },
    [],
  );

  const { screenToFlowPosition, setViewport, fitView, getZoom, getViewport } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const viewportTransform = useStore((s) => s.transform);
  const gridBackgroundMetrics = viewportStableGridMetrics({
    gap: canvasTheme.tokens.gridGap,
    size: canvasTheme.tokens.gridSize,
    zoom: viewportTransform[2],
  });
  const nodeLookup = useStore((s) => s.nodeLookup);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [snapGuides, setSnapGuides] = useState<Guide[]>([]);
  const [settledConnectionPreview, setSettledConnectionPreview] =
    useState<FlowConnectionPathProps | null>(null);
  const pendingConnectionRef = useRef<ActiveConnectionGesture | null>(null);
  const activeConnectionPreviewRef = useRef<FlowConnectionPathProps | null>(null);
  const suppressPaneClickRef = useRef(false);
  const nodeDragOriginsRef = useRef(new Map<string, { x: number; y: number }>());
  const nodeDragAccelerationRef = useRef(new Map<string, NodeDragAccelerationState>());
  const shiftPressedRef = useRef(false);
  const initializedViewportScopeRef = useRef<string | null>(null);

  useEffect(() => {
    const updateShiftState = (event: KeyboardEvent) => {
      if (event.key === 'Shift') shiftPressedRef.current = event.type === 'keydown';
    };
    const clearShiftState = () => {
      shiftPressedRef.current = false;
    };
    window.addEventListener('keydown', updateShiftState);
    window.addEventListener('keyup', updateShiftState);
    window.addEventListener('blur', clearShiftState);
    return () => {
      window.removeEventListener('keydown', updateShiftState);
      window.removeEventListener('keyup', updateShiftState);
      window.removeEventListener('blur', clearShiftState);
    };
  }, []);

  const captureConnectionPreview = useCallback((path: FlowConnectionPathProps) => {
    activeConnectionPreviewRef.current = path;
  }, []);
  const connectionLineComponent = useCallback(
    (props: ConnectionLineComponentProps) => (
      <FlowConnectionLine {...props} onPathChange={captureConnectionPreview} />
    ),
    [captureConnectionPreview],
  );

  const projectedSettledConnectionPreview = useMemo(() => {
    if (!settledConnectionPreview) return null;
    const [translateX, translateY, zoom] = viewportTransform;
    const sourceNode = menu?.pendingConnection
      ? nodeLookup.get(menu.pendingConnection.source)
      : undefined;
    const sourceAbsolute = sourceNode?.internals.positionAbsolute;
    const sourceWidth = sourceNode?.measured.width;
    const sourceHeight = sourceNode?.measured.height;
    let fromX = settledConnectionPreview.fromX * zoom + translateX;
    let fromY = settledConnectionPreview.fromY * zoom + translateY;

    // Magnetic ports keep their resting offset at a fixed screen distance from
    // the node border. Recompute that visual centre instead of scaling the old
    // offset, otherwise the retained line drifts away from the + after zooming.
    if (sourceAbsolute && sourceWidth && sourceHeight) {
      switch (settledConnectionPreview.fromPosition) {
        case Position.Left:
          fromX = sourceAbsolute.x * zoom + translateX - PORT_REST_OFFSET;
          fromY = (sourceAbsolute.y + sourceHeight / 2) * zoom + translateY;
          break;
        case Position.Right:
          fromX = (sourceAbsolute.x + sourceWidth) * zoom + translateX + PORT_REST_OFFSET;
          fromY = (sourceAbsolute.y + sourceHeight / 2) * zoom + translateY;
          break;
        case Position.Top:
          fromX = (sourceAbsolute.x + sourceWidth / 2) * zoom + translateX;
          fromY = sourceAbsolute.y * zoom + translateY - PORT_REST_OFFSET;
          break;
        case Position.Bottom:
          fromX = (sourceAbsolute.x + sourceWidth / 2) * zoom + translateX;
          fromY = (sourceAbsolute.y + sourceHeight) * zoom + translateY + PORT_REST_OFFSET;
          break;
      }
    }

    return {
      ...settledConnectionPreview,
      fromX,
      fromY,
      toX: settledConnectionPreview.toX * zoom + translateX,
      toY: settledConnectionPreview.toY * zoom + translateY,
    };
  }, [menu?.pendingConnection, nodeLookup, settledConnectionPreview, viewportTransform]);

  const projectRenderedNodes = useMemo(createRenderedNodeProjector, []);
  const renderedNodes = useMemo(() => projectRenderedNodes(nodes), [nodes, projectRenderedNodes]);

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        hidden: !edgesVisible,
        zIndex: EDGE_Z_INDEX,
      })),
    [edges, edgesVisible],
  );

  useEffect(() => {
    const scope = `${activeProjectId}\u0000${workspace}`;
    if (initializedViewportScopeRef.current === scope) return;
    if (nodes.length > 0 && !nodesInitialized) return;

    // React Flow can only calculate reliable bounds after every restored node
    // has been measured. Run once per mounted project/workspace so Bridge
    // saves and ordinary node updates never pull the viewport away again.
    const timer = window.setTimeout(() => {
      if (nodes.length > 0) {
        void fitView({
          padding: 0.3,
          duration: 400,
          ...(initialViewportZoom === null
            ? {}
            : { minZoom: initialViewportZoom, maxZoom: initialViewportZoom }),
        });
      } else {
        void setViewport(
          { x: 0, y: 0, zoom: initialViewportZoom ?? defaultZoom },
          { duration: 300 },
        );
      }
      initializedViewportScopeRef.current = scope;
      if (initialViewportZoom !== null) {
        useCanvasStore.setState({ initialViewportZoom: null });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activeProjectId,
    defaultZoom,
    fitView,
    initialViewportZoom,
    nodes.length,
    nodesInitialized,
    setViewport,
    workspace,
  ]);

  useEffect(() => {
    const cancelPicker = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const state = useCanvasStore.getState();
      if (!state.referencePickerTargetId && !state.markPickerTargetId) return;
      setReferencePickerTargetId(null);
      setMarkPickerTargetId(null);
    };
    window.addEventListener('keydown', cancelPicker);
    return () => window.removeEventListener('keydown', cancelPicker);
  }, [setMarkPickerTargetId, setReferencePickerTargetId]);

  const onSelectionChange = useCallback(
    ({ nodes: sel }: OnSelectionChangeParams) => {
      setSelectedNodeId(sel.length === 1 ? (sel[0]?.id ?? null) : null);
    },
    [setSelectedNodeId],
  );

  const openMultiSelectionContextMenu = useCallback(
    (clientX: number, clientY: number): boolean => {
      const selectedNodes = nodes.filter((node) => node.selected);
      if (selectedNodes.length < 2) return false;
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      const bounds = selectionBounds(
        selectedNodes.map((node) =>
          nodeSelectionRect(node, nodeLookup.get(node.id)?.internals.positionAbsolute),
        ),
      );
      if (!pointInsideSelectionBounds(flow, bounds)) return false;

      setMenu({
        x: clientX,
        y: clientY,
        targetId: selectedNodes[0]?.id,
        targetIds: selectedNodes.map((node) => node.id),
      });
      return true;
    },
    [nodeLookup, nodes, screenToFlowPosition],
  );

  const onCanvasContextMenuCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!shouldCaptureSelectionContextMenu(event.target)) return;
      const targetNodeId = selectedNodeIdAtContextTarget(event.target);
      if (targetNodeId && !nodes.some((node) => node.id === targetNodeId && node.selected)) return;
      if (!openMultiSelectionContextMenu(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [nodes, openMultiSelectionContextMenu],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (openMultiSelectionContextMenu(event.clientX, event.clientY)) return;
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({ x: event.clientX, y: event.clientY, flowX: flow.x, flowY: flow.y });
    },
    [openMultiSelectionContextMenu, screenToFlowPosition],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      const targetIds = resolveContextMenuNodeIds(nodes, node.id);
      setMenu({
        x: e.clientX,
        y: e.clientY,
        targetId: node.id,
        targetIds: targetIds.length > 1 ? targetIds : undefined,
      });
    },
    [nodes],
  );

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id });
  }, []);

  const onPaneClick = useCallback(() => {
    if (suppressPaneClickRef.current) {
      suppressPaneClickRef.current = false;
      return;
    }
    setReferencePickerTargetId(null);
    setMarkPickerTargetId(null);
    setPanelOpen(null);
    setMenu(null);
    setSettledConnectionPreview(null);
  }, [setMarkPickerTargetId, setPanelOpen, setReferencePickerTargetId]);

  const closeContextMenu = useCallback(() => {
    setMenu(null);
    setSettledConnectionPreview(null);
  }, []);

  /**
   * Intercept React Flow position changes to apply alignment snap.
   * When dragged nodes are within threshold of another node's edge/center,
   * we correct the position change before it reaches the store. Guides are
   * rendered from the same snap calculation so they always coincide with the
   * snapped node edge/center.
   */
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const viewportCompensation = { x: 0, y: 0 };
      let hasViewportCompensation = false;
      const acceleratedChanges = changes.map((change) => {
        if (change.type !== 'position' || !change.position) return change;
        const acceleration = nodeDragAccelerationRef.current.get(change.id);
        if (!acceleration) return change;
        const next = advanceNodeDragAcceleration(
          acceleration,
          change.position,
          shiftPressedRef.current,
        );
        nodeDragAccelerationRef.current.set(change.id, next.state);
        if (!hasViewportCompensation) {
          viewportCompensation.x = next.viewportCompensation.x;
          viewportCompensation.y = next.viewportCompensation.y;
          hasViewportCompensation = true;
        }
        return { ...change, position: next.position };
      });
      if (
        hasViewportCompensation &&
        (viewportCompensation.x !== 0 || viewportCompensation.y !== 0)
      ) {
        const viewport = getViewport();
        void setViewport(compensateViewportForAcceleratedDrag(viewport, viewportCompensation), {
          duration: 0,
        });
      }
      const zoom = getZoom();
      const positionChanges = acceleratedChanges.filter(
        (c): c is NodePositionChange => c.type === 'position' && !!c.position,
      );

      if (positionChanges.length === 0 || !snapEnabled) {
        setSnapGuides([]);
        storeOnNodesChange(acceleratedChanges);
        return;
      }

      const draggedIds = new Set(positionChanges.map((c) => c.id));

      // Build the proposed node set after applying the raw position changes.
      const proposedNodes = nodes.map((n) => {
        const change = positionChanges.find((c) => c.id === n.id);
        if (change?.position) {
          return { ...n, position: change.position };
        }
        return n;
      });

      const dragged = proposedNodes.filter((n) => draggedIds.has(n.id));
      const others = proposedNodes.filter((n) => !draggedIds.has(n.id));
      const snap = calculateSnap(dragged, others, zoom);
      setSnapGuides(snap.guides);

      if (!snap.snappedX && !snap.snappedY) {
        storeOnNodesChange(acceleratedChanges);
        return;
      }

      const correctedChanges = acceleratedChanges.map((c) => {
        if (c.type === 'position' && c.position && draggedIds.has(c.id)) {
          return {
            ...c,
            position: {
              x: c.position.x + snap.correctionX,
              y: c.position.y + snap.correctionY,
            },
          };
        }
        return c;
      });

      storeOnNodesChange(correctedChanges);
    },
    [getViewport, getZoom, nodes, setViewport, snapEnabled, storeOnNodesChange],
  );

  // --- Alt+drag copy: live-clone the node under the cursor, transfer the
  // drag to the clone, and leave the original exactly where it was. ---
  const startAltDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!e.altKey || e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Don't hijack clicks on buttons / fields / connection handles.
      if (target.closest('button, input, textarea, [data-no-drag], .react-flow__handle, .nodrag'))
        return;
      const nodeEl = target.closest('.react-flow__node') as HTMLElement | null;
      if (!nodeEl) return;
      const nodeId = nodeEl.getAttribute('data-id');
      if (!nodeId) return;
      const src = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
      if (!src) return;

      // Kill React Flow's own drag on the original — we drive the clone instead.
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const sourcePos = { x: src.position.x, y: src.position.y };
      const startFlowPointer = screenToFlowPosition({ x: startX, y: startY });
      const pointerOffset = {
        x: startFlowPointer.x - sourcePos.x,
        y: startFlowPointer.y - sourcePos.y,
      };
      let acceleratedPosition = beginNodeDragAcceleration(sourcePos);

      let started = false;
      let clonedId: string | null = null;

      const onMove = (ev: PointerEvent) => {
        const rawDx = ev.clientX - startX;
        const rawDy = ev.clientY - startY;
        if (!started) {
          // Require the Alt key AND a small movement threshold before cloning,
          // so an Alt+click misclick never spawns a duplicate.
          if (!ev.altKey) return;
          if (Math.abs(rawDx) <= 3 && Math.abs(rawDy) <= 3) return;
          started = true;
          clonedId = copyNodeAt(nodeId, { x: sourcePos.x, y: sourcePos.y });
          if (clonedId) {
            setAltNodeDragging(true);
            setSelectedNodeId(clonedId);
            document.body.style.cursor = 'copy';
            _setInteracting(true);
          }
        }
        // Alt may be released mid-drag — keep the clone and keep moving it.
        if (started && clonedId) {
          const flowPointer = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
          const nextPosition = advanceNodeDragAcceleration(
            acceleratedPosition,
            {
              x: flowPointer.x - pointerOffset.x,
              y: flowPointer.y - pointerOffset.y,
            },
            ev.shiftKey,
          );
          acceleratedPosition = nextPosition.state;
          setNodePosition(clonedId, nextPosition.position);
          if (
            nextPosition.viewportCompensation.x !== 0 ||
            nextPosition.viewportCompensation.y !== 0
          ) {
            const viewport = getViewport();
            void setViewport(
              compensateViewportForAcceleratedDrag(viewport, nextPosition.viewportCompensation),
              { duration: 0 },
            );
          }
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('blur', onUp);
        setAltNodeDragging(false);
        if (started) {
          document.body.style.cursor = '';
          _setInteracting(false);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('blur', onUp);
    },
    [
      copyNodeAt,
      getViewport,
      screenToFlowPosition,
      setNodePosition,
      setSelectedNodeId,
      setViewport,
      _setInteracting,
    ],
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('application/asset-id') ||
      e.dataTransfer.types.includes(AI_SKILL_IMAGE_MIME)
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const aiSkillImage = parseAiSkillImageDrag(e.dataTransfer.getData(AI_SKILL_IMAGE_MIME));
      if (aiSkillImage) {
        e.preventDefault();
        const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        _setInteracting(true);
        addNodeWithImage(
          'image',
          { x: flow.x - NODE_W / 2, y: flow.y - NODE_H / 2 },
          aiSkillImage.url,
          aiSkillImage.name,
        );
        requestAnimationFrame(() => _setInteracting(false));
        return;
      }
      const assetId = e.dataTransfer.getData('application/asset-id');
      if (!assetId) return;
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      _setInteracting(true);
      addAssetToCanvas(asset.id, { x: flow.x - NODE_W / 2, y: flow.y - NODE_H / 2 });
      // 下一帧释放交互锁，让 persistCanvas 以防抖方式异步执行
      requestAnimationFrame(() => _setInteracting(false));
    },
    [assets, screenToFlowPosition, addAssetToCanvas, addNodeWithImage, _setInteracting],
  );

  const resolveCanvasConnection = useCallback(
    (connection: Connection | FlowEdgeData, connectionNodes: FlowNode[] = nodes) => {
      if (!connection.source || !connection.target) return null;
      return resolveGestureConnection(
        connectionNodes,
        {
          source: connection.source,
          sourceHandle: connection.sourceHandle ?? null,
          target: connection.target,
          targetHandle: connection.targetHandle ?? null,
        },
        isAggregateInputHandle(wrapperRef.current, connection.target, connection.targetHandle),
      );
    },
    [nodes],
  );

  const commitConnection = useCallback(
    (connection: Connection) => {
      // Menu-created nodes are added to the store before React has rendered
      // them, so resolve against the latest graph rather than this render's
      // node snapshot.
      const resolved = resolveCanvasConnection(connection, useCanvasStore.getState().nodes);
      if (resolved) storeOnConnect(resolved);
    },
    [resolveCanvasConnection, storeOnConnect],
  );

  const isValidConnection = useCallback(
    (connection: Connection | FlowEdgeData) => {
      const resolved = resolveCanvasConnection(connection);
      if (!resolved) return false;
      return isGraphConnectionValid(
        nodes,
        edges,
        resolved.source,
        resolved.sourceHandle,
        resolved.target,
        resolved.targetHandle,
      );
    },
    [nodes, edges, resolveCanvasConnection],
  );

  const onConnectStart = useCallback<OnConnectStart>(
    (event, params) => {
      setSettledConnectionPreview(null);
      const startNode = params.nodeId ? nodes.find((node) => node.id === params.nodeId) : undefined;
      const exposesTypedVideoInputs =
        startNode?.data.kind === 'video' && startNode.data.composerParams?.mode === '视频换人物';
      const pending: ActiveConnectionGesture | null = params.nodeId
        ? params.handleType === 'source'
          ? {
              direction: 'forward',
              source: params.nodeId,
              sourceHandle: params.handleId,
            }
          : params.handleType === 'target'
            ? {
                direction: 'reverse',
                target: params.nodeId,
                // Most nodes expose one aggregate + while their typed inputs
                // remain hidden at the same anchor. Resolve the concrete input
                // from the upstream output type when the gesture completes.
                targetHandle: exposesTypedVideoInputs ? params.handleId : null,
              }
            : null
        : null;
      const point = clientPoint(event);
      const localPoint = point ? pointInsideElement(point, wrapperRef.current) : null;
      const fromPosition = handlePositionFromEvent(event);

      pendingConnectionRef.current = pending;
      activeConnectionPreviewRef.current =
        pending && localPoint
          ? {
              fromX: localPoint.x,
              fromY: localPoint.y,
              toX: localPoint.x,
              toY: localPoint.y,
              fromPosition,
              toPosition: oppositePosition(fromPosition),
            }
          : null;
    },
    [nodes],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      const pending = pendingConnectionRef.current;
      const lastPreview = activeConnectionPreviewRef.current;
      pendingConnectionRef.current = null;
      activeConnectionPreviewRef.current = null;
      if (!pending || connectionState.isValid) return;

      const point = clientPoint(event);
      if (!point) return;
      const localPoint = pointInsideElement(point, wrapperRef.current);
      const targetId = connectionState.toNode?.id ?? nodeIdAt(point.x, point.y);

      // Users can drop anywhere on a node body. Resolve its first compatible
      // declared input instead of requiring them to find an invisible target.
      if (targetId) {
        const explicitDropHandle = connectionState.toHandle
          ? {
              type: connectionState.toHandle.type,
              aggregateInput: isAggregateInputHandle(
                wrapperRef.current,
                targetId,
                connectionState.toHandle.id,
              ),
            }
          : null;
        const bodyConnection = resolveNodeBodyConnection(
          nodes,
          edges,
          pending,
          targetId,
          explicitDropHandle,
        );
        if (bodyConnection) {
          commitConnection(bodyConnection);
        }
        // A release associated with an existing node is never an empty-canvas
        // gesture. Invalid, occupied or explicit wrong-side ports cancel cleanly
        // instead of opening the unrelated add-node menu over that node.
        return;
      }

      // The add-node menu currently creates downstream nodes. A reverse drag
      // only targets an existing upstream node, so an empty-canvas release ends
      // cleanly without showing an incompatible downstream menu.
      if (pending.direction === 'reverse') return;

      // No compatible node at the drop point: choose a compatible node type
      // from the existing add-node menu, then connect it automatically.
      const settledPreview =
        (lastPreview ? { ...lastPreview, toX: localPoint.x, toY: localPoint.y } : null) ??
        (connectionState.from && connectionState.to && connectionState.fromPosition
          ? {
              fromX: connectionState.from.x,
              fromY: connectionState.from.y,
              toX: connectionState.to.x,
              toY: connectionState.to.y,
              fromPosition: connectionState.fromPosition,
              toPosition:
                connectionState.toPosition ?? oppositePosition(connectionState.fromPosition),
            }
          : null);
      const flow = screenToFlowPosition(point);
      const sourceFlow = settledPreview
        ? screenToFlowPosition(
            pointOutsideElement(
              { x: settledPreview.fromX, y: settledPreview.fromY },
              wrapperRef.current,
            ),
          )
        : null;
      setSettledConnectionPreview(
        settledPreview && sourceFlow
          ? {
              ...settledPreview,
              fromX: sourceFlow.x,
              fromY: sourceFlow.y,
              toX: flow.x,
              toY: flow.y,
            }
          : null,
      );
      suppressPaneClickRef.current = true;
      const menuPending: PendingConnection = {
        source: pending.source,
        sourceHandle: pending.sourceHandle,
      };
      setMenu({
        x: point.x,
        y: point.y,
        flowX: flow.x,
        flowY: flow.y,
        pendingConnection: menuPending,
      });
      requestAnimationFrame(() => {
        suppressPaneClickRef.current = false;
      });
    },
    [commitConnection, edges, nodes, screenToFlowPosition],
  );

  const addNodeFromMenu = useCallback(
    (kind: NodeKind, x: number, y: number, pending?: PendingConnection) => {
      const sourceNode = pending ? nodeLookup.get(pending.source) : undefined;
      const targetPosition = sourceNode
        ? connectedNodePosition(sourceNode, sourceNode.internals.positionAbsolute)
        : { x, y };
      const targetId = addNode(kind, targetPosition);
      if (!pending) return targetId;

      const current = useCanvasStore.getState();
      const ports = resolveConnectionPorts(
        current.nodes,
        pending.source,
        pending.sourceHandle,
        targetId,
        null,
      );
      if (!ports) return targetId;

      commitConnection({
        source: pending.source,
        sourceHandle: pending.sourceHandle,
        target: targetId,
        targetHandle: ports.target.id,
      });
      return targetId;
    },
    [addNode, commitConnection, nodeLookup],
  );

  return (
    <div
      ref={wrapperRef}
      data-node-dragging={nodeDragging ? 'true' : undefined}
      data-temporary-pan={temporaryPanActive ? 'true' : undefined}
      className="absolute inset-0"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDownCapture={startAltDrag}
      onContextMenuCapture={onCanvasContextMenuCapture}
      onDoubleClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest('[data-image-rename-target="true"]') ||
          target.closest('[data-node-double-click="true"]')
        )
          return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <NodeSelectionControlsProvider selectedCount={selectedNodeCount}>
        <ReactFlow
          nodes={renderedNodes}
          edges={renderedEdges}
          nodeTypes={CANVAS_NODE_TYPES}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={commitConnection}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          connectionRadius={connectionRadiusForZoom(viewportTransform[2])}
          connectionLineComponent={connectionLineComponent}
          onNodeDragStart={(event, node, draggedNodes) => {
            nodeDragOriginsRef.current.set(node.id, { ...node.position });
            nodeDragAccelerationRef.current.clear();
            for (const draggedNode of draggedNodes.length ? draggedNodes : [node]) {
              nodeDragAccelerationRef.current.set(
                draggedNode.id,
                beginNodeDragAcceleration(draggedNode.position),
              );
            }
            shiftPressedRef.current = event.shiftKey;
            takeSnapshot();
            _setInteracting(true);
          }}
          onNodeDragStop={(event, node) => {
            const origin = nodeDragOriginsRef.current.get(node.id);
            nodeDragOriginsRef.current.delete(node.id);
            nodeDragAccelerationRef.current.clear();
            const point = clientPoint(event);
            const promptDropTarget = point
              ? document.elementFromPoint(point.x, point.y)?.closest(AI_SKILL_PROMPT_DROP_SELECTOR)
              : null;
            if (promptDropTarget && origin) {
              setNodePosition(node.id, origin);
              window.dispatchEvent(
                new CustomEvent(AI_SKILL_NODE_DROP_EVENT, { detail: { nodeId: node.id } }),
              );
            } else {
              fitGroupsToChildren();
            }
            setSnapGuides([]);
            _setInteracting(false);
          }}
          onMoveStart={() => _setInteracting(true, 'viewport')}
          onMoveEnd={() => _setInteracting(false, 'viewport')}
          onSelectionChange={onSelectionChange}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={onPaneClick}
          onlyRenderVisibleElements
          zIndexMode="manual"
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          minZoom={0.1}
          maxZoom={5}
          deleteKeyCode={
            deleteShortcutEnabled && openModal === null && !deleteConfirmOpen
              ? ['Backspace', 'Delete']
              : null
          }
          multiSelectionKeyCode={['Control', 'Meta']}
          selectionKeyCode={['Control', 'Meta']}
          selectionMode={SelectionMode.Partial}
          panActivationKeyCode="Space"
          panOnDrag={[0, 1]}
          nodesDraggable={!temporaryPanActive}
          nodesConnectable={!temporaryPanActive}
          elementsSelectable={!temporaryPanActive}
          zoomOnScroll={wheelMode === 'zoom'}
          panOnScroll={wheelMode === 'pan'}
          defaultEdgeOptions={{ type: 'flow' }}
          proOptions={{ hideAttribution: true }}
        >
          {/*
          Layer contract (low → high):
          0 Canvas Background
          1 Grid (React Flow Background, rendered below nodes/edges)
          2 Edges
          3 Nodes
          4 Handles / Selection
          5 Alignment Guides
          6 Floating Toolbar / Context Menu
          Using the built-in Background keeps the grid behind the node layer without
          manual z-index fights. Node surfaces are opaque so dots never bleed through.
        */}
          {canvasTheme.tokens.gridVisible && (
            <Background
              variant={BackgroundVariant.Dots}
              gap={gridBackgroundMetrics.gap}
              size={gridBackgroundMetrics.size}
              color={canvasTheme.tokens.grid}
            />
          )}
          {miniMapVisible && (
            <MiniMap
              position={miniMapPosition === 'bottom-right' ? 'bottom-right' : 'bottom-left'}
              pannable
              zoomable
              ariaLabel={t('canvas.minimap', '画布小地图')}
              nodeColor="#3f3f46"
              nodeStrokeColor="#52525b"
              nodeStrokeWidth={1}
              bgColor="#121214"
              maskColor="rgba(12, 12, 14, 0.46)"
              maskStrokeColor="transparent"
              maskStrokeWidth={0}
              className="!m-0 !rounded-lg !shadow-2xl"
              style={{
                width: 240,
                height: 150,
                left:
                  miniMapPosition === 'bottom-left'
                    ? 16
                    : miniMapPosition === 'bottom-center'
                      ? '50%'
                      : 'auto',
                right: miniMapPosition === 'bottom-right' ? 16 : 'auto',
                bottom: 60,
                transform: miniMapPosition === 'bottom-center' ? 'translateX(-50%)' : undefined,
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            />
          )}
        </ReactFlow>
      </NodeSelectionControlsProvider>

      {projectedSettledConnectionPreview && menu?.pendingConnection && (
        <svg
          className="pointer-events-none absolute inset-0 z-20 overflow-visible"
          width="100%"
          height="100%"
          data-settled-connection-preview="true"
        >
          <FlowConnectionPath {...projectedSettledConnectionPreview} />
        </svg>
      )}

      <CanvasContextMenu menu={menu} onClose={closeContextMenu} onAddNode={addNodeFromMenu} />
      <SelectionOverlay />
      <AlignmentGuides guides={snapGuides} />
      <FloatingAIComposer />
    </div>
  );
}
