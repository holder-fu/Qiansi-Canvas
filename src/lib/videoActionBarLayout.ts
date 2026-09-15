export type VideoActionBarLayout = {
  primaryIds: string[];
  overflowIds: string[];
};

export const VIDEO_ACTION_BAR_LAYOUT_STORAGE_KEY = 'qiansi-video-action-bar-layout-v1';

export function normalizeVideoActionBarLayout(
  value: unknown,
  knownIds: string[],
  defaults: VideoActionBarLayout,
): VideoActionBarLayout {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const known = new Set(knownIds);
  const used = new Set<string>();
  const filter = (candidate: unknown) =>
    (Array.isArray(candidate) ? candidate : []).filter((id): id is string => {
      if (typeof id !== 'string' || !known.has(id) || used.has(id)) return false;
      used.add(id);
      return true;
    });
  const primaryIds = filter(record.primaryIds);
  const overflowIds = filter(record.overflowIds);
  const defaultPrimary = new Set(defaults.primaryIds);

  for (const id of knownIds) {
    if (used.has(id)) continue;
    (defaultPrimary.has(id) ? primaryIds : overflowIds).push(id);
  }

  return { primaryIds, overflowIds };
}

export function loadVideoActionBarLayout(
  knownIds: string[],
  defaults: VideoActionBarLayout,
): VideoActionBarLayout {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(VIDEO_ACTION_BAR_LAYOUT_STORAGE_KEY);
    return normalizeVideoActionBarLayout(raw ? JSON.parse(raw) : defaults, knownIds, defaults);
  } catch {
    return defaults;
  }
}

export function saveVideoActionBarLayout(layout: VideoActionBarLayout) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIDEO_ACTION_BAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // The toolbar remains usable when storage is unavailable or full.
  }
}
