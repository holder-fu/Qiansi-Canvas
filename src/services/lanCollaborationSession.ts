import { resolveBridgeUrl } from '../lib/bridgeUrl';

const BRIDGE_ID = 'qiansi-canvas-cli-bridge';

type BridgeSessionResponse = {
  ok?: boolean;
  bridge?: string;
  scope?: string;
  collaborationEnabled?: boolean;
  capabilities?: {
    projects?: boolean;
    managedMedia?: boolean;
  };
};

export function isLanCollaborationHealth(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as BridgeSessionResponse;
  return (
    payload.ok === true &&
    payload.bridge === BRIDGE_ID &&
    payload.collaborationEnabled === true &&
    (payload.scope === 'host' || payload.scope === 'collaboration') &&
    payload.capabilities?.projects === true &&
    payload.capabilities?.managedMedia === true
  );
}

/**
 * The bridge is authoritative for collaboration mode. Hostname and cookies are
 * deliberately not inspected: pairing cookies are HttpOnly, and a host page is
 * only a collaboration participant when the bridge was explicitly started in
 * LAN mode.
 */
export async function isLanCollaborationSession(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(resolveBridgeUrl('/health?session=1'), {
      cache: 'no-store',
      credentials: 'include',
      signal,
    });
    if (!response.ok) return false;
    return isLanCollaborationHealth(await response.json().catch(() => ({})));
  } catch {
    return false;
  }
}
