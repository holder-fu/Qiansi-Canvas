import { GripVertical } from 'lucide-react';
import type { ActionBarDropGroup, ActionBarDropTarget } from './actionBarDragFeedback';

export function ActionBarInsertionMarker({
  target,
  group,
  itemId,
}: {
  target: ActionBarDropTarget | null;
  group: ActionBarDropGroup;
  itemId: string;
}) {
  if (target?.group !== group || target.itemId !== itemId) return null;
  const horizontalClass = target.side === 'before' ? '-left-1.5' : '-right-1.5';
  return (
    <span
      aria-hidden="true"
      data-action-bar-drop-indicator={target.side}
      className={`pointer-events-none absolute top-0 z-40 h-8 w-0.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.95)] ${horizontalClass}`}
    >
      <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-cyan-100 bg-cyan-300" />
      <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-cyan-100 bg-cyan-300" />
    </span>
  );
}

export function ActionBarDragStatus({
  label,
  target,
  primaryLabel,
  overflowLabel,
  idleHint,
}: {
  label: string | null;
  target: ActionBarDropTarget | null;
  primaryLabel: string;
  overflowLabel: string;
  idleHint: string;
}) {
  if (!label) return null;
  const targetLabel =
    target?.group === 'primary'
      ? primaryLabel
      : target?.group === 'overflow'
        ? overflowLabel
        : idleHint;
  return (
    <div
      aria-live="polite"
      data-action-bar-drag-status="true"
      className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 flex h-8 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg border border-cyan-300/45 bg-[#10282b]/95 px-2.5 text-[11px] font-medium text-cyan-50 shadow-[0_10px_26px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    >
      <GripVertical className="h-3.5 w-3.5 text-cyan-300" />
      <span className="max-w-36 truncate">{label}</span>
      <span className="text-cyan-200/75">· {targetLabel}</span>
    </div>
  );
}
