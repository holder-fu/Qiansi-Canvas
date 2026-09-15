import type { Point } from '../canvas/nodeTypes';

export type CharacterReferenceKind = 'standing' | 'portrait' | 'expressions' | 'turnaround';

export type CharacterReferenceImages = Partial<Record<CharacterReferenceKind, string>>;

export const CHARACTER_REFERENCE_KINDS: CharacterReferenceKind[] = [
  'standing',
  'portrait',
  'expressions',
  'turnaround',
];

const TOP_REFERENCE_KINDS: CharacterReferenceKind[] = ['standing', 'portrait', 'expressions'];
const COMPACT_WIDTH = 236;
const COMPACT_HEIGHT = 294;
const COMPACT_GAP = 14;
const ROW_GAP = 50;
const TURNAROUND_WIDTH = 736;
const TURNAROUND_HEIGHT = 414;

export function availableCharacterReferenceKinds(
  images?: CharacterReferenceImages,
): CharacterReferenceKind[] {
  return CHARACTER_REFERENCE_KINDS.filter((kind) => Boolean(images?.[kind]?.trim()));
}

export function pickCharacterReferenceImages(
  images: CharacterReferenceImages | undefined,
  kinds: Iterable<CharacterReferenceKind>,
): CharacterReferenceImages {
  const selected = new Set(kinds);
  return Object.fromEntries(
    CHARACTER_REFERENCE_KINDS.flatMap((kind) => {
      const image = images?.[kind]?.trim();
      return selected.has(kind) && image ? [[kind, image]] : [];
    }),
  );
}

/**
 * Character cards use the real face close-up instead of a separately maintained thumbnail.
 * The remaining sources only keep legacy or partially completed character records visible.
 */
export function resolveCharacterCoverSource(
  images?: CharacterReferenceImages,
  legacyThumbnail?: string,
  legacyOriginalImage?: string,
): string | undefined {
  return [
    images?.portrait,
    images?.standing,
    images?.turnaround,
    images?.expressions,
    legacyThumbnail,
    legacyOriginalImage,
  ]
    .find((source) => Boolean(source?.trim()))
    ?.trim();
}

/**
 * Compact character recommendations prefer the wide turnaround sheet, while still keeping
 * legacy templates and incomplete records visible through the regular cover fallback.
 */
export function resolveCharacterTurnaroundCoverSource(
  images?: CharacterReferenceImages,
  legacyThumbnail?: string,
  legacyOriginalImage?: string,
): string | undefined {
  return (
    images?.turnaround?.trim() ||
    resolveCharacterCoverSource(images, legacyThumbnail, legacyOriginalImage)
  );
}

export interface CharacterReferenceNodeSpec {
  kind: CharacterReferenceKind;
  title: string;
  image?: string;
  position: Point;
  width: number;
  height: number;
  generationAspectRatio: '4:5' | '16:9';
}

export const CHARACTER_REFERENCE_GROUP_WIDTH = 736;
export const CHARACTER_REFERENCE_GROUP_HEIGHT = 758;

const CHARACTER_REFERENCE_SUFFIX: Record<CharacterReferenceKind, string> = {
  standing: '角色立绘',
  portrait: '脸部近景',
  expressions: '表情参考',
  turnaround: '三视图',
};

export function characterReferenceGroupSize(images?: CharacterReferenceImages) {
  const topCount = TOP_REFERENCE_KINDS.filter((kind) => images?.[kind]?.trim()).length;
  const hasTurnaround = Boolean(images?.turnaround?.trim());
  const topWidth = topCount
    ? topCount * COMPACT_WIDTH + Math.max(0, topCount - 1) * COMPACT_GAP
    : 0;
  return {
    width: Math.max(topWidth, hasTurnaround ? TURNAROUND_WIDTH : 0),
    height:
      (topCount ? COMPACT_HEIGHT : 0) +
      (topCount && hasTurnaround ? ROW_GAP : 0) +
      (hasTurnaround ? TURNAROUND_HEIGHT : 0),
  };
}

export function buildCharacterReferenceNodes({
  title,
  referenceImages,
  origin,
}: {
  title: string;
  referenceImages?: CharacterReferenceImages;
  origin: Point;
}): CharacterReferenceNodeSpec[] {
  const topReferences = TOP_REFERENCE_KINDS.flatMap((kind, index) => {
    const image = referenceImages?.[kind]?.trim();
    return image
      ? [
          {
            kind,
            title: `${title} ${CHARACTER_REFERENCE_SUFFIX[kind]}`,
            image,
            position: { x: origin.x + index * (COMPACT_WIDTH + COMPACT_GAP), y: origin.y },
            width: COMPACT_WIDTH,
            height: COMPACT_HEIGHT,
            generationAspectRatio: '4:5' as const,
          },
        ]
      : [];
  });
  const turnaround = referenceImages?.turnaround?.trim();
  return [
    ...topReferences.map((reference, index) => ({
      ...reference,
      position: { x: origin.x + index * (COMPACT_WIDTH + COMPACT_GAP), y: origin.y },
    })),
    ...(turnaround
      ? [
          {
            kind: 'turnaround' as const,
            title: `${title} ${CHARACTER_REFERENCE_SUFFIX.turnaround}`,
            image: turnaround,
            position: {
              x: origin.x,
              y: origin.y + (topReferences.length ? COMPACT_HEIGHT + ROW_GAP : 0),
            },
            width: TURNAROUND_WIDTH,
            height: TURNAROUND_HEIGHT,
            generationAspectRatio: '16:9' as const,
          },
        ]
      : []),
  ];
}
