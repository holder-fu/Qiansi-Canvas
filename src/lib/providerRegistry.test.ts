import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_BASE_URL } from './bridgeUrl';
import {
  availableProviderModels,
  connectedProviderModels,
  comfyWorkflowModelCapability,
  createDefaultProviderConnections,
  createRemoteComfyUiConnection,
  fetchProviderModels,
  isCloudComfyUiProvider,
  isRemoteComfyUiProvider,
  isProviderConnectionUsable,
  loadProviderConnections,
  mergeDiscoveredProviderModels,
  PROVIDER_STORAGE_KEY,
  providerAuthHeaders,
  providerSetupGuide,
  refreshLocalCliConnections,
  restoreProviderConnections,
  saveProviderConnections,
  safeProviderBaseUrl,
  sortProvidersForSettings,
  validateFixedProviderConfiguration,
  type ProviderConnection,
} from './providerRegistry';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Comfy workflow capability derivation', () => {
  it('does not invent image-reference support for an untyped workflow', () => {
    expect(
      comfyWorkflowModelCapability({
        kind: 'image',
        name: 'Image workflow',
        modes: [],
      }),
    ).toMatchObject({
      inputModalities: ['text'],
      maxReferenceImages: 0,
      maxReferenceVideos: 0,
      maxOutputCount: 1,
      videoOperations: [],
    });
  });

  it('derives the minimum proven reference limits from explicit video modes', () => {
    expect(
      comfyWorkflowModelCapability({
        kind: 'video',
        name: 'First/last workflow',
        modes: ['首尾帧'],
        supportsVideoReference: true,
      }),
    ).toMatchObject({
      inputModalities: ['text', 'image'],
      videoModes: ['首尾帧'],
      maxReferenceImages: 2,
      maxReferenceVideos: 1,
    });
  });

  it('does not invent masked repair for a Comfy workflow with source-video support', () => {
    expect(
      comfyWorkflowModelCapability({
        kind: 'video',
        name: 'Unproven edit workflow',
        modes: ['视频换人物'],
        supportsVideoReference: true,
      }).videoOperations,
    ).toEqual([]);
  });

  it('derives explicit audio and 3D reference inputs without guessing', () => {
    expect(
      comfyWorkflowModelCapability({
        kind: 'audio',
        name: 'Audio remix',
        modes: [],
        supportsAudioReference: true,
      }),
    ).toMatchObject({ maxReferenceAudios: 1, maxReferenceImages: 0 });
    expect(
      comfyWorkflowModelCapability({
        kind: '3d',
        name: 'Text to 3D',
        modes: [],
        supportsImageReference: false,
      }),
    ).toMatchObject({ inputModalities: ['text'], maxReferenceImages: 0 });
    expect(
      comfyWorkflowModelCapability({
        kind: '3d',
        name: 'Image to 3D',
        modes: [],
        supportsImageReference: true,
      }),
    ).toMatchObject({ inputModalities: ['text', 'image'], maxReferenceImages: 1 });
  });
});

describe('settings provider presentation order', () => {
  it('assigns an explicit region to every built-in provider', () => {
    const providers = createDefaultProviderConnections();

    expect(providers).toHaveLength(24);
    expect(providers.every((provider) => provider.region !== undefined)).toBe(true);
  });

  it('applies the Volcengine CLI settings priority, then region order, without mutating registry order', () => {
    const expectedByCategory = {
      text: ['deepseek', 'modelscope', 'volcengine', 'api', 'xai'],
      image: [
        'img-doubao',
        'img-kling',
        'img-minimax',
        'img-midjourney',
        'img-recraft',
        'img-ideogram',
        'img-flux',
        'img-imagen',
        'img-grok',
        'img-gptimage',
      ],
      cli: [
        'volcengine-cli',
        'jimeng',
        'workbuddy',
        'bailian',
        'comfyui-cloud',
        'codex',
        'gemini',
        'comfyui-local',
        'comfyui-remote',
      ],
    } as const;

    for (const category of ['text', 'image', 'cli'] as const) {
      const providers = createDefaultProviderConnections().filter(
        (provider) => provider.category === category,
      );
      const originalIds = providers.map((provider) => provider.id);

      expect(sortProvidersForSettings(providers).map((provider) => provider.id)).toEqual(
        expectedByCategory[category],
      );
      expect(providers.map((provider) => provider.id)).toEqual(originalIds);
    }
  });

  it('keeps the previous CLI runtime fallback order unchanged when Volcengine CLI is added', () => {
    expect(
      createDefaultProviderConnections()
        .filter((provider) => provider.category === 'cli' && provider.id !== 'volcengine-cli')
        .map((provider) => provider.id),
    ).toEqual([
      'comfyui-local',
      'comfyui-remote',
      'comfyui-cloud',
      'jimeng',
      'codex',
      'workbuddy',
      'gemini',
      'bailian',
    ]);
  });

  it('registers Comfy Cloud as an isolated official connection', () => {
    const cloud = createDefaultProviderConnections().find(
      (provider) => provider.id === 'comfyui-cloud',
    );
    expect(cloud).toMatchObject({
      protocol: 'comfyui',
      baseUrl: 'https://cloud.comfy.org',
      authType: 'x-key',
      models: { image: [], video: [], audio: [], '3d': [] },
    });
    expect(cloud && isCloudComfyUiProvider(cloud)).toBe(true);
  });

  it('creates numbered remote ComfyUI connections below both built-in ComfyUI entries', () => {
    const defaults = createDefaultProviderConnections();
    const first = createRemoteComfyUiConnection(defaults);
    const second = createRemoteComfyUiConnection([...defaults, first]);
    const ordered = sortProvidersForSettings([...defaults, first, second]).filter(
      (provider) => provider.category === 'cli',
    );

    expect([first.name, second.name]).toEqual(['ComfyUI _s1', 'ComfyUI _s2']);
    expect(first).toMatchObject({
      protocol: 'comfyui',
      category: 'cli',
      baseUrl: '',
      authType: 'bearer',
      custom: true,
      enabled: true,
    });
    expect(first.id).toMatch(/^comfyui-remote-s1-[a-z0-9]+$/);
    expect(second.id).toMatch(/^comfyui-remote-s2-[a-z0-9]+$/);
    expect(ordered.slice(-4).map((provider) => provider.id)).toEqual([
      'comfyui-local',
      'comfyui-remote',
      first.id,
      second.id,
    ]);
    expect(isRemoteComfyUiProvider(first)).toBe(true);
    expect(providerSetupGuide(first).badge).toBe('REMOTE COMFYUI');
  });

  it('restores an added remote ComfyUI as an isolated custom connection', () => {
    const custom = createRemoteComfyUiConnection(createDefaultProviderConnections());
    const restored = restoreProviderConnections([custom]).find(
      (provider) => provider.id === custom.id,
    );

    expect(restored).toMatchObject({
      id: custom.id,
      name: 'ComfyUI _s1',
      protocol: 'comfyui',
      category: 'cli',
      custom: true,
      canGenerate: true,
    });
  });

  it('treats a missing region as general and keeps equal-ranked providers stable', () => {
    const providers = [
      { id: 'foreign-first', region: '海外' },
      { id: 'custom-first' },
      { id: 'domestic', region: '国内' },
      { id: 'general-second', region: '通用' },
      { id: 'foreign-second', region: '海外' },
    ] satisfies Array<Pick<ProviderConnection, 'id' | 'region'>>;
    const originalIds = providers.map((provider) => provider.id);

    expect(sortProvidersForSettings(providers).map((provider) => provider.id)).toEqual([
      'domestic',
      'custom-first',
      'general-second',
      'foreign-first',
      'foreign-second',
    ]);
    expect(providers.map((provider) => provider.id)).toEqual(originalIds);
  });

  it('restores canonical regions for every built-in provider', () => {
    const defaults = createDefaultProviderConnections();
    const corrupted = defaults.map((provider) => ({
      ...provider,
      region: provider.region === '国内' ? ('海外' as const) : ('国内' as const),
    }));
    const restored = restoreProviderConnections(corrupted);

    expect(restored.map(({ id, region }) => [id, region])).toEqual(
      defaults.map(({ id, region }) => [id, region]),
    );
  });

  it('migrates old custom providers to general while preserving an explicit valid region', () => {
    const legacyCustom = (
      id: string,
      category: ProviderConnection['category'],
    ): Omit<ProviderConnection, 'region'> => ({
      id,
      name: id,
      mark: 'C',
      protocol: category === 'cli' ? 'cli' : 'openai',
      category,
      baseUrl: category === 'cli' ? 'http://127.0.0.1:4455/v1' : 'https://example.test/v1',
      apiKey: '',
      enabled: true,
      custom: true,
      models: { chat: [], image: [], video: [] },
    });
    const restored = restoreProviderConnections([
      legacyCustom('custom-text-old', 'text'),
      legacyCustom('custom-image-old', 'image'),
      legacyCustom('custom-cli-old', 'cli'),
      { ...legacyCustom('custom-overseas', 'image'), region: '海外' as const },
    ]);

    expect(
      restored
        .filter((provider) => provider.id.endsWith('-old'))
        .map(({ id, region }) => [id, region]),
    ).toEqual([
      ['custom-text-old', '通用'],
      ['custom-image-old', '通用'],
      ['custom-cli-old', '通用'],
    ]);
    expect(restored.find((provider) => provider.id === 'custom-overseas')?.region).toBe('海外');
  });

  it('keeps legacy provider configs compatible and preserves newly saved audio models', () => {
    const restored = restoreProviderConnections([
      {
        id: 'custom-audio-api',
        name: 'Audio API',
        mark: 'AU',
        protocol: 'openai',
        category: 'text',
        baseUrl: 'https://audio.example.test/v1',
        apiKey: '',
        enabled: true,
        custom: true,
        region: '通用',
        models: {
          chat: [],
          image: [],
          video: [],
          audio: ['doubao-seed-music'],
        },
      },
    ]);

    expect(restored.find((provider) => provider.id === 'deepseek')?.models.audio).toEqual([]);
    expect(restored.find((provider) => provider.id === 'custom-audio-api')?.models.audio).toEqual([
      'doubao-seed-music',
    ]);
  });

  it('retains only recognized explicit masked-repair capabilities for custom models', () => {
    const restored = restoreProviderConnections([
      {
        id: 'custom-mask-api',
        name: 'Mask API',
        mark: 'M',
        protocol: 'openai',
        category: 'text',
        baseUrl: 'https://example.test/v1',
        apiKey: '',
        enabled: true,
        custom: true,
        region: '通用',
        models: { chat: [], image: [], video: ['video-mask-model'] },
        modelCapabilities: {
          'video-mask-model': {
            videoOperations: ['masked-repair', 'not-a-real-operation'],
          },
        },
      },
    ]);

    expect(
      restored.find((provider) => provider.id === 'custom-mask-api')?.modelCapabilities?.[
        'video-mask-model'
      ]?.videoOperations,
    ).toEqual(['masked-repair']);
  });
});

