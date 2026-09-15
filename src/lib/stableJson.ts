function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortJsonValue((value as Record<string, unknown>)[key])]),
  );
}

/**
 * Compare values exactly as JSON transports them while ignoring object-key
 * insertion order. Array order and duplicate entries remain significant.
 */
export function stableJsonStringify(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 'undefined';
  return JSON.stringify(sortJsonValue(JSON.parse(serialized) as unknown));
}

export function stableJsonEqual(left: unknown, right: unknown): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}
