import { describe, expect, it } from 'vitest';
import { buildImagePromptWithTextContext, hasImageTextContext } from './imageTextContext';

describe('image composer reference text', () => {
  it('submits read-only reference text together with an optional image instruction', () => {
    expect(
      buildImagePromptWithTextContext(
        ['【模块化风格】墨锋赤影', '画面渲染：graphic ink-brush Chinese 3D animation'],
        '保留人物姿势，改成雪夜场景',
      ),
    ).toBe(
      '【模块化风格】墨锋赤影\n\n画面渲染：graphic ink-brush Chinese 3D animation\n\n保留人物姿势，改成雪夜场景',
    );
  });

  it('allows reference text to be the complete image prompt when no extra instruction is entered', () => {
    expect(buildImagePromptWithTextContext(['  第一段参考文本  ', ' ', '第二段参考文本'], '')).toBe(
      '第一段参考文本\n\n第二段参考文本',
    );
    expect(hasImageTextContext(['  第一段参考文本  ', ' '])).toBe(true);
  });

  it('does not reintroduce excluded reference text', () => {
    expect(buildImagePromptWithTextContext([], '仅使用这条额外指令')).toBe('仅使用这条额外指令');
    expect(hasImageTextContext([' ', '\n'])).toBe(false);
  });
});
