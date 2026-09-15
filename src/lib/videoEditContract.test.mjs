import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMaskedRepairProviderSupport,
  buildVideoEditPayload,
  normalizeSubtitleRegion,
  normalizeVideoEditOperation,
} from './videoEditContract.mjs';

test('builds a subtitle-removal payload that preserves timing and scene text', () => {
  assert.deepEqual(
    buildVideoEditPayload({
      operation: 'remove-subtitles',
      sourceVideo: 'source.mp4',
      subtitleRegion: 'bottom',
    }),
    {
      mode: 'remove_subtitles',
      source_video: 'source.mp4',
      subtitle_scope: 'burned_in_overlays',
      subtitle_region: 'bottom',
      preserve_audio: true,
      preserve_duration: true,
      preserve_timing: true,
      preserve_scene_text: true,
      temporal_consistency: true,
    },
  );
});

test('builds an explicit general video-edit payload', () => {
  assert.deepEqual(buildVideoEditPayload({ operation: 'visual-edit', sourceVideo: 'source.mp4' }), {
    mode: 'video_edit',
    source_video: 'source.mp4',
    preserve_audio: true,
    preserve_duration: true,
    preserve_timing: true,
    temporal_consistency: true,
  });
});

test('builds a bounded masked-repair payload without changing unmasked pixels or timing', () => {
  assert.deepEqual(
    buildVideoEditPayload({
      operation: 'masked-repair',
      sourceVideo: '/output/source.mp4',
      maskImage: '/output/mask.png',
      rangeStart: 1.25,
      rangeEnd: 3.75,
      keyframeTime: 2.5,
      tracking: false,
    }),
    {
      mode: 'video_masked_edit',
      source_video: '/output/source.mp4',
      mask_image: '/output/mask.png',
      mask_time_range: { start: 1.25, end: 3.75 },
      mask_keyframe_time: 2.5,
      mask_tracking: { enabled: false },
      preserve_unmasked_area: true,
      preserve_audio: true,
      preserve_duration: true,
      preserve_timing: true,
      temporal_consistency: true,
    },
  );
});

test('validates every masked-repair boundary before building an upstream payload', () => {
  const valid = {
    operation: 'masked-repair',
    sourceVideo: 'source.mp4',
    maskImage: 'mask.png',
    rangeStart: 1,
    rangeEnd: 3,
    keyframeTime: 2,
    tracking: true,
  };
  assert.throws(() => buildVideoEditPayload({ ...valid, maskImage: '' }), /黑白蒙版 URL/);
  assert.throws(() => buildVideoEditPayload({ ...valid, rangeEnd: 1 }), /晚于起始时间/);
  assert.throws(() => buildVideoEditPayload({ ...valid, keyframeTime: 4 }), /位于修复区间内/);
  assert.throws(() => buildVideoEditPayload({ ...valid, tracking: 'yes' }), /必须是布尔值/);
});

test('allows masked repair only for an explicitly capable generic API model', () => {
  assert.doesNotThrow(() =>
    assertMaskedRepairProviderSupport({
      protocol: 'openai',
      videoOperations: ['masked-repair'],
    }),
  );
  assert.throws(
    () => assertMaskedRepairProviderSupport({ protocol: 'openai', videoOperations: [] }),
    /未显式声明 masked-repair/,
  );
  assert.throws(
    () =>
      assertMaskedRepairProviderSupport({
        protocol: 'comfyui',
        videoOperations: ['masked-repair'],
      }),
    /ComfyUI|comfyui|尚未接入/,
  );
  assert.throws(
    () =>
      assertMaskedRepairProviderSupport({
        protocol: 'jimeng',
        videoOperations: ['masked-repair'],
      }),
    /尚未接入/,
  );
});

test('rejects unknown operations and source-less edits', () => {
  assert.throws(() => normalizeVideoEditOperation('paint-everything'), /未知/);
  assert.throws(
    () => buildVideoEditPayload({ operation: 'remove-subtitles', sourceVideo: '' }),
    /需要提交原视频/,
  );
});

test('normalizes unsupported subtitle regions to automatic detection', () => {
  assert.equal(normalizeSubtitleRegion('center'), 'auto');
});
