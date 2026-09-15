import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EffectWebpPreview } from './EffectVideoPreview';
import source from './EffectVideoPreview.tsx?raw';

describe('EffectWebpPreview', () => {
  it('renders the legacy fallback image when the animated source is unavailable', () => {
    const html = renderToStaticMarkup(
      createElement(EffectWebpPreview, {
        fallback: '/effect-poster.webp',
        title: '地球缩放',
        className: 'rounded-xl',
      }),
    );

    expect(html).toContain('alt="地球缩放"');
    expect(html).toContain('src="/effect-poster.webp"');
    expect(html).toContain('rounded-xl');
    expect(html).not.toContain('<video');
  });

  it('renders an animated WebP through the native image element', () => {
    const html = renderToStaticMarkup(
      createElement(EffectWebpPreview, {
        src: '/effect.webp',
        fallback: '/effect-poster.webp',
        title: '地球缩放',
      }),
    );

    expect(html).toContain('<img');
    expect(html).toContain('src="/effect.webp"');
    expect(html).toContain('alt="地球缩放"');
    expect(html).not.toContain('<video');
  });

  it('uses no video playback lifecycle or object URL ownership', () => {
    expect(source).toContain('Animated WebP playback is native to <img>');
    expect(source).not.toContain('<video');
    expect(source).not.toContain('.play()');
    expect(source).not.toContain('currentTime');
    expect(source).not.toContain('URL.createObjectURL');
    expect(source).not.toContain('URL.revokeObjectURL');
  });
});
