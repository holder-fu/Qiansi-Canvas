import { describe, expect, it } from 'vitest';
import {
  publicPluginVolcengineAudioAccess,
  resolvePluginVolcengineAudioProvider,
  selectPluginVolcengineAudioAccess,
} from './pluginVolcengineAudio';

describe('Seed Audio standalone access boundary', () => {
  it('never selects or exposes a Canvas provider or CLI credential', async () => {
    const result = selectPluginVolcengineAudioAccess([
      { protocol: 'volcengine', apiKey: 'host-owned-secret' },
      { protocol: 'volcengine-cli', cliStatus: { ready: true } },
    ]);
    expect(result).toEqual({ route: 'standalone' });
    expect(publicPluginVolcengineAudioAccess(result)).toEqual({ route: 'standalone' });
    expect(JSON.stringify(result)).not.toContain('host-owned-secret');
    await expect(
      resolvePluginVolcengineAudioProvider('doubao-seed-audio', 'doubao-seed-audio-cloud'),
    ).resolves.toBeUndefined();
  });
});
