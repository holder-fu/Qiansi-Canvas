import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTextModeCatalog, saveTextModeCatalog } from './textModeCatalog';

afterEach(() => vi.unstubAllGlobals());

describe('text mode catalog Bridge client', () => {
  it('loads normalized shared mode definitions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            catalog: {
              version: 1,
              revision: 2,
              modes: [{ value: 'custom-style', label: '同风格提示词' }],
              updatedAt: 20,
            },
            writable: true,
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await loadTextModeCatalog('http://127.0.0.1:2895');
    expect(result.catalog.revision).toBe(2);
    expect(result.catalog.modes.some((mode) => mode.value === 'custom-style')).toBe(true);
    expect(result.catalog.modes.some((mode) => mode.value === '生成提示词')).toBe(true);
  });

  it('sends all mode definitions with the current revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          catalog: { version: 1, revision: 3, modes: [], updatedAt: 30 },
          writable: true,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await saveTextModeCatalog(
      [
        {
          key: 'custom',
          value: 'custom-style',
          label: '同风格提示词',
          description: '',
          details: '',
          placeholder: '',
          promptTemplate: '请复刻图片：',
          instruction: '',
        },
      ],
      2,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/settings/text-modes'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"expectedRevision":2'),
      }),
    );
  });
});
