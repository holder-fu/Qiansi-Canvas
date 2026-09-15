export const DEFAULT_STYLE_PROMPT_GUIDE =
  '指令框使用参考：仅描述色彩、光影、材质、笔触、氛围等画风特征；不要填写人物身份、姿势、构图或具体场景。';

const STYLE_PROMPT_GUIDE_STORAGE_KEY = 'kitty-canvas-style-prompt-guide-v1';
const MAX_STYLE_PROMPT_GUIDE_LENGTH = 400;

function normalizeStylePromptGuide(value: string) {
  return value.trim().slice(0, MAX_STYLE_PROMPT_GUIDE_LENGTH) || DEFAULT_STYLE_PROMPT_GUIDE;
}

export function loadStylePromptGuide() {
  try {
    const stored = localStorage.getItem(STYLE_PROMPT_GUIDE_STORAGE_KEY);
    return stored === null ? DEFAULT_STYLE_PROMPT_GUIDE : normalizeStylePromptGuide(stored);
  } catch {
    return DEFAULT_STYLE_PROMPT_GUIDE;
  }
}

export function saveStylePromptGuide(value: string) {
  const normalized = normalizeStylePromptGuide(value);
  try {
    localStorage.setItem(STYLE_PROMPT_GUIDE_STORAGE_KEY, normalized);
  } catch {
    // Keep the current editor session usable when local storage is unavailable.
  }
  return normalized;
}
