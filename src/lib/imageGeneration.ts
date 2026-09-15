export const IMAGE_TYPE_GROUPS = [
  {
    key: 'story-and-texture',
    groups: [
      {
        title: '分镜叙事',
        options: ['25宫格连贯分镜', '剧情推演四宫格', '画面推演 - 3秒后', '画面推演 - 5秒前'],
      },
      { title: '质感调节', options: ['人像质感调节', '电影级光影校正'] },
      { title: '人物表情', options: ['9宫人物表情', '9宫格人物表情挤眼弄眉'] },
    ],
  },
  {
    key: 'camera-and-design',
    groups: [
      { title: '空间与机位', options: ['720全景', '多机位九宫格'] },
      {
        title: '设定图',
        options: ['角色脸部三视图', '角色设定图', '角色三视图', '场景设定图', '产品设定图'],
      },
    ],
  },
] as const;

export const IMAGE_TYPE_DESCRIPTIONS: Record<string, string> = {
  '25宫格连贯分镜': '按时间顺序生成连续动作分镜，保持人物与场景一致。',
  剧情推演四宫格: '用建立、发展、转折、结果四个画面推演同一段剧情。',
  '画面推演 - 3秒后': '保持角色与机位一致，推演当前画面约 3 秒后的状态。',
  '画面推演 - 5秒前': '保持角色与机位一致，反推当前画面约 5 秒前的状态。',
  人像质感调节: '保留身份和构图，优化皮肤、光影与色彩层次。',
  电影级光影校正: '不改变画面内容，重建电影级主辅光与统一色调。',
  '9宫人物表情': '白底九宫格，展示同一人物的九种不同面部表情。',
  '9宫格人物表情挤眼弄眉': '白底写真九宫格，突出挤眼、挑眉等细腻小情绪。',
  '720全景': '展示完整空间结构、前中后景关系与可用机位。',
  多机位九宫格: '为同一主体和场景生成九个不同机位参考。',
  角色脸部三视图: '生成正面、左侧面、右侧面，统一五官与发型。',
  角色设定图: '集中展示角色外形、服装、配饰和材质细节。',
  角色三视图: '生成全身正面、侧面、背面，统一比例与服装结构。',
  场景设定图: '展示空间布局、尺度、材质、光线和叙事区域。',
  产品设定图: '展示产品造型、结构、材质、颜色和功能细节。',
};

const IMAGE_TYPE_PROMPTS: Record<string, string> = {
  '25宫格连贯分镜':
    '生成一张 5×5、共 25 格的连续分镜板。镜头按从左到右、从上到下的顺序推进；保持人物身份、服装、道具、场景和光线连续一致；动作与视线衔接自然，每格构图清晰，不添加字幕、水印或无关文字。',
  剧情推演四宫格:
    '生成一张 2×2 四宫格剧情推演图，依次表现同一事件的建立、发展、转折和结果。四格必须保持人物身份、服装、场景和美术风格一致，动作因果清楚，不添加字幕、水印或无关文字。',
  '画面推演 - 3秒后':
    '根据当前画面和参考素材，推演同一镜头约 3 秒后的合理状态。保持人物身份、服装、场景、机位、镜头焦段和光线一致，只推进动作、表情与环境中的自然变化。',
  '画面推演 - 5秒前':
    '根据当前画面和参考素材，反推同一镜头约 5 秒前的合理状态。保持人物身份、服装、场景、机位、镜头焦段和光线一致，让动作起因与当前画面自然衔接。',
  人像质感调节:
    '在不改变人物身份、五官比例、发型、服装和原始构图的前提下优化人像质感。保留真实皮肤纹理与细节，改善层次、光影和色彩，避免过度磨皮、塑料感和面部变形。',
  电影级光影校正:
    '在不改变主体、构图和叙事内容的前提下进行电影级光影与色彩校正。建立清晰的主辅光关系、自然的明暗层次、统一的色温和克制的电影调色，避免过曝、死黑与过度锐化。',
  '9宫人物表情':
    '白色背景，9宫格排列，展示9种不同面部表情9种表情分别是（从左到右、从上到下）：\n自然/平静表情\n微笑\n酷/冷淡表情\n抬头/疑惑表情\n开心大笑\n侧目/挑眉\n惊讶/震惊\n生气/皱眉\n嘟嘴/可爱',
  '9宫格人物表情挤眼弄眉':
    '白色为背景，采用九宫格排版，展示主体的九种不同表情。第一排从左到右- 依次单眼皱眉抿嘴，挤眼嘟唇，瞪大双眼张嘴。然后第二排，挑眉嘟唇，挤眼嘟唇（表情更紧凑），单眼眯笑露齿大笑，随第三排，单眼皱眉抿嘴，挤眼抿唇，瞪大双眼抿嘴；最后主体每一种表情都生动鲜活，将主体的“小情绪”细腻展现，属于真实写真风格，主体之间每横每竖都有白条分割。主体大头照立体，完整展示出来。',
  '720全景':
    '生成超宽幅全景环境设定图，完整展示空间结构、前中后景关系和可用机位。画面边缘衔接自然，透视统一，环境细节连续，不重复主体，不添加字幕或水印。',
  多机位九宫格:
    '生成一张 3×3 九宫格多机位参考图，使用九个明确不同的摄影机角度展示同一主体与同一场景。保持人物、服装、道具、时间和光线完全一致，每格机位和景别清晰可辨。',
  角色脸部三视图:
    '生成角色脸部正面、左侧面、右侧面三视图，三张等大并水平排列。保持五官、发型、肤色、年龄和表情基准一致，使用中性光与干净背景，不添加文字或水印。',
  角色设定图:
    '生成完整角色设定板，清楚展示角色外形、服装结构、关键配饰、材质和代表性细节。保持统一比例与设计语言，采用干净背景和专业概念设计排版，不添加无关文字或水印。',
  角色三视图:
    '生成角色全身正面、侧面、背面三视图，三张等大并水平排列。保持身体比例、脸部身份、发型、服装结构、配饰位置和色彩完全一致，使用标准站姿、正交感机位和干净背景。',
  场景设定图:
    '生成可供动画制作使用的场景设定图，清晰呈现空间布局、尺度、材质、光线、色彩和关键叙事区域。透视准确，前中后景层次明确，风格统一，不添加人物特写、字幕或水印。',
  产品设定图:
    '生成专业产品设定图，准确展示产品整体造型、结构比例、材质、颜色和关键功能细节。使用清晰的工业设计表达、统一透视与干净背景，避免结构漂移、品牌乱码和无关装饰。',
};

