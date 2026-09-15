import type { DirectorSceneState } from '../canvas/nodeTypes';
import { isPlaceholderMediaUrl } from '../canvas/placeholders';
import {
  DIRECTOR_BODY_FACING_LABELS,
  DIRECTOR_SCENE_OBJECT_KIND_LABELS,
  normalizeDirectorScene,
} from './directorConstraints';

export const MAX_FLAT_DIRECTOR_REFERENCES = 5;

export interface FlatDirectorReferenceItem {
  index: number;
  kind: 'layout' | 'scene' | 'subject';
  label: string;
  imageUrl?: string;
}

export interface FlatDirectorReadiness {
  ready: boolean;
  issues: string[];
}

export function flatDirectorSubjectCode(index: number): string {
  return String.fromCharCode(65 + Math.max(0, Math.min(25, index)));
}

/** Built-in empty-state artwork must never become an AI identity or scene reference. */
export function isUsableFlatDirectorReferenceUrl(url: string | undefined): boolean {
  const normalized = url?.trim();
  return Boolean(normalized && !isPlaceholderMediaUrl(normalized));
}

/** Removes one selected identity reference and keeps untouched default labels sequential. */
export function removeFlatDirectorSubject(
  input: DirectorSceneState,
  subjectId: string,
): DirectorSceneState {
  return {
    ...input,
    subjects: input.subjects
      .filter((subject) => subject.id !== subjectId)
      .map((subject, index) =>
        /^人物\s*\d+$/.test(subject.label) ? { ...subject, label: `人物 ${index + 1}` } : subject,
      ),
  };
}

/** The order here must stay identical to the media array exposed by the director node. */
export function buildFlatDirectorReferenceManifest(
  input: DirectorSceneState,
): FlatDirectorReferenceItem[] {
  const scene = normalizeDirectorScene({ ...input, stageMode: 'flat' });
  const sceneUrl = isUsableFlatDirectorReferenceUrl(scene.sceneUrl) ? scene.sceneUrl : undefined;
  const items: Omit<FlatDirectorReferenceItem, 'index'>[] = [
    { kind: 'layout', label: '二维构图控制图' },
    ...(sceneUrl
      ? [
          {
            kind: 'scene' as const,
            label: scene.sceneName.trim() || '场景参考图',
            imageUrl: sceneUrl,
          },
        ]
      : []),
    ...scene.subjects.flatMap((subject, index) =>
      isUsableFlatDirectorReferenceUrl(subject.imageUrl)
        ? [
            {
              kind: 'subject' as const,
              label: `人物 ${flatDirectorSubjectCode(index)} · ${subject.label.trim() || `人物 ${index + 1}`}`,
              imageUrl: subject.imageUrl,
            },
          ]
        : [],
    ),
  ];
  return items.slice(0, MAX_FLAT_DIRECTOR_REFERENCES).map((item, index) => ({
    ...item,
    index: index + 1,
  }));
}

export function flatDirectorReferenceOverflow(input: DirectorSceneState): number {
  const scene = normalizeDirectorScene({ ...input, stageMode: 'flat' });
  const requested =
    1 +
    (isUsableFlatDirectorReferenceUrl(scene.sceneUrl) ? 1 : 0) +
    scene.subjects.filter((subject) => isUsableFlatDirectorReferenceUrl(subject.imageUrl)).length;
  return Math.max(0, requested - MAX_FLAT_DIRECTOR_REFERENCES);
}

/** Prevents an empty director node or an over-capacity reference set from masquerading as usable output. */
export function getFlatDirectorReadiness(input: DirectorSceneState): FlatDirectorReadiness {
  const scene = normalizeDirectorScene({ ...input, stageMode: 'flat' });
  const issues: string[] = [];
  const overflow = flatDirectorReferenceOverflow(scene);
  if (scene.subjects.length === 0) {
    issues.push('请至少添加一名带身份图的主要人物并指定站位');
  }
  const missingIdentity = scene.subjects.filter(
    (subject) => !isUsableFlatDirectorReferenceUrl(subject.imageUrl),
  );
  if (missingIdentity.length > 0) {
    issues.push(`有 ${missingIdentity.length} 名主要人物缺少身份参考图`);
  }
  if (scene.sceneUrl && !isUsableFlatDirectorReferenceUrl(scene.sceneUrl)) {
    issues.push('场景参考图仍是占位图，请选择真实场景图片');
  }
  const referenceUrls = [
    ...(isUsableFlatDirectorReferenceUrl(scene.sceneUrl) ? [scene.sceneUrl] : []),
    ...scene.subjects.map((subject) => subject.imageUrl).filter(isUsableFlatDirectorReferenceUrl),
  ];
  if (new Set(referenceUrls).size !== referenceUrls.length) {
    issues.push('场景图与每名主要人物必须使用不同的参考图片');
  }
  if (overflow > 0) {
    issues.push(`有 ${overflow} 名人物身份图超出 5 张参考图容量`);
  }
  return { ready: issues.length === 0, issues };
}

export function buildFlatDirectorReferenceImages(
  input: DirectorSceneState,
  layoutUrl: string,
): string[] {
  return buildFlatDirectorReferenceManifest(input).flatMap((item) => {
    if (item.kind === 'layout') return layoutUrl ? [layoutUrl] : [];
    return item.imageUrl ? [item.imageUrl] : [];
  });
}

function screenPosition(x: number, y: number) {
  return `${x < 34 ? '画面左侧' : x > 66 ? '画面右侧' : '画面中央'}、${y < 54 ? '后景' : y > 78 ? '前景' : '中景'}`;
}

