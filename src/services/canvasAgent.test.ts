import { describe, expect, it } from 'vitest';
import { buildCanvasSkillSystemMessages, parseCanvasAgentResult } from './canvasAgent';

describe('parseCanvasAgentResult', () => {
  it('keeps image URLs that can be dragged from AI SKILL onto the canvas', () => {
    expect(
      parseCanvasAgentResult(
        '{"reply":"已生成","images":["https://example.com/shot.png","javascript:bad"],"actions":[]}',
      ).imageUrls,
    ).toEqual(['https://example.com/shot.png']);
  });
});

describe('AI SKILL package context', () => {
  it('includes multiple scheduled Skills and their resolved read-only resources', () => {
    const messages = buildCanvasSkillSystemMessages([
      {
        name: '镜头导演',
        sourceFileName: 'camera/SKILL.md',
        packageName: '影视大片skill',
        instructions: '设计镜头。',
        resources: [{ path: 'camera/references/rule.md', content: '保持轴线。' }],
      },
      {
        name: '声音导演',
        sourceFileName: 'sound/SKILL.md',
        instructions: '设计声音。',
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('影视大片skill');
    expect(messages[0]?.content).toContain('camera/references/rule.md');
    expect(messages[0]?.content).toContain('保持轴线');
    expect(messages[0]?.content).toContain('不得执行');
    expect(messages[1]?.content).toContain('声音导演');
  });
});
