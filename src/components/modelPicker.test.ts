import { describe, expect, it } from 'vitest';
import { groupModelPickerOptions } from './modelPicker';

describe('groupModelPickerOptions', () => {
  it('keeps models together under their provider while preserving catalog order', () => {
    expect(
      groupModelPickerOptions([
        { providerId: 'deepseek', providerName: 'DeepSeek', model: 'deepseek-v4-flash' },
        { providerId: 'codex', providerName: 'GPT CLI', model: 'codex:gpt-5.6-sol' },
        { providerId: 'deepseek', providerName: 'DeepSeek', model: 'deepseek-v4-pro' },
      ]),
    ).toEqual([
      {
        providerId: 'deepseek',
        providerName: 'DeepSeek',
        providerRegion: undefined,
        models: [
          { providerId: 'deepseek', providerName: 'DeepSeek', model: 'deepseek-v4-flash' },
          { providerId: 'deepseek', providerName: 'DeepSeek', model: 'deepseek-v4-pro' },
        ],
      },
      {
        providerId: 'codex',
        providerName: 'GPT CLI',
        providerRegion: undefined,
        models: [{ providerId: 'codex', providerName: 'GPT CLI', model: 'codex:gpt-5.6-sol' }],
      },
    ]);
  });

  it('shows domestic providers above overseas providers without mutating the model list', () => {
    const options = [
      {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerRegion: '海外' as const,
        model: 'gpt-5.6',
      },
      {
        providerId: 'deepseek',
        providerName: 'DeepSeek',
        providerRegion: '国内' as const,
        model: 'deepseek-v4-pro',
      },
      {
        providerId: 'custom',
        providerName: 'Custom',
        providerRegion: '通用' as const,
        model: 'custom-model',
      },
    ];

    expect(groupModelPickerOptions(options).map((category) => category.providerId)).toEqual([
      'deepseek',
      'custom',
      'openai',
    ]);
    expect(options.map((option) => option.providerId)).toEqual(['openai', 'deepseek', 'custom']);
  });
});
