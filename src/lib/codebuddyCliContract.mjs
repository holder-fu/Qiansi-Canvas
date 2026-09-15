export const CODEBUDDY_AUTO_MODEL = 'auto';

const MODEL_ID_RE = /^[a-zA-Z0-9._/-]{1,160}$/;
const ANSI_ESCAPE_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
const DOMESTIC_MODEL_FAMILIES = [
  'deepseek',
  'glm',
  'kimi',
  'qwen',
  'hunyuan',
  'doubao',
  'minimax',
  'abab',
  'moonshot',
  'baichuan',
  'yi',
  'ernie',
  'wenxin',
  'spark',
  'internlm',
  'step',
  'alibaba',
  'tencent',
  'zhipu',
  'bytedance',
  'volc',
];
const OVERSEAS_MODEL_FAMILIES = [
  'gpt',
  'gemini',
  'claude',
  'grok',
  'llama',
  'mistral',
  'command',
  'cohere',
  'nova',
  'jamba',
  'openai',
  'anthropic',
  'google',
  'xai',
  'meta',
  'o1',
  'o3',
  'o4',
  'dall-e',
  'flux',
  'imagen',
  'veo',
];

function hasModelFamily(model, families) {
  const value = model.toLowerCase();
  return families.some(
    (family) => value === family || new RegExp(`^${family}(?:[0-9._/-]|$)`).test(value),
  );
}

function modelRegionRank(model) {
  if (hasModelFamily(model, DOMESTIC_MODEL_FAMILIES)) return 0;
  if (hasModelFamily(model, OVERSEAS_MODEL_FAMILIES)) return 2;
  return 1;
}

/** Keep provider output stable while presenting domestic, unknown, then overseas models. */
export function orderCodeBuddyModels(models) {
  return Array.from(
    new Set(
      models
        .map((model) => String(model || '').trim())
        .filter((model) => model !== CODEBUDDY_AUTO_MODEL && MODEL_ID_RE.test(model)),
    ),
  )
    .map((model, index) => ({ model, index, rank: modelRegionRank(model) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ model }) => model);
}

