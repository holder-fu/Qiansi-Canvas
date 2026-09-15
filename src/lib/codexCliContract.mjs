const CODEX_MODEL_RE = /^[a-zA-Z0-9._-]{1,100}$/;

export const CODEX_REASONING_EFFORTS = Object.freeze([
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
]);

const CODEX_REASONING_EFFORT_SET = new Set(CODEX_REASONING_EFFORTS);
const CODEX_IMAGE_DATA_URL_RE = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+/gi;
const CODEX_IMAGE_REMOTE_URL_RE =
  /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?/gi;
const CODEX_IMAGE_ABSOLUTE_PATH_RE =
  /(?:^|[\s"'`(])((?:[A-Za-z]:\\|\/)[^\r\n"'<>]+\.(?:png|jpe?g|webp|gif))/gim;
const CODEX_IMAGE_MARKDOWN_PATH_RE =
  /!\[[^\]]*\]\((?:<)?([^)>\r\n]+\.(?:png|jpe?g|webp|gif))(?:>)?(?:\s+["'][^"']*["'])?\)/gi;
const CODEX_IMAGE_PATH_KEY_RE = /(?:^|_)(?:file(?:name)?|path|output_hint|image_url|url)$/i;
const CODEX_IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?$/i;

function addUnique(items, value) {
  const candidate = String(value || '').trim();
  if (candidate && !items.includes(candidate)) items.push(candidate);
}

function collectCodexOutputStrings(value, output, key = '') {
  if (typeof value === 'string') {
    output.push({ key, value });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCodexOutputStrings(item, output, key);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [childKey, item] of Object.entries(value)) {
    collectCodexOutputStrings(item, output, childKey);
  }
}

function unquoteCodexImagePath(value) {
  return String(value || '')
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
}

export function extractCodexImageCandidates(stdout) {
  const entries = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      collectCodexOutputStrings(JSON.parse(line), entries);
    } catch {
      entries.push({ key: '', value: line });
    }
  }

  const result = { dataUrls: [], paths: [], urls: [], messages: [] };
  for (const { key, value } of entries) {
    for (const match of value.match(CODEX_IMAGE_DATA_URL_RE) || []) {
      addUnique(result.dataUrls, match);
    }
    for (const match of value.match(CODEX_IMAGE_REMOTE_URL_RE) || []) {
      addUnique(result.urls, match);
    }
    for (const match of value.matchAll(CODEX_IMAGE_ABSOLUTE_PATH_RE)) {
      addUnique(result.paths, match[1]);
    }
    for (const match of value.matchAll(CODEX_IMAGE_MARKDOWN_PATH_RE)) {
      addUnique(result.paths, unquoteCodexImagePath(match[1]));
    }
    if (CODEX_IMAGE_PATH_KEY_RE.test(key)) {
      const candidate = unquoteCodexImagePath(value);
      if (/^https?:\/\//i.test(candidate)) {
        addUnique(result.urls, candidate);
      } else if (
        CODEX_IMAGE_EXTENSION_RE.test(candidate) &&
        !/^data:image\//i.test(candidate) &&
        !/^https?:\/\//i.test(candidate)
      ) {
        addUnique(result.paths, candidate);
      }
    }
    if (/^(?:text|message|output_text)$/i.test(key)) addUnique(result.messages, value);
  }
  return result;
}

export function summarizeCodexImageFailure(stderr, stdout) {
  const diagnostic = String(stderr || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Reading prompt from stdin\.\.\.$/i.test(line))
    .join(' ');
  if (diagnostic) return diagnostic.slice(0, 900);

  const { messages } = extractCodexImageCandidates(stdout);
  const message = [...messages]
    .reverse()
    .find((value) => value && !/^data:image\//i.test(value.trim()));
  return String(message || '')
    .trim()
    .slice(0, 900);
}

export function isCodexReasoningEffort(value) {
  return CODEX_REASONING_EFFORT_SET.has(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
}

/** Capability probes must not run until the installed CLI proves a current authenticated session. */
export function inspectCodexPrimaryProbe({ versionCode, loginCode }) {
  const runnable = Number(versionCode) === 0;
  const authenticated = runnable && Number(loginCode) === 0;
  return {
    runnable,
    authenticated,
    ready: authenticated,
    shouldProbeCapabilities: authenticated,
  };
}

export function parseCodexModelCatalog(value) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed?.models)) return [];

  return parsed.models.flatMap((item) => {
    const slug = String(item?.slug || '').trim();
    if (!CODEX_MODEL_RE.test(slug)) return [];
    const reasoningEfforts = Array.isArray(item?.supported_reasoning_levels)
      ? Array.from(
          new Set(
            item.supported_reasoning_levels
              .map((level) =>
                String(level?.effort || '')
                  .trim()
                  .toLowerCase(),
              )
              .filter(isCodexReasoningEffort),
          ),
        )
      : [];
    const requestedDefault = String(item?.default_reasoning_level || '')
      .trim()
      .toLowerCase();
    const defaultReasoningEffort = reasoningEfforts.includes(requestedDefault)
      ? requestedDefault
      : reasoningEfforts[0] || 'medium';
    const inputModalities = Array.isArray(item?.input_modalities)
      ? Array.from(
          new Set(
            item.input_modalities
              .map((modality) =>
                String(modality || '')
                  .trim()
                  .toLowerCase(),
              )
              .filter((modality) => modality === 'text' || modality === 'image'),
          ),
        )
      : [];
    return [
      {
        slug,
        displayName: String(item?.display_name || slug),
        defaultReasoningEffort,
        reasoningEfforts,
        inputModalities,
      },
    ];
  });
}
