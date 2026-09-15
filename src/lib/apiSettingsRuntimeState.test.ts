import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiSettingsCliConnectionState,
  mergeApiSettingsRuntimeState,
  subscribeApiSettingsProviderChanges,
} from './apiSettingsRuntimeState';
import {
  PROVIDER_CONNECTIONS_CHANGED_EVENT,
  createDefaultProviderConnections,
} from './providerRegistry';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API settings runtime synchronization', () => {
  it('adopts a newer runtime rejection without overwriting decrypted or editable settings', () => {
    const current = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            apiKey: 'decrypted-in-memory-key',
            enabled: false,
            cliConfig: { workingDirectory: 'C:\\draft-workspace' },
            verifiedAt: 100,
            lastVerifiedAt: 100,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              state: 'ready' as const,
              version: 'old',
              commandPath: 'C:\\bin\\codex.exe',
              message: '旧状态',
              checkedAt: 100,
            },
          }
        : provider,
    );
    const latest = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: undefined,
            lastVerifiedAt: undefined,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: false,
              ready: false,
              state: 'unauthenticated' as const,
              version: 'new',
              commandPath: 'C:\\bin\\codex.exe',
              message: '请登录',
              checkedAt: 200,
            },
            models: { chat: ['codex:new'], image: [], video: [] },
            modelCapabilities: { 'codex:new': { displayName: 'New Codex' } },
          }
        : provider,
    );

    const merged = mergeApiSettingsRuntimeState(current, latest);
    const codex = merged.find((provider) => provider.id === 'codex');
    expect(merged).not.toBe(current);
    expect(codex).toMatchObject({
      apiKey: 'decrypted-in-memory-key',
      enabled: false,
      cliConfig: { workingDirectory: 'C:\\draft-workspace' },
      verifiedAt: undefined,
      lastVerifiedAt: undefined,
      cliStatus: { authenticated: false, ready: false, checkedAt: 200 },
      models: { chat: ['codex:new'], image: [], video: [] },
      modelCapabilities: { 'codex:new': { displayName: 'New Codex' } },
    });
    expect(mergeApiSettingsRuntimeState(merged, latest)).toBe(merged);
  });

  it('preserves a provider while its local edit is pending or its connection identity changed', () => {
    const current = createDefaultProviderConnections();
    const latest = current.map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: 200,
            lastVerifiedAt: 200,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              state: 'ready' as const,
              version: 'new',
              commandPath: 'C:\\bin\\codex.exe',
              message: '已连接',
              checkedAt: 200,
            },
          }
        : provider,
    );

    expect(mergeApiSettingsRuntimeState(current, latest, new Set(['codex']))).toBe(current);
    const editedIdentity = current.map((provider) =>
      provider.id === 'codex' ? { ...provider, baseUrl: 'http://127.0.0.1:3999/v1' } : provider,
    );
    expect(mergeApiSettingsRuntimeState(editedIdentity, latest)).toBe(editedIdentity);
  });

  it('subscribes and unsubscribes from provider connection changes', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const listener = vi.fn();
    const unsubscribe = subscribeApiSettingsProviderChanges(listener);

    target.dispatchEvent(new Event(PROVIDER_CONNECTIONS_CHANGED_EVENT));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    target.dispatchEvent(new Event(PROVIDER_CONNECTIONS_CHANGED_EVENT));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('distinguishes historical CLI availability from a current runtime verification', () => {
    const codex = createDefaultProviderConnections().find((provider) => provider.id === 'codex');
    if (!codex) throw new Error('Default Codex provider is missing.');
    const checkedAt = Date.now();
    const status = {
      installed: true,
      runnable: true,
      authenticated: true,
      ready: true,
      state: 'ready' as const,
      version: 'codex-cli test',
      commandPath: 'C:\\bin\\codex.exe',
      message: '已连接',
      checkedAt,
    };

    expect(
      apiSettingsCliConnectionState(
        { ...codex, verifiedAt: checkedAt, lastVerifiedAt: checkedAt, cliStatus: status },
        true,
      ),
    ).toBe('current');
    expect(
      apiSettingsCliConnectionState(
        { ...codex, verifiedAt: undefined, lastVerifiedAt: checkedAt, cliStatus: status },
        true,
      ),
    ).toBe('historical');
    expect(
      apiSettingsCliConnectionState(
        { ...codex, verifiedAt: undefined, lastVerifiedAt: checkedAt, cliStatus: status },
        false,
      ),
    ).toBe('unavailable');
  });
});
