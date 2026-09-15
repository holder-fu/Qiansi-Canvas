import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginDocumentConflictError, type PluginDocumentSnapshot } from './pluginDocuments';
import type { PluginProjectGraphReceipt, PluginProjectGraphRequest } from './pluginGraphProject';

const dependencies = vi.hoisted(() => ({
  readDocument: vi.fn(),
  writeDocument: vi.fn(),
  createGraph: vi.fn(),
  validateGraph: vi.fn(),
}));

vi.mock('./pluginDocuments', () => {
  class PluginDocumentConflictError extends Error {
    currentRevision: number;

    constructor(currentRevision: number) {
      super(`conflict-v${currentRevision}`);
      this.currentRevision = currentRevision;
    }
  }
  return {
    PLUGIN_HOST_DOCUMENT_KEY_PREFIX: 'qiansi-host:',
    PluginDocumentConflictError,
    readPluginDocument: dependencies.readDocument,
    writePluginDocument: dependencies.writeDocument,
  };
});

vi.mock('./pluginGraphProject', () => ({
  createPluginProjectGraph: dependencies.createGraph,
  validatePluginProjectGraph: dependencies.validateGraph,
}));

import { applyPluginProjectGraphOnce } from './pluginGraphApplication';

const request: PluginProjectGraphRequest = {
  applicationId: 'delivery-screenplay-v7',
  name: '小说视频交付',
  nodes: [
    {
      clientId: 'screenplay',
      kind: 'text',
      position: { x: 0, y: 0 },
      data: { title: '总剧本', outputText: '批准内容' },
    },
  ],
  edges: [],
};

const baseReceipt: PluginProjectGraphReceipt = {
  projectId: 'project-target-1',
  projectName: '小说视频交付',
  nodeIds: { screenplay: 'node-host-1' },
  edgeCount: 0,
};

