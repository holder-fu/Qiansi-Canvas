import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadImageTypePresetCatalogStorage,
  saveImageTypePresetCatalogStorage,
} from './imageTypePresetCatalog';

afterEach(() => vi.unstubAllGlobals());

describe('image generation type Bridge client', () => {
  it('loads every prompt in the host catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            catalog: {
              version: 1,
              revision: 2,
              categories: ['人物表情'],
              presets: [{ id: 'custom:a' }, { id: 'custom:b' }],
              updatedAt: 20,
            },
            writable: true,
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await loadImageTypePresetCatalogStorage('http://127.0.0.1:2895');
    expect(result.catalog.revision).toBe(2);
    expect(result.catalog.presets).toHaveLength(2);
    expect(result.writable).toBe(true);
  });

  it('sends the complete catalog with CAS revision and exposes conflicts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            catalog: {
              version: 1,
              revision: 3,
              categories: ['人物表情'],
              presets: [],
              updatedAt: 30,
            },
            writable: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            catalog: {
              version: 1,
              revision: 4,
              categories: ['人物表情'],
              presets: [{ id: 'remote-change' }],
              updatedAt: 40,
            },
            error: { message: 'conflict' },
          }),
          { status: 409 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await saveImageTypePresetCatalogStorage(
      { categories: ['人物表情'], presets: [{ id: 'custom:a' }] },
      2,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/settings/image-type-presets'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"expectedRevision":2'),
      }),
    );
    await expect(
      saveImageTypePresetCatalogStorage({ categories: ['人物表情'], presets: [] }, 3),
    ).rejects.toMatchObject({
      name: 'ImageTypePresetCatalogConflictError',
      catalog: expect.objectContaining({ revision: 4 }),
    });
  });
});
