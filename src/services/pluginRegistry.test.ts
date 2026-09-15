import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPluginReferenceAudioCategory,
  enabledCompatiblePlugins,
  enabledPluginCanvasMenus,
  cancelPluginAudioInstall,
  configurePluginSeedAudioApiKey,
  generatePluginAudio,
  importPluginReferenceAudio,
  importPluginManifest,
  importPluginPackage,
  loadPluginRuntime,
  loadPluginCatalog,
  listPluginAudioGenerators,
  listPluginReferenceAudioLibrary,
  pluginAssetUrl,
  probePluginAudioGenerator,
  readPluginAudioInstallStatus,
  readPluginPoseModelInstallStatus,
  readPluginReferenceAudio,
  renamePluginReferenceAudio,
  resolvePluginNodeIdentity,
  restoreInstalledPlugin,
  setInstalledPluginEnabled,
  startPluginAudioInstall,
  startPluginPoseModelInstall,
  uninstallInstalledPlugin,
  type PluginAudioGeneratorContribution,
  type PluginCatalog,
} from './pluginRegistry';

afterEach(() => vi.unstubAllGlobals());

const emptyCatalog = {
  directory: 'data/plugins',
  backupDirectory: 'data/extension-backups/plugins',
  plugins: [],
  backups: [],
  errors: [],
  mode: 'sandboxed-runtime',
};