function exactPosition(x: number, y: number, anchor: 'feet' | 'center') {
  return `${screenPosition(x, y)}（${anchor === 'feet' ? '脚底站位锚点' : '中心锚点'} x=${Math.round(x)}%、y=${Math.round(y)}%；左上角为0%、右下角为100%）`;
}

/** Compact, still-image-oriented contract for storyboards and nine-grid shot generation. */
export function buildFlatDirectorConstraintPrompt(
  input: DirectorSceneState,
  aspectRatio = '16:9',
): string {
  const scene = normalizeDirectorScene({ ...input, stageMode: 'flat' });
  const backgroundActors = scene.backgroundActors ?? [];
  const references = buildFlatDirectorReferenceManifest(scene);
  const overflow = flatDirectorReferenceOverflow(scene);
  const lines = [
    '分镜图 / 故事板图像生成约束：',
    `这是单张静态分镜控制图，不是视频时间轴。最终画幅比例必须为 ${aspectRatio}。严格执行人物数量、脚底站位、身体朝向、画面层次与固定物品；不要自行增加主要人物、替换身份或改变朝向。`,
    `场景：${
      scene.sceneName.trim() ||
      (scene.sceneUrl ? '使用已提供的场景参考图' : '未单独指定环境，按画面剧情建立环境')
    }。`,
  ];
  if (scene.prompt.trim()) lines.push(`画面剧情：${scene.prompt.trim()}`);
  lines.push('固定场景物品（必须出现并保持位置）：');
  if (scene.sceneObjects.length === 0) lines.push('无额外固定物品。');
  scene.sceneObjects.forEach((object, index) => {
    lines.push(
      `${index + 1}. ${object.label}（${DIRECTOR_SCENE_OBJECT_KIND_LABELS[object.kind]}）：${exactPosition(object.x, object.y, 'center')}，大小${Math.round(object.scale)}%；${object.description.trim() || '保持完整可见'}。`,
    );
  });
  lines.push(`画面中必须且只能出现${scene.subjects.length}名已指定主要人物。`);
  scene.subjects.forEach((subject, index) => {
    const code = flatDirectorSubjectCode(index);
    lines.push(
      `${index + 1}. 人物 ${code}「${subject.label || `人物${index + 1}`}」：${exactPosition(subject.x, subject.y, 'feet')}，人物高度比例${Math.round(subject.scale)}%（120%为默认全身站位大小）；身体${DIRECTOR_BODY_FACING_LABELS[subject.bodyFacing]}，朝向角度${Math.round(subject.bodyAngle)}°${subject.bodyTarget.trim() ? `，身体面向“${subject.bodyTarget.trim()}”` : ''}；${subject.action.trim() ? `静态动作：${subject.action.trim()}。` : '保持自然静止姿态。'}`,
    );
  });
  if (scene.subjects.length > 1) {
    const horizontalOrder = scene.subjects
      .map((subject, index) => ({ subject, index }))
      .sort((left, right) => left.subject.x - right.subject.x)
      .map(({ subject, index }) => `人物 ${flatDirectorSubjectCode(index)}「${subject.label}」`)
      .join(' → ');
    const depthOrder = scene.subjects
      .map((subject, index) => ({ subject, index }))
      .sort((left, right) => left.subject.y - right.subject.y)
      .map(({ subject, index }) => `人物 ${flatDirectorSubjectCode(index)}「${subject.label}」`)
      .join(' → ');
    lines.push(`主要人物左右顺序（从左到右）：${horizontalOrder}。不得交换左右顺序。`);
    lines.push(
      `主要人物景深与遮挡顺序（从后景到前景）：${depthOrder}。前景人物不得无故遮挡后景人物的脸和关键动作。`,
    );
  }
  if (backgroundActors.length > 0) {
    lines.push(
      `画面中另有${backgroundActors.length}名不具名群演，只作为环境背景人物，不能替代或遮挡主要人物。`,
    );
    backgroundActors.forEach((actor, index) => {
      lines.push(
        `群演${index + 1}「${actor.label || '群演'}」：${exactPosition(actor.x, actor.y, 'feet')}，画面大小${Math.round(actor.scale)}%；${actor.description.trim() || '保持低存在感的背景站位，不突出面部身份'}。`,
      );
    });
  }
  lines.push('参考图对应关系：');
  references.forEach((reference) => {
    lines.push(
      `参考图${reference.index}：${reference.label}（${reference.kind === 'layout' ? '控制人物编号、站位、大小、朝向和物品位置' : reference.kind === 'scene' ? '控制环境、空间和光线' : '仅用于保持该主要人物的身份与外观'}）。`,
    );
  });
  lines.push(
    '优先遵循二维构图控制图中的人物字母、脚底锚点、方向箭头、物品标签与精确相对位置。群演不使用身份参考图。',
  );
  if (overflow > 0) {
    lines.push(
      `引用容量不足：仍有${overflow}名主要人物身份图未进入参考图，请减少主要人物后再生成。`,
    );
  }
  lines.push(
    '禁止：新增或漏掉主要人物、左右位置对调、人物面向错误、遮挡关键物品、把背景物品移动到其他位置；群演不得抢占主角位置或拥有清晰可识别的主角身份。',
  );
  lines.push(
    '二维控制图中的字母、编号框、箭头、网格、辅助线和坐标文字只用于构图约束，最终成片中绝对不得出现这些标记。',
  );
  return lines.join('\n');
}
