import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Copy,
  FolderInput,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import type { ProjectFolder, ProjectSummary } from '../../services/projectHub';
import { useAppTranslation } from '../../i18n/appI18n';

interface ProjectCardMenuProps {
  project: ProjectSummary;
  folders: readonly ProjectFolder[];
  canDelete: boolean;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProject: () => void;
  onRename: () => void;
  onChangeCover: () => void;
  onDuplicate: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDelete: () => void;
}

export function ProjectCardMenu({
  project,
  folders,
  canDelete,
  open,
  disabled = false,
  onOpenChange,
  onOpenProject,
  onRename,
  onChangeCover,
  onDuplicate,
  onMoveToFolder,
  onDelete,
}: ProjectCardMenuProps) {
  const { t } = useAppTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setFolderMenuOpen(false);
      return;
    }
    firstItemRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (folderMenuOpen) setFolderMenuOpen(false);
      else onOpenChange(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [folderMenuOpen, onOpenChange, open]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const itemClass =
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-white/72 outline-none transition hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.08] focus:text-white disabled:opacity-40';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={t('projects.menu.openLabel', '打开“{name}”项目菜单', {
          name: project.name,
        })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/38 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-35"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          data-theme-role="popover-surface"
          role="menu"
          aria-label={t('projects.menu.actionsLabel', '{name} 项目操作', {
            name: project.name,
          })}
          className="absolute right-0 top-full z-40 mt-1 w-48 rounded-xl border border-white/[0.1] bg-[#232326] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            ref={firstItemRef}
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => run(onOpenProject)}
          >
            <Play className="h-4 w-4 text-white/42" />
            {t('projects.menu.open', '打开')}
          </button>
          <button role="menuitem" type="button" className={itemClass} onClick={() => run(onRename)}>
            <Pencil className="h-4 w-4 text-white/42" />
            {t('projects.menu.rename', '重命名')}
          </button>
          <button
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => run(onChangeCover)}
          >
            <ImagePlus className="h-4 w-4 text-white/42" />
            {t('projects.menu.cover', '修改封面')}
          </button>
          <button
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => run(onDuplicate)}
          >
            <Copy className="h-4 w-4 text-white/42" />
            {t('projects.menu.duplicate', '创建副本')}
          </button>

          <div className="relative">
            <button
              role="menuitem"
              type="button"
              aria-haspopup="menu"
              aria-expanded={folderMenuOpen}
              className={itemClass}
              onClick={() => setFolderMenuOpen((value) => !value)}
            >
              <FolderInput className="h-4 w-4 text-white/42" />
              <span className="flex-1">{t('projects.menu.move', '移动至文件夹')}</span>
              <ChevronRight className="h-3.5 w-3.5 text-white/32" />
            </button>
            {folderMenuOpen && (
              <div
                data-theme-role="popover-surface"
                role="menu"
                aria-label={t('projects.menu.folderLabel', '选择目标文件夹')}
                className="absolute top-0 right-[calc(100%+0.4rem)] max-h-56 w-44 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#232326] p-1.5 shadow-2xl"
              >
                <button
                  role="menuitemradio"
                  aria-checked={!project.folderId}
                  type="button"
                  className={itemClass}
                  onClick={() => run(() => onMoveToFolder(null))}
                >
                  {t('projects.menu.uncategorized', '未分类')}
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    role="menuitemradio"
                    aria-checked={project.folderId === folder.id}
                    type="button"
                    className={itemClass}
                    onClick={() => run(() => onMoveToFolder(folder.id))}
                  >
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            role="menuitem"
            type="button"
            disabled={!canDelete}
            className={`${itemClass} ${
              canDelete
                ? 'text-rose-300/80 hover:bg-rose-400/10 hover:text-rose-200 focus:bg-rose-400/10 focus:text-rose-200'
                : 'cursor-not-allowed text-white/28'
            }`}
            onClick={() => {
              if (canDelete) run(onDelete);
            }}
            title={
              canDelete
                ? t('projects.menu.delete', '删除项目')
                : t('projects.menu.defaultCannotDelete', '默认项目不可删除')
            }
          >
            <Trash2 className="h-4 w-4" />
            {canDelete
              ? t('projects.menu.delete', '删除项目')
              : t('projects.menu.defaultCannotDelete', '默认项目不可删除')}
          </button>
        </div>
      )}
    </div>
  );
}
