export interface CameraPromptCue {
  id: string;
  title: string;
  prompt: string;
}

export function stripCameraPrompt(existingPrompt: string): string {
  return existingPrompt
    .split('\n')
    .filter((line) => !/^\s*运镜(?:提示词)?：/.test(line))
    .join('\n')
    .trim();
}

export function normalizeCameraPromptCues(value: unknown): CameraPromptCue[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<CameraPromptCue>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim() : '';
    if (!id || !title || !prompt || seen.has(id)) return [];
    seen.add(id);
    return [{ id, title, prompt }];
  });
}

export function resolveCameraPromptCues(
  value: unknown,
  legacy?: { id?: unknown; title?: unknown; prompt?: unknown },
): CameraPromptCue[] {
  const structured = normalizeCameraPromptCues(value);
  return structured.length > 0 ? structured : normalizeCameraPromptCues(legacy ? [legacy] : []);
}

export function mergeCameraPrompts(
  existingPrompt: string,
  cameraPrompts: readonly CameraPromptCue[],
): string {
  const retainedPrompt = stripCameraPrompt(existingPrompt);
  const cameraLines = normalizeCameraPromptCues(cameraPrompts).flatMap((camera) => [
    `运镜：${camera.title}`,
    `运镜提示词：${camera.prompt.replace(/\s+/g, ' ').trim()}`,
  ]);
  return [retainedPrompt, ...cameraLines].filter(Boolean).join('\n');
}

export function mergeCameraPrompt(
  existingPrompt: string,
  title: string,
  cameraPrompt: string,
): string {
  return mergeCameraPrompts(existingPrompt, [
    { id: title.trim(), title: title.trim(), prompt: cameraPrompt },
  ]);
}
