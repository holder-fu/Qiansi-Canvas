import { describe, expect, it } from 'vitest';
import actionBarSource from './VideoNodeActionBar.tsx?raw';
import {
  hasReadyVideoOperation,
  resolveVideoToolAction,
  shouldShowVideoNodeActionBar,
} from './videoToolState';

describe('video node action-bar state', () => {
  it('shows AI tools only for explicit ready-model operations', () => {
    expect(hasReadyVideoOperation([{}], 'enhance')).toBe(false);
    expect(hasReadyVideoOperation([{ videoOperations: [] }], 'enhance')).toBe(false);
    expect(hasReadyVideoOperation([{ videoOperations: ['enhance'] }], 'enhance')).toBe(true);
    expect(hasReadyVideoOperation([{ videoOperations: ['enhance'] }], 'extend')).toBe(false);
  });

  it('keeps workflow-backed video tools highlighted', () => {
    expect(resolveVideoToolAction('enhance')).toBe('enhance');
    expect(resolveVideoToolAction('remake')).toBe('remake');
    expect(resolveVideoToolAction('extend')).toBe('extend');
  });

  it('offers video-to-animated-image as a first-class draggable tool', () => {
    expect(actionBarSource).toContain("{ id: 'animated-image', label: '转动态图', icon: Images }");
    expect(actionBarSource).toContain("'animated-image',");
    expect(actionBarSource).toContain('t(`node.video.${tool.id}`, tool.label)');
  });

  it('ignores video workflow modes that do not have a direct toolbar button', () => {
    expect(resolveVideoToolAction('subtitle-removal')).toBeNull();
    expect(resolveVideoToolAction(null)).toBeNull();
  });

  it('hides the editing toolbar for selected effect video assets', () => {
    expect(
      shouldShowVideoNodeActionBar({
        selected: true,
        isVideoNode: true,
        hasVideoSource: true,
        isEffectAsset: true,
      }),
    ).toBe(false);

    expect(
      shouldShowVideoNodeActionBar({
        selected: true,
        isVideoNode: true,
        hasVideoSource: true,
        isEffectAsset: false,
      }),
    ).toBe(true);
  });

  it('replaces the mask-painting entry with the always-available segment remake workflow', () => {
    expect(actionBarSource).toContain("{ id: 'remake', label: '片段重拍', icon: RotateCcw }");
    expect(actionBarSource).not.toContain("'mask-repair'");
    expect(actionBarSource).not.toContain('onMaskRepair');
    expect(actionBarSource).toContain(
      "(tool.id === 'enhance' || tool.id === 'extend') && !supportsOperation(tool.id)",
    );
  });

  it('lets video action icons inherit the color of their surrounding text', () => {
    const actionIconTags =
      actionBarSource.match(
        /<(?:Icon|OptionIcon|ActionIcon|ChevronDown|Music2|Check|WandSparkles|MoreHorizontal)\b[^>]*\/>/g,
      ) ?? [];

    expect(actionIconTags.length).toBeGreaterThan(0);
    expect(actionIconTags.filter((tag) => /\btext-/.test(tag))).toEqual([]);
  });
});
