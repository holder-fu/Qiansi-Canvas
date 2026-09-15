export const IMAGE_ENHANCEMENT_TOOLS = [
  'portrait-cutout',
  'cutout',
  'panorama',
  'lighting',
  'face-control',
  'pose-adjust',
  'quality-restore',
  'color-grade',
  'remove-text',
] as const;

export type ImageEnhancementTool = (typeof IMAGE_ENHANCEMENT_TOOLS)[number];

export type FaceMouthShape =
  | 'neutral'
  | 'smirk'
  | 'laugh'
  | 'pout'
  | 'crooked'
  | 'smile'
  | 'pressed'
  | 'bite'
  | 'open'
  | 'downturned';

export interface FaceControlSettings {
  emotionX: number;
  emotionY: number;
  gazeX: number;
  gazeY: number;
  mouth: FaceMouthShape;
}

export type FaceControlSection = 'emotion' | 'gaze' | 'mouth';

export function getFaceControlSectionConstraint(
  settings: FaceControlSettings,
  target: FaceControlSection,
): string | null {
  const hasEmotion = Math.abs(settings.emotionX) > 0.001 || Math.abs(settings.emotionY) > 0.001;
  if (target === 'mouth' && hasEmotion) {
    return '已选择情绪控制，无法再选择嘴巴形态。请先将情绪重置为自然中性。';
  }
  if (target === 'emotion' && settings.mouth !== 'neutral') {
    return '已选择嘴巴形态，无法再选择情绪控制。请先将嘴巴恢复为默认。';
  }
  return null;
}

export function applyFaceControlSettingsPatch(
  current: FaceControlSettings,
  patch: Partial<FaceControlSettings>,
): FaceControlSettings {
  const next = { ...current, ...patch };
  const changesEmotion = patch.emotionX !== undefined || patch.emotionY !== undefined;
  const changesMouth = patch.mouth !== undefined;
  const hasEmotion = Math.abs(next.emotionX) > 0.001 || Math.abs(next.emotionY) > 0.001;

  if (changesEmotion && hasEmotion) next.mouth = 'neutral';
  if (changesMouth && next.mouth !== 'neutral') {
    next.emotionX = 0;
    next.emotionY = 0;
  }

  return next;
}

export interface ImageEnhancementSpec {
  label: string;
  prompt: string;
  aspectRatio?: '21:9';
  imageType?: '720全景' | '电影级光影校正';
}

export const IMAGE_ENHANCEMENT_SPECS: Record<ImageEnhancementTool, ImageEnhancementSpec> = {
  'portrait-cutout': {
    label: '人像抠图',
    prompt:
      '以参考图中的人物为唯一主体，精准移除背景并保留完整发丝、半透明边缘和服装细节，输出干净的透明背景图片。不得改变人物身份、五官、发型、服装、姿态或身体比例，不得新增物体、文字和水印。',
  },
  cutout: {
    label: '智能扣图',
    prompt:
      '智能识别并完整保留参考图中视觉上最主要的主体，精准移除全部背景，保留细小边缘、孔洞、半透明材质和原始纹理，输出带真实透明通道的 PNG 图片。不得重绘、变形、裁切主体，不得新增物体、文字、水印、棋盘格或纯色背景。',
  },
  panorama: {
    label: '全景扩展',
    prompt:
      '基于参考图生成可用于 3D 环视查看的 360 度等距柱状投影全景场景，左右边缘必须无缝衔接，保持原有画风、镜头高度、空间透视、光线和色彩一致，完整补全前后左右连续的环境空间。画面以场景和空间为主体，避免近距离人物主体、边缘接缝、重复元素、拉伸、文字和水印。',
    aspectRatio: '21:9',
    imageType: '720全景',
  },
  lighting: {
    label: '智能打光',
    prompt:
      '以参考图为基础进行电影级重新布光，建立自然的主光、柔和补光和轮廓光，改善明暗层次、色温与空间氛围。保持主体身份、姿态、构图、材质和背景内容一致，只调整光影与色彩，不添加文字或水印。',
    imageType: '电影级光影校正',
  },
  'face-control': {
    label: '面部控制',
    prompt:
      '只优化参考图中主要人物的面部表情、视线和细微五官状态，使表情自然、协调且符合原画情绪。严格保持人物身份、脸型、发型、年龄、服装、身体姿态、构图和背景不变，不得更换人物或添加文字水印。',
  },
  'pose-adjust': {
    label: '姿态调整',
    prompt:
      '在保持人物身份、五官、发型、服装、场景、镜头和画风一致的前提下，修正主要人物的肢体姿态与关节关系，使动作自然、重心合理、手指和四肢结构正确。不得增减人物、改变脸部身份或添加文字水印。',
  },
  'quality-restore': {
    label: '高清修复',
    prompt:
      '对参考图进行高质量细节修复与清晰度提升，恢复自然纹理、边缘和层次，减少压缩噪点、模糊、锯齿与伪影。保持主体身份、五官、姿态、构图、色彩、画风和所有画面内容不变，避免过度锐化、塑料质感、重绘或新增内容。',
  },
  'color-grade': {
    label: '调色',
    prompt:
      '只对参考图进行专业而克制的色彩校正：统一白平衡、曝光、对比度、饱和度和明暗层次，使肤色与环境色自然协调。保持主体身份、姿态、构图、材质、背景内容和画风不变，不得新增或删除元素。',
    imageType: '电影级光影校正',
  },
  'remove-text': {
    label: '去文字',
    prompt:
      '识别并移除参考图中的所有文字、字幕、标识和水印，依据周围纹理、透视、光影与结构自然补全被遮挡区域。必须保持人物、物体、构图、色彩和画风不变，不得删除非文字主体或新增内容。',
  },
};

