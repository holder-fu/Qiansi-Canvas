import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import flowCanvasSource from '../FlowCanvas.tsx?raw';
import audioNodeSource from './AudioNode.tsx?raw';
import directorNodeSource from './DirectorNode.tsx?raw';
import imageNodeSource from './ImageNode.tsx?raw';
import pluginNodeSource from './PluginNode.tsx?raw';
import textNodeSource from './TextNode.tsx?raw';
import { NodeSelectionControlsProvider } from './nodeSelectionControls';
import {
  countSelectedNodes,
  shouldShowSingleNodeControls,
  useSingleNodeControls,
} from './nodeSelectionState';

function VisibilityProbe({ selected }: { selected: boolean }) {
  return createElement('span', {
    'data-single-node-controls': String(useSingleNodeControls(selected)),
  });
}

describe('single-node control visibility', () => {
  it('shows node controls only when exactly one node is selected', () => {
    expect(shouldShowSingleNodeControls(true, 1)).toBe(true);
    expect(shouldShowSingleNodeControls(false, 1)).toBe(false);
    expect(shouldShowSingleNodeControls(true, 0)).toBe(false);
    expect(shouldShowSingleNodeControls(true, 2)).toBe(false);
    expect(shouldShowSingleNodeControls(true, 4)).toBe(false);
  });

  it('counts every selected canvas node for multi-selection visibility', () => {
    expect(
      countSelectedNodes([{ selected: true }, { selected: false }, { selected: true }, {}]),
    ).toBe(2);
  });

  it('propagates the multi-selection count to node controls', () => {
    const multiSelection = renderToStaticMarkup(
      createElement(NodeSelectionControlsProvider, {
        selectedCount: 2,
        children: createElement(VisibilityProbe, { selected: true }),
      }),
    );
    const singleSelection = renderToStaticMarkup(
      createElement(NodeSelectionControlsProvider, {
        selectedCount: 1,
        children: createElement(VisibilityProbe, { selected: true }),
      }),
    );

    expect(multiSelection).toContain('data-single-node-controls="false"');
    expect(singleSelection).toContain('data-single-node-controls="true"');
  });

  it('routes every interactive node surface through the shared single-selection gate', () => {
    expect(flowCanvasSource).toContain(
      '<NodeSelectionControlsProvider selectedCount={selectedNodeCount}>',
    );
    for (const source of [
      imageNodeSource,
      textNodeSource,
      audioNodeSource,
      directorNodeSource,
      pluginNodeSource,
    ]) {
      expect(source).toContain('useSingleNodeControls(selected)');
    }
    expect(imageNodeSource).toContain('!isScriptNode && !isEffectAsset');
    expect(imageNodeSource).toContain(
      'if ((isEffectAsset || isAnimatedImageResult) && primaryUrl)',
    );
    expect(imageNodeSource).toContain('selected={showSingleNodeControls}');
    expect(textNodeSource).toContain('selected={showControls}');
  });
});
