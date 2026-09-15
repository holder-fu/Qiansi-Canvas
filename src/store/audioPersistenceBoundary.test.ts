import { beforeEach, describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { itemMedia } from '../components/trashPreview';
import { resolvedAudioSource } from '../lib/mediaPreview';
import {
  applySharedProjectWorkspace,
  assetSessionMediaUnavailable,
  useCanvasStore,
  type AssetItem,
  type SharedProjectWorkspace,
  type TrashItem,
} from './canvasStore';

const expiredUrl = 'blob:http://127.0.0.1/expired-audio';
const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  },
});

function audioNode(id: string, bridgeAssetId?: string): FlowNode {
  return {
    id,
    type: 'audio',
    position: { x: 0, y: 0 },
    data: {
      kind: 'audio',
      title: id,
      audioUrl: expiredUrl,
      audios: [expiredUrl],
      output: expiredUrl,
      audioFileName: `${id}.webm`,
      bridgeAssetId,
    },
  };
}

function audioAsset(id: string, bridgeAssetId?: string): AssetItem {
  return {
    id,
    title: id,
    kind: 'audio',
    category: 'audio',
    createdAt: 1,
    audioUrl: expiredUrl,
    audios: [expiredUrl],
    audioFileName: `${id}.webm`,
    bridgeAssetId,
  };
}

function trashItem(id: string, node = audioNode(`${id}-audio`)): TrashItem {
  return {
    id,
    projectId: 'audio-project',
    workspace: 'views',
    title: id,
    deletedAt: 1,
    nodes: [node],
    edges: [],
  };
}

function sharedWorkspace(overrides: Partial<SharedProjectWorkspace> = {}): SharedProjectWorkspace {
  const state = useCanvasStore.getState();
  return {
    version: 2,
    projectId: state.activeProjectId,
    projectName: state.projectName,
    workspaces: { views: { nodes: [], edges: [] } },
    tabs: state.tabs,
    assets: [],
    trash: [],
    genParams: state.genParams,
    activeTags: [],
    ...overrides,
  };
}

