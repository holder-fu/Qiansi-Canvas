type PoolEntry = {
  refs: number;
  url?: string;
  promise: Promise<string | undefined>;
};

const entries = new Map<string, PoolEntry>();

export function acquireMediaObjectUrl(key: string, load: () => Promise<Blob | null>) {
  let entry = entries.get(key);
  if (!entry) {
    const next: PoolEntry = {
      refs: 0,
      promise: Promise.resolve(undefined),
    };
    next.promise = load()
      .then((blob) => {
        if (!blob) return undefined;
        const url = URL.createObjectURL(blob);
        next.url = url;
        if (next.refs === 0) {
          URL.revokeObjectURL(url);
          entries.delete(key);
          return undefined;
        }
        return url;
      })
      .catch(() => {
        entries.delete(key);
        return undefined;
      });
    entry = next;
    entries.set(key, entry);
  }
  entry.refs += 1;
  return entry.promise;
}

export function releaseMediaObjectUrl(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0 || !entry.url) return;
  URL.revokeObjectURL(entry.url);
  entries.delete(key);
}

export function mediaObjectUrlPoolSize() {
  return entries.size;
}
