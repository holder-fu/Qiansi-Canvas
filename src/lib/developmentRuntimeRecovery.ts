const RECOVERY_ATTEMPT_KEY = 'qiansi-canvas:development-runtime-recovery';
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_HEALTH_ATTEMPTS = 12;
const DEFAULT_HEALTH_INTERVAL_MS = 250;
const DEFAULT_FLUSH_TIMEOUT_MS = 6_000;

const STALE_BUILD_ASSET_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/iu,
  /error loading dynamically imported module/iu,
  /importing a module script failed/iu,
  /chunkloaderror/iu,
  /loading chunk\s+.+\s+failed/iu,
  /unable to preload css/iu,
];

export type DevelopmentRecoveryResult =
  'disabled' | 'throttled' | 'bridge-unavailable' | 'save-blocked' | 'reloading';

export interface DevelopmentRecoveryOptions {
  enabled: boolean;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  probeBridge: () => Promise<boolean>;
  flushCanvas: () => Promise<boolean>;
  reload: () => void;
  manual?: boolean;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  cooldownMs?: number;
  healthAttempts?: number;
  healthIntervalMs?: number;
  flushTimeoutMs?: number;
}

export function isStaleBuildAssetError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  return STALE_BUILD_ASSET_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function recoveryAttemptAt(storage: DevelopmentRecoveryOptions['storage']): number | undefined {
  try {
    const value = Number(storage.getItem(RECOVERY_ATTEMPT_KEY));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return;
  }
}

function recordRecoveryAttempt(storage: DevelopmentRecoveryOptions['storage'], at: number) {
  try {
    storage.setItem(RECOVERY_ATTEMPT_KEY, String(at));
  } catch {
    // A blocked sessionStorage must not turn recovery itself into another crash.
  }
}

async function resolvesWithin<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return fallback;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

export async function attemptDevelopmentRuntimeRecovery(
  options: DevelopmentRecoveryOptions,
): Promise<DevelopmentRecoveryResult> {
  if (!options.enabled) return 'disabled';

  const now = options.now ?? Date.now;
  const attemptedAt = recoveryAttemptAt(options.storage);
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  if (!options.manual && attemptedAt !== undefined && now() - attemptedAt < cooldownMs) {
    return 'throttled';
  }
  recordRecoveryAttempt(options.storage, now());

  const wait = options.delay ?? delay;
  const healthAttempts = options.healthAttempts ?? DEFAULT_HEALTH_ATTEMPTS;
  let bridgeReady = false;
  for (let attempt = 0; attempt < healthAttempts; attempt += 1) {
    try {
      bridgeReady = await options.probeBridge();
    } catch {
      bridgeReady = false;
    }
    if (bridgeReady) break;
    if (attempt + 1 < healthAttempts) {
      await wait(options.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS);
    }
  }
  if (!bridgeReady) return 'bridge-unavailable';

  const saved = await resolvesWithin(
    options.flushCanvas(),
    options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS,
    false,
  );
  if (!saved) return 'save-blocked';

  options.reload();
  return 'reloading';
}

export function clearDevelopmentRecoveryAttempt(storage: DevelopmentRecoveryOptions['storage']) {
  try {
    storage.removeItem(RECOVERY_ATTEMPT_KEY);
  } catch {
    // Recovery remains usable in-memory when browser storage is unavailable.
  }
}

export async function probeBridgeHealth(bridgeBaseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(`${bridgeBaseUrl.replace(/\/+$/u, '')}/health`, {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
