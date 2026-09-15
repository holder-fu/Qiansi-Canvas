import { describe, expect, it } from 'vitest';
import flowCanvasSource from './FlowCanvas.tsx?raw';
import { viewportStableGridMetrics } from './gridBackground';

describe('viewportStableGridMetrics', () => {
  it.each([0.1, 0.25, 0.5, 1, 2, 5])(
    'keeps the rendered dot grid at the theme size when zoom is %s',
    (zoom) => {
      const metrics = viewportStableGridMetrics({ gap: 16, size: 1.5, zoom });

      expect(metrics.gap * zoom).toBeCloseTo(16, 8);
      expect(metrics.size * zoom).toBeCloseTo(1.5, 8);
    },
  );

  it('falls back safely before React Flow has a valid positive zoom', () => {
    expect(viewportStableGridMetrics({ gap: 24, size: 2, zoom: 0 })).toEqual({
      gap: 24,
      size: 2,
    });
    expect(viewportStableGridMetrics({ gap: 24, size: 2, zoom: Number.NaN })).toEqual({
      gap: 24,
      size: 2,
    });
  });
});

describe('FlowCanvas grid background', () => {
  it('feeds zoom-compensated theme metrics into React Flow Background', () => {
    expect(flowCanvasSource).toContain('viewportStableGridMetrics({');
    expect(flowCanvasSource).toContain('zoom: viewportTransform[2]');
    expect(flowCanvasSource).toContain('gap={gridBackgroundMetrics.gap}');
    expect(flowCanvasSource).toContain('size={gridBackgroundMetrics.size}');
  });
});
