import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../../canvas/nodeTypes';
import {
  connectionRadiusForZoom,
  resolveGestureConnection,
  resolveNodeBodyConnection,
} from './connectionGesture';

const nodes: FlowNode[] = [
  {
    id: 'image',
    type: 'image',
    position: { x: 0, y: 0 },
    data: { kind: 'image', title: '参考图片' },
  },
  {
    id: 'text',
    type: 'text',
    position: { x: 500, y: 0 },
    data: { kind: 'text', title: '提示词' },
  },
  {
    id: 'director-2d',
    type: 'director-2d',
    position: { x: 1000, y: 0 },
    data: { kind: 'director-2d', title: '2D导演台', directorMode: '2d' },
  },
  {
    id: 'audio',
    type: 'audio',
    position: { x: 1500, y: 0 },
    data: { kind: 'audio', title: '音频' },
  },
  {
    id: 'video',
    type: 'video',
    position: { x: 2000, y: 0 },
    data: { kind: 'video', title: '视频' },
  },
];

describe('resolveGestureConnection', () => {
  it('resolves an audio drag on the collapsed video input to audio-track', () => {
    expect(
      resolveGestureConnection(
        nodes,
        {
          source: 'audio',
          sourceHandle: 'audio',
          target: 'video',
          targetHandle: 'prompt',
        },
        true,
      ),
    ).toEqual({
      source: 'audio',
      sourceHandle: 'audio',
      target: 'video',
      targetHandle: 'audio-track',
    });
  });

  it('keeps a concrete incompatible typed input authoritative', () => {
    expect(
      resolveGestureConnection(
        nodes,
        {
          source: 'audio',
          sourceHandle: 'audio',
          target: 'video',
          targetHandle: 'prompt',
        },
        false,
      ),
    ).toBeNull();
  });
});

describe('connectionRadiusForZoom', () => {
  it.each([
    [0.1, 600],
    [0.3, 200],
    [1, 60],
    [2, 30],
  ])('keeps a 60px screen radius at zoom %s', (zoom, expected) => {
    expect(connectionRadiusForZoom(zoom)).toBeCloseTo(expected);
  });
});

describe('resolveNodeBodyConnection', () => {
  it('connects a forward output drag released on a compatible node body', () => {
    expect(
      resolveNodeBodyConnection(
        nodes,
        [],
        { direction: 'forward', source: 'image', sourceHandle: 'image' },
        'text',
        null,
      ),
    ).toEqual({
      source: 'image',
      sourceHandle: 'image',
      target: 'text',
      targetHandle: 'ref',
    });
  });

  it('normalizes a reverse input drag released on its upstream node body', () => {
    expect(
      resolveNodeBodyConnection(
        nodes,
        [],
        { direction: 'reverse', target: 'text', targetHandle: null },
        'image',
        null,
      ),
    ).toEqual({
      source: 'image',
      sourceHandle: 'image',
      target: 'text',
      targetHandle: 'ref',
    });
  });

  it('rejects a reverse drag released on an incompatible node body', () => {
    expect(
      resolveNodeBodyConnection(
        nodes,
        [],
        { direction: 'reverse', target: 'text', targetHandle: 'video-ref' },
        'image',
        null,
      ),
    ).toBeNull();
  });

  it('does not reinterpret an invalid drop on the 2D director output as a body drop', () => {
    expect(
      resolveNodeBodyConnection(
        nodes,
        [],
        { direction: 'forward', source: 'image', sourceHandle: 'image' },
        'director-2d',
        { type: 'source', aggregateInput: false },
      ),
    ).toBeNull();
  });

  it('resolves a forward drop on a collapsed video input to audio-track', () => {
    expect(
      resolveNodeBodyConnection(
        nodes,
        [],
        { direction: 'forward', source: 'audio', sourceHandle: 'audio' },
        'video',
        { type: 'target', aggregateInput: true },
      ),
    ).toEqual({
      source: 'audio',
      sourceHandle: 'audio',
      target: 'video',
      targetHandle: 'audio-track',
    });
  });

  it('does not reinterpret a concrete incompatible video input', () => {
    expect(
      resolveNodeBodyConnection(
        nodes,
        [],
        { direction: 'forward', source: 'audio', sourceHandle: 'audio' },
        'video',
        { type: 'target', aggregateInput: false },
      ),
    ).toBeNull();
  });

  it('does not reinterpret a reverse drag released on another aggregate target', () => {
    expect(
      resolveNodeBodyConnection(
        nodes,
        [],
        { direction: 'reverse', target: 'text', targetHandle: null },
        'image',
        { type: 'target', aggregateInput: true },
      ),
    ).toBeNull();
  });
});
