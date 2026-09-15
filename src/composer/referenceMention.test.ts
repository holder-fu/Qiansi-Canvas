import { describe, expect, it } from 'vitest';
import type { ComposerReference } from './types';
import {
  referenceMentionOptions,
  referenceMentionQuery,
  referenceMentionTone,
  referenceMentionToken,
  referenceMentionVideoMode,
} from './referenceMention';

const heroReference: ComposerReference = {
  id: 'hero',
  type: 'image',
  url: 'hero.png',
  label: '主角',
};
const voiceReference: ComposerReference = {
  id: 'voice',
  type: 'audio',
  url: 'voice.mp3',
  label: '对白',
};
const motionReference: ComposerReference = {
  id: 'motion',
  type: 'video',
  url: 'motion.mp4',
  label: '动作参考',
};
const roomReference: ComposerReference = {
  id: 'room',
  type: 'image',
  url: 'room.png',
  label: '教室',
};
const references = [heroReference, voiceReference, motionReference, roomReference];

describe('referenceMentionQuery', () => {
  it('recognizes the active @ query immediately before the caret', () => {
    expect(referenceMentionQuery('人物面向@')).toBe('');
    expect(referenceMentionQuery('人物面向@主角')).toBe('主角');
    expect(referenceMentionQuery('人物面向 @图片2')).toBe('图片2');
  });

  it('does not activate after whitespace or another completed token', () => {
    expect(referenceMentionQuery('人物面向@主角 走向黑板')).toBeNull();
    expect(referenceMentionQuery('没有引用')).toBeNull();
  });
});

describe('referenceMentionOptions', () => {
  it('lists image, video and audio references and keeps their original reference number', () => {
    expect(referenceMentionOptions(references, '')).toMatchObject([
      { referenceIndex: 0, token: '@图片1' },
      { referenceIndex: 1, token: '@音频2' },
      { referenceIndex: 2, token: '@视频3' },
      { referenceIndex: 3, token: '@图片4' },
    ]);
  });

  it('filters by reference label or numbered token', () => {
    expect(referenceMentionOptions(references, '教室')).toMatchObject([
      { referenceIndex: 3, token: '@图片4' },
    ]);
    expect(referenceMentionOptions(references, '图片1')).toMatchObject([
      { referenceIndex: 0, token: '@图片1' },
    ]);
  });

  it('filters video mentions by label or numbered token', () => {
    expect(referenceMentionOptions(references, '动作')).toMatchObject([
      { referenceIndex: 2, token: '@视频3' },
    ]);
    expect(referenceMentionOptions(references, '视频3')).toMatchObject([
      { referenceIndex: 2, token: '@视频3' },
    ]);
  });

  it('filters audio mentions by label or numbered token', () => {
    expect(referenceMentionOptions(references, '对白')).toMatchObject([
      { referenceIndex: 1, token: '@音频2' },
    ]);
    expect(referenceMentionOptions(references, '音频2')).toMatchObject([
      { referenceIndex: 1, token: '@音频2' },
    ]);
  });
});

describe('reference mention behavior', () => {
  it('creates media-specific tokens', () => {
    expect(referenceMentionToken(heroReference, 0)).toBe('@图片1');
    expect(referenceMentionToken(motionReference, 2)).toBe('@视频3');
    expect(referenceMentionToken(voiceReference, 1)).toBe('@音频2');
  });

  it('uses distinct comfortable colors for each media mention', () => {
    expect(referenceMentionTone('image')).toMatchObject({ text: 'text-sky-300' });
    expect(referenceMentionTone('video')).toMatchObject({ text: 'text-violet-300' });
    expect(referenceMentionTone('audio')).toMatchObject({ text: 'text-emerald-300' });
  });

  it('switches ordinary video generation to omni reference for a mentioned video', () => {
    expect(referenceMentionVideoMode(motionReference, 'video')).toBe('全能参考');
    expect(referenceMentionVideoMode(motionReference, 'video', 'remake')).toBeUndefined();
    expect(referenceMentionVideoMode(heroReference, 'video')).toBeUndefined();
  });
});