describe('persisted audio store boundaries', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [],
      edges: [],
      past: [],
      future: [],
      activeProjectId: 'audio-project',
      projectName: 'Audio project',
      projects: [{ id: 'audio-project', name: 'Audio project' }],
      tabs: [{ id: 'audio-tab', name: 'Audio', workspace: 'views' }],
      activeTabId: 'audio-tab',
      assets: [],
      trash: [],
    });
  });

  it('persists a session-only asset as unavailable without invalidating its live copy', () => {
    const node = audioNode('saved-session-only');
    node.data.mediaPersistenceState = 'session-only';
    node.data.mediaMimeType = 'audio/webm';
    useCanvasStore.setState({ nodes: [node], assets: [] });

    useCanvasStore.getState().saveAsset(node.id, 'audio');

    const liveAsset = useCanvasStore.getState().assets[0];
    expect(liveAsset && resolvedAudioSource(liveAsset)).toBe(expiredUrl);
    expect(liveAsset?.audioSourceState).toBeUndefined();
    expect(liveAsset).toMatchObject({
      mediaPersistenceState: 'session-only',
      mediaMimeType: 'audio/webm',
    });
    const persisted = JSON.parse(
      globalThis.localStorage.getItem('kitty-canvas-assets:audio-project') || '[]',
    ) as AssetItem[];
    expect(persisted[0]).toMatchObject({
      audioUrl: expiredUrl,
      audioSourceState: 'unavailable-after-restore',
      mediaPersistenceState: 'session-only',
      mediaMimeType: 'audio/webm',
    });
    expect(persisted[0] && resolvedAudioSource(persisted[0])).toBeUndefined();
  });

  it('keeps a session-only asset live across project switches in the same browser session', () => {
    const liveProjectId = 'audio-live-asset-project';
    const otherProjectId = 'audio-other-asset-project';
    const node = audioNode('live-roundtrip');
    useCanvasStore.setState({
      activeProjectId: liveProjectId,
      projectName: 'Live audio',
      projects: [
        { id: liveProjectId, name: 'Live audio' },
        { id: otherProjectId, name: 'Other project' },
      ],
      nodes: [node],
      assets: [],
    });

    useCanvasStore.getState().saveAsset(node.id, 'audio');
    useCanvasStore.getState().switchProject(otherProjectId);
    useCanvasStore.getState().switchProject(liveProjectId);

    const restoredLiveAsset = useCanvasStore.getState().assets[0];
    expect(restoredLiveAsset && resolvedAudioSource(restoredLiveAsset)).toBe(expiredUrl);
    expect(restoredLiveAsset?.audioSourceState).toBeUndefined();
  });

  it('recovers project assets on load and carries availability into canvas nodes', () => {
    const restoredProjectId = 'audio-restored-assets';
    globalThis.localStorage.setItem(
      `kitty-canvas-assets:${restoredProjectId}`,
      JSON.stringify([audioAsset('session-asset'), audioAsset('durable-asset', 'asset_123456')]),
    );
    useCanvasStore.setState({
      projects: [
        { id: 'audio-project', name: 'Audio project' },
        { id: restoredProjectId, name: 'Restored audio' },
      ],
    });

    useCanvasStore.getState().switchProject(restoredProjectId);

    const [sessionAsset, durableAsset] = useCanvasStore.getState().assets;
    expect(sessionAsset).toMatchObject({
      audioUrl: expiredUrl,
      audioSourceState: 'unavailable-after-restore',
    });
    expect(sessionAsset && resolvedAudioSource(sessionAsset)).toBeUndefined();
    expect(durableAsset).toMatchObject({
      audioUrl: '/asset-library/files/asset_123456',
      audios: ['/asset-library/files/asset_123456'],
      bridgeAssetId: 'asset_123456',
    });
    expect(durableAsset && resolvedAudioSource(durableAsset)).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_123456',
    );

    if (!sessionAsset || !durableAsset) throw new Error('Expected restored audio assets.');
    useCanvasStore.getState().addAssetToCanvas(sessionAsset.id, { x: 10, y: 20 });
    useCanvasStore.getState().addAssetToCanvas(durableAsset.id, { x: 30, y: 40 });
    const placedSession = useCanvasStore
      .getState()
      .nodes.find((placedNode) => placedNode.data.title === sessionAsset.title);
    const placedDurable = useCanvasStore
      .getState()
      .nodes.find((placedNode) => placedNode.data.title === durableAsset.title);
    expect(assetSessionMediaUnavailable(sessionAsset)).toBe(true);
    expect(placedSession).toBeUndefined();
    expect(placedDurable?.data.output).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_123456',
    );
  });

  it('recovers remote LAN assets and trash while preserving matching local live Blobs', () => {
    const liveAsset = audioAsset('shared-asset');
    const liveTrash = trashItem('shared-trash');
    useCanvasStore.setState({ assets: [liveAsset], trash: [liveTrash] });

    expect(
      applySharedProjectWorkspace(
        sharedWorkspace({
          assets: [audioAsset('shared-asset')],
          trash: [trashItem('shared-trash')],
        }),
      ),
    ).toBe(true);
    const echoedAsset = useCanvasStore.getState().assets[0];
    const echoedTrashNode = useCanvasStore.getState().trash[0]?.nodes[0];
    expect(echoedAsset?.audioSourceState).toBeUndefined();
    expect(echoedAsset && resolvedAudioSource(echoedAsset)).toBe(expiredUrl);
    expect(echoedTrashNode?.data.audioSourceState).toBeUndefined();
    expect(echoedTrashNode && resolvedAudioSource(echoedTrashNode.data)).toBe(expiredUrl);
    const echoedTrash = useCanvasStore.getState().trash[0];
    expect(echoedTrash && itemMedia(echoedTrash)).toEqual({ type: 'audio', url: expiredUrl });

    useCanvasStore.setState({ assets: [], trash: [] });
    expect(
      applySharedProjectWorkspace(
        sharedWorkspace({
          assets: [audioAsset('shared-asset'), audioAsset('durable-shared', 'asset_654321')],
          trash: [trashItem('shared-trash')],
        }),
      ),
    ).toBe(true);
    const [remoteSessionAsset, remoteDurableAsset] = useCanvasStore.getState().assets;
    const remoteTrash = useCanvasStore.getState().trash[0];
    expect(remoteSessionAsset?.audioSourceState).toBe('unavailable-after-restore');
    expect(remoteSessionAsset && resolvedAudioSource(remoteSessionAsset)).toBeUndefined();
    expect(remoteDurableAsset).toMatchObject({
      audioUrl: '/asset-library/files/asset_654321',
      audioSourceState: undefined,
    });
    expect(remoteTrash?.nodes[0]?.data.audioSourceState).toBe('unavailable-after-restore');
    expect(remoteTrash && itemMedia(remoteTrash)).toBeNull();
  });

  it('replaces only the active project source slice when applying a LAN snapshot', () => {
    const activeProjectId = useCanvasStore.getState().activeProjectId;
    const currentAsset = { ...audioAsset('current-source'), sourceProjectId: activeProjectId };
    const otherAsset = { ...audioAsset('other-source'), sourceProjectId: 'other-project' };
    useCanvasStore.setState({ assets: [currentAsset, otherAsset] });

    expect(
      applySharedProjectWorkspace(
        sharedWorkspace({ assets: [audioAsset('incoming-current-source')] }),
      ),
    ).toBe(true);

    expect(useCanvasStore.getState().assets.find((asset) => asset.id === currentAsset.id)).toBe(
      undefined,
    );
    expect(
      useCanvasStore.getState().assets.find((asset) => asset.id === otherAsset.id),
    ).toMatchObject({ sourceProjectId: 'other-project' });
    expect(
      useCanvasStore.getState().assets.find((asset) => asset.id === 'incoming-current-source'),
    ).toMatchObject({ sourceProjectId: activeProjectId });
  });

  it('matches a local live Blob carried only by the incoming trash-node output', () => {
    const liveOutputUrl = 'blob:http://127.0.0.1/live-output-audio';
    const stableUrl = 'https://cdn.example.test/persisted-audio.mp3';
    const currentNode = audioNode('output-match');
    currentNode.data = {
      ...currentNode.data,
      audioUrl: liveOutputUrl,
      audios: [liveOutputUrl],
      output: liveOutputUrl,
    };
    const incomingNode = audioNode('output-match');
    incomingNode.data = {
      ...incomingNode.data,
      audioUrl: stableUrl,
      audios: [stableUrl],
      output: liveOutputUrl,
    };
    useCanvasStore.setState({ trash: [trashItem('trash-output-match', currentNode)] });

    expect(
      applySharedProjectWorkspace(
        sharedWorkspace({ trash: [trashItem('trash-output-match', incomingNode)] }),
      ),
    ).toBe(true);

    expect(useCanvasStore.getState().trash[0]?.nodes[0]?.data).toMatchObject({
      audioUrl: liveOutputUrl,
      output: liveOutputUrl,
      audioSourceState: undefined,
    });
  });

  it('recovers direct workflow imports before they enter live canvas state', () => {
    useCanvasStore
      .getState()
      .importWorkflow([audioNode('durable', 'asset_123456'), audioNode('session-only')], []);

    const durableNode = useCanvasStore.getState().nodes.find((node) => node.id === 'durable');
    const unavailableNode = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === 'session-only');
    if (!durableNode || !unavailableNode) throw new Error('Expected imported audio nodes.');
    const durable = durableNode.data;
    const unavailable = unavailableNode.data;
    expect(durable.audioUrl).toBe('/asset-library/files/asset_123456');
    expect(unavailable).toMatchObject({
      audioUrl: expiredUrl,
      audioFileName: 'session-only.webm',
      audioSourceState: 'unavailable-after-restore',
    });
    expect(resolvedAudioSource(unavailable)).toBeUndefined();
  });

  it('applies the same recovery contract to incoming shared project snapshots', () => {
    const state = useCanvasStore.getState();
    expect(
      applySharedProjectWorkspace({
        version: 2,
        projectId: state.activeProjectId,
        projectName: state.projectName,
        workspaces: {
          views: {
            nodes: [audioNode('shared-session-only')],
            edges: [],
          },
        },
        tabs: state.tabs,
        assets: [],
        trash: [],
        genParams: state.genParams,
        activeTags: [],
      }),
    ).toBe(true);

    const sharedNode = useCanvasStore.getState().nodes[0];
    if (!sharedNode) throw new Error('Expected shared audio node.');
    const data = sharedNode.data;
    expect(data).toMatchObject({
      audioUrl: expiredUrl,
      audioSourceState: 'unavailable-after-restore',
    });
    expect(resolvedAudioSource(data)).toBeUndefined();
  });

  it("keeps the originating terminal's matching live Blob usable after its own LAN write", () => {
    const liveNode = audioNode('live-session');
    useCanvasStore.setState({ nodes: [liveNode] });
    const state = useCanvasStore.getState();

    expect(
      applySharedProjectWorkspace({
        version: 2,
        projectId: state.activeProjectId,
        projectName: state.projectName,
        workspaces: { views: { nodes: [audioNode('live-session')], edges: [] } },
        tabs: state.tabs,
        assets: [],
        trash: [],
        genParams: state.genParams,
        activeTags: [],
      }),
    ).toBe(true);

    const data = useCanvasStore.getState().nodes[0]?.data;
    expect(data?.audioSourceState).toBeUndefined();
    expect(data && resolvedAudioSource(data)).toBe(expiredUrl);
  });

  it('preserves a live image node and asset when the Bridge echo contains only session markers', () => {
    const imageUrl = 'blob:http://127.0.0.1/live-image';
    const liveNode: FlowNode = {
      id: 'live-image',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '会话图片',
        originalUrl: imageUrl,
        imageUrl,
        images: [imageUrl],
        output: imageUrl,
        mediaPersistenceState: 'session-only',
      },
    };
    const liveAsset: AssetItem = {
      id: 'live-image-asset',
      title: '会话图片',
      kind: 'image',
      category: 'character',
      createdAt: 1,
      originalUrl: imageUrl,
      imageUrl,
      images: [imageUrl],
      mediaPersistenceState: 'session-only',
    };
    useCanvasStore.setState({ nodes: [liveNode], assets: [liveAsset] });
    const state = useCanvasStore.getState();
    const projectedNode: FlowNode = {
      ...liveNode,
      data: {
        kind: 'image',
        title: '会话图片',
        mediaPersistenceState: 'session-only',
      },
    };
    const projectedAsset: AssetItem = {
      id: liveAsset.id,
      title: liveAsset.title,
      kind: liveAsset.kind,
      category: liveAsset.category,
      createdAt: liveAsset.createdAt,
      mediaPersistenceState: 'session-only',
    };

    expect(
      applySharedProjectWorkspace({
        version: 2,
        projectId: state.activeProjectId,
        projectName: state.projectName,
        workspaces: { views: { nodes: [projectedNode], edges: [] } },
        tabs: state.tabs,
        assets: [projectedAsset],
        trash: [],
        genParams: state.genParams,
        activeTags: [],
      }),
    ).toBe(true);

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      originalUrl: imageUrl,
      imageUrl,
      output: imageUrl,
      mediaPersistenceState: 'session-only',
    });
    expect(useCanvasStore.getState().assets[0]).toMatchObject({
      originalUrl: imageUrl,
      imageUrl,
      mediaPersistenceState: 'session-only',
    });
  });

  it('refuses to place an empty restored session image asset on the canvas', () => {
    const unavailableAsset: AssetItem = {
      id: 'unavailable-image',
      title: '需重传图片',
      kind: 'image',
      category: 'character',
      createdAt: 1,
      mediaPersistenceState: 'session-only',
    };
    useCanvasStore.setState({ assets: [unavailableAsset], nodes: [] });

    expect(assetSessionMediaUnavailable(unavailableAsset)).toBe(true);
    useCanvasStore.getState().addAssetToCanvas(unavailableAsset.id, { x: 10, y: 20 });
    expect(useCanvasStore.getState().nodes).toEqual([]);
  });
});
