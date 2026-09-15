export type ModelPickerOption = {
  providerId: string;
  providerName: string;
  providerRegion?: '海外' | '国内' | '通用';
  model: string;
};

export type ModelPickerCategory<T extends ModelPickerOption> = {
  providerId: string;
  providerName: string;
  providerRegion?: ModelPickerOption['providerRegion'];
  models: T[];
};

const REGION_ORDER: Record<NonNullable<ModelPickerOption['providerRegion']>, number> = {
  国内: 0,
  通用: 1,
  海外: 2,
};

/** Groups picker options without changing runtime fallback order, then sorts only provider presentation. */
export function groupModelPickerOptions<T extends ModelPickerOption>(
  options: T[],
): ModelPickerCategory<T>[] {
  const categories = new Map<string, ModelPickerCategory<T>>();
  for (const option of options) {
    const current = categories.get(option.providerId);
    if (current) {
      current.models.push(option);
      continue;
    }
    categories.set(option.providerId, {
      providerId: option.providerId,
      providerName: option.providerName,
      providerRegion: option.providerRegion,
      models: [option],
    });
  }
  return [...categories.values()]
    .map((category, index) => ({ category, index }))
    .sort(
      (left, right) =>
        REGION_ORDER[left.category.providerRegion ?? '通用'] -
          REGION_ORDER[right.category.providerRegion ?? '通用'] || left.index - right.index,
    )
    .map(({ category }) => category);
}
