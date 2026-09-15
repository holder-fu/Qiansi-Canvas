import {
  getTextModeDefinitions,
  setTextModeDefinitions,
  TEXT_MODE_DEFINITIONS,
  type TextModeDefinition,
} from './textGeneration';

export type { TextModeDefinition } from './textGeneration';

export const TEXT_MODE_CATALOG_VERSION = 1 as const;
export const MAX_TEXT_MODES = 32;
const MAX_VALUE_LENGTH = 80;
const MAX_LABEL_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;
const MAX_DETAILS_LENGTH = 800;
const MAX_PLACEHOLDER_LENGTH = 300;
const MAX_TEMPLATE_LENGTH = 4000;
const MAX_INSTRUCTION_LENGTH = 1200;

function clean(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return [...value.normalize('NFKC')]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

function cloneDefault(definition: (typeof TEXT_MODE_DEFINITIONS)[number]): TextModeDefinition {
  return { ...definition };
}

function normalizedDefinition(
  value: unknown,
  fallback: TextModeDefinition,
  custom = false,
): TextModeDefinition | undefined {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const modeValue = custom ? clean(raw.value, MAX_VALUE_LENGTH) : fallback.value;
  const label = clean(raw.label, MAX_LABEL_LENGTH);
  if (!modeValue || (custom && modeValue.length < 2)) return undefined;
  return {
    key: custom ? 'custom' : fallback.key,
    value: modeValue,
    ...(label ? { label } : {}),
    description:
      clean(raw.description, MAX_DESCRIPTION_LENGTH) ||
      fallback.description ||
      '自定义文本处理模式',
    details: clean(raw.details, MAX_DETAILS_LENGTH) || fallback.details,
    placeholder: clean(raw.placeholder, MAX_PLACEHOLDER_LENGTH) || fallback.placeholder,
    promptTemplate: clean(raw.promptTemplate, MAX_TEMPLATE_LENGTH),
    instruction: clean(raw.instruction, MAX_INSTRUCTION_LENGTH) || fallback.instruction,
  };
}

/** Merge persisted edits onto immutable built-ins and append valid custom modes. */
export function normalizeTextModeDefinitions(value: unknown): TextModeDefinition[] {
  const incoming = Array.isArray(value) ? value.slice(0, MAX_TEXT_MODES) : [];
  const byValue = new Map<string, Record<string, unknown>>();
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const modeValue = clean(raw.value, MAX_VALUE_LENGTH);
    if (modeValue && !byValue.has(modeValue)) byValue.set(modeValue, raw);
  }

  const definitions = TEXT_MODE_DEFINITIONS.map(
    (definition) =>
      normalizedDefinition(byValue.get(definition.value), cloneDefault(definition)) ??
      cloneDefault(definition),
  );
  const builtInValues = new Set(definitions.map((definition) => definition.value));
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = normalizedDefinition(
      raw,
      {
        key: 'custom',
        value: '',
        description: '自定义文本处理模式',
        details: '',
        placeholder: '输入要执行的文本操作。',
        promptTemplate: '',
        instruction: '按自定义模式处理输入内容。',
      },
      true,
    );
    if (candidate && !builtInValues.has(candidate.value)) {
      builtInValues.add(candidate.value);
      definitions.push(candidate);
    }
    if (definitions.length >= MAX_TEXT_MODES) break;
  }
  return definitions;
}

export function applyTextModeCatalog(definitions: unknown): TextModeDefinition[] {
  const normalized = normalizeTextModeDefinitions(definitions);
  setTextModeDefinitions(normalized);
  return normalized;
}

export function currentTextModeDefinitions(): readonly TextModeDefinition[] {
  return getTextModeDefinitions();
}

export function textModeLabel(definition: TextModeDefinition) {
  return definition.label?.trim() || definition.value;
}
