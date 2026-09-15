import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore, type NodeProps } from '@xyflow/react';
import {
  Check,
  Library,
  Loader2,
  Mic,
  Music2,
  Pause,
  Play,
  PlaySquare,
  RotateCcw,
  Square,
  Upload,
  X,
} from 'lucide-react';
import type { FlowNode } from '../nodeTypes';
import {
  assetSessionMediaUnavailable,
  useCanvasStore,
  type AssetItem,
} from '../../store/canvasStore';
import { NodePorts } from './NodePorts';
import { GenerationRecoveryButton } from './GenerationRecoveryButton';
import { uploadAssetFile } from '../../services/assetLibrary';
import { AiSkillNodeDragHandle } from './AiSkillNodeDragHandle';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import {
  AUDIO_NODE_HEIGHT,
  AUDIO_NODE_WIDTH,
  audioRecordingAvailability,
  createAudioWaveformBars,
  createAudioRecordingFile,
  formatAudioDuration,
  hasAudibleInput,
  preferredAudioRecordingMimeType,
} from '../../lib/audioNode';
import {
  AUDIO_TRIM_MIN_DURATION_SECONDS,
  AudioEditingError,
  clampAudioEditRate,
  moveAudioTrimBoundary,
  renderEditedAudioFile,
  type AudioTrimBoundary,
} from '../../lib/audioEditing';
import { useAppTranslation } from '../../i18n/appI18n';
import { getNodeDisplayTitle } from '../../i18n/nodeI18n';
import { resolveMediaDuration } from '../../lib/mediaDuration';
import { resolvedAudioSource } from '../../lib/mediaPreview';
import {
  AUDIO_FILE_SIGNATURE_SCAN_BYTES,
  isAudioOnlyWebmFile,
} from '../../../audio-file-format.mjs';
import { useSingleNodeControls } from './nodeSelectionState';
import { AudioNodeActionBar, type AudioToolMode } from './AudioNodeActionBar';
import { appendComposerReference } from '../../composer/assetReference';
import { pickableCanvasMediaReference } from '../../composer/canvasReferencePicker';

type RecordingState = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview';
const AUDIO_PLAYBACK_ERROR_FALLBACK = '音频无法播放，文件可能损坏或格式不受支持。';

