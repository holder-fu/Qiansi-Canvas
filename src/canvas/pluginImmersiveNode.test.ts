import { describe, expect, it } from 'vitest';
import sandboxFrameSource from '../components/PluginSandboxFrame.tsx?raw';
import pluginNodeSource from './nodes/PluginNode.tsx?raw';

describe('immersive plugin node host interaction', () => {
  it('keeps the iframe in preview mode until it is the only selected React Flow node', () => {
    expect(pluginNodeSource).toContain("contribution?.presentation === 'immersive'");
    expect(pluginNodeSource).toContain(
      'const showSingleNodeControls = useSingleNodeControls(selected)',
    );
    expect(pluginNodeSource).toContain("showSingleNodeControls ? 'nodrag nopan nowheel' : ''");
    expect(pluginNodeSource).toContain('interactive={showSingleNodeControls}');
    expect(pluginNodeSource).toContain('!showSingleNodeControls && hasSandboxView');
    expect(pluginNodeSource).toContain('allowFullscreen');
    expect(pluginNodeSource).toContain('单击选择节点后操作场景');
  });

  it('lets selected immersive runtimes receive input and request browser fullscreen', () => {
    expect(sandboxFrameSource).toContain("allowFullscreen ? 'fullscreen' : ''");
    expect(sandboxFrameSource).toContain('allow={iframeFeaturePolicy || undefined}');
    expect(sandboxFrameSource).toContain('allowFullScreen={allowFullscreen}');
    expect(sandboxFrameSource).toContain('tabIndex={interactive ? 0 : -1}');
    expect(sandboxFrameSource).toContain("pointerEvents: interactive ? 'auto' : 'none'");
  });
});
