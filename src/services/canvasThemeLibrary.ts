import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export type CanvasThemeLibraryItem = {
  name: string;
  size: number;
  modifiedAt: number;
};

export type CanvasThemeLibrary = {
  directory: string;
  items: CanvasThemeLibraryItem[];
};

export async function loadCanvasThemeLibrary(
  bridgeBase = BRIDGE_BASE_URL,
): Promise<CanvasThemeLibrary> {
  const base = resolveBridgeBaseUrl(bridgeBase);
  const response = await fetch(resolveBridgeUrl('/canvas-themes', base));
  const payload = (await response.json().catch(() => ({}))) as Partial<CanvasThemeLibrary> & {
    error?: { message?: string };
  };
  if (!response.ok || typeof payload.directory !== 'string' || !Array.isArray(payload.items)) {
    throw new Error(payload.error?.message || `风格目录读取失败（HTTP ${response.status}）。`);
  }
  return {
    directory: payload.directory,
    items: payload.items.filter(
      (item): item is CanvasThemeLibraryItem =>
        Boolean(item) &&
        typeof item.name === 'string' &&
        item.name.toLowerCase().endsWith('.zip') &&
        typeof item.size === 'number' &&
        typeof item.modifiedAt === 'number',
    ),
  };
}

export async function loadCanvasThemeFile(
  name: string,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<File> {
  if (!name || name.length > 180 || /[\\/]/.test(name) || !name.toLowerCase().endsWith('.zip')) {
    throw new Error('风格文件名无效。');
  }
  const base = resolveBridgeBaseUrl(bridgeBase);
  const response = await fetch(
    resolveBridgeUrl(`/canvas-themes/file?name=${encodeURIComponent(name)}`, base),
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message || `风格文件读取失败（HTTP ${response.status}）。`);
  }
  return new File([await response.blob()], name, { type: 'application/zip' });
}
