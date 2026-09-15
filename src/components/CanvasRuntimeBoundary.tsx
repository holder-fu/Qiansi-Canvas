import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BRIDGE_BASE_URL } from '../lib/bridgeUrl';
import {
  attemptDevelopmentRuntimeRecovery,
  isStaleBuildAssetError,
  probeBridgeHealth,
  type DevelopmentRecoveryResult,
} from '../lib/developmentRuntimeRecovery';

interface CanvasRuntimeBoundaryProps {
  children: ReactNode;
}

interface CanvasRuntimeBoundaryState {
  error: Error | null;
  recovery: DevelopmentRecoveryResult | 'idle' | 'waiting';
}

function recoveryMessage(result: CanvasRuntimeBoundaryState['recovery']) {
  if (result === 'idle') return '当前页面未自动刷新，请先确认编辑内容，再尝试恢复。';
  if (result === 'waiting') return '正在检查本机服务并确认画布已保存…';
  if (result === 'bridge-unavailable') return 'Bridge 尚未恢复，页面不会自动刷新。';
  if (result === 'save-blocked') return '画布尚未安全保存或存在冲突，已停止自动刷新。';
  if (result === 'throttled') return '已阻止重复自动刷新，请修复错误后手动重试。';
  if (result === 'disabled') return '此错误不会自动刷新，请点击下方按钮进行安全恢复。';
  return '页面正在重新加载…';
}

async function flushCanvasForRecovery() {
  try {
    const { flushCanvasPersistence } = await import('../store/canvasStore');
    return await flushCanvasPersistence();
  } catch {
    return false;
  }
}

export class CanvasRuntimeBoundary extends Component<
  CanvasRuntimeBoundaryProps,
  CanvasRuntimeBoundaryState
> {
  state: CanvasRuntimeBoundaryState = { error: null, recovery: 'idle' };
  private mounted = false;

  static getDerivedStateFromError(error: unknown): CanvasRuntimeBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      recovery: 'idle',
    };
  }

  componentDidMount() {
    this.mounted = true;
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Production failures never force a refresh while the user is working.
    if (import.meta.env.DEV) void this.recover(false, error);
  }

  private recover = async (manual: boolean, caughtError: Error | null = this.state.error) => {
    if (this.mounted) this.setState({ recovery: 'waiting' });
    const result = await attemptDevelopmentRuntimeRecovery({
      enabled: import.meta.env.DEV || manual || isStaleBuildAssetError(caughtError),
      storage: window.sessionStorage,
      probeBridge: () => probeBridgeHealth(BRIDGE_BASE_URL),
      flushCanvas: flushCanvasForRecovery,
      reload: () => window.location.reload(),
      manual,
    });
    if (this.mounted) this.setState({ recovery: result });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#141414] px-6 text-white">
        <section
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1d1d1f] p-6 shadow-2xl"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm font-semibold text-white/90">
            {isStaleBuildAssetError(this.state.error) ? '页面资源暂时未能加载' : '页面暂时遇到问题'}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/55">
            {recoveryMessage(this.state.recovery)}
          </p>
          <details className="mt-3 text-xs text-white/50">
            <summary className="cursor-pointer">详细信息</summary>
            <p className="mt-2 max-h-24 overflow-auto break-all">
              {this.state.error.message || '未知运行时错误'}
            </p>
          </details>
          <button
            type="button"
            className="mt-5 h-9 rounded-lg border border-white/10 bg-white/8 px-4 text-xs font-medium text-white/75 transition hover:bg-white/12 hover:text-white disabled:cursor-wait disabled:opacity-45"
            disabled={this.state.recovery === 'waiting'}
            onClick={() => void this.recover(true, this.state.error)}
          >
            {this.state.recovery === 'waiting' ? '正在安全恢复…' : '重新尝试安全恢复'}
          </button>
        </section>
      </main>
    );
  }
}
