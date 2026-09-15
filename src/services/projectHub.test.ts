import { describe, expect, it, vi } from 'vitest';
import {
  archiveProject,
  createProject,
  createProjectFolder,
  deleteProjectFolder,
  duplicateProject,
  listProjects,
  moveProjectToFolder,
  renameProject,
  updateProjectCover,
  uploadProjectCover,
  type ProjectCatalog,
  type ProjectFolder,
  type ProjectSummary,
} from './projectHub';

const mainProject: ProjectSummary = {
  id: 'main-canvas',
  name: '我的画布',
  createdAt: 100,
  updatedAt: 200,
  revision: 4,
  activeWorkspace: 'views',
};

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'project_alpha',
    name: '项目 Alpha',
    createdAt: 300,
    updatedAt: 400,
    revision: 1,
    activeWorkspace: 'views',
    ...overrides,
  };
}

function folder(overrides: Partial<ProjectFolder> = {}): ProjectFolder {
  return {
    id: 'folder_alpha',
    name: '动画项目',
    createdAt: 250,
    updatedAt: 260,
    ...overrides,
  };
}

function catalog(
  projects: ProjectSummary[] = [mainProject],
  folders: ProjectFolder[] = [],
  overrides: Partial<ProjectCatalog> = {},
): ProjectCatalog {
  return {
    version: 2,
    catalogRevision: 7,
    primaryProjectId: 'main-canvas',
    projects,
    folders,
    updatedAt: 500,
    ...overrides,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mutationPayload(item: ProjectSummary, nextCatalog: ProjectCatalog) {
  return {
    project: item,
    projectId: item.id,
    revision: item.revision,
    manifest: { projectId: item.id, revision: item.revision },
    catalog: nextCatalog,
  };
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(String((fetchMock.mock.calls[call]?.[1] as RequestInit | undefined)?.body));
}

describe('projectHub', () => {
  it('lists a strictly validated catalog and localizes its managed cover URL', async () => {
    const coverProject = project({
      folderId: 'folder_alpha',
      coverAssetId: 'asset_cover_123456',
      coverUrl: '/asset-library/files/asset_cover_123456',
    });
    const fetchMock = vi.fn(async () =>
      jsonResponse(catalog([mainProject, coverProject], [folder()])),
    ) as typeof fetch | ReturnType<typeof vi.fn>;

    const result = await listProjects({ fetchImpl: fetchMock as typeof fetch });

    expect(result.projects[1]).toMatchObject({
      id: 'project_alpha',
      folderId: 'folder_alpha',
      coverAssetId: 'asset_cover_123456',
      coverUrl: 'http://127.0.0.1:2895/asset-library/files/asset_cover_123456',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/projects',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('reports a standalone frontend response as a missing Bridge instead of an invalid catalog', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<!doctype html><title>Qiansi-Canvas</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    );

    await expect(listProjects({ fetchImpl: fetchMock as typeof fetch })).rejects.toThrow(
      '当前页面只连接到了前端服务，项目 Bridge 未连接。请使用完整开发模式并打开 2895 端口。',
    );
  });

  it('accepts a stable Bridge-managed preview as a project cover', async () => {
    const coverProject = project({
      coverAssetId: 'preview_123456789abc',
      coverUrl: '/media-preview/files/preview_123456789abc.webp',
    });
    const fetchMock = vi.fn(async () => jsonResponse(catalog([mainProject, coverProject])));

    await expect(listProjects({ fetchImpl: fetchMock as typeof fetch })).resolves.toMatchObject({
      projects: [
        mainProject,
        {
          coverAssetId: 'preview_123456789abc',
          coverUrl: 'http://127.0.0.1:2895/media-preview/files/preview_123456789abc.webp',
        },
      ],
    });
  });

  it('accepts a Bridge-derived canvas image as an automatic 16:9 card cover', async () => {
    const autoCoverProject = project({
      autoCoverAssetId: 'preview_auto12345678',
      autoCoverUrl: '/media-preview/files/preview_auto12345678.webp',
    });
    const fetchMock = vi.fn(async () => jsonResponse(catalog([mainProject, autoCoverProject])));

    await expect(listProjects({ fetchImpl: fetchMock as typeof fetch })).resolves.toMatchObject({
      projects: [
        mainProject,
        {
          autoCoverAssetId: 'preview_auto12345678',
          autoCoverUrl: 'http://127.0.0.1:2895/media-preview/files/preview_auto12345678.webp',
        },
      ],
    });
  });

  it.each([
    ['duplicate project IDs', catalog([mainProject, { ...mainProject }])],
    ['a missing folder reference', catalog([mainProject, project({ folderId: 'folder_missing' })])],
    [
      'a mismatched cover identity',
      catalog([
        mainProject,
        project({
          coverAssetId: 'asset_cover_123456',
          coverUrl: '/asset-library/files/asset_other_123456',
        }),
      ]),
    ],
    [
      'a mismatched automatic cover identity',
      catalog([
        mainProject,
        project({
          autoCoverAssetId: 'asset_auto_123456',
          autoCoverUrl: '/asset-library/files/asset_other_123456',
        }),
      ]),
    ],
    ['an invalid catalog revision', { ...catalog(), catalogRevision: -1 }],
  ])('fails closed when the catalog contains %s', async (_label, payload) => {
    const fetchMock = vi.fn(async () => jsonResponse(payload));
    await expect(listProjects({ fetchImpl: fetchMock as typeof fetch })).rejects.toThrow();
  });

  it('creates a project with folder and idempotency metadata and verifies the returned catalog', async () => {
    const created = project({ folderId: 'folder_alpha' });
    const nextCatalog = catalog([mainProject, created], [folder()]);
    const fetchMock = vi.fn(async () => jsonResponse(mutationPayload(created, nextCatalog), 201));

    await expect(
      createProject(' 项目 Alpha ', {
        folderId: 'folder_alpha',
        requestId: 'request_create_1234',
        expectedCatalogRevision: 7,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual(created);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/projects',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(requestBody(fetchMock)).toEqual({
      name: '项目 Alpha',
      folderId: 'folder_alpha',
      requestId: 'request_create_1234',
      expectedCatalogRevision: 7,
    });
  });

  it('uses project-scoped PATCH and duplicate contracts without accepting a wrong response identity', async () => {
    const renamed = project({ name: '正式名称', revision: 2 });
    const moved = project({ folderId: 'folder_alpha', revision: 3 });
    const copied = project({ id: 'project_copy', name: '项目副本', revision: 1 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(mutationPayload(renamed, catalog([mainProject, renamed]))),
      )
      .mockResolvedValueOnce(
        jsonResponse(mutationPayload(moved, catalog([mainProject, moved], [folder()]))),
      )
      .mockResolvedValueOnce(
        jsonResponse(mutationPayload(copied, catalog([mainProject, project(), copied]))),
      );

    await expect(
      renameProject('project_alpha', '正式名称', {
        expectedRevision: 1,
        expectedCatalogRevision: 7,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual(renamed);
    await expect(
      moveProjectToFolder('project_alpha', 'folder_alpha', {
        expectedRevision: 2,
        expectedCatalogRevision: 8,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual(moved);
    await expect(
      duplicateProject('project_alpha', {
        name: '项目副本',
        requestId: 'request_duplicate_1',
        expectedCatalogRevision: 9,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual(copied);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:2895/projects/project_alpha',
      'http://127.0.0.1:2895/projects/project_alpha',
      'http://127.0.0.1:2895/projects/project_alpha/duplicate',
    ]);
    expect(requestBody(fetchMock, 0)).toEqual({
      name: '正式名称',
      expectedRevision: 1,
      expectedCatalogRevision: 7,
    });
    expect(requestBody(fetchMock, 1)).toEqual({
      folderId: 'folder_alpha',
      expectedRevision: 2,
      expectedCatalogRevision: 8,
    });
    expect(requestBody(fetchMock, 2)).toEqual({
      name: '项目副本',
      requestId: 'request_duplicate_1',
      expectedCatalogRevision: 9,
    });

    const wrongIdentity = vi.fn(async () =>
      jsonResponse(
        mutationPayload(
          project({ id: 'project_other' }),
          catalog([mainProject, project({ id: 'project_other' })]),
        ),
      ),
    );
    await expect(
      renameProject('project_alpha', '名称', { fetchImpl: wrongIdentity as typeof fetch }),
    ).rejects.toThrow('项目 ID');
  });

  it('updates and clears only stable Bridge-managed project covers', async () => {
    const withCover = project({
      coverAssetId: 'asset_cover_123456',
      coverUrl: '/asset-library/files/asset_cover_123456',
      revision: 2,
    });
    const withoutCover = project({ revision: 3 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(mutationPayload(withCover, catalog([mainProject, withCover]))),
      )
      .mockResolvedValueOnce(
        jsonResponse(mutationPayload(withoutCover, catalog([mainProject, withoutCover]))),
      );

    await updateProjectCover(
      'project_alpha',
      {
        assetId: 'asset_cover_123456',
        url: 'http://127.0.0.1:2895/asset-library/files/asset_cover_123456',
      },
      { expectedRevision: 1, fetchImpl: fetchMock as typeof fetch },
    );
    await updateProjectCover('project_alpha', null, {
      expectedRevision: 2,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(requestBody(fetchMock, 0)).toEqual({
      coverAssetId: 'asset_cover_123456',
      coverUrl: '/asset-library/files/asset_cover_123456',
      expectedRevision: 1,
    });
    expect(requestBody(fetchMock, 1)).toEqual({
      coverAssetId: null,
      coverUrl: null,
      expectedRevision: 2,
    });
    await expect(
      updateProjectCover(
        'project_alpha',
        { assetId: 'asset_cover_123456', url: 'https://example.com/cover.png' },
        { fetchImpl: fetchMock as typeof fetch },
      ),
    ).rejects.toThrow('受管图片素材');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('archives only after the Bridge confirms the exact project and returns a catalog without it', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        archived: true,
        projectId: 'project_alpha',
        catalog: catalog([mainProject]),
      }),
    );

    await expect(
      archiveProject('project_alpha', {
        expectedRevision: 4,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual(catalog([mainProject]));
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.credentials).toBe('include');
    expect(requestBody(fetchMock)).toEqual({ expectedRevision: 4 });

    const staleCatalog = vi.fn(async () =>
      jsonResponse({
        archived: true,
        projectId: 'project_alpha',
        catalog: catalog([mainProject, project()]),
      }),
    );
    await expect(
      archiveProject('project_alpha', { fetchImpl: staleCatalog as typeof fetch }),
    ).rejects.toThrow('仍出现在项目目录');
  });

  it('creates and deletes folders only when the returned catalog agrees', async () => {
    const createdFolder = folder();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          folder: createdFolder,
          catalog: catalog([mainProject], [createdFolder]),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          deletedFolderId: 'folder_alpha',
          catalog: catalog([mainProject]),
        }),
      );

    await expect(
      createProjectFolder('动画项目', {
        requestId: 'request_folder_1234',
        expectedCatalogRevision: 7,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual(createdFolder);
    await expect(
      deleteProjectFolder('folder_alpha', {
        expectedCatalogRevision: 8,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual(catalog([mainProject]));

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:2895/project-folders',
      'http://127.0.0.1:2895/project-folders/folder_alpha',
    ]);
    expect(requestBody(fetchMock, 0)).toEqual({
      name: '动画项目',
      requestId: 'request_folder_1234',
      expectedCatalogRevision: 7,
    });
    expect(requestBody(fetchMock, 1)).toEqual({ expectedCatalogRevision: 8 });
  });

  it('uploads a cover through the managed asset endpoint before committing its stable identity', async () => {
    const file = new File(['cover-bytes'], '封面.png', { type: 'image/png' });
    const stored = project({
      coverAssetId: 'asset_cover_123456',
      coverUrl: '/asset-library/files/asset_cover_123456',
      revision: 2,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            item: {
              id: 'asset_cover_123456',
              url: '/asset-library/files/asset_cover_123456',
              mime: 'image/png',
              size: file.size,
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(mutationPayload(stored, catalog([mainProject, stored]))));

    await expect(
      uploadProjectCover('project_alpha', file, {
        expectedRevision: 1,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      ...stored,
      coverUrl: 'http://127.0.0.1:2895/asset-library/files/asset_cover_123456',
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:2895/asset-library/upload',
      'http://127.0.0.1:2895/projects/project_alpha',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        body: file,
        headers: expect.objectContaining({
          'Content-Type': 'image/png',
          'X-Qiansi-Canvas-Kind': 'storyboard',
          'X-Qiansi-Canvas-Project': 'project_alpha',
        }),
      }),
    );
    expect(requestBody(fetchMock, 1)).toEqual({
      coverAssetId: 'asset_cover_123456',
      coverUrl: '/asset-library/files/asset_cover_123456',
      expectedRevision: 1,
    });
  });

  it('does not claim cover success when upload identity or the final project update fails', async () => {
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const unstableUpload = vi.fn(async () =>
      jsonResponse({
        item: {
          id: 'asset_cover_123456',
          url: 'https://example.com/asset_cover_123456',
        },
      }),
    );
    await expect(
      uploadProjectCover('project_alpha', file, {
        fetchImpl: unstableUpload as typeof fetch,
      }),
    ).rejects.toThrow('受管图片素材');
    expect(unstableUpload).toHaveBeenCalledTimes(1);

    const failedCommit = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          item: {
            id: 'asset_cover_123456',
            url: '/asset-library/files/asset_cover_123456',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: { message: '项目修订冲突' } }, 409));
    await expect(
      uploadProjectCover('project_alpha', file, {
        fetchImpl: failedCommit as typeof fetch,
      }),
    ).rejects.toThrow('项目修订冲突');
    expect(failedCommit).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid input before issuing REST calls and preserves Bridge errors', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: '名称已存在' } }, 409));
    await expect(
      createProject('非法/项目', { fetchImpl: fetchMock as typeof fetch }),
    ).rejects.toThrow('有效字符');
    await expect(
      renameProject('../escape', '名称', { fetchImpl: fetchMock as typeof fetch }),
    ).rejects.toThrow('项目 ID');
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      createProject('合法名称', { fetchImpl: fetchMock as typeof fetch }),
    ).rejects.toThrow('名称已存在');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
