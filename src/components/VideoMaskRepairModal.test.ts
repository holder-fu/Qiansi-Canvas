import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import source from './VideoMaskRepairModal.tsx?raw';

describe('VideoMaskRepairModal contract', () => {
  it('persists a binary keyframe mask before creating the native canvas task', () => {
    expect(source).toContain("openModal === 'video-mask-repair'");
    expect(source).toContain('data-video-mask-surface="true"');
    expect(source).toContain("persistImageFile(file, 'storyboard', activeProjectId)");
    expect(source).toContain('maskImage: persisted.originalUrl');
    expect(source).toContain('maskPreview: persisted.previewUrl');
    expect(source).toContain('createVideoMaskRepair(');
    expect(source).toContain("tracking: 'provider'");
  });

  it('guides users through frame selection, painting and a repair instruction', () => {
    expect(source).toContain('onTimeUpdate=');
    expect(source).toContain("t('videoMaskRepair.guide'");
    expect(source).toContain('suggestVideoMaskRepairRange');
    expect(source).toContain("t('videoMaskRepair.keyframe.title'");
    expect(source).toContain("t('videoMaskRepair.paint.title'");
    expect(source).toContain("t('videoMaskRepair.prompt.title'");
    expect(source).toContain("t('videoMaskRepair.range.advanced'");
    expect(source).toContain('<details');
    expect(source).toContain('setRangeStart(currentTime)');
    expect(source).toContain('setRangeEnd(currentTime)');
    expect(source).toContain("setPaintTool('brush')");
    expect(source).toContain("setPaintTool('eraser')");
    expect(source).toContain('!isAtKeyframe || busy');
    expect(source).toContain("includes('masked-repair')");
    expect(source).toContain("t('videoMaskRepair.model.details'");
    expect(source).toContain("t('videoMaskRepair.status.noPrompt'");
    expect(source).toContain('!prompt.trim()');
    expect(source).toContain("t('videoMaskRepair.saveDraft', '保存修复草稿')");
  });

  it('does not scan the complete mask canvas on every pointer move', () => {
    const pointerMoveBody = source.slice(
      source.indexOf('const moveMaskStroke'),
      source.indexOf('const endMaskStroke'),
    );
    expect(pointerMoveBody).not.toContain('getImageData');
    expect(pointerMoveBody).not.toContain('setHasMask');
  });

  it('keeps every explicit text size at the 12px canvas minimum', () => {
    expect(source).not.toMatch(/text-\[(?:8|9|10|11)px\]/);
  });

  it('is retained only for legacy-source compatibility and is not mounted by the app', () => {
    expect(appSource).not.toContain("import('./components/VideoMaskRepairModal')");
    expect(appSource).not.toContain("shouldMount('video-mask-repair')");
  });
});
