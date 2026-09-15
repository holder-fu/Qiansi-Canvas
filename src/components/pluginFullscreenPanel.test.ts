import { describe, expect, it } from 'vitest';
import sandboxFrameSource from './PluginSandboxFrame.tsx?raw';
import managedMediaBridgeSource from '../services/pluginManagedMediaBridge.ts?raw';
import developerHelpSource from './PluginDeveloperHelp.tsx?raw';
import settingsPanelSource from './SettingsPanel.tsx?raw';
import widgetLayerSource from './PluginWidgetLayer.tsx?raw';
import audioRuntimeSource from '../../data/plugins/qiansi-audio/runtime.js?raw';

describe('fullscreen plugin panel host', () => {
  it('allows local browser compute and downloads while retaining the sensitive sandbox boundary', () => {
    expect(sandboxFrameSource).toContain('sandbox="allow-scripts allow-downloads"');
    expect(sandboxFrameSource).toContain("call.method === 'host.downloadFile'");
    expect(sandboxFrameSource).toContain("call.method === 'host.chooseSaveFile'");
    expect(sandboxFrameSource).toContain("plugin.manifest.id !== 'qiansi-motion-capture'");
    expect(sandboxFrameSource).toContain('sanitizePluginHostSaveFileRequest(call.payload)');
    expect(sandboxFrameSource).toContain('showSaveFilePicker?: PluginSaveFilePicker');
    expect(sandboxFrameSource).toContain("status: 'selected', destinationId, fileName");
    expect(sandboxFrameSource).toContain("status: 'saved'");
    expect(sandboxFrameSource).toContain('sanitizePluginHostDownloadRequest(call.payload)');
    expect(sandboxFrameSource).toContain('downloadMediaFile(url, request.fileName)');
  });

  it('grants autoplay only to plugins that declare an audio generator', () => {
    expect(sandboxFrameSource).toContain(
      'const canAutoplayAudio = plugin.manifest.contributes.audioGenerators.length > 0',
    );
    expect(sandboxFrameSource).toMatch(
      /const iframeFeaturePolicy = \[\s*allowFullscreen \? 'fullscreen' : '',\s*canAutoplayAudio \? 'autoplay' : '',\s*\]/,
    );
    expect(sandboxFrameSource).toContain('allow={iframeFeaturePolicy || undefined}');
  });

  it('keeps native model installation permission-gated and catalog-bound', () => {
    expect(sandboxFrameSource).toContain("'audio.listGenerators': 'audio:install'");
    expect(sandboxFrameSource).toContain("'audio.installGenerator': 'audio:install'");
    expect(sandboxFrameSource).toContain("'audio.installStatus': 'audio:install'");
    expect(sandboxFrameSource).toContain("'audio.cancelInstall': 'audio:install'");
    expect(sandboxFrameSource).toContain("'audio.uninstallGenerator': 'audio:install'");
    expect(sandboxFrameSource).toContain('uninstallPluginAudioGenerator(');
    expect(sandboxFrameSource).toContain('sanitizePluginAudioInstallRequest(call.payload)');
    expect(sandboxFrameSource).toContain('plugin.manifest.contributes.audioGenerators?.find');
    expect(sandboxFrameSource).toContain("'vision.installPoseEngine': 'vision:install'");
    expect(sandboxFrameSource).toContain("'vision.poseEngineInstallStatus': 'vision:install'");
    expect(sandboxFrameSource).toContain("'vision.cancelPoseEngineInstall': 'vision:install'");
    expect(sandboxFrameSource).toContain("'vision.uninstallPoseEngine': 'vision:install'");
    expect(sandboxFrameSource).toContain('sanitizePluginPoseEngineInstallRequest(call.payload)');
  });

  it('keeps plugin preference storage permission-gated and scoped by manifest id', () => {
    expect(sandboxFrameSource).toContain("'preferences.read': 'storage:preferences'");
    expect(sandboxFrameSource).toContain('readPluginPreference(plugin.manifest.id, key)');
    expect(sandboxFrameSource).toContain('writePluginPreference(plugin.manifest.id, key, value)');
    expect(sandboxFrameSource).toContain('deletePluginPreference(plugin.manifest.id, key)');
  });

  it('routes Seed Audio only through its declared independent loopback adapter', () => {
    expect(sandboxFrameSource).not.toContain('readPluginVolcengineAudioAccess()');
    expect(sandboxFrameSource).not.toContain('resolvePluginVolcengineAudioProvider(');
    expect(sandboxFrameSource).not.toContain('canvasVolcengineProvider');
    expect(sandboxFrameSource).not.toContain("call.method === 'host.openApiSettings'");
    expect(sandboxFrameSource).toContain("call.method === 'models.getAutoDlH3Connection'");
    expect(sandboxFrameSource).toContain("plugin.manifest.id !== 'qiansi-novel-video-studio'");
    expect(sandboxFrameSource).toContain('generatePluginAudio(');
    expect(sandboxFrameSource).toContain("call.method === 'audio.configureSeedAudioKey'");
    expect(sandboxFrameSource).toContain("plugin.manifest.id !== 'doubao-seed-audio'");
    expect(sandboxFrameSource).toContain('configurePluginSeedAudioApiKey(');
  });

  it('keeps project graphs, project documents and managed models on explicit host permissions', () => {
    expect(sandboxFrameSource).toContain(
      "'canvas.createProjectGraph': 'canvas:create-project-graph'",
    );
    expect(sandboxFrameSource).toContain("'documents.read': 'storage:project-documents'");
    expect(sandboxFrameSource).toContain("'documents.write': 'storage:project-documents'");
    expect(sandboxFrameSource).toContain("'documents.delete': 'storage:project-documents'");
    expect(sandboxFrameSource).toContain("'styleCovers.read': 'storage:shared-style-covers'");
    expect(sandboxFrameSource).toContain("'styleCovers.write': 'storage:shared-style-covers'");
    expect(sandboxFrameSource).toContain("'styleCovers.delete': 'storage:shared-style-covers'");
    expect(sandboxFrameSource).toContain(
      'readPluginSharedStyleCover(plugin.manifest.id, request.styleId)',
    );
    expect(sandboxFrameSource).toContain("'models.listText': 'models:use-text'");
    expect(sandboxFrameSource).toContain("'models.runText': 'models:use-text'");
    expect(sandboxFrameSource).toContain("'models.listImage': 'models:use-media'");
    expect(sandboxFrameSource).toContain("'models.listVideo': 'models:use-media'");
    expect(sandboxFrameSource).toContain("'models.runImage': 'models:use-media'");
    expect(sandboxFrameSource).toContain("'models.runVideo': 'models:use-media'");
    expect(sandboxFrameSource).toContain("'models.captureVideoFrame': 'media:transform'");
    expect(sandboxFrameSource).toContain("'models.previewMedia': 'models:use-media'");
    expect(sandboxFrameSource).toContain("'canvas.readManagedImageCopy': 'canvas:read-selection'");
    expect(sandboxFrameSource).toContain("'models.inspectMedia': 'models:use-media'");
    expect(sandboxFrameSource).toContain("'models.downloadMedia': 'models:use-media'");
    expect(sandboxFrameSource).toContain(
      'const sessionProjectIdRef = useRef(useCanvasStore.getState().activeProjectId)',
    );
    expect(sandboxFrameSource).toContain('const projectId = sessionProjectIdRef.current');
    expect(sandboxFrameSource).toContain('const sourceProjectId = sessionProjectIdRef.current');
    expect(sandboxFrameSource).toContain(
      'readPluginDocument(plugin.manifest.id, projectId, request.key)',
    );
    expect(sandboxFrameSource).toContain('sanitizePluginProjectGraphRequest(call.payload)');
    expect(sandboxFrameSource).toContain('await applyPluginProjectGraphOnce(');
    expect(sandboxFrameSource).toContain('plugin.manifest.id,');
    expect(sandboxFrameSource).toContain('sourceProjectId,');
    expect(
      sandboxFrameSource.indexOf('const sourceProjectId = sessionProjectIdRef.current'),
    ).toBeLessThan(sandboxFrameSource.indexOf('await applyPluginProjectGraphOnce('));
    expect(sandboxFrameSource).toContain('sanitizePluginManagedTextRequest(call.payload)');
    expect(sandboxFrameSource).toContain('managedMediaRegistryRef');
    expect(sandboxFrameSource).toContain('releaseManagedMediaRegistry(registry)');
    expect(sandboxFrameSource).toContain('await previewManagedMedia(record)');
    expect(sandboxFrameSource).toContain('await captureManagedVideoFrame(');
    expect(sandboxFrameSource).toContain('await readManagedCanvasImageCopy(record)');
    expect(sandboxFrameSource).toContain('request.referenceMediaIds ?? []');
    expect(sandboxFrameSource).toContain("record.kind !== 'image'");
    expect(sandboxFrameSource).toContain('downloadMediaFile(record.url');
    expect(sandboxFrameSource).toContain("status: 'downloaded'");
    expect(sandboxFrameSource).not.toContain('bytes: record');
    expect(sandboxFrameSource).toContain('resolveManagedProjectGraphMedia(');
    expect(managedMediaBridgeSource).toContain('imageUrl: record.url');
    expect(managedMediaBridgeSource).toContain('videoUrl: record.url');
  });

  it('keeps an existing iframe project-document scope on its launch project after a switch', () => {
    const documentBranch = sandboxFrameSource.slice(
      sandboxFrameSource.indexOf("call.method === 'documents.read'"),
      sandboxFrameSource.indexOf("if (call.method === 'models.listText')"),
    );
    expect(documentBranch).toContain('const projectId = sessionProjectIdRef.current');
    expect(documentBranch).not.toContain('useCanvasStore.getState().activeProjectId');

    const graphBranch = sandboxFrameSource.slice(
      sandboxFrameSource.indexOf("if (call.method === 'canvas.createProjectGraph')"),
      sandboxFrameSource.indexOf("if (call.method === 'canvas.readSelection')"),
    );
    expect(graphBranch).toContain('const sourceProjectId = sessionProjectIdRef.current');
    expect(graphBranch).not.toContain('useCanvasStore.getState().activeProjectId');
    expect(developerHelpSource).toContain('iframe 启动时来源项目隔离');
    expect(developerHelpSource).toContain('切换活动项目不会把旧');
    expect(developerHelpSource).toContain('iframe 也不会改绑');
  });

  it('documents stable graph application ids and fail-closed receipt states in built-in help', () => {
    expect(developerHelpSource).toContain("applicationId: 'screenplay-draft-v' + draft.revision");
    expect(developerHelpSource).toContain('pending／applied／failed 收据');
    expect(developerHelpSource).toContain('retryFailed: true');
  });

  it('downloads only a validated project-scoped plugin audio history entry', () => {
    expect(sandboxFrameSource).toContain("'audio.downloadHistory': 'audio:generate'");
    expect(sandboxFrameSource).toContain("call.method === 'audio.downloadHistory'");
    expect(sandboxFrameSource).toContain('downloadPluginAudioHistory(historyAudio)');
    expect(sandboxFrameSource).toContain('anchor.download = audio.fileName');
  });

  it('keeps the reusable reference-audio library separate from generation permission', () => {
    expect(sandboxFrameSource).toContain("'audio.listReferenceLibrary': 'audio:reference-library'");
    expect(sandboxFrameSource).toContain("'audio.readReferenceLibrary': 'audio:reference-library'");
    expect(sandboxFrameSource).toContain(
      "'audio.importReferenceLibrary': 'audio:reference-library'",
    );
    expect(sandboxFrameSource).toContain("requiredPermission === 'audio:reference-library'");
    expect(sandboxFrameSource).toContain("permissions.includes('audio:generate')");
  });

  it('keeps the newest generated audio downloadable when browser history storage is unavailable', () => {
    expect(sandboxFrameSource).toContain('ephemeralAudioHistoryRef');
    expect(sandboxFrameSource).toContain('historyResult?.persisted');
    expect(sandboxFrameSource).toContain('persistedHistoryEntry ??');
    expect(sandboxFrameSource).toContain('ephemeralHistoryEntry.projectId === projectId &&');
    expect(sandboxFrameSource).toContain(
      'persistedHistory.filter((entry) => entry.id !== ephemeralHistory?.id)',
    );
  });

  it('deletes only a validated project-scoped plugin audio history entry', () => {
    expect(sandboxFrameSource).toContain("'audio.deleteHistory': 'audio:generate'");
    expect(sandboxFrameSource).toContain("call.method === 'audio.deleteHistory'");
    expect(sandboxFrameSource).toContain('deletePluginAudioHistory(');
    expect(sandboxFrameSource).toContain('respond(call.requestId, true, { deleted: true })');
  });

  it('adds a validated history item to canvas assets only after an explicit request', () => {
    expect(sandboxFrameSource).toContain("'audio.addHistoryToCanvasAssets': 'audio:generate'");
    expect(sandboxFrameSource).toContain("call.method === 'audio.addHistoryToCanvasAssets'");
    expect(sandboxFrameSource).toContain('useCanvasStore.getState().addAudioAsset({');
    expect(sandboxFrameSource).toContain('const persisted = await flushCanvasPersistence()');
    expect(sandboxFrameSource).toContain(
      '.assets.some((asset) => asset.id === canvasAsset.assetId)',
    );
    expect(sandboxFrameSource).toContain('if (!persisted || !retained)');
    expect(audioRuntimeSource).toContain('data-history-action="add-canvas-asset"');
    expect(audioRuntimeSource).toContain('添加到画布资产中');
  });

  it('keeps every rendered audio-history action directly clickable with row-local feedback', () => {
    expect(audioRuntimeSource).toContain(
      "elements.historyList.querySelectorAll('[data-history-action]')",
    );
    expect(audioRuntimeSource).toContain("action.addEventListener('click', handleHistoryAction)");
    expect(audioRuntimeSource).not.toContain("elements.historyList.addEventListener('click'");
    expect(audioRuntimeSource).toContain(
      'class="qa-history-feedback qa-hidden" role="status" aria-live="polite"',
    );
    expect(audioRuntimeSource).toContain("setHistoryFeedback(entry, '正在读取历史音频…')");
    expect(audioRuntimeSource).toContain("setHistoryFeedback(entry, '正在准备保存历史音频…')");
    expect(audioRuntimeSource).toContain("setHistoryFeedback(entry, '正在恢复历史参数…')");
    expect(audioRuntimeSource).toContain("setHistoryFeedback(entry, '请在弹窗中确认删除。')");
  });

  it('renders reference audio as a responsive two-pane avatar library', () => {
    expect(audioRuntimeSource).toContain('class="qa-reference-library-layout"');
    expect(audioRuntimeSource).toContain('id="qa-reference-library-list"');
    expect(audioRuntimeSource).toContain("item.className = 'qa-library-entry'");
    expect(audioRuntimeSource).toContain("item.role = 'listitem'");
    expect(audioRuntimeSource).toContain("selectButton.className = 'qa-library-entry-select'");
    expect(audioRuntimeSource).toContain("previewButton.className = 'qa-library-preview-button'");
    expect(audioRuntimeSource).toContain('id="qa-reference-library-selected-preview"');
    expect(audioRuntimeSource).toContain('toggleReferenceAudioEntryPreview(entry, true)');
    expect(audioRuntimeSource).toContain('entry.avatarDataUrl');
    expect(audioRuntimeSource).toContain('.qa-library-entry-avatar');
    expect(audioRuntimeSource).toContain(
      '.qa-library-edit > .qa-actions { justify-content: flex-end; }',
    );
    expect(audioRuntimeSource).toContain('@media (max-width: 760px)');
  });

  it('does not reserve a fixed canvas launcher rail for fullscreen panels', () => {
    expect(widgetLayerSource).toContain("panel.position === 'fullscreen'");
    expect(widgetLayerSource).not.toContain('fullscreenLaunchers');
    expect(widgetLayerSource).not.toContain('openPanel(plugin.manifest.id, panel.id)');
    expect(widgetLayerSource).not.toContain('top-1/2 left-3 z-[52]');
    expect(widgetLayerSource).toContain('fixed inset-0 z-[120]');
    expect(widgetLayerSource).toContain("event.key !== 'Escape'");
    expect(widgetLayerSource).toContain(
      'onRequestClose={() => closePanel(plugin.manifest.id, panel.id)}',
    );
  });

  it('lets an opted-in fullscreen plugin share one neutral integrated header row', () => {
    expect(widgetLayerSource).toContain("panel.hostChrome === 'integrated'");
    expect(widgetLayerSource).toContain('absolute top-0 right-0 z-10');
    expect(widgetLayerSource).toContain('{customChrome ? null : integratedChrome ? (');
    expect(widgetLayerSource).toContain('{chromeControls}');
    expect(widgetLayerSource).toContain('border-[#dfe3ea] bg-white/95');
    expect(widgetLayerSource).toContain('bg-[#f1f2f4] text-[#30343d]');
    expect(widgetLayerSource).toContain('border-[#dfe3ea] bg-[#f7f8fa]');
    expect(widgetLayerSource).toContain('bg-[#8a909c]');
    expect(widgetLayerSource).not.toContain('bg-[#edf8f1] text-[#167647]');
    expect(widgetLayerSource).not.toContain('border-[#cfeadb] bg-[#f3fbf6]');
  });

  it('lets a fullscreen plugin own a neutral custom header without inherited chrome', () => {
    expect(widgetLayerSource).toContain("panel.hostChrome === 'custom'");
    expect(widgetLayerSource).toContain('{customChrome ? null : integratedChrome ? (');
    expect(widgetLayerSource).toContain("customChrome ? 'rounded-none' : ''");
    expect(widgetLayerSource).toContain(
      "data-theme-role={customChrome ? undefined : 'modal-surface'}",
    );
  });

  it('keeps the fullscreen language switch isolated to the owning plugin', () => {
    expect(widgetLayerSource).toContain("PLUGIN_PANEL_LANGUAGE_KEY = 'panel.language'");
    expect(widgetLayerSource).toContain(
      'readPluginPreference(pluginId, PLUGIN_PANEL_LANGUAGE_KEY)',
    );
    expect(widgetLayerSource).toContain(
      'writePluginPreference(pluginId, PLUGIN_PANEL_LANGUAGE_KEY, locale)',
    );
    expect(widgetLayerSource).toContain('setPluginPanelLanguage(plugin.manifest.id, locale)');
    expect(widgetLayerSource).toContain("['zh-CN', '中']");
    expect(widgetLayerSource).toContain("['en-US', 'EN']");
    expect(widgetLayerSource).not.toContain("setPreference('language', locale)");
    expect(widgetLayerSource).not.toContain('useCanvasPreferences((state) => state.language)');
    expect(widgetLayerSource).toContain('locale={panelLanguage}');
    expect(sandboxFrameSource).toContain("type: 'host-context'");
  });

  it('localizes the audio runtime while preserving authored history and prompt content', () => {
    expect(audioRuntimeSource).toContain("addEventListener('qiansi:languagechange'");
    expect(audioRuntimeSource).toContain('applyInterfaceLocale(interfaceLocale)');
    expect(audioRuntimeSource).toContain('.qa-history-text, .qa-history-control');
    expect(audioRuntimeSource).toMatch(/(?:'目标正文'|目标正文): 'Target text'/);
    expect(audioRuntimeSource).toMatch(/(?:'当前模型历史'|当前模型历史): 'Current model history'/);
    expect(audioRuntimeSource).toContain('id="qa-text-title"');
    expect(audioRuntimeSource).toContain('aria-labelledby="qa-text-title"');
    expect(audioRuntimeSource).not.toContain('<span>输入文本</span>');
  });

  it('defaults every reference-voice authorization confirmation to checked', () => {
    expect(audioRuntimeSource).toContain('elements.consent,');
    expect(audioRuntimeSource).toContain('elements.chatConsent,');
    expect(audioRuntimeSource).toContain('elements.qwenConsent,');
    expect(audioRuntimeSource).toContain('elements.cosyConsent,');
    expect(audioRuntimeSource).toContain('consent.checked = true;');
    expect(audioRuntimeSource).toContain('if (!elements.consent.checked) throw new Error');
    expect(audioRuntimeSource).toContain('if (!elements.chatConsent.checked) throw new Error');
    expect(audioRuntimeSource).toContain('if (!elements.qwenConsent.checked) throw new Error');
    expect(audioRuntimeSource).toContain('if (!elements.cosyConsent.checked) throw new Error');
  });

  it('opens fullscreen panels directly from the plugin settings card', () => {
    expect(settingsPanelSource).toContain("panel.position === 'fullscreen'");
    expect(settingsPanelSource).toContain('openPluginPanel(plugin.manifest.id, panel.id)');
    expect(settingsPanelSource).toContain("t('settingsPage.plugins.openPanel'");
  });

  it('discloses the native managed-audio process and separates both hash boundaries', () => {
    expect(settingsPanelSource).toContain('本机 Python 进程');
    expect(settingsPanelSource).toContain('不受 iframe 沙箱保护');
    expect(settingsPanelSource).toContain('仅校验 iframe 的 runtime.js');
    expect(settingsPanelSource).toContain('worker.py 固定摘要');
    expect(settingsPanelSource).toContain('runtime.js SHA-256 {hash}');
  });

  it('lets a panel-only generator explicitly request a native canvas audio node', () => {
    expect(sandboxFrameSource).toContain(
      'const ownNode = nodeId ? nodes.find((node) => node.id === nodeId) : undefined',
    );
    expect(sandboxFrameSource).toContain("generator.canvasOutput === 'audio-node'");
    expect(sandboxFrameSource).toContain('plugin.manifest.contributes.nodes.length > 0');
    expect(sandboxFrameSource).toContain('...(audioNodeId ? { audioNodeId } : {})');
    expect(sandboxFrameSource).toContain("const item = await uploadAssetFile(file, 'audio'");
  });

  it('keeps multi-reference audio on HTTP generators and fails closed for legacy host adapters', () => {
    expect(sandboxFrameSource).toContain('request.referenceAudios?.length');
    expect(sandboxFrameSource).toContain('当前宿主管理音频引擎只接受一段参考音频。');
    expect(sandboxFrameSource).toContain('referenceAudio: request.referenceAudios[0]');
    expect(sandboxFrameSource).toContain('referenceAudios: undefined');
    expect(sandboxFrameSource).toContain('!request.referenceAudios?.length');
  });

  it('reads only the most recently selected Canvas image node for a plugin request', () => {
    expect(sandboxFrameSource).toContain("'canvas.readSelectedImage': 'canvas:read-selection'");
    expect(sandboxFrameSource).toContain("call.method === 'canvas.readSelectedImage'");
    expect(sandboxFrameSource).toContain(
      'const selected = nodes.find((node) => node.id === selectedNodeId)',
    );
    expect(sandboxFrameSource).toContain("selected.data.kind !== 'image'");
    expect(sandboxFrameSource).toContain('imagePreviewSource(selected.data)');
    expect(sandboxFrameSource).not.toContain('canvasNodeImageOptions');
  });

  it('lets only Novel-to-Video select from the first recently used project', () => {
    expect(sandboxFrameSource).toContain("plugin.manifest.id === 'qiansi-novel-video-studio'");
    expect(sandboxFrameSource).toContain("call.payload.source === 'recent-project-first'");
    expect(sandboxFrameSource).toContain('await requestRecentProjectImage()');
    expect(sandboxFrameSource).toContain('<PluginRecentProjectImagePicker');
    expect(sandboxFrameSource).toContain('registerManagedCanvasImage(');
  });

  it('retains native audio-node output for plugins that still contribute nodes', () => {
    expect(sandboxFrameSource).toContain("canvasState.setWorkspace('views')");
    expect(sandboxFrameSource).toContain('generatedAudioNodeIdRef.current = audioNodeId');
    expect(sandboxFrameSource).toContain('centeredCanvasNodePosition({');
    expect(sandboxFrameSource).toContain('width: AUDIO_NODE_WIDTH');
    expect(sandboxFrameSource).toContain('height: AUDIO_NODE_HEIGHT');
    expect(sandboxFrameSource).not.toContain('activeCanvasState.selectedNodeId');
    expect(sandboxFrameSource).toContain('if (nodeId) {');
  });
});