describe('official provider lifecycle migrations', () => {
  it('keeps built-in product metadata canonical while preserving editable connection fields', () => {
    const defaults = createDefaultProviderConnections();
    const saved = defaults.map((provider) => ({
      ...provider,
      name: `旧名称-${provider.id}`,
      status: '旧状态',
      summary: '旧说明',
      note: '旧备注',
      bestFor: ['旧用途'],
      canGenerate: provider.canGenerate === false ? true : false,
      baseUrl: `${provider.baseUrl.replace(/\/$/, '')}/account-scope`,
    }));
    const restored = restoreProviderConnections(saved);

    for (const provider of defaults) {
      const actual = restored.find((item) => item.id === provider.id);
      expect(actual).toMatchObject({
        name: provider.name,
        status: provider.status,
        summary: provider.summary,
        note: provider.note,
        bestFor: provider.bestFor,
        canGenerate: provider.canGenerate,
        baseUrl: `${provider.baseUrl.replace(/\/$/, '')}/account-scope`,
      });
    }
  });

  it('keeps unimplemented presets disabled without trusting stale saved flags', () => {
    const saved = createDefaultProviderConnections().map((provider) => ({
      ...provider,
      canGenerate: true,
    }));
    const restored = restoreProviderConnections(saved);

    expect(restored.find((provider) => provider.id === 'img-kling')).toMatchObject({
      canGenerate: false,
      status: '等待专用适配',
    });
  });

  it('drops every legacy DALL-E entry while preserving GPT Image', () => {
    const restored = restoreProviderConnections([
      {
        id: 'img-dalle',
        protocol: 'openai',
        custom: false,
      },
      {
        id: ' IMG-DALLE ',
        name: 'Forged retired provider',
        protocol: 'openai',
        category: 'image',
        custom: true,
        enabled: true,
        baseUrl: 'https://legacy.invalid',
        models: { chat: [], image: ['dall-e-3'], video: [] },
      },
    ]);

    expect(restored.some((provider) => provider.id.trim().toLowerCase() === 'img-dalle')).toBe(
      false,
    );
    expect(restored.find((provider) => provider.id === 'img-gptimage')).toMatchObject({
      canGenerate: true,
      models: { image: ['gpt-image-2'] },
    });
  });

  it('drops the retired generic image provider from saved settings', () => {
    const restored = restoreProviderConnections([
      {
        id: 'img-generic',
        protocol: 'openai',
        category: 'image',
        custom: false,
      },
      {
        id: ' IMG-GENERIC ',
        name: 'Forged generic image provider',
        protocol: 'openai',
        category: 'image',
        custom: true,
        enabled: true,
        baseUrl: 'https://legacy.invalid',
        models: { chat: [], image: ['legacy-image-model'], video: [] },
      },
    ]);

    expect(restored.some((provider) => provider.id.trim().toLowerCase() === 'img-generic')).toBe(
      false,
    );
  });

  it('drops every legacy RunningHub entry instead of normalizing it to OpenAI', () => {
    const restored = restoreProviderConnections([
      {
        id: 'runninghub',
        protocol: 'runninghub',
        custom: false,
      },
      {
        id: 'legacy-runninghub-custom',
        name: 'Legacy custom provider',
        protocol: 'runninghub',
        category: 'text',
        custom: true,
        enabled: true,
        baseUrl: 'https://legacy.invalid',
        models: { chat: ['legacy-model'], image: [], video: [] },
      },
      {
        id: 'RUNNINGHUB',
        name: 'Forged OpenAI fallback',
        protocol: 'openai',
        category: 'text',
        custom: true,
        enabled: true,
        baseUrl: 'https://legacy.invalid',
        models: { chat: ['legacy-model'], image: [], video: [] },
      },
    ]);

    expect(
      restored.some(
        (provider) =>
          provider.id.toLowerCase() === 'runninghub' ||
          String(provider.protocol).toLowerCase() === 'runninghub',
      ),
    ).toBe(false);
  });

  it('migrates removed OpenAI and Imagen model defaults', () => {
    const restored = restoreProviderConnections([
      {
        ...createDefaultProviderConnections().find((provider) => provider.id === 'api'),
        models: { chat: [], image: ['gpt-image-1'], video: [] },
      },
      {
        ...createDefaultProviderConnections().find((provider) => provider.id === 'img-imagen'),
        endpoint:
          '/v1/projects/demo/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict',
        models: { chat: [], image: ['imagen-3.0-generate-002'], video: [] },
      },
    ]);

    expect(restored.find((provider) => provider.id === 'api')?.models.image).toEqual([
      'gpt-image-2',
      'gpt-image-2-2026-04-21',
    ]);
    expect(restored.find((provider) => provider.id === 'img-imagen')).toMatchObject({
      endpoint:
        '/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models/imagen-4.0-generate-001:predict',
      models: { image: ['imagen-4.0-generate-001'] },
    });
  });
});

