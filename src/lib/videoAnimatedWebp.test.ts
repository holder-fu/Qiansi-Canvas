import { describe, expect, it } from 'vitest';
import { inspectAnimatedWebp } from './effectWebp';
import {
  createAnimatedWebpFrameTimes,
  muxAnimatedWebpFrames,
  resolveAnimatedWebpDimensions,
} from './videoAnimatedWebp';

function chunk(name: string, payload: number[]) {
  const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
  bytes.set(new TextEncoder().encode(name), 0);
  new DataView(bytes.buffer).setUint32(4, payload.length, true);
  bytes.set(payload, 8);
  return bytes;
}

function staticWebp(payload = [1, 2, 3, 4]) {
  const image = chunk('VP8 ', payload);
  const bytes = new Uint8Array(12 + image.byteLength);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.byteLength - 8, true);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(image, 12);
  return bytes;
}

describe('video animated WebP conversion helpers', () => {
  it('samples the selected interval without exceeding the bounded frame budget', () => {
    const times = createAnimatedWebpFrameTimes({ start: 2, end: 22 }, 12, 180);
    expect(times).toHaveLength(180);
    expect(times[0]).toBe(2);
    expect(times.at(-1)).toBeLessThan(22);
  });

  it('scales down proportionally after fitting the selected output size', () => {
    expect(resolveAnimatedWebpDimensions(1920, 1080, 720, 50)).toEqual({
      width: 360,
      height: 203,
      scalePercent: 50,
    });
    expect(resolveAnimatedWebpDimensions(360, 240, 540, 25)).toEqual({
      width: 90,
      height: 60,
      scalePercent: 25,
    });
  });

  it('packages static WebP frames as a valid looping animated WebP', async () => {
    const result = muxAnimatedWebpFrames([staticWebp(), staticWebp([5, 6, 7, 8])], 640, 360, 125);
    expect(result.type).toBe('image/webp');
    await expect(inspectAnimatedWebp(result)).resolves.toEqual({
      width: 640,
      height: 360,
      animated: true,
    });
    const text = new TextDecoder('latin1').decode(await result.arrayBuffer());
    expect(text.match(/ANMF/g)).toHaveLength(2);
  });

  it('rejects malformed frames before creating a misleading image file', () => {
    expect(() =>
      muxAnimatedWebpFrames([new Uint8Array([1, 2]), staticWebp()], 320, 180, 100),
    ).toThrow('WebP');
  });
});
