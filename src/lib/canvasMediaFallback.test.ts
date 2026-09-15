import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CanvasMediaFallbackIndexedDbBackend,
  CanvasMediaFallbackObjectUrlRegistry,
  CanvasMediaFallbackStore,
  canvasMediaDataUrlToBlob,
  createCanvasMediaFallbackPreviewUrl,
  createCanvasMediaFallbackUrl,
  createCanvasMediaStableId,
  isCanvasMediaFallbackUrl,
  isCanvasMediaFallbackPreviewUrl,
  parseCanvasMediaFallbackPreviewUrl,
  parseCanvasMediaFallbackReferenceUrl,
  parseCanvasMediaFallbackUrl,
  type CanvasMediaFallbackBackend,
  type CanvasMediaFallbackError,
  type CanvasMediaFallbackStoredRecord,
} from './canvasMediaFallback';

class MemoryBackend implements CanvasMediaFallbackBackend {
  readonly records = new Map<string, CanvasMediaFallbackStoredRecord>();
  putCount = 0;

  async get(stableId: string) {
    return this.records.get(stableId);
  }

  async put(stableId: string, record: CanvasMediaFallbackStoredRecord) {
    this.putCount += 1;
    this.records.set(stableId, {
      ...record,
      blob: record.blob.slice(0, record.blob.size, record.blob.type),
    });
  }

  async delete(stableId: string) {
    this.records.delete(stableId);
  }
}

