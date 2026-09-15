import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DirectorGuideModal } from './DirectorGuideModal';

describe('DirectorGuideModal', () => {
  it('renders the detailed workflow, visual examples and live prompt preview', () => {
    const html = renderToStaticMarkup(
      createElement(DirectorGuideModal, {
        constraintPrompt: '测试导演指令：人物朝向黑板。',
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain('导演台使用说明');
    expect(html).toContain('第一次使用，按这五步完成');
    expect(html).toContain('教室案例填写表');
    expect(html).toContain('人物朝向角度');
    expect(html).toContain('自动保存与“应用到画布”不是一回事');
    expect(html).toContain('测试导演指令：人物朝向黑板。');
  });
});
