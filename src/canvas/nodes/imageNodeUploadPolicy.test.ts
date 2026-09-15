import { describe, expect, it } from 'vitest';
import { canManuallyUploadMedia, shouldHideMediaNodeInputs } from './imageNodeUploadPolicy';

describe('canManuallyUploadMedia', () => {
  it('keeps a connected image node reserved for its upstream result', () => {
    expect(canManuallyUploadMedia(true)).toBe(false);
  });

  it('allows uploads on a standalone image node', () => {
    expect(canManuallyUploadMedia(false)).toBe(true);
  });

  it('hides uploads for a standalone prompt-only generation task', () => {
    expect(canManuallyUploadMedia(false, 'generation-only')).toBe(false);
  });

  it('keeps explicit upload-mode nodes available for manual media input', () => {
    expect(canManuallyUploadMedia(false, 'upload')).toBe(true);
  });

  it('applies the same incoming-connection policy to video nodes', () => {
    expect(canManuallyUploadMedia(true)).toBe(false);
    expect(canManuallyUploadMedia(false)).toBe(true);
  });
});

describe('shouldHideMediaNodeInputs', () => {
  it('hides the left input ports on a standalone video node', () => {
    expect(shouldHideMediaNodeInputs(true, false, false)).toBe(true);
  });

  it('restores video inputs after an upstream connection exists', () => {
    expect(shouldHideMediaNodeInputs(true, true, false)).toBe(false);
  });

  it('keeps reference-only and standalone image behavior unchanged', () => {
    expect(shouldHideMediaNodeInputs(false, false, true)).toBe(true);
    expect(shouldHideMediaNodeInputs(false, false, false)).toBe(false);
  });
});
