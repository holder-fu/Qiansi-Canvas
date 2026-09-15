import { isDerivedImagePreviewUrl } from './aiImageReferencePolicy';

export type ImageAnnotationKind = 'arrow' | 'label' | 'text' | 'rect' | 'ellipse' | 'free';

export type ImageAnnotationReferenceMode = 'annotated' | 'original';

export interface ImageAnnotationPoint {
  x: number;
  y: number;
}

export interface ImageAnnotationHint {
  id: string;
  kind: ImageAnnotationKind;
  color?: string;
  start?: ImageAnnotationPoint;
  end?: ImageAnnotationPoint;
  point?: ImageAnnotationPoint;
  label?: string;
  arrowStyle?: 'straight' | 'curved';
  reversed?: boolean;
}

export const AI_ANNOTATION_COLOR = '#ff304f';

type ImageReferenceData = {
  originalUrl?: string;
  imageUrl?: string;
  images?: string[];
  output?: unknown;
  annotationSourceUrl?: string;
  aiReferenceMode?: ImageAnnotationReferenceMode;
};

/** Select the image URL that should be exposed to downstream AI nodes. */
export function preferredImageReferenceUrls(data: ImageReferenceData): string[] {
  if (data.aiReferenceMode === 'original' && data.annotationSourceUrl) {
    if (!isDerivedImagePreviewUrl(data.annotationSourceUrl)) return [data.annotationSourceUrl];
    if (data.originalUrl && !isDerivedImagePreviewUrl(data.originalUrl)) {
      return [data.originalUrl];
    }
    // Keep the unresolved preview visible to the final request guard. Silently
    // substituting an unrelated image would be worse than an actionable error.
    return [data.annotationSourceUrl];
  }
  const media = [data.imageUrl, ...(data.images ?? [])]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .filter((value, index, all) => all.indexOf(value) === index);
  if (media.length) {
    const fullQualityMedia = media.filter((value) => !isDerivedImagePreviewUrl(value));
    if (fullQualityMedia.length === media.length) return fullQualityMedia;

    const originalUrl =
      data.originalUrl && !isDerivedImagePreviewUrl(data.originalUrl)
        ? data.originalUrl
        : undefined;
    if (fullQualityMedia.length > 0) {
      // Preserve a real annotated/edit result when one exists. `originalUrl`
      // only replaces a preview occupying the primary image position.
      return isDerivedImagePreviewUrl(media[0]) && originalUrl
        ? [...new Set([originalUrl, ...fullQualityMedia])]
        : fullQualityMedia;
    }
    if (originalUrl) return [originalUrl];

    // Do not hide an orphaned preview. The AI request boundary will reject it
    // with an explicit "original unavailable" message instead of changing the
    // reference identity or silently submitting the thumbnail.
    return media;
  }
  if (data.originalUrl) return [data.originalUrl];
  return [data.output]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function hasImageAnnotations(value: unknown): value is ImageAnnotationHint[] {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as ImageAnnotationHint).id === 'string' &&
        typeof (item as ImageAnnotationHint).kind === 'string',
    )
  );
}

/** Prompt fragment that gives visual markers a stable meaning across model providers. */
export function imageAnnotationInstruction(hints: readonly ImageAnnotationHint[]): string {
  const arrows = hints.filter((hint) => hint.kind === 'arrow').length;
  const labels = hints.filter((hint) => hint.kind === 'label').length;
  const text = hints.filter((hint) => hint.kind === 'text').length;
  const shapes = hints.filter((hint) => ['rect', 'ellipse'].includes(hint.kind)).length;
  const parts = [
    '图中的高对比箭头、圆形数字、文字和形状是 AI 编辑指示，不是最终画面内容。',
    '箭头尖端所指区域是需要修改或重点保持的区域，请按箭头方向和编号逐一处理。',
    '生成结果中不要保留箭头、圆圈、数字、文字或其它标注。',
  ];
  const counts = [
    arrows ? `${arrows} 个箭头` : '',
    labels ? `${labels} 个数字标记` : '',
    text ? `${text} 个文字标记` : '',
    shapes ? `${shapes} 个形状框` : '',
  ].filter(Boolean);
  if (counts.length) parts.splice(1, 0, `参考图中共有${counts.join('、')}。`);
  const arrowDetails = hints
    .filter((hint) => hint.kind === 'arrow')
    .map((hint, index) => {
      const tip = hint.reversed ? hint.start : hint.end;
      if (!tip) return '';
      return `箭头${index + 1}的尖端约在图片左侧 ${Math.round(tip.x * 100)}%、顶部 ${Math.round(tip.y * 100)}%`;
    })
    .filter(Boolean);
  if (arrowDetails.length) parts.splice(2, 0, `${arrowDetails.join('；')}。`);
  return parts.join('\n');
}
