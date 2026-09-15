export const BAILIAN_IMAGE_MODELS = ['bailian:qwen-image-2.0'];
export const BAILIAN_VIDEO_MODELS = ['bailian:video-auto'];
export const LIGHTX2V_IMAGE_MODELS = ['lightx2v:image-local'];
export const LIGHTX2V_VIDEO_MODELS = ['lightx2v:video-local'];

export const VISUAL_CLI_MODEL_DISPLAY_NAMES = {
  'bailian:qwen-image-2.0': 'Qwen Image 2.0',
  'bailian:video-auto': '百炼视频自动选择',
  'lightx2v:image-local': 'LightX2V 本地图片',
  'lightx2v:video-local': 'LightX2V 本地视频',
};

export function bailianImageArgs({
  model,
  prompt,
  referencePaths = [],
  size,
  count = 1,
  outputDirectory,
}) {
  const command = referencePaths.length ? ['image', 'edit'] : ['image', 'generate'];
  const args = [
    ...command,
    '--prompt',
    prompt,
    '--model',
    String(model || '').replace(/^bailian:/, '') || 'qwen-image-2.0',
    '--n',
    String(Math.max(1, Math.min(6, Number(count) || 1))),
    '--out-dir',
    outputDirectory,
    '--output',
    'json',
    '--non-interactive',
    '--no-color',
  ];
  if (size) args.push('--size', String(size).replace(/x/gi, '*'));
  for (const path of referencePaths) args.push('--image', path);
  return args;
}

export function bailianVideoArgs({
  model,
  prompt,
  referencePath,
  duration = 5,
  aspectRatio,
  outputPath,
}) {
  const args = [
    'video',
    'generate',
    '--prompt',
    prompt,
    '--duration',
    String(Math.max(2, Math.min(15, Number(duration) || 5))),
    '--download',
    outputPath,
    '--output',
    'json',
    '--non-interactive',
    '--no-color',
  ];
  const normalizedModel = String(model || '').replace(/^bailian:/, '');
  if (normalizedModel && normalizedModel !== 'video-auto') args.push('--model', normalizedModel);
  if (referencePath) args.push('--image', referencePath);
  if (aspectRatio && aspectRatio !== 'Auto') args.push('--ratio', aspectRatio);
  return args;
}
