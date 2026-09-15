import { describe, expect, it } from 'vitest';
import actionBarSource from './AudioNodeActionBar.tsx?raw';

describe('audio node contextual action bar', () => {
  it('keeps editing, source and download actions directly in the selected-node toolbar', () => {
    expect(actionBarSource).toContain('<NodeToolbar');
    expect(actionBarSource).toContain('position={Position.Top}');
    expect(actionBarSource).toContain("t('node.audio.toolbar.trim', '截取')");
    expect(actionBarSource).toContain("t('node.audio.toolbar.speed', '变速')");
    expect(actionBarSource).toContain("t('node.audio.download', '下载音频')");
    expect(actionBarSource).toContain("t('node.audio.replace', '替换音频')");
    expect(actionBarSource).toContain("t('node.audio.asset.choose', '从资产库中')");
    expect(actionBarSource).toContain("t('node.audio.recorder.recordAgain', '重新录制')");
    expect(actionBarSource).toContain('data-audio-node-action-bar');
    expect(actionBarSource).not.toContain('智能切分');
    expect(actionBarSource).not.toContain('自定义切分');
    expect(actionBarSource).not.toContain('smart-split');
    expect(actionBarSource).not.toContain('custom-split');
  });

  it('opens reference-style bottom controls for trim and speed', () => {
    expect(actionBarSource).toContain('position={Position.Bottom}');
    expect(actionBarSource).toContain("t('node.audio.trim.generate', '生成')");
    expect(actionBarSource).toContain('type="range"');
    expect(actionBarSource).toContain('min={AUDIO_EDIT_RATE_MIN}');
    expect(actionBarSource).toContain('max={AUDIO_EDIT_RATE_MAX}');
    expect(actionBarSource).toContain('value={speed.toFixed(2)}');
    expect(actionBarSource).toContain('<ArrowUp');
  });

  it('offers precise start and end inputs for the trim range', () => {
    expect(actionBarSource).toContain("onTrimBoundaryChange('start', value)");
    expect(actionBarSource).toContain("onTrimBoundaryChange('end', value)");
    expect(actionBarSource.match(/step=\{0\.01\}/g)).toHaveLength(2);
    expect(actionBarSource).toContain('value={trimStart.toFixed(2)}');
    expect(actionBarSource).toContain('value={trimEnd.toFixed(2)}');
  });

  it('stops toolbar pointer events from dragging or panning the canvas', () => {
    expect(actionBarSource).toContain('className="nodrag nopan pointer-events-auto z-[70]"');
    expect(actionBarSource).toContain('const stopCanvasInteraction =');
    expect(actionBarSource).toContain('onPointerDown={stopCanvasInteraction}');
    expect(actionBarSource).toContain('onClick={stopCanvasInteraction}');
  });

  it('keeps every direct action in one non-wrapping toolbar row instead of a popup menu', () => {
    expect(actionBarSource).toContain('const sourceTools = [');
    expect(actionBarSource).toContain('onReplaceAudio');
    expect(actionBarSource).toContain('onChooseAssetAudio');
    expect(actionBarSource).toContain('onRecordAgain');
    expect(actionBarSource).toContain('flex h-11 w-max');
    expect(actionBarSource).toContain('overflow-x-auto');
    expect(actionBarSource).not.toContain('flex-col');
    expect(actionBarSource).not.toContain('border-t border-white/[0.08]');
    expect(actionBarSource).not.toContain('aria-expanded');
  });

  it('places the download icon after every source action', () => {
    expect(actionBarSource.indexOf('sourceTools.map')).toBeLessThan(
      actionBarSource.indexOf('onClick={onDownload}'),
    );
  });
});
