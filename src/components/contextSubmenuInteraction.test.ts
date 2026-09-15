import { describe, expect, it } from 'vitest';
import {
  CONTEXT_SUBMENU_POINTER_GRACE_MS,
  shouldDismissContextSubmenu,
} from './contextSubmenuInteraction';

function regionContaining(...targets: object[]): Pick<Node, 'contains'> {
  return {
    contains: (target) => targets.includes(target as object),
  };
}

describe('canvas context submenu interaction', () => {
  const triggerTarget = {} as Node;
  const bridgeTarget = {} as Node;
  const submenuTarget = {} as Node;
  const unrelatedTarget = {} as Node;
  const activeTrigger = regionContaining(triggerTarget);
  const submenu = regionContaining(bridgeTarget, submenuTarget);

  it('stays open over the active trigger, pointer bridge, and submenu', () => {
    expect(shouldDismissContextSubmenu(triggerTarget, activeTrigger, submenu)).toBe(false);
    expect(shouldDismissContextSubmenu(bridgeTarget, activeTrigger, submenu)).toBe(false);
    expect(shouldDismissContextSubmenu(submenuTarget, activeTrigger, submenu)).toBe(false);
  });

  it('dismisses over another primary-menu area or after leaving the menu', () => {
    expect(shouldDismissContextSubmenu(unrelatedTarget, activeTrigger, submenu)).toBe(true);
    expect(shouldDismissContextSubmenu(null, activeTrigger, submenu)).toBe(true);
  });

  it('uses a short pointer-intent grace period without making the menu feel sticky', () => {
    expect(CONTEXT_SUBMENU_POINTER_GRACE_MS).toBeGreaterThanOrEqual(160);
    expect(CONTEXT_SUBMENU_POINTER_GRACE_MS).toBeLessThanOrEqual(250);
  });
});