describe('canvas media fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('converts Base64 and byte-oriented percent-encoded Data URLs to Blobs', async () => {
    const base64Blob = canvasMediaDataUrlToBlob('data:image/png;base64,AAEC/w==');
    const percentBlob = canvasMediaDataUrlToBlob('data:application/octet-stream,%89PNG%0D%0A');

    expect(base64Blob.type).toBe('image/png');
    expect([...new Uint8Array(await base64Blob.arrayBuffer())]).toEqual([0, 1, 2, 255]);
    expect([...new Uint8Array(await percentBlob.arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a,
    ]);
  });

  it('persists and verifies a Blob larger than localStorage under a content-stable id', async () => {
    const backend = new MemoryBackend();
    const store = new CanvasMediaFallbackStore({ backend, now: () => 1234 });
    const blob = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' });

    const pointer = await store.persist(blob);
    const restored = await store.load(pointer.stableId);
    const verified = await store.verify(pointer.stableId, pointer);
    const duplicate = await store.persist(blob);

    expect(pointer.stableId).toBe(await createCanvasMediaStableId(blob));
    expect(restored?.size).toBe(blob.size);
    expect(restored?.type).toBe('image/png');
    expect(verified).toEqual({ ok: true, ...pointer });
    expect(duplicate).toEqual(pointer);
    expect(backend.putCount).toBe(1);
  });

  it('refuses to repoint one stable id to different original bytes', async () => {
    const store = new CanvasMediaFallbackStore({ backend: new MemoryBackend() });
    await store.persist(new Blob(['original'], { type: 'image/png' }), 'asset-character-1');

    await expect(
      store.persist(new Blob(['different'], { type: 'image/png' }), 'asset-character-1'),
    ).rejects.toMatchObject({ code: 'stable-id-conflict' });

    expect(await (await store.load('asset-character-1'))?.text()).toBe('original');
  });

  it('detects corrupted bytes and only removes the requested stable id', async () => {
    const backend = new MemoryBackend();
    const store = new CanvasMediaFallbackStore({ backend });
    const first = await store.persist(new Blob(['first'], { type: 'image/png' }), 'first');
    await store.persist(new Blob(['second'], { type: 'image/png' }), 'second');
    const record = backend.records.get(first.stableId);
    expect(record).toBeDefined();
    if (record) record.blob = new Blob(['wrong'], { type: record.mimeType });

    expect(await store.verify(first.stableId)).toMatchObject({
      ok: false,
      reason: 'hash-mismatch',
    });
    expect(await store.delete(first.stableId)).toBe(true);
    expect(await store.delete(first.stableId)).toBe(false);
    expect(await store.load('second')).toBeInstanceOf(Blob);
  });

  it('round-trips stable URLs without accepting ambiguous suffixes', () => {
    const stableId = 'canvas-media:sha256:abc/人物 1';
    const stableUrl = createCanvasMediaFallbackUrl(stableId);
    const previewUrl = createCanvasMediaFallbackPreviewUrl(stableId);

    expect(stableUrl).toBe(
      'qiansi-canvas-media://indexeddb/canvas-media%3Asha256%3Aabc%2F%E4%BA%BA%E7%89%A9%201',
    );
    expect(parseCanvasMediaFallbackUrl(stableUrl)).toBe(stableId);
    expect(parseCanvasMediaFallbackReferenceUrl(stableUrl)).toEqual({
      stableId,
      role: 'original',
    });
    expect(isCanvasMediaFallbackUrl(stableUrl)).toBe(true);
    expect(previewUrl).toBe(
      'qiansi-canvas-media://indexeddb-preview/canvas-media%3Asha256%3Aabc%2F%E4%BA%BA%E7%89%A9%201',
    );
    expect(parseCanvasMediaFallbackUrl(previewUrl)).toBeNull();
    expect(parseCanvasMediaFallbackPreviewUrl(previewUrl)).toBe(stableId);
    expect(parseCanvasMediaFallbackReferenceUrl(previewUrl)).toEqual({
      stableId,
      role: 'preview',
    });
    expect(isCanvasMediaFallbackPreviewUrl(previewUrl)).toBe(true);
    expect(isCanvasMediaFallbackUrl(previewUrl)).toBe(true);
    expect(parseCanvasMediaFallbackUrl(`${stableUrl}?preview=1`)).toBeNull();
  });

  it('leases one runtime Object URL and maps it back to the stable URL', async () => {
    const store = new CanvasMediaFallbackStore({ backend: new MemoryBackend() });
    const pointer = await store.persist(new Blob(['image'], { type: 'image/png' }));
    const createObjectURL = vi.fn(() => 'blob:runtime-only');
    const revokeObjectURL = vi.fn();
    const registry = new CanvasMediaFallbackObjectUrlRegistry(store, {
      createObjectURL,
      revokeObjectURL,
    });

    const first = await registry.acquire(pointer.stableId);
    const second = await registry.acquire(first.stableUrl);
    expect(first.objectUrl).toBe(second.objectUrl);
    expect(registry.stableUrlForObjectUrl(first.objectUrl)).toBe(first.stableUrl);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    first.release();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    second.release();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:runtime-only');
    expect(registry.stableUrlForObjectUrl(first.objectUrl)).toBeNull();
  });

  it('keeps preview role while resolving and reversing a runtime Object URL', async () => {
    const store = new CanvasMediaFallbackStore({ backend: new MemoryBackend() });
    const pointer = await store.persist(new Blob(['preview'], { type: 'image/webp' }));
    const previewUrl = createCanvasMediaFallbackPreviewUrl(pointer.stableId);
    const registry = new CanvasMediaFallbackObjectUrlRegistry(store, {
      createObjectURL: vi.fn(() => 'blob:preview-runtime'),
      revokeObjectURL: vi.fn(),
    });

    const lease = await registry.acquire(previewUrl);

    expect(lease).toMatchObject({
      stableId: pointer.stableId,
      role: 'preview',
      stableUrl: previewUrl,
      objectUrl: 'blob:preview-runtime',
    });
    expect(registry.stableUrlForObjectUrl(lease.objectUrl)).toBe(previewUrl);
    lease.release();
  });

  it('fails explicitly when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', null);
    const store = new CanvasMediaFallbackStore({
      backend: new CanvasMediaFallbackIndexedDbBackend({ factory: null }),
    });

    await expect(store.load('missing')).rejects.toEqual(
      expect.objectContaining<Partial<CanvasMediaFallbackError>>({
        name: 'CanvasMediaFallbackError',
        code: 'indexeddb-unavailable',
      }),
    );
  });
});
