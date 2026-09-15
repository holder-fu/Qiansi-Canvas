export type ImageActionBarLayout = {
  primaryIds: string[];
  overflowIds: string[];
  quickPrimaryIds: string[];
  quickOverflowIds: string[];
};

type LayoutDefaults = ImageActionBarLayout;

export const IMAGE_ACTION_BAR_LAYOUT_STORAGE_KEY = 'qiansi-image-action-bar-layout-v2';

function normalizePartition(
  primaryValue: unknown,
  overflowValue: unknown,
  knownIds: string[],
  defaultPrimaryIds: string[],
) {
  const known = new Set(knownIds);
  const used = new Set<string>();
  const filter = (value: unknown) =>
    (Array.isArray(value) ? value : []).filter((id): id is string => {
      if (typeof id !== 'string' || !known.has(id) || used.has(id)) return false;
      used.add(id);
      return true;
    });
  const primaryIds = filter(primaryValue);
  const overflowIds = filter(overflowValue);
  const defaultPrimary = new Set(defaultPrimaryIds);

  for (const id of knownIds) {
    if (used.has(id)) continue;
    (defaultPrimary.has(id) ? primaryIds : overflowIds).push(id);
  }

  return { primaryIds, overflowIds };
}

export function normalizeImageActionBarLayout(
  value: unknown,
  actionIds: string[],
  quickMenuIds: string[],
  defaults: LayoutDefaults,
): ImageActionBarLayout {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const actions = normalizePartition(
    record.primaryIds,
    record.overflowIds,
    actionIds,
    defaults.primaryIds,
  );
  const quickMenus = normalizePartition(
    record.quickPrimaryIds,
    record.quickOverflowIds,
    quickMenuIds,
    defaults.quickPrimaryIds,
  );
  return {
    primaryIds: actions.primaryIds,
    overflowIds: actions.overflowIds,
    quickPrimaryIds: quickMenus.primaryIds,
    quickOverflowIds: quickMenus.overflowIds,
  };
}

export function loadImageActionBarLayout(
  actionIds: string[],
  quickMenuIds: string[],
  defaults: LayoutDefaults,
): ImageActionBarLayout {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(IMAGE_ACTION_BAR_LAYOUT_STORAGE_KEY);
    return normalizeImageActionBarLayout(
      raw ? JSON.parse(raw) : defaults,
      actionIds,
      quickMenuIds,
      defaults,
    );
  } catch {
    return defaults;
  }
}

export function saveImageActionBarLayout(layout: ImageActionBarLayout) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IMAGE_ACTION_BAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // The toolbar remains usable when storage is unavailable or full.
  }
}
