import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS } from './cameraPresets';

describe('camera presets', () => {
  it('provides unique, animated-preview-ready presets', () => {
    expect(CAMERA_PRESETS).toHaveLength(25);
    expect(new Set(CAMERA_PRESETS.map((preset) => preset.id)).size).toBe(CAMERA_PRESETS.length);
    expect(
      CAMERA_PRESETS.every((preset) => preset.thumbnail.startsWith('data:image/svg+xml,')),
    ).toBe(true);
    expect(CAMERA_PRESETS.every((preset) => preset.prompt.length > 12)).toBe(true);
  });

  it('includes dedicated expression and fight camera groups', () => {
    expect(
      CAMERA_PRESETS.filter((preset) => preset.category === '表情').map((preset) => preset.title),
    ).toEqual(['表情特写', '情绪推近', '眼神追焦', '反应急推']);
    expect(
      CAMERA_PRESETS.filter((preset) => preset.category === '打斗').map((preset) => preset.title),
    ).toEqual(['打斗跟拍', '冲击震动', '甩镜追击', '环绕对决', '闪避追焦', '低机位冲刺']);
  });
});
