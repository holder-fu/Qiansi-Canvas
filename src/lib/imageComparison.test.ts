import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import {
  clampImageComparisonPosition,
  imageComparisonInputUrls,
  imageComparisonKeyboardPosition,
  imageComparisonNeedsAlignedCrop,
  imageComparisonNodePosition,
  imageComparisonPositionFromPointer,
  imageComparisonViewportSize,
  resolveImageComparisonSources,
} from './imageComparison';

function imageNode(id: string, url?: string, x = 0, y = 0): FlowNode {
  return {
    id,
    type: 'image',
    position: { x, y },
    data: { kind: 'image', title: id, ...(url ? { imageUrl: url } : {}) },
  };
}

describe('image comparison interaction', () => {
  it('clamps pointer and persisted positions into the comparison range', () => {
    expect(clampImageComparisonPosition()).toBe(50);
    expect(clampImageComparisonPosition(null)).toBe(50);
    expect(clampImageComparisonPosition('')).toBe(50);
    expect(clampImageComparisonPosition(-20)).toBe(0);
    expect(clampImageComparisonPosition(130)).toBe(100);
    expect(imageComparisonPositionFromPointer(300, { left: 100, width: 400 })).toBe(50);
  });

  it('supports precise keyboard movement and boundary jumps', () => {
    expect(imageComparisonKeyboardPosition(50, 'ArrowLeft')).toBe(49);
    expect(imageComparisonKeyboardPosition(50, 'ArrowRight', true)).toBe(55);
    expect(imageComparisonKeyboardPosition(50, 'Home')).toBe(0);
    expect(imageComparisonKeyboardPosition(50, 'End')).toBe(100);
    expect(imageComparisonKeyboardPosition(50, 'Enter')).toBeNull();
  });

  it('keeps the two connected image values in edge order without copying media', () => {
    expect(
      imageComparisonInputUrls({
        portInputs: { images: ['bridge://image-a', 'bridge://image-b'] },
      }),
    ).toEqual(['bridge://image-a', 'bridge://image-b']);
    expect(imageComparisonInputUrls({ portInputs: { images: ['bridge://image-a'] } })).toEqual([
      'bridge://image-a',
      undefined,
    ]);
  });

  it('uses one aligned crop viewport only when image aspect ratios materially differ', () => {
    expect(
      imageComparisonNeedsAlignedCrop({ width: 1920, height: 1080 }, { width: 1280, height: 720 }),
    ).toBe(false);
    expect(
      imageComparisonNeedsAlignedCrop({ width: 1920, height: 1080 }, { width: 1024, height: 1024 }),
    ).toBe(true);
    expect(imageComparisonNeedsAlignedCrop({ width: 0, height: 1080 })).toBe(false);
  });

  it('matches the comparison viewport to the primary image ratio', () => {
    expect(imageComparisonViewportSize({ width: 800, height: 1000 })).toEqual({
      width: 384,
      height: 480,
    });
    expect(imageComparisonViewportSize({ width: 1600, height: 900 })).toEqual({
      width: 480,
      height: 270,
    });
  });

  it('falls back to the second image and then the empty-node size', () => {
    expect(imageComparisonViewportSize(undefined, { width: 600, height: 600 })).toEqual({
      width: 480,
      height: 480,
    });
    expect(imageComparisonViewportSize()).toEqual({ width: 480, height: 320 });
  });
});

describe('image comparison selection shortcut', () => {
  it('accepts exactly two nodes with real ordered image outputs', () => {
    const nodes = [
      imageNode('first', 'data:image/png;base64,first'),
      imageNode('second', 'data:image/png;base64,second'),
    ];
    expect(resolveImageComparisonSources(nodes, ['second', 'first'])).toEqual([
      {
        nodeId: 'second',
        sourceHandle: 'image',
        imageUrl: 'data:image/png;base64,second',
      },
      { nodeId: 'first', sourceHandle: 'image', imageUrl: 'data:image/png;base64,first' },
    ]);
  });

  it('rejects missing media, duplicate ids, and selections other than two nodes', () => {
    const nodes = [imageNode('first', 'data:image/png;base64,first'), imageNode('empty')];
    expect(resolveImageComparisonSources(nodes, ['first', 'empty'])).toBeNull();
    expect(resolveImageComparisonSources(nodes, ['first', 'first'])).toBeNull();
    expect(resolveImageComparisonSources(nodes, ['first'])).toBeNull();
  });

  it('places the comparison node to the right and vertically centers it', () => {
    const nodes = [
      { ...imageNode('first', 'a', 100, 50), style: { width: 300, height: 200 } },
      { ...imageNode('second', 'b', 200, 350), style: { width: 400, height: 240 } },
    ];
    expect(imageComparisonNodePosition(nodes, ['first', 'second'])).toEqual({ x: 720, y: 160 });
  });
});
