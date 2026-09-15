const MAX_LANGUAGE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TRANSLATION_LENGTH = 8000;

function placeholders(value: string) {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

export function parsePluginLanguageFile(
  source: string,
  expectedLocale: string,
  englishTemplate: Record<string, string>,
): Record<string, string> {
  if (new TextEncoder().encode(source).byteLength > MAX_LANGUAGE_FILE_BYTES) {
    throw new Error('语言文件不能超过 2 MB。');
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('语言文件不是有效 JSON。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('语言文件必须是 JSON 对象。');
  }
  const document = value as Record<string, unknown>;
  if (document.locale !== expectedLocale) throw new Error('语言文件与清单中的语言代码不一致。');
  const rawTranslations = document.translations;
  if (!rawTranslations || typeof rawTranslations !== 'object' || Array.isArray(rawTranslations)) {
    throw new Error('语言文件缺少 translations 对象。');
  }
  const translations: Record<string, string> = {};
  for (const [key, raw] of Object.entries(rawTranslations)) {
    if (!key || key.length > 240 || key === '__proto__' || key === 'constructor') continue;
    if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_TRANSLATION_LENGTH) continue;
    translations[key] = raw;
  }
  const missing = Object.keys(englishTemplate).filter((key) => !translations[key]);
  if (missing.length > 0) {
    throw new Error(`语言包未达到英文内置覆盖：缺少 ${missing.length} 个翻译键。`);
  }
  for (const [key, english] of Object.entries(englishTemplate)) {
    if (placeholders(english).join('|') !== placeholders(translations[key] ?? '').join('|')) {
      throw new Error(`语言包占位符与英文不一致：${key}。`);
    }
  }
  return translations;
}

export { MAX_LANGUAGE_FILE_BYTES };

export async function readBoundedLanguageResponse(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_LANGUAGE_FILE_BYTES) throw new Error('语言文件不能超过 2 MB。');
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_LANGUAGE_FILE_BYTES) {
        await reader.cancel();
        throw new Error('语言文件不能超过 2 MB。');
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}
