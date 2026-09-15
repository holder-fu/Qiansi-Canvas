import { describe, expect, it } from 'vitest';
import source from './ImageNode.tsx?raw';

describe('ImageNode Bridge-only media persistence', () => {
  it('never writes newly uploaded or edited videos into the legacy browser media store', () => {
    expect(source).not.toContain('saveAssetVideo');
    expect(source).not.toContain('persistedInBrowser');
    expect(source).not.toContain('savedBrowserSyncing');
    expect(source).not.toContain('savedBrowser');
  });

  it('publishes original, preview and asset identity from the same successful Bridge result', () => {
    expect(source).toContain('originalUrl: bridgeItem.originalUrl');
    expect(source).toContain('previewUrl: bridgeItem.previewUrl');
    expect(source).toContain('bridgeAssetId: bridgeItem.bridgeAssetId');
    expect(source).toContain('videoUrl: bridgeItem.originalUrl');
    expect(source).toContain('videos: [bridgeItem.originalUrl]');
    expect(source).toContain('output: bridgeItem.originalUrl');
  });

  it('keeps a failed upload explicitly session-only and prevents stale completion overwrites', () => {
    expect(source).toContain('mediaUploadOperationRef.current !== operationId');
    expect(source).toContain('current?.data.videoUrl !== sessionVideoUrl');
    expect(source).toContain('刷新页面后会丢失；请启动本机 Bridge 后重新上传');
    expect(source).toContain('assetVideoId: undefined');
    expect(source).toContain('bridgeAssetId: undefined');
  });

  it('promotes every active copied node that still shares an in-flight session video', () => {
    expect(source).toContain('const updateNodesSharingSessionVideo = useCallback');
    expect(source).toContain('node.data.videoUrl === sessionUrl');
    expect(source).toContain(
      'for (const target of targets) store.updateNodeData(target.id, patch)',
    );
    expect(source).toContain('for (const nodeId of updatedNodeIds)');
    expect(source).not.toContain('URL.revokeObjectURL(sessionVideoUrl)');
    expect(source).not.toContain('URL.revokeObjectURL(sessionUrl)');
  });

  it('renders an honest re-upload state after a session-only image or video is restored', () => {
    expect(source).toContain("data.mediaPersistenceState === 'session-only'");
    expect(source).toContain('上次会话中的媒体无法在刷新后恢复，请重新上传原文件。');
  });

  it('loads mounted canvas previews eagerly because React Flow already virtualizes offscreen nodes', () => {
    expect(source).toContain('loading="eager"');
    expect(source).not.toContain("loading={useOriginalImage ? 'eager' : 'lazy'}");
  });
});
