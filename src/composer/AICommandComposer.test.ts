import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CameraPromptChips,
  ComposerErrorBanner,
  ComposerSubmitIndicator,
  TextContextReferenceCard,
} from './AICommandComposer';
import composerSource from './AICommandComposer.tsx?raw';
import promptEditorSource from './PromptEditor.tsx?raw';

describe('AICommandComposer camera prompt chips', () => {
  it('renders each selected camera prompt as a compact named chip', () => {
    const html = renderToStaticMarkup(
      createElement(CameraPromptChips, {
        prompts: [
          { id: 'tilt-up', title: '镜头上摇', prompt: '由下向上摇摄' },
          { id: 'orbit-down', title: '镜头盘旋下降', prompt: '盘旋并降低机位' },
        ],
      }),
    );

    expect(html).toContain('data-camera-prompt-chip="tilt-up"');
    expect(html).toContain('data-camera-prompt-chip="orbit-down"');
    expect(html).toContain('镜头上摇');
    expect(html).toContain('镜头盘旋下降');
    expect(html).toContain('title="由下向上摇摄"');
  });
});

describe('AICommandComposer generation errors', () => {
  it('renders a dismiss button beside the visible generation error', () => {
    const html = renderToStaticMarkup(
      createElement(ComposerErrorBanner, {
        message: '当前模型不支持图片分析',
        onDismiss: () => {},
      }),
    );

    expect(html).toContain('发送失败：当前模型不支持图片分析');
    expect(html).toContain('aria-label="关闭错误提示"');
  });
});