describe('Jimeng CLI setup', () => {
  it('keeps the official CLI provider and installer instructions available', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'jimeng');

    expect(provider).toMatchObject({ protocol: 'jimeng', category: 'cli', enabled: true });
    if (!provider) throw new Error('Default Jimeng provider is missing.');
    const guide = providerSetupGuide(provider);
    expect(guide.rootInstaller).toBe('tools/launchers/安装CLI工具-Windows.bat');
    expect(guide.commands).toContainEqual({
      label: '仅下载官方安装脚本（不执行）',
      value:
        'curl --fail --location --proto "=https" --output dreamina-install.sh https://jimeng.jianying.com/cli',
    });
    expect(guide.commands.map((command) => command.value).join('\n')).not.toMatch(/curl.+\|.+bash/);
  });
});

describe('Volcengine Ark CLI setup', () => {
  it('registers the official arkcli command first without fake canvas models', () => {
    const defaults = createDefaultProviderConnections();
    const provider = defaults.find((item) => item.id === 'volcengine-cli');

    expect(provider).toMatchObject({
      name: '山火 CLI',
      mark: '火',
      protocol: 'volcengine-cli',
      category: 'cli',
      region: '国内',
      enabled: true,
      status: 'Ark CLI 工具',
      disabledModelKinds: ['chat', 'image', 'video', 'audio'],
      models: { chat: [], image: [], video: [], audio: [] },
      modelCapabilities: {},
    });
    expect(
      sortProvidersForSettings(defaults.filter((item) => item.category === 'cli'))[0]?.id,
    ).toBe('volcengine-cli');
    if (!provider) throw new Error('Default Volcengine CLI provider is missing.');
    const guide = providerSetupGuide(provider);
    expect(guide.rootInstaller).toBe('tools/launchers/安装CLI工具-Windows.bat');
    expect(guide.docsUrl).toBe('https://console.volcengine.com/ark/region:cn-beijing/arkcli');
    expect(guide.commands).toContainEqual({
      label: '安装官方 CLI',
      value: 'npm.cmd install --global @volcengine/ark-cli@latest',
    });
    expect(guide.commands).toContainEqual({
      label: '检查版本',
      value: 'arkcli --version',
    });
    expect(guide.commands).toContainEqual({
      label: '浏览器登录',
      value: 'arkcli auth login volc-sso',
    });
    expect(guide.commands).toContainEqual({
      label: '验证当前身份',
      value: 'arkcli auth status',
    });
    expect(guide.commands).toContainEqual({
      label: '可选：连接 Agent Skills',
      value: 'arkcli +connect',
    });
    expect(guide.warning).toContain('不开放任意命令透传');
  });

  it('drops legacy Ark CLI state and never restores its ark-prefixed models', () => {
    const restored = restoreProviderConnections([
      {
        id: 'ark-cli',
        name: '豆包 CLI',
        protocol: 'ark-cli',
        category: 'cli',
        enabled: true,
        verifiedAt: 123,
        lastVerifiedAt: 123,
        models: { chat: ['ark:doubao-seed-2.0-pro'], image: [], video: [] },
        modelCapabilities: {
          'ark:doubao-seed-2.0-pro': {
            displayName: '豆包 Seed 2.0 Pro',
            inputModalities: ['text'],
          },
        },
        cliStatus: {
          installed: true,
          runnable: true,
          authenticated: true,
          ready: true,
          version: 'arkcli version 1.0.22',
          commandPath: 'C:\\bin\\arkcli-windows-amd64.exe',
          message: '旧 Ark 会话',
          checkedAt: 123,
        },
      },
    ]);

    expect(restored.some((provider) => provider.id === 'ark-cli')).toBe(false);
    expect(restored.find((provider) => provider.id === 'volcengine-cli')).toMatchObject({
      name: '山火 CLI',
      protocol: 'volcengine-cli',
      models: { chat: [], image: [], video: [] },
      modelCapabilities: {},
    });
    const volcengineCli = restored.find((provider) => provider.id === 'volcengine-cli');
    expect(volcengineCli).not.toHaveProperty('verifiedAt');
    expect(volcengineCli).not.toHaveProperty('lastVerifiedAt');
    expect(restored.flatMap((provider) => provider.models.chat)).not.toContain(
      'ark:doubao-seed-2.0-pro',
    );
    expect(availableProviderModels(restored, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'ark-cli' })]),
    );
  });

  it('records Ark CLI readiness without publishing bridge-supplied models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { arkcli: true },
          capabilities: { arkcli: { textGeneration: false } },
          sessions: {
            arkcli: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              version: 'arkcli 0.2.5',
              commandPath: 'C:\\bin\\arkcli.cmd',
              models: [
                {
                  slug: 'ark:doubao-seed-2.0-pro',
                  displayName: '不应发布的旧模型',
                  inputModalities: ['text'],
                },
              ],
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const volcengineCli = refreshed.find((provider) => provider.id === 'volcengine-cli');
    expect(volcengineCli).toMatchObject({
      verifiedAt: expect.any(Number),
      models: { chat: [], image: [], video: [] },
      modelCapabilities: {},
      cliStatus: { authenticated: true, ready: true },
    });
    for (const kind of ['chat', 'image', 'video'] as const) {
      expect(availableProviderModels(refreshed, kind)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ providerId: 'volcengine-cli' })]),
      );
    }
  });
});

describe('local ComfyUI setup', () => {
  it('registers the local service without exposing the ComfyUI port to browser requests', async () => {
    const defaults = createDefaultProviderConnections();
    const provider = defaults.find((item) => item.id === 'comfyui-local');
    expect(provider).toMatchObject({
      protocol: 'comfyui',
      category: 'cli',
      baseUrl: 'http://127.0.0.1:8188',
      models: { chat: [], image: [], video: [] },
    });
    if (!provider) throw new Error('Default ComfyUI provider is missing.');
    expect(providerSetupGuide(provider).steps.join(' ')).toContain('API Format');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ready: true,
        system: { comfyui_version: '0.4.0' },
        workflows: [
          {
            id: 'wan-t2v',
            name: 'Wan 文生视频',
            modes: ['文生视频'],
            supportsVideoReference: false,
          },
          {
            id: 'wan-i2v',
            name: 'Wan 图生视频',
            modes: ['图生视频'],
            supportsVideoReference: false,
          },
          {
            id: 'wan-v2v',
            name: 'Wan 视频参考',
            modes: ['全能参考'],
            supportsVideoReference: true,
          },
        ],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const configured = defaults.map((item) =>
      item.id === provider.id
        ? { ...item, lastVerifiedAt: 1, models: { ...item.models, video: ['previous'] } }
        : { ...item, enabled: false },
    );
    const refreshed = await refreshLocalCliConnections(configured);
    const connected = refreshed.find((item) => item.id === provider.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://127.0.0.1:2895/api/comfyui/status');
    expect(connected).toMatchObject({
      verifiedAt: expect.any(Number),
      models: { chat: [], image: [], video: ['wan-t2v', 'wan-i2v', 'wan-v2v'] },
      modelCapabilities: {
        'wan-t2v': {
          displayName: 'Wan 文生视频',
          videoReferenceInput: false,
          videoModes: ['文生视频'],
        },
        'wan-i2v': {
          displayName: 'Wan 图生视频',
          videoReferenceInput: false,
          videoModes: ['图生视频'],
        },
        'wan-v2v': {
          displayName: 'Wan 视频参考',
          videoReferenceInput: true,
          videoModes: ['全能参考'],
        },
      },
      cliStatus: { ready: true, videoGeneration: true, version: '0.4.0' },
    });
    expect(availableProviderModels(refreshed, 'video')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'comfyui-local',
          model: 'wan-i2v',
          label: 'ComfyUI 本地 · Wan 图生视频',
          recommended: false,
          videoReferenceInput: false,
          videoModes: ['图生视频'],
        }),
        expect.objectContaining({
          providerId: 'comfyui-local',
          model: 'wan-v2v',
          videoReferenceInput: true,
          videoModes: ['全能参考'],
        }),
      ]),
    );
    expect(availableProviderModels(refreshed, 'image')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'comfyui-local' })]),
    );
  });
});

