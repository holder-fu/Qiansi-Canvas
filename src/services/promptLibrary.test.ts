import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPromptLibraryStorage, savePromptLibraryStorage } from './promptLibrary';

afterEach(() => vi.unstubAllGlobals());

describe('prompt library Bridge client', () => {
  it('loads image prompts stored by the host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            library: {
              version: 1,
              revision: 2,
              items: [{ id: 'custom-image', target: 'image', name: '图片提示词' }],
              categories: ['分镜构图'],
              renames: [],
              deleted: [],
              updatedAt: 20,
            },
            writable: true,
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await loadPromptLibraryStorage('http://127.0.0.1:2895');
    expect(result.library.revision).toBe(2);
    expect(result.library.items[0]).toMatchObject({ target: 'image' });
  });

  it('sends the complete custom library snapshot with its revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          library: {
            version: 1,
            revision: 3,
            items: [],
            categories: [],
            renames: [],
            deleted: [],
            updatedAt: 30,
          },
          writable: true,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await savePromptLibraryStorage(
      { items: [{ id: 'custom-image' }], categories: [], renames: [], deleted: [] },
      2,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/settings/prompt-library'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"expectedRevision":2'),
      }),
    );
  });
});
