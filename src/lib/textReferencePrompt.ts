export const IMAGE_REFERENCE_PROMPT =
  '请分析参考图片中的主体、场景、构图、光线和风格，并整理成可复用的生图提示词。';

export const VIDEO_REFERENCE_PROMPT =
  '请分析前置视频中的主体、场景、镜头语言、构图、运镜、人物动作、节奏、光线、色彩和视觉风格，按时间顺序整理为可复用的视频生成提示词。只输出提示词，不描述分析过程。';

export type TextReferencePromptPreset = 'image' | 'video';

export function textReferencePrompt(preset: TextReferencePromptPreset) {
  return preset === 'video' ? VIDEO_REFERENCE_PROMPT : IMAGE_REFERENCE_PROMPT;
}
