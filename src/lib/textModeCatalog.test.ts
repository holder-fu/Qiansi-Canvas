import { describe, expect, it } from 'vitest';
import { TEXT_MODE_DEFINITIONS } from './textGeneration';
import {
  applyTextModeCatalog,
  normalizeTextModeDefinitions,
  textModeLabel,
} from './textModeCatalog';

describe('text mode catalog', () => {
  it('keeps every built-in mode while applying persisted edits and custom modes', () => {
    const modes = normalizeTextModeDefinitions([
      { value: '续写', label: '继续写', details: '自定义说明' },
      {
        key: 'custom',
        value: 'custom-review',
        label: '审校',
        description: '检查文本',
        details: '检查错别字和语气',
        placeholder: '粘贴文本',
        promptTemplate: '请审校：',
        instruction: '检查文本。',
      },
      { key: 'custom', value: 'custom-review', label: '重复项' },
    ]);
    expect(modes).toHaveLength(TEXT_MODE_DEFINITIONS.length + 1);
    const renamed = modes.find((mode) => mode.value === '续写');
    expect(renamed).toBeDefined();
    if (!renamed) throw new Error('renamed mode missing');
    expect(textModeLabel(renamed)).toBe('继续写');
    expect(modes.filter((mode) => mode.value === 'custom-review')).toHaveLength(1);
  });

  it('applies normalized definitions to the text generation resolver', () => {
    const modes = applyTextModeCatalog([
      {
        key: 'custom',
        value: 'custom-review',
        label: '审校',
        description: '检查文本',
        details: '检查文本',
        placeholder: '输入',
        promptTemplate: '请审校：',
        instruction: '检查。',
      },
    ]);
    expect(modes.some((mode) => mode.value === 'custom-review')).toBe(true);
  });
});
