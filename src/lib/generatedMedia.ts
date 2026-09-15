export const GENERATED_MEDIA_GAP = 80;

/** Keep the provider's primary result first and remove duplicate batch URLs. */
export function collectGeneratedMediaUrls(
  primaryUrl: string | null | undefined,
  batchUrls: string[] | null | undefined,
): string[] {
  const urls = [primaryUrl, ...(batchUrls ?? [])].filter(
    (url): url is string => typeof url === 'string' && url.length > 0,
  );
  return [...new Set(urls)];
}

/** Place one-based sibling results in a horizontal row to the source's right. */
export function generatedMediaPosition(
  source: { x: number; y: number },
  sourceWidth: number,
  siblingIndex: number,
): { x: number; y: number } {
  return {
    x: source.x + siblingIndex * (sourceWidth + GENERATED_MEDIA_GAP),
    y: source.y,
  };
}

export function appendMediaOrdinal(name: string, ordinal: number): string {
  const extensionAt = name.lastIndexOf('.');
  if (extensionAt <= 0) return `${name} · ${ordinal}`;
  return `${name.slice(0, extensionAt)} · ${ordinal}${name.slice(extensionAt)}`;
}
