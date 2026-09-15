export type VolcengineIdentity = {
  valid: boolean;
  accountId: string;
  userId: string;
  identity: string;
  requestId: string;
};

export const VOLCENGINE_DEFAULT_REGION: string;
export function buildVolcengineVersionArgs(): string[];
export function buildVolcengineIdentityArgs(options?: {
  profile?: unknown;
  region?: unknown;
}): string[];
export function parseVolcengineIdentity(value: unknown): VolcengineIdentity;
export function volcengineCliErrorMessage(value: unknown, fallback?: string): string;
export function isVolcengineAuthenticationError(value: unknown): boolean;
