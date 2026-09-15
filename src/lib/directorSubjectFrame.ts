import type { CSSProperties } from 'react';
import type { DirectorSubjectFrameShape } from '../canvas/nodeTypes';

export const DEFAULT_DIRECTOR_SUBJECT_FRAME_SHAPE: DirectorSubjectFrameShape = 'arch';

export const DIRECTOR_SUBJECT_FRAME_SHAPES = [
  'arch',
  'rounded',
  'oval',
  'hexagon',
  'shield',
  'human',
] as const satisfies readonly DirectorSubjectFrameShape[];

const DIRECTOR_SUBJECT_FRAME_SHAPE_SET = new Set<string>(DIRECTOR_SUBJECT_FRAME_SHAPES);

export function normalizeDirectorSubjectFrameShape(value: unknown): DirectorSubjectFrameShape {
  return typeof value === 'string' && DIRECTOR_SUBJECT_FRAME_SHAPE_SET.has(value)
    ? (value as DirectorSubjectFrameShape)
    : DEFAULT_DIRECTOR_SUBJECT_FRAME_SHAPE;
}

export function directorSubjectFrameStyle(value: unknown): CSSProperties {
  const shape = normalizeDirectorSubjectFrameShape(value);
  switch (shape) {
    case 'rounded':
      return { borderRadius: '18%' };
    case 'oval':
      return { borderRadius: '999px' };
    case 'hexagon':
      return { clipPath: 'polygon(50% 0, 100% 18%, 100% 82%, 50% 100%, 0 82%, 0 18%)' };
    case 'shield':
      return {
        clipPath: 'polygon(12% 0, 88% 0, 100% 14%, 100% 70%, 50% 100%, 0 70%, 0 14%)',
      };
    case 'human':
      return {
        clipPath:
          'polygon(38% 0, 62% 0, 70% 4%, 76% 12%, 78% 23%, 76% 33%, 70% 40%, 62% 45%, 64% 50%, 82% 55%, 94% 65%, 100% 100%, 0 100%, 6% 65%, 18% 55%, 36% 50%, 38% 45%, 30% 40%, 24% 33%, 22% 23%, 24% 12%, 30% 4%)',
      };
    case 'arch':
    default:
      return { borderRadius: '50% 50% 12% 12%' };
  }
}
