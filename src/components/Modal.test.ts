import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal';

describe('Modal maximize control', () => {
  it('places the maximize action before close and expands to the full viewport height', () => {
    const html = renderToStaticMarkup(
      createElement(
        Modal,
        {
          open: true,
          onClose: () => {},
          onToggleMaximize: () => {},
          maximized: true,
          title: '提示词库',
        },
        createElement('div', null, '内容'),
      ),
    );

    expect(html).toContain('h-[100dvh]');
    expect(html).toContain('aria-label="还原弹窗高度"');
    expect(html.indexOf('aria-label="还原弹窗高度"')).toBeLessThan(
      html.indexOf('aria-label="关闭弹窗"'),
    );
  });

  it('keeps the normal constrained modal layout before expansion', () => {
    const html = renderToStaticMarkup(
      createElement(
        Modal,
        {
          open: true,
          onClose: () => {},
          onToggleMaximize: () => {},
          title: '提示词库',
        },
        createElement('div', null, '内容'),
      ),
    );

    expect(html).toContain('max-h-[85vh]');
    expect(html).toContain('aria-label="放大弹窗至全高"');
  });
});
