import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProviderBrandIcon } from './ProviderBrandIcon';
import source from './ProviderBrandIcon.tsx?raw';

describe('ProviderBrandIcon', () => {
  it('uses the official OpenAI mark for GPT CLI', () => {
    const html = renderToStaticMarkup(
      createElement(ProviderBrandIcon, {
        providerId: 'codex',
        providerName: 'GPT CLI',
        className: 'h-4 w-4',
      }),
    );

    expect(html).toContain('mask-image');
    expect(html).not.toContain('GC');
    expect(source).toContain("'img-gptimage': OPENAI_ASSET");
    expect(source).not.toContain("'img-dalle'");
  });

  it('uses the official CodeBuddy asset for WorkBuddy CLI', () => {
    const html = renderToStaticMarkup(
      createElement(ProviderBrandIcon, {
        providerId: 'workbuddy',
        providerName: 'WorkBuddy CLI',
        className: 'h-4 w-4',
      }),
    );

    expect(html).toContain('<img');
    expect(html).not.toContain('WC');
  });

  it('uses the official Volcengine asset for Volcengine CLI', () => {
    const html = renderToStaticMarkup(
      createElement(ProviderBrandIcon, {
        providerId: 'volcengine-cli',
        providerName: '山火 CLI',
        className: 'h-4 w-4',
      }),
    );

    expect(html).toContain('<img');
    expect(html).not.toContain('>山火<');
    expect(source).toContain("'volcengine-cli': { mode: 'color', src: volcengineIcon }");
    expect(source).not.toContain("'ark-cli':");
  });
});
