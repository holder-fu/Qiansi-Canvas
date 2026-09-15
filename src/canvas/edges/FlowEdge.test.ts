import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { dockPoint, dockToNodeBorder } from './edgeDocking';
import { nearestPointOnPath } from './edgePointerGeometry';
import { FLOW_RIBBON_SLICE_COUNT, getFlowRibbonMetrics, getRibbonSliceOpacity } from './flowRibbon';

describe('dockPoint', () => {
  it('pulls a right-handle endpoint back to the node border', () => {
    // A 22px Handle centred on a right border reports its outer edge at x=631
    // for a 620px-wide node. The visual dock includes a 2px inside overlap.
    expect(dockPoint(631, 175, Position.Right, 1, 11)).toEqual({ x: 618, y: 175 });
  });

  it('pulls a left-handle endpoint back to the node border', () => {
    expect(dockPoint(89, 175, Position.Left, 1, 11)).toEqual({ x: 102, y: 175 });
  });

  it('keeps a zero-sized hidden typed input on its border anchor', () => {
    expect(dockPoint(100, 175, Position.Left, 1, 0)).toEqual({ x: 102, y: 175 });
  });

  it('uses the node border even when the visual plus sits outside it', () => {
    const border = { x: 100, y: 50, width: 620, height: 350 };
    expect(dockToNodeBorder({ x: 747, y: 225 }, Position.Right, 1, border)).toEqual({
      x: 718,
      y: 225,
    });
    expect(dockToNodeBorder({ x: 73, y: 225 }, Position.Left, 1, border)).toEqual({
      x: 102,
      y: 225,
    });
  });
});

describe('flow ribbon motion', () => {
  it('matches the reference length-to-spacing ratio in canvas coordinates', () => {
    const metrics = getFlowRibbonMetrics(620);

    expect(metrics.ribbonLength).toBeCloseTo(80.6);
    expect(metrics.pitch).toBeCloseTo(219.232);
    expect(metrics.ribbonLength / metrics.pitch).toBeCloseTo(1 / 2.72);
    expect(metrics.cycleSeconds).toBe(1);
  });

  it('keeps two ribbons on short edges and adds speed and count on long edges', () => {
    const shortEdge = getFlowRibbonMetrics(300);
    const longEdge = getFlowRibbonMetrics(2_000);

    expect(300 / shortEdge.pitch).toBeGreaterThanOrEqual(2);
    expect(2_000 / longEdge.pitch).toBeGreaterThan(300 / shortEdge.pitch);
    expect(longEdge.pitch).toBeGreaterThan(shortEdge.pitch);
  });

  it('builds a monotonic fade toward the rounded leading end', () => {
    const opacities = Array.from({ length: FLOW_RIBBON_SLICE_COUNT }, (_, index) =>
      getRibbonSliceOpacity(index, FLOW_RIBBON_SLICE_COUNT),
    );

    expect(opacities[0]).toBeLessThan(0.1);
    expect(opacities.at(-1)).toBeGreaterThan(0.9);
    expect(
      opacities.every(
        (opacity, index) => index === 0 || opacity > (opacities[index - 1] ?? -Infinity),
      ),
    ).toBe(true);
  });
});

describe('edge pointer scissors', () => {
  it('projects an off-line pointer onto the nearest position of the edge', () => {
    const nearest = nearestPointOnPath({ x: 47, y: 18 }, 100, (length) => ({ x: length, y: 0 }));

    expect(nearest.x).toBeCloseTo(47, 1);
    expect(nearest.y).toBe(0);
  });

  it('keeps projection inside both endpoints', () => {
    expect(nearestPointOnPath({ x: -20, y: 4 }, 100, (length) => ({ x: length, y: 0 }))).toEqual({
      x: 0,
      y: 0,
    });
    expect(nearestPointOnPath({ x: 130, y: 4 }, 100, (length) => ({ x: length, y: 0 }))).toEqual({
      x: 100,
      y: 0,
    });
  });
});
