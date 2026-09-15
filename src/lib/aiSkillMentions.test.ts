import { describe, expect, it } from 'vitest';
import { insertAiSkillMention, resolveAiSkillMention } from './aiSkillMentions';

describe('AI SKILL image mentions', () => {
  it('finds the active image query before the caret', () => {
    expect(resolveAiSkillMention('让 @主角 看向镜头', 5)).toEqual({
      start: 2,
      end: 5,
      query: '主角',
    });
  });

  it('replaces the active query and returns the next caret position', () => {
    expect(insertAiSkillMention('让 @主角看向镜头', { start: 2, end: 5 }, '@图片1')).toEqual({
      value: '让 @图片1 看向镜头',
      caret: 7,
    });
  });
});
