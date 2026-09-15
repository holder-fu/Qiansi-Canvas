import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadUserLibraries, saveUserLibraries } from './userLibraries';

afterEach(() => vi.unstubAllGlobals());

describe('user libraries Bridge client', () => {
  it('loads persisted style, effect, character and camera metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            libraries: {
              version: 1,
              revision: 4,
              libraries: {
                style: { presets: [{ id: 'style-1', title: '风格' }] },
                effect: { presets: [{ id: 'effect-1', title: '特效' }] },
                character: { presets: [{ id: 'character-1', title: '角色' }] },
                camera: { presets: [{ id: 'camera-1', title: '运镜' }] },
              },
              updatedAt: 20,
            },
            writable: true,
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await loadUserLibraries('http://127.0.0.1:2895');
    expect(result.libraries.revision).toBe(4);
    expect(result.libraries.libraries.effect).toMatchObject({
      presets: [{ title: '特效' }],
    });
    expect(result.libraries.libraries.camera).toMatchObject({
      presets: [{ title: '运镜' }],
    });
  });

  it('sends the complete library snapshot with a revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          libraries: { version: 1, revision: 5, libraries: {}, updatedAt: 30 },
          writable: true,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await saveUserLibraries({ style: { presets: [] } }, 4);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/settings/user-libraries'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"expectedRevision":4'),
      }),
    );
  });
});
