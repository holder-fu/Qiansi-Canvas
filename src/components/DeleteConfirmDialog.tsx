import { AlertTriangle, Trash2 } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { useAppTranslation } from '../i18n/appI18n';

export function DeleteConfirmDialog() {
  const { t } = useAppTranslation();
  const deleteConfirm = useCanvasStore((s) => s.deleteConfirm);
  const setDeleteConfirm = useCanvasStore((s) => s.setDeleteConfirm);

  if (!deleteConfirm) return null;

  const handleConfirm = () => {
    deleteConfirm.onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-80 rounded-2xl border border-white/[0.06] bg-[#1a1a1c] p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">
              {deleteConfirm.title ?? t('canvasShell.delete.title', '移到回收站？')}
            </h3>
            <p className="mt-0.5 text-xs text-white/50">{deleteConfirm.nodeTitle}</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-white/40">
          {deleteConfirm.description ??
            t('canvasShell.delete.description', '节点和相关连线会进入当前画布的回收站。')}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteConfirm(null)}
            className="rounded-lg border border-white/[0.06] bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10"
          >
            {t('canvasShell.delete.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/25"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('canvasShell.delete.confirm', '移到回收站')}
          </button>
        </div>
      </div>
    </div>
  );
}
