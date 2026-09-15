import { Loader2, Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLayoutEffect, useState, type RefObject } from 'react';
import { resolvePanoramaPromptPosition } from '../../lib/panoramaPromptPosition';
import { useAppTranslation } from '../../i18n/appI18n';

interface PanoramaGenerationPromptProps {
  visible: boolean;
  submitting: boolean;
  title?: string;
  description?: string;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onGenerate: () => void;
}

export function PanoramaGenerationPrompt({
  visible,
  submitting,
  title,
  description,
  anchorRef,
  onClose,
  onGenerate,
}: PanoramaGenerationPromptProps) {
  const { t } = useAppTranslation();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const resolvedTitle = title ?? t('canvasShell.panorama.title', '生成全景图');
  const resolvedDescription =
    description ??
    t('canvasShell.panorama.description', '关联当前图片并创建一个新的全景场景图片节点');

  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) {
      setPosition(null);
      return;
    }

    let animationFrame = 0;
    const syncWithNode = () => {
      const anchorElement = anchorRef.current;
      if (!anchorElement) return;

      const anchor = anchorElement.getBoundingClientRect();
      const promptWidth = Math.min(620, Math.max(0, window.innerWidth - 24));
      const nextPosition = resolvePanoramaPromptPosition({
        anchorLeft: anchor.left,
        anchorRight: anchor.right,
        anchorTop: anchor.top,
        anchorBottom: anchor.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        promptWidth,
        promptHeight: 56,
      });
      setPosition((current) =>
        current?.left === nextPosition.left && current.top === nextPosition.top
          ? current
          : nextPosition,
      );
      animationFrame = window.requestAnimationFrame(syncWithNode);
    };

    syncWithNode();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [anchorRef, visible]);

  if (!visible || !position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="region"
      aria-label={t('canvasShell.panorama.confirmAria', '确认{title}', {
        title: resolvedTitle,
      })}
      className="nodrag nopan pointer-events-auto fixed z-[120]"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex h-14 w-[620px] max-w-[calc(100vw-24px)] items-center gap-3 rounded-xl border border-white/[0.1] bg-[#171719]/[0.98] px-3 shadow-[0_16px_42px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/42 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
          aria-label={t('canvasShell.panorama.closePromptAria', '关闭{title}提示', {
            title: resolvedTitle,
          })}
          title={t('canvasShell.common.close', '关闭')}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white/90">{resolvedTitle}</div>
          <div className="mt-0.5 truncate text-[11px] text-white/38">{resolvedDescription}</div>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={submitting}
          className="flex h-10 min-w-24 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-white/88 disabled:cursor-wait disabled:opacity-55"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {submitting
            ? t('canvasShell.panorama.preparing', '准备中')
            : t('canvasShell.panorama.generate', '生成')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
