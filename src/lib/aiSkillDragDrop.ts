export const AI_SKILL_IMAGE_MIME = 'application/qiansi-ai-skill-image';
export const AI_SKILL_NODE_MIME = 'application/qiansi-canvas-node';
export const AI_SKILL_NODE_DROP_EVENT = 'qiansi:ai-skill-node-drop';
export const AI_SKILL_PROMPT_DROP_SELECTOR = '[data-ai-skill-prompt-drop="true"]';

export type AiSkillImageDragPayload = { url: string; name: string };
export type AiSkillNodeDragPayload = { nodeId: string };

const INLINE_MEDIA_DATA_URL =
  /data:(?:image|video|audio)\/[^,\s"'\\]+(?:;[^,\s"'\\]+)*,[^\s"'\\]+/gi;
const MEDIA_DATA_URL_PREFIX = /^data:(?:image|video|audio)\//i;

export function sanitizeAiSkillPromptValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || MEDIA_DATA_URL_PREFIX.test(trimmed)) return '';
  return trimmed.replace(INLINE_MEDIA_DATA_URL, '[媒体数据已作为附件添加]');
}

export function serializeAiSkillImageDrag(payload: AiSkillImageDragPayload): string {
  return JSON.stringify(payload);
}

export function parseAiSkillImageDrag(raw: string): AiSkillImageDragPayload | null {
  try {
    const value = JSON.parse(raw) as { url?: unknown; name?: unknown };
    if (typeof value.url !== 'string' || !/^(?:https?:|blob:|data:image\/)/i.test(value.url)) {
      return null;
    }
    return {
      url: value.url,
      name:
        typeof value.name === 'string' && value.name.trim()
          ? value.name.trim().slice(0, 120)
          : 'AI Skill 图片',
    };
  } catch {
    return null;
  }
}

export function serializeAiSkillNodeDrag(payload: AiSkillNodeDragPayload): string {
  return JSON.stringify(payload);
}

export function parseAiSkillNodeDrag(raw: string): AiSkillNodeDragPayload | null {
  try {
    const value = JSON.parse(raw) as { nodeId?: unknown };
    if (typeof value.nodeId !== 'string' || !value.nodeId.trim()) return null;
    return { nodeId: value.nodeId.trim().slice(0, 160) };
  } catch {
    return null;
  }
}
