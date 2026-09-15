import { describe, expect, it, vi } from 'vitest';
import {
  acquireVideoDecoder,
  activeVideoDecoderCount,
  releaseVideoDecoder,
} from './videoDecoderBudget';

describe('video decoder budget', () => {
  it('keeps at most two active decoders and evicts the oldest lease', () => {
    const firstEvicted = vi.fn();
    acquireVideoDecoder('budget-first', firstEvicted);
    acquireVideoDecoder('budget-second', vi.fn());
    acquireVideoDecoder('budget-third', vi.fn());
    expect(firstEvicted).toHaveBeenCalledOnce();
    expect(activeVideoDecoderCount()).toBe(2);
    releaseVideoDecoder('budget-second');
    releaseVideoDecoder('budget-third');
  });
});
