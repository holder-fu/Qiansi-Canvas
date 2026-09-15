import { BRIDGE_BASE_URL, isCurrentBridgeUrl, resolveBridgeUrl } from './bridgeUrl';

export type MediaDownloadExtension = 'png' | 'mp4';

export type MediaDownloadRequest = {
  href: string;
  fileName: string;
};

function safeDownloadName(title: string, fallbackExtension: MediaDownloadExtension) {
  const fallbackName = fallbackExtension === 'mp4' ? 'video' : 'image';
  const printable = [...title.trim()]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? '-' : character;
    })
    .join('');
  const cleaned = printable
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);
  const baseName = cleaned || fallbackName;
  return /\.[A-Za-z0-9]{1,10}$/.test(baseName) ? baseName : `${baseName}.${fallbackExtension}`;
}

/** Build a bridge attachment URL while keeping data/blob and third-party media usable. */
export function buildMediaDownloadRequest(
  source: string,
  title: string,
  fallbackExtension: MediaDownloadExtension = 'png',
  bridgeBase = BRIDGE_BASE_URL,
): MediaDownloadRequest {
  const fileName = safeDownloadName(title, fallbackExtension);
  if (source.startsWith('data:') || source.startsWith('blob:')) {
    return { href: source, fileName };
  }

  let href = source;
  try {
    href = resolveBridgeUrl(source, bridgeBase);
  } catch {
    // Preserve an existing third-party URL. The new-tab fallback below keeps
    // a server that ignores the download attribute from replacing the canvas.
  }
  if (isCurrentBridgeUrl(href, bridgeBase)) {
    const url = new URL(href);
    url.searchParams.set('download', fileName);
    href = url.toString();
  }
  return { href, fileName };
}

/** Trigger a download without ever navigating the active canvas tab. */
export function downloadMediaFile(
  source: string,
  title: string,
  fallbackExtension: MediaDownloadExtension = 'png',
) {
  const request = buildMediaDownloadRequest(source, title, fallbackExtension);
  const anchor = document.createElement('a');
  anchor.href = request.href;
  anchor.download = request.fileName;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
