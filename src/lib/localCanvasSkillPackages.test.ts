import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  groupLocalCanvasSkills,
  mergeLocalCanvasSkills,
  normalizeLocalSkillPackagePath,
  parseLocalCanvasSkillArchive,
  parseLocalCanvasSkillPackage,
  scheduleLocalCanvasSkills,
} from './localCanvasSkillPackages';
import type { LocalCanvasSkill } from './localCanvasSkills';

describe('local Canvas Skill packages', () => {
  it('groups previously imported folders and packages for later reuse', () => {
    const skills: LocalCanvasSkill[] = [
      {
        id: 'camera',
        name: '镜头导演',
        description: '',
        instructions: '设计镜头',
        sourceFileName: 'camera/SKILL.md',
        packageId: 'film-pack',
        packageName: '影视大片skill',
        updatedAt: 1,
      },
      {
        id: 'sound',
        name: '声音导演',
        description: '',
        instructions: '设计声音',
        sourceFileName: 'sound/SKILL.md',
        packageId: 'film-pack',
        packageName: '影视大片skill',
        updatedAt: 1,
      },
      {
        id: 'standalone',
        name: '独立 Skill',
        description: '',
        instructions: '独立指令',
        sourceFileName: 'standalone.md',
        updatedAt: 1,
      },
    ];

    expect(groupLocalCanvasSkills(skills)).toEqual([
      { id: 'film-pack', name: '影视大片skill', skillIds: ['camera', 'sound'] },
      {
        id: 'local-skill-file-standalone',
        name: '独立 Skill',
        skillIds: ['standalone'],
      },
    ]);
  });

  it('imports every SKILL.md and resolves linked text resources relative to each Skill', () => {
    const skills = parseLocalCanvasSkillPackage('cinema-pack', [
      {
        path: 'cinema-pack/.agents/skills/camera/SKILL.md',
        content:
          '---\nname: 镜头导演\ndescription: 设计镜头运动\n---\n读取 [镜头契约](references/camera.md)，但不要运行 `scripts/check.py`。',
      },
      {
        path: 'cinema-pack/.agents/skills/camera/references/camera.md',
        content: '使用路径锚点。格式见 [模板](../assets/camera.yaml)。',
      },
      {
        path: 'cinema-pack/.agents/skills/camera/assets/camera.yaml',
        content: 'duration: 4s',
      },
      {
        path: 'cinema-pack/.agents/skills/camera/scripts/check.py',
        content: 'raise SystemExit(1)',
      },
      {
        path: 'cinema-pack/.agents/skills/sound/SKILL.md',
        content: '---\nname: 声音导演\n---\n设计声音事件。',
      },
      {
        path: 'cinema-pack/.agents/archived-execution-skills/legacy/SKILL.md',
        content: '---\nname: 已归档执行器\n---\n不应参与调度。',
      },
    ]);

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      name: '镜头导演',
      packageName: 'cinema-pack',
      relativePath: '.agents/skills/camera/SKILL.md',
    });
    expect(skills[0]?.resources).toEqual([
      {
        path: '.agents/skills/camera/references/camera.md',
        content: '使用路径锚点。格式见 [模板](../assets/camera.yaml)。',
      },
      { path: '.agents/skills/camera/assets/camera.yaml', content: 'duration: 4s' },
    ]);
  });

  it('imports ZIP packages through the same path and resource contract', async () => {
    const archive = zipSync({
      'film/shot/SKILL.md': strToU8('---\nname: 分镜\n---\n读取 [规则](references/rule.md)。'),
      'film/shot/references/rule.md': strToU8('保持轴线连续。'),
      'film/shot/assets/poster.png': new Uint8Array([1, 2, 3]),
    });

    const skills = await parseLocalCanvasSkillArchive('film.zip', archive);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.resources).toEqual([
      { path: 'shot/references/rule.md', content: '保持轴线连续。' },
    ]);
  });

  it('rejects package paths that can escape the selected root', () => {
    expect(() => normalizeLocalSkillPackagePath('../outside/SKILL.md')).toThrow(
      'Skill 包路径不能离开包目录',
    );
    expect(() => normalizeLocalSkillPackagePath('C:\\outside\\SKILL.md')).toThrow(
      'Skill 包包含无效的文件路径',
    );
  });

  it('schedules a bounded relevant subset from many active Skills', () => {
    const skills: LocalCanvasSkill[] = Array.from({ length: 8 }, (_, index) => ({
      id: `skill-${index}`,
      name: index === 6 ? '镜头运动导演' : `制作 Skill ${index}`,
      description: index === 6 ? '设计镜头运动、路径和机位' : '通用影视制作',
      instructions: index === 5 ? '处理镜头运动的连续性。' : `执行制作步骤 ${index}`,
      sourceFileName: `skill-${index}/SKILL.md`,
      updatedAt: index,
    }));

    const scheduled = scheduleLocalCanvasSkills(
      skills,
      skills.map((skill) => skill.id),
      '请设计镜头运动',
      2,
    );
    expect(scheduled.map((skill) => skill.id)).toEqual(['skill-6', 'skill-5']);
  });

  it('replaces a re-imported package entry without duplicating it', () => {
    const current = parseLocalCanvasSkillPackage('film', [
      { path: 'film/a/SKILL.md', content: '---\nname: 旧版\n---\n旧指令' },
    ]);
    const imported = parseLocalCanvasSkillPackage('film', [
      { path: 'film/a/SKILL.md', content: '---\nname: 新版\n---\n新指令' },
    ]);

    expect(mergeLocalCanvasSkills(current, imported)).toHaveLength(1);
    expect(mergeLocalCanvasSkills(current, imported)[0]?.name).toBe('新版');
  });
});
