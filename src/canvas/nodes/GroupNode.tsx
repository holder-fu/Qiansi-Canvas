import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Palette, Ungroup } from 'lucide-react';
import type { FlowNode } from '../nodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import { AiSkillNodeDragHandle } from './AiSkillNodeDragHandle';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import { useAppTranslation } from '../../i18n/appI18n';
import { useSingleNodeControls } from './nodeSelectionState';

function GroupNodeBase({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useAppTranslation();
  const showSingleNodeControls = useSingleNodeControls(selected);
  const childCount = useCanvasStore(
    (state) => state.nodes.filter((node) => node.parentId === id).length,
  );
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const takeSnapshot = useCanvasStore((state) => state.takeSnapshot);
  const ungroupNode = useCanvasStore((state) => state.ungroupNode);
  const groupRenameTargetId = useCanvasStore((state) => state.groupRenameTargetId);
  const setGroupRenameTargetId = useCanvasStore((state) => state.setGroupRenameTargetId);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.title || '分组');
  const inputRef = useRef<HTMLInputElement>(null);
  const hasCustomGroupBackground =
    typeof data.groupBackgroundColor === 'string' &&
    /^#[0-9a-f]{6}$/i.test(data.groupBackgroundColor);
  const groupBackgroundColor = hasCustomGroupBackground
    ? (data.groupBackgroundColor as string)
    : '#64748b';
  const displayTitle =
    !data.title || data.title === '分组' ? t('groupNode.defaultTitle', '分组') : String(data.title);

  useEffect(() => {
    if (!editing) setTitleDraft(data.title || '分组');
  }, [data.title, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (groupRenameTargetId !== id) return;
    setEditing(true);
    setGroupRenameTargetId(null);
  }, [groupRenameTargetId, id, setGroupRenameTargetId]);

  const commitTitle = useCallback(() => {
    const nextTitle = titleDraft.trim() || '分组';
    setEditing(false);
    setTitleDraft(nextTitle);
    if (nextTitle === data.title) return;
    takeSnapshot();
    updateNodeData(id, { title: nextTitle });
  }, [data.title, id, takeSnapshot, titleDraft, updateNodeData]);

  return (
    <div
      data-theme-role="group-surface"
      className={`relative h-full w-full rounded-2xl border border-dashed bg-white/[0.02] transition-[border-color,box-shadow] ${
        selected ? SELECTED_NODE_FRAME_CLASS : 'border-white/15'
      }`}
      style={
        hasCustomGroupBackground ? { backgroundColor: `${groupBackgroundColor}26` } : undefined
      }
    >
      <div className="nodrag nowheel absolute -top-9 -left-2 flex h-6 items-center gap-1.5 text-xs text-white/55">
        {editing ? (
          <input
            ref={inputRef}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setTitleDraft(data.title || '分组');
                setEditing(false);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="h-6 w-36 rounded border border-white/20 bg-[#1e1e21] px-1.5 text-xs text-white/85 outline-none focus:border-white/40"
            aria-label={t('groupNode.name', '分组名称')}
          />
        ) : (
          <button
            type="button"
            data-node-double-click="true"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditing(true);
            }}
            className="max-w-52 truncate text-left hover:text-white/80"
            title={t('groupNode.renameHint', '双击修改分组名称')}
          >
            {displayTitle}
          </button>
        )}
        <span className="shrink-0 text-white/35">
          {t('groupNode.nodeCount', '{count} 个节点', { count: childCount })}
        </span>
        {showSingleNodeControls && <AiSkillNodeDragHandle nodeId={id} label={displayTitle} />}
        <label
          className="nodrag nowheel relative flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-white/35 transition-colors hover:bg-white/10 hover:text-white/75 focus-within:ring-1 focus-within:ring-white/35"
          title={t('groupNode.changeColor', '修改分组背景颜色')}
          aria-label={t('groupNode.changeColor', '修改分组背景颜色')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Palette className="h-3.5 w-3.5" />
          <span
            className="absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full border border-black/40"
            style={{ backgroundColor: groupBackgroundColor }}
          />
          <input
            type="color"
            value={groupBackgroundColor}
            onChange={(event) => {
              const color = event.target.value;
              if (color === data.groupBackgroundColor) return;
              takeSnapshot();
              updateNodeData(id, { groupBackgroundColor: color });
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={t('groupNode.selectColor', '选择分组背景颜色')}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          ungroupNode(id);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="nodrag nowheel absolute -top-9 -right-2 flex h-6 items-center gap-1 rounded px-1.5 text-xs text-white/45 transition-colors hover:bg-white/10 hover:text-white/80"
        title={t('groupNode.ungroupHint', '拆解分组并保留节点位置')}
        aria-label={t('groupNode.ungroup', '拆解分组')}
      >
        <Ungroup className="h-3 w-3" />
        {t('groupNode.ungroup', '拆解')}
      </button>
    </div>
  );
}

export const GroupNode = memo(GroupNodeBase);
