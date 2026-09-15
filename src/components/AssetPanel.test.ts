import { describe, expect, it } from 'vitest';
import source from './AssetPanel.tsx?raw';

describe('Asset panel categories', () => {
  it('shows the retained global asset library without a project-source filter', () => {
    expect(source).toContain("t('asset.globalLibraryTitle', '全局资产库')");
    expect(source).toContain('const filtered = assets.filter');
    expect(source).toContain('const counts = assetCounts(assets)');
    expect(source).not.toContain('data-asset-scope');
    expect(source).not.toContain('asset.scope.current');
    expect(source).not.toContain('projectName');
  });

  it('keeps aligned tabs while grouping each count next to its category label', () => {
    expect(source).toContain('data-asset-category-tab={cat}');
    expect(source).toContain('flex items-center justify-center rounded-lg');
    expect(source).toContain(
      'inline-grid max-w-full grid-cols-[16px_auto_20px] items-center gap-1',
    );
    expect(source).not.toContain('grid-cols-[16px_minmax(0,1fr)_20px]');
    expect(source).toContain('flex h-4 w-4 items-center justify-center');
    expect(source).toContain('truncate text-left');
    expect(source).toContain('inline-flex h-4 min-w-5 items-center justify-center rounded-full');
  });

  it('promotes every active video/audio copy and never revokes a store-owned session URL', () => {
    expect(source).toContain('function updateNodesSharingSessionMedia(');
    expect(source).toContain('nodeReferencesSessionMedia(node, kind, sessionUrl)');
    expect(source).toContain('for (const nodeId of targetIds) store.updateNodeData(nodeId, patch)');
    expect(source).toContain("mediaPersistenceState: 'session-only'");
    expect(source).not.toContain('URL.revokeObjectURL(sessionUrl)');
  });

  it('disables restored empty session assets and explains that the original must be uploaded again', () => {
    expect(source).toContain('assetSessionMediaUnavailable(asset)');
    expect(source).toContain("data-session-media-state={sessionMediaUnavailable ? 'unavailable'");
    expect(source).toContain('disabled={sessionMediaUnavailable}');
    expect(source).toContain('此素材只存在于上一次会话中，请重新上传原文件。');
    expect(source).toContain('媒体已失效 · 需重新上传');
  });

  it('classifies uploads before creating nodes and shows unsupported-file failures in the panel', () => {
    expect(source).toContain('classifyAssetUploadFile(selectedFile)');
    expect(source).toContain('withDetectedAssetUploadMime(selectedFile, descriptor)');
    expect(source).toContain('isDirectorModelUploadFile(selectedFile)');
    expect(source).toContain('导入 VRM / GLB / FBX');
    expect(source).toContain('data-asset-upload-error');
    expect(source).not.toContain("file.type.startsWith('video/')");
  });

  it('resolves video posters through the active Bridge with an error fallback', () => {
    expect(source).toContain('function AssetVideoPreview');
    expect(source).toContain("mediaPreviewUrl(source, 'video')");
    expect(source).toContain('.map(resolveMediaSourceUrl)');
    expect(source).toContain('onError={() => setCandidateIndex((index) => index + 1)}');
    expect(source).not.toContain('src={asset.previewUrl ||');
  });
});