describe('WorkBuddy CLI setup', () => {
  it('registers the official CodeBuddy command as a CLI provider', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'workbuddy');

    expect(provider).toMatchObject({
      name: 'WorkBuddy CLI',
      protocol: 'codebuddy',
      category: 'cli',
      enabled: true,
      models: { chat: ['workbuddy:auto'], image: [], video: [] },
    });
    if (!provider) throw new Error('Default WorkBuddy provider is missing.');
    expect(providerSetupGuide(provider).commands).toContainEqual({
      label: '安装',
      value: 'npm.cmd install --global @tencent-ai/codebuddy-code@latest',
    });
  });

  it('discovers the configured WorkBuddy model through the local bridge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { codebuddy: true },
          capabilities: {
            codebuddy: { textGeneration: true, imageGeneration: true, imageEditing: true },
          },
          sessions: {
            codebuddy: {
              installed: true,
              runnable: true,
              running: true,
              authenticated: true,
              ready: true,
              models: [
                { slug: 'auto', displayName: 'WorkBuddy 自动选择' },
                { slug: 'gpt-5', displayName: 'gpt-5' },
                { slug: 'hy3', displayName: 'hy3' },
              ],
              version: 'CodeBuddy Code 2.106.6',
              commandPath: 'C:\\bin\\codebuddy.cmd',
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const workbuddy = refreshed.find((provider) => provider.id === 'workbuddy');
    expect(workbuddy).toMatchObject({
      verifiedAt: expect.any(Number),
      models: {
        chat: ['workbuddy:auto', 'workbuddy:gpt-5', 'workbuddy:hy3'],
        image: ['workbuddy:$imagegen'],
        video: [],
      },
      cliStatus: { ready: true, running: true, authenticated: true },
    });
    expect(workbuddy?.modelCapabilities?.['workbuddy:hy3']).toMatchObject({
      inputModalities: ['text', 'image'],
    });
    expect(workbuddy?.modelCapabilities?.['workbuddy:auto']).toMatchObject({
      inputModalities: ['text', 'image'],
    });
    expect(availableProviderModels(refreshed, 'chat')).toContainEqual(
      expect.objectContaining({
        providerId: 'workbuddy',
        model: 'workbuddy:auto',
        recommended: true,
      }),
    );
    expect(availableProviderModels(refreshed, 'image')).toContainEqual(
      expect.objectContaining({ providerId: 'workbuddy', model: 'workbuddy:$imagegen' }),
    );
  });

  it('hides WorkBuddy models when the CLI is installed but no app session is running', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { codebuddy: true },
          sessions: {
            codebuddy: {
              installed: true,
              runnable: true,
              running: false,
              authenticated: true,
              ready: true,
              models: [{ slug: 'auto', displayName: 'WorkBuddy 自动选择' }],
              version: 'CodeBuddy Code 2.133.1',
              commandPath: 'C:\\bin\\codebuddy.cmd',
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const workbuddy = refreshed.find((provider) => provider.id === 'workbuddy');
    expect(workbuddy).toMatchObject({
      verifiedAt: undefined,
      models: { chat: [], image: [], video: [] },
      cliStatus: { ready: false, running: false },
    });
    expect(workbuddy && isProviderConnectionUsable(workbuddy)).toBe(false);
    expect(availableProviderModels(refreshed, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'workbuddy' })]),
    );
  });
});

describe('Visual generation CLI setup', () => {
  it('registers Bailian as a managed cloud image/video CLI', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'bailian');
    expect(provider).toMatchObject({
      name: '百炼 CLI',
      protocol: 'bailian',
      category: 'cli',
      models: {
        chat: [],
        image: ['bailian:qwen-image-2.0'],
        video: ['bailian:video-auto'],
      },
    });
    if (!provider) throw new Error('Default Bailian provider is missing.');
    expect(providerSetupGuide(provider).commands).toContainEqual({
      label: '安装',
      value: 'npm.cmd install --global bailian-cli',
    });
  });

  it('marks fixed visual CLI video adapters as not accepting source-video references', () => {
    const providers = createDefaultProviderConnections();

    for (const providerId of ['jimeng', 'bailian']) {
      const provider = providers.find((item) => item.id === providerId);
      if (!provider) throw new Error(`Default ${providerId} provider is missing.`);
      expect(provider.models.video.length).toBeGreaterThan(0);
      for (const model of provider.models.video) {
        expect(provider.modelCapabilities?.[model]?.videoReferenceInput).toBe(false);
      }
      for (const model of provider.models.image) {
        expect(provider.modelCapabilities?.[model]?.videoReferenceInput).toBeUndefined();
      }
    }

    const legacySavedProviders = providers.map((provider) =>
      ['jimeng', 'bailian'].includes(provider.id)
        ? {
            ...provider,
            modelCapabilities: Object.fromEntries(
              Object.entries(provider.modelCapabilities ?? {}).map(([model, capability]) => [
                model,
                { displayName: capability.displayName },
              ]),
            ),
          }
        : provider,
    );
    const restored = restoreProviderConnections(legacySavedProviders);
    for (const providerId of ['jimeng', 'bailian']) {
      const provider = restored.find((item) => item.id === providerId);
      if (!provider) throw new Error(`Restored ${providerId} provider is missing.`);
      for (const model of provider.models.video) {
        expect(provider.modelCapabilities?.[model]?.videoReferenceInput).toBe(false);
      }
    }
  });

  it('does not include the retired LightX2V CLI in the default catalog', () => {
    expect(createDefaultProviderConnections().some((provider) => provider.id === 'lightx2v')).toBe(
      false,
    );
  });
});

