import { describe, expect, it } from 'vitest';
import { resolvePanoramaPromptPosition } from './panoramaPromptPosition';

describe('resolvePanoramaPromptPosition', () => {
  it('places the confirmation below the node when it fits', () => {
    expect(
      resolvePanoramaPromptPosition({
        anchorLeft: 200,
        anchorRight: 800,
        anchorTop: 100,
        anchorBottom: 400,
        viewportWidth: 1200,
        viewportHeight: 800,
        promptWidth: 620,
        promptHeight: 56,
      }),
    ).toEqual({ left: 190, top: 412 });
  });

  it('keeps the confirmation inside the viewport for a tall node', () => {
    expect(
      resolvePanoramaPromptPosition({
        anchorLeft: 100,
        anchorRight: 900,
        anchorTop: 80,
        anchorBottom: 980,
        viewportWidth: 1000,
        viewportHeight: 720,
        promptWidth: 620,
        promptHeight: 56,
      }),
    ).toEqual({ left: 190, top: 652 });
  });

  it('clamps the confirmation horizontally on narrow viewports', () => {
    expect(
      resolvePanoramaPromptPosition({
        anchorLeft: -300,
        anchorRight: 200,
        anchorTop: 100,
        anchorBottom: 300,
        viewportWidth: 390,
        viewportHeight: 720,
        promptWidth: 366,
        promptHeight: 56,
      }),
    ).toEqual({ left: 12, top: 312 });
  });
});