describe('plugin registry bridge service', () => {
  it('versions plugin asset URLs so upgraded styles and locale files bypass stale caches', () => {
    expect(pluginAssetUrl('studio-tools', 'standalone.css', 'http://127.0.0.1:2895', '2.0.3')).toBe(
      'http://127.0.0.1:2895/plugins/assets/studio-tools/standalone.css?v=2.0.3',
    );
  });

  it('types all trusted host-managed audio adapters without loopback endpoints', () => {
    const adapters: PluginAudioGeneratorContribution[] = [
      'voxcpm2',
      'chattts',
      'qwen3tts',
      'cosyvoice3',
      'woosh',
      'acestepXl',
    ].map((hostAdapter) => ({
      id: `${hostAdapter}-local`,
      label: hostAdapter,
      protocol: 'qiansi-audio-v1',
      hostAdapter: hostAdapter as
        'voxcpm2' | 'chattts' | 'qwen3tts' | 'cosyvoice3' | 'woosh' | 'acestepXl',
      timeoutMs: 600_000,
      maxBytes: 64 * 1024 * 1024,
    }));
    expect(adapters.map((adapter) => adapter.hostAdapter)).toEqual([
      'voxcpm2',
      'chattts',
      'qwen3tts',
      'cosyvoice3',
      'woosh',
      'acestepXl',
    ]);
    expect(adapters.every((adapter) => !('endpoint' in adapter))).toBe(true);
  });

  it('maps legacy official audio nodes to the unified Qiansi-audio contribution', () => {
    expect(resolvePluginNodeIdentity('voxcpm2-tts', 'tts-workbench')).toEqual({
      pluginId: 'qiansi-audio',
      pluginNodeId: 'audio-workbench',
    });
    expect(resolvePluginNodeIdentity('chattts-tts', 'tts-workbench')).toEqual({
      pluginId: 'qiansi-audio',
      pluginNodeId: 'audio-workbench',
    });
    expect(resolvePluginNodeIdentity('other-plugin', 'tts-workbench')).toEqual({
      pluginId: 'other-plugin',
      pluginNodeId: 'tts-workbench',
    });
  });

  it('exposes canvas-menu contributions only from enabled compatible plugins', () => {
    const plugin = {
      compatible: true,
      enabled: true,
      directory: 'data/plugins/studio-tools',
      security: {
        sandboxed: true,
        networkAccess: false,
        fileSystemAccess: false,
        secretsAccess: false,
      },
      manifest: {
        schemaVersion: 2,
        id: 'studio-tools',
        name: 'Studio tools',
        version: '1.0.0',
        author: '',
        description: '',
        engine: { qiansiCanvas: '>=0.0.0' },
        permissions: [],
        assets: [],
        contributes: {
          nodes: [],
          widgets: [],
          panels: [],
          menus: [
            {
              id: 'open-studio',
              label: '打开导演台',
              location: 'canvas',
              action: { type: 'open-panel', panelId: 'studio-panel' },
            },
          ],
          audioGenerators: [],
        },
      },
    } as PluginCatalog['plugins'][number];
    const catalog = { ...emptyCatalog, plugins: [plugin] } as PluginCatalog;
    expect(enabledPluginCanvasMenus(catalog)).toHaveLength(1);
    plugin.enabled = false;
    expect(enabledPluginCanvasMenus(catalog)).toHaveLength(0);
  });

  it('lists only enabled compatible plugins for first-party launch surfaces', () => {
    const plugin = {
      compatible: true,
      enabled: true,
      directory: 'data/plugins/studio-tools',
      security: {
        sandboxed: true,
        networkAccess: false,
        fileSystemAccess: false,
        secretsAccess: false,
      },
      manifest: {
        schemaVersion: 2,
        id: 'studio-tools',
        name: 'Studio tools',
        version: '1.0.0',
        author: '',
        description: '',
        engine: { qiansiCanvas: '>=0.0.0' },
        permissions: [],
        assets: [],
        contributes: {
          nodes: [],
          widgets: [],
          panels: [],
          menus: [],
          audioGenerators: [],
        },
      },
    } as PluginCatalog['plugins'][number];
    const disabled = { ...plugin, enabled: false, manifest: { ...plugin.manifest, id: 'off' } };
    const incompatible = {
      ...plugin,
      compatible: false,
      manifest: { ...plugin.manifest, id: 'old' },
    };
    const catalog = {
      ...emptyCatalog,
      plugins: [plugin, disabled, incompatible],
    } as PluginCatalog;
    expect(enabledCompatiblePlugins(catalog).map((entry) => entry.manifest.id)).toEqual([
      'studio-tools',
    ]);
    expect(enabledCompatiblePlugins(null)).toEqual([]);
  });

  it('loads the real plugin catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(emptyCatalog), { status: 200 })),
    );
    await expect(loadPluginCatalog('http://127.0.0.1:2895')).resolves.toEqual(emptyCatalog);
  });

  it('imports, toggles, uninstalls and restores a plugin', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ catalog: emptyCatalog }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(
      [JSON.stringify({ schemaVersion: 1, id: 'test-plugin' })],
      'plugin.json',
      { type: 'application/json' },
    );
    await importPluginManifest(file, 'http://127.0.0.1:2895');
    await setInstalledPluginEnabled('test-plugin', false, 'http://127.0.0.1:2895');
    await uninstallInstalledPlugin('test-plugin', 'http://127.0.0.1:2895');
    await restoreInstalledPlugin('test-plugin', 'http://127.0.0.1:2895');
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toMatchObject({
      manifest: { id: 'test-plugin' },
    });
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      id: 'test-plugin',
      enabled: false,
    });
    expect(String(calls[2]?.[0])).toContain('/plugins/uninstall');
    expect(String(calls[3]?.[0])).toContain('/plugins/restore');
  });

  it('rejects oversized manifests before sending them', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'.repeat(256 * 1024 + 1)], 'plugin.json');
    await expect(importPluginManifest(file)).rejects.toThrow('256 KB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('imports a complete v2 plugin package as bounded base64 files', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ catalog: emptyCatalog }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await importPluginPackage(
      [
        new File(['{"schemaVersion":2}'], 'plugin.json', { type: 'application/json' }),
        new File(['qiansi.notify("ready")'], 'runtime.js', { type: 'text/javascript' }),
      ],
      'http://127.0.0.1:2895',
    );
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0]?.[0])).toContain('/plugins/import-package');
    const body = JSON.parse(String(calls[0]?.[1]?.body)) as {
      files: Array<{ name: string; size: number; base64: string }>;
    };
    expect(body.files.map((file) => file.name)).toEqual(['plugin.json', 'runtime.js']);
    expect(atob(body.files[1]?.base64 ?? '')).toContain('qiansi.notify');
  });

  it('loads a verified plugin runtime payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ source: 'qiansi.notify("ok")', sha256: 'abc123' }), {
            status: 200,
          }),
      ),
    );
    await expect(loadPluginRuntime('studio-tools', 'http://127.0.0.1:2895')).resolves.toEqual({
      source: 'qiansi.notify("ok")',
      sha256: 'abc123',
    });
  });

  it('probes a declared plugin audio generator through the bridge', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, status: 204, latencyMs: 18 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      probePluginAudioGenerator('voxcpm-audio', 'voxcpm-local', {
        bridgeBase: 'http://127.0.0.1:2895',
      }),
    ).resolves.toEqual({ ok: true, status: 204, latencyMs: 18 });
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0]?.[0])).toContain('/plugins/audio/health');
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      pluginId: 'voxcpm-audio',
      generatorId: 'voxcpm-local',
    });
  });

  it('writes the Seed Audio key through the fixed plugin bridge route without echoing it', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ configured: true, configuredAt: '2026-09-11T00:00:00.000Z' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      configurePluginSeedAudioApiKey(
        'doubao-seed-audio',
        'doubao-seed-audio-cloud',
        'direct-secret',
        {
          bridgeBase: 'http://127.0.0.1:2895',
        },
      ),
    ).resolves.toEqual({ configured: true, configuredAt: '2026-09-11T00:00:00.000Z' });
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0]?.[0])).toContain('/plugins/audio/configure-seed-audio-key');
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      pluginId: 'doubao-seed-audio',
      generatorId: 'doubao-seed-audio-cloud',
      apiKey: 'direct-secret',
    });
  });

  it('generates raw plugin audio with metadata and forwards cancellation', async () => {
    const bytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    const fetchMock = vi.fn(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'X-Qiansi-Audio-File-Name': encodeURIComponent('测试语音.wav'),
            'X-Qiansi-Audio-Duration-Seconds': '1.5',
          },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const request = {
      mode: 'design' as const,
      text: '你好，世界。',
      control: '温暖自然',
      options: { seed: 7 },
    };
    const result = await generatePluginAudio('voxcpm-audio', 'voxcpm-local', request, {
      bridgeBase: 'http://127.0.0.1:2895',
      signal: controller.signal,
    });
    expect(new Uint8Array(result.bytes)).toEqual(bytes);
    expect(result).toMatchObject({
      mimeType: 'audio/wav',
      fileName: '测试语音.wav',
      durationSeconds: 1.5,
    });
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0]?.[0])).toContain('/plugins/audio/generate');
    expect(calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      pluginId: 'voxcpm-audio',
      generatorId: 'voxcpm-local',
      request,
    });
  });

  it('lists, starts, polls and cancels fixed-catalog audio installation', async () => {
    const acceptanceSha256 = 'a'.repeat(64);
    const catalogPayload = {
      generators: [
        {
          id: 'chattts-local',
          label: 'ChatTTS',
          engine: 'chattts',
          installed: false,
          installAvailable: true,
          unavailableReason: '',
          license: {
            id: 'CC-BY-NC-4.0',
            name: 'CC BY-NC 4.0',
            url: 'https://creativecommons.org/licenses/by-nc/4.0/',
            commercialUse: false,
            requiresAcceptance: true,
            notice: '仅限非商业用途。',
            acceptanceSha256,
          },
        },
      ],
    };
    const legacyGenerator = catalogPayload.generators[0]!;
    const progress = {
      generatorId: 'chattts-local',
      status: 'running',
      phase: 'download',
      message: '正在从 Hugging Face 下载。',
      completedBytes: 128,
      totalBytes: 256,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(progress), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(progress), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...progress, status: 'cancelled', phase: 'cancelled' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listPluginAudioGenerators('qiansi-audio', {
        bridgeBase: 'http://127.0.0.1:2895',
      }),
    ).resolves.toEqual([
      {
        ...legacyGenerator,
        license: {
          ...legacyGenerator.license,
          components: [
            {
              id: 'CC-BY-NC-4.0',
              name: 'CC BY-NC 4.0',
              url: 'https://creativecommons.org/licenses/by-nc/4.0/',
              commercialUse: false,
              notice: '仅限非商业用途。',
            },
          ],
        },
      },
    ]);
    await expect(
      startPluginAudioInstall('qiansi-audio', 'chattts-local', acceptanceSha256, {
        bridgeBase: 'http://127.0.0.1:2895',
      }),
    ).resolves.toMatchObject(progress);
    await expect(
      readPluginAudioInstallStatus('qiansi-audio', 'chattts-local', {
        bridgeBase: 'http://127.0.0.1:2895',
      }),
    ).resolves.toMatchObject(progress);
    await expect(
      cancelPluginAudioInstall('qiansi-audio', 'chattts-local', {
        bridgeBase: 'http://127.0.0.1:2895',
      }),
    ).resolves.toMatchObject({ status: 'cancelled' });

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('/plugins/audio/install/catalog'),
      expect.stringContaining('/plugins/audio/install/start'),
      expect.stringContaining('/plugins/audio/install/status'),
      expect.stringContaining('/plugins/audio/install/cancel'),
    ]);
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      pluginId: 'qiansi-audio',
      generatorId: 'chattts-local',
      licenseAcceptance: acceptanceSha256,
    });
  });

  it('starts and polls Sapiens2 installation without rejecting its model id', async () => {
    const queued = {
      engineId: 'sapiens2-normal-0.4b',
      status: 'queued',
      phase: 'preparing',
      message: '正在准备 Sapiens2 Normal…',
      completedBytes: 0,
      totalBytes: 1_813_476_476,
      installed: false,
      error: null,
      updatedAt: '2026-09-05T00:00:00.000Z',
    };
    const downloading = {
      ...queued,
      status: 'downloading',
      phase: 'model-download',
      message: '正在下载 Sapiens2 Normal…',
      completedBytes: 1024,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(queued), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(downloading), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      startPluginPoseModelInstall('qiansi-motion-capture', 'sapiens2-normal-0.4b'),
    ).resolves.toMatchObject(queued);
    await expect(
      readPluginPoseModelInstallStatus('qiansi-motion-capture', 'sapiens2-normal-0.4b'),
    ).resolves.toMatchObject(downloading);

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('/plugins/vision/models/start'),
      expect.stringContaining('/plugins/vision/models/status'),
    ]);
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      pluginId: 'qiansi-motion-capture',
      engineId: 'sapiens2-normal-0.4b',
    });
  });

  it('parses every composite audio license and rejects unsafe component links', async () => {
    const license = {
      id: 'AGPL-3.0-or-later + CC-BY-NC-4.0',
      name: 'ChatTTS source and model licenses',
      url: 'https://github.com/2noise/ChatTTS',
      commercialUse: false,
      requiresAcceptance: true,
      notice: '源码与模型采用不同许可证。',
      acceptanceSha256: 'b'.repeat(64),
      components: [
        {
          id: 'AGPL-3.0-or-later',
          name: 'GNU Affero General Public License v3.0 or later',
          url: 'https://www.gnu.org/licenses/agpl-3.0.html',
          commercialUse: true,
          notice: 'ChatTTS source code license.',
        },
        {
          id: 'CC-BY-NC-4.0',
          name: 'Creative Commons Attribution-NonCommercial 4.0',
          url: 'https://creativecommons.org/licenses/by-nc/4.0/',
          commercialUse: false,
          notice: 'ChatTTS model license; non-commercial use only.',
        },
      ],
    };
    const generator = {
      id: 'chattts-local',
      label: 'ChatTTS',
      engine: 'chattts',
      installed: false,
      installAvailable: true,
      unavailableReason: '',
      license,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ generators: [generator] }), { status: 200 }),
        ),
    );
    await expect(listPluginAudioGenerators('qiansi-audio')).resolves.toEqual([generator]);

    const unsafeGenerator = {
      ...generator,
      license: {
        ...license,
        components: [{ ...license.components[0], url: 'javascript:alert(1)' }],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ generators: [unsafeGenerator] }), { status: 200 }),
        ),
    );
    await expect(listPluginAudioGenerators('qiansi-audio')).rejects.toThrow(
      '许可证组成第 1 项地址无效。',
    );
  });

  it('lists, reads, renames, and imports trusted reference audio', async () => {
    const entry = {
      id: 'a'.repeat(32),
      name: '旁白',
      fileName: '旁白.wav',
      category: '未分类',
      mimeType: 'audio/wav',
      size: 12,
      transcript: '测试转写',
      avatarDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ categories: ['未分类'], entries: [entry] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(12), {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'X-Qiansi-Audio-File-Name': encodeURIComponent('旁白.wav'),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entry: { ...entry, name: '角色', fileName: '角色.wav' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entry }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ category: '角色' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPluginReferenceAudioLibrary('qiansi-audio')).resolves.toEqual({
      categories: ['未分类'],
      entries: [entry],
    });
    await expect(readPluginReferenceAudio('qiansi-audio', entry.id)).resolves.toMatchObject({
      mimeType: 'audio/wav',
      fileName: '旁白.wav',
    });
    await expect(
      renamePluginReferenceAudio('qiansi-audio', entry.id, '角色', '未分类', '更新后的转写'),
    ).resolves.toMatchObject({ name: '角色', fileName: '角色.wav' });
    expect(JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit)?.body))).toEqual({
      pluginId: 'qiansi-audio',
      id: entry.id,
      name: '角色',
      category: '未分类',
      transcript: '更新后的转写',
    });
    await expect(
      importPluginReferenceAudio('qiansi-audio', '旁白.wav', 'audio/wav', 'UklGRg=='),
    ).resolves.toEqual(entry);
    await expect(createPluginReferenceAudioCategory('qiansi-audio', '角色')).resolves.toBe('角色');
    expect(fetchMock.mock.calls[3]?.[0]).toContain('/plugins/audio/reference-library/import');
    expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit)?.body))).toEqual({
      pluginId: 'qiansi-audio',
      fileName: '旁白.wav',
      mimeType: 'audio/wav',
      base64: 'UklGRg==',
    });
    expect(fetchMock.mock.calls[4]?.[0]).toContain(
      '/plugins/audio/reference-library/category/create',
    );
    expect(JSON.parse(String((fetchMock.mock.calls[4]?.[1] as RequestInit)?.body))).toEqual({
      pluginId: 'qiansi-audio',
      category: '角色',
    });
  });
});
