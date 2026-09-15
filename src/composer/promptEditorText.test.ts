import { describe, expect, it } from 'vitest';
import {
  normalizeLegacyReferenceMentionSpacing,
  promptTextFromEditorDom,
} from './promptEditorText';

type FakeNode = {
  nodeType: number;
  textContent: string | null;
  childNodes: FakeNode[];
  tagName?: string;
  dataset?: { referenceToken?: string };
};

const text = (value: string): FakeNode => ({ nodeType: 3, textContent: value, childNodes: [] });
const element = (
  tagName: string,
  childNodes: FakeNode[] = [],
  dataset?: FakeNode['dataset'],
): FakeNode => ({ nodeType: 1, textContent: null, childNodes, tagName, dataset });

describe('prompt editor text serialization', () => {
  it('keeps inline reference chips on the same line as surrounding text', () => {
    const editor = element('DIV', [
      text('用 '),
      element('SPAN', [text('ignored visual label')], { referenceToken: '@图片1' }),
      text(' 的人物生成一张和 '),
      element('SPAN', [text('ignored visual label')], { referenceToken: '@图片2' }),
      text(' 一样高清的人物图，配合 '),
      element('SPAN', [text('ignored visual label')], { referenceToken: '@音频3' }),
    ]);

    expect(promptTextFromEditorDom(editor)).toBe(
      '用 @图片1 的人物生成一张和 @图片2 一样高清的人物图，配合 @音频3',
    );
  });

  it('preserves user-authored line breaks and block lines', () => {
    const editor = element('DIV', [
      element('DIV', [text('第一行'), element('BR'), element('BR'), text('第二行')]),
      element('DIV', [text('第三行')]),
    ]);

    expect(promptTextFromEditorDom(editor)).toBe('第一行\n\n第二行\n第三行');
  });

  it('repairs legacy single or repeated line breaks around reference tokens', () => {
    expect(
      normalizeLegacyReferenceMentionSpacing(
        '用\n@图片1\n 里面的人物生成一张和\n\n@图片2\n\n一样高清的人物图',
      ),
    ).toBe('用 @图片1 里面的人物生成一张和 @图片2 一样高清的人物图');
    expect(normalizeLegacyReferenceMentionSpacing('第一段\n\n第二段')).toBe('第一段\n\n第二段');
    expect(normalizeLegacyReferenceMentionSpacing('让\n@音频1\n驱动画面')).toBe(
      '让 @音频1 驱动画面',
    );
    expect(
      normalizeLegacyReferenceMentionSpacing(
        '用\n@图片1\n 里面的人物生成一张和\n@图片2\n 一样高清的人物图，还要保持衣服和发型\n@图片2\n ！',
      ),
    ).toBe('用 @图片1 里面的人物生成一张和 @图片2 一样高清的人物图，还要保持衣服和发型 @图片2 ！');
  });
});
