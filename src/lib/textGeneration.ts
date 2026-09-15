export const DEFAULT_TEXT_TASK_MODE = '自由指令' as const;

export const TEXT_OUTPUT_ONLY_INSTRUCTION =
  '【输出类型】本节点只生成文本。无论用户指令中是否出现“生成图片、视频或音频”等表述，都只能返回用户要求的文本内容（例如提示词、说明或方案）；不得调用媒体生成工具、创建或修改文件，也不得声称已经生成媒体。';

export const TEXT_MODE_DEFINITIONS = [
  {
    key: 'instruct',
    value: DEFAULT_TEXT_TASK_MODE,
    description: '直接执行你在指令框中写下的要求',
    details:
      '把节点正文或上游文本作为只读上下文，仅执行指令框中的要求。适合自由问答、分析、翻译，以及“根据上面的提示词生成同类风格提示词”等自定义任务。',
    placeholder: '描述要对上方内容执行的操作，例如：生成一个同类风格图片提示词。',
    promptTemplate: '',
    instruction: '严格执行用户指令；把输入来源当作素材或上下文，不要擅自改成续写任务。',
  },
  {
    key: 'continue',
    value: '续写',
    description: '延续人物、语气和现有剧情',
    details:
      '接着已有文本继续发展，保持人物设定、叙事语气、时间线和因果关系一致。适合补写剧情、对白或段落，输入越完整，续写的衔接越自然。',
    placeholder: '可以补充希望继续发展的方向；留空则直接续写输入内容。',
    promptTemplate: '请延续下面的内容，保持人物设定、语气和剧情因果一致，不要重复已有内容：',
    instruction: '在保持原有人物、语气和因果关系的前提下续写，不要重复已有内容。',
  },
  {
    key: 'rewrite',
    value: '改写',
    description: '保留原意，优化表达与结构',
    details:
      '不改变原文的核心意思和关键事实，重新组织句子、段落与表达方式。适合润色语气、调整结构、压缩冗余，或让内容更适合直接发布和使用。',
    placeholder: '补充期望的语气、风格或结构；留空则按默认方式改写。',
    promptTemplate: '请保留原意和关键信息，将下面的内容改写得更清晰、自然：',
    instruction: '保留原意和关键信息，重写为更清晰、自然、可直接使用的文本。',
  },
  {
    key: 'summarize',
    value: '总结',
    description: '提炼关键信息和重要因果',
    details:
      '从较长内容中提炼主题、关键事实、人物关系、重要因果和可执行结论，不凭空补充原文没有的信息。适合快速掌握文章、会议记录或剧情梗概。',
    placeholder: '补充希望保留的重点；留空则总结全部输入内容。',
    promptTemplate: '请总结下面的内容，提炼核心信息、重要因果和关键结论：',
    instruction: '提炼核心信息、重要因果和可执行结论，不要添加原文没有的事实。',
  },
  {
    key: 'storyboard',
    value: '拆分镜',
    description: '拆成景别、动作和镜头画面',
    details:
      '把剧情或脚本按时间顺序拆成可执行的镜头，补充景别、画面主体、人物动作、镜头运动和镜头意图。适合把文字梗概整理成拍摄或生成视频所需的分镜表。',
    placeholder: '补充分镜数量、时长或格式；留空则自动拆分。',
    promptTemplate:
      '请将下面的内容拆分为按时间顺序可拍摄的分镜，明确景别、人物动作、画面内容和镜头意图：',
    instruction: '把内容拆成按时间顺序可拍摄的分镜，明确景别、人物动作、画面与镜头意图。',
  },
  {
    key: 'extractCharacters',
    value: '提取人物',
    description: '整理人物身份、外观和关系',
    details:
      '只整理文本中能够确认的人物信息，包括身份、外观、性格、人物关系和当前目标，并区分明确事实与不确定内容。适合建立角色卡和后续创作参考。',
    placeholder: '补充需要的角色卡字段；留空则提取全部可确认人物。',
    promptTemplate:
      '请从下面的内容中提取可以确认的人物，并整理其身份、外观、性格、关系和当前目标：',
    instruction: '仅提取文本中可确认的人物，整理身份、外观、性格、关系与当前目标。',
  },
  {
    key: 'generatePrompt',
    value: '生成提示词',
    description: '转换为可直接使用的生成提示词',
    details:
      '把画面设想、剧情或素材说明整理成可直接提交给图像或视频模型的提示词，覆盖主体、环境、构图、镜头、光影、材质和风格等约束。',
    placeholder: '补充目标模型、画幅或需要保留的风格；留空则生成通用提示词。',
    promptTemplate:
      '请分析下面的内容，并整理为可直接用于生成模型的提示词，包含主体、环境、构图、光影和风格：',
    instruction: '将内容转换为适合生成模型的明确提示词，保留主体、环境、构图、光影和风格约束。',
  },
] as const;

