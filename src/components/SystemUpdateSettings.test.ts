import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settingsSource = readFileSync(new URL('./SettingsPanel.tsx', import.meta.url), 'utf8');
const bridgeSource = readFileSync(new URL('../../local-bridge.mjs', import.meta.url), 'utf8');

describe('SystemUpdateSettings rollback preparation', () => {
  it('keeps rollback disabled until a verified previous release is discovered', () => {
    expect(settingsSource).toContain("'status' | 'network' | 'check' | 'download' | 'rollback'");
    expect(settingsSource).toContain('disabled={Boolean(busy) || !result?.previous}');
    expect(settingsSource).toContain('prepareSystemRollback(result.previous.sourceId)');
    expect(settingsSource).toContain('settingsPage.systemUpdate.rollbackVerifiedOnly');
  });

  it('uses a dedicated host-only rollback endpoint without online file replacement', () => {
    expect(bridgeSource).toContain("url.pathname === '/system-update/rollback'");
    expect(bridgeSource).toContain("downloadVerifiedSystemPackage(source, previous, 'rollback')");
    expect(settingsSource).toContain('不会在线覆盖源码、自动解压或修改 data');
  });

  it('keeps network reachability separate from strict manifest validation', () => {
    expect(settingsSource).toContain('testSystemUpdateNetwork(sourceId)');
    expect(settingsSource).toContain('source.networkReachable === true');
    expect(settingsSource).toContain('settingsPage.systemUpdate.status.networkManifestUnavailable');
    expect(bridgeSource).toContain("url.pathname === '/system-update/connectivity'");
    expect(bridgeSource).toContain('probeUpdateSourceConnectivity(source)');
  });
});
