import { describe, expect, it } from 'vitest';
import {
  derivePersonAnchors,
  mergeAttachedPersonItems,
  refinePersonAlphaMask,
} from './personCutout';

describe('person cutout alpha refinement', () => {
  it('removes low-confidence haze', () => {
    const alpha = refinePersonAlphaMask(new Float32Array([0.08, 0.18, 0.23, 0.12]), 2, 2);
    expect([...alpha]).toEqual([0, 0, 0, 0]);
  });

  it('removes tiny detached fragments even when one pixel is confident', () => {
    const confidence = new Float32Array(25);
    confidence[0] = 0.92;
    confidence[24] = 0.88;
    const alpha = refinePersonAlphaMask(confidence, 5, 5);
    expect([...alpha]).toEqual(Array.from({ length: 25 }, () => 0));
  });

  it('keeps a connected subject with a crisp centre and a soft edge', () => {
    const confidence = new Float32Array([
      0, 0, 0, 0, 0, 0, 0.35, 0.48, 0.35, 0, 0, 0.48, 0.95, 0.48, 0, 0, 0.35, 0.48, 0.35, 0, 0, 0,
      0, 0, 0,
    ]);
    const alpha = refinePersonAlphaMask(confidence, 5, 5);

    expect(alpha[12]).toBe(255);
    expect(alpha[6]).toBeGreaterThan(0);
    expect(alpha[6]).toBeLessThan(255);
    expect(alpha[0]).toBe(0);
  });
});

describe('person anchor derivation', () => {
  it('keeps a person-shaped region and ignores detached clothing or hand samples', () => {
    const width = 12;
    const height = 8;
    const confidence = new Float32Array(width * height);
    const anchor = new Float32Array(width * height);
    const support = new Float32Array(width * height);

    for (let y = 1; y <= 6; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        const index = y * width + x;
        confidence[index] = 0.9;
        if (y <= 2) anchor[index] = 0.8;
        else support[index] = 0.8;
      }
    }
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 7; x <= 9; x += 1) {
        const index = y * width + x;
        confidence[index] = 0.9;
        support[index] = 0.9;
      }
    }
    confidence[11] = 0.9;
    anchor[11] = 0;
    support[11] = 0.9;

    const anchors = derivePersonAnchors(confidence, anchor, support, width, height);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.x).toBeLessThan(0.4);
    expect(anchors[0]?.y).toBeGreaterThan(0.3);
  });
});

describe('attached person item recovery', () => {
  it('restores an attached prop and rejects a detached foreground object', () => {
    const width = 10;
    const height = 8;
    const person = new Float32Array(width * height);
    const coarse = new Float32Array(width * height);

    for (let y = 2; y <= 5; y += 1) {
      for (let x = 4; x <= 5; x += 1) {
        person[y * width + x] = 0.95;
        coarse[y * width + x] = 0.95;
      }
    }
    for (let x = 1; x <= 3; x += 1) coarse[3 * width + x] = 0.82;
    for (let x = 7; x <= 9; x += 1) coarse[7 * width + x] = 0.9;

    const merged = mergeAttachedPersonItems(person, width, height, coarse, width, height);
    expect(merged[3 * width + 2]).toBeGreaterThan(0.8);
    expect(merged[7 * width + 8]).toBe(0);
    expect(merged[3 * width + 4]).toBeGreaterThan(0.9);
  });
});
