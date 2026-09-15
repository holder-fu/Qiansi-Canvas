import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { useAppTranslation } from '../i18n/appI18n';
import { SHORTCUT_GROUPS } from './shortcutGroups';

const LOCALIZED_KEY_LABELS: Record<string, string> = {
  拖拽节点: 'dragNode',
  滚轮向上: 'wheelUp',
  滚轮向下: 'wheelDown',
  滚轮: 'wheel',
  拖拽空白处: 'dragEmptyCanvas',
  鼠标中键: 'middleMouse',
  拖拽: 'drag',
  点击: 'click',
};

export function ShortcutsModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const open = openModal === 'shortcuts';

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeModal, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/10"
      onPointerDown={closeModal}
      role="presentation"
    >
      <section
        className="absolute bottom-16 left-1/2 flex max-h-[calc(100vh-96px)] w-[min(1152px,calc(100vw-32px))] -translate-x-1/2 flex-col rounded-2xl border border-white/[0.08] bg-[#242425]/98 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.dialogLabel', '画布快捷键')}
      >
        <button
          type="button"
          onClick={closeModal}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={t('shortcuts.closeAria', '关闭快捷键面板')}
          title={t('common.close', '关闭')}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUT_GROUPS.map((group, groupIndex) => (
            <div
              key={group.id}
              className={`min-w-0 px-5 first:pl-0 last:pr-0 ${
                groupIndex > 0 ? 'border-white/[0.08] lg:border-l' : ''
              }`}
            >
              <h2 className="mb-4 text-sm font-medium text-cyan-400">
                {t(`shortcuts.group.${group.id}`, group.title)}
              </h2>
              <div className="space-y-3.5">
                {group.items.map((shortcut) => (
                  <div
                    key={`${group.id}-${shortcut.id}`}
                    className="flex min-h-7 items-center justify-between gap-3"
                  >
                    <span className="min-w-0 text-sm text-white/40">
                      {t(`shortcuts.action.${shortcut.id}`, shortcut.action)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {shortcut.keys.map((key) => (
                        <span key={`${shortcut.id}-${key}`} className="flex items-center gap-1.5">
                          {key !== shortcut.keys[0] && (
                            <span className="text-xs text-white/25">+</span>
                          )}
                          <kbd className="whitespace-nowrap rounded-md border border-white/[0.1] bg-white/[0.025] px-1.5 py-1 text-xs leading-none text-white/85 shadow-sm">
                            {LOCALIZED_KEY_LABELS[key]
                              ? t(`shortcuts.key.${LOCALIZED_KEY_LABELS[key]}`, key)
                              : key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-white/[0.08] bg-[#242425]" />
      </section>
    </div>
  );
}
