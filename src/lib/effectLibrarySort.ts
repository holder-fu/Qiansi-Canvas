export type EffectLibrarySort = 'recommended' | 'recent' | 'uses' | 'name';

type SortableEffectLibraryItem = {
  id: string;
  title: string;
  uses: number;
  createdAt?: number;
};

function finiteNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Sort a filtered Effects Library projection without mutating its source order. */
export function sortEffectLibraryItems<T extends SortableEffectLibraryItem>(
  items: readonly T[],
  sort: EffectLibrarySort,
  useCounts: Readonly<Record<string, number>>,
  language: string,
): T[] {
  if (sort === 'recommended') return [...items];
  const locale = language === 'zh-CN' ? 'zh-Hans-CN' : 'en-US';

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      let difference = 0;
      if (sort === 'recent') {
        difference = finiteNumber(right.item.createdAt) - finiteNumber(left.item.createdAt);
      } else if (sort === 'uses') {
        const leftUses = finiteNumber(useCounts[left.item.id] ?? left.item.uses);
        const rightUses = finiteNumber(useCounts[right.item.id] ?? right.item.uses);
        difference = rightUses - leftUses;
      } else {
        difference = left.item.title.localeCompare(right.item.title, locale, {
          numeric: true,
          sensitivity: 'base',
        });
      }
      return difference || left.index - right.index;
    })
    .map(({ item }) => item);
}
