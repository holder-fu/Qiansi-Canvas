export interface ArkCliCommandResult {
  code?: unknown;
  stdout?: unknown;
  stderr?: unknown;
}

export interface ArkCliAuthStatus {
  authenticated: boolean;
  authenticationRequired: boolean;
  message: string;
}

export function buildArkCliVersionArgs(): string[];
export function buildArkCliAuthStatusArgs(): string[];
export function arkCliSafeMessage(value: unknown, fallback?: string): string;
export function inspectArkCliAuthStatus(result: ArkCliCommandResult): ArkCliAuthStatus;
