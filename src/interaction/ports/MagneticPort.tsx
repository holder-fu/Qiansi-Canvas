import { Handle, Position, useStore, type HandleProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { PortDef } from '../../graph/types';
import { useAppTranslation } from '../../i18n/appI18n';
import { useMagneticPort } from './useMagneticPort';
import { PORT_HIT_SIZE, PORT_REST_OFFSET, PORT_SIZE } from './portConstants';
import { isConnectionDestinationPort } from './portMagnet';

type PortHandleStyle = CSSProperties & {
  '--magnetic-port-border-width': string;
  '--magnetic-port-hit-inset': string;
  '--magnetic-port-plus-size': string;
};

interface Props extends HandleProps {
  nodeRef: React.RefObject<HTMLElement | null>;
  port: PortDef;
  /** Position along its edge, as a 0–1 ratio. */
  offset?: number;
  /** Whether the visible source port should be active (usually `selected`). */
  enabled?: boolean;
  /** Input anchors remain in the graph but do not render a visible + button. */
  visible?: boolean;
  /** This target belongs to the single collapsed + that represents all typed inputs. */
  aggregateInput?: boolean;
  zoom: number;
}

/**
 * A real React Flow Handle styled as the visible + button.
 *
 * It deliberately is not a separate proxy: React Flow must receive the user's
 * original pointer sequence to keep pointer capture and drag-to-connect intact.
 */
export function MagneticPort({
  nodeRef,
  port,
  offset = 0.5,
  enabled = true,
  visible = true,
  aggregateInput = false,
  zoom,
  ...handleProps
}: Props) {
  const { t } = useAppTranslation();
  const position =
    handleProps.position ?? (port.direction === 'in' ? Position.Left : Position.Right);
  const handleId = handleProps.id ?? port.id;
  const nodesConnectable = useStore((state) => state.nodesConnectable);
  const connectionFromType = useStore((state) =>
    state.connection.inProgress
      ? state.connection.fromHandle.type
      : (state.connectionClickStartHandle?.type ?? null),
  );
  const isConnectionDestination = isConnectionDestinationPort(port.direction, connectionFromType);
  const interactive = nodesConnectable && visible && (enabled || isConnectionDestination);
  // The node itself is transformed by React Flow's zoom. Counter-scale every
  // visible port measurement so the circle and its pseudo-element + stay one
  // screen size and, crucially, share the same centre at every zoom level.
  const safeZoom = Math.max(zoom, 0.01);
  const size = visible ? PORT_SIZE / safeZoom : 0;
  // The + rests just outside the border and is pulled toward the cursor. Edge
  // rendering independently docks committed lines to the node border.
  const magnet = useMagneticPort({
    nodeRef,
    position,
    offset,
    outsideOffsetPx: visible ? PORT_REST_OFFSET : 0,
    enabled: interactive,
    zoom,
  });
  const flowOffsetX = magnet.offsetX / safeZoom;
  const flowOffsetY = magnet.offsetY / safeZoom;
  const restOffset = visible ? PORT_REST_OFFSET / safeZoom : 0;
  const baseTransform =
    position === Position.Left
      ? `translate(calc(-50% - ${restOffset}px), -50%)`
      : position === Position.Right
        ? `translate(calc(50% + ${restOffset}px), -50%)`
        : position === Position.Top
          ? `translate(-50%, calc(-50% - ${restOffset}px))`
          : `translate(-50%, calc(50% + ${restOffset}px))`;
  const handleStyle: PortHandleStyle = {
    ...handleProps.style,
    ...(position === Position.Left || position === Position.Right
      ? { top: `${offset * 100}%` }
      : { left: `${offset * 100}%` }),
    width: size,
    minWidth: size,
    height: size,
    minHeight: size,
    opacity: visible && (enabled || (isConnectionDestination && magnet.visible)) ? 1 : 0,
    pointerEvents: interactive ? 'auto' : 'none',
    // Ports are navigation controls, not asset-type badges. A neutral, dark
    // ring keeps them quiet until hover/connection interaction needs attention.
    background: visible ? '#12151b' : 'transparent',
    borderColor: visible ? 'rgba(205, 216, 230, 0.62)' : 'transparent',
    '--magnetic-port-border-width': `${1 / safeZoom}px`,
    '--magnetic-port-hit-inset': `${(PORT_SIZE - PORT_HIT_SIZE) / 2 / safeZoom}px`,
    '--magnetic-port-plus-size': `${15 / safeZoom}px`,
    transform: `${baseTransform} translate(${flowOffsetX}px, ${flowOffsetY}px) scale(${magnet.scale})`,
    transition:
      magnet.state === 'idle'
        ? 'opacity 0.15s ease, transform 0.2s cubic-bezier(0.175,0.885,0.32,1.275)'
        : 'opacity 0.08s ease, transform 0.05s linear',
  };

  return (
    <Handle
      {...handleProps}
      isConnectable={nodesConnectable && handleProps.isConnectable !== false}
      isConnectableStart={nodesConnectable && handleProps.isConnectableStart !== false}
      isConnectableEnd={nodesConnectable && handleProps.isConnectableEnd !== false}
      id={handleId}
      position={position}
      style={handleStyle}
      className={visible ? 'magnetic-real-handle' : 'magnetic-hidden-handle'}
      data-qiansi-aggregate-input={aggregateInput ? 'true' : undefined}
      title={visible ? t('canvasShell.port.dragToConnect', '拖动以连接节点') : undefined}
    />
  );
}
