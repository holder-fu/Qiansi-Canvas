import { safeUpdateUrl } from './system-update-contract.mjs';

function connectivitySourceBase(source) {
  return {
    id: source.id,
    name: source.name,
    homepageUrl: source.homepageUrl,
  };
}

/** Probe transport reachability without pretending that an unpublished manifest is valid. */
export async function probeUpdateSourceConnectivity(
  source,
  { fetchImpl = fetch, timeoutMs = 10_000, now = Date.now } = {},
) {
  const base = connectivitySourceBase(source);
  if (!source.enabled || !source.manifestUrl) {
    return {
      ...base,
      configured: false,
      status: 'unconfigured',
      message: '尚未配置清单地址。',
    };
  }

  const startedAt = now();
  try {
    const requestUrl = safeUpdateUrl(source.manifestUrl, `${source.name} 清单地址`);
    const response = await fetchImpl(requestUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    safeUpdateUrl(response.url || requestUrl, `${source.name} 网络检测最终地址`);
    await response.body?.cancel().catch(() => {});
    const manifestAvailable = response.ok;
    return {
      ...base,
      configured: true,
      status: 'ready',
      latencyMs: Math.max(0, now() - startedAt),
      networkReachable: true,
      manifestAvailable,
      httpStatus: response.status,
      message: manifestAvailable
        ? '网络可连接，更新清单地址可访问。'
        : `网络可连接，但更新清单暂不可用（HTTP ${response.status}）。`,
    };
  } catch (error) {
    return {
      ...base,
      configured: true,
      status: 'error',
      networkReachable: false,
      message: error instanceof Error ? `网络连接失败：${error.message}` : '网络连接失败。',
    };
  }
}
