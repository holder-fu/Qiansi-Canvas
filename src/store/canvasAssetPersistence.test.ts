import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasMediaAssetLike } from '../lib/canvasMediaMigration';

vi.mock('../services/canvasMediaPersistence', () => ({
  prepareCanvasAssetItemsForPersistence: vi.fn(async (items: CanvasMediaAssetLike[]) => ({
    items,
    embeddedImageCount: 0,
    uniqueImageCount: 0,
    resolutions: new Map(),
  })),
}));

import {
  CanvasAssetPersistenceConflictError,
  commitPreparedCanvasAssetCatalog,
  prepareCanvasAssetCatalog,
} from './canvasAssetPersistence';

afterEach(() => vi.clearAllMocks());

function memoryStorage(entries: Array<[string, string]> = []) {
  const values = new Map(entries);
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage,
  };
}

describe('canvas asset catalog persistence', () => {
  it('compacts the only legacy copy before adding the project-scoped catalog', async () => {
    const largeLegacy = JSON.stringify([{ id: 'asset-1', imageUrl: 'x'.repeat(8_000) }]);
    const compactItems = [{ id: 'asset-1', imageUrl: '/asset-library/files/original-asset' }];
    const { storage, values } = memoryStorage([['kitty-canvas-assets', largeLegacy]]);
    const plan = await prepareCanvasAssetCatalog({
      projectId: 'project-a',
      items: compactItems,
      storage,
      scopedKey: 'kitty-canvas-assets:project-a',
      legacyKeys: ['kitty-canvas-assets'],
      migrationMarkerKey: 'kitty-canvas-assets-project-migrated',
    });

    const committed = commitPreparedCanvasAssetCatalog(storage, plan);

    expect(committed).toEqual(compactItems);
    expect(values.get('kitty-canvas-assets:project-a')).toBe(JSON.stringify(compactItems));
    expect(values.has('kitty-canvas-assets')).toBe(false);
    expect(values.get('kitty-canvas-assets-project-migrated')).toBe('1');
  });

  it('fails closed when a newer scoped or legacy catalog appears', async () => {
    const { storage, values } = memoryStorage([
      ['kitty-canvas-assets', '[{"id":"legacy"}]'],
      ['kitty-canvas-assets:project-a', '[{"id":"old"}]'],
    ]);
    const plan = await prepareCanvasAssetCatalog({
      projectId: 'project-a',
      items: [{ imageUrl: '/asset-library/files/asset-1' }],
      storage,
      scopedKey: 'kitty-canvas-assets:project-a',
      legacyKeys: ['kitty-canvas-assets'],
    });
    values.set('kitty-canvas-assets:project-a', '[{"id":"newer"}]');

    expect(() => commitPreparedCanvasAssetCatalog(storage, plan)).toThrow(
      CanvasAssetPersistenceConflictError,
    );
    expect(values.get('kitty-canvas-assets:project-a')).toBe('[{"id":"newer"}]');
    expect(values.get('kitty-canvas-assets')).toBe('[{"id":"legacy"}]');
  });

  it('does not overwrite a different non-authoritative legacy catalog', async () => {
    const primary = '[{"id":"primary"}]';
    const different = '[{"id":"different"}]';
    const { storage, values } = memoryStorage([
      ['kitty-canvas-assets', primary],
      ['libtv-canvas-assets', different],
    ]);
    const items = [{ imageUrl: '/asset-library/files/original-asset' }];
    const plan = await prepareCanvasAssetCatalog({
      projectId: 'project-a',
      items,
      storage,
      scopedKey: 'kitty-canvas-assets:project-a',
      legacyKeys: ['kitty-canvas-assets', 'libtv-canvas-assets'],
    });

    commitPreparedCanvasAssetCatalog(storage, plan);

    expect(values.has('kitty-canvas-assets')).toBe(false);
    expect(values.get('libtv-canvas-assets')).toBe(different);
    expect(values.get('kitty-canvas-assets:project-a')).toBe(JSON.stringify(items));
  });
});
