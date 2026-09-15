import type { CharacterReferenceImages } from '../lib/characterCanvasLayout';
import type { CharacterGender } from '../lib/characterMetadata';

export interface CharacterPreset {
  id: string;
  title: string;
  style: string;
  tags: string[];
  viewCount: 3 | 4 | 6;
  thumbnail?: string;
  characterReferences?: CharacterReferenceImages;
  gender?: CharacterGender;
  age?: number;
  nationality?: string;
}

function svgThumb(_title: string, hue: number): string {
  const c1 = `hsl(${hue} 45% 35%)`;
  const c2 = `hsl(${(hue + 40) % 360} 40% 25%)`;
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="160" height="200" fill="url(#g)"/><circle cx="80" cy="70" r="28" fill="rgba(255,255,255,0.12)"/><path d="M40 180 Q80 120 120 180" fill="rgba(255,255,255,0.1)"/></svg>`,
  )}`;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: 'char-1',
    title: '甜妹少女',
    style: '现代',
    tags: ['甜美', '少女', '三视图'],
    viewCount: 3,
    gender: 'female',
    age: 20,
    nationality: '中国',
    thumbnail: svgThumb('甜妹少女', 330),
  },
  {
    id: 'char-2',
    title: '酷妹少女',
    style: '现代',
    tags: ['酷飒', '少女', '三视图'],
    viewCount: 3,
    gender: 'female',
    age: 21,
    nationality: '中国',
    thumbnail: svgThumb('酷妹少女', 260),
  },
  {
    id: 'char-3',
    title: '古风少侠',
    style: '古风',
    tags: ['武侠', '古风', '男装'],
    viewCount: 3,
    gender: 'male',
    age: 22,
    nationality: '中国',
    thumbnail: svgThumb('古风少侠', 30),
  },
  {
    id: 'char-4',
    title: '国潮少女',
    style: '国潮',
    tags: ['国风', '少女', '旗袍'],
    viewCount: 4,
    gender: 'female',
    age: 24,
    nationality: '中国',
    thumbnail: svgThumb('国潮少女', 350),
  },
  {
    id: 'char-5',
    title: '现代职场',
    style: '现代',
    tags: ['职业装', 'OL', '正装'],
    viewCount: 4,
    gender: 'female',
    age: 29,
    nationality: '中国',
    thumbnail: svgThumb('现代职场', 210),
  },
  {
    id: 'char-6',
    title: '二次元萌妹',
    style: '动漫',
    tags: ['二次元', '萌系', '校服'],
    viewCount: 6,
    gender: 'female',
    age: 19,
    nationality: '日本',
    thumbnail: svgThumb('二次元萌妹', 280),
  },
  {
    id: 'char-7',
    title: '未来机甲',
    style: '科幻',
    tags: ['机甲', '赛博朋克', '战斗服'],
    viewCount: 3,
    gender: 'other',
    age: 28,
    nationality: '中国',
    thumbnail: svgThumb('未来机甲', 180),
  },
  {
    id: 'char-8',
    title: '欧式公主',
    style: '欧式',
    tags: ['公主', '礼服', '洛丽塔'],
    viewCount: 4,
    gender: 'female',
    age: 23,
    nationality: '法国',
    thumbnail: svgThumb('欧式公主', 320),
  },
];
