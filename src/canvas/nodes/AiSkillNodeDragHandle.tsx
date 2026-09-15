import { GripVertical } from 'lucide-react';
import { AI_SKILL_NODE_MIME, serializeAiSkillNodeDrag } from '../../lib/aiSkillDragDrop';
import { useAppTranslation } from '../../i18n/appI18n';

export function AiSkillNodeDragHandle({
  nodeId,
  label,
  prominent = false,
}: {
  nodeId: string;
  label: string;
  prominent?: boolean;
}) {
  const { t } = useAppTranslation();

  return (
    <button
      type="button"
      draggable
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(AI_SKILL_NODE_MIME, serializeAiSkillNodeDrag({ nodeId }));
        event.dataTransfer.setData('text/plain', label);
      }}
      onClick={(event) => event.stopPropagation()}
      className={
        prominent
          ? 'nodrag nopan pointer-events-auto flex h-11 cursor-grab items-center gap-2 rounded-xl border border-emerald-300/45 bg-[#17352f]/95 px-4 text-sm font-semibold text-emerald-100 shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-colors hover:border-emerald-200/70 hover:bg-[#1d443b] hover:text-white active:cursor-grabbing'
          : 'nodrag nopan flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-white/45 transition-colors hover:bg-emerald-400/10 hover:text-emerald-200 active:cursor-grabbing'
      }
      aria-label={t('canvasShell.aiSkill.dragNodeAria', '拖动节点「{label}」到 AI SKILL', {
        label,
      })}
      title={t('canvasShell.aiSkill.dragToComposer', '拖到 AI SKILL 指令框')}
    >
      <GripVertical className={prominent ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
      {prominent && <span>{t('canvasShell.aiSkill.drag', '拖到 AI SKILL')}</span>}
    </button>
  );
}
