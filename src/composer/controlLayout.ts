import type { ComposerControlType } from '../graph/types';

const HEADER_CONTROLS = new Set<ComposerControlType>([
  'references',
  'marks',
  'style',
  'effects',
  'character',
  'startFrame',
  'endFrame',
  'motion',
  'camera',
  'context',
]);

export function isComposerHeaderControl(control: ComposerControlType): boolean {
  return HEADER_CONTROLS.has(control);
}

export function isComposerFooterControl(control: ComposerControlType): boolean {
  return !HEADER_CONTROLS.has(control) && control !== 'prompt';
}
