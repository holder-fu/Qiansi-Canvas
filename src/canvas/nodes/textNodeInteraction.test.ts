import { describe, expect, it } from 'vitest';
import { shouldEnterTextNodeEdit } from './textNodeInteraction';

describe('text node edit activation', () => {
  it('enters editing on the second left-button press', () => {
    expect(shouldEnterTextNodeEdit({ button: 0, detail: 2 })).toBe(true);
  });

  it('leaves a single left-button press available for node dragging', () => {
    expect(shouldEnterTextNodeEdit({ button: 0, detail: 1 })).toBe(false);
  });

  it('does not enter editing from a right-button double press', () => {
    expect(shouldEnterTextNodeEdit({ button: 2, detail: 2 })).toBe(false);
  });
});
