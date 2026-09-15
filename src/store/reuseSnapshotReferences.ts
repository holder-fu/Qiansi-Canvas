/** Structural sharing at the JSON snapshot boundary, never in the drag/input hot path.
 * Missing and undefined object properties are equivalent after a JSON roundtrip.
 */
export function reuseSnapshotReferences<T>(current: T, incoming: T): T {
  if (Object.is(current, incoming)) return current;
  if (!current || !incoming || typeof current !== 'object' || typeof incoming !== 'object') {
    return incoming;
  }
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const items = incoming.map((value, index) => reuseSnapshotReferences(current[index], value));
    return (
      current.length === items.length && items.every((value, index) => value === current[index])
        ? current
        : items
    ) as T;
  }
  if (
    Object.getPrototypeOf(current) !== Object.prototype ||
    Object.getPrototypeOf(incoming) !== Object.prototype
  )
    return incoming;
  const before = current as Record<string, unknown>;
  const after = incoming as Record<string, unknown>;
  const entries = Object.entries(after).map(
    ([key, value]) => [key, reuseSnapshotReferences(before[key], value)] as const,
  );
  if (
    entries.every(([key, value]) => Object.is(before[key], value)) &&
    Object.keys(before).every((key) => Object.hasOwn(after, key) || before[key] === undefined)
  )
    return current;
  return Object.fromEntries(entries) as T;
}
