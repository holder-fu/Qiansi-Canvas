import { describe, expect, it } from 'vitest';
import {
  applyTextModePrompt,
  buildTextWorkflowPrompt,
  buildTextTaskInstruction,
  buildTextTaskPrompt,
  canSubmitTextTask,
  DEFAULT_TEXT_TASK_MODE,
  normalizeTextMaxLength,
  resolveTextModeDefinition,
  resolveTextTaskInput,
  TEXT_OUTPUT_ONLY_INSTRUCTION,
} from './textGeneration';

describe('text generation task contract', () => {
  it('keeps the legacy prompt unchanged when no task options are supplied', () => {
    expect(buildTextTaskPrompt('  保留这些空格  ')).toBe('  保留这些空格  ');
  });

  it('turns mode and maximum length into an explicit model instruction', () => {
    const prompt = buildTextTaskPrompt('第一幕，主角走进暴雨中的车站。', '拆分镜', 500);

    expect(prompt).toContain('【任务模式】拆分镜');
    expect(prompt).toContain('景别、人物动作、画面与镜头意图');
    expect(prompt).toContain('【输出长度】最多 500 字');
    expect(prompt).toContain('【待处理内容】\n第一幕');
  });

  it('keeps every canvas text mode inside a text-only output boundary', () => {
    const prompt = buildTextTaskPrompt(
      '用 @图片1 的人物生成一张和 @图片2 一样高清的人物图提示词。',
      DEFAULT_TEXT_TASK_MODE,
    );

    expect(prompt).toContain(TEXT_OUTPUT_ONLY_INSTRUCTION);
    expect(prompt).toContain('本节点只生成文本');
    expect(prompt).toContain('不得调用媒体生成工具、创建或修改文件');
    expect(prompt).toContain('不得声称已经生成媒体');
    expect(prompt).toContain('用 @图片1 的人物生成一张和 @图片2 一样高清的人物图提示词。');
  });

  it('normalizes unsafe length values and supports unknown future modes', () => {
    expect(normalizeTextMaxLength(Number.NaN)).toBeUndefined();
    expect(normalizeTextMaxLength(0)).toBe(1);
    expect(normalizeTextMaxLength(200_000)).toBe(100_000);
    expect(buildTextTaskInstruction('古文化', 100)).toContain('按“古文化”的目标');
  });

  it('provides visible guidance for every executable text mode', () => {
    expect(resolveTextModeDefinition(DEFAULT_TEXT_TASK_MODE)).toMatchObject({
      key: 'instruct',
      description: expect.stringContaining('指令'),
    });
    expect(resolveTextModeDefinition('拆分镜')).toMatchObject({
      description: expect.stringContaining('镜头'),
      placeholder: expect.stringContaining('分镜'),
    });
    expect(resolveTextModeDefinition('翻译')).toBeUndefined();
    expect(resolveTextModeDefinition('不存在')).toBeUndefined();
  });

  it('adds the selected mode prompt without overwriting user content', () => {
    const result = applyTextModePrompt('人物走进教室。', '续写', '拆分镜');

    expect(result).toContain('请将下面的内容拆分为');
    expect(result).toContain('\n\n人物走进教室。');
  });

  it('replaces the previous automatic mode prompt instead of stacking prompts', () => {
    const first = applyTextModePrompt('人物走进教室。', '续写', '拆分镜');
    const second = applyTextModePrompt(first, '拆分镜', '总结');
    const repeated = applyTextModePrompt(second, '总结', '总结');

    expect(second).toContain('请总结下面的内容');
    expect(second).not.toContain('请将下面的内容拆分为');
    expect(second).toContain('人物走进教室。');
    expect(repeated).toBe(second);
  });

  it('removes a legacy mode template when switching back to free instruction mode', () => {
    const withTemplate = applyTextModePrompt('人物走进教室。', '续写', '总结');

    expect(applyTextModePrompt(withTemplate, '总结', DEFAULT_TEXT_TASK_MODE)).toBe(
      '人物走进教室。',
    );
  });

  it('separates connected source text from a user instruction saved by the legacy composer', () => {
    const source = 'dynamic xuanhuan combat, layered orange-gold flame energy';
    const instruction = '通过上面的提示词给我一个可以生成同类风格图片的提示词。';
    const resolved = resolveTextTaskInput({
      upstreamTexts: [source],
      prompt: `${source}\n\n${instruction}`,
    });

    expect(resolved).toEqual({ sourceTexts: [source], instruction });
    expect(buildTextWorkflowPrompt(resolved.sourceTexts, resolved.instruction)).toBe(
      `【输入来源】\n${source}\n\n【用户指令】\n${instruction}`,
    );
  });

  it('keeps a standalone legacy prompt executable as a free-form instruction', () => {
    const legacyPrompt =
      '【风格】墨锋赤影\n主体使用水墨三维动画。\n\n通过上面的提示词给我一个可以生成同类风格图片的提示词。';

    expect(resolveTextTaskInput({ prompt: legacyPrompt })).toEqual({
      sourceTexts: [],
      instruction: legacyPrompt,
    });
  });

  it('keeps newly authored source material read-only and submits structured modes without extra text', () => {
    const resolved = resolveTextTaskInput({
      prompt: '第一幕，主角走进暴雨中的车站。',
      contentRole: 'source',
    });

    expect(resolved).toEqual({
      sourceTexts: ['第一幕，主角走进暴雨中的车站。'],
      instruction: '',
    });
    expect(canSubmitTextTask('', DEFAULT_TEXT_TASK_MODE, 1)).toBe(true);
    expect(canSubmitTextTask('', '总结', 1)).toBe(true);
    expect(canSubmitTextTask('提炼成一句话', DEFAULT_TEXT_TASK_MODE, 1)).toBe(true);
  });

  it('submits a connected source as the complete request when the result node has no extra instruction', () => {
    expect(buildTextWorkflowPrompt(['参考提示词\n请生成同类风格提示词。'], '')).toBe(
      '【输入内容】\n参考提示词\n请生成同类风格提示词。',
    );
  });
});
