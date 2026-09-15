import { describe, expect, it } from 'vitest';
import { createStoredZip, parseStoredZip } from './storedZip';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('stored ZIP', () => {
  it('round-trips UTF-8 names and binary files', async () => {
    const zip = createStoredZip([
      { name: '文字/说明.txt', bytes: encoder.encode('节点文字') },
      { name: '图片/frame.png', bytes: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const entries = await parseStoredZip(zip);

    expect(decoder.decode(entries.get('文字/说明.txt'))).toBe('节点文字');
    expect(Array.from(entries.get('图片/frame.png') ?? [])).toEqual([1, 2, 3, 4]);
  });

  it('rejects unsafe paths', () => {
    expect(() =>
      createStoredZip([{ name: '../secret.txt', bytes: encoder.encode('secret') }]),
    ).toThrow('不安全路径');
  });
});
