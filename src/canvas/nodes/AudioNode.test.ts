import { describe, expect, it } from 'vitest';
import assetPanelSource from '../../components/AssetPanel.tsx?raw';
import audioNodeSource from './AudioNode.tsx?raw';

describe('audio playback source wiring', () => {
  it('accepts browser-labeled video/webm only after confirming an audio-only track table', () => {
    expect(audioNodeSource).toContain('AUDIO_FILE_SIGNATURE_SCAN_BYTES');
    expect(audioNodeSource).toContain("declaredMime === 'video/webm'");
    expect(audioNodeSource).toContain('accepted = isAudioOnlyWebmFile(signatureBytes)');
    expect(audioNodeSource).toContain('accept="audio/*,.weba,.webm"');
    expect(audioNodeSource).not.toContain("!file.type.startsWith('audio/')");
  });

  it('uses the resolved runtime URL for node playback and download', () => {
    expect(audioNodeSource).toContain('const playbackUrl = resolvedAudioSource(data)');
    expect(audioNodeSource).toContain('anchor.href = playbackUrl');
    expect(audioNodeSource).toContain('src={playbackUrl}');
    expect(audioNodeSource).toContain('resolvedAudioSource(asset) === playbackUrl');
    expect(audioNodeSource).not.toContain('anchor.href = audioUrl');
  });

  it('recovers finite WebM duration metadata and exposes a safe playback reload', () => {
    expect(audioNodeSource).toContain('void resolveMediaDuration(media).then((duration) => {');
    expect(audioNodeSource).toContain('requestId !== durationResolutionRequestRef.current');
    expect(audioNodeSource).toContain('playbackRef.current !== media');
    expect(audioNodeSource).toContain('media.currentSrc !== sourceAtMetadata');
    expect(audioNodeSource).toContain('onLoadStart={() => {');
    expect(audioNodeSource).toContain('audio.load()');
    expect(audioNodeSource).toContain("t('node.audio.retryPlayback', '重试播放')");
  });

  it('does not let a replaced session recording fall back to the previous bridge asset', () => {
    expect(audioNodeSource).toContain('bridgeAssetId: undefined');
    expect(audioNodeSource).toContain('audioSourceState: undefined');
    expect(audioNodeSource).toContain('mediaPersistenceState: undefined');
    expect(audioNodeSource).toContain('audioFileName: file.name');
  });

  it('promotes active copied nodes without revoking a URL still held by history or clipboard', () => {
    expect(audioNodeSource).toContain('const updateNodesSharingSessionAudio = useCallback');
    expect(audioNodeSource).toContain('node.data.audioUrl === sessionUrl');
    expect(audioNodeSource).toContain('node.data.audios?.includes(sessionUrl) === true');
    expect(audioNodeSource).toContain(
      'for (const target of targets) store.updateNodeData(target.id, patch)',
    );
    expect(audioNodeSource).toContain('for (const nodeId of updatedNodeIds)');
    expect(audioNodeSource).not.toContain('URL.revokeObjectURL(sessionUrl)');
  });

  it('presents restored session-only audio as unavailable until the user replaces it', () => {
    expect(audioNodeSource).toContain("data.audioSourceState === 'unavailable-after-restore'");
    expect(audioNodeSource).toContain("t(\n    'node.audio.error.sessionExpired'");
    expect(audioNodeSource).toContain('{playbackUrl && (');
  });

  it('offers the shared query-only recovery action for an interrupted generation', () => {
    expect(audioNodeSource).toContain('interruptedGenerationRequestId');
    expect(audioNodeSource).toContain('recoverNodeGenerationResult(id)');
    expect(audioNodeSource).toContain('<GenerationRecoveryButton');
    expect(audioNodeSource).toContain("t('imageNode.recovery.check', '检查生成结果')");
  });

  it('lets an empty audio node choose a durable audio item from the asset library', () => {
    expect(audioNodeSource).toContain("assets.filter((asset) => asset.kind === 'audio')");
    expect(audioNodeSource).toContain("t('node.audio.asset.choose', '从资产库中')");
    expect(audioNodeSource).toContain('const handleSelectAssetAudio = useCallback');
    expect(audioNodeSource).toContain('assetSessionMediaUnavailable(asset)');
    expect(audioNodeSource).toContain('audioUrl: asset.audioUrl');
    expect(audioNodeSource).toContain('bridgeAssetId: asset.bridgeAssetId');
    expect(audioNodeSource).toContain('output: source');
    expect(audioNodeSource).toContain('useCanvasStore.getState().propagate(id)');
  });

  it('keeps empty-state audio action labels on one line without squeezing the buttons', () => {
    expect(audioNodeSource).toContain('className="mt-2.5 flex flex-wrap gap-1.5"');
    expect(audioNodeSource.match(/shrink-0 items-center gap-1\.5 whitespace-nowrap/g)).toHaveLength(
      3,
    );
  });

  it('renders the compact waveform player and exposes the contextual toolbar only on selection', () => {
    expect(audioNodeSource).toContain('<AudioNodeActionBar');
    expect(audioNodeSource).toContain('showSingleNodeControls && playbackUrl');
    expect(audioNodeSource).toContain('waveformBars.map((level, index) =>');
    expect(audioNodeSource).toContain('onPointerDown={handleWaveformPointerDown}');
    expect(audioNodeSource).toContain('onPointerMove={handleWaveformPointerMove}');
    expect(audioNodeSource).toContain('onPointerUp={finishTrimSelection}');
    expect(audioNodeSource).toContain('onTimeUpdate={(event) => {');
    expect(audioNodeSource).toContain('onClick={handleTogglePlayback}');
    expect(audioNodeSource).not.toContain('controls\n                preload="metadata"');
  });

  it('uses the waveform as a node drag surface while keeping the red playhead independently draggable', () => {
    expect(audioNodeSource).toContain("? 'nodrag nopan cursor-crosshair");
    expect(audioNodeSource).toContain(": 'cursor-grab active:cursor-grabbing'");
    expect(audioNodeSource).toContain('suppressWaveformClickRef.current = moved');
    expect(audioNodeSource).toContain('onClick={handleWaveformClick}');
    expect(audioNodeSource).toContain('onPointerDown={handlePlaybackHeadPointerDown}');
    expect(audioNodeSource).toContain('onPointerMove={handlePlaybackHeadPointerMove}');
    expect(audioNodeSource).toContain('onPointerUp={finishPlaybackHeadDrag}');
    expect(audioNodeSource).toContain(
      "ownerWindow.addEventListener('pointermove', handlePointerMove, true)",
    );
    expect(audioNodeSource).toContain('playbackHeadDragCleanupRef.current?.()');
    expect(audioNodeSource).toContain('role="slider"');
    expect(audioNodeSource).toContain('aria-valuenow={playbackSeconds}');
    expect(audioNodeSource).toContain("t('node.audio.playhead', '拖动红色播放头定位播放位置')");
  });

  it('keeps the trim range synchronized with independently draggable waveform handles', () => {
    expect(audioNodeSource).toContain('trimDragBoundary');
    expect(audioNodeSource).toContain("handleTrimBoundaryPointerDown(event, 'start')");
    expect(audioNodeSource).toContain("handleTrimBoundaryPointerDown(event, 'end')");
    expect(audioNodeSource).toContain("handleTrimBoundaryKeyDown(event, 'start')");
    expect(audioNodeSource).toContain("handleTrimBoundaryKeyDown(event, 'end')");
    expect(audioNodeSource).toContain('onTrimBoundaryChange={handleTrimBoundaryChange}');
  });

  it('generates durable trimmed and speed-adjusted audio without split tools', () => {
    expect(audioNodeSource).toContain('renderEditedAudioFile(');
    expect(audioNodeSource).toContain("'trim'");
    expect(audioNodeSource).toContain("'speed'");
    expect(audioNodeSource).toContain(
      'await persistAudioFile(edited.file, edited.durationSeconds)',
    );
    expect(audioNodeSource).toContain('audioPlaybackRate: 1');
    expect(audioNodeSource).not.toContain('handleSmartSplit');
    expect(audioNodeSource).not.toContain('handleCustomSplitMode');
    expect(audioNodeSource).not.toContain("activeToolMode === 'custom-split'");
  });

  it('puts replacement, recording and asset-library actions in the selected-node toolbar', () => {
    expect(audioNodeSource).toContain('onReplaceAudio={() =>');
    expect(audioNodeSource).toContain('onChooseAssetAudio={() =>');
    expect(audioNodeSource).toContain('onRecordAgain={() =>');
    expect(audioNodeSource).not.toContain('sourceMenuOpen');
    expect(audioNodeSource).not.toContain("t('node.audio.sourceMenu', '更换音频来源')");
  });

  it('keeps audio-to-video as a direct node action after removing the source popup', () => {
    expect(audioNodeSource).toContain("t('node.audio.createVideo', '音频生视频')");
    expect(audioNodeSource).toContain('createVideoFromAudio(id)');
    expect(audioNodeSource).toContain('<PlaySquare className="h-4 w-4" />');
  });

  it('resolves persisted audio before rendering an asset-library player', () => {
    expect(assetPanelSource).toContain("asset.kind === 'audio' ? resolvedAudioSource(asset)");
    expect(assetPanelSource).toContain('const playbackUrl = assetAudioPlaybackUrl(asset)');
    expect(assetPanelSource).toContain('src={playbackUrl}');
    expect(assetPanelSource).toContain("playbackUrl ? 'available' : 'unavailable'");
  });
});