describe('availableProviderModels', () => {
  it('only exposes verified models that match the node generation type', () => {
    const connectedAt = Date.now();
    const providers = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: connectedAt,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              state: 'ready' as const,
              imageGeneration: true,
              version: 'codex-cli 1.0.0',
              commandPath: 'C:\\bin\\codex.exe',
              message: '已完成实时检测。',
              checkedAt: connectedAt,
            },
            models: {
              ...provider.models,
              chat: ['codex:gpt-5.6'],
              image: ['codex:$imagegen'],
            },
          }
        : provider.id === 'api'
          ? { ...provider, verifiedAt: connectedAt }
          : provider,
    );

    expect(availableProviderModels(providers, 'chat')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'api', model: 'gpt-4.1-mini' }),
        expect.objectContaining({ providerId: 'codex', model: 'codex:gpt-5.6' }),
      ]),
    );
    expect(availableProviderModels(providers, 'image')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'api',
          model: 'gpt-image-2',
          inputModalities: ['text', 'image'],
          maxReferenceImages: 5,
          maxOutputCount: 4,
        }),
        expect.objectContaining({ providerId: 'codex', model: 'codex:$imagegen' }),
      ]),
    );
    expect(availableProviderModels(providers, 'video')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'codex' })]),
    );
  });

  it('refreshes authenticated GPT CLI text and image capabilities from the local bridge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { codex: true, gemini: false, jimeng: true },
          capabilities: { codex: { imageGeneration: true } },
          sessions: {
            codex: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              models: [
                {
                  slug: 'gpt-5.6-sol',
                  displayName: 'GPT-5.6-Sol',
                  defaultReasoningEffort: 'low',
                  reasoningEfforts: ['low', 'medium', 'high', 'ultra'],
                  inputModalities: ['text', 'image'],
                },
              ],
            },
            jimeng: { installed: true, loggedIn: false },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const codex = refreshed.find((provider) => provider.id === 'codex');
    expect(codex?.verifiedAt).toEqual(expect.any(Number));
    expect(codex?.cliStatus).toMatchObject({
      installed: true,
      authenticated: true,
      imageGeneration: true,
      checkedAt: expect.any(Number),
    });
    expect(codex?.models.chat).toContain('codex:gpt-5.6-sol');
    expect(codex?.models.image).toEqual(['codex:$imagegen']);
    expect(codex?.modelCapabilities?.['codex:$imagegen']).toMatchObject({
      inputModalities: ['text', 'image'],
      maxReferenceImages: 5,
      maxReferenceVideos: 0,
      maxReferenceAudios: 0,
      maxOutputCount: 1,
    });
    expect(refreshed.find((provider) => provider.id === 'jimeng')?.verifiedAt).toBeUndefined();
    expect(availableProviderModels(refreshed, 'chat')).toContainEqual(
      expect.objectContaining({
        providerId: 'codex',
        model: 'codex:gpt-5.6-sol',
        label: 'GPT CLI · GPT-5.6-Sol',
        inputModalities: ['text', 'image'],
      }),
    );
    expect(codex?.modelCapabilities?.['codex:gpt-5.6-sol']?.inputModalities).toEqual([
      'text',
      'image',
    ]);
    expect(codex?.modelCapabilities?.['codex:gpt-5.6-sol']?.reasoningEfforts).toEqual([
      'low',
      'medium',
      'high',
      'ultra',
    ]);
    expect(availableProviderModels(refreshed, 'chat')).toContainEqual(
      expect.objectContaining({
        providerId: 'codex',
        model: 'codex:default',
        label: 'GPT CLI · Codex 推荐模型',
        recommended: true,
      }),
    );
  });

  it('probes built-in CLIs through the current Bridge instead of a persisted stale host', async () => {
    const staleBridge = 'http://localhost:3999/v1';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tools: { codex: true, codebuddy: true },
        capabilities: {
          codex: { imageGeneration: false },
          codebuddy: { textGeneration: true },
        },
        sessions: {
          codex: {
            installed: true,
            runnable: true,
            authenticated: true,
            ready: true,
            models: [],
          },
          codebuddy: {
            installed: true,
            runnable: true,
            running: true,
            authenticated: true,
            ready: true,
            models: [],
          },
        },
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const configured = createDefaultProviderConnections().map((provider) =>
      provider.protocol === 'codex' || provider.protocol === 'codebuddy'
        ? { ...provider, baseUrl: staleBridge }
        : provider,
    );
    const refreshed = await refreshLocalCliConnections(configured);

    expect(fetchMock).toHaveBeenCalledWith(`${BRIDGE_BASE_URL}/health?scope=models`, {
      signal: undefined,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith(staleBridge))).toBe(false);
    expect(refreshed.find((provider) => provider.id === 'codex')?.verifiedAt).toEqual(
      expect.any(Number),
    );
    expect(refreshed.find((provider) => provider.id === 'workbuddy')?.verifiedAt).toEqual(
      expect.any(Number),
    );
  });

  it('clears stale GPT CLI models and capabilities after an authoritative login failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { codex: true },
          capabilities: { codex: { imageGeneration: true } },
          sessions: {
            codex: {
              installed: true,
              runnable: true,
              authenticated: false,
              ready: false,
              state: 'unauthenticated',
              models: [{ slug: 'gpt-5.6-sol' }],
            },
          },
        }),
      } as Response),
    );
    const stale = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            models: {
              chat: ['codex:gpt-5.6-sol'],
              image: ['codex:$imagegen'],
              video: ['codex:stale-video'],
            },
            modelCapabilities: {
              'codex:gpt-5.6-sol': { displayName: 'Stale GPT' },
              'codex:$imagegen': { displayName: 'Stale Image' },
            },
          }
        : provider,
    );

    const codex = (await refreshLocalCliConnections(stale)).find(
      (provider) => provider.id === 'codex',
    );
    expect(codex?.models).toEqual({ chat: [], image: [], video: [] });
    expect(codex?.modelCapabilities).toEqual({});
    expect(codex?.cliStatus).toMatchObject({ authenticated: false, ready: false });
  });

  it('exposes verified Jimeng image and video models to matching canvas nodes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { codex: false, gemini: false, jimeng: true },
          capabilities: {
            jimeng: {
              imageGeneration: true,
              imageEditing: true,
              videoGeneration: true,
            },
          },
          sessions: {
            jimeng: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              hasVipAccess: true,
              models: {
                image: ['5.0Pro', '4.7', 'unsupported-image-model'],
                video: ['seedance2.5', 'seedance2.0mini', 'unsupported-video-model'],
              },
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const jimeng = refreshed.find((provider) => provider.id === 'jimeng');

    expect(jimeng).toMatchObject({
      verifiedAt: expect.any(Number),
      cliStatus: {
        ready: true,
        imageGeneration: true,
        imageEditing: true,
        videoGeneration: true,
        checkedAt: expect.any(Number),
      },
      models: {
        chat: [],
        image: ['5.0Pro', '4.7'],
        video: ['seedance2.5', 'seedance2.0mini'],
      },
    });
    expect(availableProviderModels(refreshed, 'image')).toContainEqual(
      expect.objectContaining({
        providerId: 'jimeng',
        model: '5.0Pro',
        displayName: '即梦图片 5.0 Pro',
      }),
    );
    expect(availableProviderModels(refreshed, 'video')).toContainEqual(
      expect.objectContaining({
        providerId: 'jimeng',
        model: 'seedance2.5',
        displayName: 'Seedance 2.5（VIP）',
        maxReferenceImages: 30,
        maxReferenceVideos: 0,
        maxReferenceAudios: 10,
        maxOutputCount: 1,
        videoOperations: [],
      }),
    );
    expect(availableProviderModels(refreshed, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'jimeng' })]),
    );
  });

  it('keeps the entire Dreamina CLI out of canvas selectors for a verified non-VIP account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { jimeng: true },
          capabilities: {
            jimeng: { imageGeneration: true, imageEditing: true, videoGeneration: true },
          },
          sessions: {
            jimeng: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: false,
              hasVipAccess: false,
              models: {
                image: ['5.0Pro'],
                video: [
                  'seedance2.5',
                  'seedance2.0_vip',
                  'seedance2.0fast_vip',
                  'seedance2.0',
                  'seedance2.0fast',
                  'seedance2.0mini',
                ],
              },
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const jimeng = refreshed.find((provider) => provider.id === 'jimeng');

    expect(jimeng).toMatchObject({
      verifiedAt: undefined,
      cliStatus: { hasVipAccess: false, ready: false, reasonCode: 'vip_required' },
      models: { chat: [], image: [], video: [] },
      modelCapabilities: {},
    });
    expect(availableProviderModels(refreshed, 'image')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'jimeng' })]),
    );
    expect(availableProviderModels(refreshed, 'video')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'jimeng' })]),
    );
  });

  it('keeps Dreamina hidden when restoring a snapshot without verified VIP access', () => {
    const checkedAt = Date.now() - 1000;
    const jimeng = createDefaultProviderConnections().find((provider) => provider.id === 'jimeng');
    expect(jimeng).toBeDefined();
    const restored = restoreProviderConnections([
      {
        ...jimeng,
        lastVerifiedAt: checkedAt,
        cliStatus: {
          installed: true,
          runnable: true,
          authenticated: true,
          ready: true,
          videoGeneration: true,
          version: 'dreamina test',
          commandPath: 'C:\\bin\\dreamina.exe',
          message: 'ready',
          checkedAt,
        },
      },
    ]).find((provider) => provider.id === 'jimeng');

    expect(restored).toBeDefined();
    if (!restored) throw new Error('Restored Jimeng provider is missing.');
    expect(restored?.cliStatus?.hasVipAccess).toBeUndefined();
    expect(restored?.models.image).toEqual([]);
    expect(restored?.models.video).toEqual([]);
    expect(isProviderConnectionUsable(restored)).toBe(false);
    expect(
      availableProviderModels(restored ? [restored] : [], 'video').map((item) => item.model),
    ).toEqual([]);
  });

  it('keeps the last verified CLI usable when a background refresh cannot reach the bridge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const checkedAt = Date.now() - 1000;
    const providers = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: checkedAt,
            cliStatus: {
              installed: true,
              runnable: true,
              ready: true,
              authenticated: true,
              imageGeneration: true,
              version: 'codex-cli 1.0.0',
              commandPath: 'C:\\bin\\codex.exe',
              message: '已连接。',
              checkedAt,
            },
          }
        : provider,
    );

    const refreshed = await refreshLocalCliConnections(providers);
    expect(refreshed.find((provider) => provider.id === 'codex')).toMatchObject({
      verifiedAt: undefined,
      lastVerifiedAt: checkedAt,
      cliStatus: { installed: true, authenticated: true, checkedAt },
    });
    expect(availableProviderModels(refreshed, 'chat')).toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'codex' })]),
    );
  });

  it('does not let an older CLI refresh erase newer API or CLI runtime proofs', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const defaults = createDefaultProviderConnections();
    saveProviderConnections(defaults);

    let resolveHealth: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveHealth = resolve;
          }),
      ),
    );
    const backgroundRefresh = refreshLocalCliConnections(defaults);

    const checkedAt = Date.now();
    const newer = defaults.map((provider) => {
      if (provider.id === 'api') return { ...provider, verifiedAt: checkedAt };
      if (provider.id !== 'codex') return provider;
      return {
        ...provider,
        verifiedAt: checkedAt,
        cliStatus: {
          installed: true,
          runnable: true,
          authenticated: true,
          ready: true,
          state: 'ready' as const,
          imageGeneration: true,
          version: 'codex-cli newer',
          commandPath: 'C:\\bin\\codex.exe',
          message: '较新的强制检测已通过。',
          checkedAt,
        },
      };
    });
    saveProviderConnections(newer);

    resolveHealth?.({
      ok: true,
      json: async () => ({
        tools: { codex: true, gemini: false },
        capabilities: { codex: { imageGeneration: false } },
        sessions: {
          codex: {
            installed: true,
            runnable: true,
            authenticated: false,
            ready: false,
            message: '旧的后台响应。',
          },
        },
      }),
    } as Response);
    await backgroundRefresh;

    const loaded = loadProviderConnections();
    expect(loaded.find((provider) => provider.id === 'api')?.verifiedAt).toBe(checkedAt);
    expect(loaded.find((provider) => provider.id === 'codex')).toMatchObject({
      verifiedAt: checkedAt,
      cliStatus: { ready: true, version: 'codex-cli newer' },
    });

    saveProviderConnections(defaults);
  });

  it('does not let an older settings snapshot resurrect a newer CLI rejection', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const defaults = createDefaultProviderConnections();
    const staleCheckedAt = Date.now() - 1000;
    const staleSettings = defaults.map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: staleCheckedAt,
            lastVerifiedAt: staleCheckedAt,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              state: 'ready' as const,
              imageGeneration: true,
              version: 'codex-cli stale',
              commandPath: 'C:\\bin\\codex.exe',
              message: '较旧的设置页快照。',
              checkedAt: staleCheckedAt,
            },
          }
        : provider,
    );

    try {
      saveProviderConnections(staleSettings);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            tools: { codex: true },
            sessions: {
              codex: {
                installed: true,
                runnable: true,
                authenticated: false,
                ready: false,
                state: 'unauthenticated',
                message: '较新的登录拒绝。',
              },
            },
          }),
        } as Response),
      );

      await refreshLocalCliConnections(loadProviderConnections());
      saveProviderConnections(staleSettings);

      const loadedCodex = loadProviderConnections().find((provider) => provider.id === 'codex');
      expect(loadedCodex).toMatchObject({
        verifiedAt: undefined,
        lastVerifiedAt: undefined,
        cliStatus: { authenticated: false, ready: false, message: '较新的登录拒绝。' },
      });
      expect(availableProviderModels(loadProviderConnections(), 'chat')).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ providerId: 'codex' })]),
      );
    } finally {
      saveProviderConnections(defaults);
    }
  });

  it('discards an older runtime rejection when storage has a newer CLI proof', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const defaults = createDefaultProviderConnections();
    const rejectedAt = Date.now() - 2000;
    const rejected = defaults.map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: undefined,
            lastVerifiedAt: undefined,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: false,
              ready: false,
              state: 'unauthenticated' as const,
              version: 'codex-cli old',
              commandPath: 'C:\\bin\\codex.exe',
              message: '较旧的登录拒绝。',
              checkedAt: rejectedAt,
            },
          }
        : provider,
    );

    try {
      saveProviderConnections(rejected);
      const verifiedAt = Date.now();
      const newerStored = defaults.map((provider) =>
        provider.id === 'codex'
          ? {
              ...provider,
              verifiedAt: undefined,
              lastVerifiedAt: verifiedAt,
              cliStatus: {
                installed: true,
                runnable: true,
                authenticated: true,
                ready: true,
                state: 'ready' as const,
                imageGeneration: true,
                version: 'codex-cli newer',
                commandPath: 'C:\\bin\\codex.exe',
                message: '较新的持久化连接证明。',
                checkedAt: verifiedAt,
              },
            }
          : provider,
      );
      values.set(PROVIDER_STORAGE_KEY, JSON.stringify(newerStored));

      const loadedCodex = loadProviderConnections().find((provider) => provider.id === 'codex');
      expect(loadedCodex).toMatchObject({
        verifiedAt: undefined,
        lastVerifiedAt: verifiedAt,
        cliStatus: { authenticated: true, ready: true, version: 'codex-cli newer' },
      });
      expect(isProviderConnectionUsable(loadedCodex as ProviderConnection)).toBe(true);
    } finally {
      saveProviderConnections(defaults);
    }
  });

  it('does not treat an installed-only Antigravity CLI as connected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { codex: false, gemini: true, jimeng: false },
          capabilities: { gemini: { textGeneration: true } },
          sessions: {
            gemini: {
              installed: true,
              runnable: true,
              version: '1.1.11',
              commandPath: 'C:\\bin\\agy.exe',
              message: 'Antigravity CLI 已安装。',
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    expect(refreshed.find((provider) => provider.id === 'gemini')).toMatchObject({
      verifiedAt: undefined,
      lastVerifiedAt: undefined,
      cliStatus: { installed: true, ready: false },
    });
    expect(availableProviderModels(refreshed, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'gemini' })]),
    );
  });

  it('exposes Antigravity only after the agy authentication probe succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { gemini: true },
          capabilities: { gemini: { textGeneration: true } },
          sessions: {
            gemini: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              cliKind: 'agy',
              version: '1.1.13',
              commandPath: 'C:\\bin\\agy.exe',
              message: 'Antigravity CLI 已登录并可读取模型。',
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const antigravity = refreshed.find((provider) => provider.id === 'gemini');
    expect(antigravity).toMatchObject({
      verifiedAt: expect.any(Number),
      models: { chat: ['antigravity:auto'], image: [], video: [] },
      cliStatus: { authenticated: true, ready: true },
    });
    expect(availableProviderModels(refreshed, 'chat')).toContainEqual(
      expect.objectContaining({ providerId: 'gemini', model: 'antigravity:auto' }),
    );
  });

  it('rejects a legacy Gemini fallback even when an old bridge reports it ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { gemini: true },
          capabilities: { gemini: { textGeneration: true } },
          sessions: {
            gemini: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              cliKind: 'gemini',
              version: '0.54.4',
              commandPath: 'C:\\bin\\gemini.cmd',
              message: 'Gemini CLI 命令可用。',
            },
          },
        }),
      } as Response),
    );

    const refreshed = await refreshLocalCliConnections(createDefaultProviderConnections());
    const antigravity = refreshed.find((provider) => provider.id === 'gemini');
    expect(antigravity).toMatchObject({
      verifiedAt: undefined,
      cliStatus: { cliKind: 'gemini', authenticated: true, ready: false },
    });
    expect(availableProviderModels(refreshed, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'gemini' })]),
    );
  });

  it('does not restore a historical Antigravity connection without a current agy probe', () => {
    const checkedAt = Date.now() - 1000;
    const antigravity = createDefaultProviderConnections().find(
      (provider) => provider.id === 'gemini',
    );
    if (!antigravity) throw new Error('Default Antigravity provider is missing.');

    expect(
      isProviderConnectionUsable({
        ...antigravity,
        lastVerifiedAt: checkedAt,
        cliStatus: {
          installed: true,
          runnable: true,
          authenticated: true,
          ready: true,
          state: 'ready',
          version: '1.1.13',
          commandPath: 'C:\\bin\\agy.exe',
          message: '历史检测通过。',
          checkedAt,
        },
      }),
    ).toBe(false);
  });

  it('revokes a restored CLI after an authoritative not-ready probe', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const checkedAt = Date.now() - 1000;
    const providers = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: checkedAt,
            lastVerifiedAt: checkedAt,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              state: 'ready' as const,
              version: 'codex-cli 1.0.0',
              commandPath: 'C:\\bin\\codex.exe',
              message: '已连接。',
              checkedAt,
            },
          }
        : provider,
    );
    saveProviderConnections(providers);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: { codex: true },
          sessions: {
            codex: {
              installed: true,
              runnable: true,
              authenticated: false,
              ready: false,
              state: 'unauthenticated',
              message: '请重新登录。',
            },
          },
        }),
      } as Response),
    );

    await refreshLocalCliConnections(loadProviderConnections());

    expect(availableProviderModels(loadProviderConnections(), 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'codex' })]),
    );

    saveProviderConnections(createDefaultProviderConnections());
  });

  it('rejects a fresh CLI timestamp when the explicit ready observation is missing or false', () => {
    const checkedAt = Date.now();
    const providers = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt: checkedAt,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: false,
              state: 'installed' as const,
              version: 'codex-cli 1.0.0',
              commandPath: 'C:\\bin\\codex.exe',
              message: '仅检测到安装。',
              checkedAt,
            },
          }
        : provider,
    );

    expect(availableProviderModels(providers, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'codex' })]),
    );
  });

  it('does not expose disconnected providers or account-only CLI entries', () => {
    const providers = createDefaultProviderConnections().map((provider) => ({
      ...provider,
      verifiedAt: Date.now(),
    }));

    expect(availableProviderModels(providers, 'image')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'jimeng' })]),
    );
    expect(
      availableProviderModels(
        providers.map((provider) =>
          provider.id === 'api' ? { ...provider, verifiedAt: undefined } : provider,
        ),
        'chat',
      ),
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ providerId: 'api' })]));
  });

  it('only exposes currently verified models to interactive assistants', () => {
    const checkedAt = Date.now();
    const providers = createDefaultProviderConnections().map((provider) => {
      if (provider.id === 'api') {
        return {
          ...provider,
          verifiedAt: undefined,
          lastVerifiedAt: checkedAt,
          models: { ...provider.models, chat: ['gpt-4.1-mini'] },
        };
      }
      if (provider.id === 'deepseek') {
        return {
          ...provider,
          verifiedAt: checkedAt,
          lastVerifiedAt: checkedAt,
          models: { ...provider.models, chat: ['deepseek-chat'] },
        };
      }
      return provider;
    });

    expect(availableProviderModels(providers, 'chat')).toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'api' })]),
    );
    expect(connectedProviderModels(providers, 'chat')).toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'deepseek' })]),
    );
    expect(connectedProviderModels(providers, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'api' })]),
    );
  });
});

