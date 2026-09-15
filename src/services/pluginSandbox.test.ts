import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  buildPluginSandboxDocument,
  parsePluginSandboxCall,
  PLUGIN_SANDBOX_MESSAGE_SOURCE,
  resolvePluginAudioReferenceUrl,
  resolvePluginCanvasVideoUrl,
  sanitizePluginAddNodeRequest,
  sanitizePluginAutoDlH3ConnectionRequest,
  sanitizePluginAudioGenerationCall,
  sanitizePluginAudioGeneratorId,
  sanitizePluginAudioHistoryLookup,
  sanitizePluginAudioInstallRequest,
  sanitizePluginDocumentRequest,
  sanitizePluginDepthFrameRequest,
  sanitizePluginDepthModelInstallRequest,
  sanitizePluginHostDownloadRequest,
  sanitizePluginHostSaveFileRequest,
  sanitizePluginManagedImageRequest,
  sanitizePluginManagedMediaInspectRequest,
  sanitizePluginManagedMediaDownloadRequest,
  sanitizePluginManagedTextRequest,
  sanitizePluginManagedVideoFrameRequest,
  sanitizePluginManagedVideoRequest,
  sanitizePluginMotionSourceReadRequest,
  sanitizePluginMotionSourceStoreRequest,
  sanitizePluginReferenceAudioCategory,
  sanitizePluginReferenceAudioImport,
  sanitizePluginNodePatch,
  sanitizePluginOwnImageRequest,
  sanitizePluginOwnInputs,
  sanitizePluginPoseFrameRequest,
  sanitizePluginPoseCaptureRequest,
  sanitizePluginPoseCaptureJobRequest,
  sanitizePluginProjectGraphRequest,
  sanitizePluginSeedAudioCredentialRequest,
} from './pluginSandbox';
import { BRIDGE_BASE_URL } from '../lib/bridgeUrl';

