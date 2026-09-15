import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';
import {
  isNormalizedGenerationLimits,
  normalizeGenerationLimits,
} from '../lib/generationLimitsContract.mjs';
import type { GenerationLimitPreferences } from '../store/canvasPreferences';

export type GenerationLimits = GenerationLimitPreferences & {
  version: 1;
  revision: number;
  updatedAt: number;
};

export type GenerationLimitsSnapshot = {
  limits: GenerationLimits;
  writable: boolean;
};

export class GenerationLimitsConflictError extends Error {
  readonly limits?: GenerationLimits;

  constructor(limits?: GenerationLimits) {
    super('请求与批量生成设置已在其它窗口更新，请刷新后重试。');
    this.name = 'GenerationLimitsConflictError';
    this.limits = limits;
  }
}

function parseGenerationLimits(value: unknown): GenerationLimits {
  const limits = value as Partial<GenerationLimits> | null;
  if (
    limits?.version !== 1 ||
    !Number.isSafeInteger(limits.revision) ||
    Number(limits.revision) < 0 ||
    !Number.isSafeInteger(limits.updatedAt) ||
    Number(limits.updatedAt) < 0 ||
    !isNormalizedGenerationLimits(limits)
  ) {
    throw new Error('Bridge 返回的请求与批量生成设置无效。');
  }
  return limits as GenerationLimits;
}

async function requestGenerationLimits(
  path: string,
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<GenerationLimitsSnapshot> {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), {
    cache: 'no-store',
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    limits?: unknown;
    writable?: unknown;
    error?: { message?: string };
  };
  if (!response.ok) {
    if (response.status === 409) {
      throw new GenerationLimitsConflictError(
        payload.limits ? parseGenerationLimits(payload.limits) : undefined,
      );
    }
    throw new Error(
      payload.error?.message || `请求与批量生成设置请求失败（HTTP ${response.status}）。`,
    );
  }
  return {
    limits: parseGenerationLimits(payload.limits),
    writable: payload.writable === true,
  };
}

export function loadGenerationLimits(bridgeBase = BRIDGE_BASE_URL) {
  return requestGenerationLimits('/settings/generation-limits', undefined, bridgeBase);
}

export function saveGenerationLimits(
  limits: GenerationLimitPreferences,
  expectedRevision: number,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestGenerationLimits(
    '/settings/generation-limits',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limits: normalizeGenerationLimits(limits),
        expectedRevision,
      }),
    },
    bridgeBase,
  );
}
