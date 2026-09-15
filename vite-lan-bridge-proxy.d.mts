import type { Plugin } from 'vite';
import type { ClientRequest } from 'node:http';

export interface LanBridgeProxyGuardOptions {
  prefix: string;
  accessToken: string;
  enabled: boolean;
  trustedLan?: boolean;
}

export function createLanBridgeProxyGuard(options: LanBridgeProxyGuardOptions): Plugin;

export interface BridgeRuntimeDataGuardOptions {
  dataRoot: string;
  projectRoot: string;
}

export function createBridgeRuntimeDataGuard(options: BridgeRuntimeDataGuardOptions): Plugin;

export function isBridgeRuntimeDataRequest(
  requestUrl: string | undefined,
  dataRoot: string,
  projectRoot?: string,
): boolean;

export type LanBridgeProxyTarget =
  | { kind: 'outside' }
  | { kind: 'invalid' }
  | { kind: 'target'; pathname: string; searchParams: URLSearchParams };

export function parseLanBridgeProxyRequest(
  url: string | undefined,
  prefix: string,
): LanBridgeProxyTarget;

export function rewriteLanBridgeProxyPath(url: string | undefined, prefix: string): string;

export function normalizeLanBridgeProxyRequest(
  proxyRequest: Pick<ClientRequest, 'setHeader'>,
  targetOrigin: string,
  remoteAddress?: string,
): void;

export function normalizeLanBridgePairingProxyResponse(
  proxyResponse: { statusCode?: number; headers?: { location?: string } },
  requestUrl: string | undefined,
): void;