describe('provider registry persistence', () => {
  it('drops the retired LibTV vision provider from previously saved settings', () => {
    const restored = restoreProviderConnections([
      {
        id: 'api',
        protocol: 'openai',
        category: 'text',
        enabled: true,
        models: { chat: ['gpt-4.1-mini'], image: ['gpt-image-2'], video: [] },
      },
      {
        id: 'libtv-vision',
        name: 'LibTV 视觉理解',
        protocol: 'openai',
        category: 'text',
        enabled: true,
        models: { chat: ['gvlm-3.1'], image: [], video: [] },
      },
    ]);
    const provider = restored.find((item) => item.id === 'libtv-vision');

    expect(provider).toBeUndefined();
  });

  it('restores a complete persisted CLI verification for stable canvas access', () => {
    const restored = restoreProviderConnections([
      {
        id: 'codex',
        protocol: 'codex',
        category: 'cli',
        enabled: true,
        verifiedAt: 123,
        cliStatus: {
          installed: true,
          runnable: true,
          authenticated: true,
          ready: true,
          state: 'ready',
          imageGeneration: true,
          version: 'codex-cli 1.0.0',
          commandPath: 'C:\\bin\\codex.exe',
          message: '已连接。',
          checkedAt: 123,
        },
        models: { chat: ['codex:gpt-5.6-sol'], image: ['codex:$imagegen'], video: [] },
      },
    ]);

    expect(restored.find((provider) => provider.id === 'codex')).toMatchObject({
      verifiedAt: undefined,
      lastVerifiedAt: 123,
      cliStatus: {
        installed: true,
        authenticated: true,
        imageGeneration: true,
        checkedAt: 123,
      },
      models: { image: ['codex:$imagegen'] },
    });
    expect(availableProviderModels(restored, 'image')).toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'codex' })]),
    );
  });

  it('does not restore CLI access from an incomplete or mismatched snapshot', () => {
    const restored = restoreProviderConnections([
      {
        id: 'codex',
        protocol: 'codex',
        category: 'cli',
        enabled: true,
        lastVerifiedAt: 123,
        cliStatus: {
          installed: true,
          runnable: true,
          authenticated: true,
          ready: true,
          state: 'ready',
          version: 'codex-cli 1.0.0',
          commandPath: 'C:\\bin\\codex.exe',
          message: '旧检测记录。',
          checkedAt: 122,
        },
        models: { chat: ['codex:gpt-5.6-sol'], image: [], video: [] },
      },
    ]);

    expect(availableProviderModels(restored, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'codex' })]),
    );
  });

  it('keeps live provider verification only in the current JavaScript runtime', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const verifiedAt = Date.now();
    const providers = createDefaultProviderConnections().map((provider) =>
      provider.id === 'codex'
        ? {
            ...provider,
            verifiedAt,
            lastVerifiedAt: verifiedAt,
            cliStatus: {
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              state: 'ready' as const,
              version: 'codex-cli 1.0.0',
              commandPath: 'C:\\bin\\codex.exe',
              message: '已完成实时检测。',
              checkedAt: verifiedAt,
            },
          }
        : provider,
    );

    saveProviderConnections(providers);
    const serialized = Array.from(values.values())[0];
    if (!serialized) throw new Error('Provider connections were not persisted.');
    const persisted = JSON.parse(serialized) as ProviderConnection[];
    const persistedCodex = persisted.find((provider) => provider.id === 'codex');
    expect(persistedCodex).not.toHaveProperty('verifiedAt');
    expect(persistedCodex).toMatchObject({ lastVerifiedAt: verifiedAt });
    expect(loadProviderConnections().find((provider) => provider.id === 'codex')?.verifiedAt).toBe(
      verifiedAt,
    );

    if (!persistedCodex) throw new Error('Persisted Codex provider is missing.');
    persistedCodex.baseUrl = 'http://127.0.0.1:2999/v1';
    const storageKey = Array.from(values.keys())[0];
    if (!storageKey) throw new Error('Provider storage key is missing.');
    values.set(storageKey, JSON.stringify(persisted));
    expect(
      loadProviderConnections().find((provider) => provider.id === 'codex')?.verifiedAt,
    ).toBeUndefined();
  });

  it('restores a verified API as usable while keeping runtime verification separate', () => {
    const restored = restoreProviderConnections([
      {
        id: 'api',
        protocol: 'openai',
        category: 'text',
        enabled: true,
        verifiedAt: 456,
        models: { chat: ['gpt-4.1-mini'], image: ['gpt-image-2'], video: [] },
      },
    ]);
    const api = restored.find((provider) => provider.id === 'api');

    expect(api).toMatchObject({ verifiedAt: undefined, lastVerifiedAt: 456 });
    expect(availableProviderModels(restored, 'chat')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'api', model: 'gpt-4.1-mini' }),
      ]),
    );
  });

  it('clears durable API availability when its saved connection history is cleared', () => {
    const restored = restoreProviderConnections([
      {
        id: 'api',
        protocol: 'openai',
        category: 'text',
        enabled: true,
        models: { chat: ['gpt-4.1-mini'], image: ['gpt-image-2'], video: [] },
      },
    ]);

    expect(availableProviderModels(restored, 'chat')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'api' })]),
    );
  });

  it('preserves custom image metadata and its configured authentication method', () => {
    const restored = restoreProviderConnections([
      {
        id: 'custom-image',
        custom: true,
        name: 'Image Gateway',
        category: 'image',
        protocol: 'openai',
        baseUrl: 'https://images.example.test',
        endpoint: '/images/generate',
        authType: 'x-key',
        canGenerate: true,
        models: { chat: [], image: ['image-v1'], video: [] },
      },
    ]);

    expect(restored.find((item) => item.id === 'custom-image')).toMatchObject({
      category: 'image',
      endpoint: '/images/generate',
      authType: 'x-key',
      canGenerate: true,
      models: { image: ['image-v1'] },
    });
  });

  it('preserves custom CLI providers instead of converting them into OpenAI providers', () => {
    const restored = restoreProviderConnections([
      {
        id: 'custom-cli',
        custom: true,
        name: 'Local Tool',
        category: 'cli',
        protocol: 'cli',
        baseUrl: 'http://127.0.0.1:4455/v1',
        models: { chat: ['tool:default'], image: [], video: [] },
      },
    ]);

    expect(restored.find((item) => item.id === 'custom-cli')).toMatchObject({
      category: 'cli',
      protocol: 'cli',
      baseUrl: 'http://127.0.0.1:4455/v1',
    });
  });
});

