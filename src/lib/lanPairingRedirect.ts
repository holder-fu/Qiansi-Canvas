const LAN_PAIR_QUERY = 'qiansi_pair';
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,180}$/u;

export interface CanvasLanPairingRedirect {
  cleanCanvasUrl: string;
  bridgePairingUrl: string;
}

/**
 * Turn the one-click canvas URL printed by the host terminal into a Bridge
 * pairing request. The token is removed from the canvas history before the
 * browser leaves the page, and the Bridge removes it again before returning.
 */
export function canvasLanPairingRedirect(
  canvasUrl: string,
  bridgeBaseUrl: string,
): CanvasLanPairingRedirect | undefined {
  let canvas: URL;
  let bridge: URL;
  try {
    canvas = new URL(canvasUrl);
    bridge = new URL(bridgeBaseUrl);
  } catch {
    return undefined;
  }
  const token = String(canvas.searchParams.get(LAN_PAIR_QUERY) || '').trim();
  if (!ACCESS_TOKEN_PATTERN.test(token)) return undefined;
  canvas.searchParams.delete(LAN_PAIR_QUERY);
  bridge.pathname = `${bridge.pathname.replace(/\/+$/u, '')}/`;
  bridge.search = '';
  bridge.hash = '';
  bridge.searchParams.set(LAN_PAIR_QUERY, token);
  return {
    cleanCanvasUrl: canvas.toString(),
    bridgePairingUrl: bridge.toString(),
  };
}

export function beginCanvasLanPairing(bridgeBaseUrl: string) {
  if (typeof window === 'undefined') return false;
  const redirect = canvasLanPairingRedirect(window.location.href, bridgeBaseUrl);
  if (!redirect) return false;
  window.history.replaceState(null, '', redirect.cleanCanvasUrl);
  window.location.replace(redirect.bridgePairingUrl);
  return true;
}
