import type { ComposerReference } from './types';

export interface ReferenceMentionOption {
  reference: ComposerReference;
  referenceIndex: number;
  token: string;
}

export const REFERENCE_TOKEN_PATTERN = /@(图片|视频|音频)(\d+)/g;

const REFERENCE_MENTION_TONES = {
  image: {
    chip: 'border-sky-400/25 bg-sky-500/10 text-sky-300',
    text: 'text-sky-300',
  },
  video: {
    chip: 'border-violet-400/25 bg-violet-500/10 text-violet-300',
    text: 'text-violet-300',
  },
  audio: {
    chip: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
    text: 'text-emerald-300',
  },
} as const;

export function referenceMentionTone(type: ComposerReference['type']) {
  return type === 'image' || type === 'video' || type === 'audio'
    ? REFERENCE_MENTION_TONES[type]
    : { chip: 'border-white/10 bg-white/[0.08] text-white/85', text: 'text-white/85' };
}

export function referenceMentionToken(
  reference: ComposerReference,
  referenceIndex: number,
): string | null {
  if (reference.type === 'image') return `@图片${referenceIndex + 1}`;
  if (reference.type === 'video') return `@视频${referenceIndex + 1}`;
  if (reference.type === 'audio') return `@音频${referenceIndex + 1}`;
  return null;
}

export function referenceMentionVideoMode(
  reference: ComposerReference,
  composerType: string,
  videoTool?: string,
): '全能参考' | undefined {
  return reference.type === 'video' && composerType === 'video' && !videoTool
    ? '全能参考'
    : undefined;
}

export function referenceMentionQuery(textBeforeCaret: string): string | null {
  const match = textBeforeCaret.match(/@([^@\s]*)$/u);
  return match?.[1] ?? null;
}

export function referenceMentionOptions(
  references: ComposerReference[],
  query: string,
): ReferenceMentionOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return references.flatMap((reference, referenceIndex) => {
    const token = referenceMentionToken(reference, referenceIndex);
    if (!token) return [];
    const searchable = `${token.slice(1)} ${reference.label}`.toLocaleLowerCase();
    if (normalizedQuery && !searchable.includes(normalizedQuery)) return [];
    return [{ reference, referenceIndex, token }];
  });
}
