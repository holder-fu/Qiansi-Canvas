import { describe, expect, it } from 'vitest';
import panelSource from './VideoAnimatedImagePanel.tsx?raw';

describe('video animated-image panel', () => {
  it('renders a bottom toolbar with a two-handle range and visible generation progress', () => {
    expect(panelSource).toContain('position={Position.Bottom}');
    expect(panelSource).toContain("(['start', 'end'] as const).map");
    expect(panelSource).toContain(
      "t('videoAnimatedImage.generating', '正在生成动态图 {progress}%'",
    );
    expect(panelSource).toContain('style={{ width: `${progress}%` }}');
  });

  it('keeps frame-rate, size and generation controls inside the panel', () => {
    expect(panelSource).toContain("t('videoAnimatedImage.frameRate', '动态图帧率')");
    expect(panelSource).toContain("t('videoAnimatedImage.size', '动态图尺寸')");
    expect(panelSource).toContain("t('videoAnimatedImage.generate', '生成动态图')");
  });

  it('offers proportional scale presets and passes the selected scale into generation', () => {
    expect(panelSource).toContain("t('videoAnimatedImage.scale', '按比例缩小')");
    expect(panelSource).toContain('[100, 75, 50, 25].map');
    expect(panelSource).toContain('onGenerate(range, { fps, maxEdge, scalePercent })');
    expect(panelSource).toContain("'videoAnimatedImage.scaleOutput'");
    expect(panelSource).toContain('{outputSize.width}×{outputSize.height}');
  });
});
