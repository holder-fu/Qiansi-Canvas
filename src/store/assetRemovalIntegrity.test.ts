import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { cleanupRemovedAssetAfterCommit } from './assetRemovalTransaction';

const mocks = vi.hoisted(() => ({
  deleteAssetVideo: vi.fn(),
  deleteBridgeAsset: vi.fn(),
}));

vi.mock('../lib/libraryMedia', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, deleteAssetVideo: mocks.deleteAssetVideo };
});

vi.mock('../services/assetLibrary', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, deleteBridgeAsset: mocks.deleteBridgeAsset };
});

import { useCanvasStore, type AssetItem } from './canvasStore';

const storedAsset: AssetItem = {
  id: 'asset-record-id',
  title: '视频素材',
  kind: 'video',
  category: 'video',
  createdAt: 1,
  videoStorageId: 'real-video-storage-id',
  bridgeAssetId: 'bridge_asset_123456',
  videoUrl: 'https://example.test/video.mp4',
};

describe('asset removal media integrity', () => {
  beforeEach(() => {
    mocks.deleteAssetVideo.mockReset();
    mocks.deleteAssetVideo.mockImplementation(async () => {});
    mocks.deleteBridgeAsset.mockReset();
    mocks.deleteBridgeAsset.mockImplementation(async () => {});
    useCanvasStore.setState({
      activeProjectId: 'asset-removal-project',
      projects: [{ id: 'asset-removal-project', name: '素材删除测试' }],
      workspace: 'views',
      nodes: [],
      edges: [],
      assets: [storedAsset],
      trash: [],
    });
  });

  it('deletes the real persisted identifiers instead of the asset record id', async () => {
    await cleanupRemovedAssetAfterCommit({
      removed: storedAsset,
      commitCatalog: async () => true,
      wasRestored: () => false,
      collectReferences: async () => ({
        complete: true,
        browserVideoIds: new Set(),
        bridgeAssetIds: new Set(),
      }),
      deleteBrowserVideo: mocks.deleteAssetVideo,
      deleteBridgeAsset: mocks.deleteBridgeAsset,
    });

    expect(mocks.deleteAssetVideo).toHaveBeenCalledWith('real-video-storage-id');
    expect(mocks.deleteBridgeAsset).toHaveBeenCalledWith('bridge_asset_123456');
  });

  it('keeps persisted media while a canvas node still references it', async () => {
    const canvasReference: FlowNode = {
      id: 'video-reference',
      type: 'video',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        title: '画布视频',
        assetVideoId: 'real-video-storage-id',
        bridgeAssetId: 'bridge_asset_123456',
      },
    };
    useCanvasStore.setState({ nodes: [canvasReference] });

    useCanvasStore.getState().removeAsset(storedAsset.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.deleteAssetVideo).not.toHaveBeenCalled();
    expect(mocks.deleteBridgeAsset).not.toHaveBeenCalled();
  });

  it('keeps the physical asset when the project catalog cannot be committed', async () => {
    const collectReferences = vi.fn();
    await cleanupRemovedAssetAfterCommit({
      removed: storedAsset,
      commitCatalog: async () => false,
      wasRestored: () => false,
      collectReferences,
      deleteBrowserVideo: mocks.deleteAssetVideo,
      deleteBridgeAsset: mocks.deleteBridgeAsset,
    });

    expect(collectReferences).not.toHaveBeenCalled();
    expect(mocks.deleteAssetVideo).not.toHaveBeenCalled();
    expect(mocks.deleteBridgeAsset).not.toHaveBeenCalled();
  });
});