describe('providerAuthHeaders', () => {
  const base = { apiKey: 'secret' } as Pick<ProviderConnection, 'apiKey' | 'authType'>;

  it.each([
    ['bearer', { Accept: 'application/json', Authorization: 'Bearer secret' }],
    ['api-key', { Accept: 'application/json', 'api-key': 'secret' }],
    ['x-key', { Accept: 'application/json', 'x-key': 'secret' }],
  ] as const)('uses %s authentication', (authType, expected) => {
    expect(providerAuthHeaders({ ...base, authType })).toEqual(expected);
  });
});

describe('remote provider model discovery', () => {
  it('uses the local bridge instead of exposing provider discovery to browser CORS', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chatModels: ['deepseek-v4-pro'],
        imageModels: [],
        videoModels: [],
        message: '连接成功，找到 1 个文本模型。',
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchProviderModels({
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'secret',
        protocol: 'deepseek',
        authType: 'bearer',
      }),
    ).resolves.toMatchObject({ chatModels: ['deepseek-v4-pro'] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:2895/api/provider/models');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      baseUrl: 'https://api.deepseek.com',
      protocol: 'deepseek',
      authType: 'bearer',
      apiKey: 'secret',
    });
  });

  it('persists explicit trust before the bridge proxies a loopback provider', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chatModels: ['local-model'],
          imageModels: [],
          videoModels: [],
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await fetchProviderModels({
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: '',
      protocol: 'openai',
      authType: 'bearer',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:2895/trusted-local-providers');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      origin: 'http://127.0.0.1:11434',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:2895/api/provider/models');
  });

  it('rejects an empty catalog so the caller keeps its existing models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ chatModels: [], imageModels: [], videoModels: [] }),
      } as Response),
    );
    await expect(
      fetchProviderModels({
        baseUrl: 'https://api.example.test/v1',
        apiKey: '',
        protocol: 'openai',
        authType: 'bearer',
      }),
    ).rejects.toThrow('原有手动模型未被覆盖');
  });

  it('hides model kinds whose provider-specific runtime contract is not implemented', () => {
    const verified = createDefaultProviderConnections().map((provider) => ({
      ...provider,
      verifiedAt: 1,
    }));
    expect(availableProviderModels(verified, 'video')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'xai' }),
        expect.objectContaining({ providerId: 'volcengine' }),
      ]),
    );
    expect(availableProviderModels(verified, 'image')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: 'modelscope' })]),
    );
    expect(availableProviderModels(verified, 'image')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'xai' }),
        expect.objectContaining({ providerId: 'volcengine' }),
      ]),
    );
  });
});

