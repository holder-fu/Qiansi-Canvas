export interface EffectPreset {
  id: string;
  title: string;
  author: string;
  uses: number;
  tags: string[];
  model: string;
  thumbnail?: string;
}

export const EFFECT_MODELS = [
  '全部',
  'Seedance 2.0',
  'Kling 3.0',
  'Runway Gen-4',
  'Luma Dream Machine',
];

function makeEffect(
  index: number,
  title: string,
  author: string,
  model: string,
  uses = 200,
): EffectPreset {
  return {
    id: `effect-${index}`,
    title,
    author,
    uses,
    tags: [model, '镜头特效'],
    model,
  };
}

export const EFFECT_PRESETS: EffectPreset[] = [
  makeEffect(1, '小黄人镜头', 'Seedance', 'Seedance 2.0', 120),
  makeEffect(2, '穿越镜头', 'Seedance', 'Seedance 2.0', 340),
  makeEffect(3, '飞天镜头', 'Kling', 'Kling 3.0', 280),
  makeEffect(4, '镜头翻滚', 'Runway', 'Runway Gen-4', 190),
  makeEffect(5, '环绕镜头', 'Seedance', 'Seedance 2.0', 250),
  makeEffect(6, '眼神镜头', 'Luma', 'Luma Dream Machine', 170),
  makeEffect(7, '重击镜头', 'Kling', 'Kling 3.0', 210),
  makeEffect(8, '推进镜头', 'Runway', 'Runway Gen-4', 160),
  makeEffect(9, '慢动作特写', 'Seedance', 'Seedance 2.0', 230),
  makeEffect(10, '旋转升格', 'Kling', 'Kling 3.0', 140),
];