function AudioNodeBase({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useAppTranslation();
  const showSingleNodeControls = useSingleNodeControls(selected);
  const zoom = useStore((state) => state.transform[2]);
  const nodeRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playbackRef = useRef<HTMLAudioElement>(null);
  const playbackHeadPointerRef = useRef<number | null>(null);
  const playbackHeadDragCleanupRef = useRef<(() => void) | null>(null);
  const waveformDragCleanupRef = useRef<(() => void) | null>(null);
  const suppressWaveformClickRef = useRef(false);
  const durationResolutionRequestRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingFailedRef = useRef(false);
  const recordingLastResumedAtRef = useRef(0);
  const recordingElapsedMsRef = useRef(0);
  const recordingPeakLevelRef = useRef(0);
  const permissionRequestRef = useRef(0);
  const uploadOperationRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const levelFrameRef = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recorderError, setRecorderError] = useState('');
  const [activeMicrophone, setActiveMicrophone] = useState('');
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeToolMode, setActiveToolMode] = useState<AudioToolMode>(null);
  const [trimAnchor, setTrimAnchor] = useState<number | null>(null);
  const [trimDragBoundary, setTrimDragBoundary] = useState<AudioTrimBoundary | null>(null);
  const [trimDraft, setTrimDraft] = useState({ start: 0, end: 0 });
  const [speedDraft, setSpeedDraft] = useState(1);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [checkingGenerationResult, setCheckingGenerationResult] = useState(false);
  const requestDeleteNode = useCanvasStore((state) => state.requestDeleteNode);
  const referencePickerTargetId = useCanvasStore((state) => state.referencePickerTargetId);
  const setReferencePickerTargetId = useCanvasStore((state) => state.setReferencePickerTargetId);
  const createVideoFromAudio = useCanvasStore((state) => state.createVideoFromAudio);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const recoverNodeGenerationResult = useCanvasStore((state) => state.recoverNodeGenerationResult);
  const saveAsset = useCanvasStore((state) => state.saveAsset);
  const assets = useCanvasStore((state) => state.assets);
  const audioAssets = assets.filter((asset) => asset.kind === 'audio');
  const playbackUrl = resolvedAudioSource(data);
  const pickableReference = useMemo(() => pickableCanvasMediaReference({ id, data }), [data, id]);
  const canPickAsReference = Boolean(
    referencePickerTargetId && referencePickerTargetId !== id && pickableReference,
  );
  const playbackRate =
    Number.isFinite(Number(data.audioPlaybackRate)) && Number(data.audioPlaybackRate) > 0
      ? Number(data.audioPlaybackRate)
      : 1;
  const resolvedDuration =
    Number.isFinite(Number(data.durationSeconds)) && Number(data.durationSeconds) > 0
      ? Number(data.durationSeconds)
      : 0;
  const waveformBars = useMemo(
    () =>
      createAudioWaveformBars(
        `${String(data.audioFileName || data.title || id)}:${resolvedDuration}`,
      ),
    [data.audioFileName, data.title, id, resolvedDuration],
  );
  const trimStart =
    typeof data.audioTrimStart === 'number' && Number.isFinite(data.audioTrimStart)
      ? Math.max(0, data.audioTrimStart)
      : 0;
  const trimEnd =
    typeof data.audioTrimEnd === 'number' &&
    Number.isFinite(data.audioTrimEnd) &&
    data.audioTrimEnd > trimStart
      ? Math.min(resolvedDuration || data.audioTrimEnd, data.audioTrimEnd)
      : resolvedDuration;
  const previewPlaybackRate = activeToolMode === 'speed' ? speedDraft : playbackRate;
  const playbackRangeStart = activeToolMode === 'trim' ? trimDraft.start : 0;
  const playbackRangeEnd =
    activeToolMode === 'trim' && trimDraft.end > trimDraft.start ? trimDraft.end : resolvedDuration;
  const displayTitle = getNodeDisplayTitle('audio', data.title, t);
  const audioPlaybackErrorMessage = t('node.audio.error.playback', AUDIO_PLAYBACK_ERROR_FALLBACK);
  const restoredAudioUnavailable = data.audioSourceState === 'unavailable-after-restore';
  const interruptedGenerationRequestId =
    typeof data.generationRequestId === 'string' && data.generationRequestId.trim()
      ? data.generationRequestId
      : undefined;
  const restoredAudioUnavailableMessage = t(
    'node.audio.error.sessionExpired',
    '这段音频仅保存在上一次浏览器会话中，原始文件引用已经失效。请重新上传音频或重新录制。',
  );
  const savedToAssetLibrary = useCanvasStore((state) =>
    state.assets.some(
      (asset) => Boolean(playbackUrl) && resolvedAudioSource(asset) === playbackUrl,
    ),
  );

  useEffect(() => {
    if (!showSingleNodeControls) {
      setActiveToolMode(null);
      setTrimAnchor(null);
      setTrimDragBoundary(null);
    }
  }, [showSingleNodeControls]);

  useEffect(() => {
    setActiveToolMode(null);
    setTrimAnchor(null);
    setTrimDraft({ start: 0, end: 0 });
    setSpeedDraft(1);
  }, [playbackUrl]);

  useEffect(() => {
    const audio = playbackRef.current;
    if (audio) audio.playbackRate = previewPlaybackRate;
  }, [playbackUrl, previewPlaybackRate]);

  useEffect(
    () => () => {
      playbackHeadDragCleanupRef.current?.();
      waveformDragCleanupRef.current?.();
    },
    [],
  );

  const updateNodesSharingSessionAudio = useCallback(
    (sessionUrl: string, patch: Partial<FlowNode['data']>): string[] => {
      const store = useCanvasStore.getState();
      const targets = store.nodes.filter(
        (node) =>
          node.data.audioUrl === sessionUrl ||
          node.data.audios?.includes(sessionUrl) === true ||
          node.data.output === sessionUrl,
      );
      for (const target of targets) store.updateNodeData(target.id, patch);
      return targets.map((target) => target.id);
    },
    [],
  );

  const stopRecordingTracks = useCallback(() => {
    if (levelFrameRef.current !== null) cancelAnimationFrame(levelFrameRef.current);
    levelFrameRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setInputLevel(0);
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }, []);

  const startInputMeter = useCallback((stream: MediaStream) => {
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
      const samples = new Uint8Array(analyser.fftSize);
      const update = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        recordingPeakLevelRef.current = Math.max(recordingPeakLevelRef.current, level);
        setInputLevel(level);
        levelFrameRef.current = requestAnimationFrame(update);
      };
      update();
    } catch {
      setInputLevel(0);
    }
  }, []);

  useEffect(() => {
    if (recordingState !== 'recording') return;
    const timer = window.setInterval(() => {
      setRecordingSeconds(
        Math.floor(
          (recordingElapsedMsRef.current + Date.now() - recordingLastResumedAtRef.current) / 1000,
        ),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(
    () => () => {
      uploadOperationRef.current += 1;
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        recorder.stop();
      }
      // Session audio may still be referenced by a copied node or cached
      // workspace. The browser releases it when the page session ends.
      stopRecordingTracks();
    },
    [stopRecordingTracks],
  );

  useEffect(
    () => () => {
      if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl);
    },
    [recordingPreviewUrl],
  );

  useEffect(() => {
    if (!assetPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAssetPickerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [assetPickerOpen]);

  const persistAudioFile = useCallback(
    async (file: File, durationHint?: number) => {
      const operationId = ++uploadOperationRef.current;
      const projectId = useCanvasStore.getState().activeProjectId;
      const sessionUrl = URL.createObjectURL(file);
      setUploading(true);
      updateNodeData(id, {
        audioUrl: sessionUrl,
        audios: [sessionUrl],
        bridgeAssetId: undefined,
        audioSourceState: undefined,
        mediaPersistenceState: undefined,
        mediaMimeType: file.type,
        audioFileName: file.name,
        output: sessionUrl,
        durationSeconds:
          Number.isFinite(durationHint) && Number(durationHint) > 0 ? durationHint : undefined,
        audioPlaybackRate: 1,
        audioTrimStart: undefined,
        audioTrimEnd: undefined,
        audioSplitPoints: undefined,
        generationError: undefined,
        result: t('node.audio.status.savingLocally', '正在把音频保存到本机素材库…'),
      });
      useCanvasStore.getState().propagate(id);
      try {
        const item = await uploadAssetFile(file, 'audio', {
          project: projectId,
        });
        const updatedNodeIds = updateNodesSharingSessionAudio(sessionUrl, {
          audioUrl: item.url,
          audios: [item.url],
          output: item.url,
          bridgeAssetId: item.id,
          mediaPersistenceState: undefined,
          generationError: undefined,
          result: t('node.audio.status.savedLocally', '音频已保存到本机素材库。'),
        });
        if (updatedNodeIds.length === 0) return false;
        for (const nodeId of updatedNodeIds) useCanvasStore.getState().propagate(nodeId);
        return true;
      } catch (error) {
        updateNodesSharingSessionAudio(sessionUrl, {
          mediaPersistenceState: 'session-only',
          generationError:
            error instanceof Error
              ? `${error.message}；音频仅在当前会话可用，刷新页面后会丢失`
              : t(
                  'node.audio.error.localSaveFailed',
                  '本机素材保存失败，音频仅在当前会话可用，刷新页面后会丢失。',
                ),
          result: t(
            'node.audio.status.sessionOnlyBridgeRequired',
            '音频仅在当前会话可用；请启动本机 Bridge 后重新上传。',
          ),
        });
        return false;
      } finally {
        if (uploadOperationRef.current === operationId) setUploading(false);
      }
    },
    [id, t, updateNodeData, updateNodesSharingSessionAudio],
  );

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      requestDeleteNode(id);
    },
    [id, requestDeleteNode],
  );

  const handleReferencePick = useCallback(
    (event: React.MouseEvent) => {
      if (!canPickAsReference || !referencePickerTargetId || !pickableReference) return;
      event.preventDefault();
      event.stopPropagation();
      const target = useCanvasStore
        .getState()
        .nodes.find((node) => node.id === referencePickerTargetId);
      if (!target) return;
      const currentReferences = target.data.composerReferences ?? [];
      const references = appendComposerReference(target.data.composerReferences, pickableReference);
      if (references.length > currentReferences.length) {
        updateNodeData(referencePickerTargetId, { composerReferences: references });
      }
      setReferencePickerTargetId(null);
    },
    [
      canPickAsReference,
      pickableReference,
      referencePickerTargetId,
      setReferencePickerTargetId,
      updateNodeData,
    ],
  );

  const handleSaveAsset = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!playbackUrl || savedToAssetLibrary || data.generating || uploading || processingAudio)
        return;
      saveAsset(id);
    },
    [data.generating, id, playbackUrl, processingAudio, saveAsset, savedToAssetLibrary, uploading],
  );

  const handleSelectAssetAudio = useCallback(
    (asset: AssetItem) => {
      const source = resolvedAudioSource(asset);
      if (!source || assetSessionMediaUnavailable(asset)) return;
      updateNodeData(id, {
        audioUrl: asset.audioUrl,
        audios: asset.audios,
        bridgeAssetId: asset.bridgeAssetId,
        audioSourceState: asset.audioSourceState,
        mediaPersistenceState: asset.mediaPersistenceState,
        mediaMimeType: asset.mediaMimeType,
        audioFileName: asset.audioFileName || asset.title,
        durationSeconds: asset.durationSeconds,
        audioPlaybackRate: 1,
        audioTrimStart: undefined,
        audioTrimEnd: undefined,
        audioSplitPoints: undefined,
        output: source,
        generationError: undefined,
        result: t('node.audio.asset.selected', '已从资产库选择音频。'),
      });
      useCanvasStore.getState().propagate(id);
      setPlaybackError('');
      setAssetPickerOpen(false);
    },
    [id, t, updateNodeData],
  );

  const handleAudioUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;

      const declaredMime = file.type.split(';')[0]?.trim().toLowerCase() || '';
      let accepted = declaredMime.startsWith('audio/');
      if (!accepted && declaredMime === 'video/webm') {
        try {
          const signatureBytes = new Uint8Array(
            await file.slice(0, AUDIO_FILE_SIGNATURE_SCAN_BYTES).arrayBuffer(),
          );
          accepted = isAudioOnlyWebmFile(signatureBytes);
        } catch {
          accepted = false;
        }
      }
      if (!accepted) {
        updateNodeData(id, {
          generationError: t('node.audio.error.invalidFile', '请选择有效的音频文件。'),
        });
        return;
      }
      void persistAudioFile(file);
    },
    [id, persistAudioFile, t, updateNodeData],
  );

  const startRecording = useCallback(async () => {
    if ((recordingState !== 'idle' && recordingState !== 'preview') || uploading) return;
    if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl);
    setRecordingPreviewUrl('');
    setRecordingFile(null);
    setRecorderError('');
    const availability = audioRecordingAvailability({
      secureContext: window.isSecureContext,
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
      hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    });
    if (!availability.available) {
      setRecorderError(
        window.isSecureContext
          ? t(
              'node.audio.error.recordingUnsupported',
              '当前浏览器不支持麦克风录音，请使用最新版 Chrome 或 Edge。',
            )
          : t(
              'node.audio.error.secureContextRequired',
              '麦克风只能在 localhost 或 HTTPS 安全地址中使用。',
            ),
      );
      return;
    }
    const requestId = permissionRequestRef.current + 1;
    permissionRequestRef.current = requestId;
    setRecordingState('requesting');
    try {
      const mediaRequest = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      void mediaRequest.then((lateStream) => {
        if (permissionRequestRef.current !== requestId) {
          lateStream.getTracks().forEach((track) => track.stop());
        }
      });
      let timeoutId = 0;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () =>
            reject(
              new DOMException(
                t('node.audio.error.permissionTimeoutShort', '麦克风授权等待超时'),
                'TimeoutError',
              ),
            ),
          15_000,
        );
      });
      const stream = await Promise.race([mediaRequest, timeout]);
      window.clearTimeout(timeoutId);
      if (permissionRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException(
          t('node.audio.error.noTrack', '没有可用的麦克风音轨'),
          'NotFoundError',
        );
      }
      recordingStreamRef.current = stream;
      setActiveMicrophone(
        stream.getAudioTracks()[0]?.label ||
          t('node.audio.recorder.defaultMicrophone', '默认麦克风'),
      );
      const mimeType = preferredAudioRecordingMimeType((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingFailedRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recordingFailedRef.current = true;
        recordingChunksRef.current = [];
        setRecorderError(
          t('node.audio.error.recordingFailed', '录音失败，请检查麦克风权限或设备状态。'),
        );
        setRecordingState('idle');
        stopRecordingTracks();
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        recorderRef.current = null;
        stopRecordingTracks();
        if (recordingFailedRef.current) {
          setRecordingState('idle');
          return;
        }
        if (!chunks.length) {
          setRecordingState('idle');
          setRecorderError(
            t('node.audio.error.noSoundRecorded', '没有录到声音，请确认麦克风正在工作。'),
          );
          return;
        }
        const file = createAudioRecordingFile(chunks, type);
        setRecordingFile(file);
        setRecordingPreviewUrl(URL.createObjectURL(file));
        setRecordingState('preview');
      };
      setRecordingSeconds(0);
      recordingElapsedMsRef.current = 0;
      recordingLastResumedAtRef.current = Date.now();
      recordingPeakLevelRef.current = 0;
      recorder.start(500);
      startInputMeter(stream);
      setRecordingState('recording');
    } catch (error) {
      permissionRequestRef.current += 1;
      setRecordingState('idle');
      stopRecordingTracks();
      setRecorderError(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? t(
              'node.audio.error.permissionDenied',
              '麦克风权限被拒绝，请在浏览器地址栏中允许后重试。',
            )
          : error instanceof DOMException && error.name === 'TimeoutError'
            ? t(
                'node.audio.error.permissionTimeout',
                '等待麦克风授权超时，请检查地址栏的麦克风权限后重试。',
              )
            : error instanceof DOMException && error.name === 'NotFoundError'
              ? t(
                  'node.audio.error.microphoneNotFound',
                  '没有检测到可用的麦克风，请连接或启用麦克风后重试。',
                )
              : t(
                  'node.audio.error.microphoneUnavailable',
                  '无法启动麦克风录音，请检查设备是否被其他程序占用。',
                ),
      );
    }
  }, [recordingPreviewUrl, recordingState, startInputMeter, stopRecordingTracks, t, uploading]);

  const cancelPermissionRequest = useCallback(() => {
    permissionRequestRef.current += 1;
    setRecordingState('idle');
    setRecorderError(t('node.audio.error.permissionCancelled', '已取消麦克风授权请求。'));
  }, [t]);

  const pauseRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'recording') return;
    recordingElapsedMsRef.current += Date.now() - recordingLastResumedAtRef.current;
    setRecordingSeconds(Math.floor(recordingElapsedMsRef.current / 1000));
    recorder.pause();
    setRecordingState('paused');
  }, []);

  const resumeRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'paused') return;
    recordingLastResumedAtRef.current = Date.now();
    recorder.resume();
    setRecordingState('recording');
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (recorder.state === 'recording') {
      recordingElapsedMsRef.current += Date.now() - recordingLastResumedAtRef.current;
      setRecordingSeconds(Math.floor(recordingElapsedMsRef.current / 1000));
    }
    recorder.requestData();
    recorder.stop();
  }, []);

  const closeRecorder = useCallback(() => {
    permissionRequestRef.current += 1;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recordingFailedRef.current = true;
      recorder.stop();
    }
    stopRecordingTracks();
    setRecordingState('idle');
    setRecorderOpen(false);
    setRecorderError('');
    setActiveMicrophone('');
    setRecordingFile(null);
    if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl);
    setRecordingPreviewUrl('');
  }, [recordingPreviewUrl, stopRecordingTracks]);

  const useRecording = useCallback(() => {
    if (!recordingFile) return;
    const file = recordingFile;
    setRecorderOpen(false);
    setRecordingState('idle');
    setRecordingFile(null);
    setRecordingPreviewUrl('');
    void persistAudioFile(file, recordingElapsedMsRef.current / 1000);
  }, [persistAudioFile, recordingFile]);

  const handleDownload = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      if (!playbackUrl) return;
      const anchor = document.createElement('a');
      anchor.href = playbackUrl;
      anchor.download = String(data.audioFileName || data.title || '音频');
      anchor.click();
    },
    [data.audioFileName, data.title, playbackUrl],
  );

  const handleTogglePlayback = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const audio = playbackRef.current;
      if (!audio) return;
      if (!audio.paused) {
        audio.pause();
        return;
      }
      if (audio.currentTime < playbackRangeStart || audio.currentTime >= playbackRangeEnd - 0.05) {
        audio.currentTime = playbackRangeStart;
      }
      audio.playbackRate = previewPlaybackRate;
      void audio.play().catch(() => setPlaybackError(audioPlaybackErrorMessage));
    },
    [audioPlaybackErrorMessage, playbackRangeEnd, playbackRangeStart, previewPlaybackRate],
  );

  const waveformClientXSeconds = useCallback(
    (clientX: number) => {
      const bounds = waveformRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || !resolvedDuration) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
      return Number((ratio * resolvedDuration).toFixed(2));
    },
    [resolvedDuration],
  );

  const waveformPointerSeconds = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => waveformClientXSeconds(event.clientX),
    [waveformClientXSeconds],
  );

  const seekPlaybackTo = useCallback(
    (seconds: number) => {
      if (!resolvedDuration) return;
      const nextSeconds = Number(Math.max(0, Math.min(resolvedDuration, seconds)).toFixed(2));
      const audio = playbackRef.current;
      if (audio) audio.currentTime = nextSeconds;
      setPlaybackSeconds(nextSeconds);
    },
    [resolvedDuration],
  );

  const handleWaveformPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!resolvedDuration) return;

      if (activeToolMode === 'trim') {
        event.stopPropagation();
        const seconds = waveformPointerSeconds(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        playbackRef.current?.pause();
        setTrimDragBoundary(null);
        setTrimAnchor(seconds);
        setTrimDraft({ start: seconds, end: seconds });
        return;
      }

      waveformDragCleanupRef.current?.();
      suppressWaveformClickRef.current = false;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;
      const ownerWindow = event.currentTarget.ownerDocument.defaultView;
      if (!ownerWindow) return;

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId || moved) return;
        moved = Math.hypot(pointerEvent.clientX - startX, pointerEvent.clientY - startY) > 4;
      };
      const cleanup = () => {
        ownerWindow.removeEventListener('pointermove', handlePointerMove, true);
        ownerWindow.removeEventListener('pointerup', handlePointerEnd, true);
        ownerWindow.removeEventListener('pointercancel', handlePointerEnd, true);
        waveformDragCleanupRef.current = null;
      };
      const handlePointerEnd = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return;
        suppressWaveformClickRef.current = moved;
        cleanup();
      };

      ownerWindow.addEventListener('pointermove', handlePointerMove, true);
      ownerWindow.addEventListener('pointerup', handlePointerEnd, true);
      ownerWindow.addEventListener('pointercancel', handlePointerEnd, true);
      waveformDragCleanupRef.current = cleanup;
    },
    [activeToolMode, resolvedDuration, waveformPointerSeconds],
  );

  const handleWaveformClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (activeToolMode === 'trim') return;
      event.stopPropagation();
      if (suppressWaveformClickRef.current) {
        suppressWaveformClickRef.current = false;
        return;
      }
      seekPlaybackTo(waveformClientXSeconds(event.clientX));
    },
    [activeToolMode, seekPlaybackTo, waveformClientXSeconds],
  );

  const handlePlaybackHeadPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      playbackRef.current?.pause();
      playbackHeadPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekPlaybackTo(waveformClientXSeconds(event.clientX));

      playbackHeadDragCleanupRef.current?.();
      const pointerId = event.pointerId;
      const ownerWindow = event.currentTarget.ownerDocument.defaultView;
      if (!ownerWindow) return;
      const handlePointerMove = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return;
        seekPlaybackTo(waveformClientXSeconds(pointerEvent.clientX));
      };
      const cleanup = () => {
        ownerWindow.removeEventListener('pointermove', handlePointerMove, true);
        ownerWindow.removeEventListener('pointerup', handlePointerEnd, true);
        ownerWindow.removeEventListener('pointercancel', handlePointerEnd, true);
        playbackHeadDragCleanupRef.current = null;
      };
      const handlePointerEnd = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return;
        seekPlaybackTo(waveformClientXSeconds(pointerEvent.clientX));
        playbackHeadPointerRef.current = null;
        cleanup();
      };
      ownerWindow.addEventListener('pointermove', handlePointerMove, true);
      ownerWindow.addEventListener('pointerup', handlePointerEnd, true);
      ownerWindow.addEventListener('pointercancel', handlePointerEnd, true);
      playbackHeadDragCleanupRef.current = cleanup;
    },
    [seekPlaybackTo, waveformClientXSeconds],
  );

  const handlePlaybackHeadPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (playbackHeadPointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      seekPlaybackTo(waveformClientXSeconds(event.clientX));
    },
    [seekPlaybackTo, waveformClientXSeconds],
  );

  const finishPlaybackHeadDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (playbackHeadPointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      seekPlaybackTo(waveformClientXSeconds(event.clientX));
      playbackHeadPointerRef.current = null;
      playbackHeadDragCleanupRef.current?.();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [seekPlaybackTo, waveformClientXSeconds],
  );

  const handlePlaybackHeadKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      let nextSeconds: number | null = null;
      if (event.key === 'Home') nextSeconds = 0;
      if (event.key === 'End') nextSeconds = resolvedDuration;
      if (event.key === 'ArrowLeft') nextSeconds = playbackSeconds - (event.shiftKey ? 1 : 0.1);
      if (event.key === 'ArrowRight') nextSeconds = playbackSeconds + (event.shiftKey ? 1 : 0.1);
      if (nextSeconds === null) return;
      event.preventDefault();
      event.stopPropagation();
      playbackRef.current?.pause();
      seekPlaybackTo(nextSeconds);
    },
    [playbackSeconds, resolvedDuration, seekPlaybackTo],
  );

  const handleWaveformPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeToolMode !== 'trim' || (trimAnchor === null && trimDragBoundary === null)) return;
      event.stopPropagation();
      const seconds = waveformPointerSeconds(event);
      if (trimDragBoundary) {
        setTrimDraft((current) =>
          moveAudioTrimBoundary(current, trimDragBoundary, seconds, resolvedDuration),
        );
        return;
      }
      if (trimAnchor === null) return;
      setTrimDraft({
        start: Math.min(trimAnchor, seconds),
        end: Math.max(trimAnchor, seconds),
      });
    },
    [activeToolMode, resolvedDuration, trimAnchor, trimDragBoundary, waveformPointerSeconds],
  );

  const finishTrimSelection = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeToolMode !== 'trim' || (trimAnchor === null && trimDragBoundary === null)) return;
      event.stopPropagation();
      const seconds = waveformPointerSeconds(event);
      if (trimDragBoundary) {
        const next = moveAudioTrimBoundary(trimDraft, trimDragBoundary, seconds, resolvedDuration);
        setTrimDraft(next);
        setTrimDragBoundary(null);
        const audio = playbackRef.current;
        if (audio) audio.currentTime = next.start;
        setPlaybackSeconds(next.start);
        return;
      }
      if (trimAnchor === null) return;
      let start = Math.min(trimAnchor, seconds);
      let end = Math.max(trimAnchor, seconds);
      if (end - start < AUDIO_TRIM_MIN_DURATION_SECONDS) {
        end = Math.min(resolvedDuration, start + Math.min(0.5, resolvedDuration));
        start = Math.max(0, end - Math.min(0.5, resolvedDuration));
      }
      setTrimDraft({ start, end });
      setTrimAnchor(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const audio = playbackRef.current;
      if (audio) audio.currentTime = start;
      setPlaybackSeconds(start);
    },
    [
      activeToolMode,
      resolvedDuration,
      trimAnchor,
      trimDraft,
      trimDragBoundary,
      waveformPointerSeconds,
    ],
  );

  const handleTrimBoundaryPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, boundary: AudioTrimBoundary) => {
      event.preventDefault();
      event.stopPropagation();
      playbackRef.current?.pause();
      event.currentTarget.setPointerCapture(event.pointerId);
      setTrimAnchor(null);
      setTrimDragBoundary(boundary);
    },
    [],
  );

  const handleTrimBoundaryChange = useCallback(
    (boundary: AudioTrimBoundary, value: number) => {
      const next = moveAudioTrimBoundary(trimDraft, boundary, value, resolvedDuration);
      setTrimDraft(next);
      const audio = playbackRef.current;
      if (audio) audio.currentTime = next.start;
      setPlaybackSeconds(next.start);
    },
    [resolvedDuration, trimDraft],
  );

  const handleTrimBoundaryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, boundary: AudioTrimBoundary) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      const currentValue = boundary === 'start' ? trimDraft.start : trimDraft.end;
      handleTrimBoundaryChange(boundary, currentValue + direction * step);
    },
    [handleTrimBoundaryChange, trimDraft.end, trimDraft.start],
  );

  const handleTrimMode = useCallback(() => {
    setTrimAnchor(null);
    setTrimDragBoundary(null);
    if (activeToolMode === 'trim') {
      setActiveToolMode(null);
      return;
    }
    setTrimDraft({
      start: trimStart,
      end: trimEnd > trimStart ? trimEnd : resolvedDuration,
    });
    setActiveToolMode('trim');
  }, [activeToolMode, resolvedDuration, trimEnd, trimStart]);

  const handleSpeedMode = useCallback(() => {
    setTrimAnchor(null);
    setTrimDragBoundary(null);
    if (activeToolMode === 'speed') {
      setActiveToolMode(null);
      return;
    }
    setSpeedDraft(clampAudioEditRate(playbackRate));
    setActiveToolMode('speed');
  }, [activeToolMode, playbackRate]);

  const handleCloseAudioEditor = useCallback(() => {
    setActiveToolMode(null);
    setTrimAnchor(null);
    setTrimDragBoundary(null);
    const audio = playbackRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate]);

  const handleSpeedChange = useCallback((value: number) => {
    const nextRate = clampAudioEditRate(value);
    setSpeedDraft(nextRate);
    const audio = playbackRef.current;
    if (audio) audio.playbackRate = nextRate;
  }, []);

  const audioEditingErrorMessage = useCallback(
    (error: unknown) => {
      const code = error instanceof AudioEditingError ? error.code : 'render-failed';
      switch (code) {
        case 'unsupported':
          return t(
            'node.audio.edit.error.unsupported',
            '当前浏览器不支持本地音频编辑，请使用最新版 Chrome 或 Edge。',
          );
        case 'load-failed':
          return t('node.audio.edit.error.loadFailed', '无法读取音频源，请重新上传后再试。');
        case 'decode-failed':
          return t('node.audio.edit.error.decodeFailed', '无法解码这段音频，请更换常用音频格式。');
        case 'invalid-range':
          return t('node.audio.edit.error.invalidRange', '请选择有效的音频截取范围。');
        case 'output-too-long':
          return t('node.audio.edit.error.outputTooLong', '处理后的音频不能超过 10 分钟。');
        default:
          return t('node.audio.edit.error.renderFailed', '音频处理失败，请重试。');
      }
    },
    [t],
  );

  const handleApplyTrim = useCallback(async () => {
    if (!playbackUrl || processingAudio || uploading || data.generating) return;
    setProcessingAudio(true);
    updateNodeData(id, {
      generationError: undefined,
      result: t('node.audio.trim.processing', '正在生成截取音频…'),
    });
    try {
      const edited = await renderEditedAudioFile(
        playbackUrl,
        String(data.audioFileName || data.title || '音频'),
        'trim',
        { startSeconds: trimDraft.start, endSeconds: trimDraft.end },
      );
      const durable = await persistAudioFile(edited.file, edited.durationSeconds);
      if (durable) {
        updateNodeData(id, {
          result: t('node.audio.trim.generated', '截取音频已生成并保存。'),
        });
      }
    } catch (error) {
      updateNodeData(id, {
        generationError: audioEditingErrorMessage(error),
        result: t('node.audio.trim.failed', '截取音频生成失败。'),
      });
    } finally {
      setProcessingAudio(false);
    }
  }, [
    audioEditingErrorMessage,
    data.audioFileName,
    data.generating,
    data.title,
    id,
    persistAudioFile,
    playbackUrl,
    processingAudio,
    t,
    trimDraft.end,
    trimDraft.start,
    updateNodeData,
    uploading,
  ]);

  const handleApplySpeed = useCallback(async () => {
    if (!playbackUrl || processingAudio || uploading || data.generating) return;
    setProcessingAudio(true);
    updateNodeData(id, {
      generationError: undefined,
      result: t('node.audio.speed.processing', '正在生成变速音频…'),
    });
    try {
      const edited = await renderEditedAudioFile(
        playbackUrl,
        String(data.audioFileName || data.title || '音频'),
        'speed',
        { playbackRate: speedDraft },
      );
      const durable = await persistAudioFile(edited.file, edited.durationSeconds);
      if (durable) {
        updateNodeData(id, {
          result: t('node.audio.speed.generated', '变速音频已生成并保存。'),
        });
      }
    } catch (error) {
      updateNodeData(id, {
        generationError: audioEditingErrorMessage(error),
        result: t('node.audio.speed.failed', '变速音频生成失败。'),
      });
      const audio = playbackRef.current;
      if (audio) audio.playbackRate = playbackRate;
    } finally {
      setProcessingAudio(false);
    }
  }, [
    audioEditingErrorMessage,
    data.audioFileName,
    data.generating,
    data.title,
    id,
    persistAudioFile,
    playbackRate,
    playbackUrl,
    processingAudio,
    speedDraft,
    t,
    updateNodeData,
    uploading,
  ]);

  const handleReloadPlayback = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    const audio = playbackRef.current;
    if (!audio) return;
    durationResolutionRequestRef.current += 1;
    setPlaybackError('');
    audio.load();
  }, []);

  const handleRecoverGenerationResult = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      if (checkingGenerationResult || !interruptedGenerationRequestId) return;
      setCheckingGenerationResult(true);
      try {
        await recoverNodeGenerationResult(id);
      } finally {
        setCheckingGenerationResult(false);
      }
    },
    [checkingGenerationResult, id, interruptedGenerationRequestId, recoverNodeGenerationResult],
  );

  const frameStyle = { width: AUDIO_NODE_WIDTH, height: AUDIO_NODE_HEIGHT };
  const assetPickerModal =
    assetPickerOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setAssetPickerOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`audio-asset-picker-${id}`}
              className="flex max-h-[min(680px,calc(100vh-32px))] w-[min(640px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1f1f21] shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div className="min-w-0">
                  <h2
                    id={`audio-asset-picker-${id}`}
                    className="text-sm font-semibold text-white/90"
                  >
                    {t('node.audio.asset.picker.title', '从资产库选择音频')}
                  </h2>
                  <p className="mt-1 text-[11px] leading-4 text-white/45">
                    {t(
                      'node.audio.asset.picker.description',
                      '选择后会替换当前音频，并保留素材库中的稳定文件引用。',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssetPickerOpen(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 hover:bg-white/[0.08] hover:text-white"
                  title={t('common.close', '关闭')}
                  aria-label={t('node.audio.asset.picker.close', '关闭音频资产选择')}
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {audioAssets.length === 0 ? (
                  <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
                    <Library className="h-8 w-8 text-white/20" />
                    <p className="mt-3 text-sm text-white/60">
                      {t('node.audio.asset.picker.empty', '资产库中还没有音频')}
                    </p>
                    <p className="mt-1 text-[11px] text-white/35">
                      {t(
                        'node.audio.asset.picker.emptyHint',
                        '请先上传音频到资产库，或把已有音频节点添加到素材库。',
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {audioAssets.map((asset) => {
                      const source = resolvedAudioSource(asset);
                      const unavailable = assetSessionMediaUnavailable(asset) || !source;
                      return (
                        <div
                          key={asset.id}
                          className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/15 p-3"
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-violet-300/15 bg-violet-400/[0.08]">
                            <Music2 className="h-5 w-5 text-violet-200/70" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white/80">
                              {asset.title}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-white/38">
                              {unavailable
                                ? t(
                                    'node.audio.asset.picker.unavailable',
                                    '音频文件已失效，请重新上传',
                                  )
                                : `${asset.audioFileName || t('node.audio.generated', '生成音频')} · ${formatAudioDuration(asset.durationSeconds)}`}
                            </p>
                          </div>
                          {source && !unavailable && (
                            <audio
                              className="h-8 w-48 shrink-0"
                              controls
                              preload="none"
                              src={source}
                            />
                          )}
                          <button
                            type="button"
                            disabled={unavailable}
                            onClick={() => handleSelectAssetAudio(asset)}
                            className="h-8 shrink-0 rounded-lg bg-white/[0.09] px-3 text-xs font-medium text-white/75 hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            {t('node.audio.asset.picker.select', '选择')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )
      : null;
  const recorderModal =
    recorderOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`audio-recorder-title-${id}`}
              className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-white/15 bg-[#1d1d1f] shadow-2xl"
            >
              <header className="flex h-14 items-center justify-between border-b border-white/10 px-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/12 text-rose-300">
                    <Mic className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2
                      id={`audio-recorder-title-${id}`}
                      className="text-sm font-semibold text-white/90"
                    >
                      {t('node.audio.recorder.title', '麦克风录音')}
                    </h2>
                    <p className="text-[11px] text-white/38">
                      {t(
                        'node.audio.recorder.description',
                        '录制后可先试听，确认使用才会写入音频节点',
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeRecorder}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[0.08] hover:text-white"
                  aria-label={t('node.audio.recorder.close', '关闭录音面板')}
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="p-5">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] text-white/38">
                        {t('node.audio.recorder.device', '录音设备')}
                      </p>
                      <p className="mt-1 truncate text-sm text-white/80">
                        {activeMicrophone ||
                          (recordingState === 'requesting'
                            ? t('node.audio.recorder.waitingPermission', '正在等待麦克风授权…')
                            : t('node.audio.recorder.startHint', '点击“开始录音”后读取默认麦克风'))}
                      </p>
                    </div>
                    <div
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${
                        recordingState === 'recording'
                          ? 'bg-rose-500/15 text-rose-200'
                          : recordingState === 'paused'
                            ? 'bg-amber-400/15 text-amber-200'
                            : recordingState === 'preview'
                              ? 'bg-emerald-400/15 text-emerald-200'
                              : 'bg-white/[0.06] text-white/45'
                      }`}
                    >
                      {recordingState === 'requesting'
                        ? t('node.audio.recorder.state.permission', '请允许权限')
                        : recordingState === 'recording'
                          ? t('node.audio.recorder.state.recording', '正在录音')
                          : recordingState === 'paused'
                            ? t('node.audio.recorder.state.paused', '已暂停')
                            : recordingState === 'preview'
                              ? t('node.audio.recorder.state.preview', '可试听')
                              : t('node.audio.recorder.state.idle', '未开始')}
                    </div>
                  </div>

                  <div className="mt-5 flex h-24 items-center justify-center gap-1 rounded-xl border border-white/[0.07] bg-[#111113] px-4">
                    {Array.from({ length: 42 }, (_, index) => {
                      const centerWeight = 1 - Math.abs(index - 20.5) / 21;
                      const activeHeight = Math.max(
                        5,
                        Math.round(inputLevel * (28 + centerWeight * 50)),
                      );
                      return (
                        <span
                          key={index}
                          className={`w-1 rounded-full transition-[height,background-color] duration-75 ${
                            recordingState === 'recording'
                              ? 'bg-emerald-400/85'
                              : recordingState === 'paused'
                                ? 'bg-amber-300/65'
                                : 'bg-white/12'
                          }`}
                          style={{ height: `${activeHeight}px` }}
                        />
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-white/35">
                        {t('node.audio.recorder.duration', '录音时长')}
                      </p>
                      <p className="mt-0.5 font-mono text-2xl tabular-nums text-white/90">
                        {formatAudioDuration(recordingSeconds)}
                      </p>
                    </div>
                    {(recordingState === 'recording' || recordingState === 'paused') && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={
                            recordingState === 'recording' ? pauseRecording : resumeRecording
                          }
                          className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs text-white/75 hover:bg-white/[0.07]"
                        >
                          {recordingState === 'recording' ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {recordingState === 'recording'
                            ? t('node.audio.recorder.pause', '暂停')
                            : t('node.audio.recorder.resume', '继续')}
                        </button>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="flex h-10 items-center gap-2 rounded-xl bg-rose-500 px-4 text-xs font-semibold text-white hover:bg-rose-400"
                        >
                          <Square className="h-3.5 w-3.5 fill-current" />
                          {t('node.audio.recorder.stop', '停止录音')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {recorderError && (
                  <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-xs leading-5 text-rose-200">
                    {recorderError}
                  </p>
                )}

                {recordingState === 'preview' && recordingPreviewUrl && recordingFile && (
                  <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.05] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white/85">
                          {t('node.audio.recorder.previewTitle', '录音已完成，请先试听')}
                        </p>
                        <p className="mt-1 text-[11px] text-white/42">
                          {formatAudioDuration(recordingSeconds)} ·{' '}
                          {Math.max(1, Math.round(recordingFile.size / 1024))} KB
                        </p>
                      </div>
                      {!hasAudibleInput(recordingPeakLevelRef.current) && (
                        <span className="rounded-lg bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200">
                          {t('node.audio.recorder.noAudibleInput', '未检测到明显声音')}
                        </span>
                      )}
                    </div>
                    <audio
                      className="h-10 w-full"
                      controls
                      preload="metadata"
                      src={recordingPreviewUrl}
                    />
                  </div>
                )}
              </div>

              <footer className="flex min-h-16 items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
                <p className="text-[11px] leading-4 text-white/35">
                  {t(
                    'node.audio.recorder.discardNotice',
                    '仅录到电脑当前默认麦克风；关闭面板会丢弃未确认的录音。',
                  )}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {recordingState === 'requesting' ? (
                    <button
                      type="button"
                      onClick={cancelPermissionRequest}
                      className="h-9 rounded-lg border border-white/10 px-4 text-xs text-white/65 hover:bg-white/[0.07]"
                    >
                      {t('node.audio.recorder.cancelPermission', '取消授权等待')}
                    </button>
                  ) : recordingState === 'preview' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void startRecording()}
                        className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-4 text-xs text-white/70 hover:bg-white/[0.07]"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {t('node.audio.recorder.recordAgain', '重新录制')}
                      </button>
                      <button
                        type="button"
                        onClick={useRecording}
                        className="h-9 rounded-lg bg-white px-5 text-xs font-semibold text-black hover:bg-white/90"
                      >
                        {t('node.audio.recorder.useRecording', '使用此录音')}
                      </button>
                    </>
                  ) : recordingState === 'idle' ? (
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      className="flex h-9 items-center gap-2 rounded-lg bg-rose-500 px-5 text-xs font-semibold text-white hover:bg-rose-400"
                    >
                      <Mic className="h-4 w-4" />
                      {t('node.audio.recorder.start', '开始录音')}
                    </button>
                  ) : null}
                </div>
              </footer>
            </section>
          </div>,
          document.body,
        )
      : null;

  if (zoom < 0.3) {
    return (
      <>
        <div
          ref={nodeRef}
          style={frameStyle}
          data-theme-role="node-surface"
          onClick={handleReferencePick}
          className={`relative rounded-xl border bg-[#242425] transition-[border-color,box-shadow] ${
            canPickAsReference
              ? 'cursor-copy border-sky-300 shadow-[0_0_0_2px_rgba(96,165,250,0.24)]'
              : selected
                ? SELECTED_NODE_FRAME_CLASS
                : 'border-white/[0.12]'
          }`}
        >
          <NodePorts kind="audio" nodeRef={nodeRef} selected={showSingleNodeControls} zoom={zoom} />
        </div>
        {assetPickerModal}
        {recorderModal}
      </>
    );
  }

  return (
    <>
      <div ref={nodeRef} style={frameStyle} className="group relative">
        {canPickAsReference && (
          <button
            type="button"
            onClick={handleReferencePick}
            className="nodrag nopan absolute inset-0 z-50 cursor-copy rounded-xl"
            aria-label={t('composer.reference.selectAudioNode', '选择此音频作为参考')}
            title={t('composer.reference.selectAudioNode', '选择此音频作为参考')}
          />
        )}
        {showSingleNodeControls && playbackUrl && (
          <AudioNodeActionBar
            activeMode={activeToolMode}
            trimStart={trimDraft.start}
            trimEnd={trimDraft.end}
            trimDuration={resolvedDuration}
            speed={speedDraft}
            busy={Boolean(data.generating || uploading || processingAudio)}
            onTrim={handleTrimMode}
            onSpeed={handleSpeedMode}
            onCloseEditor={handleCloseAudioEditor}
            onTrimBoundaryChange={handleTrimBoundaryChange}
            onSpeedChange={handleSpeedChange}
            onApplyTrim={() => void handleApplyTrim()}
            onApplySpeed={() => void handleApplySpeed()}
            onReplaceAudio={() => {
              handleCloseAudioEditor();
              fileRef.current?.click();
            }}
            onChooseAssetAudio={() => {
              handleCloseAudioEditor();
              setAssetPickerOpen(true);
            }}
            onRecordAgain={() => {
              handleCloseAudioEditor();
              setRecorderError('');
              setRecorderOpen(true);
            }}
            onDownload={handleDownload}
          />
        )}
        <div className="pointer-events-none absolute -top-8 left-0 right-0 flex h-7 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-white/55">
            <Music2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{displayTitle}</span>
          </div>
          {showSingleNodeControls && (
            <div className="pointer-events-auto flex shrink-0 items-center gap-1">
              <AiSkillNodeDragHandle nodeId={id} label={displayTitle} />
              {playbackUrl && (
                <button
                  type="button"
                  onClick={handleSaveAsset}
                  disabled={Boolean(
                    data.generating || uploading || processingAudio || savedToAssetLibrary,
                  )}
                  className={`nodrag nopan flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:cursor-default ${
                    savedToAssetLibrary
                      ? 'text-emerald-300'
                      : 'text-white/50 hover:bg-white/[0.08] hover:text-white disabled:opacity-40'
                  }`}
                  title={
                    savedToAssetLibrary
                      ? t('node.audio.asset.saved', '已添加到素材库')
                      : t('node.audio.asset.add', '添加到素材库')
                  }
                  aria-label={
                    savedToAssetLibrary
                      ? t('node.audio.asset.saved', '已添加到素材库')
                      : t('node.audio.asset.add', '添加到素材库')
                  }
                >
                  {savedToAssetLibrary ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Library className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                className="nodrag nopan pointer-events-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                title={t('common.moveToTrash', '移到回收站')}
                aria-label={t('common.moveToTrash', '移到回收站')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div
          data-theme-role="node-surface"
          className={`relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-[#242425] p-2 transition-[border-color,box-shadow] ${
            canPickAsReference
              ? 'border-sky-300 shadow-[0_0_0_2px_rgba(96,165,250,0.24),0_0_24px_rgba(96,165,250,0.2)]'
              : selected
                ? SELECTED_NODE_FRAME_CLASS
                : 'border-white/25 shadow-[0_3px_14px_rgba(0,0,0,0.28)] hover:border-white/35'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.weba,.webm"
            className="hidden"
            onChange={handleAudioUpload}
          />
          {playbackUrl ? (
            <>
              <audio
                ref={playbackRef}
                className="hidden"
                preload="metadata"
                src={playbackUrl}
                onLoadStart={() => {
                  durationResolutionRequestRef.current += 1;
                  setPlaybackError('');
                  setPlaybackSeconds(0);
                  setPlaying(false);
                }}
                onLoadedMetadata={(event) => {
                  const media = event.currentTarget;
                  media.playbackRate = previewPlaybackRate;
                  const sourceAtMetadata = media.currentSrc;
                  const requestId = durationResolutionRequestRef.current + 1;
                  durationResolutionRequestRef.current = requestId;
                  setPlaybackError('');
                  void resolveMediaDuration(media).then((duration) => {
                    if (
                      duration <= 0 ||
                      requestId !== durationResolutionRequestRef.current ||
                      playbackRef.current !== media ||
                      media.currentSrc !== sourceAtMetadata ||
                      duration === data.durationSeconds
                    ) {
                      return;
                    }
                    updateNodeData(id, {
                      durationSeconds: duration,
                      generationError:
                        data.generationError === AUDIO_PLAYBACK_ERROR_FALLBACK ||
                        data.generationError === audioPlaybackErrorMessage
                          ? undefined
                          : data.generationError,
                    });
                  });
                }}
                onTimeUpdate={(event) => {
                  const media = event.currentTarget;
                  const end = playbackRangeEnd || media.duration;
                  if (Number.isFinite(end) && media.currentTime >= end - 0.03) {
                    media.pause();
                    media.currentTime = playbackRangeStart;
                    setPlaybackSeconds(playbackRangeStart);
                    return;
                  }
                  setPlaybackSeconds(media.currentTime);
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onCanPlay={() => {
                  setPlaybackError('');
                  if (
                    data.generationError === AUDIO_PLAYBACK_ERROR_FALLBACK ||
                    data.generationError === audioPlaybackErrorMessage
                  ) {
                    updateNodeData(id, { generationError: undefined });
                  }
                }}
                onError={() => setPlaybackError(audioPlaybackErrorMessage)}
              />
              <div
                ref={waveformRef}
                onPointerDown={handleWaveformPointerDown}
                onPointerMove={handleWaveformPointerMove}
                onPointerUp={finishTrimSelection}
                onPointerCancel={finishTrimSelection}
                onClick={handleWaveformClick}
                className={`relative min-h-0 flex-1 overflow-hidden rounded-lg bg-white/[0.09] text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${
                  activeToolMode === 'trim'
                    ? 'nodrag nopan cursor-crosshair ring-1 ring-emerald-300/35'
                    : 'cursor-grab active:cursor-grabbing'
                }`}
                aria-label={
                  activeToolMode === 'trim'
                    ? t('node.audio.trim.waveformHint', '拖动波形框选截取范围')
                    : t('node.audio.seek', '拖动移动节点；单击波形定位播放位置')
                }
              >
                <div className="absolute inset-x-2 inset-y-2 flex items-center gap-[2px]">
                  {waveformBars.map((level, index) => {
                    const ratio = index / Math.max(1, waveformBars.length - 1);
                    const playedRatio = resolvedDuration ? playbackSeconds / resolvedDuration : 0;
                    return (
                      <span
                        key={level.toString(36)}
                        className={`min-w-0 flex-1 rounded-full transition-colors ${
                          ratio <= playedRatio ? 'bg-white/90' : 'bg-white/20'
                        }`}
                        style={{ height: `${Math.round(18 + level * 60)}%` }}
                      />
                    );
                  })}
                </div>
                {activeToolMode === 'trim' && resolvedDuration > 0 && (
                  <>
                    <span
                      className="absolute inset-y-0 left-0 bg-black/45"
                      style={{ width: `${(trimDraft.start / resolvedDuration) * 100}%` }}
                    />
                    <span
                      className="absolute inset-y-0 right-0 bg-black/45"
                      style={{
                        width: `${((resolvedDuration - trimDraft.end) / resolvedDuration) * 100}%`,
                      }}
                    />
                    <span
                      className="absolute inset-y-0 rounded-md border-2 border-white/90 bg-white/[0.04] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                      style={{
                        left: `${(trimDraft.start / resolvedDuration) * 100}%`,
                        width: `${Math.max(0, ((trimDraft.end - trimDraft.start) / resolvedDuration) * 100)}%`,
                      }}
                    >
                      <button
                        type="button"
                        onPointerDown={(event) => handleTrimBoundaryPointerDown(event, 'start')}
                        onKeyDown={(event) => handleTrimBoundaryKeyDown(event, 'start')}
                        onClick={(event) => event.stopPropagation()}
                        className="nodrag nopan absolute inset-y-0 left-0 z-20 flex w-3 cursor-ew-resize items-center justify-center rounded-l-[4px] bg-white text-black shadow-[2px_0_8px_rgba(0,0,0,0.3)] outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                        aria-label={t('node.audio.trim.startHandle', '拖动截取开始位置')}
                      >
                        <span className="h-5 w-0.5 rounded-full bg-black/35" />
                      </button>
                      <button
                        type="button"
                        onPointerDown={(event) => handleTrimBoundaryPointerDown(event, 'end')}
                        onKeyDown={(event) => handleTrimBoundaryKeyDown(event, 'end')}
                        onClick={(event) => event.stopPropagation()}
                        className="nodrag nopan absolute inset-y-0 right-0 z-20 flex w-3 cursor-ew-resize items-center justify-center rounded-r-[4px] bg-white text-black shadow-[-2px_0_8px_rgba(0,0,0,0.3)] outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                        aria-label={t('node.audio.trim.endHandle', '拖动截取结束位置')}
                      >
                        <span className="h-5 w-0.5 rounded-full bg-black/35" />
                      </button>
                      {trimDraft.end - trimDraft.start >= AUDIO_TRIM_MIN_DURATION_SECONDS && (
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-lg">
                          {(trimDraft.end - trimDraft.start).toFixed(2)} s
                        </span>
                      )}
                    </span>
                  </>
                )}
                {resolvedDuration > 0 &&
                  (activeToolMode === 'trim' ? (
                    <span
                      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]"
                      style={{
                        left: `${Math.max(0, Math.min(100, (playbackSeconds / resolvedDuration) * 100))}%`,
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      role="slider"
                      aria-label={t('node.audio.playhead', '拖动红色播放头定位播放位置')}
                      aria-valuemin={0}
                      aria-valuemax={resolvedDuration}
                      aria-valuenow={playbackSeconds}
                      aria-valuetext={formatAudioDuration(playbackSeconds)}
                      onPointerDown={handlePlaybackHeadPointerDown}
                      onPointerMove={handlePlaybackHeadPointerMove}
                      onPointerUp={finishPlaybackHeadDrag}
                      onPointerCancel={finishPlaybackHeadDrag}
                      onKeyDown={handlePlaybackHeadKeyDown}
                      onClick={(event) => event.stopPropagation()}
                      className="nodrag nopan absolute inset-y-0 z-30 w-3 -translate-x-1/2 cursor-ew-resize touch-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-rose-200/80"
                      style={{
                        left: `${Math.max(0, Math.min(100, (playbackSeconds / resolvedDuration) * 100))}%`,
                      }}
                    >
                      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]" />
                    </button>
                  ))}
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  createVideoFromAudio(id);
                }}
                className="nodrag nopan absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#171719]/90 text-white/80 shadow-lg transition-colors hover:bg-[#27272b] hover:text-white"
                title={t('node.audio.createVideo', '音频生视频')}
                aria-label={t('node.audio.createVideo', '音频生视频')}
              >
                <PlaySquare className="h-4 w-4" />
              </button>

              <div className="relative mt-1.5 flex h-7 items-center justify-between px-0.5 text-[12px] tabular-nums text-white/58">
                <span>
                  {formatAudioDuration(playbackSeconds)} / {formatAudioDuration(resolvedDuration)}
                </span>
                <button
                  type="button"
                  onClick={handleTogglePlayback}
                  className="nodrag nopan absolute left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-white/25 bg-[#242426] text-white/80 transition-colors hover:border-white/45 hover:bg-[#303034] hover:text-white"
                  title={playing ? t('common.pause', '暂停') : t('common.play', '播放')}
                  aria-label={playing ? t('common.pause', '暂停') : t('common.play', '播放')}
                >
                  {playing ? (
                    <Pause className="h-3 w-3 fill-current" />
                  ) : (
                    <Play className="ml-0.5 h-3 w-3 fill-current" />
                  )}
                </button>
                <span className="max-w-[112px] truncate text-right text-[10px] text-white/35">
                  {activeToolMode === 'speed' || playbackRate !== 1
                    ? `${previewPlaybackRate.toFixed(2)}×`
                    : ''}
                </span>
              </div>

              {playbackError && (
                <button
                  type="button"
                  onClick={handleReloadPlayback}
                  className="nodrag nopan absolute inset-x-3 bottom-2 z-20 flex h-7 items-center justify-center gap-1.5 rounded-lg border border-rose-300/15 bg-[#291d20]/95 text-[11px] font-medium text-rose-200/85 hover:bg-[#342126] hover:text-rose-100"
                  title={t('node.audio.retryPlayback', '重试播放')}
                  aria-label={t('node.audio.retryPlayback', '重试播放')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('node.audio.retryPlayback', '重试播放')}
                </button>
              )}
            </>
          ) : (
            <div className="flex h-full min-w-0 flex-col justify-center px-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black/15">
                  <Music2 className="h-5 w-5 text-white/25" strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white/82">
                    {t('node.audio.add', '添加音频')}
                  </p>
                  <p
                    className={`mt-0.5 truncate text-[11px] leading-4 ${restoredAudioUnavailable || data.generationError ? 'text-rose-300/85' : recordingState === 'recording' ? 'text-emerald-200/80' : 'text-white/45'}`}
                    title={String(
                      restoredAudioUnavailable
                        ? restoredAudioUnavailableMessage
                        : data.generationError || '',
                    )}
                  >
                    {String(
                      (restoredAudioUnavailable
                        ? restoredAudioUnavailableMessage
                        : data.generationError) ||
                        data.result ||
                        t('node.audio.emptyHint', '上传文件，或直接使用麦克风录制'),
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileRef.current?.click();
                  }}
                  disabled={recorderOpen || uploading}
                  className="nodrag flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-white/[0.08] px-2.5 text-xs font-medium text-white/85 hover:bg-white/[0.13] disabled:opacity-40"
                >
                  <Upload className="h-4 w-4" />
                  {t('node.audio.upload', '上传音频')}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAssetPickerOpen(true);
                  }}
                  disabled={recorderOpen || uploading}
                  className="nodrag flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 px-2.5 text-xs text-white/65 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                >
                  <Library className="h-4 w-4" />
                  {t('node.audio.asset.choose', '从资产库中')}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRecorderError('');
                    setRecorderOpen(true);
                  }}
                  disabled={uploading}
                  className="nodrag flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 px-2.5 text-xs text-white/65 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                >
                  <Mic className="h-4 w-4" />
                  {t('node.audio.record', '录制音频')}
                </button>
                {interruptedGenerationRequestId && (
                  <GenerationRecoveryButton
                    busy={checkingGenerationResult}
                    onCheck={handleRecoverGenerationResult}
                    label={t('imageNode.recovery.check', '检查生成结果')}
                    checkingLabel={t('imageNode.recovery.checking', '检查中…')}
                    className="h-9"
                  />
                )}
              </div>
            </div>
          )}

          {(data.generating || uploading || processingAudio) && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 backdrop-blur-sm">
              <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
              <span className="text-xs text-white/70">
                {processingAudio
                  ? t('node.audio.edit.processing', '正在处理音频…')
                  : uploading
                    ? t('node.audio.status.saving', '正在保存音频…')
                    : `${data.progress ?? 0}%`}
              </span>
            </div>
          )}
        </div>

        <NodePorts kind="audio" nodeRef={nodeRef} selected={showSingleNodeControls} zoom={zoom} />
      </div>
      {assetPickerModal}
      {recorderModal}
    </>
  );
}

export const AudioNode = memo(AudioNodeBase);
