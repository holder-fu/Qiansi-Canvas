import { referenceMentionQuery } from '../composer/referenceMention';

export type AiSkillMentionRange = {
  start: number;
  end: number;
  query: string;
};

export function resolveAiSkillMention(value: string, caret: number): AiSkillMentionRange | null {
  const safeCaret = Math.max(0, Math.min(caret, value.length));
  const query = referenceMentionQuery(value.slice(0, safeCaret));
  if (query == null) return null;
  return {
    start: safeCaret - query.length - 1,
    end: safeCaret,
    query,
  };
}

export function insertAiSkillMention(
  value: string,
  range: Pick<AiSkillMentionRange, 'start' | 'end'>,
  token: string,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(range.start, value.length));
  const end = Math.max(start, Math.min(range.end, value.length));
  const suffix = value.slice(end);
  const spacer = suffix.startsWith(' ') || suffix.startsWith('\n') ? '' : ' ';
  const nextValue = `${value.slice(0, start)}${token}${spacer}${suffix}`;
  return { value: nextValue, caret: start + token.length + spacer.length };
}