describe('AICommandComposer upstream text reference', () => {
  it('keeps the context card out of image composers where upstream text is merged into the prompt', () => {
    expect(composerSource).toContain("runtime.spec.type === 'text' && (");
    expect(composerSource).not.toContain(
      "(runtime.spec.type === 'text' || runtime.spec.type === 'image') && (",
    );
  });

  it('renders a compact reference card whose hover tooltip contains the upstream prompt', () => {
    const html = renderToStaticMarkup(
      createElement(TextContextReferenceCard, {
        sources: ['【模块化风格】墨锋赤影\n画面渲染：graphic ink-brush Chinese 3D animation'],
        onRemove: () => {},
      }),
    );

    expect(html).toContain('data-text-context-reference="true"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('参考文本');
    expect(html).toContain('【模块化风格】墨锋赤影');
    expect(html).toContain('graphic ink-brush Chinese 3D animation');
    expect(html).toContain('aria-label="参考文本 1 条"');
    expect(html).toContain('data-text-context-count="true"');
    expect(html).toContain('data-text-context-remove="true"');
    expect(html).toContain('aria-label="关闭并移除参考文本"');
    expect(html.indexOf('data-text-context-count')).toBeLessThan(
      html.indexOf('data-text-context-remove'),
    );

    const countBadge = html.match(/<span[^>]*data-text-context-count="true"[^>]*>/)?.[0] ?? '';
    const removeButton = html.match(/<button[^>]*data-text-context-remove="true"[^>]*>/)?.[0] ?? '';
    for (const hoverControl of [countBadge, removeButton]) {
      expect(hoverControl).toContain('invisible');
      expect(hoverControl).toContain('opacity-0');
      expect(hoverControl).toContain('group-hover:visible');
      expect(hoverControl).toContain('group-hover:opacity-100');
      expect(hoverControl).toContain('group-focus-within:visible');
      expect(hoverControl).toContain('group-focus-within:opacity-100');
    }
  });

  it('shows the source count and omits empty upstream values', () => {
    const html = renderToStaticMarkup(
      createElement(TextContextReferenceCard, {
        sources: ['第一段提示词', '   ', '第二段提示词'],
      }),
    );

    expect(html).toContain('aria-label="参考文本 2 条"');
    expect(html).toContain('来源 1');
    expect(html).toContain('来源 2');
    expect(html).not.toContain('来源 3');
  });

  it('does not render a reference card when no upstream prompt exists', () => {
    expect(
      renderToStaticMarkup(createElement(TextContextReferenceCard, { sources: [' ', '\n'] })),
    ).toBe('');
  });
});

describe('AICommandComposer submission feedback', () => {
  it('shows an immediate image-analysis status while a referenced request is running', () => {
    const html = renderToStaticMarkup(
      createElement(ComposerSubmitIndicator, {
        isGenerating: true,
        hasReferences: true,
        promptLength: 38,
        compactAudio: false,
        requestOwnerLabel: 'Video API · Seedance',
      }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('正在分析参考图…');
    expect(html).toContain('data-generation-request-lock="true"');
    expect(html).toContain('Video API · Seedance');
    expect(html).not.toContain('字数 38');
  });

  it('requires a ready capable model for image and video submission', () => {
    expect(composerSource).toContain('findReadyGenerationModel(readyVisualModels, state.params)');
    expect(composerSource).toContain('generationCapabilityIssue(selectedVisualModel');
    expect(composerSource).toContain('visualCapabilityIssue === null');
  });

  it('shows an explicit no-fallback warning for unsupported masked repair', () => {
    expect(composerSource).toContain("runtime.videoTool === 'masked-repair'");
    expect(composerSource).toContain("'videoMaskRepair.model.sendBlocked'");
    expect(composerSource).toContain('不会退化为普通视频重生成');
  });

  it('locks prompt and request controls while a generation request is in flight', () => {
    expect(promptEditorSource).toContain('contentEditable={!isGenerating}');
    expect(promptEditorSource).toContain('aria-readonly={isGenerating}');
    expect(composerSource).toContain("isGenerating ? 'pointer-events-none opacity-55' : ''");
  });

  it('keeps reference mention suggestions above the composer footer', () => {
    expect(promptEditorSource).toContain('data-reference-mention-menu="true"');
    expect(promptEditorSource).toContain('absolute z-50 w-60 overflow-hidden');
    expect(composerSource).toContain('data-composer-footer');
    expect(composerSource).toContain('relative z-30 flex shrink-0');
  });

  it('softens the corners of reference mention suggestion thumbnails', () => {
    expect(promptEditorSource.match(/h-8 w-8 shrink-0 rounded-lg object-cover/g)).toHaveLength(2);
    expect(promptEditorSource).toContain('h-8 w-8 shrink-0 rounded-lg bg-white/[0.06]');
    expect(promptEditorSource).not.toContain('h-8 w-8 shrink-0 rounded object-cover');
  });

  it('hides the running instruction status from every composer footer', () => {
    expect(composerSource).toContain('{!isGenerating && (');
    expect(composerSource).toContain('isGenerating={false}');
  });

  it('keeps the character count when no submission is running', () => {
    const html = renderToStaticMarkup(
      createElement(ComposerSubmitIndicator, {
        isGenerating: false,
        hasReferences: true,
        promptLength: 38,
        compactAudio: false,
      }),
    );

    expect(html).toContain('字数 38');
    expect(html).not.toContain('正在分析参考图…');
  });

  it('keeps the video footer on one stable non-wrapping row', () => {
    expect(composerSource).toContain("runtime.spec.type === 'video'");
    expect(composerSource).toContain('flex flex-nowrap items-center gap-1.5');
    expect(composerSource).toContain('footerControls.map');
    expect(composerSource).toContain('whitespace-nowrap text-[11px]');
    expect(composerSource).toContain('flex shrink-0 items-center gap-1.5');
    expect(composerSource).not.toContain("control !== 'videoSettings'");
  });

  it('separates editable instructions from read-only upstream text', () => {
    const html = renderToStaticMarkup(
      createElement(ComposerSubmitIndicator, {
        isGenerating: false,
        hasReferences: false,
        promptLength: 14,
        contextLength: 2516,
        textComposer: true,
        compactAudio: false,
      }),
    );

    expect(html).toContain('指令 14 字 · 上下文 2516 字');
    expect(html).not.toContain('字数 14');
  });
});
