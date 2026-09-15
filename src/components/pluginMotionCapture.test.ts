import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import manifestSource from '../../data/plugins/qiansi-motion-capture/plugin.json?raw';
import runtimeSource from '../../data/plugins/qiansi-motion-capture/runtime.js?raw';
import standaloneSource from '../../data/plugins/qiansi-motion-capture/standalone/standalone.js?raw';
import pluginStateSource from '../../data/plugin-state.json?raw';
import sandboxFrameSource from './PluginSandboxFrame.tsx?raw';
import poseCaptureSource from '../services/pluginPoseCapture.ts?raw';
import poseRigCompatibilitySource from '../services/pluginPoseRigModel.ts?raw';
import poseRigPreviewSource from '../services/pluginPoseRigPreview.ts?raw';
import pluginMannequinSource from '../../data/plugins/qiansi-motion-capture/studio/mannequin.ts?raw';
import poseRigModelSource from '../../data/plugins/qiansi-motion-capture/studio/pluginPoseRigModel.ts?raw';
import poseRigWorkerSource from '../../data/plugins/qiansi-motion-capture/studio/pluginPoseRigWorker.ts?raw';
import standaloneSyncSource from '../../data/plugins/qiansi-motion-capture/scripts/sync-standalone-assets.mjs?raw';
import pluginSandboxSource from '../services/pluginSandbox.ts?raw';

