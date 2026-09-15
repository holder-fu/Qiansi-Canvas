import { describe, expect, it } from 'vitest';
import {
  deletePluginPreference,
  readPluginPreference,
  sanitizePluginPreferenceKey,
  writePluginPreference,
} from './pluginPreferences';

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

describe('plugin preferences', () => {
  it('persists JSON values inside the owning plugin namespace', () => {
    const storage = memoryStorage();
    const voices = [{ id: 'user-1', label: '温暖叙事', description: '温暖、自然、舒缓' }];

    expect(writePluginPreference('voxcpm2-tts', 'voice-presets.v1', voices, storage)).toEqual(
      voices,
    );
    expect(readPluginPreference('voxcpm2-tts', 'voice-presets.v1', storage)).toEqual(voices);
    expect(readPluginPreference('chattts-tts', 'voice-presets.v1', storage)).toBeNull();
  });

  it('deletes only the requested preference and reports whether it existed', () => {
    const storage = memoryStorage();
    writePluginPreference('voxcpm2-tts', 'voice-presets.v1', ['voice'], storage);
    writePluginPreference('voxcpm2-tts', 'layout.v1', { compact: true }, storage);

    expect(deletePluginPreference('voxcpm2-tts', 'voice-presets.v1', storage)).toBe(true);
    expect(readPluginPreference('voxcpm2-tts', 'voice-presets.v1', storage)).toBeNull();
    expect(readPluginPreference('voxcpm2-tts', 'layout.v1', storage)).toEqual({ compact: true });
    expect(deletePluginPreference('voxcpm2-tts', 'voice-presets.v1', storage)).toBe(false);
  });

  it('lets Qiansi-audio read legacy voice presets until it writes its own value', () => {
    const storage = memoryStorage();
    writePluginPreference('voxcpm2-tts', 'voice-presets.v1', ['legacy-voice'], storage);

    expect(readPluginPreference('qiansi-audio', 'voice-presets.v1', storage)).toEqual([
      'legacy-voice',
    ]);
    writePluginPreference('qiansi-audio', 'voice-presets.v1', ['unified-voice'], storage);
    expect(readPluginPreference('qiansi-audio', 'voice-presets.v1', storage)).toEqual([
      'unified-voice',
    ]);
  });

  it('rejects unsafe keys, non-JSON values, oversized values and excessive keys', () => {
    const storage = memoryStorage();
    expect(() => sanitizePluginPreferenceKey('../secret')).toThrow('偏好键');
    expect(() => writePluginPreference('voxcpm2-tts', 'bad', undefined, storage)).toThrow(
      '不能为空',
    );
    expect(() => writePluginPreference('voxcpm2-tts', 'bad', 1n, storage)).toThrow('JSON');
    expect(() =>
      writePluginPreference('voxcpm2-tts', 'too-large', 'x'.repeat(33 * 1024), storage),
    ).toThrow('32 KB');

    for (let index = 0; index < 32; index += 1) {
      writePluginPreference('voxcpm2-tts', `key-${index}`, index, storage);
    }
    expect(() => writePluginPreference('voxcpm2-tts', 'key-overflow', true, storage)).toThrow(
      '最多保存 32 项',
    );
    expect(writePluginPreference('voxcpm2-tts', 'key-0', 'updated', storage)).toBe('updated');
  });

  it('recovers from malformed persisted state without exposing it', () => {
    const storage = memoryStorage();
    storage.setItem('qiansi-plugin-preferences-v1', '{broken');
    expect(readPluginPreference('voxcpm2-tts', 'voice-presets.v1', storage)).toBeNull();
    expect(writePluginPreference('voxcpm2-tts', 'voice-presets.v1', [], storage)).toEqual([]);
  });
});
