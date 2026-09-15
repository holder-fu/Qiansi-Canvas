import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NumberMarkerIcon } from './NumberMarkerIcon';

describe('NumberMarkerIcon', () => {
  it('renders a visible number one inside a circle', () => {
    const html = renderToStaticMarkup(
      createElement(NumberMarkerIcon, { className: 'marker-icon', size: 16 }),
    );

    expect(html).toContain('class="marker-icon"');
    expect(html).toContain('<circle cx="12" cy="12" r="9"></circle>');
    expect(html).toContain('d="M9.75 9.25 12 7.5v9M9.75 16.5h4.5"');
  });
});
