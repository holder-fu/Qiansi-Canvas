import { describe, expect, it } from 'vitest';
import {
  availableCharacterReferenceKinds,
  buildCharacterReferenceNodes,
  characterReferenceGroupSize,
  CHARACTER_REFERENCE_GROUP_HEIGHT,
  CHARACTER_REFERENCE_GROUP_WIDTH,
  pickCharacterReferenceImages,
  resolveCharacterCoverSource,
  resolveCharacterTurnaroundCoverSource,
} from './characterCanvasLayout';

describe('character canvas reference layout', () => {
  it('builds three compact nodes above one aligned wide node', () => {
    const nodes = buildCharacterReferenceNodes({
      title: '清新少女',
      referenceImages: {
        standing: 'standing.png',
        portrait: 'portrait.png',
        expressions: 'expressions.png',
        turnaround: 'turnaround.png',
      },
      origin: { x: 100, y: 200 },
    });

    expect(nodes.map((node) => node.title)).toEqual([
      '清新少女 角色立绘',
      '清新少女 脸部近景',
      '清新少女 表情参考',
      '清新少女 三视图',
    ]);
    expect(nodes.map((node) => node.position)).toEqual([
      { x: 100, y: 200 },
      { x: 350, y: 200 },
      { x: 600, y: 200 },
      { x: 100, y: 544 },
    ]);
    expect(nodes.slice(0, 3).map(({ width, height }) => ({ width, height }))).toEqual([
      { width: 236, height: 294 },
      { width: 236, height: 294 },
      { width: 236, height: 294 },
    ]);
    expect(nodes[3]).toMatchObject({
      width: CHARACTER_REFERENCE_GROUP_WIDTH,
      height: 414,
    });
    expect(CHARACTER_REFERENCE_GROUP_HEIGHT).toBe(758);
  });

  it('creates only available real images and compacts the upper row', () => {
    const nodes = buildCharacterReferenceNodes({
      title: '角色',
      referenceImages: {
        expressions: 'expressions.png',
        turnaround: 'turnaround.png',
      },
      origin: { x: 0, y: 0 },
    });

    expect(nodes.map((node) => node.image)).toEqual(['expressions.png', 'turnaround.png']);
    expect(nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 344 },
    ]);
    expect(characterReferenceGroupSize({ expressions: 'expressions.png' })).toEqual({
      width: 236,
      height: 294,
    });
  });

  it('selects any available subset without treating completeness as a usage requirement', () => {
    const images = {
      standing: 'standing.png',
      portrait: 'portrait.png',
      expressions: 'expressions.png',
    };
    expect(availableCharacterReferenceKinds(images)).toEqual([
      'standing',
      'portrait',
      'expressions',
    ]);
    expect(pickCharacterReferenceImages(images, ['portrait'])).toEqual({
      portrait: 'portrait.png',
    });
  });

  it('uses the face close-up as the character cover and only falls back for incomplete records', () => {
    expect(
      resolveCharacterCoverSource(
        {
          standing: 'standing.png',
          portrait: ' portrait.png ',
          expressions: 'expressions.png',
        },
        'legacy-thumbnail.png',
      ),
    ).toBe('portrait.png');
    expect(resolveCharacterCoverSource({ standing: 'standing.png' }, 'legacy-thumbnail.png')).toBe(
      'standing.png',
    );
    expect(resolveCharacterCoverSource(undefined, 'legacy-thumbnail.png')).toBe(
      'legacy-thumbnail.png',
    );
  });

  it('uses the real turnaround sheet for compact character recommendations', () => {
    expect(
      resolveCharacterTurnaroundCoverSource(
        {
          portrait: 'portrait.png',
          turnaround: ' turnaround.png ',
        },
        'legacy-thumbnail.png',
      ),
    ).toBe('turnaround.png');
    expect(resolveCharacterTurnaroundCoverSource({ portrait: 'portrait.png' })).toBe(
      'portrait.png',
    );
    expect(resolveCharacterTurnaroundCoverSource(undefined, 'legacy-thumbnail.png')).toBe(
      'legacy-thumbnail.png',
    );
  });
});