export type TextModeDefinition = {
  key: string;
  value: string;
  label?: string;
  description: string;
  details: string;
  placeholder: string;
  promptTemplate: string;
  instruction: string;
};

/** Text modes may be extended by the local mode editor; built-ins remain the fallback. */
export type TextTaskMode = string;
export type TextContentRole = 'source' | 'instruction';

let activeTextModeDefinitions: readonly TextModeDefinition[] = TEXT_MODE_DEFINITIONS;

export function getTextModeDefinitions(): readonly TextModeDefinition[] {
  return activeTextModeDefinitions;
}

export function setTextModeDefinitions(definitions: readonly TextModeDefinition[]) {
  activeTextModeDefinitions = definitions.length ? definitions : TEXT_MODE_DEFINITIONS;
}

export interface ResolveTextTaskInput {
  upstreamTexts?: readonly unknown[];
  prompt?: unknown;
  textInstruction?: unknown;
  promptOverride?: unknown;
  contentRole?: unknown;
}

export interface ResolvedTextTaskInput {
  sourceTexts: string[];
  instruction: string;
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedSourceTexts(values: readonly unknown[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? []).map(normalizedText).filter((value): value is string => value.length > 0),
    ),
  ];
}

export function resolveTextModeDefinition(mode: unknown) {
  return activeTextModeDefinitions.find((definition) => definition.value === mode);
}

/** Remove a mode template saved by older composer versions from editable user text. */
export function stripLegacyTextModePrompt(prompt: string): string {
  let content = prompt.trim();
  let changed = true;
  while (content && changed) {
    changed = false;
    for (const definition of activeTextModeDefinitions) {
      const template = definition.promptTemplate.trim();
      if (!template) continue;
      if (content === template) return '';
      if (content.startsWith(`${template}\n\n`)) {
        content = content.slice(template.length + 2).trim();
        changed = true;
        break;
      }
      if (content.startsWith(`${template}\n`)) {
        content = content.slice(template.length + 1).trim();
        changed = true;
        break;
      }
    }
  }
  return content;
}

function stripSourceTextPrefix(prompt: string, sourceTexts: readonly string[]): string {
  if (!prompt || sourceTexts.length === 0) return prompt;
  const candidates = [sourceTexts.join('\n'), sourceTexts.join('\n\n')].filter(Boolean);
  for (const candidate of candidates) {
    if (prompt === candidate) return '';
    if (prompt.startsWith(`${candidate}\n\n`)) {
      return prompt.slice(candidate.length + 2).trim();
    }
    if (prompt.startsWith(`${candidate}\n`)) {
      return prompt.slice(candidate.length + 1).trim();
    }
  }

  let remainder = prompt;
  for (const source of sourceTexts) {
    if (remainder === source) return '';
    if (remainder.startsWith(`${source}\n\n`)) {
      remainder = remainder.slice(source.length + 2).trim();
      continue;
    }
    if (remainder.startsWith(`${source}\n`)) {
      remainder = remainder.slice(source.length + 1).trim();
      continue;
    }
    return prompt;
  }
  return remainder;
}

