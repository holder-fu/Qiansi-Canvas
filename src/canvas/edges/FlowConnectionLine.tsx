import { useLayoutEffect } from 'react';
import { getBezierPath, type ConnectionLineComponentProps, type Position } from '@xyflow/react';
import { FlowConnectionPreview } from './FlowRibbonLayer';

export type FlowConnectionPathProps = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromPosition: Position;
  toPosition: Position;
};

export function FlowConnectionPath({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: FlowConnectionPathProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
  });

  return (
    <FlowConnectionPreview path={path} fallbackLength={Math.hypot(toX - fromX, toY - fromY)} />
  );
}

type FlowConnectionLineProps = ConnectionLineComponentProps & {
  onPathChange?: (path: FlowConnectionPathProps) => void;
};

export function FlowConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  onPathChange,
}: FlowConnectionLineProps) {
  useLayoutEffect(() => {
    onPathChange?.({ fromX, fromY, toX, toY, fromPosition, toPosition });
  }, [fromPosition, fromX, fromY, onPathChange, toPosition, toX, toY]);

  return (
    <FlowConnectionPath
      fromX={fromX}
      fromY={fromY}
      toX={toX}
      toY={toY}
      fromPosition={fromPosition}
      toPosition={toPosition}
    />
  );
}
