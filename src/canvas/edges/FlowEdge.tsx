import { useCallback, useState } from 'react';
import { BaseEdge, getBezierPath, useStore, type EdgeProps } from '@xyflow/react';
import { useCanvasStore } from '../../store/canvasStore';
import { dockToNodeBorder, type NodeBorderBox } from './edgeDocking';
import { nearestPointOnPath, type EdgePoint } from './edgePointerGeometry';
import { FLOW_EDGE_BASE_COLOR, FlowRibbonLayer } from './FlowRibbonLayer';
import { useAppTranslation } from '../../i18n/appI18n';

const EDGE_HOVER_COLOR = 'rgba(238, 244, 252, 0.98)';

export function FlowEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const { t } = useAppTranslation();
  const zoom = useStore((s) => s.transform[2]);
  const nodeLookup = useStore((s) => s.nodeLookup);

  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  // React Flow updates the existing nodeLookup map during a drag. Do not memoize
  // these boxes by map reference: that would keep using the node's old location
  // after its Handle props have already moved.
  const sourceNode = nodeLookup.get(source);
  const sourceAbsolute = sourceNode?.internals.positionAbsolute;
  const sourceMeasured = sourceNode?.measured;
  const sourceBorder: NodeBorderBox | undefined =
    sourceAbsolute && sourceMeasured?.width && sourceMeasured.height
      ? {
          x: sourceAbsolute.x,
          y: sourceAbsolute.y,
          width: sourceMeasured.width,
          height: sourceMeasured.height,
        }
      : undefined;
  const targetNode = nodeLookup.get(target);
  const targetAbsolute = targetNode?.internals.positionAbsolute;
  const targetMeasured = targetNode?.measured;
  const targetBorder: NodeBorderBox | undefined =
    targetAbsolute && targetMeasured?.width && targetMeasured.height
      ? {
          x: targetAbsolute.x,
          y: targetAbsolute.y,
          width: targetMeasured.width,
          height: targetMeasured.height,
        }
      : undefined;

  // The + may rest outside the node and move magnetically. Committed lines
  // never follow that visual affordance: they always dock at the node border.
  const dockedSource = dockToNodeBorder(
    { x: sourceX, y: sourceY },
    sourcePosition,
    zoom,
    sourceBorder,
  );
  const dockedTarget = dockToNodeBorder(
    { x: targetX, y: targetY },
    targetPosition,
    zoom,
    targetBorder,
  );
  const [edgePath] = getBezierPath({
    sourceX: dockedSource.x,
    sourceY: dockedSource.y,
    targetX: dockedTarget.x,
    targetY: dockedTarget.y,
    sourcePosition,
    targetPosition,
  });
  const edgeChordLength = Math.max(
    1,
    Math.hypot(dockedTarget.x - dockedSource.x, dockedTarget.y - dockedSource.y),
  );
  const [scissorPoint, setScissorPoint] = useState<EdgePoint | null>(null);
  const hovered = scissorPoint !== null;
  const sourceSelected = selectedNodeId === source;
  const targetSelected = selectedNodeId === target;
  const flowing = selected || sourceSelected || targetSelected;
  const highlighted = hovered || selected;

  const onCut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteEdge(id);
    },
    [deleteEdge, id],
  );

  const updateScissorPoint = useCallback((event: React.PointerEvent<SVGPathElement>) => {
    const path = event.currentTarget;
    const svg = path.ownerSVGElement;
    const screenMatrix = path.getScreenCTM();
    if (!svg || !screenMatrix || typeof path.getTotalLength !== 'function') return;
    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const localPointer = pointer.matrixTransform(screenMatrix.inverse());
    const nearest = nearestPointOnPath(localPointer, path.getTotalLength(), (length) =>
      path.getPointAtLength(length),
    );
    setScissorPoint((current) =>
      current && Math.hypot(current.x - nearest.x, current.y - nearest.y) < 0.2 ? current : nearest,
    );
  }, []);

  return (
    <>
      {/* Calm neutral structure line: type colours are reserved for node content,
          so dense graphs stay readable like the commercial reference. */}
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={0}
        style={{
          stroke: highlighted ? EDGE_HOVER_COLOR : FLOW_EDGE_BASE_COLOR,
          strokeOpacity: highlighted ? 1 : 0.82,
          strokeWidth: hovered ? 2.2 : selected ? 1.65 : 1.35,
          pointerEvents: 'none',
          transition: 'stroke 120ms ease, stroke-opacity 120ms ease, stroke-width 120ms ease',
        }}
      />
      {/* The reference is one continuous path-relative brightness ramp. Sixteen
          adjacent butt-capped slices form the tail; a synchronized zero-length
          round dash supplies the head. Every loop moves exactly one pitch, so
          the repeated frame is identical and can never jump at the reset. */}
      {flowing && (
        <g className="flow-edge-motion" style={{ pointerEvents: 'none' }}>
          <FlowRibbonLayer path={edgePath} fallbackLength={edgeChordLength} />
        </g>
      )}
      {/* invisible hit area for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={36}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onPointerEnter={updateScissorPoint}
        onPointerMove={updateScissorPoint}
        onPointerLeave={() => setScissorPoint(null)}
        onClick={onCut}
      >
        <title>{t('canvasShell.edge.cutAtPointer', '点击当前位置剪断连线')}</title>
      </path>

      {/* The scissors follows the pointer but never steals its click. */}
      {scissorPoint && (
        <g
          transform={`translate(${scissorPoint.x}, ${scissorPoint.y})`}
          style={{ pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <circle r={11} fill="rgba(34,19,24,0.96)" stroke="rgba(244,63,94,0.72)" />
          <g
            stroke="rgba(251,113,133,1)"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <circle cx="-3.5" cy="-3.5" r="2" />
            <circle cx="-3.5" cy="3.5" r="2" />
            <path d="M-2.2 -2.2 L3.5 3.5" />
            <path d="M-2.2 2.2 L7 -6" />
          </g>
        </g>
      )}
    </>
  );
}
