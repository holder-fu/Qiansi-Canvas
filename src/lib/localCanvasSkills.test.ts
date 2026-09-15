import { describe, expect, it } from 'vitest';
import { normalizeStoredLocalCanvasSkills, parseLocalCanvasSkill } from './localCanvasSkills';

describe('parseLocalCanvasSkill', () => {
  it('reads SKILL.md metadata and preserves the instruction body', () => {
    const skill = parseLocalCanvasSkill(
      'SKILL.md',
      '---\nname: 分镜导演\ndescription: 为画布拆解镜头\n---\n# 分镜导演\n读取选中节点并创建脚本工作流。',
    );

    expect(skill.name).toBe('分镜导演');
    expect(skill.description).toBe('为画布拆解镜头');
    expect(skill.instructions).toContain('创建脚本工作流');
  });

  it('rejects an empty instruction file', () => {
    expect(() => parseLocalCanvasSkill('SKILL.md', '  ')).toThrow('Skill 文件为空。');
  });

  it('keeps legacy records and validates optional package resources', () => {
    const base = parseLocalCanvasSkill('SKILL.md', '# Skill\n执行指令。');
    expect(normalizeStoredLocalCanvasSkills([base])).toEqual([base]);
    expect(
      normalizeStoredLocalCanvasSkills([
        { ...base, resources: [{ path: 'references/rule.md', content: '规则' }] },
      ]),
    ).toHaveLength(1);
    expect(normalizeStoredLocalCanvasSkills([{ ...base, resources: [{ path: 1 }] }])).toEqual([]);
  });
});