/** Read `codebuddy config get model` without accepting terminal decoration or prose. */
export function parseCodeBuddyConfiguredModel(value) {
  const text = String(value || '')
    .replace(ANSI_ESCAPE_RE, '')
    .trim();
  const candidates = [
    text,
    ...text
      .split(/\r?\n/)
      .map((line) => line.replace(/^(?:model\s*[:=]\s*|["']|["']$)/gi, '').trim())
      .filter(Boolean),
  ];
  return candidates.find((candidate) => MODEL_ID_RE.test(candidate)) || '';
}

/**
 * Read the model catalog advertised by the installed CLI's `--help` output.
 * The option section is anchored to `--model <model>` so unrelated prose cannot
 * be interpreted as executable model identifiers.
 */
export function parseCodeBuddySupportedModels(value) {
  const text = String(value || '').replace(ANSI_ESCAPE_RE, '');
  const option = text.match(
    /(?:^|\r?\n)\s*--model\s+<model>([\s\S]*?)(?=\r?\n\s*(?:-\w,\s*)?--[a-z]|$)/i,
  );
  if (!option) return [];
  const supported = option[1].match(/Currently supported:\s*\(([\s\S]*?)\)/i);
  if (!supported) return [];
  return orderCodeBuddyModels(supported[1].split(','));
}

/** Merge automatic routing, installed-version discovery and the active setting. */
export function mergeCodeBuddyModels(helpOutput, configuredModel) {
  const configured = parseCodeBuddyConfiguredModel(configuredModel);
  return [
    CODEBUDDY_AUTO_MODEL,
    ...orderCodeBuddyModels([
      ...parseCodeBuddySupportedModels(helpOutput),
      ...(configured ? [configured] : []),
    ]),
  ];
}

/**
 * Read the process-backed sessions advertised by `codebuddy ps --json`.
 * Prewarm and manually registered entries do not prove that the WorkBuddy
 * application is currently open, so they cannot unlock canvas models.
 */
export function parseCodeBuddyActiveSessions(value) {
  const text = String(value || '')
    .replace(ANSI_ESCAPE_RE, '')
    .trim();
  if (!text || /^No active sessions\.?$/i.test(text)) return [];

  let entries;
  try {
    entries = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const pid = Number(entry.pid);
    const kind = String(entry.kind || '')
      .trim()
      .toLowerCase();
    if (!Number.isInteger(pid) || pid <= 0 || entry.manual === true || kind === 'prewarm') {
      return [];
    }
    return [
      {
        pid,
        kind,
        sessionId: String(entry.sessionId || '').trim(),
        status: String(entry.status || '').trim(),
      },
    ];
  });
}

/**
 * Resolve the input modalities that a WorkBuddy model actually advertises.
 *
 * The CLI does not reliably report per-model modalities for every catalog
 * entry, so the bridge and the renderer must agree on a default that
 * reflects what the model can do. `auto` is the WorkBuddy router and may
 * pick a vision-capable model when an image is attached, so it is treated
 * as multimodal. `hy3` is the native CodeBuddy multimodal model.
 *
 * For named models we follow an explicit allow-list of vision model
 * slugs. Unknown models stay text-only so the UI never silently advertises
 * a capability the model does not have.
 */
const VISION_MODEL_PATTERNS = [
  // OpenAI: GPT-4o, 4.1, 4.5, 5.x are multimodal. Codex variants are
  // text/code focused and must stay out of this list.
  /^gpt-4o/,
  /^gpt-4\.1/,
  /^gpt-4\.5/,
  /^gpt-5(\.\d+)?(?:-|$)/,
  // Anthropic: Claude 3+ and 4+ are multimodal
  /^claude-/,
  // Google Gemini: every generation ships with vision
  /^gemini-/,
  // xAI: Grok 1.5 vision and 2+
  /^grok-(1\.5|2|3|4)/,
  // Mistral Pixtral
  /^pixtral/,
  // Meta: Llama 3.2 vision and 3.3 multimodal
  /^llama-3\.2-vision/,
  /^llama-3\.3/,
  // Cohere Command R Vision
  /^command-r-vision/,
  // Zhipu GLM: explicit V/VL suffixes plus the 5/6 base series
  /^glm-(4|5)v/,
  /^glm-.*-v(l|-)/,
  /^glm-(5|6)(\.|$)/,
  // Alibaba Qwen: VL families
  /^qwen-vl/,
  /^qwen[0-9.]*-vl/,
  /^qwen[0-9.]*-vision/,
  // Moonshot Kimi: VL families plus K2.5 / K3+
  /^kimi-vl/,
  /^kimi-k2-vl/,
  /^kimi-k2\.5/,
  /^kimi-k[3-9]/,
  // Tencent Hunyuan vision
  /^hunyuan-vision/,
  /^hunyuan-(a|t|s).*-vision/,
  // Bytedance Doubao vision
  /^doubao-.*vision/,
  /^doubao-1\.5/,
  // DeepSeek vision
  /^deepseek-vl/,
  // Internal MiniMax: m-series is multimodal
  /^minimax-m/,
  /^abab-.*-vision/,
  // Generic suffix fallback for third-party vision endpoints
  /-vision$/,
  /-visual$/,
];

const TEXT_ONLY_MODEL_PATTERNS = [
  // OpenAI codex/code variants are text/code focused
  /-codex/,
  /-text-/,
  /^text-/,
];

/**
 * @param {string} slug
 * @returns {Array<'text' | 'image'>}
 */
export function getCodeBuddyInputModalities(slug) {
  const value = String(slug || '').trim().toLowerCase();
  if (!value) return ['text'];
  if (value === CODEBUDDY_AUTO_MODEL || value === 'hy3') return ['text', 'image'];
  if (TEXT_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(value))) {
    return ['text'];
  }
  if (VISION_MODEL_PATTERNS.some((pattern) => pattern.test(value))) {
    return ['text', 'image'];
  }
  return ['text'];
}

/**
 * Build a non-interactive, text-only invocation. The actual user prompt is
 * sent over stdin so an npm `.cmd` shim never receives untrusted shell text.
 */
export function buildCodeBuddyTextArgs(model) {
  const selected = String(model || CODEBUDDY_AUTO_MODEL).trim();
  if (selected !== CODEBUDDY_AUTO_MODEL && !MODEL_ID_RE.test(selected)) {
    throw new Error('WorkBuddy 模型名称格式无效。');
  }
  return [
    ...(selected === CODEBUDDY_AUTO_MODEL ? [] : ['--model', selected]),
    '--print',
    '--output-format',
    'text',
    '--disallowedTools',
    'Bash Edit Write NotebookEdit WebFetch WebSearch',
    '请直接回答标准输入中的用户请求，不要修改文件、执行命令或访问网络。',
  ];
}
