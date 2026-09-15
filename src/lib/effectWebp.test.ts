import { describe, expect, it } from 'vitest';
import { inspectAnimatedWebp } from './effectWebp';

function chunk(name: string, bytes: number[]) {
  const data = new Uint8Array(8 + bytes.length + (bytes.length % 2));
  new TextEncoder().encodeInto(name, data);
  new DataView(data.buffer).setUint32(4, bytes.length, true);
  data.set(bytes, 8);
  return [...data];
}

function webp(chunks: number[][]) {
  const payload = chunks.flat();
  const bytes = new Uint8Array(12 + payload.length);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(bytes.buffer).setUint32(4, 4 + payload.length, true);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(payload, 12);
  return new Blob([bytes], { type: 'image/webp' });
}

describe('inspectAnimatedWebp', () => {
  it('accepts a signed animated WebP and reads its canvas size', async () => {
    const source = webp([
      chunk('VP8X', [2, 0, 0, 0, 127, 2, 0, 63, 1, 0]),
      chunk('ANIM', [0, 0, 0, 0, 0, 0]),
      chunk('ANMF', [0]),
    ]);
    await expect(inspectAnimatedWebp(source)).resolves.toEqual({
      width: 640,
      height: 320,
      animated: true,
    });
  });

  it('rejects static WebP and files that only claim the MIME', async () => {
    const staticWebp = webp([chunk('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]);
    await expect(inspectAnimatedWebp(staticWebp)).rejects.toThrow('静态 WebP');
    await expect(
      inspectAnimatedWebp(new Blob(['not-webp'], { type: 'image/webp' })),
    ).rejects.toThrow('WebP');
  });
});
