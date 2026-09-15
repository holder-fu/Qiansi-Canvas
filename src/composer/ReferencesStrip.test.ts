import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComposerProvider } from './ComposerContext';
import { ReferencesStrip } from './ReferencesStrip';
import referencesStripSource from './ReferencesStrip.tsx?raw';

describe('ReferencesStrip', () => {
  it('keeps reference labels accessible without painting text over the thumbnail', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'image-1',
            type: 'image',
            url: 'blob:reference-image',
            label: '角色正面参考.png',
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html).toContain('title="角色正面参考.png"');
    expect(html).toContain('aria-label="参考图片 1"');
    expect(html).toContain('data-reference-image-index="1"');
    expect(html).toContain('>1</span>');
    expect(html).toContain('alt=""');
    expect(html).not.toContain('>参考图片 1<');
    expect(html).toContain('h-[55px] w-[55px]');
    expect(html).toContain('rounded-lg object-cover');
    expect(html).not.toContain('object-contain');
  });

  it('makes editable images draggable with insertion feedback and a keyboard alternative', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          { id: 'image-1', type: 'image', url: 'blob:image-1', label: '图1' },
          { id: 'image-2', type: 'image', url: 'blob:image-2', label: '图2' },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html.match(/data-reference-reorderable="true"/g)).toHaveLength(2);
    expect(html.match(/draggable="true"/g)).toHaveLength(2);
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(referencesStripSource).toContain("setData('application/x-qiansi-composer-reference'");
    expect(referencesStripSource).toContain("event.key === 'ArrowLeft'");
    expect(referencesStripSource).toContain('data-reference-drop-placement');
  });

  it('places a same-sized local image upload action after the top references', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'image-before-upload',
            type: 'image',
            url: 'blob:reference-image',
            label: '参考图片',
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html.indexOf('data-reference-upload-trigger="true"')).toBeGreaterThan(
      html.indexOf('data-reference-role="reference"'),
    );
    expect(html).toContain('data-reference-upload-input="true"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('multiple=""');
    expect(html).toContain('aria-label="添加本地参考图片"');
    expect(html).toContain('lucide-plus');
    expect(referencesStripSource).toContain(
      'className="flex h-[55px] w-[55px] shrink-0 items-center justify-center rounded-lg border border-dashed',
    );
    expect(referencesStripSource).toContain(
      "persistImageFile(file, 'storyboard', activeProjectId)",
    );
    expect(referencesStripSource).toContain(
      'const files = Array.from(event.currentTarget.files ?? []);',
    );
    expect(referencesStripSource).toContain('id: `local-reference:${persisted.bridgeAssetId}`');
  });

  it('accepts local image, video and audio files in a video composer', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {
        spec: { type: 'video' },
        primaryNodeId: 'video-target',
      } as never,
      genParams: {} as never,
      initialState: { references: [] },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html).toContain('accept="image/*,video/*,audio/*,.weba,.m4a,.mov"');
    expect(html).toContain('aria-label="添加本地图片、视频或音频参考"');
    expect(referencesStripSource).toContain('persistVideoFile(file, activeProjectId)');
    expect(referencesStripSource).toContain("uploadAssetFile(file, 'audio'");
  });

  it('renders a stable preview before the full-quality submission URL', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'image-with-preview',
            type: 'image',
            url: 'blob:full-quality-image',
            previewUrl: 'http://127.0.0.1:2895/asset-library/files/source-image?preview=image',
            label: '稳定预览',
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html).toContain(
      'src="http://127.0.0.1:2895/asset-library/files/source-image?preview=image"',
    );
    expect(html).not.toContain('src="blob:full-quality-image"');
  });

  it('renders compact text and audio reference icons without media URLs', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          { id: 'text-source-text', type: 'text', label: '文本1' },
          { id: 'audio-source-audio', type: 'audio', label: '音频1' },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html).toContain('aria-label="参考文本 1"');
    expect(html).toContain('aria-label="参考音频 2"');
    expect(html).toContain('lucide-file-text');
    expect(html).toContain('lucide-music');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<video');
  });

  it('uses the reference order for image numbers and leaves non-image cards unnumbered', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          { id: 'audio-1', type: 'audio', label: '音频1' },
          { id: 'image-2', type: 'image', url: 'blob:image-2', label: '图片2' },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html).toContain('data-reference-image-index="2"');
    expect(html).not.toContain('data-reference-image-index="1"');
    expect(html).toContain('aria-label="在指令中引用图片 2"');
  });

  it('shows a director lock instead of an individual remove action', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'director-layout-image-0',
            type: 'image',
            url: 'data:image/png;base64,director-layout',
            label: '参考图 1 · 导演构图控制图',
            locked: true,
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };

    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));
    expect(html).toContain('title="参考图 1 · 导演构图控制图"');
    expect(html).toContain('aria-label="导演参考顺序已锁定"');
    expect(html).not.toContain('aria-label="删除图片 1"');
  });

  it('keeps a style-only image reference visually compact', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'style-preset:ink',
            type: 'image',
            url: 'blob:ink-style',
            label: '水墨风格',
            role: 'style',
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };

    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));
    expect(html).toContain('title="水墨风格"');
    expect(html).toContain('h-[55px] w-[55px]');
    expect(html).toContain('rounded-lg object-cover');
    expect(html).not.toContain('风格参考');
    expect(html).toContain('>风格</span>');
    expect(html).not.toContain('在指令中引用图片 1');
  });

  it('uses a persisted poster while a referenced video loads', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'video-with-poster',
            type: 'video',
            url: 'http://127.0.0.1:2895/asset-library/files/source-video',
            previewUrl: 'http://127.0.0.1:2895/media-preview/files/source-video.webp',
            label: '参考视频',
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };
    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));

    expect(html).toContain('poster="http://127.0.0.1:2895/media-preview/files/source-video.webp"');
    expect(html).toContain('src="http://127.0.0.1:2895/asset-library/files/source-video"');
    expect(html).toContain('aria-label="在指令中引用视频 1"');
    expect(html).toContain('h-[55px] w-[55px]');
    expect(html).toContain('rounded-lg object-cover');
  });

  it('loops a legacy effect video and hides the mention action', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'effect-video',
            type: 'video',
            url: 'http://127.0.0.1:2895/asset-library/files/earth-zoom',
            previewUrl: 'http://127.0.0.1:2895/media-preview/files/earth-zoom.webp',
            label: '地球缩放',
            role: 'effect',
            effectPrompt: '镜头快速拉远到地球全景',
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };

    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));
    expect(html).toContain('<video');
    expect(html).toContain('autoPlay=""');
    expect(html).toContain('loop=""');
    expect(html).toContain('muted=""');
    expect(html).toContain('>特效</span>');
    expect(html).toContain('地球缩放</span>');
    expect(html).toContain('aria-label="删除视频 1"');
    expect(html).not.toContain('aria-label="在指令中引用视频 1"');
  });

  it('renders an animated WebP effect from its original and hides the mention action', () => {
    const providerProps: ComponentProps<typeof ComposerProvider> = {
      runtime: {} as never,
      genParams: {} as never,
      initialState: {
        references: [
          {
            id: 'effect-webp',
            type: 'image',
            url: 'http://127.0.0.1:2895/asset-library/files/effect-original',
            previewUrl: 'http://127.0.0.1:2895/media-preview/files/effect-static.webp',
            label: '克林霉素',
            role: 'effect',
          },
        ],
      },
      onGenParamChange: () => {},
      onSubmit: () => {},
      isGenerating: false,
      children: createElement(ReferencesStrip),
    };

    const html = renderToStaticMarkup(createElement(ComposerProvider, providerProps));
    expect(html).toContain('src="http://127.0.0.1:2895/asset-library/files/effect-original"');
    expect(html).not.toContain(
      'src="http://127.0.0.1:2895/media-preview/files/effect-static.webp"',
    );
    expect(html).toContain('>特效</span>');
    expect(html).toContain('克林霉素</span>');
    expect(html).toContain('data-reference-role="effect"');
    expect(html).not.toContain('data-reference-image-index');
    expect(html).toContain('w-16');
    expect(html).toContain('h-14 w-16');
    expect(html).toContain('object-contain');
    expect(html).not.toContain('w-24');
    expect(html).not.toContain('aria-label="在指令中引用图片 1"');
  });
});
