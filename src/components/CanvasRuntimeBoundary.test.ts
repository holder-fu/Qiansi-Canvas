import { describe, expect, it } from 'vitest';
import mainSource from '../main.tsx?raw';
import boundarySource from './CanvasRuntimeBoundary.tsx?raw';

describe('CanvasRuntimeBoundary', () => {
  it('wraps the application root and keeps a visible guarded recovery surface', () => {
    expect(mainSource).toContain('<CanvasRuntimeBoundary>');
    expect(mainSource).toContain('</CanvasRuntimeBoundary>');
    expect(boundarySource).toContain('页面资源暂时未能加载');
    expect(boundarySource).toContain('<details');
    expect(boundarySource).toContain('if (import.meta.env.DEV) void this.recover(false, error)');
    expect(boundarySource).toContain(
      'enabled: import.meta.env.DEV || manual || isStaleBuildAssetError(caughtError)',
    );
    expect(boundarySource).toContain('void this.recover(false, error)');
    expect(boundarySource).toContain('void this.recover(true, this.state.error)');
    expect(boundarySource).toContain('flushCanvasPersistence');
    expect(boundarySource).toContain('probeBridgeHealth(BRIDGE_BASE_URL)');
    expect(mainSource).toContain(
      'window.setTimeout(() => clearDevelopmentRecoveryAttempt(window.sessionStorage), 10_000)',
    );
  });
});