describe('fixed image provider configuration', () => {
  it('enables providers with no official model directory through honest deferred validation', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'img-ideogram');
    if (!provider) throw new Error('Default Ideogram provider is missing.');

    expect(validateFixedProviderConfiguration({ ...provider, apiKey: 'test-only' })).toContain(
      '首次图片生成时由上游验证',
    );
  });

  it('rejects missing keys and the placeholder Imagen project id', () => {
    const defaults = createDefaultProviderConnections();
    const recraft = defaults.find((item) => item.id === 'img-recraft');
    const imagen = defaults.find((item) => item.id === 'img-imagen');
    if (!recraft || !imagen) throw new Error('Default fixed image providers are missing.');

    expect(() => validateFixedProviderConfiguration(recraft)).toThrow('API Key');
    expect(() => validateFixedProviderConfiguration({ ...imagen, apiKey: 'test-only' })).toThrow(
      'PROJECT_ID',
    );
  });

  it('keeps fixed-provider format validation separate from credential verification', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'img-recraft');
    if (!provider) throw new Error('Default Recraft provider is missing.');
    const validatedAt = 123;
    const restored = restoreProviderConnections([
      {
        ...provider,
        configValidatedAt: validatedAt,
        lastVerifiedAt: undefined,
      },
    ]).find((item) => item.id === provider.id);

    expect(restored).toMatchObject({ configValidatedAt: validatedAt, lastVerifiedAt: undefined });
    expect(availableProviderModels(restored ? [restored] : [], 'image')).not.toHaveLength(0);
  });
});

describe('discovered model merge', () => {
  it('updates only the image capability for an image-provider entry', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'img-grok');
    if (!provider) throw new Error('Default xAI image provider is missing.');

    expect(
      mergeDiscoveredProviderModels(provider, {
        chatModels: ['grok-chat-new'],
        imageModels: ['grok-image-new'],
        videoModels: ['grok-video-new'],
        audioModels: ['grok-audio-new'],
      }),
    ).toEqual({ chat: [], image: ['grok-image-new'], video: [], audio: [], '3d': [] });
  });

  it('merges discovered audio models into a text provider without changing other fallbacks', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'volcengine');
    if (!provider) throw new Error('Default Volcengine provider is missing.');

    const merged = mergeDiscoveredProviderModels(provider, {
      chatModels: [],
      imageModels: [],
      videoModels: [],
      audioModels: ['doubao-seed-music', 'doubao-seed-tts-2.0'],
    });
    expect(merged.audio).toEqual(['doubao-seed-music', 'doubao-seed-tts-2.0']);
    expect(
      availableProviderModels(
        [{ ...provider, models: merged, verifiedAt: 100, lastVerifiedAt: 100 }],
        'audio',
      ),
    ).toEqual([]);
  });

  it('does not delete administrator fallbacks when a capability is absent', () => {
    const provider = createDefaultProviderConnections().find((item) => item.id === 'deepseek');
    if (!provider) throw new Error('Default DeepSeek provider is missing.');

    expect(
      mergeDiscoveredProviderModels(provider, {
        chatModels: [],
        imageModels: [],
        videoModels: [],
      }),
    ).toEqual(provider.models);
  });
});

describe('safeProviderBaseUrl', () => {
  it('allows HTTPS providers and loopback HTTP providers', () => {
    expect(safeProviderBaseUrl('https://api.example.test/v1/')).toBe('https://api.example.test/v1');
    expect(safeProviderBaseUrl('http://127.0.0.1:2895/v1')).toBe('http://127.0.0.1:2895/v1');
  });

  it('allows HTTP only for the current LAN bridge origin', () => {
    const bridgeBase = 'http://192.168.1.25:2895';
    expect(safeProviderBaseUrl(`${bridgeBase}/v1`, bridgeBase)).toBe(`${bridgeBase}/v1`);
    expect(() => safeProviderBaseUrl('http://192.168.1.26:2895/v1', bridgeBase)).toThrow(
      '必须使用 HTTPS',
    );
  });

  it('rejects non-loopback HTTP providers before an API key can be sent', () => {
    expect(() => safeProviderBaseUrl('http://api.example.test/v1')).toThrow('必须使用 HTTPS');
    expect(() => safeProviderBaseUrl('https://user:secret@example.test/v1')).toThrow(
      '不能包含用户名',
    );
  });
});
