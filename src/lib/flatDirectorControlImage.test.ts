import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultDirectorScene, createDefaultDirectorSubject } from './directorConstraints';
import {
  getFlatDirectorControlImageSize,
  getFlatDirectorObjectCoverCrop,
  normalizeFlatDirectorControlAspectRatio,
  renderFlatDirectorControlImage,
} from './flatDirectorControlImage';

function createFakeCanvas(renderedText: string[] = []) {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    fillText: vi.fn((text: string) => renderedText.push(text)),
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => 'data:image/png;base64,control-image'),
  };
  return { canvas, context };
}

class ControlledImage {
  static latest: ControlledImage | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 1600;
  naturalHeight = 900;
  width = 1600;
  height = 900;
  crossOrigin: string | null = null;
  decoding = 'auto';
  src = '';

  constructor() {
    ControlledImage.latest = this;
  }
}

describe('flat director control image', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    ControlledImage.latest = null;
  });

  it.each([
    ['16:9', { width: 1200, height: 675 }],
    ['9:16', { width: 675, height: 1200 }],
    ['1:1', { width: 1200, height: 1200 }],
    ['3:4', { width: 900, height: 1200 }],
    ['4:3', { width: 1200, height: 900 }],
    ['2:3', { width: 800, height: 1200 }],
    ['3:2', { width: 1200, height: 800 }],
    ['4:5', { width: 960, height: 1200 }],
    ['5:4', { width: 1200, height: 960 }],
    ['21:9', { width: 1200, height: 514 }],
  ] as const)('resolves the GenParams ratio %s', (ratio, expected) => {
    expect(normalizeFlatDirectorControlAspectRatio(ratio)).toBe(ratio);
    expect(getFlatDirectorControlImageSize(ratio)).toEqual(expected);
  });

  it('falls back invalid persisted ratios to 16:9', () => {
    expect(normalizeFlatDirectorControlAspectRatio('Auto')).toBe('16:9');
    expect(normalizeFlatDirectorControlAspectRatio(null)).toBe('16:9');
    expect(getFlatDirectorControlImageSize('invalid')).toEqual({ width: 1200, height: 675 });
  });

  it('uses the same centered crop geometry as object-fit cover', () => {
    expect(getFlatDirectorObjectCoverCrop(1600, 1200, 1200, 675)).toEqual({
      sx: 0,
      sy: 150,
      sWidth: 1600,
      sHeight: 900,
    });
    expect(getFlatDirectorObjectCoverCrop(0, 1200, 1200, 675)).toBeNull();
  });

  it('emits a PNG data URL and paints subjects back-to-front without changing their letters', async () => {
    const renderedText: string[] = [];
    const { canvas } = createFakeCanvas(renderedText);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    });

    const scene = createDefaultDirectorScene();
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'foreground',
        sourceNodeId: 'foreground-image',
        label: '前景人物',
        imageUrl: 'foreground.png',
        x: 70,
        y: 82,
        scale: 100,
        rotation: 0,
      }),
      createDefaultDirectorSubject({
        id: 'background',
        sourceNodeId: 'background-image',
        label: '后景人物',
        imageUrl: 'background.png',
        x: 30,
        y: 24,
        scale: 80,
        rotation: 0,
      }),
    ];

    await expect(renderFlatDirectorControlImage(scene, '16:9')).resolves.toBe(
      'data:image/png;base64,control-image',
    );
    expect(canvas).toMatchObject({ width: 1200, height: 675 });
    expect(renderedText.filter((text) => /^[AB] · /.test(text))).toEqual([
      'B · 后景人物 · 正面朝向镜头',
      'A · 前景人物 · 正面朝向镜头',
    ]);
  });

  it.each(['load', 'error'] as const)(
    'clears the background timer after image %s',
    async (event) => {
      vi.useFakeTimers();
      const { canvas, context } = createFakeCanvas();
      vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
      vi.stubGlobal('Image', ControlledImage);
      const scene = createDefaultDirectorScene();
      scene.sceneUrl = 'https://assets.example.com/stage.png';

      const pending = renderFlatDirectorControlImage(scene, '16:9');
      const image = ControlledImage.latest;
      expect(image?.crossOrigin).toBe('anonymous');
      if (event === 'load') image?.onload?.();
      else image?.onerror?.();

      await expect(pending).resolves.toBe('data:image/png;base64,control-image');
      expect(vi.getTimerCount()).toBe(0);
      expect(context.drawImage).toHaveBeenCalledTimes(event === 'load' ? 1 : 0);
    },
  );

  it('falls back to the neutral canvas when a background image hangs for eight seconds', async () => {
    vi.useFakeTimers();
    const { canvas, context } = createFakeCanvas();
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    vi.stubGlobal('Image', ControlledImage);
    const scene = createDefaultDirectorScene();
    scene.sceneUrl = 'https://assets.example.com/hanging-stage.png';

    const pending = renderFlatDirectorControlImage(scene, '16:9');
    let completed = false;
    void pending.then(() => {
      completed = true;
    });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe('data:image/png;base64,control-image');
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the renderer contract browser-safe without requiring a real DOM canvas in tests', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./flatDirectorControlImage.ts', import.meta.url)),
      'utf8',
    );

    expect(renderFlatDirectorControlImage).toBeTypeOf('function');
    expect(source).toContain("image.crossOrigin = 'anonymous'");
    expect(source).toContain('BACKGROUND_IMAGE_LOAD_TIMEOUT_MS = 8_000');
    expect(source).toContain('clearTimeout(timeoutId)');
    expect(source).toContain('context.drawImage(');
    expect(source).toContain('for (const fraction of [1 / 3, 2 / 3])');
    expect(source).toContain('left.subject.y - right.subject.y || left.index - right.index');
    expect(source).toContain('The saved x/y coordinate is the feet anchor');
    expect(source).toContain("fallback.canvas.toDataURL('image/png')");
  });
});
