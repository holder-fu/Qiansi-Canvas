export interface StylePreset {
  id: string;
  title: string;
  author: string;
  uses: number;
  tags: string[];
  category: string;
  /** AI model category, independent from the visual style category. */
  model?: string;
  commercial: boolean;
  kind: 'image' | 'views' | 'video';
  thumbnail?: string;
  /** Built-in metadata-only template. It cannot be applied until the user saves real media/prompt data. */
  template?: boolean;
}

export const STYLE_CATEGORIES = [
  '推荐',
  'Midjourney',
  '摄影写真',
  '电商营销',
  '动漫游戏',
  '风格插画',
  '平面设计',
  '建筑及室内设计',
  '创意玩法',
  '文创周边',
  '小众推文',
];

export const STYLE_MODELS = [
  '全部',
  'Midjourney V7',
  'Seedream 5.0',
  'Lib Image v2',
  'Lib Image XL',
];

function svgThumb(_title: string, hue: number): string {
  const c1 = `hsl(${hue} 45% 35%)`;
  const c2 = `hsl(${(hue + 40) % 360} 40% 25%)`;
  const accent = `hsl(${(hue + 120) % 360} 60% 55%)`;
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="200" height="280" fill="url(#g)"/><circle cx="100" cy="110" r="40" fill="rgba(255,255,255,0.12)"/><path d="M50 240 Q100 170 150 240" fill="rgba(255,255,255,0.1)"/><circle cx="160" cy="40" r="8" fill="${accent}"/><rect x="30" y="238" width="140" height="24" rx="12" fill="rgba(0,0,0,0.45)"/><text x="100" y="254" text-anchor="middle" font-size="11" font-family="sans-serif" fill="rgba(255,255,255,0.8)">TEMPLATE</text></svg>`,
  )}`;
}

function makeStyle(
  index: number,
  title: string,
  _author: string,
  category: string,
  hue: number,
  _uses = 0,
): StylePreset {
  const model = STYLE_MODELS[1 + ((index - 1) % (STYLE_MODELS.length - 1))] ?? '未分类';
  return {
    id: `style-${index}`,
    title,
    author: '内置模板',
    uses: 0,
    tags: [category, '内置模板', model],
    category,
    model,
    commercial: false,
    kind: 'image',
    thumbnail: svgThumb(title, hue),
    template: true,
  };
}

export const STYLE_PRESETS: StylePreset[] = [
  makeStyle(1, '复古马卡龙', 'AI魔法师', '推荐', 30, 366),
  makeStyle(2, '新中式', 'AI魔法师', '推荐', 10, 386),
  makeStyle(3, '岁月港风', '海盐色打扰', '推荐', 220, 411),
  makeStyle(4, '新国韵', 'AI大法官', '推荐', 350, 537),
  makeStyle(5, '清风竹林', '海盐色打扰', '推荐', 140, 109),
  makeStyle(6, '小岛微风', '图灵AI', '推荐', 190, 935),
  makeStyle(7, '雷门胶片', 'Yike icing', '推荐', 25, 390),
  makeStyle(8, '雕塑幻境', '鱿鱼小新', '推荐', 200, 823),
  makeStyle(9, '赛博京剧梦', '大数学家', 'Midjourney', 280, 181),
  makeStyle(10, '双重梦境', '昏睡的白日梦', 'Midjourney', 260, 140),
  makeStyle(11, '古风侠影', '数字工作者', '风格插画', 160, 453),
  makeStyle(12, '莫奈花园', '可可大王', '风格插画', 320, 253),
  makeStyle(13, '富士之夏', '可可大王', '摄影写真', 40, 611),
  makeStyle(14, '云海', 'AI大法官', '摄影写真', 210, 264),
  makeStyle(15, '曼岛日落', '大参同学', '摄影写真', 30, 229),
  makeStyle(16, '虹光柔映', '江户川阿伟', '摄影写真', 330, 122),
  makeStyle(17, '极简电商', '电商小助手', '电商营销', 0, 210),
  makeStyle(18, '霓虹动漫', '二次元画师', '动漫游戏', 280, 560),
  makeStyle(19, '建筑光影', '空间设计师', '建筑及室内设计', 200, 340),
  makeStyle(20, '国潮文创', '文创工作室', '文创周边', 10, 280),
];
