import type { NodeKind } from '../canvas/nodeTypes';
import { hydrateApiKeys } from '../lib/keyVault';
import { isProviderConnectionVerified, loadProviderConnections } from '../lib/providerRegistry';
import { chat, type ChatMessage, type GenProvider } from './ai';

export type AgentTemplate = 'text2img' | 'img2img' | 'views' | 'video' | 'script';

export type CanvasAgentAction =
  | { type: 'create_workflow'; template: AgentTemplate; prompt: string }
  | { type: 'update_selected'; prompt: string }
  | { type: 'run_selected' };

export type CanvasAgentResult = {
  reply: string;
  actions: CanvasAgentAction[];
  imageUrls: string[];
};

export type AgentModelSelection = { providerId: string; model: string };

export type AgentReplyLength = 'concise' | 'balanced' | 'detailed';
export type AgentCreativity = 'precise' | 'balanced' | 'creative';

export type CanvasAgentPreferences = {
  replyLength: AgentReplyLength;
  creativity: AgentCreativity;
};

export type ActiveCanvasSkill = {
  name: string;
  instructions: string;
  sourceFileName: string;
  packageName?: string;
  resources?: Array<{ path: string; content: string }>;
};

export type CanvasAgentContext = {
  selectedNode?: { id: string; kind: NodeKind; title: string; prompt?: string };
  nodes: Array<{ kind: NodeKind; title: string }>;
};

const templates = new Set<AgentTemplate>(['text2img', 'img2img', 'views', 'video', 'script']);
const MAX_SKILL_CONTEXT_CHARS = 128 * 1024;
const MAX_SKILLS_PER_REQUEST = 6;

export function buildCanvasSkillSystemMessages(
  activeSkills: ActiveCanvasSkill[] = [],
): ChatMessage[] {
  let remaining = MAX_SKILL_CONTEXT_CHARS;
  return activeSkills.slice(0, MAX_SKILLS_PER_REQUEST).flatMap((skill) => {
    if (remaining <= 0) return [];
    const instructionBudget = Math.min(remaining, 32 * 1024);
    const instructions = skill.instructions.slice(0, instructionBudget);
    remaining -= instructions.length;
    const resources: string[] = [];
    for (const resource of skill.resources ?? []) {
      if (remaining <= 0) break;
      const header = `\n\n--- 只读相对资源：${resource.path} ---\n`;
      const content = resource.content.slice(0, Math.max(0, remaining - header.length));
      if (!content) break;
      resources.push(`${header}${content}`);
      remaining -= header.length + content.length;
    }
    const packageLabel = skill.packageName ? `，包：${skill.packageName}` : '';
    return [
      {
        role: 'system' as const,
        content:
          `当前请求已调度本地 Skill「${skill.name}」（来源：${skill.sourceFileName}${packageLabel}）。` +
          '必须遵循下列 Skill 指令，但只能使用已声明的画布 actions。相对资源仅作为只读上下文；' +
          '不得执行、下载或声称执行脚本、命令、二进制文件，也不得访问未随包导入的本地路径。\n\n' +
          instructions +
          resources.join(''),
      },
    ];
  });
}

async function getChatProvider(selection?: AgentModelSelection | null): Promise<GenProvider> {
  const connections = await hydrateApiKeys(loadProviderConnections());
  const isAvailable = (item: (typeof connections)[number]) =>
    item.enabled &&
    isProviderConnectionVerified(item) &&
    item.canGenerate !== false &&
    !item.disabledModelKinds?.includes('chat') &&
    Boolean(item.models.chat[0]);
  const provider = selection
    ? connections.find(
        (item) =>
          item.id === selection.providerId &&
          isAvailable(item) &&
          item.models.chat.includes(selection.model),
      )
    : connections.find((item) => isAvailable(item));
  if (!provider || !provider.models.chat[0]) {
    throw new Error(
      selection
        ? '当前选择的模型不可用，请检查连接配置或改选一个可用模型。'
        : '请先在 API 设置中连接并启用一个对话模型，再使用画布 AI 助手。',
    );
  }
  const model =
    selection?.providerId === provider.id && provider.models.chat.includes(selection.model)
      ? selection.model
      : provider.models.chat[0];
  const effort = provider.modelReasoningEfforts?.[model];
  return {
    providerId: provider.id,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    endpoint: provider.endpoint,
    authType: provider.authType,
    apiKey: provider.apiKey,
    model,
    reasoningEffort: effort && effort !== 'auto' ? effort : undefined,
  };
}

function parseImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (url): url is string =>
          typeof url === 'string' && /^(?:https?:|blob:|data:image\/)/i.test(url.trim()),
      ),
    ),
  ).slice(0, 4);
}

export function parseCanvasAgentResult(text: string): CanvasAgentResult {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json)
    return { reply: text.trim() || '我暂时无法解析这次回复。', actions: [], imageUrls: [] };
  try {
    const value = JSON.parse(json) as { reply?: unknown; actions?: unknown; images?: unknown };
    const actions = Array.isArray(value.actions)
      ? value.actions.flatMap((action): CanvasAgentAction[] => {
          if (!action || typeof action !== 'object') return [];
          const item = action as Record<string, unknown>;
          if (
            item.type === 'create_workflow' &&
            typeof item.template === 'string' &&
            templates.has(item.template as AgentTemplate) &&
            typeof item.prompt === 'string'
          ) {
            return [
              {
                type: 'create_workflow',
                template: item.template as AgentTemplate,
                prompt: item.prompt,
              },
            ];
          }
          if (item.type === 'update_selected' && typeof item.prompt === 'string') {
            return [{ type: 'update_selected', prompt: item.prompt }];
          }
          return item.type === 'run_selected' ? [{ type: 'run_selected' }] : [];
        })
      : [];
    return {
      reply: typeof value.reply === 'string' ? value.reply.trim() : '已完成画布规划。',
      actions: actions.slice(0, 2),
      imageUrls: parseImageUrls(value.images),
    };
  } catch {
    return { reply: text.trim() || '我暂时无法解析这次回复。', actions: [], imageUrls: [] };
  }
}

export async function runCanvasAgent(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: CanvasAgentContext,
  selection?: AgentModelSelection | null,
  imageUrls: string[] = [],
  preferences: CanvasAgentPreferences = {
    replyLength: 'balanced',
    creativity: 'balanced',
  },
  activeSkills: ActiveCanvasSkill[] = [],
): Promise<CanvasAgentResult> {
  const provider = await getChatProvider(selection);
  const state = JSON.stringify(context);
  const conversation: ChatMessage[] = messages.map((message, index) => {
    const isLastUserMessage = index === messages.length - 1 && message.role === 'user';
    if (!isLastUserMessage || imageUrls.length === 0) return message;
    return {
      role: message.role,
      content: [
        { type: 'text', text: message.content },
        ...imageUrls.map((url) => ({
          type: 'image_url' as const,
          image_url: { url, detail: 'auto' as const },
        })),
      ],
    };
  });
  const response = await chat({
    provider,
    temperature: {
      precise: 0.2,
      balanced: 0.5,
      creative: 0.9,
    }[preferences.creativity],
    messages: [
      {
        role: 'system',
        content:
          '你是 Qiansi-Canvas 的画布执行 Agent。用中文简洁回答。只能返回一个 JSON 对象，不要 markdown：' +
          '{"reply":"给用户的说明","images":["真实图片 URL"],"actions":[...] }。images 仅可返回模型实际获得的图片 URL，禁止编造 URL。actions 只能是：' +
          '{"type":"create_workflow","template":"text2img|img2img|views|video|script","prompt":"节点提示词"}、' +
          '{"type":"update_selected","prompt":"节点提示词"}、{"type":"run_selected"}。' +
          '用户上传图片时必须基于图片中真实可见内容分析并回答。' +
          {
            concise: '回复长度要求：简洁，优先直接结论，通常不超过 120 字。',
            balanced: '回复长度要求：适中，给出结论和必要说明。',
            detailed: '回复长度要求：详细，充分说明分析、建议和下一步。',
          }[preferences.replyLength] +
          '仅在用户明确希望创建、修改或运行画布内容时发动作；不确定时只解释并给出下一步建议。',
      },
      ...buildCanvasSkillSystemMessages(activeSkills),
      { role: 'system', content: `当前画布上下文：${state}` },
      ...conversation,
    ],
  });
  return parseCanvasAgentResult(response.text);
}
