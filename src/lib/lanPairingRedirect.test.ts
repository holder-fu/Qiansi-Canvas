import { describe, expect, it } from 'vitest';
import { canvasLanPairingRedirect } from './lanPairingRedirect';

const token = 'A'.repeat(43);

describe('canvas LAN pairing redirect', () => {
  it('moves the host token from the canvas port to the Bridge pairing endpoint', () => {
    expect(
      canvasLanPairingRedirect(
        `http://192.168.50.51:2898/?qiansi_pair=${token}`,
        'http://192.168.50.51:2898/__qiansi_bridge',
      ),
    ).toEqual({
      cleanCanvasUrl: 'http://192.168.50.51:2898/',
      bridgePairingUrl: `http://192.168.50.51:2898/__qiansi_bridge/?qiansi_pair=${token}`,
    });
  });

  it('ignores ordinary canvas links and malformed tokens', () => {
    expect(
      canvasLanPairingRedirect('http://192.168.50.51:2895/', 'http://192.168.50.51:2896'),
    ).toBeUndefined();
    expect(
      canvasLanPairingRedirect(
        'http://192.168.50.51:2895/?qiansi_pair=weak',
        'http://192.168.50.51:2896',
      ),
    ).toBeUndefined();
  });
});