describe('plugin graph application idempotency', () => {
  let stored: PluginDocumentSnapshot | null;

  beforeEach(() => {
    stored = null;
    dependencies.readDocument.mockReset();
    dependencies.writeDocument.mockReset();
    dependencies.createGraph.mockReset();
    dependencies.validateGraph.mockReset();
    dependencies.readDocument.mockImplementation(async () => stored);
    dependencies.writeDocument.mockImplementation(
      async (_pluginId, _projectId, key, value, expectedRevision) => {
        const currentRevision = stored?.revision ?? 0;
        if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
          throw new PluginDocumentConflictError(currentRevision);
        }
        stored = {
          key,
          value,
          revision: currentRevision + 1,
          updatedAt: Date.now(),
        };
        return stored;
      },
    );
    dependencies.createGraph.mockResolvedValue(baseReceipt);
  });

  it('returns the original applied receipt without creating a second project', async () => {
    const first = await applyPluginProjectGraphOnce('production-studio', 'project-source', request);
    const second = await applyPluginProjectGraphOnce(
      'production-studio',
      'project-source',
      request,
    );
    const reordered = await applyPluginProjectGraphOnce('production-studio', 'project-source', {
      ...request,
      nodes: request.nodes.map((node) => ({
        ...node,
        data: { outputText: '批准内容', title: '总剧本' },
      })),
    });

    expect(first).toEqual({ applicationId: request.applicationId, ...baseReceipt });
    expect(second).toEqual(first);
    expect(reordered).toEqual(first);
    expect(dependencies.createGraph).toHaveBeenCalledTimes(1);
    expect(dependencies.createGraph).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        creationRequestId: expect.stringMatching(/^plugin-graph-[a-f0-9]{64}$/),
      }),
    );
    expect(dependencies.writeDocument).toHaveBeenCalledWith(
      'production-studio',
      'project-source',
      `qiansi-host:graph-application:${request.applicationId}`,
      expect.anything(),
      expect.any(Number),
    );
    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', {
        ...request,
        name: '同一 ID 的另一份交付',
      }),
    ).rejects.toThrow('已用于另一份节点图');
    expect(dependencies.createGraph).toHaveBeenCalledTimes(1);
  });

  it('keeps an unconfirmed applied receipt pending and fails closed on reopen', async () => {
    dependencies.writeDocument.mockImplementation(
      async (_pluginId, _projectId, key, value, expectedRevision) => {
        const record = value as { status?: string };
        if (record.status === 'applied') throw new Error('receipt write lost');
        const currentRevision = stored?.revision ?? 0;
        if (expectedRevision !== currentRevision) throw new Error('unexpected revision');
        stored = { key, value, revision: currentRevision + 1, updatedAt: Date.now() };
        return stored;
      },
    );

    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ).rejects.toThrow('保持 pending');
    expect(snapshotStatus(stored)).toBe('pending');

    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ).rejects.toThrow('拒绝再次执行');
    expect(dependencies.createGraph).toHaveBeenCalledTimes(1);
  });

  it('records a secret-free failed state and retries only with an explicit flag', async () => {
    dependencies.createGraph
      .mockRejectedValueOnce(new Error('provider-secret-must-not-be-persisted'))
      .mockResolvedValue(baseReceipt);

    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ).rejects.toThrow('provider-secret-must-not-be-persisted');
    expect(snapshotStatus(stored)).toBe('failed');
    expect(JSON.stringify(stored?.value)).not.toContain('provider-secret-must-not-be-persisted');

    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ).rejects.toThrow('retryFailed: true');
    expect(dependencies.createGraph).toHaveBeenCalledTimes(1);

    const retried = await applyPluginProjectGraphOnce('production-studio', 'project-source', {
      ...request,
      retryFailed: true,
    });
    expect(retried).toEqual({ applicationId: request.applicationId, ...baseReceipt });
    expect(dependencies.createGraph).toHaveBeenCalledTimes(2);
    expect(dependencies.createGraph.mock.calls.map((call) => call[1]?.creationRequestId)).toEqual([
      expect.stringMatching(/^plugin-graph-[a-f0-9]{64}$/),
      expect.stringMatching(/^plugin-graph-[a-f0-9]{64}$/),
    ]);
    expect(dependencies.createGraph.mock.calls[0]?.[1]?.creationRequestId).toBe(
      dependencies.createGraph.mock.calls[1]?.[1]?.creationRequestId,
    );
  });

  it('rejects a retry flag when no failed receipt exists', async () => {
    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', {
        ...request,
        retryFailed: true,
      }),
    ).rejects.toThrow('没有可重试的失败记录');
    expect(dependencies.createGraph).not.toHaveBeenCalled();
  });

  it('lets only one concurrent call reach project creation while the claim is pending', async () => {
    let releaseCreation: (() => void) | undefined;
    const creationGate = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    dependencies.createGraph.mockImplementationOnce(async () => {
      await creationGate;
      return baseReceipt;
    });

    const first = applyPluginProjectGraphOnce('production-studio', 'project-source', request);
    await vi.waitFor(() => expect(dependencies.createGraph).toHaveBeenCalledTimes(1));
    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ).rejects.toThrow('拒绝再次执行');
    releaseCreation?.();
    await expect(first).resolves.toEqual({ applicationId: request.applicationId, ...baseReceipt });
    expect(dependencies.createGraph).toHaveBeenCalledTimes(1);
  });

  it('resolves a concurrent first-claim CAS conflict without a second project', async () => {
    let readCount = 0;
    dependencies.readDocument.mockImplementation(async () => {
      readCount += 1;
      return readCount <= 2 ? null : stored;
    });
    let releaseCreation: (() => void) | undefined;
    const creationGate = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    dependencies.createGraph.mockImplementationOnce(async () => {
      await creationGate;
      return baseReceipt;
    });

    const settled = Promise.allSettled([
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ]);
    await vi.waitFor(() => expect(dependencies.readDocument).toHaveBeenCalledTimes(3));
    releaseCreation?.();
    const results = await settled;

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(dependencies.createGraph).toHaveBeenCalledTimes(1);
  });

  it('keeps pending after any failure once the project POST may have started', async () => {
    dependencies.createGraph.mockImplementationOnce(async (_request, options) => {
      options.onProjectCreationAttempt?.();
      throw new Error('response lost after create');
    });

    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ).rejects.toThrow('保持 pending');
    expect(snapshotStatus(stored)).toBe('pending');
    expect(JSON.stringify(stored?.value)).not.toContain('response lost after create');

    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', {
        ...request,
        retryFailed: true,
      }),
    ).rejects.toThrow('拒绝再次执行');
    expect(dependencies.createGraph).toHaveBeenCalledTimes(1);
  });

  it('validates the graph before reserving a host receipt', async () => {
    dependencies.validateGraph.mockImplementationOnce(() => {
      throw new Error('invalid cycle');
    });

    await expect(
      applyPluginProjectGraphOnce('production-studio', 'project-source', request),
    ).rejects.toThrow('invalid cycle');
    expect(dependencies.readDocument).not.toHaveBeenCalled();
    expect(dependencies.writeDocument).not.toHaveBeenCalled();
    expect(dependencies.createGraph).not.toHaveBeenCalled();
  });
});

function snapshotStatus(snapshot: PluginDocumentSnapshot | null) {
  if (!snapshot || !snapshot.value || typeof snapshot.value !== 'object') return;
  return 'status' in snapshot.value ? snapshot.value.status : undefined;
}
