const VIDEO_EDIT_OPERATIONS = new Set(['remove-subtitles', 'visual-edit', 'masked-repair']);

const MASKED_REPAIR_GENERIC_PROTOCOL = 'openai';

export function normalizeVideoEditOperation(value) {
  const operation = String(value || '').trim();
  if (!operation) return '';
  if (!VIDEO_EDIT_OPERATIONS.has(operation)) throw new Error('未知的视频画面编辑操作。');
  return operation;
}

export function normalizeSubtitleRegion(value) {
  return value === 'bottom' || value === 'top' ? value : 'auto';
}

export function videoEditOperationLabel(operation) {
  if (operation === 'remove-subtitles') return '智能去字幕';
  if (operation === 'masked-repair') return '关键帧蒙版修复';
  return 'AI 画面编辑';
}

function requiredMediaUrl(value, label) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) throw new Error(`${label}不能为空。`);
  return url;
}

function finiteTime(value, label) {
  const time = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(time) || time < 0) throw new Error(`${label}必须是非负有限秒数。`);
  return time;
}

function normalizeMaskTracking(value) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error('蒙版跟踪开关必须是布尔值。');
  return value;
}

/**
 * Enforce the bridge's intentionally narrow masked-repair boundary.
 *
 * There is no standard video-mask edit protocol. Until a dedicated adapter is
 * implemented, only an OpenAI-compatible generic endpoint whose exact model
 * explicitly advertises `masked-repair` may receive this payload. A client
 * cannot opt ComfyUI or a dedicated CLI adapter into an unimplemented shape.
 */
export function assertMaskedRepairProviderSupport(provider) {
  const protocol = String(provider?.protocol || '').trim();
  if (protocol !== MASKED_REPAIR_GENERIC_PROTOCOL) {
    throw new Error(
      `当前 ${protocol || '未知'} 适配器尚未接入“关键帧蒙版修复”协议；不会退化为普通视频生成。`,
    );
  }
  if (
    !Array.isArray(provider?.videoOperations) ||
    !provider.videoOperations.includes('masked-repair')
  ) {
    throw new Error('当前所选模型未显式声明 masked-repair 能力，已停止关键帧蒙版修复请求。');
  }
}

export function buildVideoEditPayload({
  operation,
  sourceVideo,
  subtitleRegion,
  maskImage,
  rangeStart,
  rangeEnd,
  keyframeTime,
  tracking,
}) {
  if (!operation) return {};
  if (!VIDEO_EDIT_OPERATIONS.has(operation)) throw new Error('未知的视频画面编辑操作。');
  if (!sourceVideo) throw new Error(`${videoEditOperationLabel(operation)}需要提交原视频。`);
  if (operation === 'remove-subtitles') {
    return {
      mode: 'remove_subtitles',
      source_video: sourceVideo,
      subtitle_scope: 'burned_in_overlays',
      subtitle_region: normalizeSubtitleRegion(subtitleRegion),
      preserve_audio: true,
      preserve_duration: true,
      preserve_timing: true,
      preserve_scene_text: true,
      temporal_consistency: true,
    };
  }
  if (operation === 'masked-repair') {
    const normalizedSourceVideo = requiredMediaUrl(sourceVideo, '蒙版修复原视频 URL');
    const normalizedMaskImage = requiredMediaUrl(maskImage, '蒙版修复黑白蒙版 URL');
    const normalizedRangeStart = finiteTime(rangeStart, '蒙版修复起始时间');
    const normalizedRangeEnd = finiteTime(rangeEnd, '蒙版修复结束时间');
    const normalizedKeyframeTime = finiteTime(keyframeTime, '蒙版关键帧时间');
    if (normalizedRangeEnd <= normalizedRangeStart) {
      throw new Error('蒙版修复结束时间必须晚于起始时间。');
    }
    if (
      normalizedKeyframeTime < normalizedRangeStart ||
      normalizedKeyframeTime > normalizedRangeEnd
    ) {
      throw new Error('蒙版关键帧时间必须位于修复区间内。');
    }
    return {
      mode: 'video_masked_edit',
      source_video: normalizedSourceVideo,
      mask_image: normalizedMaskImage,
      mask_time_range: {
        start: normalizedRangeStart,
        end: normalizedRangeEnd,
      },
      mask_keyframe_time: normalizedKeyframeTime,
      mask_tracking: { enabled: normalizeMaskTracking(tracking) },
      preserve_unmasked_area: true,
      preserve_audio: true,
      preserve_duration: true,
      preserve_timing: true,
      temporal_consistency: true,
    };
  }
  return {
    mode: 'video_edit',
    source_video: sourceVideo,
    preserve_audio: true,
    preserve_duration: true,
    preserve_timing: true,
    temporal_consistency: true,
  };
}
