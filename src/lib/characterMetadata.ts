export const CHARACTER_GENDERS = ['male', 'female', 'other'] as const;
export type CharacterGender = (typeof CHARACTER_GENDERS)[number];

export const CHARACTER_AGE_FILTERS = [
  'all',
  'child',
  'teen',
  'young-adult',
  'adult',
  'senior',
  'unspecified',
] as const;
export type CharacterAgeFilter = (typeof CHARACTER_AGE_FILTERS)[number];

export const CHARACTER_NATIONALITIES = [
  '中国',
  '日本',
  '韩国',
  '蒙古',
  '印度',
  '泰国',
  '越南',
  '新加坡',
  '马来西亚',
  '印度尼西亚',
  '菲律宾',
  '尼泊尔',
  '巴基斯坦',
  '哈萨克斯坦',
  '乌兹别克斯坦',
  '吉尔吉斯斯坦',
  '塔吉克斯坦',
  '土库曼斯坦',
  '阿富汗',
  '伊朗',
  '伊拉克',
  '土耳其',
  '沙特阿拉伯',
  '阿联酋',
  '以色列',
  '俄罗斯',
  '乌克兰',
  '英国',
  '法国',
  '德国',
  '意大利',
  '西班牙',
  '葡萄牙',
  '荷兰',
  '比利时',
  '瑞士',
  '奥地利',
  '瑞典',
  '挪威',
  '芬兰',
  '丹麦',
  '波兰',
  '捷克',
  '希腊',
  '美国',
  '加拿大',
  '墨西哥',
  '古巴',
  '哥伦比亚',
  '巴西',
  '阿根廷',
  '智利',
  '秘鲁',
  '澳大利亚',
  '新西兰',
  '埃及',
  '摩洛哥',
  '尼日利亚',
  '肯尼亚',
  '南非',
] as const;

export interface CharacterDemographics {
  gender?: CharacterGender;
  age?: number;
  nationality?: string;
}

export interface CharacterDemographicFilters {
  gender: CharacterGender | 'all' | 'unspecified';
  age: CharacterAgeFilter;
  nationality: string;
}

export function normalizeCharacterGender(value: unknown): CharacterGender | undefined {
  return CHARACTER_GENDERS.includes(value as CharacterGender)
    ? (value as CharacterGender)
    : undefined;
}

export function normalizeCharacterAge(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const age = Number(value);
  if (!Number.isFinite(age)) return undefined;
  const rounded = Math.round(age);
  return rounded >= 0 && rounded <= 150 ? rounded : undefined;
}

export function normalizeCharacterNationality(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, 60);
  return normalized || undefined;
}

export function matchesCharacterAge(age: number | undefined, filter: CharacterAgeFilter) {
  if (filter === 'all') return true;
  if (filter === 'unspecified') return age === undefined;
  if (age === undefined) return false;
  if (filter === 'child') return age <= 12;
  if (filter === 'teen') return age >= 13 && age <= 17;
  if (filter === 'young-adult') return age >= 18 && age <= 35;
  if (filter === 'adult') return age >= 36 && age <= 59;
  return age >= 60;
}

export function matchesCharacterDemographics(
  item: CharacterDemographics,
  filters: CharacterDemographicFilters,
) {
  const genderMatches =
    filters.gender === 'all' ||
    (filters.gender === 'unspecified' ? item.gender === undefined : item.gender === filters.gender);
  const nationalityMatches =
    filters.nationality === 'all' ||
    (filters.nationality === 'unspecified'
      ? !item.nationality
      : item.nationality === filters.nationality);
  return genderMatches && nationalityMatches && matchesCharacterAge(item.age, filters.age);
}