describe('Qiansi motion capture plugin', () => {
  it('ships as an enabled permission-gated fullscreen plugin with custom neutral chrome', () => {
    const manifest = JSON.parse(manifestSource) as {
      id: string;
      name: string;
      version: string;
      engine: { qiansiCanvas: string };
      permissions: string[];
      contributes: {
        panels: Array<{ hostChrome?: string; position: string }>;
        menus: Array<{ id: string; label: string; location: string }>;
      };
    };
    const pluginState = JSON.parse(pluginStateSource) as { enabled: Record<string, boolean> };

    expect(manifest.id).toBe('qiansi-motion-capture');
    expect(manifest.name).toBe('Qiansi Motion Captur');
    expect(manifest.version).toBe('1.23.1');
    expect(manifest.engine.qiansiCanvas).toBe('>=1.22.0');
    expect(manifest.permissions).not.toContain('vision:depth');
    expect(manifest.permissions).toEqual(
      expect.arrayContaining([
        'vision:pose',
        'vision:install',
        'storage:project-documents',
        'canvas:read-selection',
      ]),
    );
    expect(manifest.contributes.panels[0]).toMatchObject({
      position: 'fullscreen',
      hostChrome: 'custom',
    });
    expect(manifest.contributes.menus).toContainEqual(
      expect.objectContaining({
        id: 'open-motion-capture',
        label: 'Qiansi Motion Captur',
        location: 'canvas',
      }),
    );
    expect(pluginState.enabled[manifest.id]).toBe(true);
  });

  it('keeps source video local and exposes an engine-aware v3 capture contract', () => {
    expect(runtimeSource).toContain('accept="video/mp4,video/webm,video/quicktime"');
    expect(runtimeSource).toContain('host.listPoseEngines()');
    expect(runtimeSource).toContain('id="mc-engine-install"');
    expect(runtimeSource).toContain('host.installPoseEngine(engine.id');
    expect(runtimeSource).toContain('host.uninstallPoseEngine(engine.id)');
    expect(runtimeSource).toContain('再次点击确认删除');
    expect(runtimeSource).toContain('安装 ${engine.label.replace');
    expect(runtimeSource).toContain('Worker 运行环境待安装');
    expect(runtimeSource).toContain('host.detectPoseFrame({');
    expect(runtimeSource).toContain("mimeType: 'image/jpeg'");
    expect(runtimeSource).toContain('landmarkCount: engine.jointCount');
    expect(runtimeSource).toContain("const CAPTURE_SCHEMA = 'qiansi-motion-capture/v3'");
    expect(runtimeSource).toContain("const PREVIOUS_CAPTURE_SCHEMA = 'qiansi-motion-capture/v2'");
    expect(runtimeSource).toContain("const LEGACY_CAPTURE_SCHEMA = 'qiansi-motion-capture/v1'");
    expect(runtimeSource).not.toContain('fetch(');
    expect(runtimeSource).not.toContain('XMLHttpRequest');
  });

  it('keeps the model action beside the engine selector and shows model size in its option', () => {
    expect(runtimeSource).toMatch(
      /class="mc-engine-control-row"[\s\S]*?id="mc-engine"[\s\S]*?id="mc-model-action"[\s\S]*?id="mc-engine-install"/,
    );
    expect(runtimeSource).toContain('formatModelBytes(engine.modelBytes)');
    expect(runtimeSource).toContain('${engine.label}${modelSize}</option>');
    expect(runtimeSource).not.toContain('id="mc-engine-install-meta"');
    expect(runtimeSource).not.toContain('elements.engineInstallMeta');
    expect(runtimeSource).toContain('const showModelAction = managedModel;');
    expect(runtimeSource).toContain('(!isDepth || engine.id === SAPIENS_NORMAL_MODEL_ID);');
    expect(runtimeSource).toContain('model.workerAvailable !== true');
    expect(runtimeSource).toContain("? '安装 Sapiens2 Worker'");
    expect(runtimeSource).toContain("`安装 ${engine.label.replace(/^AI [^·]+ · /, '')} 运行环境`");
  });

  it('keeps runtime installation in the selector-side model action instead of the capture action', () => {
    const analyzeSource = runtimeSource.match(
      /const analyze = async \(\) => \{([\s\S]*?)\n  \};\n\n  const reset/,
    )?.[1];
    const modelActionHandler = runtimeSource.match(
      /elements\.engineInstall\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n  \}\);\n  elements\.engine\.addEventListener/,
    )?.[1];
    expect(analyzeSource).toBeTruthy();
    expect(modelActionHandler).toBeTruthy();
    expect(analyzeSource).not.toContain('installPoseEnginePackage(engine)');
    expect(modelActionHandler).toMatch(
      /if \(engine\.modelInstalled && !engine\.available\) \{\s+await installPoseEnginePackage\(engine\);/,
    );
  });

  it('restores active and resumable model installations after the workbench is reopened', () => {
    expect(runtimeSource).toContain('const watchPoseEngineInstall = async (engineId) =>');
    expect(runtimeSource).toContain('host.readPoseEngineInstallStatus(engineId)');
    expect(runtimeSource).toContain('const watchDepthModelInstall = async (modelId) =>');
    expect(runtimeSource).toContain('host.readDepthModelInstallStatus(modelId)');
    expect(runtimeSource).toContain('void watchPoseEngineInstall(selectedCaptureEngine().id);');
    expect(runtimeSource).toContain('void watchDepthModelInstall(selectedCaptureEngine().id);');
    expect(runtimeSource).toContain('void watchPoseEngineInstall(engine.id);');
    expect(runtimeSource).toContain('void watchDepthModelInstall(engine.id);');
    expect(runtimeSource).toMatch(
      /state\.modelInstall = installState;\s+updateEnginePresentation\(\);\s+updateControls\(\);/,
    );
    expect(runtimeSource).toMatch(
      /state\.depthInstall = installState;\s+updateEnginePresentation\(\);\s+updateControls\(\);/,
    );
    expect(runtimeSource).toContain("? '正在安装运行环境'");
    expect(runtimeSource).toContain("!['done', 'already', 'idle'].includes(installState.status)");
    expect(runtimeSource).toContain("? '继续安装'");
    expect(runtimeSource).toContain("? '已暂停'");
    expect(runtimeSource).toContain('completed > 0;');
  });

  it('shows live runtime activity and refreshes an externally completed Sapiens worker', () => {
    expect(runtimeSource).toContain('id="mc-workflow-summary"');
    expect(runtimeSource).toContain('aria-live="polite"');
    expect(runtimeSource).toContain(
      "elements.engineBadge.classList.toggle('is-busy', installing);",
    );
    expect(runtimeSource).toContain(
      "elements.workflowSummary.classList.toggle('is-busy', installing);",
    );
    expect(runtimeSource).toContain(
      "elements.workflowSummary.setAttribute('aria-busy', String(installing));",
    );
    expect(runtimeSource).toContain('`${installingLabel} · ${Math.round(progress)}%`');
    expect(runtimeSource).toContain('@keyframes mc-engine-spin');
    expect(runtimeSource).toContain('@keyframes mc-engine-sweep');
    expect(runtimeSource).toContain('const scheduleSapiensRuntimeRefresh = () =>');
    expect(runtimeSource).toContain('sapiensRuntimeRefreshTimer: 0');
    expect(runtimeSource).toContain(
      "window.addEventListener('focus', refreshDepthModelAvailability);",
    );
  });

  it('offers both AI skeleton engines and both white-model engines while preserving legacy data', () => {
    expect(runtimeSource).toContain('id="mc-engine"');
    expect(runtimeSource).toContain('engine.available');
    expect(runtimeSource).toContain("const POSE_ENGINE_IDS = ['gem-x', 'rtmw3d'];");
    expect(runtimeSource).toContain(
      'const SELECTABLE_ENGINE_IDS = [...POSE_ENGINE_IDS, ...DENSE_MODEL_IDS];',
    );
    expect(runtimeSource).toContain("label: '二维白模 · Depth Anything V2'");
    expect(runtimeSource).toContain("label: 'AI精细3D人物白模 · Sapiens2 Normal 0.4B'");
    expect(runtimeSource).toContain(
      "state.normalSettings.output === 'clay' ? '光照白模' : 'RGB 表面法线'",
    );
    expect(runtimeSource).toContain('const selectedCaptureEngine = () =>');
    expect(runtimeSource).toContain("const DEFAULT_ENGINE_ID = 'gem-x';");
    expect(runtimeSource).not.toContain("label: '本机 3D 捕捉 · MediaPipe Full'");
    expect(runtimeSource).not.toContain('导入本机 3D 动作视频');
    expect(runtimeSource).toContain('if (engine.id !== LEGACY_ENGINE_ID)');
    expect(runtimeSource).toContain('AI Motion Worker');
    expect(runtimeSource).toContain("navigation: { studio: '二维白模' }");
    expect(runtimeSource).toContain('${captureJointCount} 点姿态映射到片场绑定人偶。');
    expect(runtimeSource).toMatch(
      /elements\.engine\.addEventListener\('change',[\s\S]*?updateEnginePresentation\(\);[\s\S]*?updateStats\(\);[\s\S]*?updateControls\(\);/,
    );
    expect(runtimeSource).toContain('id="mc-max-poses"');
    expect(runtimeSource).toContain('const MAX_POSES = 4;');
    expect(runtimeSource).toContain('maxPoses,');
    expect(runtimeSource).toContain('Array.isArray(result.poses)');
    expect(runtimeSource).toContain(
      'const trackPoses = (rawPoses, tracks, frameIndex, smoothing, nextTrackId) =>',
    );
    expect(runtimeSource).toContain('frame.people');
    expect(runtimeSource).toContain('person.trackId');
    expect(runtimeSource).toContain("model: 'MediaPipe Pose Landmarker Full'");
    expect(poseCaptureSource).toContain('pose_landmarker_full.task');
    expect(poseCaptureSource).toContain('numPoses: MAX_PLUGIN_POSES');
    expect(poseCaptureSource).toContain('result.landmarks,');
    expect(poseCaptureSource).toContain('poses,');
    expect(poseCaptureSource).toContain("id: 'gem-x'");
    expect(poseCaptureSource).toContain("id: 'rtmw3d'");
    expect(poseCaptureSource).not.toContain("label: '本机 3D 捕捉 · MediaPipe Full'");
    expect(poseCaptureSource).toContain("availability: 'runtime-required'");
    expect(sandboxFrameSource).toContain("'vision.listPoseEngines': 'vision:pose'");
    expect(sandboxFrameSource).toContain("'vision.installPoseEngine': 'vision:install'");
    expect(sandboxFrameSource).toContain("'vision.uninstallPoseEngine': 'vision:install'");
    expect(sandboxFrameSource).toContain("'vision.listDepthModels': 'vision:pose'");
    expect(sandboxFrameSource).toContain("'vision.renderDepthFrame': 'vision:pose'");
    expect(sandboxFrameSource).toContain("'vision.startPoseCapture': 'vision:pose'");
    expect(sandboxFrameSource).toContain("'vision.poseCaptureStatus': 'vision:pose'");
    expect(sandboxFrameSource).toContain("'vision.poseCaptureResult': 'vision:pose'");
    expect(sandboxFrameSource).toContain("'vision.cancelPoseCapture': 'vision:pose'");
    expect(runtimeSource).toContain('host.startPoseVideoCapture({');
    expect(runtimeSource).toContain('host.readPoseVideoCaptureStatus(engine.id, job.jobId)');
    expect(runtimeSource).toContain('host.readPoseVideoCaptureResult(engine.id, job.jobId)');
  });

  it('groups Director controls into one borderless content-sized row', () => {
    const directorCanvas = runtimeSource.match(
      /<div class="mc-director-canvas-wrap">([\s\S]*?)<div class="mc-webgl-mark">/,
    )?.[1];
    const toolbar = directorCanvas?.match(/<div class="mc-director-toolbar"([\s\S]*)/)?.[1];
    expect(directorCanvas).toContain('<canvas class="mc-director-canvas"');
    expect(toolbar).toBeTruthy();
    expect(toolbar).not.toContain('mc-director-tool-row');
    expect(toolbar).not.toContain('mc-director-tool-label');
    expect(toolbar).not.toContain('mc-director-tool-divider');
    expect(toolbar?.match(/<button /g)).toHaveLength(8);
    for (const label of ['视角切换', '编辑历史', '视图工具']) {
      expect(toolbar).toContain(`role="group" aria-label="${label}"`);
    }
    for (const id of [
      'director-edit-mode',
      'director-undo',
      'director-redo',
      'grid-toggle',
      'focus-rig',
    ]) {
      expect(toolbar).toContain(`id="mc-${id}"`);
    }
    expect(toolbar).toContain('aria-keyshortcuts="Control+Z Meta+Z"');
    expect(runtimeSource).toContain(
      '.mc-director-toolbar .mc-director-icon-button { width: 28px; padding: 0; }',
    );
    expect(runtimeSource).toContain(
      '.mc-director-toolbar { position: absolute; top: 12px; right: 12px;',
    );
    expect(runtimeSource).toContain(
      'display: flex; align-items: center; gap: 4px; padding: 4px; border: 0;',
    );
    expect(runtimeSource).toContain('gap: 6px; border: 0; border-radius: 4px;');
    expect(runtimeSource).not.toContain('.mc-director-tool-divider {');
    expect(runtimeSource).not.toContain('.mc-director-stage > .mc-director-toolbar');
    expect(runtimeSource).toContain('.mc-director-camera-group .mc-segment { width: 60px;');
    expect(runtimeSource).not.toContain('.mc-view-tools .mc-segment { width: 100%; }');
    expect(runtimeSource).not.toContain('.mc-director-stage .mc-view-tools { display: grid;');
  });

  it('exposes model-specific official parameters without presenting unsupported controls as active', () => {
    expect(runtimeSource).toContain('const POSE_PARAMETER_DEFAULTS = {');
    expect(runtimeSource).toContain('id="mc-static-camera"');
    expect(runtimeSource).toContain('id="mc-detection-threshold"');
    expect(runtimeSource).toContain('id="mc-tracking-method"');
    expect(runtimeSource).toContain('id="mc-tracking-threshold"');
    expect(runtimeSource).toContain('id="mc-parameter-reset"');
    expect(runtimeSource).toContain('id="mc-depth-parameter-reset"');
    expect(runtimeSource).toContain('staticCamera: parameters.staticCamera');
    expect(runtimeSource).toContain('detectionThreshold: parameters.detectionThreshold');
    expect(runtimeSource).toContain('trackingMethod: parameters.trackingMethod');
    expect(runtimeSource).toContain('trackingThreshold: parameters.trackingThreshold');
    expect(runtimeSource).toContain("job.parameterCompatibility === 'legacy-defaults'");
    expect(runtimeSource).toContain('兼容旧版 Bridge 默认参数');
    expect(standaloneSource).toContain("parameterCompatibility: 'legacy-defaults'");
    for (const id of [
      'normal-fps',
      'normal-output',
      'normal-azimuth',
      'normal-elevation',
      'normal-ambient',
      'normal-gamma',
    ]) {
      expect(runtimeSource).toContain(`id="mc-${id}"`);
    }
    expect(runtimeSource).toContain('官方固定 1K 配置 · 采样与光照为插件功能');
    expect(runtimeSource).toContain('后续逐帧复用同一 Worker');
  });

  it('renders Sapiens normals as adjustable clay without modifying raw output or alpha', () => {
    const source = runtimeSource.match(
      /\/\* NORMAL_PRESENTATION_START \*\/([\s\S]*?)\/\* NORMAL_PRESENTATION_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const normal = runInNewContext(
      `${source}\n({ normalizeNormalParameters, shadeNormalPixels });`,
    ) as {
      normalizeNormalParameters: (value: Record<string, unknown>) => Record<string, unknown>;
      shadeNormalPixels: (
        pixels: Uint8ClampedArray,
        settings: Record<string, unknown>,
      ) => Uint8ClampedArray;
    };
    const raw = new Uint8ClampedArray([128, 128, 255, 173, 255, 128, 128, 255]);
    expect(normal.shadeNormalPixels(raw.slice(), { output: 'normal' })).toEqual(raw);
    const front = normal.shadeNormalPixels(raw.slice(), { azimuth: 0, elevation: 0, ambient: 0 });
    const side = normal.shadeNormalPixels(raw.slice(), { azimuth: 90, elevation: 0, ambient: 0 });
    expect(front[0]).toBeGreaterThan(Number(front[4]));
    expect(side[0]).toBeLessThan(Number(side[4]));
    expect(front[0]).toBe(front[1]);
    expect(front[1]).toBe(front[2]);
    expect(front[3]).toBe(173);
    expect(front[7]).toBe(255);
    const fill = normal.shadeNormalPixels(raw.slice(), { ambient: 1 });
    expect(fill[0]).toBe(255);
    expect(fill[4]).toBe(255);
    expect(
      normal.normalizeNormalParameters({
        sampleFps: 60,
        gamma: 0,
        elevation: Infinity,
        ambient: -1,
      }),
    ).toMatchObject({ sampleFps: 10, gamma: 1, elevation: 35, ambient: 0.35 });
    expect(runtimeSource).toContain('sampleFps: state.depthSampleFps');
    expect(runtimeSource).toContain(
      'isSapiens ? state.normalSettings.sampleFps : depthSampleFps()',
    );
    expect(runtimeSource).toContain(
      'value.normalSettings || { sampleFps, output: NORMAL_PARAMETER_DEFAULTS.output }',
    );
    expect(runtimeSource).toContain("const NORMAL_FRAME_ENCODING = 'camera-normal-rgb-v1';");
    expect(runtimeSource).toContain('result?.normalEncoding === NORMAL_FRAME_ENCODING');
    expect(runtimeSource).toContain('? presentNormalResult(result) : result');
  });

  it('settles cancelled model installs when the host returns to idle', () => {
    expect(
      pluginSandboxSource.match(/new Set\(\['done', 'already', 'error', 'cancelled', 'idle'\]\)/g),
    ).toHaveLength(2);
    expect(
      runtimeSource.match(/\['done', 'already', 'error', 'cancelled', 'idle'\]/g),
    ).toHaveLength(3);
    expect(standaloneSource).toContain(
      "new Set(['done', 'already', 'error', 'cancelled', 'idle'])",
    );
  });

  it('provides a real install-gated local 2D white-model preview', () => {
    expect(runtimeSource).not.toContain('id="mc-depth-install"');
    expect(runtimeSource).not.toContain('id="mc-depth-toggle"');
    expect(runtimeSource).not.toContain('<div class="mc-card-title"><span>二维白模</span>');
    expect(runtimeSource).toContain("const DEPTH_MODEL_ID = 'depth-anything-v2-small'");
    expect(runtimeSource).toContain('const manageDepthModel = async () =>');
    expect(runtimeSource).toContain('await manageDepthModel();');
    expect(runtimeSource).toContain('host.installDepthModel(modelId');
    expect(runtimeSource).toContain('host.renderDepthFrame({');
    expect(runtimeSource).toContain('modelId: selectedDepthModel().id');
    expect(runtimeSource).toContain(
      'await drawDepthResult(frame, runId, state.depthFrames.length - 1);',
    );
    expect(runtimeSource).toContain('if (isDenseModelId(engine.id)) {');
    expect(runtimeSource).toContain('await startDepthPreview();');
    expect(runtimeSource).toContain('生成整段二维白模');
    expect(runtimeSource).toContain('不生成骨骼、人物轨迹或 BVH 动作数据');
    expect(runtimeSource).toContain('id="mc-depth-fps"');
    expect(runtimeSource).toContain('id="mc-depth-backend"');
    expect(runtimeSource).toContain('id="mc-depth-input-size"');
    expect(runtimeSource).toContain('id="mc-depth-gpu-power"');
    expect(runtimeSource).toContain('id="mc-depth-wasm-threads"');
    expect(runtimeSource).toContain('id="mc-depth-invert"');
    expect(runtimeSource).toContain('id="mc-depth-black-point"');
    expect(runtimeSource).toContain('id="mc-depth-white-point"');
    expect(runtimeSource).toContain('id="mc-depth-gamma"');
    expect(runtimeSource).toContain('id="mc-depth-temporal-smoothing"');
    expect(runtimeSource).toContain('id="mc-depth-inference-speed"');
    expect(runtimeSource).toContain('id="mc-depth-eta"');
    expect(runtimeSource).toContain('id="mc-depth-export"');
    expect(runtimeSource).toContain('导出白模 WebM');
    expect(runtimeSource).toContain('backend: state.depthBackend');
    expect(runtimeSource).toContain('inputSize: state.depthInputSize');
    expect(runtimeSource).toContain('wasmThreads: state.depthWasmThreads');
    expect(runtimeSource).toContain('gpuPowerPreference: state.depthGpuPowerPreference');
    expect(runtimeSource).toContain('temporalSmoothing: state.depthTemporalSmoothing');
    expect(runtimeSource).toContain('blackPoint: state.depthBlackPoint');
    expect(runtimeSource).toContain('updateDepthPerformancePresentation();');
    expect(runtimeSource).toContain('elements.depthExport.disabled = !canExportDepth;');
    expect(runtimeSource).toContain('new MediaRecorder(stream');
    expect(runtimeSource).toContain('canvas.captureStream(');
    expect(runtimeSource).toContain("typeof globalThis.showSaveFilePicker === 'function'");
    expect(runtimeSource).toContain("typeof host.chooseSaveFile === 'function'");
    expect(runtimeSource).toContain('await host.chooseSaveFile({');
    expect(runtimeSource).toContain("method: 'host-save-picker'");
    expect(runtimeSource).toContain('destinationId: destination.destinationId');
    expect(runtimeSource).toContain("typeof host.downloadFile === 'function'");
    expect(runtimeSource).toContain("return { method: 'host-download' }");
    expect(runtimeSource).toContain('await host.downloadFile({');
    expect(runtimeSource).toContain('选择位置并导出白模 WebM');
    expect(runtimeSource).toContain('导出到浏览器下载目录');
    expect(runtimeSource).toContain('请查看浏览器下载记录或系统“下载”文件夹');
    expect(runtimeSource).toContain('没有自动改用下载目录');
    expect(runtimeSource).toContain('切换到其他窗口时继续采样并逐帧保存');
    expect(runtimeSource).not.toContain('requestVideoFrameCallback');
  });

  it('keeps completed white-model controls usable and arranges its settings in 2 by 2 grids', () => {
    expect(runtimeSource).toContain(
      '.mc-depth-method-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);',
    );
    expect(runtimeSource).toContain('class="mc-depth-method-grid" aria-label="白模生成参数"');
    expect(runtimeSource).toContain(
      '.mc-depth-image-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);',
    );
    expect(runtimeSource).toContain('class="mc-depth-image-grid" aria-label="白模画面参数"');
    expect(runtimeSource).toContain('.mc-depth-image-grid .mc-range { width: 100%; }');
    expect(runtimeSource).toContain(
      'const depthSettingsAvailable = isDepth && !state.depthCapturing && !repairing;',
    );
    expect(runtimeSource).not.toContain(
      'isDepth && !state.depthCapturing && state.depthFrames.length === 0 && !repairing',
    );
    expect(runtimeSource).toContain('depthSettingsSignature() !== state.depthResultSettingsKey');
    expect(runtimeSource).toContain('!state.depthSettingsDirty &&');
    expect(runtimeSource).toContain("`${icon('skeleton')}按新参数重新生成`");
    expect(runtimeSource).toContain('const cleared = await clearPersistedDepthCapture();');
    expect(runtimeSource).toContain('当前预览仍是原结果；点击“按新参数重新生成”后应用新设置。');
    expect(runtimeSource).not.toContain('已有白模采样帧；清除白模后才能更改');
  });

  it('derives every enabled and disabled control from model and result capabilities', () => {
    expect(runtimeSource).toContain(
      'const poseSettingsAvailable = !isDepth && !analyzing && !repairing;',
    );
    expect(runtimeSource).toContain(
      'const captureAvailable = loaded && engine.available && !repairing;',
    );
    expect(runtimeSource).toContain(
      'const posePreviewAvailable = !isDepth && hasPoseTracks && !repairing;',
    );
    expect(runtimeSource).not.toContain('const runtimeInstallAvailable = Boolean(');
    expect(runtimeSource).toContain('await installPoseEnginePackage(engine);');
    expect(runtimeSource).toContain('elements.analyze.disabled = !captureAvailable;');
    expect(runtimeSource).toContain(
      'const hasPoseTracks = complete && state.frames.some((frame) => frame.people.length > 0);',
    );
    expect(runtimeSource).toContain('poseSettingsAvailable && engine.supportsMultiplePeople');
    expect(runtimeSource).toContain('setControlAvailability(elements.fps, poseSettingsAvailable');
    expect(runtimeSource).toContain(
      'setControlAvailability(elements.smoothing, poseSettingsAvailable',
    );
    expect(runtimeSource).toContain(
      'setControlAvailability(elements.threshold, poseSettingsAvailable',
    );
    expect(runtimeSource).toContain("document.querySelectorAll('.mc-filter').forEach((filter) =>");
    expect(runtimeSource).toContain(
      "const isDepthLayer = isDepth && (isSource || filter.dataset.filter === 'skeleton');",
    );
    expect(runtimeSource).toContain(
      'isDepth ? isDepthLayer && depthSourceAvailable : posePreviewAvailable',
    );
    expect(runtimeSource).toMatch(/setViewAvailability\(\s*'data',\s*dataToolsAvailable/);
    expect(runtimeSource).toMatch(/setViewAvailability\(\s*'mapping',\s*motionToolsAvailable/);
    expect(runtimeSource).toMatch(/setViewAvailability\(\s*'director',\s*motionToolsAvailable/);
    expect(runtimeSource).toContain(
      "elements.timelineLanes.setAttribute('aria-disabled', String(!motionToolsAvailable));",
    );
    expect(runtimeSource).toContain('二维白模不生成人物骨骼，此参数不可用。');
    expect(runtimeSource).toContain('需要先完成包含人物轨迹的骨骼捕捉。');
    expect(runtimeSource).toContain('.mc-setting.is-disabled, .mc-card.is-disabled');
    expect(runtimeSource).toContain('.mc-filter:disabled');
    expect(runtimeSource).toContain("? 'Sapiens2 精细白模预览'");
    expect(runtimeSource).toContain(": '二维白模预览'");
    expect(runtimeSource).toContain('导入视频生成二维白模');
    expect(runtimeSource).toContain('不生成骨骼、人物轨迹或 BVH 动作数据。');
    expect(runtimeSource).toContain(
      'elements.emptyUpload.textContent = importPresentation.buttonLabel',
    );
    expect(runtimeSource).not.toContain("elements.emptyTitle.textContent = '导入人物动作视频'");
    expect(runtimeSource).not.toContain('支持同时捕捉最多 4 人。全身清晰');
  });

  it('renders a distinct workbench contract for each selectable model', () => {
    const source = runtimeSource.match(
      /\/\* MODEL_WORKBENCH_PROFILES_START \*\/([\s\S]*?)\/\* MODEL_WORKBENCH_PROFILES_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const { profiles, getProfile } = runInNewContext(`
      const DEPTH_MODEL_ID = 'depth-anything-v2-small';
      const SAPIENS_NORMAL_MODEL_ID = 'sapiens2-normal-0.4b';
      ${source}
      ({ profiles: MODEL_WORKBENCH_PROFILES, getProfile: getModelWorkbenchProfile });
    `) as {
      profiles: Record<
        string,
        {
          kind: string;
          navigation: Record<string, string>;
          filters: Record<string, string>;
          parameterLabels: Record<string, string>;
          showMaxPoses: boolean;
          showPoseParameters: boolean;
          showDepthParameters: boolean;
          resultLabels: string[];
          idleAction: string;
        }
      >;
      getProfile: (engine: { id: string }) => {
        navigation: Record<string, string>;
      };
    };

    expect(profiles['gem-x']).toMatchObject({
      kind: 'pose',
      navigation: {
        studio: 'GEM-X 捕捉',
        data: '帧数据修复',
        mapping: '角色重定向',
        director: '3D 导演台',
      },
      filters: {
        skeleton: '33 点导演骨架',
        joints: 'SOMA 77 关节',
        trail: '腕踝运动轨迹',
      },
      showMaxPoses: false,
      showPoseParameters: true,
      resultLabels: ['采样帧', '有效帧', '平均置信度', 'SOMA 关节'],
      idleAction: '运行 GEM-X 捕捉',
    });
    expect(profiles.rtmw3d).toMatchObject({
      kind: 'pose',
      navigation: {
        studio: 'RTMW3D 捕捉',
        data: '多人帧检查',
      },
      filters: {
        joints: '全身 133 关节',
        trail: '人物运动轨迹',
      },
      parameterLabels: { maxPoses: '检测人物上限' },
      showMaxPoses: true,
      showPoseParameters: true,
      idleAction: '运行 RTMW3D 捕捉',
    });
    const depthProfile = profiles['depth-anything-v2-small'];
    expect(depthProfile).toBeDefined();
    if (!depthProfile) throw new Error('Depth Anything workbench profile is missing.');
    expect(depthProfile).toMatchObject({
      kind: 'depth',
      navigation: { studio: '二维白模' },
      filters: { skeleton: '白模画面', source: '原片画面' },
      showMaxPoses: false,
      showPoseParameters: false,
      showDepthParameters: true,
      resultLabels: ['已生成帧', '整段完成', '生成状态', '输出类型'],
      idleAction: '生成整段二维白模',
    });
    expect(depthProfile.navigation).not.toHaveProperty('data');
    expect(depthProfile.filters).not.toHaveProperty('joints');
    expect(profiles['sapiens2-normal-0.4b']).toMatchObject({
      kind: 'depth',
      navigation: { studio: '精细白模' },
      filters: { skeleton: '法线白模', source: '原片画面' },
      showDepthParameters: false,
      idleAction: '生成 Sapiens2 精细白模',
    });
    expect(getProfile({ id: 'rtmw3d' })).toBe(profiles.rtmw3d);

    expect(runtimeSource).toContain("control.classList.toggle('mc-hidden', !label);");
    expect(runtimeSource).toContain(
      "elements.poseParametersCard.classList.toggle('mc-hidden', !profile.showPoseParameters);",
    );
    expect(runtimeSource).toContain(
      "elements.depthParametersCard.classList.toggle('mc-hidden', !profile.showDepthParameters);",
    );
    expect(runtimeSource).toContain(
      "const nextView = profile.kind === 'depth' ? 'studio' : requestedView;",
    );
    expect(runtimeSource).toContain('const captureMatchesSelectedEngine =');
    expect(runtimeSource).toContain(
      'const activeFrames = captureMatchesSelectedEngine ? state.frames : [];',
    );
  });

  it('updates the import explanation and action for every selected model', () => {
    const source = runtimeSource.match(
      /\/\* CAPTURE_IMPORT_PRESENTATION_START \*\/([\s\S]*?)\/\* CAPTURE_IMPORT_PRESENTATION_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const describe = runInNewContext(
      `const DEPTH_MODEL_ID = 'depth-anything-v2-small';
       const SAPIENS_NORMAL_MODEL_ID = 'sapiens2-normal-0.4b';
       const isDenseModelId = (id) => [DEPTH_MODEL_ID, SAPIENS_NORMAL_MODEL_ID].includes(id);
       ${source};getCaptureImportPresentation`,
    ) as (engine: {
      id: string;
      available: boolean;
      supportsMultiplePeople: boolean;
      modelInstalled?: boolean;
      installAvailable?: boolean;
      label?: string;
      unavailableReason?: string;
    }) => { title: string; description: string; buttonLabel: string };

    expect(describe({ id: 'gem-x', available: true, supportsMultiplePeople: false })).toMatchObject(
      {
        title: '导入单人动作视频',
        buttonLabel: '选择单人视频',
      },
    );
    expect(describe({ id: 'rtmw3d', available: true, supportsMultiplePeople: true })).toMatchObject(
      {
        title: '导入多人动作视频',
        buttonLabel: '选择多人视频',
      },
    );
    expect(
      describe({
        id: 'depth-anything-v2-small',
        available: true,
        supportsMultiplePeople: false,
      }),
    ).toMatchObject({
      title: '导入视频生成二维白模',
      buttonLabel: '选择白模源视频',
    });
    expect(
      describe({
        id: 'sapiens2-normal-0.4b',
        available: false,
        supportsMultiplePeople: false,
        unavailableReason: '需要先安装 Sapiens2 Normal 0.4B 模型包。',
      }),
    ).toMatchObject({
      title: '导入视频生成 Sapiens2 精细白模',
      buttonLabel: '选择精细白模源视频',
    });
    expect(
      describe({
        id: 'gem-x',
        available: false,
        supportsMultiplePeople: false,
        unavailableReason: '需要连接 AI Worker。',
      }).description,
    ).toContain('当前暂不可处理：需要连接 AI Worker。');
    expect(
      describe({
        id: 'gem-x',
        label: 'AI 高质量 · GEM-X',
        available: false,
        modelInstalled: true,
        installAvailable: true,
        supportsMultiplePeople: false,
        unavailableReason: '需要连接 AI Worker。',
      }).description,
    ).toContain('请点击“安装 GEM-X 运行环境”');
  });

  it('evaluates the model capability matrix without coupling it to button styling', () => {
    const source = runtimeSource.match(
      /\/\* CAPTURE_CAPABILITY_MATRIX_START \*\/([\s\S]*?)\/\* CAPTURE_CAPABILITY_MATRIX_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const derive = runInNewContext(
      `const DEPTH_MODEL_ID = 'depth-anything-v2-small';
       const SAPIENS_NORMAL_MODEL_ID = 'sapiens2-normal-0.4b';
       const isDenseModelId = (id) => [DEPTH_MODEL_ID, SAPIENS_NORMAL_MODEL_ID].includes(id);
       ${source};deriveCaptureCapabilityMatrix`,
    ) as (input: {
      engine: {
        id: string;
        available: boolean;
        modelInstalled?: boolean;
        installAvailable?: boolean;
        supportsMultiplePeople: boolean;
      };
      loaded: boolean;
      complete: boolean;
      analyzing: boolean;
      repairing: boolean;
      depthFrameReady: boolean;
      depthFramesComplete: boolean;
      depthCapturing: boolean;
      hasPoseTracks: boolean;
    }) => Record<string, boolean>;
    const base = {
      loaded: true,
      complete: false,
      analyzing: false,
      repairing: false,
      depthFrameReady: false,
      depthFramesComplete: false,
      depthCapturing: false,
      hasPoseTracks: false,
    };

    expect(
      derive({
        ...base,
        engine: { id: 'gem-x', available: true, supportsMultiplePeople: false },
      }),
    ).toMatchObject({
      isDepth: false,
      poseSettingsAvailable: true,
      multiplePeopleAvailable: false,
      dataToolsAvailable: false,
      motionToolsAvailable: false,
    });
    expect(
      derive({
        ...base,
        engine: { id: 'rtmw3d', available: true, supportsMultiplePeople: true },
      }),
    ).toMatchObject({
      captureAvailable: true,
      poseSettingsAvailable: true,
      multiplePeopleAvailable: true,
    });
    expect(
      derive({
        ...base,
        loaded: false,
        complete: true,
        hasPoseTracks: true,
        engine: { id: 'rtmw3d', available: true, supportsMultiplePeople: true },
      }),
    ).toMatchObject({
      captureAvailable: false,
      posePreviewAvailable: true,
      dataToolsAvailable: true,
      motionToolsAvailable: true,
    });
    expect(
      derive({
        ...base,
        depthFrameReady: true,
        depthFramesComplete: true,
        engine: {
          id: 'depth-anything-v2-small',
          available: true,
          supportsMultiplePeople: false,
        },
      }),
    ).toMatchObject({
      isDepth: true,
      poseSettingsAvailable: false,
      multiplePeopleAvailable: false,
      posePreviewAvailable: false,
      depthSourceAvailable: true,
      dataToolsAvailable: false,
      motionToolsAvailable: false,
    });
    expect(
      derive({
        ...base,
        complete: true,
        hasPoseTracks: true,
        engine: {
          id: 'depth-anything-v2-small',
          available: true,
          supportsMultiplePeople: false,
        },
      }),
    ).toMatchObject({
      poseSettingsAvailable: false,
      dataToolsAvailable: true,
      motionToolsAvailable: true,
    });
    expect(
      derive({
        ...base,
        engine: { id: 'rtmw3d', available: false, supportsMultiplePeople: true },
      }),
    ).toMatchObject({
      captureAvailable: false,
      poseSettingsAvailable: true,
      multiplePeopleAvailable: true,
    });
    expect(
      derive({
        ...base,
        engine: {
          id: 'rtmw3d',
          available: false,
          modelInstalled: true,
          installAvailable: true,
          supportsMultiplePeople: true,
        },
      }),
    ).toMatchObject({
      captureAvailable: false,
      poseSettingsAvailable: true,
      multiplePeopleAvailable: true,
    });
    expect(
      derive({
        ...base,
        engine: {
          id: 'gem-x',
          available: false,
          modelInstalled: true,
          installAvailable: true,
          supportsMultiplePeople: false,
        },
      }),
    ).toMatchObject({
      captureAvailable: false,
      poseSettingsAvailable: true,
      multiplePeopleAvailable: false,
    });
  });

  it('shows independently selectable source and white-model panes as soon as a depth video is loaded', () => {
    expect(runtimeSource).toContain('const setSourceOnly = (enabled) =>');
    expect(runtimeSource).toContain('class="mc-depth-pane-label mc-depth-source-label mc-hidden"');
    expect(runtimeSource).toContain('class="mc-depth-pane-label mc-depth-result-label mc-hidden"');
    expect(runtimeSource).toContain('id="mc-depth-state" aria-live="polite"');
    expect(runtimeSource).toContain(
      'const depthSourceAvailable = isDepth && loaded && !repairing;',
    );
    expect(runtimeSource).toContain(
      'setDepthPanelVisibility(state.depthShowSource, !state.depthShowResult);',
    );
    expect(runtimeSource).toContain(
      'setDepthPanelVisibility(!state.depthShowSource, state.depthShowResult);',
    );
    expect(runtimeSource).toContain("setAttribute('aria-pressed', String(resultActive))");
    expect(runtimeSource).toContain("setAttribute('aria-pressed', String(sourceActive))");
    expect(runtimeSource).toContain("classList.toggle('is-error', Boolean(state.depthError))");
    expect(runtimeSource).toContain('state.depthFrameReady && !state.depthError');
    expect(runtimeSource).toContain("elements.stage.classList.toggle('is-depth-dual'");
    expect(runtimeSource).toContain('同步播放原视频与连续白模');
  });

  it('keeps the rendered white-model frame visible and previewable after capture stops', () => {
    expect(runtimeSource).toContain('depthCapturing: false,');
    expect(runtimeSource).toContain('depthFrameReady: false,');
    expect(runtimeSource).toContain('depthFrames: [],');
    expect(runtimeSource).toContain('depthFramesComplete: false,');
    expect(runtimeSource).toContain('state.depthFrameReady = true;');
    expect(runtimeSource).toContain('if (isFirstFrame) updateControls();');
    expect(runtimeSource).toContain('const pauseDepthCapture = () =>');
    expect(runtimeSource).toContain('pauseDepthCapture();');
    expect(runtimeSource).toContain(
      "state.depthFramesComplete\n          ? `${icon('play')}播放二维白模`",
    );
    expect(runtimeSource).toContain(
      'if (depthCompleted && state.depthFrameReady) elements.video.currentTime = 0;',
    );
    expect(runtimeSource).toContain('const depthSampleTimestamps = (');
    expect(runtimeSource).toContain('await seekVideo(timestampMs / 1000);');
    expect(runtimeSource).toContain('state.depthFrames.push(frame);');
    expect(runtimeSource).toContain(
      'showDepthFrameAtTime(storedDepth ? state.previewTime : elements.video.currentTime || 0)',
    );
    expect(runtimeSource).toContain('const preloadDepthFrames = (frameIndex, runId) =>');
    expect(runtimeSource).toContain('while (state.depthBitmapCache.size > 16)');
    expect(runtimeSource).toContain(
      "const isDepthLayer = isDepth && (isSource || filter.dataset.filter === 'skeleton');",
    );
    expect(runtimeSource).toContain(
      "if (isDenseModelId(selectedCaptureEngine().id) && filter === 'skeleton') {",
    );
  });

  it('pauses depth inference without discarding the rendered white-model preview', () => {
    const source = runtimeSource.match(/const pauseDepthCapture = \(\) => \{[\s\S]*?\n  \};/)?.[0];
    expect(source).toBeTruthy();
    const state = {
      depthCapturing: true,
      depthFrameReady: true,
      depthPreview: true,
      depthFrameWaitCancel: () => updates.push('cancel-frame-wait'),
    };
    const updates: string[] = [];
    const video = {
      pause: () => updates.push('pause-video'),
    };
    const pauseDepthCapture = runInNewContext(`${source};pauseDepthCapture`, {
      state,
      elements: {
        video,
        progress: { classList: { add: () => updates.push('hide-progress') } },
      },
      restoreDepthCaptureAudio: () => updates.push('restore-audio'),
      updateDepthPresentation: () => updates.push('presentation'),
      updateStats: () => updates.push('stats'),
      updateControls: () => updates.push('controls'),
    }) as () => void;

    pauseDepthCapture();

    expect(state).toEqual({
      depthCapturing: false,
      depthFrameReady: true,
      depthPreview: true,
      depthFrameWaitCancel: null,
    });
    expect(updates).toEqual([
      'cancel-frame-wait',
      'pause-video',
      'restore-audio',
      'hide-progress',
      'presentation',
      'stats',
      'controls',
    ]);
  });

  it('selects every cached white-model frame from the source video timeline in order', () => {
    const source = runtimeSource.match(
      /\/\* DEPTH_FRAME_TIMELINE_START \*\/([\s\S]*?)\/\* DEPTH_FRAME_TIMELINE_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const depthFrameIndexAtTime = runInNewContext(`${source};depthFrameIndexAtTime`) as (
      frames: Array<{ timestampMs: number }>,
      timestampMs: number,
    ) => number;
    const frames = [0, 33, 67, 100, 133].map((timestampMs) => ({ timestampMs }));

    expect(
      [0, 32, 33, 66, 67, 99, 100, 132, 133].map((time) => depthFrameIndexAtTime(frames, time)),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4]);
  });

  it('builds a deterministic sample timeline that can continue while the window is not active', () => {
    const source = runtimeSource.match(
      /\/\* DEPTH_SAMPLE_TIMELINE_START \*\/([\s\S]*?)\/\* DEPTH_SAMPLE_TIMELINE_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const depthSampleTimestamps = runInNewContext(`${source};depthSampleTimestamps`, {
      DEPTH_SAMPLE_FPS_VALUES: [5, 10, 15],
      DEFAULT_DEPTH_SAMPLE_FPS: 10,
      DEPTH_MAX_STORED_FRAMES: 10_800,
    }) as (durationSeconds: number, sampleFps: number, previousTimestampMs?: number) => number[];

    expect(depthSampleTimestamps(0.35, 10)).toEqual([0, 100, 200, 300]);
    expect(depthSampleTimestamps(0.35, 10, 100)).toEqual([200, 300]);
    expect(depthSampleTimestamps(1, 15)).toHaveLength(15);
  });

  it('keeps two nearby dancers on stable track IDs through order changes and brief occlusion', () => {
    const source = runtimeSource.match(
      /\/\* MULTI_PERSON_TRACKING_START \*\/([\s\S]*?)\/\* MULTI_PERSON_TRACKING_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const tools = runInNewContext(`${source}\n({ trackPoses });`) as {
      trackPoses: (
        poses: unknown[],
        tracks: Map<number, unknown>,
        frameIndex: number,
        smoothing: number,
        nextTrackId: number,
      ) => { people: Array<{ trackId: number }>; nextTrackId: number };
    };
    const trackedPose = (centerX: number, limbShift = 0) => {
      const pose = Array.from({ length: 33 }, () => ({
        x: centerX,
        y: 0.45,
        z: 0,
        visibility: 0.95,
      }));
      for (const [index, x, y] of [
        [11, centerX - 0.06, 0.34],
        [12, centerX + 0.06, 0.34],
        [23, centerX - 0.05, 0.56],
        [24, centerX + 0.05, 0.56],
        [25, centerX - 0.04 + limbShift, 0.74],
        [26, centerX + 0.04 - limbShift, 0.74],
        [27, centerX - 0.04 + limbShift, 0.92],
        [28, centerX + 0.04 - limbShift, 0.92],
      ] as const) {
        pose[index] = { x, y, z: 0, visibility: 0.95 };
      }
      return {
        confidence: 0.9,
        landmarks: pose,
        worldLandmarks: pose.map((item) => ({ ...item })),
      };
    };

    const tracks = new Map<number, unknown>();
    let nextTrackId = 1;
    const first = tools.trackPoses(
      [trackedPose(0.27), trackedPose(0.73)],
      tracks,
      0,
      65,
      nextTrackId,
    );
    nextTrackId = first.nextTrackId;
    expect(first.people.map((person) => person.trackId)).toEqual([1, 2]);

    const reordered = tools.trackPoses(
      [trackedPose(0.7, 0.16), trackedPose(0.3, -0.16)],
      tracks,
      1,
      65,
      nextTrackId,
    );
    nextTrackId = reordered.nextTrackId;
    expect(reordered.people.map((person) => person.trackId)).toEqual([1, 2]);

    const occluded = tools.trackPoses([trackedPose(0.68)], tracks, 2, 65, nextTrackId);
    nextTrackId = occluded.nextTrackId;
    expect(occluded.people.map((person) => person.trackId)).toEqual([2]);

    const recovered = tools.trackPoses(
      [trackedPose(0.34), trackedPose(0.66)],
      tracks,
      6,
      65,
      nextTrackId,
    );
    expect(recovered.people.map((person) => person.trackId)).toEqual([1, 2]);
    expect(recovered.nextTrackId).toBe(3);
  });

  it('adds canvas video import only for a canvas launch while keeping local import standalone', () => {
    const canvasImport = runtimeSource.indexOf('id="mc-canvas-upload"');
    const localImport = runtimeSource.indexOf('id="mc-upload"');
    expect(runtimeSource).toContain("host.context?.launchMode === 'canvas'");
    expect(runtimeSource).toContain("typeof host.readSelectedVideo === 'function'");
    expect(runtimeSource).toContain('画布视频导入');
    expect(runtimeSource).toContain('await host.readSelectedVideo();');
    expect(runtimeSource).toContain('new File([result.bytes], result.fileName');
    expect(canvasImport).toBeGreaterThan(-1);
    expect(canvasImport).toBeLessThan(localImport);
    expect(sandboxFrameSource).toContain("'canvas.readSelectedVideo': 'canvas:read-selection'");
    expect(sandboxFrameSource).toContain("useRef<'canvas' | 'standalone'>");
    expect(sandboxFrameSource).toContain('pluginVideoFromSelection(selected)');
    expect(sandboxFrameSource).toContain('[video.bytes]');
  });

  it('places preview controls on the toolbar left and the current file immediately before local import', () => {
    const toolbar = runtimeSource.indexOf('<div class="mc-toolbar">');
    const filters = runtimeSource.indexOf('id="mc-preview-filters"', toolbar);
    const actions = runtimeSource.indexOf('<div class="mc-toolbar-actions">', toolbar);
    const canvasImport = runtimeSource.indexOf('id="mc-canvas-upload"', actions);
    const fileField = runtimeSource.indexOf('class="mc-file-field"', actions);
    const localImport = runtimeSource.indexOf('id="mc-upload"', actions);

    expect(toolbar).toBeGreaterThan(-1);
    expect(filters).toBeGreaterThan(toolbar);
    expect(filters).toBeLessThan(actions);
    expect(canvasImport).toBeGreaterThan(actions);
    expect(canvasImport).toBeLessThan(fileField);
    expect(fileField).toBeGreaterThan(actions);
    expect(fileField).toBeLessThan(localImport);
    expect(runtimeSource.match(/id="mc-preview-filters"/g)).toHaveLength(1);
    expect(runtimeSource).toMatch(
      /\.mc-categories\s*\{[^}]*flex:\s*1 1 auto;[^}]*overflow-x:\s*auto;/,
    );
    expect(runtimeSource).toMatch(
      /\.mc-toolbar-actions\s*>\s*\.mc-button\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/,
    );
  });

  it('keeps the chrome neutral while the plugin owns its director renderer and mannequin', () => {
    expect(runtimeSource).toContain("modelId: 'studio-mannequin'");
    expect(runtimeSource).toContain('host.mountPoseRigPreview({');
    expect(runtimeSource).toContain('floorLock: state.mapping.floorLock');
    expect(runtimeSource).toContain('floorLock: options.floorLock');
    expect(runtimeSource).toContain('id="mc-mannequin-thumbnail"');
    expect(runtimeSource).not.toContain('mc-man-shell');
    expect(runtimeSource).not.toContain('drawStudioMannequin');
    expect(runtimeSource).not.toContain('createTaperedSphereMesh');
    expect(poseRigPreviewSource).toContain(
      "import PoseRigWorker from '../../data/plugins/qiansi-motion-capture/studio/pluginPoseRigWorker?worker'",
    );
    expect(poseRigPreviewSource).toContain(
      "from '../../data/plugins/qiansi-motion-capture/studio/mannequin'",
    );
    expect(poseRigPreviewSource).not.toContain('directorCharacters');
    expect(poseRigPreviewSource).not.toContain('src/assets/director');
    expect(poseRigPreviewSource).toContain('new OffscreenCanvas(1, 1)');
    expect(poseRigPreviewSource).not.toContain('canvas: OffscreenCanvas');
    expect(poseRigPreviewSource).not.toContain('new THREE.WebGLRenderer');
    expect(poseRigCompatibilitySource).toContain(
      '../../data/plugins/qiansi-motion-capture/studio/pluginPoseRigModel',
    );
    expect(pluginMannequinSource).toContain("id: 'studio-mannequin'");
    expect(pluginMannequinSource).toContain("'../standalone/vendor/studio-mannequin.glb'");
    expect(pluginMannequinSource).not.toContain('src/assets/director');
    expect(poseRigModelSource).toContain('PLUGIN_STUDIO_MANNEQUIN_ID = PLUGIN_STUDIO_MANNEQUIN.id');
    expect(poseRigModelSource).toContain('installPluginStudioMannequinRig');
    expect(poseRigModelSource).toContain('lockPluginPoseFeetToGround(group)');
    expect(poseRigWorkerSource).toContain('new THREE.WebGLRenderer');
    expect(poseRigWorkerSource).toContain('installPluginStudioMannequinRig(group, model)');
    expect(poseRigWorkerSource).toContain('current.canvas.transferToImageBitmap()');
    expect(poseRigWorkerSource).toContain("type: 'bitmap'");
    expect(poseRigWorkerSource).toContain('const renderedHeight = targetHeight *');
    expect(poseRigWorkerSource).toContain(
      'const targetY = current.group.position.y + renderedHeight * 0.5;',
    );
    expect(poseRigWorkerSource).toContain(
      'current.mappingCamera.position.set(targetX, targetY, targetZ + 4);',
    );
    expect(poseRigWorkerSource).toContain(
      'current.mappingCamera.lookAt(targetX, targetY, targetZ);',
    );
    expect(standaloneSyncSource).toContain(
      "const pluginOwnedAssets = ['studio-mannequin.glb', 'studio-mannequin-thumbnail.png'];",
    );
    expect(standaloneSyncSource).not.toContain('src/assets/director');
    const colors = [...runtimeSource.matchAll(/#[0-9a-f]{3,6}\b/gi)].map(([color]) => color);
    expect(colors.length).toBeGreaterThan(10);
    for (const color of colors) {
      const expanded =
        color.length === 4
          ? color
              .slice(1)
              .split('')
              .map((value) => value + value)
          : [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)];
      const [red = 0, green = 0, blue = 0] = expanded.map((value) => Number.parseInt(value, 16));
      expect(green).toBe(blue);
      expect(red).toBeGreaterThanOrEqual(green);
    }
    expect(runtimeSource).not.toMatch(/(?:cyan|green|amber|orange|blue|purple|pink)/i);
  });

  it('marks unrecognized frames red and supports persistent manual joint repair', () => {
    expect(runtimeSource).toContain('--mc-danger: #d45555;');
    expect(runtimeSource).toContain('tr.is-missing td');
    expect(runtimeSource).toContain('data-repair-frame="${index}"');
    expect(runtimeSource).toContain('未识别 · 手动修补');
    expect(runtimeSource).toContain('const seedManualPeople = (frameIndex) =>');
    expect(runtimeSource).toContain('const fallbackManualPerson = (trackId) =>');
    expect(runtimeSource).toContain("elements.overlay.addEventListener('pointermove'");
    expect(runtimeSource).toContain("elements.overlay.addEventListener('keydown'");
    expect(runtimeSource).toContain('frame.manual = true;');
    expect(runtimeSource).toContain('frame.manual === true ? 1 : 0');
    expect(runtimeSource).toContain('const persisted = await persistCapture();');
    expect(runtimeSource).toContain('已手动修补');
  });

  it('uses the flat square Pro Studio desktop shell from the supplied UI reference', () => {
    expect(runtimeSource).toMatch(/\.mc-window\s*\{[^}]*border:\s*0;/);
    expect(runtimeSource).toMatch(/\.mc-window\s*\{[^}]*border-radius:\s*0;/);
    expect(runtimeSource).toMatch(/\.mc-card\s*\{[^}]*border-radius:\s*0;/);
    expect(runtimeSource).toContain('--mc-header-height: 40px;');
    expect(runtimeSource).toContain('Qiansi Motion Captur</span>');
  });

  it('keeps the data review utility rail beside the three-pane repair workstation', () => {
    expect(runtimeSource).toMatch(
      /\.mc-data-view\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*58px\s*376px\s*minmax\(0,\s*1fr\)\s*326px;/,
    );
    expect(runtimeSource).toMatch(
      /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.mc-data-view\s*\{[^}]*grid-template-columns:\s*48px\s*310px\s*minmax\(0,\s*1fr\)\s*300px;/,
    );
    expect(runtimeSource).toContain('aria-label="数据检查导航"');
    expect(runtimeSource).toContain(
      'class="mc-rail-button is-active" type="button" data-view="data" title="数据检查">${icon(\'info\')}',
    );
    expect(runtimeSource).toMatch(/\.mc-data-table-wrap\s*\{[^}]*grid-column:\s*2;/);
    expect(runtimeSource).toMatch(/\.mc-data-stage-slot\s*\{[^}]*grid-column:\s*3;/);
    expect(runtimeSource).toMatch(/\.mc-data-sidebar\s*\{[^}]*grid-column:\s*4;/);
    expect(runtimeSource).toContain('class="mc-data-table-wrap"');
    expect(runtimeSource).not.toContain('id="mc-data-resizer"');
    expect(runtimeSource).not.toContain('aria-label="调整逐帧数据检查宽度"');
    expect(runtimeSource).toContain('id="mc-data-stage-slot"');
    expect(runtimeSource).toContain('class="mc-data-sidebar"');
    expect(runtimeSource).toContain('动作数据概览与导出');
    expect(runtimeSource).toContain('id="mc-data-frame-count"');
    expect(runtimeSource).toContain('id="mc-data-missing-count"');
    expect(runtimeSource).toContain('id="mc-data-export"');
    expect(runtimeSource).toContain('elements.dataExport.disabled = !canExport;');
    expect(runtimeSource).toContain("elements.dataExport.addEventListener('click', exportData);");
    expect(runtimeSource).toContain('data-frame-index="${index}"');
  });

  it('resizes individual frame-data columns from header borders without row stripes', () => {
    const source = runtimeSource.match(
      /\/\* DATA_COLUMN_RESIZE_MATH_START \*\/([\s\S]*?)\/\* DATA_COLUMN_RESIZE_MATH_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const resizeMath = runInNewContext(
      `${source};({ DATA_COLUMN_DEFINITIONS, clampDataColumnWidth, dataColumnTableWidth })`,
    ) as {
      DATA_COLUMN_DEFINITIONS: Record<
        string,
        { defaultWidth: number; minimum: number; maximum: number }
      >;
      clampDataColumnWidth: (column: string, width: number) => number | null;
      dataColumnTableWidth: (widths: Record<string, number>) => number;
    };
    expect(Object.keys(resizeMath.DATA_COLUMN_DEFINITIONS)).toEqual([
      'frame',
      'time',
      'status',
      'confidence',
      'track',
      'points',
    ]);
    expect(resizeMath.clampDataColumnWidth('time', 20)).toBe(58);
    expect(resizeMath.clampDataColumnWidth('time', 220)).toBe(180);
    expect(resizeMath.clampDataColumnWidth('unknown', 100)).toBeNull();
    expect(
      resizeMath.dataColumnTableWidth(
        Object.fromEntries(
          Object.entries(resizeMath.DATA_COLUMN_DEFINITIONS).map(([column, definition]) => [
            column,
            definition.defaultWidth,
          ]),
        ),
      ),
    ).toBe(416);
    for (const [column, label] of [
      ['frame', '帧'],
      ['time', '时间'],
      ['status', '状态'],
      ['confidence', '可见度'],
      ['track', '轨迹'],
      ['points', '点数'],
    ]) {
      expect(runtimeSource).toContain(`data-column-resizer="${column}"`);
      expect(runtimeSource).toContain(`aria-label="调整${label}列宽"`);
    }
    expect(runtimeSource).toContain("resizer.addEventListener('pointerdown'");
    expect(runtimeSource).toContain("resizer.addEventListener('pointermove'");
    expect(runtimeSource).toContain("resizer.addEventListener('keydown'");
    expect(runtimeSource).not.toContain("resizer.addEventListener('dblclick'");
    expect(runtimeSource).toContain(
      'elements.dataTable.style.setProperty(`--mc-data-col-${column}`',
    );
    expect(runtimeSource).toMatch(/\.mc-data-column-resizer\s*\{[^}]*cursor:\s*col-resize;/);
    expect(runtimeSource).toMatch(
      /\.mc-data-table tr\.is-selected td\s*\{\s*background:\s*#202020;\s*\}/,
    );
    expect(runtimeSource).not.toContain('box-shadow: inset 3px 0 #d7d7d7');
  });

  it('implements the complete capture, data, mapping and plugin-owned 3D director layout', () => {
    for (const view of ['studio', 'data', 'mapping', 'director']) {
      expect(runtimeSource).toContain(`data-view="${view}"`);
    }
    expect(runtimeSource).toMatch(
      /\.mc-main\s*\{[^}]*grid-template-columns:\s*58px\s*minmax\(0,\s*1fr\)\s*350px;/,
    );
    expect(runtimeSource).toMatch(
      /\.mc-mapping-view\s*\{[^}]*grid-template-columns:\s*minmax\(330px,\s*30%\)\s*minmax\(0,\s*1fr\)\s*400px;/,
    );
    expect(runtimeSource).toMatch(
      /\.mc-director-view\s*\{[^}]*grid-template-columns:\s*58px\s*276px\s*minmax\(0,\s*1fr\)\s*376px;/,
    );
    expect(runtimeSource).toContain('id="mc-mapping-canvas"');
    expect(runtimeSource).toContain('id="mc-mapping-error"');
    expect(runtimeSource).toContain('<strong>STUDIO MANNEQUIN</strong>');
    expect(runtimeSource).toContain('id="mc-director-canvas"');
    expect(runtimeSource).toContain('id="mc-director-timeline"');
    expect(runtimeSource).toContain('const renderMappingWebgl = () =>');
    expect(runtimeSource).toMatch(/elements\.mappingError,\s*'mapping',/);
    expect(runtimeSource).toMatch(/elements\.directorError,\s*'director',/);
    expect(runtimeSource).toContain('session.update({');
    expect(runtimeSource).not.toContain("getContext('webgl2'");
    expect(runtimeSource).not.toContain('drawStudioMannequin');
    expect(runtimeSource).toContain('class="mc-asset-mannequin"');
    expect(runtimeSource).toContain('<strong>片场绑定人偶</strong>');
    expect(runtimeSource).toContain('<span>Mixamo 标准骨架人偶</span>');
    expect(runtimeSource).toContain("elements.directorCanvas.addEventListener('pointermove'");
    expect(runtimeSource).toMatch(/elements\.directorCanvas\.addEventListener\(\s*'wheel'/);
    expect(runtimeSource).toContain('renderMappingWebgl();');
    expect(runtimeSource).toContain('renderDirectorWebgl();');
    expect(runtimeSource).not.toContain('drawRigCanvas(elements.mappingCanvas');
    expect(runtimeSource).toContain(
      "elements.applyDirector.addEventListener('click', () => setView('director'));",
    );
    expect(runtimeSource).toContain("elements.directorTimeline.addEventListener('input'");
    expect(runtimeSource).toContain('id="mc-timeline-lanes"');
    expect(runtimeSource).toContain("elements.timelineLanes.addEventListener('pointerdown'");
    expect(runtimeSource).toContain("elements.timelineLanes.addEventListener('pointermove'");
    expect(runtimeSource).toContain('const setMotionPreviewTime = (time, options = {}) =>');
    expect(runtimeSource).toContain('const stepMotionPreview = (direction) =>');
    expect(runtimeSource).toContain('const updateDirectorTimelineData = () =>');
    expect(runtimeSource).toContain('timelineMotionAmount(previousPerson, person)');
    expect(runtimeSource).not.toContain('<i class="mc-key" style="left:9%;"></i>');
    expect(poseRigModelSource).toContain("'leftWrist'");
    expect(poseRigModelSource).toContain('points[11] as PluginPosePoint');
    expect(poseRigModelSource).toContain('points[12] as PluginPosePoint');
  });

  it('restores the compact left rail and persists recoverable generation history', () => {
    expect(runtimeSource).toContain('id="mc-generation-history"');
    expect(runtimeSource).toContain('id="mc-history-list"');
    expect(runtimeSource.match(/mc-generation-history-button/g)?.length).toBeGreaterThanOrEqual(4);
    expect(runtimeSource).toMatch(
      /\.mc-main\s*\{\s*grid-template-columns:\s*48px\s*minmax\(0,\s*1fr\)\s*340px;/,
    );
    expect(runtimeSource).toContain('.mc-utility-rail { display: flex; }');
    expect(runtimeSource).not.toContain('.mc-utility-rail, .mc-assets { display: none; }');
    expect(runtimeSource).toContain(
      "const GENERATION_HISTORY_SCHEMA = 'qiansi-motion-generation-history/v1';",
    );
    expect(runtimeSource).toContain(
      "const GENERATION_HISTORY_DOCUMENT_KEY = 'generation-history.v1';",
    );
    expect(runtimeSource).toContain('const GENERATION_HISTORY_MAX_ITEMS = 12;');
    expect(runtimeSource).toContain('await persistPoseGenerationHistory(payload);');
    expect(runtimeSource).toContain('historySaved = await persistDepthGenerationHistory();');
    expect(runtimeSource).toContain('readGenerationHistoryDepthCapture(item)');
    expect(runtimeSource).toContain('await deleteGenerationHistoryDocuments(item);');
    expect(runtimeSource).toContain(
      'const models = [...state.poseEngines, ...state.depthModels, LEGACY_MEDIAPIPE_ENGINE];',
    );
    expect(runtimeSource).not.toContain('...state.depthModels, LEGACY_ENGINE]');
    expect(runtimeSource).toContain('再次点击“确认删除”');
    expect(runtimeSource).toContain('历史不包含原视频');
    expect(runtimeSource).not.toContain('historyVideoBytes');
  });

  it('edits, interpolates, moves and persists real director keyframes', () => {
    for (const id of [
      'mc-director-edit-mode',
      'mc-director-undo',
      'mc-director-redo',
      'mc-director-joint',
      'mc-director-joint-angle',
      'mc-director-key-save',
      'mc-director-key-delete',
      'mc-director-pose-reset',
      'mc-director-timeline-key-save',
      'mc-director-timeline-key-delete',
    ]) {
      expect(runtimeSource).toContain(`id="${id}"`);
    }
    expect(runtimeSource).toContain('directorKeyframes: state.directorKeyframes');
    expect(runtimeSource).toContain('state.directorKeyframes = restored.directorKeyframes;');
    expect(runtimeSource).toContain('edit,');
    expect(runtimeSource).toContain('enabled: directorEditorInteractionEnabled(');
    expect(runtimeSource).toContain("elements.directorCanvas.addEventListener('pointerdown'");
    expect(runtimeSource).toContain("elements.timelineKeys.addEventListener('pointermove'");
    expect(runtimeSource).toContain('data-director-keyframe="${frame.id}"');
    expect(runtimeSource).not.toContain('class="mc-key"');
    expect(poseRigModelSource).toContain('applyPoseEditToDirectorRig(group, frame.edit)');
    expect(poseRigWorkerSource).toContain('updateEditorHelpers(current, frame);');
    expect(runtimeSource).toContain('按住操作视图');
    expect(runtimeSource).toContain("document.addEventListener('keydown'");
    expect(runtimeSource).toContain("event.code === 'Space' && director3d.editMode");
    expect(runtimeSource).toMatch(
      /elements\.directorCanvas\.addEventListener\('keydown',[\s\S]*?event\.ctrlKey[\s\S]*?event\.metaKey[\s\S]*?!\['x', 'y', 'z'\]\.includes\(axis\)/,
    );
    expect(runtimeSource).toContain("void applyDirectorHistory(event.shiftKey ? 'redo' : 'undo')");
    expect(runtimeSource).toContain("void applyDirectorHistory('redo')");
    expect(runtimeSource).toMatch(
      /const applyDirectorHistory = async \(direction\)[\s\S]*?keyframesChanged[\s\S]*?await persistCapture\(\)/,
    );
    expect(runtimeSource).toContain('const beginDirectorHistoryGesture = () =>');
    expect(runtimeSource).toContain('const commitDirectorHistoryGesture = () =>');
    expect(runtimeSource).toContain('const cancelDirectorHistoryGesture = () =>');

    const source = runtimeSource.match(
      /\/\* DIRECTOR_KEYFRAME_MATH_START \*\/([\s\S]*?)\/\* DIRECTOR_KEYFRAME_MATH_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    type DirectorPose = {
      rootPosition: number[];
      rootRotation: number[];
      jointRotations: Record<string, number[]>;
    };
    type DirectorKeyframe = DirectorPose & {
      id: string;
      trackId: number;
      timestampMs: number;
      selectedJoint: string;
    };
    const editor = runInNewContext(`
      ${source}
      ({
        emptyDirectorEditPose,
        normalizeDirectorKeyframes,
        directorEditPoseAt,
        upsertDirectorKeyframe,
        moveDirectorKeyframe,
        directorDraftNeedsSaveBeforeNavigation,
        directorEditorInteractionEnabled,
        appendDirectorHistorySnapshot,
        stepDirectorHistory,
      });
    `) as {
      emptyDirectorEditPose: () => DirectorPose;
      normalizeDirectorKeyframes: (
        value: unknown,
        durationMs?: number,
      ) => DirectorKeyframe[] | null;
      directorEditPoseAt: (
        keyframes: DirectorKeyframe[],
        trackId: number,
        timestampMs: number,
      ) => DirectorPose;
      upsertDirectorKeyframe: (
        keyframes: DirectorKeyframe[],
        next: DirectorKeyframe,
      ) => DirectorKeyframe[];
      moveDirectorKeyframe: (
        keyframes: DirectorKeyframe[],
        id: string,
        timestampMs: number,
        durationMs: number,
      ) => DirectorKeyframe[];
      directorDraftNeedsSaveBeforeNavigation: (
        draft: { trackId: number; timestampMs: number; dirty: boolean } | null,
        trackId: number,
        timestampMs: number,
      ) => boolean;
      directorEditorInteractionEnabled: (editMode: boolean, spaceNavigation: boolean) => boolean;
      appendDirectorHistorySnapshot: <T>(history: T[], snapshot: T) => T[];
      stepDirectorHistory: <T>(
        past: T[],
        future: T[],
        current: T,
        direction: 'undo' | 'redo',
      ) => { past: T[]; future: T[]; snapshot: T } | null;
    };
    const poseA = editor.emptyDirectorEditPose();
    const poseB = structuredClone(poseA);
    poseB.rootPosition = [2, 1, -1];
    poseB.rootRotation = [120, 0, 0];
    poseB.jointRotations.spine = [80, 20, -20];
    const keyframes = editor.normalizeDirectorKeyframes(
      [
        { id: 'a', trackId: 1, timestampMs: 0, selectedJoint: 'spine', ...poseA },
        { id: 'b', trackId: 1, timestampMs: 1000, selectedJoint: 'spine', ...poseB },
      ],
      1000,
    );

    expect(keyframes).not.toBeNull();
    expect(editor.directorEditPoseAt(keyframes || [], 1, 500)).toMatchObject({
      rootPosition: [1, 0.5, -0.5],
      rootRotation: [60, 0, 0],
      jointRotations: { spine: [40, 10, -10] },
    });
    if (!keyframes?.[1]) throw new Error('Expected two normalized director keyframes.');
    const replacement = {
      ...keyframes[1],
      id: 'replacement',
      timestampMs: 1000,
      rootRotation: [180, 0, 0],
    };
    const updated = editor.upsertDirectorKeyframe(keyframes || [], replacement);
    expect(updated).toHaveLength(2);
    expect(updated[1]?.id).toBe('b');
    expect(updated[1]?.rootRotation).toEqual([180, 0, 0]);
    expect(editor.moveDirectorKeyframe(updated, 'b', 2000, 1200)[1]?.timestampMs).toBe(1200);
    expect(
      editor.directorDraftNeedsSaveBeforeNavigation(
        { trackId: 1, timestampMs: 500, dirty: true },
        1,
        600,
      ),
    ).toBe(true);
    expect(
      editor.directorDraftNeedsSaveBeforeNavigation(
        { trackId: 1, timestampMs: 500, dirty: true },
        1,
        500,
      ),
    ).toBe(false);
    expect(
      editor.directorDraftNeedsSaveBeforeNavigation(
        { trackId: 1, timestampMs: 500, dirty: false },
        2,
        500,
      ),
    ).toBe(false);

    const initialHistory = editor.appendDirectorHistorySnapshot([], { value: 0 });
    expect(editor.directorEditorInteractionEnabled(true, false)).toBe(true);
    expect(editor.directorEditorInteractionEnabled(true, true)).toBe(false);
    expect(editor.directorEditorInteractionEnabled(false, false)).toBe(false);
    const secondHistory = editor.appendDirectorHistorySnapshot(initialHistory, { value: 1 });
    expect(editor.appendDirectorHistorySnapshot(secondHistory, { value: 1 })).toHaveLength(2);
    const undone = editor.stepDirectorHistory(secondHistory, [], { value: 2 }, 'undo');
    expect(undone?.snapshot).toMatchObject({ value: 1 });
    expect(undone?.past).toHaveLength(1);
    expect(undone?.future.at(-1)).toMatchObject({ value: 2 });
    const redone = editor.stepDirectorHistory(
      undone?.past || [],
      undone?.future || [],
      undone?.snapshot || { value: 1 },
      'redo',
    );
    expect(redone?.snapshot).toMatchObject({ value: 2 });
    expect(runtimeSource).toContain('const pauseDirectorPlaybackForEdit = () =>');
    expect(runtimeSource).toMatch(
      /const pauseDirectorPlaybackForEdit = \(\) => \{[\s\S]*?elements\.video\.pause\(\)/,
    );
    expect(runtimeSource).toMatch(
      /const pauseDirectorPlaybackForEdit = \(\) => \{[\s\S]*?state\.previewTime = draftTime/,
    );
    expect(runtimeSource).toMatch(
      /const setMotionPreviewTime = \(time, options = \{\}\) => \{[\s\S]*?directorDraftNeedsSaveBeforeNavigation/,
    );
    expect(runtimeSource).toContain('姿态已实时应用；请先保存关键帧再切帧或播放');
  });

  it('maps visible timeline dragging and frame-step controls to real capture timestamps', () => {
    const source = runtimeSource.match(
      /\/\* MOTION_TIMELINE_MATH_START \*\/([\s\S]*?)\/\* MOTION_TIMELINE_MATH_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const timeline = runInNewContext(`
      ${source}
      ({ motionTimelineTimeAtPosition, motionTimelineStepTime });
    `) as {
      motionTimelineTimeAtPosition: (
        clientX: number,
        left: number,
        width: number,
        duration: number,
      ) => number;
      motionTimelineStepTime: (
        frames: Array<{ timestampMs: number }>,
        currentTime: number,
        direction: number,
      ) => number;
    };
    const frames = [
      { timestampMs: 0 },
      { timestampMs: 100 },
      { timestampMs: 200 },
      { timestampMs: 300 },
    ];

    expect(timeline.motionTimelineTimeAtPosition(350, 100, 500, 20)).toBe(10);
    expect(timeline.motionTimelineTimeAtPosition(50, 100, 500, 20)).toBe(0);
    expect(timeline.motionTimelineTimeAtPosition(700, 100, 500, 20)).toBe(20);
    expect(timeline.motionTimelineStepTime(frames, 0.1, -1)).toBe(0);
    expect(timeline.motionTimelineStepTime(frames, 0.1, 1)).toBe(0.2);
    expect(timeline.motionTimelineStepTime(frames, 0.3, 1)).toBe(0.3);
  });

  it('corrects normalized pose width by the source video aspect ratio before mapping', () => {
    const source = runtimeSource.match(
      /\/\* MAPPING_POSE_PROJECTION_START \*\/([\s\S]*?)\/\* MAPPING_POSE_PROJECTION_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const tools = runInNewContext(`
      const state = { source: { width: 720, height: 1280 } };
      const elements = { video: { videoWidth: 0, videoHeight: 0 } };
      const neutralDirectorPoints = () => [];
      const directorPosePoints = () => Array.from({ length: 33 }, () => [0, 0, 0]);
      ${source}
      ({ mappingSourceAspect, mappingPosePoints });
    `) as {
      mappingSourceAspect: () => number;
      mappingPosePoints: (
        person: { landmarks: Array<{ x: number; y: number; z: number }> },
        options: { floorLock: boolean; rootMotion: boolean; mirror: boolean },
      ) => number[][];
    };
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    landmarks[0] = { x: 0.5, y: 0.2, z: 0 };
    landmarks[15] = { x: 0.1, y: 0.42, z: 0 };
    landmarks[16] = { x: 0.9, y: 0.42, z: 0 };
    landmarks[23] = { x: 0.45, y: 0.55, z: 0 };
    landmarks[24] = { x: 0.55, y: 0.55, z: 0 };
    for (const index of [27, 28, 29, 30, 31, 32]) {
      landmarks[index] = { x: index % 2 ? 0.45 : 0.55, y: 0.9, z: 0 };
    }
    const points = tools.mappingPosePoints(
      { landmarks },
      { floorLock: true, rootMotion: false, mirror: false },
    );
    const leftWristX = points[15]?.[0];
    const rightWristX = points[16]?.[0];
    const mappedHeight = points[0]?.[1];
    if (leftWristX === undefined || rightWristX === undefined || mappedHeight === undefined) {
      throw new Error('Mapping projection did not return the required pose points.');
    }
    const mappedArmSpan = rightWristX - leftWristX;
    expect(tools.mappingSourceAspect()).toBeCloseTo(0.5625, 6);
    expect(mappedArmSpan / mappedHeight).toBeCloseTo((0.8 * 0.5625) / 0.7, 6);
  });

  it('repairs legacy RTMW3D axes and collapsed screen points before driving the mannequin', () => {
    const source = runtimeSource.match(
      /\/\* RTMW3D_WORLD_AXES_START \*\/([\s\S]*?)\/\* RTMW3D_WORLD_AXES_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const tools = runInNewContext(`
      ${source}
      ({ RTMW3D_WORLD_CONVENTION, canonicalRtmw3dWorldLandmarks });
    `) as {
      RTMW3D_WORLD_CONVENTION: string;
      canonicalRtmw3dWorldLandmarks: (
        landmarks: Array<{ x: number; y: number; z: number; visibility: number }>,
        coordinateConvention: string,
      ) => Array<{ x: number; y: number; z: number; visibility: number }>;
    };
    const legacyOfficialPlotPoint = [{ x: -0.25, y: -0.1, z: 0.75, visibility: 0.9 }];

    expect(tools.canonicalRtmw3dWorldLandmarks(legacyOfficialPlotPoint, '')).toEqual([
      { x: 0.25, y: -0.75, z: 0.1, visibility: 0.9 },
    ]);
    expect(
      tools.canonicalRtmw3dWorldLandmarks(legacyOfficialPlotPoint, tools.RTMW3D_WORLD_CONVENTION),
    ).toBe(legacyOfficialPlotPoint);
    expect(runtimeSource).toContain('rtmw3dWorldNeedsAxisRepair');
    expect(runtimeSource).toContain('capture.coordinateConvention === RTMW3D_WORLD_CONVENTION');
  });

  it('keeps both 21-point RTMW3D hands and reconstructs legacy saved captures for finger retargeting', () => {
    const source = runtimeSource.match(
      /\/\* RTMW3D_HAND_RETARGET_START \*\/([\s\S]*?)\/\* RTMW3D_HAND_RETARGET_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const tools = runInNewContext(
      `const RTMW3D_HAND_LANDMARK_LAYOUT = 'qiansi-mediapipe33-hands21-v1';\n${source}\n({ rtmw3dHandLandmarks, RTMW3D_LEGACY_RAW_ORDER, RTMW3D_HAND_LANDMARK_LAYOUT });`,
    ) as {
      rtmw3dHandLandmarks: (
        landmarks: Array<{ x: number; y: number; z: number; visibility: number }>,
        side: 'left' | 'right',
        layout: string,
      ) => Array<{ x: number; y: number; z: number; visibility: number }>;
      RTMW3D_LEGACY_RAW_ORDER: number[];
      RTMW3D_HAND_LANDMARK_LAYOUT: string;
    };
    const landmark = (x: number) => ({ x, y: x / 10, z: x / 100, visibility: 0.9 });
    const current = Array.from({ length: 133 }, (_, index) => landmark(index));
    expect(
      tools
        .rtmw3dHandLandmarks(current, 'left', tools.RTMW3D_HAND_LANDMARK_LAYOUT)
        .map((point) => point.x),
    ).toEqual(Array.from({ length: 21 }, (_, index) => index + 33));
    expect(
      tools
        .rtmw3dHandLandmarks(current, 'right', tools.RTMW3D_HAND_LANDMARK_LAYOUT)
        .map((point) => point.x),
    ).toEqual(Array.from({ length: 21 }, (_, index) => index + 54));

    const legacy = tools.RTMW3D_LEGACY_RAW_ORDER.map(landmark);
    expect(tools.rtmw3dHandLandmarks(legacy, 'left', '')?.map((point) => point.x)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 91),
    );
    const legacyRight = tools.rtmw3dHandLandmarks(legacy, 'right', '');
    expect(legacyRight).toHaveLength(21);
    expect(legacyRight[0]?.x).toBe(112);
    expect(legacyRight[20]?.x).toBe(132);
    expect(legacyRight.every((point) => Number.isFinite(point.x))).toBe(true);
    expect(runtimeSource).toContain('const hands = directorPoseHands(person, state.mapping);');
    expect(runtimeSource).toContain('const hands = directorPoseHands(person, options);');
    expect(runtimeSource.match(/\.\.\.\(hands \? \{ hands \} : \{\}\)/g)).toHaveLength(2);
  });

  it('reconstructs normalized RTMW3D screen landmarks from retained camera-space captures', () => {
    const source = runtimeSource.match(
      /\/\* RTMW3D_WORLD_AXES_START \*\/([\s\S]*?)\/\* RTMW3D_WORLD_AXES_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const tools = runInNewContext(`
      ${source}
      ({
        RTMW3D_WORLD_CONVENTION,
        RTMW3D_SCREEN_CONVENTION,
        canonicalRtmw3dWorldLandmarks,
        canonicalRtmw3dScreenLandmarks,
      });
    `) as {
      RTMW3D_WORLD_CONVENTION: string;
      RTMW3D_SCREEN_CONVENTION: string;
      canonicalRtmw3dWorldLandmarks: (
        landmarks: Array<{ x: number; y: number; z: number; visibility: number }>,
        coordinateConvention: string,
      ) => Array<{ x: number; y: number; z: number; visibility: number }>;
      canonicalRtmw3dScreenLandmarks: (
        landmarks: Array<{ x: number; y: number; z: number; visibility: number }>,
        worldLandmarks: Array<{ x: number; y: number; z: number; visibility: number }>,
        sourceAspect: number,
        landmarkConvention: string,
      ) => Array<{ x: number; y: number; z: number; visibility: number }>;
    };
    const legacyWorld = Array.from({ length: 133 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.9,
    }));
    legacyWorld[0] = { x: -0.1, y: 0.13, z: 0.65, visibility: 0.9 };
    legacyWorld[11] = { x: -0.2, y: -0.02, z: 0.48, visibility: 0.9 };
    legacyWorld[12] = { x: 0.08, y: 0.03, z: 0.52, visibility: 0.9 };
    legacyWorld[23] = { x: -0.08, y: 0, z: 0, visibility: 0.9 };
    legacyWorld[24] = { x: 0.08, y: 0, z: 0, visibility: 0.9 };
    for (const index of [27, 28, 29, 30, 31, 32]) {
      legacyWorld[index] = { x: index % 2 ? -0.03 : 0.03, y: 0, z: -0.88, visibility: 0.9 };
    }
    const collapsedScreen = Array.from({ length: 133 }, (_, index) => ({
      x: 0.001 + index * 0.000001,
      y: 0.002 + index * 0.000001,
      z: 0,
      visibility: 0.9,
    }));
    const canonicalWorld = tools.canonicalRtmw3dWorldLandmarks(
      legacyWorld,
      tools.RTMW3D_WORLD_CONVENTION,
    );
    const repaired = tools.canonicalRtmw3dScreenLandmarks(
      collapsedScreen,
      canonicalWorld,
      720 / 1296,
      tools.RTMW3D_SCREEN_CONVENTION,
    );

    expect(canonicalWorld[0]?.y).toBeCloseTo(-0.65, 5);
    expect(repaired[0]?.y).toBeCloseTo(0.08, 5);
    expect(repaired[31]?.y).toBeCloseTo(0.92, 5);
    expect((repaired[11]?.x ?? 0) - (repaired[12]?.x ?? 0)).toBeGreaterThan(0.2);
    expect(runtimeSource).toContain('landmarkConvention: RTMW3D_SCREEN_CONVENTION');
  });

  it('supports checkbox multi-selection, range selection and persisted batch frame deletion', () => {
    const source = runtimeSource.match(
      /\/\* FRAME_MULTI_SELECTION_START \*\/([\s\S]*?)\/\* FRAME_MULTI_SELECTION_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const select = runInNewContext(`${source}\nnextFrameSelection`) as (
      current: Set<number>,
      index: number,
      checked: boolean,
      anchor: number,
      frameCount: number,
      extendRange: boolean,
    ) => { selection: Set<number>; anchor: number };
    const first = select(new Set(), 2, true, -1, 8, false);
    const range = select(first.selection, 5, true, first.anchor, 8, true);

    expect([...range.selection]).toEqual([2, 3, 4, 5]);
    expect(runtimeSource).toContain('id="mc-frame-select-all"');
    expect(runtimeSource).toContain('data-frame-select="${index}"');
    expect(runtimeSource).toContain('id="mc-delete-frames"');
    expect(runtimeSource).toContain('再次点击删除 ${selectedCount} 帧');
    expect(runtimeSource).toContain('state.frames = state.frames.filter');
    expect(runtimeSource).toContain('await persistCapture()');
    expect(runtimeSource).toContain('await clearPersistedCapture()');
  });

  it('paints a reversible frame range by dragging from a checkbox and auto-scrolls at edges', () => {
    const source = runtimeSource.match(
      /\/\* FRAME_MULTI_SELECTION_START \*\/([\s\S]*?)\/\* FRAME_MULTI_SELECTION_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const select = runInNewContext(`${source}\nframeSelectionFromDragSnapshot`) as (
      snapshot: Set<number>,
      startIndex: number,
      currentIndex: number,
      checked: boolean,
      frameCount: number,
    ) => Set<number>;

    expect([...select(new Set([0, 6]), 2, 5, true, 8)]).toEqual([0, 2, 3, 4, 5, 6]);
    expect([...select(new Set([0, 2, 3, 4, 5, 6]), 5, 2, false, 8)]).toEqual([0, 6]);
    expect([...select(new Set([-1, 1, 9]), 9, -4, true, 5)]).toEqual([0, 1, 2, 3, 4]);

    expect(runtimeSource).toContain("elements.dataBody.addEventListener('pointerdown'");
    expect(runtimeSource).toContain("elements.dataBody.addEventListener('pointermove'");
    expect(runtimeSource).toContain("elements.dataBody.addEventListener('pointerup'");
    expect(runtimeSource).toContain('elements.dataBody.setPointerCapture?.(event.pointerId)');
    expect(runtimeSource).toContain('document.elementFromPoint(clientX, clientY)');
    expect(runtimeSource).toContain('dataTableScroll.scrollTop += scrollDelta');
    expect(runtimeSource).toContain("elements.shell.classList.add('is-frame-selection-dragging')");
    expect(runtimeSource).toContain('按住并上下拖动可连续选择');
  });

  it('makes the mapping T-Pose control a real toggle instead of a permanently active label', () => {
    expect(runtimeSource).toContain('id="mc-mapping-reset-pose" aria-pressed="false"');
    expect(runtimeSource).toContain('state.mapping.restPose = !state.mapping.restPose;');
    expect(runtimeSource).toContain(
      "elements.mappingResetPose.classList.toggle('is-active', state.mapping.restPose);",
    );
    expect(runtimeSource).toContain(
      "elements.mappingResetPose.setAttribute('aria-pressed', String(state.mapping.restPose));",
    );
  });

  it('exports a selected person as a finite Blender-oriented BVH armature animation', () => {
    const source = runtimeSource.match(
      /\/\* BVH_EXPORT_START \*\/([\s\S]*?)\/\* BVH_EXPORT_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const tools = runInNewContext(`${source}\n({ buildBvhAnimation, bvhTrackSamples });`) as {
      bvhTrackSamples: (
        frames: unknown[],
        trackId: number,
      ) => Array<{
        landmarks: Array<{ x: number; y: number; z: number; visibility: number }>;
        worldLandmarks: Array<{ x: number; y: number; z: number; visibility: number }>;
      }>;
      buildBvhAnimation: (
        samples: unknown[],
        fps: number,
        editAt?: (timestamp: number) => unknown,
      ) => string;
    };

    const person = (trackId: number, shiftX: number, raisedArm: boolean) => {
      const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
      const set = (index: number, x: number, y: number, z = 0) => {
        world[index] = { x, y, z, visibility: 1 };
      };
      set(0, 0, -0.74);
      set(7, -0.07, -0.7);
      set(8, 0.07, -0.7);
      set(11, -0.24, -0.48);
      set(12, 0.24, -0.48);
      set(13, -0.43, raisedArm ? -0.58 : -0.2);
      set(14, 0.43, -0.2);
      set(15, -0.55, raisedArm ? -0.72 : 0.02);
      set(16, 0.55, 0.02);
      set(19, -0.62, raisedArm ? -0.76 : 0.08);
      set(20, 0.62, 0.08);
      set(23, -0.14, 0);
      set(24, 0.14, 0);
      set(25, -0.14, 0.44);
      set(26, 0.14, 0.44);
      set(27, -0.14, 0.9);
      set(28, 0.14, 0.9);
      set(31, -0.14, 0.98, -0.14);
      set(32, 0.14, 0.98, -0.14);
      const landmarks = world.map((landmark) => ({
        x: 0.5 + landmark.x * 0.4 + shiftX,
        y: 0.35 + landmark.y * 0.35,
        z: landmark.z * 0.4,
        visibility: 1,
      }));
      return { trackId, confidence: 0.95, landmarks, worldLandmarks: world };
    };
    const frames = [
      { timestampMs: 0, people: [person(2, 0, false)] },
      { timestampMs: 100, people: [] },
      { timestampMs: 200, people: [person(2, 0.08, true)] },
    ];
    const samples = tools.bvhTrackSamples(frames, 2);
    const bvh = tools.buildBvhAnimation(samples, 10);
    const lines = bvh.trim().split(/\r?\n/);
    const motionIndex = lines.indexOf('MOTION');
    const channelCount = [...bvh.matchAll(/CHANNELS (\d+)/g)].reduce(
      (total, match) => total + Number(match[1]),
      0,
    );
    const motionRows = lines
      .slice(motionIndex + 3)
      .map((line) => line.trim().split(/\s+/).map(Number));

    expect(samples).toHaveLength(3);
    expect(bvh).toContain('ROOT Hips');
    expect(bvh).toContain('JOINT LeftUpLeg');
    expect(bvh).toContain('JOINT RightHand');
    expect(bvh).toContain('Frames: 3');
    expect(bvh).toContain('Frame Time: 0.100000');
    expect((bvh.match(/{/g) || []).length).toBe((bvh.match(/}/g) || []).length);
    expect(channelCount).toBe(66);
    expect(motionRows).toHaveLength(3);
    motionRows.forEach((row) => {
      expect(row).toHaveLength(channelCount);
      expect(row.every(Number.isFinite)).toBe(true);
    });
    const firstRootX = motionRows[0]?.[0];
    const lastRow = motionRows[2];
    const lastRootX = lastRow?.[0];
    expect(firstRootX).toBeDefined();
    expect(lastRootX).toBeDefined();
    if (firstRootX === undefined || lastRootX === undefined || !lastRow) {
      throw new Error('BVH motion rows are incomplete.');
    }
    expect(lastRootX).toBeGreaterThan(firstRootX);
    expect(lastRow.slice(6).some((value) => Math.abs(value) > 0.1)).toBe(true);
    const timestamps: number[] = [];
    const edited = tools.buildBvhAnimation(samples, 10, (timestamp) => {
      timestamps.push(timestamp);
      return {
        rootPosition: [1, 2, 3],
        rootRotation: [0, 0, 0],
        jointRotations: { spine: [0, 45, 0] },
      };
    });
    const editedMotion = edited.split('Frame Time: 0.100000\n')[1];
    if (!editedMotion) throw new Error('Edited BVH motion rows are missing.');
    const editedRows = editedMotion
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number));
    expect(timestamps).toEqual([0, 100, 200]);
    editedRows.forEach((row, index) => {
      const baseline = motionRows[index];
      if (!baseline) throw new Error('Original BVH motion row is missing.');
      expect(row[0]).toBeCloseTo(Number(baseline[0]) + 1, 4);
      expect(row[1]).toBeCloseTo(Number(baseline[1]) - 3, 4);
      expect(row[2]).toBeCloseTo(Number(baseline[2]) + 2, 4);
      expect(row.every(Number.isFinite)).toBe(true);
      expect(row.slice(6, 9)).not.toEqual(baseline.slice(6, 9));
    });
    expect(tools.buildBvhAnimation(samples, 10, () => null)).toBe(bvh);
  });

  it('does not erase a typed director root transform on the next render tick', () => {
    const source = runtimeSource.match(
      /\/\* DIRECTOR_INPUT_SYNC_START \*\/([\s\S]*?)\/\* DIRECTOR_INPUT_SYNC_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const sync = runInNewContext(`${source}\nsyncDirectorRootInput;`) as (
      input: unknown,
      pose: unknown,
      focused: unknown,
    ) => void;
    const input = { value: '30', dataset: { axis: 'y', rootChannel: 'rotation' } };
    const pose = { rootPosition: [0, 0, 0], rootRotation: [0, 0, 0] };
    sync(input, pose, input);
    expect(input.value).toBe('30');
    pose.rootRotation[1] = Number(input.value);
    sync(input, pose, null);
    expect(input.value).toBe('30');
    pose.rootRotation[1] = 45;
    sync(input, pose, null);
    expect(input.value).toBe('45');
    expect(runtimeSource).toContain('syncDirectorRootInput(input, pose, document.activeElement)');
  });

  it('offers BVH by default while retaining the complete raw JSON export', () => {
    expect(runtimeSource).toContain('<option value="bvh" selected>BVH · Blender / 3D</option>');
    expect(runtimeSource).toContain('<option value="json">JSON · 原始关键点</option>');
    expect(runtimeSource).toContain('const samples = bvhTrackSamples(state.frames, trackId);');
    expect(runtimeSource).toContain("downloadExport(bvh, 'text/plain;charset=utf-8'");
    expect(runtimeSource).toContain("downloadExport(JSON.stringify(payload), 'application/json'");
    expect(runtimeSource).toContain('骨盆位移由画面坐标估算');
  });

  it('includes empty, analyzing, complete, cancelled and failed user states', () => {
    for (const label of ['尚未选择视频', '捕捉中', '捕捉完成', '已取消', '捕捉失败']) {
      expect(runtimeSource).toContain(label);
    }
    expect(runtimeSource).toContain('host.requestClose?.()');
    expect(runtimeSource).toContain('elements.analyze.disabled = !captureAvailable;');
    expect(runtimeSource).toContain('(!loaded && !complete && !state.depthFrames.length)');
    expect(runtimeSource).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps the real Worker failure visible after the inspector refreshes', () => {
    expect(runtimeSource).toContain('id="mc-capture-error" role="alert"');
    expect(runtimeSource).toContain("captureError: ''");
    expect(runtimeSource).toContain('setCaptureError(error instanceof Error ? error');
    expect(runtimeSource).toContain(': state.captureError');
    expect(runtimeSource).toContain('? `捕捉失败 · ${state.captureError}`');
    expect(runtimeSource).toContain('`失败原因：${state.captureError}`');
  });

  it('restores playable pose layers and safely rebinds the original without storing video bytes', () => {
    expect(runtimeSource).toContain("const CAPTURE_DOCUMENT_KEY = 'latest-capture.v1'");
    expect(runtimeSource).toContain('host.writeProjectDocument(');
    expect(runtimeSource).toContain('host.readProjectDocument(CAPTURE_DOCUMENT_KEY)');
    expect(runtimeSource).toContain('host.deleteProjectDocument(CAPTURE_DOCUMENT_KEY');
    expect(runtimeSource).toContain(
      'const restoredPose = snapshot ? normalizeStoredCapture(snapshot.value) : null;',
    );
    expect(runtimeSource).toContain('const persisted = await persistCapture();');
    expect(runtimeSource).toContain('已恢复上次捕捉数据');
    expect(runtimeSource).toContain('骨骼动作可直接播放');
    expect(runtimeSource).toContain(
      '...(state.fileFingerprint ? { sourceFingerprint: state.fileFingerprint } : {}),',
    );
    expect(runtimeSource).toContain('const rebindPoseSource = async (file) =>');
    expect(runtimeSource).toContain('error.preserveCapture = true;');
    expect(runtimeSource).toContain('openSourceRebindPicker');
    expect(runtimeSource).toContain('const payload = capturePayload();');
    expect(runtimeSource).toContain("encoding: 'compact-landmarks-v1'");
    expect(runtimeSource).toContain('const payload = storagePayload();');
    expect(runtimeSource).not.toContain('bytes: state.file');
  });

  it('matches a rebound pose source by metadata and optional fingerprint', () => {
    const source = runtimeSource.match(
      /\/\* POSE_SOURCE_REBIND_START \*\/([\s\S]*?)\/\* POSE_SOURCE_REBIND_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const poseSourceMatches = runInNewContext(`${source};poseSourceMatches`) as (
      storedSource: Record<string, unknown>,
      source: Record<string, unknown>,
      storedFingerprint: string,
      fingerprint: string,
    ) => boolean;
    const storedSource = {
      fileName: 'IMG_7013.MP4',
      fileSize: 6_700_000,
      mimeType: 'video/mp4',
      durationSeconds: 22.2,
      width: 720,
      height: 1280,
    };

    expect(poseSourceMatches(storedSource, storedSource, '', 'new-fingerprint')).toBe(true);
    expect(poseSourceMatches(storedSource, storedSource, 'same', 'same')).toBe(true);
    expect(poseSourceMatches(storedSource, storedSource, 'first', 'second')).toBe(false);
    expect(
      poseSourceMatches(
        storedSource,
        { ...storedSource, fileName: 'other.mp4' },
        '',
        'new-fingerprint',
      ),
    ).toBe(false);
    expect(
      poseSourceMatches(
        storedSource,
        { ...storedSource, durationSeconds: 21 },
        '',
        'new-fingerprint',
      ),
    ).toBe(false);
  });

  it('drives every pose preview layer and transport from restored motion frames', () => {
    expect(runtimeSource).toContain(
      'nearestFrame(state.file ? video.currentTime : state.previewTime)',
    );
    expect(runtimeSource).toContain('const completeTrail = state.frames');
    expect(runtimeSource).toContain('const usesStoredMotionPlayback = () =>');
    expect(runtimeSource).toContain('const togglePrimaryPlayback = () =>');
    expect(runtimeSource).toContain('setMotionPreviewTime(Number(elements.timeline.value));');
    expect(runtimeSource).toContain("elements.overlay.addEventListener('click', () =>");
    expect(runtimeSource).toContain('state.showSource = Boolean(enabled);');
    expect(runtimeSource).toContain(
      "elements.video.classList.toggle('mc-hidden', !sourceVisible);",
    );
    expect(runtimeSource).toContain(
      '!state.frames.length || !(state.showSkeleton || state.showJoints || state.showTrail)',
    );
  });

  it('round-trips persisted white-model frame bytes and rejects mismatched source videos', () => {
    const source = runtimeSource.match(
      /\/\* DEPTH_PERSISTENCE_CODEC_START \*\/([\s\S]*?)\/\* DEPTH_PERSISTENCE_CODEC_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const codec = runInNewContext(
      `
        const DEPTH_FRAME_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
        const NORMAL_FRAME_ENCODING = 'camera-normal-rgb-v1';
        const finiteNumber = (value, minimum, maximum) => {
          const number = Number(value);
          return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
        };
        ${source};
        ({ depthFrameStorageTuple, depthFrameFromStorageTuple, depthSourceMatches });
      `,
      { atob, btoa, TextEncoder, Uint8Array, ArrayBuffer },
    ) as {
      depthFrameStorageTuple: (frame: Record<string, unknown>) => unknown[];
      depthFrameFromStorageTuple: (
        frame: unknown[],
        maximumTimestampMs: number,
      ) => Record<string, unknown> | null;
      depthSourceMatches: (
        storedSource: Record<string, unknown>,
        source: Record<string, unknown>,
        storedFingerprint: string,
        fingerprint: string,
      ) => boolean;
    };
    const storedBytes = [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80];
    const tuple = codec.depthFrameStorageTuple({
      bytes: new Uint8Array(storedBytes).buffer,
      timestampMs: 133,
      width: 320,
      height: 180,
      inferenceMs: 48,
    });
    const restored = codec.depthFrameFromStorageTuple(tuple, 1_000);

    expect(tuple.slice(0, 4)).toEqual([133, 320, 180, 48]);
    expect(Array.from(new Uint8Array(restored?.bytes as ArrayBuffer))).toEqual(storedBytes);
    expect(restored).toMatchObject({
      mimeType: 'image/webp',
      timestampMs: 133,
      width: 320,
      height: 180,
      inferenceMs: 48,
    });
    const rawTuple = codec.depthFrameStorageTuple({
      bytes: new Uint8Array(storedBytes).buffer,
      timestampMs: 266,
      width: 320,
      height: 180,
      inferenceMs: 50,
      normalEncoding: 'camera-normal-rgb-v1',
    });
    expect(rawTuple[5]).toBe('camera-normal-rgb-v1');
    expect(codec.depthFrameFromStorageTuple(rawTuple, 1_000)).toMatchObject({
      normalEncoding: 'camera-normal-rgb-v1',
    });
    expect(codec.depthFrameFromStorageTuple(tuple.slice(0, 5), 1_000)).toBeTruthy();

    const sourceMetadata = {
      fileSize: 1234,
      durationSeconds: 22.3,
      width: 720,
      height: 1296,
    };
    expect(codec.depthSourceMatches(sourceMetadata, sourceMetadata, 'same', 'same')).toBe(true);
    expect(codec.depthSourceMatches(sourceMetadata, sourceMetadata, 'first', 'second')).toBe(false);
    expect(
      codec.depthSourceMatches(
        sourceMetadata,
        { ...sourceMetadata, durationSeconds: 21 },
        'same',
        'same',
      ),
    ).toBe(false);
  });

  it('saves every displayed white-model frame in bounded project-document chunks', () => {
    expect(runtimeSource).toContain(
      "const DEPTH_CAPTURE_DOCUMENT_KEY = 'latest-depth-capture.v1';",
    );
    expect(runtimeSource).toContain(
      "const DEPTH_FRAME_DOCUMENT_PREFIX = 'latest-depth-frames.v1.';",
    );
    expect(runtimeSource).toContain('const DEPTH_FRAME_DOCUMENT_TARGET_BYTES = 8 * 1024 * 1024;');
    expect(runtimeSource).toContain('const DEPTH_MAX_FRAME_DOCUMENTS = 60;');
    expect(runtimeSource).toContain('await ensureDepthStorage();');
    expect(runtimeSource).toContain('await persistDepthFrame(frame);');
    expect(runtimeSource).toContain('await persistDepthCompletion();');
    expect(runtimeSource).toContain('const [snapshot, restoredDepth] = await Promise.all');
    expect(runtimeSource).toContain('readStoredDepthCapture()');
    expect(runtimeSource).toContain('白模断点已恢复');
    expect(runtimeSource).toContain('可直接播放白模；旧记录的原视频需重新导入一次');
    expect(runtimeSource).toContain('persistMotionSourceVideo');
    expect(runtimeSource).toContain('readMotionSourceVideo');
    expect(runtimeSource).toContain('sampleFps: state.depthSampleFps');
    expect(runtimeSource).toContain('modelId: selectedDepthModel().id');
    expect(runtimeSource).toContain(
      'const modelId = DENSE_MODEL_IDS.includes(value.modelId) ? value.modelId : DEPTH_MODEL_ID;',
    );
    expect(runtimeSource).toContain('elements.engine.value = restored.modelId;');
    expect(runtimeSource).toContain('backend: state.depthBackend');
    expect(runtimeSource).toContain('inputSize: state.depthInputSize');
    expect(runtimeSource).toContain('wasmThreads: state.depthWasmThreads');
    expect(runtimeSource).toContain('gpuPowerPreference: state.depthGpuPowerPreference');
    expect(runtimeSource).toContain('temporalSmoothing: state.depthTemporalSmoothing');

    const persistPosition = runtimeSource.indexOf('await persistDepthFrame(frame);');
    const visibleCountPosition = runtimeSource.indexOf(
      'state.depthFrames.push(frame);',
      persistPosition,
    );
    expect(persistPosition).toBeGreaterThan(-1);
    expect(visibleCountPosition).toBeGreaterThan(persistPosition);
  });

  it('commits the depth index before each new frame chunk and records completion last', async () => {
    const source = runtimeSource.match(
      /\/\* DEPTH_PERSISTENCE_WRITER_START \*\/([\s\S]*?)\/\* DEPTH_PERSISTENCE_WRITER_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const calls: Array<{
      key: string;
      value: Record<string, unknown>;
      expectedRevision: number;
    }> = [];
    const revisions = new Map<string, number>();
    const host = {
      writeProjectDocument: async (
        key: string,
        value: Record<string, unknown>,
        expectedRevision: number,
      ) => {
        calls.push({ key, value: structuredClone(value), expectedRevision });
        const revision = (revisions.get(key) || 0) + 1;
        revisions.set(key, revision);
        return { revision };
      },
    };
    const state = {
      source: {
        fileName: 'source.mp4',
        fileSize: 100,
        mimeType: 'video/mp4',
        durationSeconds: 2,
        width: 320,
        height: 180,
      },
      fileFingerprint: 'fingerprint',
      depthSourceFingerprint: '',
      depthSourceAssetId: '',
      depthStoredModelId: '',
      depthStoredSource: null,
      depthCreatedAt: '',
      depthDocumentRevision: 0,
      depthStorageChunks: [] as Array<{ revision: number; frames: unknown[] }>,
      depthFrames: [] as Array<Record<string, unknown>>,
      depthFramesComplete: false,
      depthSampleFps: 10,
      depthBackend: 'wasm',
      depthInputSize: 518,
      depthWasmThreads: 4,
      depthGpuPowerPreference: 'high-performance',
      depthInvert: false,
      depthBlackPoint: 0.04,
      depthWhitePoint: 0.96,
      depthGamma: 0.9,
      depthTemporalSmoothing: 0.25,
      normalSettings: { sampleFps: 10, output: 'normal' },
      depthNormalFrameEncoding: 'camera-normal-rgb-v1',
      activeHistoryId: '',
      activeHistoryDocumentRevision: 0,
    };
    const writer = runInNewContext(
      `
        const DEPTH_CAPTURE_SCHEMA = 'qiansi-motion-depth/v1';
        const SAPIENS_NORMAL_MODEL_ID = 'sapiens2-normal-0.4b';
        const NORMAL_FRAME_ENCODING = 'camera-normal-rgb-v1';
        const DEPTH_CAPTURE_DOCUMENT_KEY = 'latest-depth-capture.v1';
        const DEPTH_FRAME_DOCUMENT_PREFIX = 'latest-depth-frames.v1.';
        const DEPTH_FRAME_DOCUMENT_TARGET_BYTES = 1;
        const DEPTH_FRAME_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
        const DEPTH_MAX_FRAME_DOCUMENTS = 60;
        const depthSourceMatches = (_storedSource, _source, storedFingerprint, fingerprint) =>
          storedFingerprint === fingerprint;
        const depthFrameStorageTuple = (frame) => [frame.timestampMs, 'frame'];
        const depthChunkPayload = (sourceFingerprint, index, frames) => ({
          schema: DEPTH_CAPTURE_SCHEMA,
          sourceFingerprint,
          index,
          frames,
        });
        const depthChunkPayloadBytes = (payload) => JSON.stringify(payload).length;
        const depthFrameDocumentKey = (index) =>
          DEPTH_FRAME_DOCUMENT_PREFIX + String(index).padStart(2, '0');
        const ensureActiveHistoryId = () => 'history-fixture';
        ${source};
        ({ persistDepthFrame, persistDepthCompletion });
      `,
      { host, state, selectedDepthModel: () => ({ id: 'sapiens2-normal-0.4b' }) },
    ) as {
      persistDepthFrame: (frame: Record<string, unknown>) => Promise<void>;
      persistDepthCompletion: () => Promise<void>;
    };
    const firstFrame = { timestampMs: 0 };
    const secondFrame = { timestampMs: 33 };

    await writer.persistDepthFrame(firstFrame);
    state.depthFrames.push(firstFrame);
    await writer.persistDepthFrame(secondFrame);
    state.depthFrames.push(secondFrame);
    await writer.persistDepthCompletion();

    expect(calls.map((call) => call.key)).toEqual([
      'latest-depth-capture.v1',
      'latest-depth-capture.v1',
      'latest-depth-frames.v1.00',
      'latest-depth-capture.v1',
      'latest-depth-frames.v1.01',
      'latest-depth-capture.v1',
    ]);
    expect(calls.filter((call) => call.key === 'latest-depth-capture.v1')).toMatchObject([
      {
        expectedRevision: 0,
        value: {
          modelId: 'sapiens2-normal-0.4b',
          chunkCount: 0,
          frameCount: 0,
          complete: false,
        },
      },
      {
        expectedRevision: 1,
        value: {
          modelId: 'sapiens2-normal-0.4b',
          chunkCount: 1,
          frameCount: 0,
          complete: false,
        },
      },
      {
        expectedRevision: 2,
        value: {
          modelId: 'sapiens2-normal-0.4b',
          chunkCount: 2,
          frameCount: 1,
          complete: false,
        },
      },
      {
        expectedRevision: 3,
        value: {
          modelId: 'sapiens2-normal-0.4b',
          chunkCount: 2,
          frameCount: 2,
          complete: true,
        },
      },
    ]);
  });

  it('restores saved depth chunks and tolerates only an unfinished final chunk', async () => {
    const source = runtimeSource.match(
      /\/\* DEPTH_PERSISTENCE_READER_START \*\/([\s\S]*?)\/\* DEPTH_PERSISTENCE_READER_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const documents = new Map<string, unknown>([
      [
        'latest-depth-capture.v1',
        {
          revision: 4,
          updatedAt: 100,
          value: {
            schema: 'qiansi-motion-depth/v1',
            source: { durationSeconds: 2 },
            sourceFingerprint: 'fingerprint',
            chunkCount: 2,
            frameCount: 0,
            complete: false,
            createdAt: 'now',
          },
        },
      ],
      [
        'latest-depth-frames.v1.00',
        {
          revision: 2,
          updatedAt: 200,
          value: {
            schema: 'qiansi-motion-depth/v1',
            sourceFingerprint: 'fingerprint',
            index: 0,
            frames: [[33, 'frame']],
          },
        },
      ],
    ]);
    const state = { depthDocumentRevision: 0 };
    const host = {
      readProjectDocument: async (key: string) => documents.get(key) || null,
    };
    const read = runInNewContext(
      `
        const DEPTH_CAPTURE_DOCUMENT_KEY = 'latest-depth-capture.v1';
        const DEPTH_CAPTURE_SCHEMA = 'qiansi-motion-depth/v1';
        const DEPTH_FRAME_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
        const DEPTH_MAX_STORED_FRAMES = 10800;
        const SAPIENS_NORMAL_MODEL_ID = 'sapiens2-normal-0.4b';
        const NORMAL_FRAME_ENCODING = 'camera-normal-rgb-v1';
        const depthFrameDocumentKey = (index) =>
          'latest-depth-frames.v1.' + String(index).padStart(2, '0');
        const normalizeStoredDepthIndex = (value) => value;
        const depthChunkPayloadBytes = (value) => JSON.stringify(value).length;
        const depthFrameFromStorageTuple = (value) => ({
          bytes: new ArrayBuffer(12),
          mimeType: 'image/webp',
          timestampMs: value[0],
          width: 320,
          height: 180,
          inferenceMs: 10,
        });
        ${source};
        readStoredDepthCapture;
      `,
      { host, state, ArrayBuffer },
    ) as () => Promise<{
      frames: Array<{ timestampMs: number }>;
      chunks: Array<{ revision: number; frames: unknown[] }>;
      complete: boolean;
      updatedAt: number;
    }>;

    const restored = await read();

    expect(state.depthDocumentRevision).toBe(4);
    expect(restored.frames.map((frame) => frame.timestampMs)).toEqual([33]);
    expect(restored.chunks).toEqual([
      { revision: 2, frames: [[33, 'frame']] },
      { revision: 0, frames: [] },
    ]);
    expect(restored.complete).toBe(false);
    expect(restored.updatedAt).toBe(200);
  });

  it('keeps saved white-model frames when the page unloads or the model view changes', () => {
    expect(runtimeSource).toContain("window.addEventListener('beforeunload', () => {");
    expect(runtimeSource).toContain('stopDepthPreview({ discardFrames: false });');
    expect(runtimeSource).toContain('const resumesDepth =');
    expect(runtimeSource).toContain(
      'const fileFingerprint = await fingerprintDepthSourceFile(file);',
    );
    expect(runtimeSource).toContain(
      '源视频校验一致，可从第 ${state.depthFrames.length + 1} 帧继续生成',
    );
    expect(runtimeSource).toContain('await clearPersistedDepthCapture();');
  });

  it('keeps a worst-case four-person compact capture below the host 16 MiB document limit', () => {
    const packed = Array.from({ length: 132 }, () => -99.99999);
    const person = [4, 0.99999, packed, packed];
    const payload = {
      schema: 'qiansi-motion-capture/v3',
      encoding: 'compact-landmarks-v1',
      source: {
        fileName: 'x'.repeat(260),
        fileSize: Number.MAX_SAFE_INTEGER,
        mimeType: 'video/mp4',
        durationSeconds: 90,
        width: 16384,
        height: 16384,
      },
      capture: {
        engineId: 'mediapipe-full',
        model: 'MediaPipe Pose Landmarker Full',
        skeleton: 'mediapipe-33',
        jointCount: 33,
        maxPoses: 4,
        sampleFps: 15,
        smoothing: 0.9,
        confidenceThreshold: 0.8,
      },
      frames: Array.from({ length: 1350 }, (_, index) => [
        index * 67,
        [person, person, person, person],
      ]),
    };

    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeLessThan(
      16 * 1024 * 1024,
    );
  });

  it('awaits native playback and exposes codec failures instead of silently ignoring them', () => {
    expect(runtimeSource).toContain('preload="auto"');
    expect(runtimeSource).toContain('await elements.video.play();');
    expect(runtimeSource).toContain('showPlaybackError(error);');
    expect(runtimeSource).toContain('H.264 MP4 或 VP9 WebM');
    expect(runtimeSource).not.toContain('void elements.video.play()');
  });

  it('toggles native playback when the visible video or white-model surface is activated', async () => {
    expect(runtimeSource).toContain('class="mc-video mc-playback-surface mc-hidden"');
    expect(runtimeSource).toContain(
      'class="mc-video mc-playback-surface mc-depth-preview mc-hidden"',
    );
    expect(runtimeSource).toContain('role="button" aria-label="播放视频"');
    expect(runtimeSource).toContain(
      "elements.play.addEventListener('click', togglePrimaryPlayback);",
    );
    expect(runtimeSource).toContain(
      'for (const surface of [elements.video, elements.depthPreview]) {',
    );
    expect(runtimeSource).toContain("surface.addEventListener('click', togglePrimaryPlayback);");
    expect(runtimeSource).toContain("elements.overlay.addEventListener('click', () =>");
    expect(runtimeSource).toContain("event.key !== ' ' && event.key !== 'Enter'");
    expect(runtimeSource).toContain('if (!state.file || state.analyzing || state.repair) return;');
    expect(runtimeSource).toContain('updateVideoPlaybackSurfacePresentation();');
    expect(runtimeSource).toContain('.mc-playback-surface:focus-visible');
    expect(runtimeSource).toContain('.mc-overlay.is-repairing');
    expect(runtimeSource).toContain("surface.removeAttribute('title');");
    expect(runtimeSource).not.toContain('点击画面或按空格键');
    expect(runtimeSource).not.toContain('surface.title =');

    const source = runtimeSource.match(
      /\/\* VIDEO_PLAYBACK_TOGGLE_START \*\/([\s\S]*?)\/\* VIDEO_PLAYBACK_TOGGLE_END \*\//,
    )?.[1];
    expect(source).toBeTruthy();
    const calls: string[] = [];
    const video = {
      paused: true,
      ended: true,
      currentTime: 22,
      pause() {
        this.paused = true;
        calls.push('pause');
      },
      async play() {
        this.paused = false;
        calls.push('play');
      },
    };
    const state: {
      file: object | null;
      analyzing: boolean;
      repair: object | null;
      duration: number;
    } = {
      file: {},
      analyzing: false,
      repair: null,
      duration: 22,
    };
    const toggle = runInNewContext(`${source};toggleVideoPlayback`, {
      state,
      elements: { video },
      clearPlaybackError: () => calls.push('clear-error'),
      showPlaybackError: () => calls.push('show-error'),
    }) as () => Promise<void>;

    await toggle();
    expect(video.currentTime).toBe(0);
    expect(calls).toEqual(['clear-error', 'play']);
    await toggle();
    expect(calls).toEqual(['clear-error', 'play', 'pause']);

    state.repair = {};
    video.paused = true;
    await toggle();
    expect(calls).toEqual(['clear-error', 'play', 'pause']);
  });

  it('keeps playback button descendants stable while animation frames refresh', () => {
    expect(runtimeSource).toContain('const setPlaybackButtonPresentation = (');
    expect(runtimeSource).toContain("const stateKey = playing ? 'playing' : 'paused';");
    expect(runtimeSource).toContain('if (button.dataset.playbackState !== stateKey) {');
    expect(runtimeSource).toContain('button.dataset.playbackState = stateKey;');
    expect(runtimeSource).toContain(
      'storedPlayback ? state.previewPlaying : !elements.video.paused,',
    );
    expect(runtimeSource).toContain(
      'setPlaybackButtonPresentation(elements.directorPlay, state.previewPlaying);',
    );
    expect(runtimeSource).toContain(
      'setPlaybackButtonPresentation(elements.mappingPreview, state.previewPlaying, {',
    );
    expect(runtimeSource).not.toContain('elements.play.innerHTML =');
    expect(runtimeSource).not.toContain('elements.directorPlay.innerHTML =');
    expect(runtimeSource).not.toContain('elements.mappingPreview.innerHTML =');
  });
});
