import { describe, expect, it } from 'vitest';
import {
  VIDEO_GENERATION_DURATION_OPTIONS,
  VIDEO_GENERATION_MAX_DURATION_SECONDS,
} from './videoGenerationMode';

describe('video generation duration contract', () => {
  it('exposes 30 seconds as the shared video-generation maximum', () => {
    expect(VIDEO_GENERATION_MAX_DURATION_SECONDS).toBe(30);
    expect(VIDEO_GENERATION_DURATION_OPTIONS).toContain(30);
    expect(Math.max(...VIDEO_GENERATION_DURATION_OPTIONS)).toBe(
      VIDEO_GENERATION_MAX_DURATION_SECONDS,
    );
  });
});