describe('plugin sandbox contract', () => {
  it('builds an opaque CSP sandbox document without network or host DOM access', () => {
    const document = buildPluginSandboxDocument(
      'document.getElementById("root").textContent = "ready";',
      'session-1',
      {
        apiVersion: 1,
        pluginId: 'studio-tools',
        pluginName: 'Studio tools',
        view: 'panel',
        permissions: ['canvas:notify'],
        assets: [],
      },
    );
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval'");
    expect(document).toContain('worker-src blob:');
    expect(document).toContain("frame-src 'none'");
    expect(document).not.toContain('allow-same-origin');
    expect(document).toContain('window.qiansi');
    expect(document).toContain('document.getElementById');
    expect(document).not.toContain('assetUrl');
  });

  it('exposes the bounded audio host API to runtime apiVersion 2', () => {
    const document = buildPluginSandboxDocument('', 'session-2', {
      apiVersion: 2,
      pluginId: 'audio-tools',
      pluginName: 'Audio tools',
      view: 'tts',
      permissions: ['canvas:read-own-inputs', 'audio:generate'],
      assets: [],
    });
    expect(document).toContain('apiVersion: context.apiVersion');
    expect(document).toContain("call('canvas.readSelectedImage')");
    expect(document).toContain("call('canvas.readManagedImageCopy'");
    expect(document).toContain('readManagedCanvasImageCopy');
    expect(document).toContain('receipt.image instanceof Blob');
    expect(document).toContain("context.pluginId === 'qiansi-novel-video-studio'");
    expect(document).toContain('pickLatestProjectImage');
    expect(document).toContain("{ source: 'recent-project-first' }");
    expect(document).toContain("call('canvas.readSelectedVideo')");
    expect(document).toContain("call('canvas.readOwnInputs')");
    expect(document).toContain("call('canvas.readOwnImage'");
    expect(document).toContain("call('styles.readSample'");
    expect(document).toContain("call('styles.uploadSample'");
    expect(document).toContain("call('audio.checkGenerator'");
    expect(document).toContain("call('audio.listGenerators')");
    expect(document).toContain("call('audio.installGenerator'");
    expect(document).toContain("call('audio.installStatus'");
    expect(document).toContain('readEngineInstallStatus');
    expect(document).toContain("call('audio.cancelInstall'");
    expect(document).toContain("call('audio.uninstallGenerator'");
    expect(document).toContain("call('audio.generate'");
    expect(document).toContain("call('audio.listReferenceLibrary')");
    expect(document).toContain("call('audio.readReferenceLibrary'");
    expect(document).toContain("call('audio.renameReferenceLibrary'");
    expect(document).toContain("call('audio.importReferenceLibrary'");
    expect(document).toContain("call('audio.listHistory'");
    expect(document).toContain("call('audio.readHistory'");
    expect(document).toContain("call('audio.downloadHistory'");
    expect(document).toContain("call('audio.addHistoryToCanvasAssets'");
    expect(document).toContain("call('audio.deleteHistory'");
    expect(document).toContain("call('audio.cancel')");
    expect(document).toContain("call('preferences.read'");
    expect(document).toContain("call('preferences.write'");
    expect(document).toContain("call('preferences.delete'");
    expect(document).toContain("call('canvas.createProjectGraph'");
    expect(document).toContain("call('documents.read'");
    expect(document).toContain("call('documents.write'");
    expect(document).toContain("call('documents.delete'");
    expect(document).toContain("call('styleCovers.read'");
    expect(document).toContain("call('styleCovers.write'");
    expect(document).toContain("call('styleCovers.delete'");
    expect(document).toContain("call('models.listText'");
    expect(document).toContain("call('models.runText'");
    expect(document).toContain("call('models.listImage'");
    expect(document).toContain("call('models.listVideo'");
    expect(document).toContain("call('models.runImage'");
    expect(document).toContain("call('models.runVideo'");
    expect(document).toContain("call('models.previewMedia'");
    expect(document).toContain('receipt.preview instanceof Blob');
    expect(document).toContain('URL.createObjectURL(receipt.preview)');
    expect(document).toContain('URL.revokeObjectURL(previewUrl)');
    expect(document).toContain("call('models.inspectMedia'");
    expect(document).toContain("call('models.downloadMedia'");
    expect(document).toContain("call('host.downloadFile'");
    expect(document).toContain("call('vision.listPoseEngines')");
    expect(document).toContain("call('vision.installPoseEngine'");
    expect(document).toContain("call('vision.poseEngineInstallStatus'");
    expect(document).toContain("call('vision.cancelPoseEngineInstall'");
    expect(document).toContain("call('vision.uninstallPoseEngine'");
    expect(document).toContain("call('vision.listDepthModels')");
    expect(document).toContain("call('vision.installDepthModel'");
    expect(document).toContain("call('vision.renderDepthFrame'");
    expect(document).toContain("call('vision.persistMotionSourceVideo'");
    expect(document).toContain("call('vision.readMotionSourceVideo'");
    expect(document).toContain("call('vision.detectPose'");
    expect(document).toContain("call('vision.startPoseCapture'");
    expect(document).toContain("call('vision.poseCaptureStatus'");
    expect(document).toContain("call('vision.poseCaptureResult'");
    expect(document).toContain("call('vision.cancelPoseCapture'");
    expect(document).toContain('[request.bytes]');
    expect(document).toContain("call('vision.mountRigPreview'");
    expect(document).not.toContain('transferControlToOffscreen');
    expect(document).toContain("request.canvas.getContext('bitmaprenderer')");
    expect(document).toContain('bitmap instanceof ImageBitmap');
    expect(document).toContain('[channel.port2]');
    expect(document).toContain("api.requestClose = () => call('host.requestClose')");
    expect(document.indexOf("call('canvas.createProjectGraph'")).toBeGreaterThan(
      document.indexOf('if (context.apiVersion >= 2)'),
    );
    expect(document).toContain("connect-src 'none'");
  });

  it('exposes an isolated live locale without rebuilding the sandbox document', () => {
    const documentSource = buildPluginSandboxDocument('', 'locale-session', {
      apiVersion: 2,
      pluginId: 'audio-tools',
      pluginName: 'Audio tools',
      view: 'tts',
      locale: 'en-US',
      permissions: [],
      assets: [],
    });
    expect(documentSource).toContain('<html lang="en-US">');
    const bootstrap = [...documentSource.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]?.[1];
    expect(bootstrap).toBeTruthy();

    const listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();
    const events: Array<{ type: string; detail?: unknown }> = [];
    const parent = { postMessage() {} };
    const sandboxWindow: { qiansi?: { context: { locale: string } } } = {};
    const documentElement = { lang: 'en-US' };
    class TestCustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail?: unknown } = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    }
    runInNewContext(bootstrap || '', {
      window: sandboxWindow,
      parent,
      document: { documentElement },
      CustomEvent: TestCustomEvent,
      dispatchEvent(event: { type: string; detail?: unknown }) {
        events.push(event);
      },
      addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    });

    expect(sandboxWindow.qiansi?.context.locale).toBe('en-US');
    const message = listeners.get('message')?.[0];
    message?.({
      source: parent,
      data: {
        source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
        sessionId: 'locale-session',
        type: 'host-context',
        locale: 'zh-CN',
      },
    });
    expect(sandboxWindow.qiansi?.context.locale).toBe('zh-CN');
    expect(documentElement.lang).toBe('zh-CN');
    expect(events[0]).toMatchObject({
      type: 'qiansi:languagechange',
      detail: { locale: 'zh-CN' },
    });
  });

  it('exposes only the dedicated bounded Seed Audio credential writer to its runtime', () => {
    const document = buildPluginSandboxDocument('', 'seed-audio-settings', {
      apiVersion: 2,
      pluginId: 'doubao-seed-audio',
      pluginName: 'Qainsi Seed Audio Studio',
      view: 'doubao-seed-audio-studio',
      permissions: ['audio:generate'],
      assets: [],
    });
    expect(document).toContain("context.pluginId === 'doubao-seed-audio'");
    expect(document).toContain('configureSeedAudioApiKey');
    expect(document).toContain("call('audio.configureSeedAudioKey', { apiKey })");
    expect(document).not.toContain('openVolcengineApiSettings');
    expect(sanitizePluginSeedAudioCredentialRequest({ apiKey: '  direct-secret  ' })).toEqual({
      apiKey: 'direct-secret',
    });
    expect(() =>
      sanitizePluginSeedAudioCredentialRequest({
        apiKey: 'direct-secret',
        endpoint: 'https://evil.test',
      }),
    ).toThrow('未知字段');
    expect(() => sanitizePluginSeedAudioCredentialRequest({ apiKey: '' })).toThrow('不能为空');
    expect(() => sanitizePluginSeedAudioCredentialRequest({ apiKey: 'bad\nkey' })).toThrow(
      '控制字符',
    );
    expect(
      parsePluginSandboxCall(
        {
          source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
          sessionId: 'seed-audio-settings',
          requestId: 'request-1',
          method: 'audio.configureSeedAudioKey',
          payload: { apiKey: 'direct-secret' },
        },
        'seed-audio-settings',
      )?.method,
    ).toBe('audio.configureSeedAudioKey');
    expect(
      parsePluginSandboxCall(
        {
          source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
          sessionId: 'seed-audio-settings',
          requestId: 'request-1',
          method: 'host.openApiSettings',
          payload: { providerId: 'volcengine' },
        },
        'seed-audio-settings',
      ),
    ).toBeNull();
  });

  it('accepts only a bounded AutoDL token for the novel production queue', () => {
    expect(sanitizePluginAutoDlH3ConnectionRequest({ token: '  secure-token  ' })).toEqual({
      token: 'secure-token',
    });
    expect(() =>
      sanitizePluginAutoDlH3ConnectionRequest({
        token: 'secure-token',
        baseUrl: 'https://evil.test',
      }),
    ).toThrow('未知字段');
    expect(() => sanitizePluginAutoDlH3ConnectionRequest({ token: '' })).toThrow('不能为空');

    expect(
      parsePluginSandboxCall(
        {
          source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
          sessionId: 'novel-video-settings',
          requestId: 'request-2',
          method: 'models.configureAutoDlH3Connection',
          payload: { token: 'secure-token' },
        },
        'novel-video-settings',
      )?.method,
    ).toBe('models.configureAutoDlH3Connection');
  });

  it('accepts only calls from the matching sandbox session', () => {
    const call = {
      source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
      sessionId: 'session-1',
      requestId: '4',
      method: 'canvas.notify',
      payload: { message: 'ok' },
    };
    expect(parsePluginSandboxCall(call, 'session-1')?.method).toBe('canvas.notify');
    expect(
      parsePluginSandboxCall({ ...call, method: 'audio.listGenerators' }, 'session-1')?.method,
    ).toBe('audio.listGenerators');
    expect(
      parsePluginSandboxCall(
        {
          ...call,
          method: 'audio.installGenerator',
          payload: { generatorId: 'chattts-local', licenseAcceptance: 'a'.repeat(64) },
        },
        'session-1',
      )?.method,
    ).toBe('audio.installGenerator');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'audio.uninstallGenerator', payload: { generatorId: 'chattts-local' } },
        'session-1',
      )?.method,
    ).toBe('audio.uninstallGenerator');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'audio.listHistory', payload: { generatorId: 'voxcpm2-local' } },
        'session-1',
      )?.method,
    ).toBe('audio.listHistory');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'audio.listReferenceLibrary', payload: undefined },
        'session-1',
      )?.method,
    ).toBe('audio.listReferenceLibrary');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'audio.readReferenceLibrary', payload: { id: 'a'.repeat(32) } },
        'session-1',
      )?.method,
    ).toBe('audio.readReferenceLibrary');
    expect(
      parsePluginSandboxCall(
        {
          ...call,
          method: 'audio.importReferenceLibrary',
          payload: { fileName: 'voice.wav', mimeType: 'audio/wav', base64: 'UklGRg==' },
        },
        'session-1',
      )?.method,
    ).toBe('audio.importReferenceLibrary');
    expect(
      parsePluginSandboxCall(
        {
          ...call,
          method: 'audio.readHistory',
          payload: { generatorId: 'voxcpm2-local', historyId: 'history-0001' },
        },
        'session-1',
      )?.method,
    ).toBe('audio.readHistory');
    expect(
      parsePluginSandboxCall(
        {
          ...call,
          method: 'audio.downloadHistory',
          payload: { generatorId: 'voxcpm2-local', historyId: 'history-0001' },
        },
        'session-1',
      )?.method,
    ).toBe('audio.downloadHistory');
    expect(
      parsePluginSandboxCall(
        {
          ...call,
          method: 'audio.addHistoryToCanvasAssets',
          payload: { generatorId: 'voxcpm2-local', historyId: 'history-0001' },
        },
        'session-1',
      )?.method,
    ).toBe('audio.addHistoryToCanvasAssets');
    expect(
      parsePluginSandboxCall(
        {
          ...call,
          method: 'audio.deleteHistory',
          payload: { generatorId: 'voxcpm2-local', historyId: 'history-0001' },
        },
        'session-1',
      )?.method,
    ).toBe('audio.deleteHistory');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'preferences.read', payload: { key: 'voice-presets.v1' } },
        'session-1',
      )?.method,
    ).toBe('preferences.read');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'styles.readSample', payload: { packId: 'dunhuang-flying-apsara' } },
        'session-1',
      )?.method,
    ).toBe('styles.readSample');
    expect(
      parsePluginSandboxCall(
        {
          ...call,
          method: 'styles.uploadSample',
          payload: { packId: 'dunhuang-flying-apsara', mimeType: 'image/png' },
        },
        'session-1',
      )?.method,
    ).toBe('styles.uploadSample');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'canvas.createProjectGraph', payload: { name: '新项目' } },
        'session-1',
      )?.method,
    ).toBe('canvas.createProjectGraph');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'canvas.readSelectedImage', payload: undefined },
        'session-1',
      )?.method,
    ).toBe('canvas.readSelectedImage');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'canvas.readSelectedVideo', payload: undefined },
        'session-1',
      )?.method,
    ).toBe('canvas.readSelectedVideo');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'documents.write', payload: { key: 'project.v1', value: {} } },
        'session-1',
      )?.method,
    ).toBe('documents.write');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'models.runText', payload: { operation: 'run_specialist' } },
        'session-1',
      )?.method,
    ).toBe('models.runText');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'vision.listPoseEngines', payload: undefined },
        'session-1',
      )?.method,
    ).toBe('vision.listPoseEngines');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'vision.detectPose', payload: { timestampMs: 0 } },
        'session-1',
      )?.method,
    ).toBe('vision.detectPose');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'vision.startPoseCapture', payload: { engineId: 'gem-x' } },
        'session-1',
      )?.method,
    ).toBe('vision.startPoseCapture');
    expect(
      parsePluginSandboxCall(
        { ...call, method: 'vision.mountRigPreview', payload: {} },
        'session-1',
      )?.method,
    ).toBe('vision.mountRigPreview');
    for (const method of [
      'models.listImage',
      'models.listVideo',
      'models.runImage',
      'models.runVideo',
      'models.previewMedia',
      'canvas.readManagedImageCopy',
      'models.inspectMedia',
      'models.downloadMedia',
      'host.chooseSaveFile',
      'host.downloadFile',
      'vision.persistMotionSourceVideo',
      'vision.readMotionSourceVideo',
    ] as const) {
      expect(parsePluginSandboxCall({ ...call, method }, 'session-1')?.method).toBe(method);
    }
    expect(parsePluginSandboxCall(call, 'other-session')).toBeNull();
    expect(parsePluginSandboxCall({ ...call, method: 'secrets.read' }, 'session-1')).toBeNull();
  });

  it('accepts only bounded WebM downloads with safe file names', () => {
    expect(
      sanitizePluginHostSaveFileRequest({
        mimeType: 'video/webm',
        fileName: 'clip-white-model-10fps.webm',
      }),
    ).toEqual({ mimeType: 'video/webm', fileName: 'clip-white-model-10fps.webm' });
    const request = sanitizePluginHostDownloadRequest({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'video/webm',
      fileName: 'clip-white-model-10fps.webm',
      destinationId: 'save-12345678-1234-1234-1234-123456789abc',
    });
    expect(request.bytes.byteLength).toBe(3);
    expect(request.fileName).toBe('clip-white-model-10fps.webm');
    expect(request.destinationId).toBe('save-12345678-1234-1234-1234-123456789abc');
    expect(() => sanitizePluginHostDownloadRequest({ ...request, mimeType: 'video/mp4' })).toThrow(
      /仅支持 video\/webm/,
    );
    expect(() =>
      sanitizePluginHostDownloadRequest({ ...request, fileName: '..\\unsafe.webm' }),
    ).toThrow(/文件名无效/);
    expect(() =>
      sanitizePluginHostDownloadRequest({ ...request, destinationId: 'invalid' }),
    ).toThrow(/保存位置 ID 无效/);
    expect(() =>
      sanitizePluginHostDownloadRequest({ ...request, bytes: new ArrayBuffer(0) }),
    ).toThrow(/大于 0 字节/);
  });

  it('accepts only bounded motion source videos and stable local asset ids', () => {
    const request = sanitizePluginMotionSourceStoreRequest({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'video/mp4',
      fileName: 'IMG_7013.mp4',
    });
    expect(request.bytes.byteLength).toBe(3);
    expect(request).toMatchObject({ mimeType: 'video/mp4', fileName: 'IMG_7013.mp4' });
    expect(sanitizePluginMotionSourceReadRequest({ assetId: 'asset_123456' })).toEqual({
      assetId: 'asset_123456',
    });
    expect(() =>
      sanitizePluginMotionSourceStoreRequest({ ...request, mimeType: 'application/octet-stream' }),
    ).toThrow(/仅支持 MP4、WebM 或 MOV/);
    expect(() =>
      sanitizePluginMotionSourceStoreRequest({ ...request, fileName: '..\\source.mp4' }),
    ).toThrow(/文件名无效/);
    expect(() => sanitizePluginMotionSourceReadRequest({ assetId: '../unsafe' })).toThrow(
      /素材 ID 无效/,
    );
  });

  it('accepts only bounded local pose frames', () => {
    const request = sanitizePluginPoseFrameRequest({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'image/jpeg',
      timestampMs: 1250,
      width: 640,
      height: 360,
      maxPoses: 4,
    });
    expect(request).toMatchObject({
      mimeType: 'image/jpeg',
      timestampMs: 1250,
      width: 640,
      height: 360,
      maxPoses: 4,
    });
    expect(request.bytes.byteLength).toBe(3);
    expect(() =>
      sanitizePluginPoseFrameRequest({
        ...request,
        bytes: new ArrayBuffer(1_500_001),
      }),
    ).toThrow(/1\.5 MB/);
    expect(() => sanitizePluginPoseFrameRequest({ ...request, mimeType: 'video/mp4' })).toThrow(
      /类型无效/,
    );
    expect(() => sanitizePluginPoseFrameRequest({ ...request, width: 4096 })).toThrow(/尺寸无效/);
    expect(() => sanitizePluginPoseFrameRequest({ ...request, maxPoses: 5 })).toThrow(/1 到 4/);
  });

  it('accepts only bounded AI video jobs and fixed engine identifiers', () => {
    const request = sanitizePluginPoseCaptureRequest({
      engineId: 'rtmw3d',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      fileName: 'motion.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 22,
      width: 720,
      height: 1280,
      sampleFps: 10,
      maxPoses: 2,
      confidenceThreshold: 0.45,
      smoothing: 0.65,
      staticCamera: false,
      detectionThreshold: 0.35,
      trackingMethod: 'oks',
      trackingThreshold: 0.4,
    });
    expect(request).toMatchObject({
      engineId: 'rtmw3d',
      sampleFps: 10,
      maxPoses: 2,
      detectionThreshold: 0.35,
      trackingMethod: 'oks',
      trackingThreshold: 0.4,
    });
    expect(() => sanitizePluginPoseCaptureRequest({ ...request, engineId: 'remote' })).toThrow(
      /引擎无效/,
    );
    expect(() => sanitizePluginPoseCaptureRequest({ ...request, maxPoses: 5 })).toThrow(/人物上限/);
    expect(() => sanitizePluginPoseCaptureRequest({ ...request, sampleFps: 7 })).toThrow(
      /5、10 或 15/,
    );
    expect(() =>
      sanitizePluginPoseCaptureRequest({ ...request, engineId: 'gem-x', maxPoses: 2 }),
    ).toThrow(/单次只支持一个人物/);
    expect(() => sanitizePluginPoseCaptureRequest({ ...request, staticCamera: 'yes' })).toThrow(
      /相机运动假设/,
    );
    expect(() =>
      sanitizePluginPoseCaptureRequest({ ...request, trackingMethod: 'center' }),
    ).toThrow(/人物跟踪方式/);
    expect(() => sanitizePluginPoseCaptureRequest({ ...request, detectionThreshold: 1.1 })).toThrow(
      /人体检测阈值/,
    );
    expect(() => sanitizePluginPoseCaptureRequest({ ...request, trackingThreshold: -0.1 })).toThrow(
      /人物跟踪阈值/,
    );
    expect(
      sanitizePluginPoseCaptureJobRequest({
        engineId: 'gem-x',
        jobId: '12345678-1234-4123-8123-123456789abc',
      }),
    ).toEqual({ engineId: 'gem-x', jobId: '12345678-1234-4123-8123-123456789abc' });
  });

  it('accepts only the fixed dense-vision models and bounded white-model frames', () => {
    expect(sanitizePluginDepthModelInstallRequest({ modelId: 'depth-anything-v2-small' })).toEqual({
      modelId: 'depth-anything-v2-small',
    });
    expect(sanitizePluginDepthModelInstallRequest({ modelId: 'sapiens2-normal-0.4b' })).toEqual({
      modelId: 'sapiens2-normal-0.4b',
    });
    expect(() => sanitizePluginDepthModelInstallRequest({ modelId: 'remote-model' })).toThrow(
      /不支持/,
    );
    const request = sanitizePluginDepthFrameRequest({
      modelId: 'sapiens2-normal-0.4b',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'image/webp',
      timestampMs: 500,
      width: 640,
      height: 360,
      backend: 'wasm',
      inputSize: 518,
      wasmThreads: 4,
      gpuPowerPreference: 'high-performance',
      temporalSmoothing: 0.25,
      invert: false,
      blackPoint: 0.04,
      whitePoint: 0.96,
      gamma: 0.9,
    });
    expect(request.modelId).toBe('sapiens2-normal-0.4b');
    expect(() => sanitizePluginDepthFrameRequest({ ...request, modelId: 'other' })).toThrow(
      /模型无效/,
    );
    expect(
      sanitizePluginDepthFrameRequest({
        bytes: new Uint8Array([1]).buffer,
        mimeType: 'image/jpeg',
        timestampMs: 0,
        width: 320,
        height: 180,
        backend: 'webgpu',
        invert: false,
        blackPoint: 0.04,
        whitePoint: 0.96,
        gamma: 0.9,
      }),
    ).toMatchObject({
      inputSize: 518,
      wasmThreads: 0,
      gpuPowerPreference: 'high-performance',
      temporalSmoothing: 0,
    });
    expect(request).toMatchObject({
      mimeType: 'image/webp',
      timestampMs: 500,
      width: 640,
      height: 360,
      backend: 'wasm',
      inputSize: 518,
      wasmThreads: 4,
      gpuPowerPreference: 'high-performance',
      temporalSmoothing: 0.25,
      invert: false,
      blackPoint: 0.04,
      whitePoint: 0.96,
      gamma: 0.9,
    });
    expect(() => sanitizePluginDepthFrameRequest({ ...request, gamma: 8 })).toThrow(/Gamma/);
    expect(() => sanitizePluginDepthFrameRequest({ ...request, backend: 'cuda' })).toThrow(
      /WebGPU 或 CPU WASM/,
    );
    expect(() => sanitizePluginDepthFrameRequest({ ...request, inputSize: 500 })).toThrow(
      /392、518 或 686/,
    );
    expect(() => sanitizePluginDepthFrameRequest({ ...request, wasmThreads: 16 })).toThrow(
      /线程数/,
    );
    expect(() =>
      sanitizePluginDepthFrameRequest({ ...request, gpuPowerPreference: 'maximum' }),
    ).toThrow(/性能倾向/);
    expect(() => sanitizePluginDepthFrameRequest({ ...request, temporalSmoothing: 1 })).toThrow(
      /时序平滑/,
    );
    expect(() =>
      sanitizePluginDepthFrameRequest({ ...request, blackPoint: 0.8, whitePoint: 0.85 }),
    ).toThrow(/黑白场/);
  });

  it('sanitizes bounded reference audio imports', () => {
    expect(
      sanitizePluginReferenceAudioImport({
        fileName: 'voice.wav',
        mimeType: 'audio/x-wav',
        base64: 'UklGRg==',
      }),
    ).toEqual({ fileName: 'voice.wav', mimeType: 'audio/x-wav', base64: 'UklGRg==' });
    expect(() =>
      sanitizePluginReferenceAudioImport({
        fileName: '../voice.wav',
        mimeType: 'audio/wav',
        base64: 'UklGRg==',
      }),
    ).toThrow('参考音频文件名无效');
    expect(() =>
      sanitizePluginReferenceAudioImport({
        fileName: 'voice.wav',
        mimeType: 'audio/wav',
        base64: 'not-base64',
      }),
    ).toThrow('Base64');
  });

  it('sanitizes reference audio category creation', () => {
    expect(sanitizePluginReferenceAudioCategory({ category: '角色' })).toBe('角色');
    expect(() => sanitizePluginReferenceAudioCategory({ category: '../越界' })).toThrow(
      '参考音频分类无效',
    );
    expect(() => sanitizePluginReferenceAudioCategory({ category: '未分类' })).toThrow(
      '参考音频分类无效',
    );
  });

  it('lets a dismissible iframe request only its own host view to close on Escape', () => {
    const document = buildPluginSandboxDocument('', 'fullscreen-session', {
      apiVersion: 2,
      pluginId: 'audio-tools',
      pluginName: 'Audio tools',
      view: 'fullscreen-studio',
      canRequestClose: true,
      permissions: [],
      assets: [],
    });
    const bootstrap = [...document.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]?.[1];
    expect(bootstrap).toBeTruthy();

    const listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();
    const messages: unknown[] = [];
    runInNewContext(bootstrap || '', {
      window: {},
      parent: {
        postMessage(message: unknown) {
          messages.push(message);
        },
      },
      addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    });

    const keydown = listeners.get('keydown')?.[0];
    expect(keydown).toBeTypeOf('function');
    keydown?.({
      key: 'Escape',
      isComposing: true,
      preventDefault() {},
      stopPropagation() {},
    });
    expect(messages).toHaveLength(0);

    let prevented = false;
    let stopped = false;
    keydown?.({
      key: 'Escape',
      isComposing: false,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    });
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(messages).toHaveLength(1);
    const postedMessage = JSON.parse(JSON.stringify(messages[0])) as Record<string, unknown>;
    expect(parsePluginSandboxCall(postedMessage, 'fullscreen-session')?.method).toBe(
      'host.requestClose',
    );
    expect(
      parsePluginSandboxCall(
        {
          ...postedMessage,
          payload: { pluginId: 'other-plugin', panelId: 'other-panel' },
        },
        'fullscreen-session',
      ),
    ).toBeNull();
    expect(parsePluginSandboxCall(postedMessage, 'other-session')).toBeNull();
  });

  it('limits node mutation fields and requested host kinds', () => {
    expect(
      sanitizePluginNodePatch({
        title: 'Plugin title',
        output: { ok: true },
        providerId: 'must-not-change',
        apiKey: 'must-not-leak',
        kind: 'director-3d',
      }),
    ).toEqual({ title: 'Plugin title', output: { ok: true } });
    expect(
      sanitizePluginAddNodeRequest({
        kind: 'video',
        position: { x: 120, y: -80 },
        data: { title: '插件视频', prompt: '镜头向前推进' },
      }),
    ).toEqual({
      kind: 'video',
      position: { x: 120, y: -80 },
      data: { title: '插件视频', prompt: '镜头向前推进' },
    });
    expect(() => sanitizePluginAddNodeRequest({ kind: 'shell' })).toThrow('不受支持');
    expect(() => sanitizePluginAddNodeRequest({ kind: 'plugin' })).toThrow('不受支持');
  });

  it('sanitizes a bounded native project graph without accepting model or secret fields', () => {
    expect(
      sanitizePluginProjectGraphRequest({
        applicationId: 'delivery-white-pure-v1',
        name: '白小纯·分镜画布',
        nodes: [
          {
            clientId: 'script_1',
            kind: 'text',
            position: { x: 20, y: 30 },
            data: {
              title: '镜头 1',
              prompt: '夜景中向前推进',
              providerId: 'must-not-bind',
              model: 'must-not-bind',
              apiKey: 'must-not-leak',
            },
          },
          {
            clientId: 'video_1',
            kind: 'video',
            position: { x: 500, y: 30 },
            data: {
              shotId: 'shot-001',
              role: 'video',
              mediaId: 'media-12345678-1234-4abc-8def-1234567890ab',
            },
          },
        ],
        edges: [{ clientId: 'edge_1', source: 'script_1', target: 'video_1' }],
      }),
    ).toEqual({
      applicationId: 'delivery-white-pure-v1',
      name: '白小纯·分镜画布',
      nodes: [
        {
          clientId: 'script_1',
          kind: 'text',
          position: { x: 20, y: 30 },
          data: { title: '镜头 1', prompt: '夜景中向前推进' },
        },
        {
          clientId: 'video_1',
          kind: 'video',
          position: { x: 500, y: 30 },
          data: {
            shotId: 'shot-001',
            role: 'video',
            mediaId: 'media-12345678-1234-4abc-8def-1234567890ab',
          },
        },
      ],
      edges: [{ clientId: 'edge_1', source: 'script_1', target: 'video_1' }],
    });
    expect(() =>
      sanitizePluginProjectGraphRequest({
        applicationId: 'delivery-invalid-name',
        name: '../越界',
        nodes: [{ clientId: 'node_1', kind: 'text' }],
        edges: [],
      }),
    ).toThrow('无效字符');
    expect(() =>
      sanitizePluginProjectGraphRequest({
        applicationId: 'delivery-invalid-kind',
        name: '非法节点',
        nodes: [{ clientId: 'node_1', kind: 'plugin' }],
        edges: [],
      }),
    ).toThrow('节点类型不受支持');
    expect(() =>
      sanitizePluginProjectGraphRequest({
        name: '缺少幂等 ID',
        nodes: [{ clientId: 'node_1', kind: 'text' }],
        edges: [],
      }),
    ).toThrow('建图应用 ID');
    expect(() =>
      sanitizePluginProjectGraphRequest({
        applicationId: 'short',
        name: '幂等 ID 过短',
        nodes: [{ clientId: 'node_1', kind: 'text' }],
        edges: [],
      }),
    ).toThrow('8 到 80 位');
    expect(
      sanitizePluginProjectGraphRequest({
        applicationId: 'delivery-explicit-retry',
        retryFailed: true,
        name: '明确重试',
        nodes: [{ clientId: 'node_1', kind: 'text' }],
        edges: [],
      }),
    ).toMatchObject({ applicationId: 'delivery-explicit-retry', retryFailed: true });
    expect(() =>
      sanitizePluginProjectGraphRequest({
        applicationId: 'delivery-forged-media-url',
        name: '伪造媒体地址',
        nodes: [
          {
            clientId: 'image_1',
            kind: 'image',
            data: { imageUrl: 'file:///C:/secret.png' },
          },
        ],
        edges: [],
      }),
    ).toThrow('不能直接提供媒体 URL');
    expect(() =>
      sanitizePluginProjectGraphRequest({
        applicationId: 'delivery-forged-references',
        name: '伪造引用列表',
        nodes: [
          {
            clientId: 'video_1',
            kind: 'video',
            data: { referenceMediaIds: ['media-12345678-1234-4abc-8def-1234567890ab'] },
          },
        ],
        edges: [],
      }),
    ).toThrow('不能直接提供媒体 URL');
  });

  it('accepts bounded opaque image references and rejects URLs, duplicates and excess references', () => {
    const base = { providerId: 'image-main', model: 'image-v1', prompt: '两张资产图组成首帧' };
    const ids = Array.from(
      { length: 16 },
      (_, index) => `media-12345678-1234-4abc-8def-${String(index).padStart(12, '0')}`,
    );
    expect(sanitizePluginManagedImageRequest({ ...base, referenceMediaIds: ids })).toMatchObject({
      referenceMediaIds: ids,
    });
    expect(sanitizePluginManagedImageRequest(base)).not.toHaveProperty('referenceMediaIds');
    expect(() =>
      sanitizePluginManagedImageRequest({ ...base, referenceMediaIds: [...ids, ids[0]] }),
    ).toThrow('不能超过 16 项');
    expect(() =>
      sanitizePluginManagedImageRequest({ ...base, referenceMediaIds: [ids[0], ids[0]] }),
    ).toThrow('不能重复');
    for (const invalid of ['https://example.test/image.png', 'F:/private/image.png']) {
      expect(() =>
        sanitizePluginManagedImageRequest({ ...base, referenceMediaIds: [invalid] }),
      ).toThrow('受管媒体 ID');
    }
    expect(() =>
      sanitizePluginManagedImageRequest({
        ...base,
        referenceImages: ['https://example.test/image.png'],
      }),
    ).toThrow('未知字段');
  });

  it('strictly bounds managed image, video and download requests', () => {
    const image = sanitizePluginManagedImageRequest({
      providerId: 'openai-main',
      model: 'image-model-v1',
      prompt: '东方云海中的宫殿。',
      requestId: 'shot-image-0001',
      size: '1024x1024',
      aspectRatio: '1:1',
      quality: '2K',
    });
    expect(image).toMatchObject({ size: '1024x1024', aspectRatio: '1:1', quality: '2K' });

    const mediaId = 'media-12345678-1234-4abc-8def-1234567890ab';
    expect(
      sanitizePluginManagedVideoRequest({
        providerId: 'video-main',
        model: 'video-model-v1',
        prompt: '摄影机缓慢推进。',
        duration: 10,
        aspectRatio: '16:9',
        resolution: '1080P',
        audio: true,
        referenceMediaIds: [mediaId],
      }),
    ).toMatchObject({
      duration: 10,
      aspectRatio: '16:9',
      resolution: '1080P',
      audio: true,
      referenceMediaIds: [mediaId],
    });
    expect(
      sanitizePluginManagedMediaDownloadRequest({ mediaId, fileName: 'shot-001.mp4' }),
    ).toEqual({ mediaId, fileName: 'shot-001.mp4' });
    expect(sanitizePluginManagedMediaInspectRequest({ mediaId })).toEqual({ mediaId });
    expect(sanitizePluginManagedVideoFrameRequest({ mediaId })).toEqual({
      mediaId,
      position: 'last',
    });
    expect(sanitizePluginManagedVideoFrameRequest({ mediaId, position: 'first' })).toEqual({
      mediaId,
      position: 'first',
    });
    expect(() =>
      sanitizePluginManagedImageRequest({
        providerId: 'openai-main',
        model: 'image-model-v1',
        prompt: 'test',
        baseUrl: 'https://evil.example',
      }),
    ).toThrow('未知字段');
    expect(() =>
      sanitizePluginManagedVideoRequest({
        providerId: 'video-main',
        model: 'video-model-v1',
        prompt: 'test',
        duration: 31,
      }),
    ).toThrow('1 到 30 秒');
    expect(() =>
      sanitizePluginManagedMediaDownloadRequest({ mediaId, fileName: '../secret.mp4' }),
    ).toThrow('文件名无效');
    expect(() => sanitizePluginManagedVideoFrameRequest({ mediaId, position: 'middle' })).toThrow(
      '只能是 first 或 last',
    );
  });

  it('bounds project-document revisions and managed text requests at the sandbox boundary', () => {
    expect(
      sanitizePluginDocumentRequest({
        key: 'project:white-pure.v1',
        value: { stage: 'shots' },
        expectedRevision: 2,
      }),
    ).toEqual({ key: 'project:white-pure.v1', value: { stage: 'shots' }, expectedRevision: 2 });
    expect(() => sanitizePluginDocumentRequest({ key: '../project' })).toThrow('键格式无效');
    expect(() =>
      sanitizePluginDocumentRequest({ key: 'qiansi-host:graph-application:forged' }),
    ).toThrow('宿主保留命名空间');
    expect(() =>
      sanitizePluginDocumentRequest({ key: 'project.v1', expectedRevision: -1 }),
    ).toThrow('修订号无效');

    expect(
      sanitizePluginManagedTextRequest({
        providerId: 'openai-main',
        model: 'gpt-5',
        operation: 'run_specialist',
        prompt: '请输出结构化分镜。',
        temperature: 0.4,
        maxLength: 4096,
      }),
    ).toEqual({
      providerId: 'openai-main',
      model: 'gpt-5',
      operation: 'run_specialist',
      prompt: '请输出结构化分镜。',
      temperature: 0.4,
      maxLength: 4096,
    });
    expect(() =>
      sanitizePluginManagedTextRequest({
        providerId: 'openai-main',
        model: 'gpt-5',
        operation: 'run_specialist',
        prompt: '"'.repeat(200_000),
      }),
    ).toThrow('384 KiB');
  });

  it('returns only bounded JSON-safe values from the owning plugin node inputs', () => {
    expect(
      sanitizePluginOwnInputs({
        text: ['要合成的台词'],
        'reference-audio': ['http://127.0.0.1:2895/asset-library/files/audio-1'],
        '../secret': ['hidden'],
        empty: [undefined],
      }),
    ).toEqual({
      text: ['要合成的台词'],
      'reference-audio': ['http://127.0.0.1:2895/asset-library/files/audio-1'],
    });
  });

  it('resolves trusted plugin audio references to the exact current bridge URL', () => {
    const currentAudioUrl = `${BRIDGE_BASE_URL}/asset-library/files/audio-1`;
    expect(resolvePluginAudioReferenceUrl('/asset-library/files/audio-1')).toBe(currentAudioUrl);
    expect(
      resolvePluginAudioReferenceUrl('http://127.0.0.1:2896/asset-library/files/audio-1'),
    ).toBe(currentAudioUrl);
    expect(resolvePluginAudioReferenceUrl('blob:http://127.0.0.1/audio-session')).toBe(
      'blob:http://127.0.0.1/audio-session',
    );
    expect(resolvePluginAudioReferenceUrl('data:audio/webm;base64,AAAA')).toBe(
      'data:audio/webm;base64,AAAA',
    );
    expect(() => resolvePluginAudioReferenceUrl('https://example.com/audio.webm')).toThrow(
      '不是受信任的画布媒体地址',
    );
  });

  it('resolves only session-owned or current-bridge canvas videos', () => {
    const currentVideoUrl = `${BRIDGE_BASE_URL}/asset-library/files/video-1`;
    expect(resolvePluginCanvasVideoUrl('/asset-library/files/video-1')).toBe(currentVideoUrl);
    expect(resolvePluginCanvasVideoUrl('http://127.0.0.1:2896/asset-library/files/video-1')).toBe(
      currentVideoUrl,
    );
    expect(resolvePluginCanvasVideoUrl('blob:http://127.0.0.1/video-session')).toBe(
      'blob:http://127.0.0.1/video-session',
    );
    expect(resolvePluginCanvasVideoUrl('data:video/mp4;base64,AAAA')).toBe(
      'data:video/mp4;base64,AAAA',
    );
    expect(() => resolvePluginCanvasVideoUrl('https://example.com/video.mp4')).toThrow(
      '不是受信任的画布媒体地址',
    );
    expect(() => resolvePluginCanvasVideoUrl('file:///C:/private/video.mp4')).toThrow(
      '不是受信任的画布媒体地址',
    );
  });

  it('bounds requests for an image connected to the owning plugin node', () => {
    expect(sanitizePluginOwnImageRequest()).toEqual({ portId: 'in', index: 0 });
    expect(sanitizePluginOwnImageRequest({ portId: 'reference-image', index: 2 })).toEqual({
      portId: 'reference-image',
      index: 2,
    });
    expect(() => sanitizePluginOwnImageRequest({ portId: '../secret' })).toThrow('端口无效');
    expect(() => sanitizePluginOwnImageRequest({ index: 16 })).toThrow('0 到 15');
  });

  it('sanitizes VoxCPM-style audio requests and rejects unsafe references', () => {
    const reference = btoa('small audio');
    expect(
      sanitizePluginAudioGenerationCall({
        generatorId: 'voxcpm2-local',
        request: {
          mode: 'hifi',
          text: '你好，欢迎使用千丝画布。',
          control: '温暖、平静的女声',
          referenceAudio: {
            base64: reference,
            mimeType: 'audio/wav',
            fileName: 'voice.wav',
          },
          options: {
            promptText: '这是一段参考语音。',
            cfgValue: 2,
            inferenceTimesteps: 10,
            seed: 42,
            temperature: 0.3,
            topP: 0.7,
            topK: 12,
            textSeed: 24,
            refineText: true,
            speed: 5,
            oral: 3,
            laugh: 1,
            breakLevel: 4,
            splitBatch: 16,
            engineTask: 'instruct',
            language: 'Chinese',
            speaker: 'Vivian',
            speechRate: 1.25,
            durationSeconds: 45,
            audioFormat: 'mp3',
            qwenTemperature: 0.9,
            qwenTopP: 1,
            qwenTopK: 50,
            qwenRepetitionPenalty: 1.05,
            xVectorOnly: false,
            normalize: true,
            voiceConsent: true,
            homophoneReplacement: false,
            ignored: 'not forwarded',
          },
        },
      }),
    ).toEqual({
      generatorId: 'voxcpm2-local',
      request: {
        mode: 'hifi',
        text: '你好，欢迎使用千丝画布。',
        control: '温暖、平静的女声',
        referenceAudio: {
          base64: reference,
          mimeType: 'audio/wav',
          fileName: 'voice.wav',
        },
        options: {
          promptText: '这是一段参考语音。',
          cfgValue: 2,
          inferenceTimesteps: 10,
          seed: 42,
          temperature: 0.3,
          topP: 0.7,
          topK: 12,
          textSeed: 24,
          speed: 5,
          oral: 3,
          laugh: 1,
          breakLevel: 4,
          splitBatch: 16,
          engineTask: 'instruct',
          language: 'Chinese',
          speaker: 'Vivian',
          speechRate: 1.25,
          durationSeconds: 45,
          audioFormat: 'mp3',
          qwenTemperature: 0.9,
          qwenTopP: 1,
          qwenTopK: 50,
          qwenRepetitionPenalty: 1.05,
          normalize: true,
          voiceConsent: true,
          refineText: true,
          homophoneReplacement: false,
          xVectorOnly: false,
        },
      },
    });
    expect(() => sanitizePluginAudioGeneratorId('../service')).toThrow('无效');
    expect(() =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'voxcpm2-local',
        request: {
          mode: 'clone',
          text: '测试',
          options: { voiceConsent: 'yes' },
        },
      }),
    ).toThrow('voiceConsent 必须是布尔值');
    expect(() =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'voxcpm2-local',
        request: {
          mode: 'clone',
          text: 'hello',
          referenceAudio: { base64: 'not base64', mimeType: 'audio/wav' },
        },
      }),
    ).toThrow('Base64');
    expect(() =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'voxcpm2-local',
        request: {
          mode: 'clone',
          text: 'hello',
          referenceAudio: { base64: reference, mimeType: 'text/plain' },
        },
      }),
    ).toThrow('类型无效');
    expect(
      sanitizePluginAudioGenerationCall({
        generatorId: 'doubao-seed-audio-cloud',
        request: {
          mode: 'clone',
          text: '@参考录音1 与 @参考录音2 对话',
          referenceAudios: [
            { base64: reference, mimeType: 'audio/wav', fileName: 'voice-1.wav' },
            { base64: reference, mimeType: 'audio/wav', fileName: 'voice-2.wav' },
          ],
          options: { voiceConsent: true },
        },
      }).request.referenceAudios,
    ).toHaveLength(2);
    expect(
      sanitizePluginAudioGenerationCall({
        generatorId: 'doubao-seed-audio-cloud',
        request: {
          mode: 'design',
          text: '官方参数映射',
          options: {
            durationSeconds: 30,
            audioFormat: 'ogg_opus',
            seedAudioPitchRate: 4,
            seedAudioSpeechRate: 34,
            seedAudioLoudnessRate: 25,
          },
        },
      }).request.options,
    ).toEqual({
      durationSeconds: 30,
      audioFormat: 'ogg_opus',
      seedAudioPitchRate: 4,
      seedAudioSpeechRate: 34,
      seedAudioLoudnessRate: 25,
    });
    expect(() =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'doubao-seed-audio-cloud',
        request: {
          mode: 'clone',
          text: '过多参考',
          referenceAudios: Array.from({ length: 4 }, () => ({
            base64: reference,
            mimeType: 'audio/wav',
          })),
        },
      }),
    ).toThrow('1 到 3');
    expect(() =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'voxcpm2-local',
        request: {
          mode: 'design',
          text: 'hello',
          options: { cfgValue: '2' },
        },
      }),
    ).toThrow('必须是数字');
    expect(() =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'voxcpm2-local',
        request: { mode: 'hifi', text: 'hello' },
      }),
    ).toThrow('准确转写');
  });

  it('forwards bounded Sony Woosh sound-effect options', () => {
    expect(
      sanitizePluginAudioGenerationCall({
        generatorId: 'woosh-local',
        request: {
          mode: 'design',
          text: 'A heavy sci-fi door closes with a metallic impact.',
          options: { seed: 42, wooshCfg: 4.5, wooshSteps: 8, ignored: 'not forwarded' },
        },
      }),
    ).toEqual({
      generatorId: 'woosh-local',
      request: {
        mode: 'design',
        text: 'A heavy sci-fi door closes with a metallic impact.',
        options: { seed: 42, wooshCfg: 4.5, wooshSteps: 8 },
      },
    });

    for (const [options, message] of [
      [{ wooshCfg: -0.1 }, 'wooshCfg'],
      [{ wooshCfg: 9.1 }, 'wooshCfg'],
      [{ wooshSteps: 3 }, 'wooshSteps'],
      [{ wooshSteps: 9 }, 'wooshSteps'],
      [{ wooshSteps: 4.5 }, 'wooshSteps'],
    ] as const) {
      expect(() =>
        sanitizePluginAudioGenerationCall({
          generatorId: 'woosh-local',
          request: { mode: 'design', text: 'sound effect', options },
        }),
      ).toThrow(message);
    }
  });

  it('bounds audio history lookups to declared generators and opaque history ids', () => {
    expect(sanitizePluginAudioHistoryLookup({ generatorId: 'voxcpm2-local' })).toEqual({
      generatorId: 'voxcpm2-local',
    });
    expect(
      sanitizePluginAudioHistoryLookup({
        generatorId: 'voxcpm2-local',
        historyId: 'history-0001',
      }),
    ).toEqual({ generatorId: 'voxcpm2-local', historyId: 'history-0001' });
    expect(() =>
      sanitizePluginAudioHistoryLookup({
        generatorId: 'voxcpm2-local',
        historyId: '../other-project',
      }),
    ).toThrow('音频历史 ID 无效');
  });

  it('allows only a fixed generator id and optional license digest for model installation', () => {
    expect(sanitizePluginAudioInstallRequest({ generatorId: 'qwen3-tts-local' })).toEqual({
      generatorId: 'qwen3-tts-local',
    });
    expect(
      sanitizePluginAudioInstallRequest({
        generatorId: 'chattts-local',
        licenseAcceptance: 'A'.repeat(64),
      }),
    ).toEqual({
      generatorId: 'chattts-local',
      licenseAcceptance: 'a'.repeat(64),
    });
    expect(() =>
      sanitizePluginAudioInstallRequest({
        generatorId: 'chattts-local',
        licenseAcceptance: 'not-a-digest',
      }),
    ).toThrow('摘要无效');
    expect(() =>
      sanitizePluginAudioInstallRequest({
        generatorId: 'chattts-local',
        repoUrl: 'https://evil.example/model.zip',
      }),
    ).toThrow('未知字段');
  });

  it('forwards inclusive ChatTTS audio option boundaries', () => {
    const sanitizeOptions = (options: Record<string, unknown>) =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'chattts-local',
        request: { mode: 'design', text: '边界测试', options },
      }).request.options;

    expect(
      sanitizeOptions({
        speakerPreset: '1025.csv',
        temperature: 0.00001,
        topP: 0.1,
        topK: 1,
        textSeed: 0,
        refineText: false,
        speed: 0,
        oral: 0,
        laugh: 0,
        breakLevel: 0,
        splitBatch: 0,
        homophoneReplacement: false,
      }),
    ).toEqual({
      speakerPreset: '1025.csv',
      temperature: 0.00001,
      topP: 0.1,
      topK: 1,
      textSeed: 0,
      speed: 0,
      oral: 0,
      laugh: 0,
      breakLevel: 0,
      splitBatch: 0,
      refineText: false,
      homophoneReplacement: false,
    });
    expect(
      sanitizeOptions({
        temperature: 1,
        topP: 0.9,
        topK: 20,
        textSeed: 0xffff_ffff,
        refineText: true,
        speed: 9,
        oral: 9,
        laugh: 2,
        breakLevel: 7,
        splitBatch: 16,
        homophoneReplacement: true,
      }),
    ).toEqual({
      temperature: 1,
      topP: 0.9,
      topK: 20,
      textSeed: 0xffff_ffff,
      speed: 9,
      oral: 9,
      laugh: 2,
      breakLevel: 7,
      splitBatch: 16,
      refineText: true,
      homophoneReplacement: true,
    });
  });

  it('rejects out-of-range and mistyped ChatTTS audio options', () => {
    const invalidCases: Array<[Record<string, unknown>, string]> = [
      [{ temperature: 0 }, 'temperature'],
      [{ temperature: 1.00001 }, 'temperature'],
      [{ temperature: Number.NaN }, 'temperature'],
      [{ temperature: '0.3' }, 'temperature'],
      [{ topP: 0.09999 }, 'topP'],
      [{ topP: 0.90001 }, 'topP'],
      [{ topP: Number.POSITIVE_INFINITY }, 'topP'],
      [{ topK: 0 }, 'topK'],
      [{ topK: 21 }, 'topK'],
      [{ topK: 1.5 }, 'topK'],
      [{ textSeed: -1 }, 'textSeed'],
      [{ textSeed: 0x1_0000_0000 }, 'textSeed'],
      [{ textSeed: 1.5 }, 'textSeed'],
      [{ refineText: 'true' }, 'refineText'],
      [{ homophoneReplacement: 'true' }, 'homophoneReplacement'],
      [{ speed: -1 }, 'speed'],
      [{ speed: 10 }, 'speed'],
      [{ speed: 0.5 }, 'speed'],
      [{ oral: -1 }, 'oral'],
      [{ oral: 10 }, 'oral'],
      [{ oral: 0.5 }, 'oral'],
      [{ laugh: -1 }, 'laugh'],
      [{ laugh: 3 }, 'laugh'],
      [{ laugh: 0.5 }, 'laugh'],
      [{ breakLevel: -1 }, 'breakLevel'],
      [{ breakLevel: 8 }, 'breakLevel'],
      [{ breakLevel: 0.5 }, 'breakLevel'],
      [{ splitBatch: -1 }, 'splitBatch'],
      [{ splitBatch: 17 }, 'splitBatch'],
      [{ splitBatch: 0.5 }, 'splitBatch'],
      [{ engineTask: '' }, '模型任务'],
      [{ language: 'x'.repeat(33) }, '语言'],
      [{ speaker: 42 }, '预设音色'],
      [{ speechRate: 0.49 }, 'speechRate'],
      [{ speechRate: 2.01 }, 'speechRate'],
      [{ speechRate: '1' }, 'speechRate'],
      [{ qwenTemperature: 0.09 }, 'qwenTemperature'],
      [{ qwenTemperature: 2.01 }, 'qwenTemperature'],
      [{ qwenTopP: 0.09 }, 'qwenTopP'],
      [{ qwenTopP: 1.01 }, 'qwenTopP'],
      [{ qwenTopK: 0 }, 'qwenTopK'],
      [{ qwenTopK: 101 }, 'qwenTopK'],
      [{ qwenTopK: 1.5 }, 'qwenTopK'],
      [{ qwenRepetitionPenalty: 0.99 }, 'qwenRepetitionPenalty'],
      [{ qwenRepetitionPenalty: 2.01 }, 'qwenRepetitionPenalty'],
      [{ xVectorOnly: 'true' }, 'xVectorOnly'],
      [{ speakerPreset: '../1025.csv' }, '固定音色'],
      [{ speakerPreset: '1025.wav' }, '固定音色'],
      [{ speakerPreset: 1025 }, '固定音色'],
    ];

    for (const [options, message] of invalidCases) {
      expect(() =>
        sanitizePluginAudioGenerationCall({
          generatorId: 'chattts-local',
          request: { mode: 'design', text: '反边界测试', options },
        }),
      ).toThrow(message);
    }
    expect(() =>
      sanitizePluginAudioGenerationCall({
        generatorId: 'chattts-local',
        request: {
          mode: 'clone',
          text: '克隆模式',
          referenceAudio: {
            base64: 'dGVzdA==',
            mimeType: 'audio/wav',
            fileName: 'voice.wav',
          },
          options: { speakerPreset: '1025.csv' },
        },
      }),
    ).toThrow('音色设计模式');
  });
});
