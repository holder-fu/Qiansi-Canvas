import { describe, expect, it, vi } from 'vitest';
import {
  BridgeCanvasConflictError,
  BridgeCanvasUnavailableError,
  bridgeSerializableWorkContent,
  claimBridgePrimaryProject,
  localBridgeCanvasValue,
  portableBridgeCanvasValue,
  readBridgeProjectCatalog,
  readBridgeTrash,
  readBridgeWorkspace,
  writeBridgeProject,
  writeBridgeTrash,
  writeBridgeWorkspace,
} from './bridgeCanvasPersistence';
import { placeholderImage } from '../canvas/placeholders';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('bridge canvas persistence', () => {
  it('canonicalizes legacy development-proxy media without duplicating the proxy path', () => {
    const legacy = {
      originalUrl:
        'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_legacy?download=1#t=12',
      previewUrl: 'http://127.0.0.1:2896/__qiansi_bridge/media-preview/files/preview_legacy.webp',
      externalUrl: 'https://cdn.example.test/reference.png',
      localThirdPartyUrl: 'http://127.0.0.1:8188/output/result.png',
    };

    expect(portableBridgeCanvasValue(legacy)).toEqual({
      originalUrl: '/asset-library/files/asset_legacy?download=1#t=12',
      previewUrl: '/media-preview/files/preview_legacy.webp',
      externalUrl: legacy.externalUrl,
      localThirdPartyUrl: legacy.localThirdPartyUrl,
    });
    expect(localBridgeCanvasValue(legacy)).toEqual({
      originalUrl: 'http://127.0.0.1:2895/asset-library/files/asset_legacy?download=1#t=12',
      previewUrl: 'http://127.0.0.1:2895/media-preview/files/preview_legacy.webp',
      externalUrl: legacy.externalUrl,
      localThirdPartyUrl: legacy.localThirdPartyUrl,
    });
  });

  it('reads the single authoritative canvas identity from the Bridge catalog', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        version: 2,
        primaryProjectId: 'main-canvas',
        canvasProjectId: 'main-canvas',
        projects: [
          { id: 'legacy-project', name: '旧项目' },
          { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views' },
        ],
      }),
    ) as unknown as typeof fetch;

    await expect(readBridgeProjectCatalog(fetchImpl)).resolves.toEqual({
      version: 2,
      primaryProjectId: 'main-canvas',
      projects: [
        { id: 'legacy-project', name: '旧项目' },
        { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views' },
      ],
      updatedAt: undefined,
    });
  });

  it('atomically claims only the fixed clean canvas namespace when catalog has no primary', async () => {
    let submitted: unknown;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      submitted = JSON.parse(String(init?.body));
      return jsonResponse({
        primaryProjectId: 'main-canvas',
        canvasProjectId: 'main-canvas',
        project: { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views' },
        claimed: true,
      });
    }) as unknown as typeof fetch;

    await expect(claimBridgePrimaryProject('main-canvas', '我的画布', fetchImpl)).resolves.toEqual({
      primaryProjectId: 'main-canvas',
      project: { id: 'main-canvas', name: '我的画布', activeWorkspace: 'views' },
      claimed: true,
    });
    expect(submitted).toEqual({
      candidateProjectId: 'main-canvas',
      name: '我的画布',
      title: '我的画布',
    });
  });

  it('rejects a primary claim response that switches to another canvas namespace', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        primaryProjectId: 'legacy-project',
        project: { id: 'legacy-project', name: '旧画布' },
        claimed: true,
      }),
    ) as unknown as typeof fetch;

    await expect(claimBridgePrimaryProject('main-canvas', '我的画布', fetchImpl)).rejects.toThrow(
      '不同的主画布标识',
    );
  });

  it('passes node URLs, asset identities and ordering through without rewriting', async () => {
    const workspace = {
      nodes: [
        {
          id: 'image-2',
          data: {
            originalUrl: 'http://127.0.0.1:2895/asset-library/files/original-A',
            previewUrl: '/media-preview/files/preview-A.webp',
            bridgeAssetId: 'original-A',
            images: ['https://cdn.example.test/B.png', '/asset-library/files/original-A'],
          },
        },
        { id: 'image-1', data: { originalUrl: 'https://cdn.example.test/C.png' } },
      ],
      edges: [{ id: 'edge-z', source: 'image-2', target: 'image-1' }],
    };
    const firstNode = workspace.nodes[0];
    if (!firstNode) throw new Error('测试工作台缺少首个图片节点。');
    let submitted: unknown;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      submitted = JSON.parse(String(init?.body));
      return jsonResponse({ workspace, revision: 7 });
    }) as unknown as typeof fetch;

    const result = await writeBridgeWorkspace(
      'project-A',
      'views',
      workspace,
      6,
      undefined,
      fetchImpl,
    );

    expect(submitted).toEqual({
      workspace: {
        ...workspace,
        nodes: [
          {
            ...firstNode,
            data: {
              ...firstNode.data,
              originalUrl: '/asset-library/files/original-A',
            },
          },
          workspace.nodes[1],
        ],
      },
      expectedRevision: 6,
    });
    expect(result.workspace.nodes.map((node) => node.id)).toEqual(['image-2', 'image-1']);
    expect(result.workspace.nodes[0]?.data).toMatchObject({
      bridgeAssetId: 'original-A',
      originalUrl: 'http://127.0.0.1:2895/asset-library/files/original-A',
      previewUrl: 'http://127.0.0.1:2895/media-preview/files/preview-A.webp',
      images: [
        'https://cdn.example.test/B.png',
        'http://127.0.0.1:2895/asset-library/files/original-A',
      ],
    });
    expect(result.revision).toBe(7);
  });

  it('localizes legacy proxy URLs in both workspace nodes and manifest assets', async () => {
    const legacyOriginal =
      'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_manifest';
    const legacyPreview =
      'http://localhost:2895/__qiansi_bridge/media-preview/files/preview_manifest.webp';
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        projectId: 'project-A',
        workspaceId: 'views',
        workspace: {
          nodes: [{ id: 'image-1', data: { imageUrl: legacyOriginal } }],
          edges: [],
        },
        manifest: {
          projectId: 'project-A',
          revision: 12,
          assets: [
            { id: 'asset_manifest', originalUrl: legacyOriginal, previewUrl: legacyPreview },
          ],
        },
        revision: 12,
      }),
    ) as unknown as typeof fetch;

    const result = await readBridgeWorkspace<Record<string, unknown>>(
      'project-A',
      'views',
      fetchImpl,
    );

    expect(result?.workspace).toMatchObject({
      nodes: [
        {
          data: {
            imageUrl: 'http://127.0.0.1:2895/asset-library/files/asset_manifest',
          },
        },
      ],
    });
    expect(result?.manifest?.assets).toEqual([
      {
        id: 'asset_manifest',
        originalUrl: 'http://127.0.0.1:2895/asset-library/files/asset_manifest',
        previewUrl: 'http://127.0.0.1:2895/media-preview/files/preview_manifest.webp',
      },
    ]);
  });

  it('accepts a Bridge readback whose JSON object keys have a different insertion order', async () => {
    const workspace = {
      nodes: [{ id: 'image-1', data: { kind: 'image', title: 'A', prompt: 'B' } }],
      edges: [],
    };
    const reorderedReadback = {
      edges: [],
      nodes: [{ data: { prompt: 'B', title: 'A', kind: 'image' }, id: 'image-1' }],
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ workspace: reorderedReadback, revision: 9 }),
    ) as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace('project-A', 'views', workspace, 8, undefined, fetchImpl),
    ).resolves.toMatchObject({ revision: 9 });
  });

  it('accepts an explicitly conflict-free rebased workspace returned by Bridge', async () => {
    const submitted = {
      nodes: [{ id: 'local-node', data: { kind: 'text', prompt: '本机修改' } }],
      edges: [],
    };
    const merged = {
      nodes: [
        { id: 'remote-node', data: { kind: 'text', prompt: '局域网修改' } },
        ...submitted.nodes,
      ],
      edges: [],
    };
    const project = {
      version: 2,
      projectId: 'project-A',
      projectName: 'Project A',
      workspaces: { views: merged },
      tabs: [],
      assets: [],
      trash: [],
      genParams: {},
      activeTags: [],
      revision: 10,
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ workspace: merged, project, revision: 10, rebased: true }),
    ) as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace('project-A', 'views', submitted, 8, undefined, fetchImpl),
    ).resolves.toMatchObject({ workspace: merged, project, revision: 10, rebased: true });
  });

  it('keeps node and semantic-reference array order significant during readback', async () => {
    const workspace = {
      nodes: [
        { id: 'image-A', data: { kind: 'image' } },
        { id: 'image-B', data: { kind: 'image' } },
      ],
      edges: [],
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        workspace: { ...workspace, nodes: [...workspace.nodes].reverse() },
        revision: 9,
      }),
    ) as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace('project-A', 'views', workspace, 8, undefined, fetchImpl),
    ).rejects.toMatchObject({ name: 'BridgeCanvasConflictError', currentRevision: 9 });
    await expect(
      writeBridgeWorkspace('project-A', 'views', workspace, 8, undefined, fetchImpl),
    ).rejects.toBeInstanceOf(BridgeCanvasConflictError);
  });

  it('saves through Bridge even when every browser persistence API throws', async () => {
    const browserFailure = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const originalLocalStorage = globalThis.localStorage;
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: browserFailure, setItem: browserFailure, removeItem: browserFailure },
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: browserFailure, deleteDatabase: browserFailure },
    });
    const trash = [{ id: 'trash-1', nodes: [], edges: [] }];
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ trash, revision: 3 }),
    ) as unknown as typeof fetch;
    try {
      await expect(writeBridgeTrash('project-A', trash, 2, fetchImpl)).resolves.toMatchObject({
        trash,
        revision: 3,
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: originalIndexedDb,
      });
    }
  });

  it('reports Bridge disconnection as session-only instead of falling back to browser storage', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(readBridgeWorkspace('project-A', 'views', fetchImpl)).rejects.toBeInstanceOf(
      BridgeCanvasUnavailableError,
    );
  });

  it('rejects a workspace payload that identifies a different project or workspace', async () => {
    const wrongProject = vi.fn(async () =>
      jsonResponse({
        projectId: 'project-B',
        workspaceId: 'views',
        workspace: { nodes: [], edges: [] },
        revision: 4,
      }),
    ) as unknown as typeof fetch;
    const wrongWorkspace = vi.fn(async () =>
      jsonResponse({
        projectId: 'project-A',
        workspaceId: 'video',
        workspace: { nodes: [], edges: [] },
        revision: 4,
      }),
    ) as unknown as typeof fetch;

    await expect(readBridgeWorkspace('project-A', 'views', wrongProject)).rejects.toThrow(
      '项目标识不一致',
    );
    await expect(readBridgeWorkspace('project-A', 'views', wrongWorkspace)).rejects.toThrow(
      '工作台标识不一致',
    );
  });

  it('fails closed when a successful workspace response omits its CAS revision', async () => {
    const workspace = { nodes: [], edges: [] };
    const fetchImpl = vi.fn(async () => jsonResponse({ workspace })) as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace('project-A', 'views', workspace, 3, undefined, fetchImpl),
    ).rejects.toThrow('有效修订号');
  });

  it('rejects malformed Bridge trash instead of treating it as an empty recycle bin', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ projectId: 'project-A', trash: { invalid: true }, revision: 5 }),
    ) as unknown as typeof fetch;

    await expect(readBridgeTrash('project-A', fetchImpl)).rejects.toThrow('无效的回收站数据');
  });

  it('fails closed on expectedRevision conflict', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ currentRevision: 11, error: { message: 'revision conflict' } }, 409),
    ) as unknown as typeof fetch;
    await expect(
      writeBridgeProject('project-A', { version: 2 }, 10, 'Project A', fetchImpl),
    ).rejects.toMatchObject({ currentRevision: 11 });
  });

  it.each([
    'blob:https://canvas.test/session-image',
    'data:image/png;base64,AAAA',
    'data:application/octet-stream;base64,AAAA',
    'file:///C:/Users/example/private.png',
    'filesystem:https://canvas.test/temporary/image.png',
    'qiansi-canvas-media://indexeddb/original/legacy',
  ])('projects browser-only media as an explicit session-only node: %s', async (unsafeUrl) => {
    let submittedWorkspace!: { nodes: Array<{ data: Record<string, unknown> }>; edges: unknown[] };
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const submitted = JSON.parse(String(init?.body)) as { workspace: typeof submittedWorkspace };
      submittedWorkspace = submitted.workspace;
      return jsonResponse({ workspace: submitted.workspace, revision: 1 });
    }) as unknown as typeof fetch;
    await expect(
      writeBridgeWorkspace(
        'project-A',
        'views',
        {
          nodes: [
            {
              data: {
                kind: 'video',
                title: '会话视频',
                originalUrl: unsafeUrl,
                videos: [unsafeUrl, '/asset-library/files/stable-video'],
              },
            },
          ],
          edges: [],
        },
        0,
        undefined,
        fetchImpl,
      ),
    ).resolves.toMatchObject({ revision: 1 });
    expect(submittedWorkspace.nodes[0]?.data).toEqual({
      kind: 'video',
      title: '会话视频',
      videos: ['/asset-library/files/stable-video'],
      mediaPersistenceState: 'session-only',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('keeps original upload metadata when projecting a session-only node', async () => {
    let submittedWorkspace!: { nodes: Array<{ data: Record<string, unknown> }>; edges: unknown[] };
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const submitted = JSON.parse(String(init?.body)) as { workspace: typeof submittedWorkspace };
      submittedWorkspace = submitted.workspace;
      return jsonResponse({ workspace: submitted.workspace, revision: 1 });
    }) as unknown as typeof fetch;

    await writeBridgeWorkspace(
      'project-A',
      'audio',
      {
        nodes: [
          {
            data: {
              kind: 'audio',
              title: '采访录音',
              audioFileName: 'interview.webm',
              mediaMimeType: 'audio/webm',
              audioUrl: 'blob:https://canvas.test/session-audio',
              audios: ['blob:https://canvas.test/session-audio'],
            },
          },
        ],
        edges: [],
      },
      0,
      undefined,
      fetchImpl,
    );

    expect(submittedWorkspace.nodes[0]?.data).toEqual({
      kind: 'audio',
      title: '采访录音',
      audioFileName: 'interview.webm',
      mediaMimeType: 'audio/webm',
      audios: [],
      mediaPersistenceState: 'session-only',
      audioSourceState: 'unavailable-after-restore',
    });
  });

  it('scopes transient media from new or nested fields to its owning node record', async () => {
    let submittedWorkspace!: { nodes: Array<{ data: Record<string, unknown> }>; edges: unknown[] };
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const submitted = JSON.parse(String(init?.body)) as { workspace: typeof submittedWorkspace };
      submittedWorkspace = submitted.workspace;
      return jsonResponse({ workspace: submitted.workspace, revision: 1 });
    }) as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace(
        'project-A',
        'views',
        {
          nodes: [
            {
              data: {
                kind: 'audio',
                title: '插件生成音频',
                futureWaveformSource: 'blob:https://canvas.test/future-waveform',
                rendererState: {
                  cachedMediaSource: 'data:audio/wav;base64,UklGRg==',
                  stableLabel: '波形缓存',
                },
                audioUrl: '/asset-library/files/stable-audio',
              },
            },
          ],
          edges: [],
        },
        0,
        undefined,
        fetchImpl,
      ),
    ).resolves.toMatchObject({ revision: 1 });

    expect(submittedWorkspace.nodes[0]?.data).toEqual({
      kind: 'audio',
      title: '插件生成音频',
      rendererState: { stableLabel: '波形缓存' },
      audioUrl: '/asset-library/files/stable-audio',
      mediaPersistenceState: 'session-only',
      audioSourceState: 'unavailable-after-restore',
    });
  });

  it('scopes transient media from future fields to its owning asset record', () => {
    expect(
      bridgeSerializableWorkContent({
        assets: [
          {
            id: 'asset-audio-1',
            kind: 'audio',
            category: 'audio',
            audioUrl: '/asset-library/files/stable-audio',
            futureWaveformSource: 'blob:https://canvas.test/asset-waveform',
          },
        ],
      }),
    ).toEqual({
      assets: [
        {
          id: 'asset-audio-1',
          kind: 'audio',
          category: 'audio',
          audioUrl: '/asset-library/files/stable-audio',
          mediaPersistenceState: 'session-only',
          audioSourceState: 'unavailable-after-restore',
        },
      ],
    });
  });

  it('fails closed when transient media is not owned by a node, asset, or reference record', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace(
        'project-A',
        'views',
        { nodes: [], edges: [], detachedPreview: 'blob:https://canvas.test/unowned' },
        0,
        undefined,
        fetchImpl,
      ),
    ).rejects.toThrow('无法归属到节点或素材');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed before writing a manifest with an unscoped transient value', async () => {
    const workspace = { nodes: [], edges: [] };
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace(
        'project-A',
        'views',
        workspace,
        0,
        { detachedPreview: 'blob:https://canvas.test/unowned-manifest' },
        fetchImpl,
      ),
    ).rejects.toThrow('无法归属到节点或素材');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed before writing trash with an unscoped transient value', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await expect(
      writeBridgeTrash(
        'project-A',
        [{ id: 'trash-1', detachedPreview: 'blob:https://canvas.test/unowned-trash' }],
        0,
        fetchImpl,
      ),
    ).rejects.toThrow('无法归属到节点或素材');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not mistake prompt text containing data: for an embedded media URL', async () => {
    const workspace = {
      nodes: [{ data: { prompt: 'Return metadata: image/png is not a URL.' } }],
      edges: [],
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ workspace, revision: 1 }),
    ) as unknown as typeof fetch;
    await expect(
      writeBridgeWorkspace('project-A', 'views', workspace, 0, undefined, fetchImpl),
    ).resolves.toMatchObject({ revision: 1 });
  });

  it('preserves file/data-prefixed text fields while projecting only explicit media fields', async () => {
    let submittedWorkspace!: { nodes: Array<{ data: Record<string, unknown> }>; edges: unknown[] };
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const submitted = JSON.parse(String(init?.body)) as { workspace: typeof submittedWorkspace };
      submittedWorkspace = submitted.workspace;
      return jsonResponse({ workspace: submitted.workspace, revision: 1 });
    }) as unknown as typeof fetch;

    await writeBridgeWorkspace(
      'project-A',
      'views',
      {
        nodes: [
          {
            data: {
              kind: 'image',
              prompt: 'file:///C:/shot.png',
              result: 'data:说明',
              description: 'data:text/plain,这是一段说明，不是媒体',
              originalUrl: 'blob:https://canvas.test/session-image',
            },
          },
        ],
        edges: [],
      },
      0,
      undefined,
      fetchImpl,
    );

    expect(submittedWorkspace.nodes[0]?.data).toEqual({
      kind: 'image',
      prompt: 'file:///C:/shot.png',
      result: 'data:说明',
      description: 'data:text/plain,这是一段说明，不是媒体',
      mediaPersistenceState: 'session-only',
    });
  });

  it('allows only known built-in placeholder SVGs as non-session UI metadata', async () => {
    const workspace = {
      nodes: [{ data: { kind: 'audio', imageUrl: placeholderImage('audio').imageUrl } }],
      edges: [],
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ workspace, revision: 1 }),
    ) as unknown as typeof fetch;

    await expect(
      writeBridgeWorkspace('project-A', 'audio', workspace, 0, undefined, fetchImpl),
    ).resolves.toMatchObject({ revision: 1 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
