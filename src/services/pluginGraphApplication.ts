import {
  PLUGIN_HOST_DOCUMENT_KEY_PREFIX,
  PluginDocumentConflictError,
  readPluginDocument,
  writePluginDocument,
  type PluginDocumentSnapshot,
} from './pluginDocuments';
import {
  createPluginProjectGraph,
  type PluginProjectGraphReceipt,
  type PluginProjectGraphRequest,
  validatePluginProjectGraph,
} from './pluginGraphProject';

const GRAPH_APPLICATION_SCHEMA_VERSION = 1;
const GRAPH_APPLICATION_DOCUMENT_PREFIX = `${PLUGIN_HOST_DOCUMENT_KEY_PREFIX}graph-application:`;

export type PluginGraphApplicationReceipt = PluginProjectGraphReceipt & {
  applicationId: string;
};

type GraphApplicationRecord = {
  schemaVersion: typeof GRAPH_APPLICATION_SCHEMA_VERSION;
  applicationId: string;
  sourceProjectId: string;
  requestSha256: string;
  attempt: number;
  status: 'pending' | 'applied' | 'failed';
  startedAt: number;
  appliedAt?: number;
  failedAt?: number;
  failureCode?: 'graph-creation-failed';
  receipt?: PluginGraphApplicationReceipt;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function applicationDocumentKey(applicationId: string) {
  return `${GRAPH_APPLICATION_DOCUMENT_PREFIX}${applicationId}`;
}

async function sha256Text(value: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('当前环境不能生成安全的建图幂等指纹。');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function graphRequestPayload(request: PluginProjectGraphRequest) {
  return canonicalJson({
    name: request.name,
    nodes: request.nodes,
    edges: request.edges,
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('节点图包含不可序列化的数字。');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (!isRecord(value)) throw new Error('节点图包含不可序列化的字段。');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function parseReceipt(value: unknown, applicationId: string): PluginGraphApplicationReceipt {
  if (!isRecord(value)) throw new Error('建图应用收据已损坏，宿主已拒绝重复创建。');
  const projectId = typeof value.projectId === 'string' ? value.projectId : '';
  const projectName = typeof value.projectName === 'string' ? value.projectName : '';
  const edgeCount = value.edgeCount;
  if (
    value.applicationId !== applicationId ||
    !projectId ||
    projectId.length > 120 ||
    !projectName ||
    projectName.length > 200 ||
    !Number.isInteger(edgeCount) ||
    Number(edgeCount) < 0 ||
    Number(edgeCount) > 480 ||
    !isRecord(value.nodeIds)
  ) {
    throw new Error('建图应用收据已损坏，宿主已拒绝重复创建。');
  }
  const entries = Object.entries(value.nodeIds);
  if (
    entries.length > 240 ||
    entries.some(
      ([clientId, nodeId]) =>
        !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(clientId) ||
        typeof nodeId !== 'string' ||
        !nodeId ||
        nodeId.length > 160,
    )
  ) {
    throw new Error('建图应用收据已损坏，宿主已拒绝重复创建。');
  }
  return {
    applicationId,
    projectId,
    projectName,
    nodeIds: Object.fromEntries(entries) as Record<string, string>,
    edgeCount: Number(edgeCount),
  };
}

function parseRecord(
  snapshot: PluginDocumentSnapshot,
  applicationId: string,
  sourceProjectId: string,
  requestSha256: string,
): GraphApplicationRecord {
  const value = snapshot.value;
  if (
    !isRecord(value) ||
    value.schemaVersion !== GRAPH_APPLICATION_SCHEMA_VERSION ||
    value.applicationId !== applicationId ||
    value.sourceProjectId !== sourceProjectId ||
    typeof value.requestSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.requestSha256) ||
    !Number.isSafeInteger(value.attempt) ||
    Number(value.attempt) < 1 ||
    typeof value.startedAt !== 'number' ||
    !Number.isFinite(value.startedAt)
  ) {
    throw new Error('建图应用状态已损坏，宿主已拒绝重复创建。');
  }
  if (value.requestSha256 !== requestSha256) {
    throw new Error('该 applicationId 已用于另一份节点图；宿主已拒绝覆盖或重复创建。');
  }
  if (value.status === 'pending') {
    return {
      schemaVersion: GRAPH_APPLICATION_SCHEMA_VERSION,
      applicationId,
      sourceProjectId,
      requestSha256,
      attempt: Number(value.attempt),
      status: 'pending',
      startedAt: value.startedAt,
    };
  }
  if (value.status === 'failed') {
    if (
      value.failureCode !== 'graph-creation-failed' ||
      typeof value.failedAt !== 'number' ||
      !Number.isFinite(value.failedAt)
    ) {
      throw new Error('建图应用状态已损坏，宿主已拒绝重复创建。');
    }
    return {
      schemaVersion: GRAPH_APPLICATION_SCHEMA_VERSION,
      applicationId,
      sourceProjectId,
      requestSha256,
      attempt: Number(value.attempt),
      status: 'failed',
      startedAt: value.startedAt,
      failedAt: value.failedAt,
      failureCode: 'graph-creation-failed',
    };
  }
  if (
    value.status !== 'applied' ||
    typeof value.appliedAt !== 'number' ||
    !Number.isFinite(value.appliedAt)
  ) {
    throw new Error('建图应用状态已损坏，宿主已拒绝重复创建。');
  }
  return {
    schemaVersion: GRAPH_APPLICATION_SCHEMA_VERSION,
    applicationId,
    sourceProjectId,
    requestSha256,
    attempt: Number(value.attempt),
    status: 'applied',
    startedAt: value.startedAt,
    appliedAt: value.appliedAt,
    receipt: parseReceipt(value.receipt, applicationId),
  };
}

function observedApplication(
  snapshot: PluginDocumentSnapshot,
  request: PluginProjectGraphRequest,
  sourceProjectId: string,
  requestSha256: string,
): { receipt?: PluginGraphApplicationReceipt; retryRevision?: number; attempt: number } {
  const record = parseRecord(snapshot, request.applicationId, sourceProjectId, requestSha256);
  if (record.status === 'applied') {
    if (!record.receipt) throw new Error('建图应用收据已损坏，宿主已拒绝重复创建。');
    return { receipt: record.receipt, attempt: record.attempt };
  }
  if (record.status === 'pending') {
    throw new Error(
      '该节点图正在创建，或上次执行在收据确认前中断。为避免重复项目，宿主拒绝再次执行；请先检查“所有项目”。',
    );
  }
  if (request.retryFailed !== true) {
    throw new Error(
      '该节点图上次创建失败；只有明确重试操作设置 retryFailed: true 后才能再次执行。',
    );
  }
  return { retryRevision: snapshot.revision, attempt: record.attempt + 1 };
}

async function concurrentApplicationOutcome(
  pluginId: string,
  sourceProjectId: string,
  key: string,
  request: PluginProjectGraphRequest,
  requestSha256: string,
) {
  const current = await readPluginDocument(pluginId, sourceProjectId, key);
  if (!current) {
    throw new Error('建图应用状态发生并发变化，宿主已拒绝重复创建。');
  }
  const record = parseRecord(current, request.applicationId, sourceProjectId, requestSha256);
  if (record.status === 'applied') {
    if (!record.receipt) throw new Error('建图应用收据已损坏，宿主已拒绝重复创建。');
    return record.receipt;
  }
  if (record.status === 'pending') {
    throw new Error('该节点图已由另一个请求接管；宿主已拒绝并发重复创建。');
  }
  throw new Error('该节点图状态已并发变化；请重新确认失败状态后再明确重试。');
}

/**
 * Claim and apply one graph delivery from its source project.
 *
 * The receipt deliberately stays in the source-project document namespace:
 * createPluginProjectGraph switches the active Canvas project before returning.
 */
export async function applyPluginProjectGraphOnce(
  pluginId: string,
  sourceProjectId: string,
  request: PluginProjectGraphRequest,
): Promise<PluginGraphApplicationReceipt> {
  // Invalid ports, duplicate ids and cycles must fail before consuming an
  // idempotency receipt or starting any persistent project side effect.
  validatePluginProjectGraph(request);
  const key = applicationDocumentKey(request.applicationId);
  const [requestSha256, creationIdentitySha256] = await Promise.all([
    sha256Text(`qiansi-plugin-project-graph:v1\u0000${graphRequestPayload(request)}`),
    sha256Text(
      `qiansi-plugin-project-creation:v1\u0000${pluginId}\u0000${sourceProjectId}\u0000${request.applicationId}`,
    ),
  ]);
  const creationRequestId = `plugin-graph-${creationIdentitySha256}`;
  const existing = await readPluginDocument(pluginId, sourceProjectId, key);
  let expectedRevision = 0;
  let attempt = 1;
  if (existing) {
    const observed = observedApplication(existing, request, sourceProjectId, requestSha256);
    if (observed.receipt) return observed.receipt;
    expectedRevision = observed.retryRevision ?? existing.revision;
    attempt = observed.attempt;
  } else if (request.retryFailed === true) {
    throw new Error('当前 applicationId 没有可重试的失败记录。');
  }

  const startedAt = Date.now();
  let pending: PluginDocumentSnapshot;
  try {
    pending = await writePluginDocument(
      pluginId,
      sourceProjectId,
      key,
      {
        schemaVersion: GRAPH_APPLICATION_SCHEMA_VERSION,
        applicationId: request.applicationId,
        sourceProjectId,
        requestSha256,
        attempt,
        status: 'pending',
        startedAt,
      } satisfies GraphApplicationRecord,
      expectedRevision,
    );
  } catch (error) {
    if (error instanceof PluginDocumentConflictError) {
      const receipt = await concurrentApplicationOutcome(
        pluginId,
        sourceProjectId,
        key,
        request,
        requestSha256,
      );
      if (receipt) return receipt;
    }
    throw error;
  }

  let baseReceipt: PluginProjectGraphReceipt;
  let projectCreationAttempted = false;
  try {
    baseReceipt = await createPluginProjectGraph(request, {
      creationRequestId,
      onProjectCreationAttempt: () => {
        projectCreationAttempted = true;
      },
    });
  } catch (error) {
    if (projectCreationAttempted) {
      // A POST may already have created the target project, or later opening /
      // persistence may have failed. Keep pending even though the Bridge uses
      // a stable requestId: replaying could overwrite edits in that project.
      throw new Error(
        '项目创建请求已经开始，但最终状态未能确认。该 applicationId 保持 pending；请检查“所有项目”，不要重试或更换随机 ID。',
      );
    }
    try {
      await writePluginDocument(
        pluginId,
        sourceProjectId,
        key,
        {
          schemaVersion: GRAPH_APPLICATION_SCHEMA_VERSION,
          applicationId: request.applicationId,
          sourceProjectId,
          requestSha256,
          attempt,
          status: 'failed',
          startedAt,
          failedAt: Date.now(),
          failureCode: 'graph-creation-failed',
        } satisfies GraphApplicationRecord,
        pending.revision,
      );
    } catch {
      throw new Error(
        '节点图创建失败，且失败收据未能确认。该 applicationId 保持锁定以避免重复创建，请不要重试。',
      );
    }
    throw error;
  }

  const receipt: PluginGraphApplicationReceipt = {
    applicationId: request.applicationId,
    ...baseReceipt,
  };
  try {
    await writePluginDocument(
      pluginId,
      sourceProjectId,
      key,
      {
        schemaVersion: GRAPH_APPLICATION_SCHEMA_VERSION,
        applicationId: request.applicationId,
        sourceProjectId,
        requestSha256,
        attempt,
        status: 'applied',
        startedAt,
        appliedAt: Date.now(),
        receipt,
      } satisfies GraphApplicationRecord,
      pending.revision,
    );
  } catch {
    // The target graph may already be durable. Never downgrade this claim to
    // failed, because a retry could then create a duplicate project.
    throw new Error(
      '新项目已经创建，但幂等收据未能确认。该 applicationId 保持 pending；请检查“所有项目”，不要重复建图。',
    );
  }
  return receipt;
}
