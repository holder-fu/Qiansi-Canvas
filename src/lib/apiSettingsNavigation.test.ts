import { describe, expect, it } from 'vitest';
import type { ProviderConnection } from './providerRegistry';
import { resolveApiSettingsSelection } from './apiSettingsNavigation';

function provider(
  id: string,
  category: ProviderConnection['category'],
  region?: ProviderConnection['region'],
): ProviderConnection {
  return {
    id,
    name: id,
    mark: id.slice(0, 2).toUpperCase(),
    protocol: category === 'cli' ? 'cli' : 'openai',
    category,
    region,
    baseUrl: category === 'cli' ? 'http://127.0.0.1:4455/v1' : 'https://example.test/v1',
    apiKey: '',
    enabled: true,
    models: { chat: [], image: [], video: [] },
  };
}

const connections = [provider('openai', 'text'), provider('comfyui-local', 'cli', '通用')];

describe('API settings navigation', () => {
  it('opens the requested ComfyUI provider in the CLI category', () => {
    expect(resolveApiSettingsSelection(connections, 'comfyui-local')).toEqual({
      category: 'cli',
      providerId: 'comfyui-local',
    });
  });

  it('keeps the existing text-provider fallback for the ordinary API entry', () => {
    expect(resolveApiSettingsSelection(connections)).toEqual({
      category: 'text',
      providerId: 'openai',
    });
  });

  it('uses the domestic-first settings order without changing the input array', () => {
    const mixed = [
      provider('openai', 'text', '海外'),
      provider('generic', 'text', '通用'),
      provider('deepseek', 'text', '国内'),
    ];

    expect(resolveApiSettingsSelection(mixed)).toEqual({
      category: 'text',
      providerId: 'deepseek',
    });
    expect(mixed.map((item) => item.id)).toEqual(['openai', 'generic', 'deepseek']);
  });

  it('keeps an explicitly requested provider authoritative over presentation order', () => {
    const mixed = [
      provider('openai', 'text', '海外'),
      provider('generic', 'text', '通用'),
      provider('deepseek', 'text', '国内'),
    ];

    expect(resolveApiSettingsSelection(mixed, 'openai')).toEqual({
      category: 'text',
      providerId: 'openai',
    });
  });
});
