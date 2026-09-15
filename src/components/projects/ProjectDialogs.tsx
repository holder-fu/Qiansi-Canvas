import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useAppTranslation } from '../../i18n/appI18n';

interface ProjectTextDialogProps {
  title: string;
  description?: string;
  value: string;
  placeholder: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function useDialogKeyboard(onCancel: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);
}

export function ProjectTextDialog({
  title,
  description,
  value,
  placeholder,
  confirmLabel,
  busy = false,
  error,
  onChange,
  onCancel,
  onConfirm,
}: ProjectTextDialogProps) {
  const { t } = useAppTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  useDialogKeyboard(onCancel);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return createPortal(
    <div
      data-theme-role="modal-backdrop"
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        data-theme-role="modal-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-text-dialog-title"
        className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#1b1b1e] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="project-text-dialog-title" className="text-base font-semibold text-white/90">
              {title}
            </h2>
            {description && <p className="mt-1 text-xs leading-5 text-white/42">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/42 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
            aria-label={t('common.close', '关闭')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && value.trim()) onConfirm();
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            maxLength={100}
            disabled={busy}
            className="h-10 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3 text-sm text-white/88 outline-none transition focus:border-emerald-400/45 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-50"
          />
          {error && (
            <p role="alert" className="mt-2 text-xs leading-5 text-rose-300">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-9 rounded-lg border border-white/[0.09] px-3 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              data-theme-role="primary-action"
              type="submit"
              disabled={busy || !value.trim()}
              className="flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 text-sm font-medium text-[#07120a] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

interface ProjectConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ProjectConfirmDialog({
  title,
  description,
  confirmLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ProjectConfirmDialogProps) {
  const { t } = useAppTranslation();
  useDialogKeyboard(onCancel);

  return createPortal(
    <div
      data-theme-role="modal-backdrop"
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        data-theme-role="modal-surface"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="project-confirm-dialog-title"
        aria-describedby="project-confirm-dialog-description"
        className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#1b1b1e] p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 text-rose-300">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="project-confirm-dialog-title" className="text-base font-semibold text-white/90">
              {title}
            </h2>
            <p
              id="project-confirm-dialog-description"
              className="mt-1 text-xs leading-5 text-white/48"
            >
              {description}
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs leading-5 text-rose-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-lg border border-white/[0.09] px-3 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 text-sm font-medium text-rose-200 hover:bg-rose-400/18 disabled:opacity-40"
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
