import { describe, expect, it } from 'vitest';
import { isComposerFooterControl, isComposerHeaderControl } from './controlLayout';
import { getComposerSpec } from '../graph/nodeSpecs';

describe('composer control layout', () => {
  it('keeps context in the header and the advanced entry in the footer', () => {
    expect(isComposerHeaderControl('context')).toBe(true);
    expect(isComposerFooterControl('context')).toBe(false);
    expect(isComposerFooterControl('advanced')).toBe(true);
  });

  it('renders the prompt through the editor rather than as a footer control', () => {
    expect(isComposerHeaderControl('prompt')).toBe(false);
    expect(isComposerFooterControl('prompt')).toBe(false);
  });

  it('removes the standalone advanced-parameters icon from the video composer', () => {
    expect(getComposerSpec('video').controls).toContain('videoSettings');
    expect(getComposerSpec('video').controls).not.toContain('advanced');
  });
});
