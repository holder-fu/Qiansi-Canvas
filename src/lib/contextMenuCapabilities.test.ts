import { describe, expect, it } from 'vitest';
import type { NodeKind } from '../canvas/nodeTypes';
import { supportsImageContextActions, supportsImageEditing } from './contextMenuCapabilities';

describe('image context-menu capabilities', () => {
  it.each([
    'image',
    'views',
    'front-frame',
    'generator',
    'comfy',
    'midjourney',
    'msgen',
    'rh',
  ] satisfies NodeKind[])('keeps image actions for %s nodes', (kind) => {
    expect(supportsImageContextActions(kind)).toBe(true);
  });

  it.each(['text', 'audio', 'video', 'script'] satisfies NodeKind[])(
    'does not show image actions for %s nodes',
    (kind) => {
      expect(supportsImageContextActions(kind)).toBe(false);
    },
  );

  it('only enables the image editor when an image-capable node has raster media', () => {
    const imageNode = (imageUrl?: string) => ({
      id: 'image-source',
      type: 'image' as const,
      position: { x: 0, y: 0 },
      data: { kind: 'image' as const, title: '图片', imageUrl },
    });

    expect(supportsImageEditing(imageNode('data:image/png;base64,source'))).toBe(true);
    expect(supportsImageEditing(imageNode())).toBe(false);
  });
});
