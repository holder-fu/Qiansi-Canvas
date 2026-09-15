import { Maximize2, Minimize2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useAppTranslation } from '../i18n/appI18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children?: React.ReactNode;
  width?: string;
  maxHeightClass?: string;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  /** Optional controls rendered immediately before maximize and close. */
  headerActions?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'w-[900px]',
  maxHeightClass = 'max-h-[85vh]',
  maximized = false,
  onToggleMaximize,
  headerActions,
}: ModalProps) {
  const { t } = useAppTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-theme-role="modal-backdrop"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm ${maximized ? 'p-0' : 'p-4'}`}
      onClick={onClose}
    >
      <div
        data-theme-role="modal-surface"
        className={`flex flex-col border border-white/[0.06] bg-[#1a1a1c] shadow-2xl ${
          maximized ? 'h-[100dvh] max-h-none rounded-none' : `${maxHeightClass} rounded-2xl`
        } ${width}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-theme-role="modal-titlebar"
          className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-3"
        >
          <div data-theme-role="window-controls" aria-hidden="true" className="hidden">
            <span data-window-control="close" />
            <span data-window-control="minimize" />
            <span data-window-control="zoom" />
          </div>
          <div data-theme-role="modal-title" className="text-base font-semibold text-white/90">
            {title}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            {onToggleMaximize && (
              <button
                type="button"
                onClick={onToggleMaximize}
                aria-label={
                  maximized
                    ? t('modal.restoreAria', '还原弹窗高度')
                    : t('modal.maximizeAria', '放大弹窗至全高')
                }
                title={maximized ? t('common.restore', '还原') : t('common.maximize', '放大')}
                aria-pressed={maximized}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
              >
                {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('modal.closeAria', '关闭弹窗')}
              title={t('common.close', '关闭')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div data-theme-role="modal-content" className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
