import { describe, expect, it } from 'vitest';
import {
  BRIDGE_BASE_URL,
  BRIDGE_V1_BASE_URL,
  bridgeResourcePathname,
  canonicalBridgeResourcePathname,
  isCurrentBridgeUrl,
  resolveBridgeBaseUrl,
  resolveBridgeUrl,
} from './bridgeUrl';

describe('bridge URL policy', () => {
  it('uses the browser page origin by default and preserves an explicit override', () => {
    expect(resolveBridgeBaseUrl(null, 'http://192.168.1.25:2895')).toBe('http://192.168.1.25:2895');
    expect(
      resolveBridgeBaseUrl('https://bridge.example.test/proxy/', 'http://192.168.1.25:2895'),
    ).toBe('https://bridge.example.test/proxy');
  });

  it('replaces a wildcard development listener with the browser-visible host', () => {
    expect(resolveBridgeBaseUrl('http://0.0.0.0:2896', 'http://192.168.1.25:2895')).toBe(
      'http://192.168.1.25:2896',
    );
    expect(resolveBridgeBaseUrl('http://0.0.0.0:2896', 'http://127.0.0.1:2895')).toBe(
      'http://127.0.0.1:2896',
    );
  });

  it('replaces a configured loopback bridge with the LAN host visible to this browser', () => {
    expect(resolveBridgeBaseUrl('http://127.0.0.1:2895', 'http://192.168.1.25:2895')).toBe(
      'http://192.168.1.25:2895',
    );
    expect(resolveBridgeBaseUrl('http://localhost:2896', 'http://studio-pc:5173')).toBe(
      'http://studio-pc:2896',
    );
    expect(resolveBridgeBaseUrl('http://127.0.0.1:2895', 'http://localhost:5173')).toBe(
      'http://127.0.0.1:2895',
    );
    expect(resolveBridgeBaseUrl('http://127.0.0.1:2895', 'https://canvas.example.test')).toBe(
      'http://127.0.0.1:2895',
    );
  });

  it('keeps the existing loopback fallback outside a browser', () => {
    expect(resolveBridgeBaseUrl()).toBe('http://127.0.0.1:2895');
    expect(BRIDGE_BASE_URL).toBe('http://127.0.0.1:2895');
    expect(BRIDGE_V1_BASE_URL).toBe('http://127.0.0.1:2895/v1');
  });

  it('strictly rejects unsafe configured bridge addresses', () => {
    expect(() => resolveBridgeBaseUrl('ftp://bridge.example.test')).toThrow('只支持 HTTP 或 HTTPS');
    expect(() => resolveBridgeBaseUrl('http://user:secret@bridge.example.test')).toThrow(
      '不能包含用户名或密码',
    );
    expect(() => resolveBridgeBaseUrl('https://bridge.example.test?token=secret')).toThrow(
      '不能包含查询参数或片段',
    );
  });

  it('resolves relative endpoints and leaves valid absolute URLs on their own origin', () => {
    const base = 'http://192.168.1.25:2895';
    expect(resolveBridgeUrl('/api/chat', base)).toBe('http://192.168.1.25:2895/api/chat');
    expect(resolveBridgeUrl('exports/render.mp4', base)).toBe(
      'http://192.168.1.25:2895/exports/render.mp4',
    );
    expect(resolveBridgeUrl('https://cdn.example.test/render.mp4', base)).toBe(
      'https://cdn.example.test/render.mp4',
    );
    expect(resolveBridgeUrl('/api/chat', 'https://bridge.example.test/proxy')).toBe(
      'https://bridge.example.test/proxy/api/chat',
    );
    expect(() => resolveBridgeUrl('//evil.example.test/media.png', base)).toThrow(
      '不能使用协议相对形式',
    );
  });

  it('rewrites legacy loopback media to the active LAN bridge and preserves its suffix', () => {
    const base = 'http://192.168.1.25:2895';
    expect(
      resolveBridgeUrl(
        'http://127.0.0.1:2895/asset-library/files/asset_1?download=1#preview',
        base,
      ),
    ).toBe('http://192.168.1.25:2895/asset-library/files/asset_1?download=1#preview');
    expect(resolveBridgeUrl('http://localhost:2895/exports/render.mp4', base)).toBe(
      'http://192.168.1.25:2895/exports/render.mp4',
    );
    expect(resolveBridgeUrl('https://cdn.example.test/render.mp4', base)).toBe(
      'https://cdn.example.test/render.mp4',
    );
    expect(
      resolveBridgeUrl('http://127.0.0.1:2895/exports/render.mp4', 'http://localhost:2895'),
    ).toBe('http://127.0.0.1:2895/exports/render.mp4');
  });

  it('rebases persisted Qiansi media from an obsolete development port', () => {
    const base = 'http://127.0.0.1:2895';
    expect(
      resolveBridgeUrl('http://127.0.0.1:2896/media-preview/files/preview_legacy.webp', base),
    ).toBe('http://127.0.0.1:2895/media-preview/files/preview_legacy.webp');
    expect(resolveBridgeUrl('http://localhost:2896/asset-library/files/asset_legacy', base)).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_legacy',
    );
    expect(
      resolveBridgeUrl(
        'http://127.0.0.1:2896/media-preview/files/preview_legacy.webp',
        'http://192.168.1.25:2895',
      ),
    ).toBe('http://192.168.1.25:2895/media-preview/files/preview_legacy.webp');
  });

  it('rebases persisted media from an obsolete private-network bridge address', () => {
    const base = 'http://192.168.50.51:2895';
    expect(resolveBridgeUrl('http://192.168.1.20:2895/asset-library/files/asset_old', base)).toBe(
      'http://192.168.50.51:2895/asset-library/files/asset_old',
    );
    expect(
      resolveBridgeUrl('http://10.0.0.8:2896/media-preview/files/preview_old.webp', base),
    ).toBe('http://192.168.50.51:2895/media-preview/files/preview_old.webp');
    expect(resolveBridgeUrl('http://192.168.1.20:8188/view?filename=image.png', base)).toBe(
      'http://192.168.1.20:8188/view?filename=image.png',
    );
  });

  it('does not duplicate the development proxy prefix when a LAN page repairs persisted media', () => {
    const base = 'http://192.168.50.51:2895/__qiansi_bridge';
    expect(
      resolveBridgeUrl(
        'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_legacy',
        base,
      ),
    ).toBe('http://192.168.50.51:2895/__qiansi_bridge/asset-library/files/asset_legacy');
    expect(
      resolveBridgeUrl(
        'http://127.0.0.1:2896/__qiansi_bridge/media-preview/files/preview_legacy.webp',
        base,
      ),
    ).toBe('http://192.168.50.51:2895/__qiansi_bridge/media-preview/files/preview_legacy.webp');
    expect(resolveBridgeUrl('/__qiansi_bridge/asset-library/files/asset_relative', base)).toBe(
      'http://192.168.50.51:2895/__qiansi_bridge/asset-library/files/asset_relative',
    );
    expect(
      resolveBridgeUrl(
        'http://192.168.50.51:2895/__qiansi_bridge/__qiansi_bridge/output/frame.png',
        base,
      ),
    ).toBe('http://192.168.50.51:2895/__qiansi_bridge/output/frame.png');
  });

  it('removes an obsolete development proxy prefix when the current bridge is direct', () => {
    expect(
      resolveBridgeUrl(
        'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_legacy',
        'http://192.168.50.51:2895',
      ),
    ).toBe('http://192.168.50.51:2895/asset-library/files/asset_legacy');
  });

  it('extracts one canonical bridge resource path through direct and proxied bases', () => {
    expect(
      canonicalBridgeResourcePathname(
        '/__qiansi_bridge/__qiansi_bridge/asset-library/files/asset_legacy',
        '/__qiansi_bridge',
      ),
    ).toBe('/asset-library/files/asset_legacy');
    expect(
      bridgeResourcePathname(
        'http://localhost:2895/__qiansi_bridge/output/render.png?preview=image',
        'http://192.168.50.51:2895/__qiansi_bridge',
      ),
    ).toBe('/output/render.png');
    expect(
      bridgeResourcePathname(
        'https://cdn.example.test/output/render.png',
        'http://192.168.50.51:2895/__qiansi_bridge',
      ),
    ).toBeUndefined();
  });

  it('does not rebase unrelated loopback services such as ComfyUI', () => {
    expect(
      resolveBridgeUrl('http://127.0.0.1:8188/view?filename=result.png', 'http://127.0.0.1:2895'),
    ).toBe('http://127.0.0.1:8188/view?filename=result.png');
    expect(
      resolveBridgeUrl(
        'http://127.0.0.1:8188/output/result.png?filename=result.png#preview',
        'http://192.168.50.51:2895/__qiansi_bridge',
      ),
    ).toBe('http://127.0.0.1:8188/output/result.png?filename=result.png#preview');
    expect(
      resolveBridgeUrl(
        'http://localhost:3000/asset-library/files/third_party_asset',
        'http://192.168.50.51:2895/__qiansi_bridge',
      ),
    ).toBe('http://localhost:3000/asset-library/files/third_party_asset');
  });

  it('recognizes only the selected bridge origin', () => {
    const base = 'http://192.168.1.25:2895';
    expect(isCurrentBridgeUrl('/v1/models', base)).toBe(true);
    expect(isCurrentBridgeUrl('http://192.168.1.25:2895/api/chat', base)).toBe(true);
    expect(isCurrentBridgeUrl('http://192.168.1.26:2895/api/chat', base)).toBe(false);
    expect(isCurrentBridgeUrl('data:text/plain,not-a-bridge-url', base)).toBe(false);
  });
});
