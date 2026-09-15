import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import assetPanelSource from '../components/AssetPanel.tsx?raw';
import layerPanelSource from '../components/LayerPanel.tsx?raw';
import mediaPreviewModalSource from '../components/MediaPreviewModal.tsx?raw';
import searchPanelSource from '../components/SearchPanel.tsx?raw';
import toolbarSource from '../components/Toolbar.tsx?raw';

describe('canvas shell interaction isolation', () => {
  it('does not let global canvas shortcuts operate behind a modal or delete confirmation', () => {
    expect(appSource).toContain(
      'const deleteConfirmOpen = useCanvasStore((s) => s.deleteConfirm !== null)',
    );
    expect(appSource).toContain('if (openModal !== null || deleteConfirmOpen) return;');
  });

  it('stacks the three bottom toolbars on narrow viewports and keeps auto-hide actions reachable', () => {
    expect(appSource).toContain("label === 'left'");
    expect(appSource).toContain('max-sm:!bottom-14');
    expect(appSource).toContain("label === 'center'");
    expect(appSource).toContain('max-sm:!bottom-28');
    expect(appSource).toContain('max-sm:!bottom-2');
    expect(appSource).toContain('max-sm:translate-y-0');
    expect(toolbarSource).toContain('max-sm:translate-y-0');
  });

  it('keeps canvas panels within a phone viewport', () => {
    expect(assetPanelSource).toContain('w-[min(420px,100vw)]');
    expect(searchPanelSource).toContain('w-[min(18rem,calc(100vw-1rem))]');
    expect(layerPanelSource).toContain('w-[min(18rem,calc(100vw-1rem))]');
  });

  it('turns search and layer results into real React Flow node selection', () => {
    expect(searchPanelSource).toContain('selectNodeFromPanel');
    expect(searchPanelSource).toContain('useCanvasStore.setState(selection)');
    expect(layerPanelSource).toContain('selectNodeFromPanel');
    expect(layerPanelSource).toContain('useCanvasStore.setState(selection)');
  });

  it('resolves image thumbnails through the current bridge instead of rendering stored hosts', () => {
    const resolvedThumbnail = "mediaPreviewUrl(imagePreviewSource(node.data), 'image')";
    expect(searchPanelSource).toContain(resolvedThumbnail);
    expect(layerPanelSource).toContain(resolvedThumbnail);
    expect(searchPanelSource).not.toContain('src={node.data.imageUrl}');
    expect(layerPanelSource).not.toContain('src={node.data.imageUrl}');
  });

  it('resolves the full-size image preview through the current bridge', () => {
    expect(mediaPreviewModalSource).toContain('imagePreviewSource(node.data)');
    expect(mediaPreviewModalSource).toContain('resolveMediaSourceUrl(rawImageUrl)');
    expect(mediaPreviewModalSource).not.toContain(
      'const imageUrl = node?.data.imageUrl || node?.data.images?.[0]',
    );
  });
});
