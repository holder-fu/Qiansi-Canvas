import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { NODE_H, NODE_W } from './constants';
import { calculateSnap } from './snap';

function node(id: string, x: number, y: number, width = 100, height = 100): Node {
  return {
    id,
    type: 'image',
    position: { x, y },
    data: {},
    width,
    height,
  };
}

function measuredNode(
  id: string,
  x: number,
  y: number,
  measuredWidth: number,
  measuredHeight: number,
): Node {
  return {
    id,
    type: 'image',
    position: { x, y },
    data: {},
    measured: { width: measuredWidth, height: measuredHeight },
  };
}

describe('calculateSnap', () => {
  it('returns at most one winning guide for each axis', () => {
    const result = calculateSnap(
      [node('dragged', 102, 102)],
      [node('top-left', 0, 0), node('bottom-right', 204, 204)],
      1,
    );

    expect(result.correctionX).toBe(-2);
    expect(result.correctionY).toBe(-2);
    expect(result.guides.filter((guide) => guide.direction === 'vertical')).toHaveLength(1);
    expect(result.guides.filter((guide) => guide.direction === 'horizontal')).toHaveLength(1);
  });

  it('prefers center-to-center alignment when anchors produce the same correction', () => {
    const result = calculateSnap([node('dragged', 104, 0)], [node('target', 100, 200)], 1);

    expect(result.correctionX).toBe(-4);
    expect(result.guides).toContainEqual({
      direction: 'vertical',
      position: 150,
      start: 0,
      end: 300,
    });
  });

  it('does not reverse snap direction to prefer an equally distant center line', () => {
    const result = calculateSnap(
      [node('dragged', 104, 0)],
      [node('target', 100, 200, 116, 100)],
      1,
    );

    expect(result.correctionX).toBe(-4);
    expect(result.guides.find((guide) => guide.direction === 'vertical')?.position).toBe(100);
  });

  it('uses the nearest node when several nodes share the winning line', () => {
    const result = calculateSnap(
      [node('dragged', 100, 100)],
      [node('far', 100, 1000), node('near', 100, 250)],
      1,
    );

    expect(result.guides.find((guide) => guide.direction === 'vertical')).toEqual({
      direction: 'vertical',
      position: 150,
      start: 100,
      end: 350,
    });
  });

  it('prefers the spatially nearest node over a farther node with a smaller X correction', () => {
    const result = calculateSnap(
      [node('dragged', 100, 100)],
      [node('far', 101, 1000), node('near', 104, 250)],
      1,
    );

    expect(result.correctionX).toBe(4);
    expect(result.guides.find((guide) => guide.direction === 'vertical')).toEqual({
      direction: 'vertical',
      position: 154,
      start: 100,
      end: 350,
    });
  });

  it('prefers the spatially nearest node over a farther node with a smaller Y correction', () => {
    const result = calculateSnap(
      [node('dragged', 100, 100)],
      [node('far', 1000, 101), node('near', 250, 104)],
      1,
    );

    expect(result.correctionY).toBe(4);
    expect(result.guides.find((guide) => guide.direction === 'horizontal')).toEqual({
      direction: 'horizontal',
      position: 154,
      start: 100,
      end: 350,
    });
  });

  it('keeps the existing eight-pixel screen-space snap threshold', () => {
    const dragged = [node('dragged', 105, 0)];
    const target = [node('target', 0, 500)];

    expect(calculateSnap(dragged, target, 1).snappedX).toBe(true);
    expect(calculateSnap(dragged, target, 2).snappedX).toBe(false);
  });

  it('aligns adaptive nodes from their measured DOM dimensions', () => {
    const result = calculateSnap(
      [measuredNode('audio', 800, 163, 420, 184)],
      [measuredNode('portrait-video', 0, 0, 400, 520)],
      1,
    );

    expect(result.correctionY).toBe(5);
    expect(result.guides.find((guide) => guide.direction === 'horizontal')).toEqual({
      direction: 'horizontal',
      position: 260,
      start: 0,
      end: 1220,
    });
  });

  it('prefers live measurements over stale declared dimensions', () => {
    const audio = measuredNode('audio', 800, 163, 420, 184);
    const portraitVideo = measuredNode('portrait-video', 0, 0, 400, 520);
    audio.width = portraitVideo.width = NODE_W;
    audio.height = portraitVideo.height = NODE_H;

    const result = calculateSnap([audio], [portraitVideo], 1);

    expect(result.correctionY).toBe(5);
    expect(result.guides.find((guide) => guide.direction === 'horizontal')?.position).toBe(260);
  });
});
