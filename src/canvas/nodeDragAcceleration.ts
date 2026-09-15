export const SHIFT_NODE_DRAG_MULTIPLIER = 3;

export type DragPoint = { x: number; y: number };

export type DragViewport = DragPoint & { zoom: number };

export type NodeDragAccelerationState = {
  rawPosition: DragPoint;
  outputPosition: DragPoint;
};

export function beginNodeDragAcceleration(position: DragPoint): NodeDragAccelerationState {
  return {
    rawPosition: { ...position },
    outputPosition: { ...position },
  };
}

/**
 * Scale the pointer movement that React Flow reports from the current output
 * position. The viewport compensation makes the next raw coordinate catch up
 * with that output, so Shift can be pressed or released without a jump.
 */
export function advanceNodeDragAcceleration(
  state: NodeDragAccelerationState,
  rawPosition: DragPoint,
  shiftPressed: boolean,
): {
  state: NodeDragAccelerationState;
  position: DragPoint;
  viewportCompensation: DragPoint;
} {
  if (rawPosition.x === state.rawPosition.x && rawPosition.y === state.rawPosition.y) {
    return {
      state,
      position: { ...state.outputPosition },
      viewportCompensation: { x: 0, y: 0 },
    };
  }

  const multiplier = shiftPressed ? SHIFT_NODE_DRAG_MULTIPLIER : 1;
  const position = {
    x: state.outputPosition.x + (rawPosition.x - state.outputPosition.x) * multiplier,
    y: state.outputPosition.y + (rawPosition.y - state.outputPosition.y) * multiplier,
  };
  return {
    state: {
      rawPosition: { ...rawPosition },
      outputPosition: position,
    },
    position,
    viewportCompensation: {
      x: position.x - rawPosition.x,
      y: position.y - rawPosition.y,
    },
  };
}

/**
 * Pan the viewport by the inverse of the accelerated movement. The node moves
 * farther in flow coordinates while its grabbed screen point remains under
 * the pointer.
 */
export function compensateViewportForAcceleratedDrag(
  viewport: DragViewport,
  compensation: DragPoint,
): DragViewport {
  return {
    x: viewport.x - compensation.x * viewport.zoom,
    y: viewport.y - compensation.y * viewport.zoom,
    zoom: viewport.zoom,
  };
}
