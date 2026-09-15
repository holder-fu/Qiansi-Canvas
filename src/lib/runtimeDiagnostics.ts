import { BRIDGE_BASE_URL } from './bridgeUrl';
import { isVaultSupported } from './keyVault';

export type CliToolKey = 'arkcli' | 'codex' | 'codebuddy' | 'gemini' | 'jimeng' | 'bailian';

export type CliSessionStatus = {
  installed?: boolean;
  runnable?: boolean;
  authenticated?: boolean;
  loggedIn?: boolean;
  ready?: boolean;
  version?: string;
};

export type BridgeHealth = {
  ok: boolean;
  bridge?: string;
  buildId?: string;
  /** Live Canvas package version used by plugin compatibility checks. */
  canvasVersion?: string;
  /** Canvas version captured when this Bridge process started. */
  bridgeVersion?: string;
  tools: Partial<Record<CliToolKey, boolean>>;
  sessions: Partial<Record<CliToolKey, CliSessionStatus>>;
  capabilities?: {
    timeline?: { localMp4?: boolean };
    projectLibrary?: { localFiles?: boolean; snapshots?: boolean };
  };
};

export type BrowserStorageProbe = {
  usage?: number;
  quota?: number;
  persisted?: boolean;
  localStorageWritable: boolean;
};

export type SafeDiagnosticReport = {
  generatedAt: string;
  app: {
    version: string;
    mode: string;
    origin: string;
    online: boolean;
    secureContext: boolean;
  };
  bridge: {
    url: string;
    connected: boolean;
    buildId?: string;
    canvasVersion?: string;
    bridgeVersion?: string;
    error?: string;
    readyCliCount: number;
    localFfmpeg: boolean;
    projectSnapshots: boolean;
  };
  browser: BrowserStorageProbe & { vaultSupported: boolean };
};

const CACHE_TTL = 30_000;
let cachedHealth: { value: BridgeHealth; checkedAt: number } | undefined;
let pendingHealth: Promise<BridgeHealth> | undefined;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseSession(value: unknown): CliSessionStatus {
  const item = record(value);
  if (!item) return {};
  return {
    installed: typeof item.installed === 'boolean' ? item.installed : undefined,
    runnable: typeof item.runnable === 'boolean' ? item.runnable : undefined,
    authenticated: typeof item.authenticated === 'boolean' ? item.authenticated : undefined,
    loggedIn: typeof item.loggedIn === 'boolean' ? item.loggedIn : undefined,
    ready: typeof item.ready === 'boolean' ? item.ready : undefined,
    version: typeof item.version === 'string' ? item.version.slice(0, 120) : undefined,
  };
}

function parseHealth(value: unknown): BridgeHealth {
  const body = record(value);
  if (!body || body.ok !== true) throw new Error('本地桥返回了无效的健康状态。');
  const rawTools = record(body.tools);
  const rawSessions = record(body.sessions);
  const keys: CliToolKey[] = ['arkcli', 'codex', 'codebuddy', 'gemini', 'jimeng', 'bailian'];
  const tools: BridgeHealth['tools'] = {};
  const sessions: BridgeHealth['sessions'] = {};
  for (const key of keys) {
    if (typeof rawTools?.[key] === 'boolean') tools[key] = rawTools[key];
    if (rawSessions?.[key]) sessions[key] = parseSession(rawSessions[key]);
  }
  const capabilities = record(body.capabilities);
  const timeline = record(capabilities?.timeline);
  const projectLibrary = record(capabilities?.projectLibrary);
  return {
    ok: true,
    bridge: typeof body.bridge === 'string' ? body.bridge.slice(0, 120) : undefined,
    buildId: typeof body.buildId === 'string' ? body.buildId.slice(0, 160) : undefined,
    canvasVersion:
      typeof body.canvasVersion === 'string' ? body.canvasVersion.slice(0, 120) : undefined,
    bridgeVersion:
      typeof body.bridgeVersion === 'string' ? body.bridgeVersion.slice(0, 120) : undefined,
    tools,
    sessions,
    capabilities: {
      timeline: {
        localMp4: typeof timeline?.localMp4 === 'boolean' ? timeline.localMp4 : undefined,
      },
      projectLibrary: {
        localFiles:
          typeof projectLibrary?.localFiles === 'boolean' ? projectLibrary.localFiles : undefined,
        snapshots:
          typeof projectLibrary?.snapshots === 'boolean' ? projectLibrary.snapshots : undefined,
      },
    },
  };
}

export async function fetchBridgeHealth(force = false): Promise<BridgeHealth> {
  if (!force && cachedHealth && Date.now() - cachedHealth.checkedAt < CACHE_TTL) {
    return cachedHealth.value;
  }
  if (!force && pendingHealth) return pendingHealth;
  const request = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`${BRIDGE_BASE_URL}/health`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`本地桥检测失败（HTTP ${response.status}）。`);
      const value = parseHealth(await response.json());
      cachedHealth = { value, checkedAt: Date.now() };
      return value;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('本地桥检测超时，请确认启动终端仍在运行。');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  })();
  pendingHealth = request;
  try {
    return await request;
  } finally {
    if (pendingHealth === request) pendingHealth = undefined;
  }
}

export async function probeBrowserStorage(): Promise<BrowserStorageProbe> {
  let usage: number | undefined;
  let quota: number | undefined;
  let persisted: boolean | undefined;
  try {
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage;
    quota = estimate?.quota;
    persisted = await navigator.storage?.persisted?.();
  } catch {
    // Individual browser storage APIs are optional; the write probe below is independent.
  }

  let localStorageWritable = false;
  const probeKey = `qiansi-canvas-storage-probe-${Date.now()}`;
  try {
    localStorage.setItem(probeKey, '1');
    localStorageWritable = localStorage.getItem(probeKey) === '1';
  } catch {
    localStorageWritable = false;
  } finally {
    try {
      localStorage.removeItem(probeKey);
    } catch {
      // Nothing else can be cleaned up when storage access itself is blocked.
    }
  }
  return { usage, quota, persisted, localStorageWritable };
}

export function buildSafeDiagnosticReport(
  storage: BrowserStorageProbe,
  health?: BridgeHealth,
  bridgeError?: string,
): SafeDiagnosticReport {
  const readyCliCount = Object.values(health?.sessions ?? {}).filter(
    (session) => session.ready === true,
  ).length;
  return {
    generatedAt: new Date().toISOString(),
    app: {
      version: import.meta.env.VITE_APP_VERSION ?? 'unknown',
      mode: import.meta.env.MODE,
      origin: window.location.origin,
      online: navigator.onLine,
      secureContext: window.isSecureContext,
    },
    bridge: {
      url: BRIDGE_BASE_URL,
      connected: Boolean(health?.ok),
      buildId: health?.buildId,
      canvasVersion: health?.canvasVersion,
      bridgeVersion: health?.bridgeVersion,
      error: bridgeError,
      readyCliCount,
      localFfmpeg: health?.capabilities?.timeline?.localMp4 === true,
      projectSnapshots: health?.capabilities?.projectLibrary?.snapshots === true,
    },
    browser: { ...storage, vaultSupported: isVaultSupported() },
  };
}

export function formatBytes(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '不可用';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}