const QUALITY_LONG_EDGE: Record<string, number> = {
  standard: 1024,
  '2K': 2048,
  '4K': 4096,
};

export function isKnownImageType(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(IMAGE_TYPE_PROMPTS, value);
}

export function imageTypeBuiltInPrompt(value: string): string | undefined {
  return IMAGE_TYPE_PROMPTS[value];
}

export function isConfiguredImageType(value: unknown, promptOverride?: unknown): boolean {
  return (
    isKnownImageType(value) ||
    (typeof value === 'string' &&
      value.trim().length > 0 &&
      typeof promptOverride === 'string' &&
      promptOverride.trim().length > 0)
  );
}

export function toggleImageTypeSelection(current: unknown, option: string) {
  return current === option ? undefined : option;
}

export function buildImagePrompt(
  prompt: string,
  imageType?: string,
  promptOverride?: string,
): string {
  const userPrompt = prompt.trim();
  const presetPrompt =
    promptOverride?.trim() || (imageType ? IMAGE_TYPE_PROMPTS[imageType] : undefined);
  if (!presetPrompt) return userPrompt;
  return userPrompt ? `${presetPrompt}\n\n用户创作要求：${userPrompt}` : presetPrompt;
}

export function stripLegacyImageTypePrefix(prompt: string, imageType?: string): string {
  if (!imageType) return prompt;
  const prefix = `生成类型：${imageType}\n`;
  return prompt.startsWith(prefix) ? prompt.slice(prefix.length) : prompt;
}

export function resolveImageSize(aspectRatio?: string, quality?: string): string {
  const [widthPart, heightPart] = (aspectRatio ?? '').split(':');
  const ratioWidth = Number(widthPart);
  const ratioHeight = Number(heightPart);
  const longEdge = QUALITY_LONG_EDGE[quality ?? ''] ?? QUALITY_LONG_EDGE.standard;
  if (!longEdge || !ratioWidth || !ratioHeight || ratioWidth <= 0 || ratioHeight <= 0) {
    return '1024x1024';
  }

  const roundToModelStep = (value: number) => Math.max(256, Math.round(value / 64) * 64);
  if (ratioWidth >= ratioHeight) {
    return `${longEdge}x${roundToModelStep((longEdge * ratioHeight) / ratioWidth)}`;
  }
  return `${roundToModelStep((longEdge * ratioWidth) / ratioHeight)}x${longEdge}`;
}
