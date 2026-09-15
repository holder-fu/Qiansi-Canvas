import { describe, expect, it, vi } from 'vitest';
import {
  commitLegacyMediaAfterStorageCas,
  legacyCopiesMatchBridge,
  legacyManifestPatchConflictField,
} from './canvasLegacyMigrationGuard';

describe('legacy canvas migration cleanup guard', () => {
  it('does not delete IndexedDB media when any root or split changed before commit', async () => {
    const values = new Map([
      ['kitty-canvas-state', 'root-v1'],
      ['kitty-canvas-workspace-state:project-1:views', 'views-v2'],
    ]);
    const commit = vi.fn(async () => {});
    const entries = [...values].map(([key, raw]) => ({ key, raw }));
    values.set('kitty-canvas-workspace-state:project-1:views', 'views-v3');

    await expect(
      commitLegacyMediaAfterStorageCas(
        { getItem: (key) => values.get(key) ?? null },
        entries,
        commit,
      ),
    ).rejects.toThrow('迁移期间发生变化');
    expect(commit).not.toHaveBeenCalled();
  });

  it('catches a root mutation fault injected while the first CAS pass is reading splits', async () => {
    const values = new Map([
      ['kitty-canvas-state', 'root-v1'],
      ['kitty-canvas-workspace-state:project-1:views', 'views-v1'],
    ]);
    let splitReads = 0;
    const commit = vi.fn(async () => {});

    await expect(
      commitLegacyMediaAfterStorageCas(
        {
          getItem: (key) => {
            if (key.includes('workspace-state') && splitReads++ === 0) {
              values.set('kitty-canvas-state', 'root-v2');
            }
            return values.get(key) ?? null;
          },
        },
        [
          { key: 'kitty-canvas-state', raw: 'root-v1' },
          { key: 'kitty-canvas-workspace-state:project-1:views', raw: 'views-v1' },
        ],
        commit,
      ),
    ).rejects.toThrow('迁移期间发生变化');
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits cleanup only after every captured source remains unchanged', async () => {
    const values = new Map([
      ['kitty-canvas-state', 'root-v1'],
      ['kitty-canvas-workspace-state:project-1:views', 'views-v2'],
    ]);
    const commit = vi.fn(async () => {});
    await commitLegacyMediaAfterStorageCas(
      { getItem: (key) => values.get(key) ?? null },
      [...values].map(([key, raw]) => ({ key, raw })),
      commit,
    );
    expect(commit).toHaveBeenCalledOnce();
  });

  it('allows old trash cleanup only when every existing copy matches Bridge', () => {
    const remote = [{ id: 'trash-1', nodes: [], edges: [] }];
    expect(legacyCopiesMatchBridge(remote, [remote, structuredClone(remote)])).toBe(true);
    expect(
      legacyCopiesMatchBridge(remote, [remote, [{ id: 'trash-2', nodes: [], edges: [] }]]),
    ).toBe(false);
  });

  it('fails closed before a legacy patch can overwrite non-empty Bridge manifest fields', () => {
    const patch = {
      projectName: '旧项目名',
      name: '旧项目名',
      title: '旧项目名',
      tabs: [{ id: 'legacy-tab' }],
      activeTags: ['legacy'],
      assets: [{ id: 'legacy-asset' }],
    };

    expect(
      legacyManifestPatchConflictField(
        {
          projectName: '主机项目名',
          tabs: [{ id: 'host-tab' }],
          activeTags: ['host'],
          assets: [{ id: 'host-asset' }],
        },
        patch,
      ),
    ).toBe('projectName');
    expect(
      legacyManifestPatchConflictField(
        { projectName: '旧项目名', tabs: [{ id: 'host-tab' }] },
        patch,
      ),
    ).toBe('tabs');
  });

  it('allows a legacy manifest patch only when host values are empty or equivalent', () => {
    const patch = {
      projectName: '旧项目名',
      name: '旧项目名',
      title: '旧项目名',
      currentWorkspace: 'views' as const,
      workspace: 'views' as const,
      tabs: [{ id: 'legacy-tab' }],
      activeTags: ['legacy'],
    };

    expect(
      legacyManifestPatchConflictField(
        { projectName: '', tabs: [], activeTags: [], currentWorkspace: 'views' },
        patch,
      ),
    ).toBeUndefined();
    expect(
      legacyManifestPatchConflictField(
        {
          projectName: '旧项目名',
          tabs: [{ id: 'legacy-tab' }],
          activeTags: ['legacy'],
          activeWorkspace: 'views',
        },
        patch,
      ),
    ).toBeUndefined();
  });
});
