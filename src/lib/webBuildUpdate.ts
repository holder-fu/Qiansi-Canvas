import { create } from 'zustand';

export function buildEntryFromHtml(html: string, base: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/giu) ?? []) {
    if (!/\btype\s*=\s*["']module["']/iu.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (!src) continue;
    try {
      const url = new URL(src, base);
      if (url.origin === new URL(base).origin && /\/assets\/[^/]+\.js$/u.test(url.pathname)) {
        return url.href;
      }
    } catch {
      /* Invalid HTML is not evidence of an update. */
    }
  }
  return null;
}

export const useWebBuildUpdate = create<{ available: boolean }>(() => ({ available: false }));
let checking = false;

export async function checkWebBuildUpdate() {
  if (import.meta.env.DEV || checking) return;
  const base = window.location.href;
  const entryTags = [...document.querySelectorAll('script[type="module"][src]')]
    .map((script) => script.outerHTML)
    .join('');
  const current = buildEntryFromHtml(entryTags, base);
  if (!current) return;
  checking = true;
  try {
    const response = await fetch(new URL('./', base), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
    const next = buildEntryFromHtml(await response.text(), base);
    if (next) useWebBuildUpdate.setState({ available: next !== current });
  } catch {
    /* Offline and failed requests must not be labelled as new versions. */
  } finally {
    checking = false;
  }
}
