import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireMediaObjectUrl,
  mediaObjectUrlPoolSize,
  releaseMediaObjectUrl,
} from './mediaObjectUrlPool';

describe('media object URL pool', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shares one URL and revokes it after the final owner releases it', async () => {
    const createObjectURL = vi.fn(() => 'blob:shared-video');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const load = vi.fn(async () => new Blob(['video'], { type: 'video/webm' }));

    const first = acquireMediaObjectUrl('asset:test-shared', load);
    const second = acquireMediaObjectUrl('asset:test-shared', load);
    await expect(first).resolves.toBe('blob:shared-video');
    await expect(second).resolves.toBe('blob:shared-video');
    expect(load).toHaveBeenCalledOnce();
    expect(mediaObjectUrlPoolSize()).toBe(1);

    releaseMediaObjectUrl('asset:test-shared');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    releaseMediaObjectUrl('asset:test-shared');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shared-video');
    expect(mediaObjectUrlPoolSize()).toBe(0);
  });
});