export function buildImageEnhancementPrompt(
  tool: ImageEnhancementTool,
  customPrompt?: string,
): string {
  const base = IMAGE_ENHANCEMENT_SPECS[tool].prompt;
  const custom = customPrompt?.trim();
  return custom ? `${base}\n\n补充要求：${custom}` : base;
}

function clampControl(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function normalizeFaceControlPointerPosition(position: number, size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0;
  return clampControl((position / size) * 2 - 1);
}

export function getFaceExpressionLabel(
  settings: Pick<FaceControlSettings, 'emotionX' | 'emotionY'>,
) {
  const x = clampControl(settings.emotionX);
  const y = clampControl(settings.emotionY);
  if (x >= 0.4 && y >= 0.35) return '兴奋';
  if (x >= 0.35) return '开心';
  if (x <= -0.35 && y <= -0.15) return '难过';
  if (y <= -0.35) return '低落';
  if (y >= 0.45) return '惊喜';
  if (x <= -0.35) return '忧郁';
  return '自然中性';
}

export function getFaceGazeLabel(settings: Pick<FaceControlSettings, 'gazeX' | 'gazeY'>) {
  const x = clampControl(settings.gazeX);
  const y = clampControl(settings.gazeY);
  const horizontal = x < -0.2 ? '左' : x > 0.2 ? '右' : '';
  const vertical = y > 0.2 ? '上' : y < -0.2 ? '下' : '';
  return horizontal || vertical ? `${horizontal}${vertical}` : '正视';
}

export function buildFaceControlInstruction(settings: FaceControlSettings): string {
  const emotionX = clampControl(settings.emotionX);
  const emotionY = clampControl(settings.emotionY);
  const gazeX = clampControl(settings.gazeX);
  const gazeY = clampControl(settings.gazeY);
  const expression = getFaceExpressionLabel({ emotionX, emotionY });
  const gazeHorizontal = gazeX < -0.2 ? '向画面左侧看' : gazeX > 0.2 ? '向画面右侧看' : '保持正视';
  const gazeVertical = gazeY > 0.2 ? '视线略微上抬' : gazeY < -0.2 ? '视线略微下垂' : '保持平视';
  const mouth = {
    neutral: '嘴唇自然放松并保持闭合',
    smirk: '形成自然的单侧咧笑，一侧嘴角明显上扬',
    laugh: '自然大笑并适度露齿，嘴部结构真实',
    pout: '双唇向前收拢形成自然嘟嘴',
    crooked: '嘴角形成轻微不对称的歪嘴表情',
    smile: '嘴角自然上扬，形成协调微笑',
    pressed: '双唇轻轻收紧形成克制的瘪嘴表情',
    bite: '轻咬下唇，动作自然克制',
    open: '嘴巴自然微张',
    downturned: '嘴角自然下垂，形成失落的嘴部状态',
  }[settings.mouth];
  const valence = Math.round(emotionX * 100);
  const energy = Math.round(emotionY * 100);

  return `将主要人物的面部表情调整为“${expression}”，情绪愉悦度 ${valence}，情绪活跃度 ${energy}；${gazeHorizontal}，${gazeVertical}；${mouth}。表情变化必须自然可信，只改变表情、视线和嘴部细微状态，严格保持人物身份、脸型、五官结构、年龄、发型、妆容、服装、身体姿态、构图、背景、光影和画风不变。`;
}
