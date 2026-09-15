import {
  Component,
  createElement,
  lazy,
  Suspense,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useCanvasStore, type ModalKind } from '../store/canvasStore';
import { checkWebBuildUpdate } from '../lib/webBuildUpdate';
import { useAppTranslation } from '../i18n/appI18n';

interface BoundaryProps {
  children: ReactNode;
  active: boolean;
  retry: () => void;
  close?: () => void;
}

export class FeatureBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  componentDidCatch() {
    void checkWebBuildUpdate();
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (!this.props.active) return null;
    return (
      <FeatureFailure error={this.state.error} retry={this.props.retry} close={this.props.close} />
    );
  }
}

function FeatureFailure({
  error,
  retry,
  close,
}: { error: Error } & Pick<BoundaryProps, 'retry' | 'close'>) {
  const { t } = useAppTranslation();
  return (
    <section
      data-theme-role="panel"
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[200] w-80 rounded-xl border border-edge bg-panel p-4 text-sm text-white/85 shadow-xl"
    >
      <p className="font-medium">{t('runtimeUpdate.featureFailed', '这个功能暂时未能加载')}</p>
      <p className="mt-2 text-xs leading-5 text-white/60">
        {t(
          'runtimeUpdate.featureHint',
          '画布仍可继续使用。可以重试；如有新版本，请完成编辑后更新页面。',
        )}
      </p>
      <div className="mt-3 flex gap-3">
        <button type="button" className="rounded-lg border border-edge px-3 py-1.5" onClick={retry}>
          {t('runtimeUpdate.retry', '重试')}
        </button>
        {close && (
          <button type="button" onClick={close}>
            {t('runtimeUpdate.close', '关闭')}
          </button>
        )}
      </div>
      <details className="mt-3 text-xs text-white/45">
        <summary className="cursor-pointer">{t('runtimeUpdate.details', '详细信息')}</summary>
        <p className="mt-2 max-h-24 overflow-auto break-all">{error.message}</p>
      </details>
    </section>
  );
}

/** Each optional feature owns its rejection; the canvas is never unmounted.
 * A retry uses a fresh React.lazy instance instead of its cached rejection.
 */
export function lazyFeature<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  modal?: Exclude<ModalKind, null>,
) {
  return function LazyFeature(props: ComponentProps<T>) {
    const openModal = useCanvasStore((state) => state.openModal);
    const [attempt, setAttempt] = useState(() => ({ id: 0, Loaded: lazy(loader) }));
    const { Loaded } = attempt;
    const propClose = (props as { onClose?: () => void }).onClose;
    return (
      <FeatureBoundary
        key={attempt.id}
        active={!modal || openModal === modal}
        retry={() => setAttempt((current) => ({ id: current.id + 1, Loaded: lazy(loader) }))}
        close={
          propClose ?? (modal ? () => useCanvasStore.getState().setOpenModal(null) : undefined)
        }
      >
        <Suspense fallback={null}>{createElement(Loaded, props)}</Suspense>
      </FeatureBoundary>
    );
  };
}
