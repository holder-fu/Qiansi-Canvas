import { describe, expect, it } from 'vitest';
import { NODE_H, NODE_W } from '../canvas/constants';
import {
  contextLocalMediaKind,
  contextLocalMediaPosition,
  planContextLocalMediaImports,
} from './contextLocalMediaImport';

describe('context-menu local media import', () => {
  it.each([
    ['portrait.png', 'image/png', 'image'],
    ['clip.mp4', 'video/mp4', 'video'],
    ['voice.wav', 'audio/wav', 'audio'],
    ['voice.webm', 'audio/webm', 'audio'],
    ['portrait.WEBP', '', 'image'],
    ['clip.MOV', '', 'video'],
    ['voice.M4A', '', 'audio'],
  ] as const)('classifies %s as %s media', (name, type, expected) => {
    expect(contextLocalMediaKind({ name, type })).toBe(expected);
  });

  it('rejects unsupported files instead of creating the wrong node kind', () => {
    expect(contextLocalMediaKind({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
  });

  it('places a batch in reading order without stacking nodes', () => {
    const origin = { x: 120, y: -40 };

    expect(
      Array.from({ length: 5 }, (_, index) => contextLocalMediaPosition(origin, index)),
    ).toEqual([
      origin,
      { x: origin.x + NODE_W + 80, y: origin.y },
      { x: origin.x, y: origin.y + NODE_H + 80 },
      { x: origin.x + NODE_W + 80, y: origin.y + NODE_H + 80 },
      { x: origin.x, y: origin.y + (NODE_H + 80) * 2 },
    ]);
  });

  it('plans every supported file in selection order and skips unsupported entries', () => {
    const files = [
      new File(['image'], 'one.png', { type: 'image/png' }),
      new File(['text'], 'skip.txt', { type: 'text/plain' }),
      new File(['video'], 'two.mp4', { type: 'video/mp4' }),
      new File(['audio'], 'three.wav', { type: 'audio/wav' }),
    ];
    const plan = planContextLocalMediaImports(files, { x: 10, y: 20 });

    expect(plan.map(({ file, kind }) => [file.name, kind])).toEqual([
      ['one.png', 'image'],
      ['two.mp4', 'video'],
      ['three.wav', 'audio'],
    ]);
    expect(plan.map(({ position }) => position)).toEqual([
      { x: 10, y: 20 },
      { x: 10 + NODE_W + 80, y: 20 },
      { x: 10, y: 20 + NODE_H + 80 },
    ]);
  });
});
