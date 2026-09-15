import { describe, expect, it } from 'vitest';
import {
  applyFaceControlSettingsPatch,
  buildFaceControlInstruction,
  buildImageEnhancementPrompt,
  getFaceExpressionLabel,
  getFaceControlSectionConstraint,
  getFaceGazeLabel,
  IMAGE_ENHANCEMENT_SPECS,
  normalizeFaceControlPointerPosition,
} from './imageEnhancement';

describe('image enhancement presets', () => {
  it('uses an ultra-wide ratio and the panorama generation type', () => {
    expect(IMAGE_ENHANCEMENT_SPECS.panorama).toMatchObject({
      aspectRatio: '21:9',
      imageType: '720全景',
    });
  });

  it('appends custom requirements without dropping the safety constraints', () => {
    const prompt = buildImageEnhancementPrompt('portrait-cutout', '保留手中的玻璃杯');

    expect(prompt).toContain('不得改变人物身份');
    expect(prompt).toContain('补充要求：保留手中的玻璃杯');
  });

  it('defines smart cutout as subject detection with a real transparent output', () => {
    expect(IMAGE_ENHANCEMENT_SPECS.cutout.label).toBe('智能扣图');
    expect(IMAGE_ENHANCEMENT_SPECS.cutout.prompt).toContain('视觉上最主要的主体');
    expect(IMAGE_ENHANCEMENT_SPECS.cutout.prompt).toContain('真实透明通道');
  });

  it('keeps person adjustments and cleanup operations identity-safe', () => {
    expect(IMAGE_ENHANCEMENT_SPECS['face-control'].prompt).toContain('保持人物身份');
    expect(IMAGE_ENHANCEMENT_SPECS['pose-adjust'].prompt).toContain('保持人物身份');
    expect(IMAGE_ENHANCEMENT_SPECS['remove-text'].prompt).toContain('自然补全');
  });

  it('turns face-control coordinates into an identity-safe expression instruction', () => {
    const settings = {
      emotionX: 0.7,
      emotionY: 0.65,
      gazeX: -0.4,
      gazeY: 0.25,
      mouth: 'smile' as const,
    };

    expect(getFaceExpressionLabel(settings)).toBe('兴奋');
    expect(getFaceGazeLabel(settings)).toBe('左上');
    expect(buildFaceControlInstruction(settings)).toContain('向画面左侧看');
    expect(buildFaceControlInstruction(settings)).toContain('严格保持人物身份');
  });

  it('supports the full mouth-shape catalog in generated instructions', () => {
    const instruction = buildFaceControlInstruction({
      emotionX: 0,
      emotionY: 0,
      gazeX: 0,
      gazeY: 0,
      mouth: 'bite',
    });

    expect(instruction).toContain('轻咬下唇');
    expect(instruction).toContain('保持正视');
  });

  it('keeps emotion and mouth adjustments mutually exclusive without clearing gaze', () => {
    const base = {
      emotionX: 0.7,
      emotionY: 0.4,
      gazeX: -0.4,
      gazeY: 0.25,
      mouth: 'neutral' as const,
    };

    const withMouth = applyFaceControlSettingsPatch(base, { mouth: 'smile' });
    expect(withMouth).toMatchObject({
      emotionX: 0,
      emotionY: 0,
      gazeX: -0.4,
      gazeY: 0.25,
      mouth: 'smile',
    });

    const withEmotion = applyFaceControlSettingsPatch(withMouth, {
      emotionX: -0.6,
      emotionY: -0.25,
    });
    expect(withEmotion).toMatchObject({
      emotionX: -0.6,
      emotionY: -0.25,
      gazeX: -0.4,
      gazeY: 0.25,
      mouth: 'neutral',
    });
  });

  it('maps the face-control point directly onto the pointer position without acceleration drift', () => {
    expect(normalizeFaceControlPointerPosition(0, 200)).toBe(-1);
    expect(normalizeFaceControlPointerPosition(100, 200)).toBe(0);
    expect(normalizeFaceControlPointerPosition(150, 200)).toBe(0.5);
    expect(normalizeFaceControlPointerPosition(200, 200)).toBe(1);
  });

  it('blocks switching between active emotion and mouth controls while keeping gaze available', () => {
    const emotionSettings = {
      emotionX: 0.7,
      emotionY: 0.4,
      gazeX: 0,
      gazeY: 0,
      mouth: 'neutral' as const,
    };
    expect(getFaceControlSectionConstraint(emotionSettings, 'mouth')).toContain(
      '无法再选择嘴巴形态',
    );
    expect(getFaceControlSectionConstraint(emotionSettings, 'gaze')).toBeNull();

    const mouthSettings = { ...emotionSettings, emotionX: 0, emotionY: 0, mouth: 'smile' as const };
    expect(getFaceControlSectionConstraint(mouthSettings, 'emotion')).toContain(
      '无法再选择情绪控制',
    );
    expect(getFaceControlSectionConstraint(mouthSettings, 'gaze')).toBeNull();
  });
});
