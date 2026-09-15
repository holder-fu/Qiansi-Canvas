import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCanvasThemeFile, loadCanvasThemeLibrary } from './canvasThemeLibrary';

afterEach(() => vi.unstubAllGlobals());

describe('canvas theme directory service', () => {
  it('loads multiple zip files from the dedicated bridge directory', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              directory: 'F:\\Qiansi-Canvas\\data\\canvas-themes',
              items: [
                { name: '深色.zip', size: 1200, modifiedAt: 1 },
                { name: '亮色.zip', size: 1400, modifiedAt: 2 },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    const library = await loadCanvasThemeLibrary('http://127.0.0.1:2895');
    expect(library.items.map((item) => item.name)).toEqual(['深色.zip', '亮色.zip']);
  });

  it('loads a selected directory item as a zip file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('zip-bytes', { status: 200 })),
    );
    const file = await loadCanvasThemeFile('我的风格.zip', 'http://127.0.0.1:2895');
    expect(file.name).toBe('我的风格.zip');
    expect(file.type).toBe('application/zip');
  });

  it('rejects paths outside the theme directory', async () => {
    await expect(loadCanvasThemeFile('../secret.zip')).rejects.toThrow('文件名无效');
  });
});
