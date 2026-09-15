import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPluginAutoDlH3Connection,
  configurePluginAutoDlH3Connection,
  readPluginAutoDlH3ConnectionStatus,
} from './pluginAutoDlH3Connection';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage(),
  });
});

describe('plugin AutoDL H3 connection settings', () => {
  it('stores the token only in the encrypted host vault and returns fixed workflows', async () => {
    const token = 'autodl-secret-token';
    const status = await configurePluginAutoDlH3Connection(token);

    expect(status).toMatchObject({
      configured: true,
      executable: false,
      baseUrl: 'https://autodl.art',
    });
    expect(status.workflows.map((workflow) => workflow.model)).toEqual([
      'minimax_h3_zm_u24',
      'minimax_h3_zm_u08',
    ]);
    const persisted = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.getItem(localStorage.key(index) || '') || '',
    ).join('\n');
    expect(persisted).not.toContain(token);
    await expect(readPluginAutoDlH3ConnectionStatus()).resolves.toMatchObject({
      configured: true,
      executable: false,
    });
  });

  it('clears both the encrypted token and non-secret status marker', async () => {
    await configurePluginAutoDlH3Connection('temporary-token');
    await expect(clearPluginAutoDlH3Connection()).resolves.toMatchObject({ configured: false });
    await expect(readPluginAutoDlH3ConnectionStatus()).resolves.toMatchObject({
      configured: false,
      configuredAt: null,
    });
  });

  it('rejects empty and oversized tokens', async () => {
    await expect(configurePluginAutoDlH3Connection('   ')).rejects.toThrow('请填写');
    await expect(configurePluginAutoDlH3Connection('x'.repeat(4097))).rejects.toThrow('4096');
  });
});
