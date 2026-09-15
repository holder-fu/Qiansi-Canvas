import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const customPresets = [
  {
    id: 'custom:expression-a',
    name: '人物表情九宫格',
    category: '人物表情',
    description: '九种人物表情',
    prompt: '生成同一人物的九种连续表情。',
    builtIn: false,
  },
  {
    id: 'custom:expression-b',
    name: '人物表情特写',
    category: '人物表情',
    description: '人物表情特写',
    prompt: '生成保持人物身份一致的表情特写。',
    builtIn: false,
  },
];

describe('image generation type host persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('migrates every browser-only custom prompt into one durable Bridge snapshot', async () => {
    localStorage.setItem(
      'kitty-canvas-image-type-presets-v1',
      JSON.stringify({ version: 2, categories: ['人物表情'], presets: customPresets }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            catalog: { version: 1, revision: 0, categories: [], presets: [], updatedAt: 0 },
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
              revision: 1,
              categories: ['人物表情'],
              presets: customPresets,
              updatedAt: 100,
            },
            writable: true,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { loadImageTypePresetCatalog, startImageTypePresetCatalogSync } =
      await import('./imageTypePresets');
    await startImageTypePresetCatalogSync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, saveInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(saveInit.body))).toMatchObject({
      expectedRevision: 0,
      categories: ['人物表情'],
      presets: customPresets,
    });
    expect(loadImageTypePresetCatalog().presets).toEqual(customPresets);
  });

  it('serializes rapid additions without letting an older host response drop the newer prompt', async () => {
    let revision = 1;
    let hostCatalog = { categories: ['人物表情'], presets: customPresets.slice(0, 1) };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) {
          return new Response(
            JSON.stringify({
              catalog: { version: 1, revision, ...hostCatalog, updatedAt: revision * 100 },
              writable: true,
            }),
            { status: 200 },
          );
        }
        const body = JSON.parse(String(init.body)) as {
          expectedRevision: number;
          categories: string[];
          presets: typeof customPresets;
        };
        expect(body.expectedRevision).toBe(revision);
        revision += 1;
        hostCatalog = { categories: body.categories, presets: body.presets };
        return new Response(
          JSON.stringify({
            catalog: { version: 1, revision, ...hostCatalog, updatedAt: revision * 100 },
            writable: true,
          }),
          { status: 200 },
        );
      }),
    );

    const {
      loadImageTypePresetCatalog,
      queueImageTypePresetCatalogSync,
      saveImageTypePresetCatalog,
      startImageTypePresetCatalogSync,
    } = await import('./imageTypePresets');
    await startImageTypePresetCatalogSync();
    const first = loadImageTypePresetCatalog();
    expect(saveImageTypePresetCatalog({ ...first, presets: customPresets })).toBe(true);
    const third = {
      id: 'custom:expression-c',
      name: '人物表情侧脸',
      category: '人物表情',
      description: '人物侧脸表情',
      prompt: '生成保持身份一致的人物侧脸表情。',
      builtIn: false,
    };
    expect(saveImageTypePresetCatalog({ ...first, presets: [...customPresets, third] })).toBe(true);
    await queueImageTypePresetCatalogSync();

    expect(hostCatalog.presets).toHaveLength(3);
    expect(loadImageTypePresetCatalog().presets.map((preset) => preset.id)).toEqual([
      'custom:expression-a',
      'custom:expression-b',
      'custom:expression-c',
    ]);
  });
});