/** Resolve source material and the editable user instruction without mutating saved data. */
export function resolveTextTaskInput(input: ResolveTextTaskInput): ResolvedTextTaskInput {
  const prompt = normalizedText(input.prompt);
  const upstreamTexts = normalizedSourceTexts(input.upstreamTexts);
  const role = input.contentRole === 'source' ? 'source' : 'instruction';
  const sourceTexts =
    role === 'source' && prompt ? normalizedSourceTexts([...upstreamTexts, prompt]) : upstreamTexts;
  const hasExplicitInstruction =
    typeof input.promptOverride === 'string' || typeof input.textInstruction === 'string';
  const explicitInstruction = normalizedText(
    typeof input.promptOverride === 'string' ? input.promptOverride : input.textInstruction,
  );

  if (hasExplicitInstruction) {
    return { sourceTexts, instruction: stripLegacyTextModePrompt(explicitInstruction) };
  }
  if (role === 'source') return { sourceTexts, instruction: '' };

  const legacyInstruction = stripLegacyTextModePrompt(prompt);
  return {
    sourceTexts,
    instruction: stripSourceTextPrefix(legacyInstruction, sourceTexts),
  };
}

/** Compile source context and the user's operation into visibly separate request blocks. */
export function buildTextWorkflowPrompt(
  sourceTexts: readonly string[],
  instruction: string,
): string {
  const sources = normalizedSourceTexts(sourceTexts);
  const normalizedInstruction = instruction.trim();
  if (sources.length === 0) return normalizedInstruction;

  const sourceBlock =
    sources.length === 1
      ? sources[0]
      : sources.map((source, index) => `【来源 ${index + 1}】\n${source}`).join('\n\n');
  if (!normalizedInstruction) return `【输入内容】\n${sourceBlock}`;
  return [`【输入来源】\n${sourceBlock}`, `【用户指令】\n${normalizedInstruction}`].join('\n\n');
}

export function canSubmitTextTask(
  instruction: string,
  _mode: unknown,
  sourceCount: number,
): boolean {
  if (instruction.trim()) return true;
  return sourceCount > 0;
}

/** Legacy helper retained for saved data/tests; new UI mode changes never rewrite user text. */
export function applyTextModePrompt(
  prompt: string,
  previousMode: unknown,
  nextMode: TextTaskMode,
): string {
  const previousTemplate = resolveTextModeDefinition(previousMode)?.promptTemplate;
  const nextTemplate = resolveTextModeDefinition(nextMode)?.promptTemplate;

  let content = prompt.trim();
  if (previousTemplate) {
    if (content === previousTemplate) content = '';
    else if (content.startsWith(`${previousTemplate}\n\n`)) {
      content = content.slice(previousTemplate.length + 2).trim();
    }
  }

  if (!nextTemplate) return content;
  return content ? `${nextTemplate}\n\n${content}` : nextTemplate;
}

export function normalizeTextMaxLength(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.min(100_000, Math.round(value)));
}

/** Build an instruction that can be prepended to either a prompt or chat messages. */
export function buildTextTaskInstruction(mode?: string, maxLength?: number): string {
  const normalizedMode = mode?.trim();
  const normalizedLength = normalizeTextMaxLength(maxLength);
  const lines: string[] = normalizedMode ? [TEXT_OUTPUT_ONLY_INSTRUCTION] : [];

  if (normalizedMode) {
    lines.push(`【任务模式】${normalizedMode}`);
    lines.push(
      resolveTextModeDefinition(normalizedMode)?.instruction ??
        `按“${normalizedMode}”的目标处理用户内容。`,
    );
  }
  if (normalizedLength) {
    lines.push(`【输出长度】最多 ${normalizedLength} 字；优先保留完整信息，不要用截断句收尾。`);
  }

  return lines.join('\n');
}

/** Preserve the legacy prompt byte-for-byte when no task parameters were selected. */
export function buildTextTaskPrompt(prompt: string, mode?: string, maxLength?: number): string {
  const instruction = buildTextTaskInstruction(mode, maxLength);
  if (!instruction) return prompt;
  const content = prompt.trim();
  return content ? `${instruction}\n\n【待处理内容】\n${content}` : instruction;
}
