import { describe, expect, it } from 'vitest';
import { parsePluginApiSettingsRequest } from './pluginApiSettingsNavigation';

describe('plugin API settings navigation', () => {
  it('allows only the bounded host-managed settings destinations', () => {
    expect(parsePluginApiSettingsRequest({ providerId: 'volcengine' })).toEqual({
      providerId: 'volcengine',
    });
    expect(() => parsePluginApiSettingsRequest({ providerId: 'autodl-art' })).toThrow('不受支持');
    expect(() => parsePluginApiSettingsRequest({ providerId: 'openai' })).toThrow('不受支持');
    expect(() =>
      parsePluginApiSettingsRequest({ providerId: 'volcengine', apiKey: 'must-not-cross' }),
    ).toThrow('未知字段');
  });
});
