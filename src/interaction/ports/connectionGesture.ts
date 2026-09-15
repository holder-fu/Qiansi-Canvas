import type { Connection, HandleType } from '@xyflow/react';
import type { FlowEdge, FlowNode } from '../../canvas/nodeTypes';
import { isValidConnection, resolveConnectionPorts } from '../../graph/graph';

export type ActiveConnectionGesture =
  | {
      direction: 'forward';
      source: string;
      sourceHandle: string | null;
    }
  | {
      direction: 'reverse';
      target: string;
      targetHandle: string | null;
    };

export interface ExplicitDropHandle {
  type: HandleType;
  /** A collapsed input + represents every declared target port, not one typed endpoint. */
  aggregateInput: boolean;
}

/** Keep React Flow's connection search radius constant in screen pixels at every zoom. */
export function connectionRadiusForZoom(zoom: number, screenRadius = 60): number {
  const safeZoom = Number.isFinite(zoom) ? Math.max(zoom, 0.01) : 1;
  return screenRadius / safeZoom;
}

/** Resolve the concrete typed ports represented by a collapsed aggregate input handle. */
export function resolveGestureConnection(
  nodes: FlowNode[],
  connection: Connection,
  aggregateTargetHandle: boolean,
): Connection | null {
  const ports = resolveConnectionPorts(
    nodes,
    connection.source,
    connection.sourceHandle,
    connection.target,
    aggregateTargetHandle ? null : connection.targetHandle,
  );
  if (!ports) return null;
  return {
    source: connection.source,
    sourceHandle: ports.source.id,
    target: connection.target,
    targetHandle: ports.target.id,
  };
}

/** Resolve a connection released anywhere on a compatible node body. */
export function resolveNodeBodyConnection(
  nodes: FlowNode[],
  edges: FlowEdge[],
  pending: ActiveConnectionGesture,
  dropNodeId: string,
  explicitDropHandle: ExplicitDropHandle | null,
): Connection | null {
  // An explicit handle has already expressed the user's intended endpoint.
  // If React Flow rejected it (for example source -> source), do not silently
  // reinterpret the same release as a compatible drop on the node body. The
  // collapsed input + is the exception: it deliberately represents every
  // declared input and therefore must be resolved by asset compatibility.
  if (
    explicitDropHandle &&
    !(
      pending.direction === 'forward' &&
      explicitDropHandle.type === 'target' &&
      explicitDropHandle.aggregateInput
    )
  ) {
    return null;
  }
  const source = pending.direction === 'forward' ? pending.source : dropNodeId;
  const sourceHandle = pending.direction === 'forward' ? pending.sourceHandle : null;
  const target = pending.direction === 'forward' ? dropNodeId : pending.target;
  const targetHandle = pending.direction === 'forward' ? null : pending.targetHandle;
  if (source === target) return null;

  const ports = resolveConnectionPorts(nodes, source, sourceHandle, target, targetHandle);
  if (
    !ports ||
    !isValidConnection(nodes, edges, source, ports.source.id, target, ports.target.id)
  ) {
    return null;
  }
  return {
    source,
    sourceHandle: ports.source.id,
    target,
    targetHandle: ports.target.id,
  };
}
