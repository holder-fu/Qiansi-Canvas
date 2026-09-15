export interface LocalCanvasSkillResource {
  /** Package-root-relative path. Resource contents are always treated as read-only text. */
  path: string;
  content: string;
}

export interface LocalCanvasSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  sourceFileName: string;
  updatedAt: number;
  packageId?: string;
  packageName?: string;
  relativePath?: string;
  resources?: LocalCanvasSkillResource[];
}

const MAX_SKILL_FILE_SIZE = 256 * 1024;
export const MAX_LOCAL_CANVAS_SKILLS = 100;

function isLocalCanvasSkillResource(value: unknown): value is LocalCanvasSkillResource {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as LocalCanvasSkillResource).path === 'string' &&
    typeof (value as LocalCanvasSkillResource).content === 'string'
  );
}

function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'im'));
  return match?.[1]?.trim();
}

/** Parse a portable SKILL.md-style instruction file without executing its contents. */
export function parseLocalCanvasSkill(
  fileName: string,
  raw: string,
  metadata: Partial<
    Pick<LocalCanvasSkill, 'id' | 'packageId' | 'packageName' | 'relativePath' | 'resources'>
  > = {},
): LocalCanvasSkill {
  if (raw.length > MAX_SKILL_FILE_SIZE) {
    throw new Error('Skill 文件不能超过 256 KB。');
  }
  const source = raw.replace(/^\uFEFF/, '').trim();
  if (!source) throw new Error('Skill 文件为空。');

  const frontmatterMatch = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? '';
  const instructions = source.slice(frontmatterMatch?.[0].length ?? 0).trim();
  if (!instructions) throw new Error('Skill 文件缺少可执行指令。');

  const heading = instructions.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const baseName = fileName.replace(/\.(?:md|txt)$/i, '').replace(/^skill$/i, '本地 Skill');
  const name =
    frontmatterValue(frontmatter, 'name') ??
    frontmatterValue(frontmatter, 'title') ??
    heading ??
    baseName;
  const description =
    frontmatterValue(frontmatter, 'description') ??
    instructions
      .split('\n')
      .map((line) => line.replace(/^#+\s*/, '').trim())
      .find((line) => line && line !== heading) ??
    '本地导入的画布 Skill';

  return {
    id: metadata.id ?? `local-skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.slice(0, 80),
    description: description.slice(0, 160),
    instructions,
    sourceFileName: fileName,
    updatedAt: Date.now(),
    ...metadata,
  };
}

export function normalizeStoredLocalCanvasSkills(value: unknown): LocalCanvasSkill[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((skill): skill is LocalCanvasSkill => {
      if (
        !skill ||
        typeof skill !== 'object' ||
        typeof skill.id !== 'string' ||
        typeof skill.name !== 'string' ||
        typeof skill.description !== 'string' ||
        typeof skill.instructions !== 'string' ||
        typeof skill.sourceFileName !== 'string' ||
        typeof skill.updatedAt !== 'number'
      ) {
        return false;
      }
      if (skill.resources === undefined) return true;
      return Array.isArray(skill.resources) && skill.resources.every(isLocalCanvasSkillResource);
    })
    .slice(0, MAX_LOCAL_CANVAS_SKILLS);
}
