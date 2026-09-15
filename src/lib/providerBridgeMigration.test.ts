import { describe, expect, it, vi } from 'vitest';
import type * as BridgeUrlModule from './bridgeUrl';

vi.mock('./bridgeUrl', async (importOriginal) => ({
  ...(await importOriginal<typeof BridgeUrlModule>()),
  BRIDGE_BASE_URL: 'http://192.168.1.25:2895',
  BRIDGE_V1_BASE_URL: 'http://192.168.1.25:2895/v1',
}));

import { createDefaultProviderConnections, restoreProviderConnections } from './providerRegistry';

describe('LAN bridge provider migration', () => {
  it('uses the current bridge for built-in CLI tools while preserving ComfyUI targets', () => {
    const cliProviders = createDefaultProviderConnections().filter(
      (provider) => provider.category === 'cli',
    );
    expect(cliProviders.map((provider) => provider.id)).toEqual([
      'comfyui-local',
      'comfyui-remote',
      'comfyui-cloud',
      'jimeng',
      'codex',
      'workbuddy',
      'gemini',
      'bailian',
      'volcengine-cli',
    ]);
    expect(
      cliProviders
        .filter(
          (provider) =>
            provider.id !== 'comfyui-local' &&
            provider.id !== 'comfyui-remote' &&
            provider.id !== 'comfyui-cloud',
        )
        .every((provider) => provider.baseUrl === 'http://192.168.1.25:2895/v1'),
    ).toBe(true);
    expect(cliProviders.find((provider) => provider.id === 'comfyui-remote')?.baseUrl).toBe('');
    expect(cliProviders.find((provider) => provider.id === 'comfyui-cloud')?.baseUrl).toBe(
      'https://cloud.comfy.org',
    );
  });

  it('migrates only the exact legacy loopback default', () => {
    const restored = restoreProviderConnections([
      {
        id: 'codex',
        baseUrl: 'http://127.0.0.1:2895/v1',
        models: { chat: ['codex:default'], image: [], video: [] },
      },
      {
        id: 'gemini',
        baseUrl: 'http://127.0.0.1:2999/v1',
        models: { chat: ['gemini:auto'], image: [], video: [] },
      },
    ]);

    expect(restored.find((provider) => provider.id === 'codex')?.baseUrl).toBe(
      'http://192.168.1.25:2895/v1',
    );
    expect(restored.find((provider) => provider.id === 'gemini')?.baseUrl).toBe(
      'http://127.0.0.1:2999/v1',
    );
    expect(restored.find((provider) => provider.id === 'gemini')?.models.chat).toEqual([
      'antigravity:auto',
    ]);
  });
});
