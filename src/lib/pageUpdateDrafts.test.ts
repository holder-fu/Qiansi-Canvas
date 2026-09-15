import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blockPageUpdate,
  pageUpdateBlocked,
  commitPageUpdateDrafts,
  registerPageUpdateDraft,
  saveBeforePageUpdate,
} from './pageUpdateDrafts';

afterEach(() => vi.useRealTimers());
describe('safe page update', () => {
  it('commits all editor drafts synchronously before capturing and saving', async () => {
    let draft = 'uncommitted';
    const unregister = registerPageUpdateDraft(() => {
      draft = 'committed';
    });
    const save = vi.fn(async () => {
      expect(draft).toBe('committed');
      return true;
    });
    expect(
      await saveBeforePageUpdate({
        canUpdate: () => true,
        commit: commitPageUpdateDrafts,
        capture: () => [draft],
        save,
      }),
    ).toBe(true);
    unregister();
    draft = 'unchanged';
    commitPageUpdateDrafts();
    expect(draft).toBe('unchanged');
  });
  it('does not save or reload with an unfinished dialog', async () => {
    const unblock = blockPageUpdate();
    const save = vi.fn(async () => true);
    expect(
      await saveBeforePageUpdate({
        canUpdate: () => !pageUpdateBlocked(),
        commit: () => {},
        capture: () => [],
        save,
      }),
    ).toBe(false);
    expect(save).not.toHaveBeenCalled();
    unblock();
    expect(pageUpdateBlocked()).toBe(false);
  });
  it('refuses refresh after save failure or newer edits during saving', async () => {
    let revision = 1;
    const options = { canUpdate: () => true, commit: () => {}, capture: () => [revision] };
    expect(await saveBeforePageUpdate({ ...options, save: async () => false })).toBe(false);
    expect(
      await saveBeforePageUpdate({
        ...options,
        save: async () => {
          revision++;
          return true;
        },
      }),
    ).toBe(false);
    expect(
      await saveBeforePageUpdate({
        ...options,
        commit: () => {
          throw new Error('draft');
        },
        save: async () => true,
      }),
    ).toBe(false);
  });
  it('bounds a hung save without turning its late completion into a reload', async () => {
    vi.useFakeTimers();
    const result = saveBeforePageUpdate({
      canUpdate: () => true,
      commit: () => {},
      capture: () => [],
      save: () => new Promise(() => {}),
      timeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toBe(false);
  });
});
