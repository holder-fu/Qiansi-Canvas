import { describe, expect, it } from 'vitest';
import {
  mergeCameraPrompt,
  mergeCameraPrompts,
  resolveCameraPromptCues,
  stripCameraPrompt,
} from './cameraPrompt';

describe('mergeCameraPrompt', () => {
  it('keeps scene instructions and appends the selected camera motion', () => {
    expect(mergeCameraPrompt('雨夜街道，人物向前奔跑', '镜头前推', '稳定向主体前推')).toBe(
      '雨夜街道，人物向前奔跑\n运镜：镜头前推\n运镜提示词：稳定向主体前推',
    );
  });

  it('replaces the previous camera block without duplicating it', () => {
    expect(
      mergeCameraPrompt(
        '雨夜街道\n运镜：镜头前推\n运镜提示词：稳定向主体前推',
        '环绕拍摄',
        '围绕主体环绕',
      ),
    ).toBe('雨夜街道\n运镜：环绕拍摄\n运镜提示词：围绕主体环绕');
  });

  it('compiles multiple structured camera chips into the submitted model prompt', () => {
    expect(
      mergeCameraPrompts('人物沿长廊奔跑', [
        { id: 'tilt-up', title: '镜头上摇', prompt: '镜头从人物脚步平稳上摇到面部' },
        { id: 'orbit-down', title: '镜头盘旋下降', prompt: '围绕主体盘旋并逐渐降低机位' },
      ]),
    ).toBe(
      '人物沿长廊奔跑\n运镜：镜头上摇\n运镜提示词：镜头从人物脚步平稳上摇到面部\n运镜：镜头盘旋下降\n运镜提示词：围绕主体盘旋并逐渐降低机位',
    );
  });

  it('keeps the editor text clean and restores legacy camera metadata as one chip', () => {
    expect(stripCameraPrompt('人物转身\n运镜：镜头上摇\n运镜提示词：由下向上摇摄')).toBe(
      '人物转身',
    );
    expect(
      resolveCameraPromptCues(undefined, {
        id: 'tilt-up',
        title: '镜头上摇',
        prompt: '由下向上摇摄',
      }),
    ).toEqual([{ id: 'tilt-up', title: '镜头上摇', prompt: '由下向上摇摄' }]);
  });
});
