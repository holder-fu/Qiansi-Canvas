const draftWriters = new Set<() => void>();
const blockers = new Set<object>();

export function blockPageUpdate() {
  const token = {};
  blockers.add(token);
  return () => {
    blockers.delete(token);
  };
}

export function pageUpdateBlocked() {
  return blockers.size > 0;
}

export function registerPageUpdateDraft(writer: () => void) {
  draftWriters.add(writer);
  return () => {
    draftWriters.delete(writer);
  };
}

/** Synchronous writers commit local React drafts before the persistence barrier. */
export function commitPageUpdateDrafts() {
  for (const writer of [...draftWriters]) writer();
}

export async function saveBeforePageUpdate(options: {
  canUpdate: () => boolean;
  commit: () => void;
  capture: () => readonly unknown[];
  save: () => Promise<boolean>;
  timeoutMs?: number;
}): Promise<boolean> {
  if (!options.canUpdate()) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    options.commit();
    const captured = options.capture();
    const saved = await Promise.race([
      options.save(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), options.timeoutMs ?? 6000);
      }),
    ]);
    const current = options.capture();
    return (
      saved &&
      options.canUpdate() &&
      captured.length === current.length &&
      captured.every((value, index) => Object.is(value, current[index]))
    );
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
