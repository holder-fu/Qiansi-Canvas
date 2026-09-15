import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isPluginEngineCompatible,
  normalizePluginState,
  parsePluginManifest,
} from './plugin-contract.mjs';

test('uses an English display name for the bundled orange-cat plugin', async () => {
  const source = await readFile(
    new URL('./data/plugins/qiansi-orange-cat/plugin.json', import.meta.url),
    'utf8',
  );
  const manifest = parsePluginManifest(JSON.parse(source));

  assert.equal(manifest.id, 'qiansi-orange-cat');
  assert.equal(manifest.name, 'Qiansi Orange Cat');
});

test('accepts a safe declarative node plugin', () => {
  const manifest = parsePluginManifest({
    schemaVersion: 1,
    id: 'holder-tools',
    name: 'Holder Tools',
    version: '1.0.0',
    contributes: {
      nodes: [
        {
          id: 'image-note',
          label: '图片备注',
          input: 'image',
          output: 'text',
          accent: '#22d3ee',
        },
      ],
    },
  });
  assert.equal(manifest.contributes.nodes[0].output, 'text');
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(manifest.contributes.panels, []);
  assert.deepEqual(manifest.contributes.menus, []);
});

test('accepts a safe local pet widget plugin', () => {
  const manifest = parsePluginManifest({
    schemaVersion: 1,
    id: 'orange-cat',
    name: '橘猫宠物',
    version: '1.0.0',
    contributes: {
      widgets: [
        {
          id: 'canvas-cat',
          type: 'pet',
          label: '橘猫助手',
          asset: 'cat.png',
          centerAsset: 'paw.png',
          width: 156,
          message: '今天也一起创作吧！',
        },
      ],
    },
  });
  assert.equal(manifest.contributes.nodes.length, 0);
  assert.equal(manifest.contributes.widgets[0].position, 'bottom-right');
  assert.equal(manifest.contributes.widgets[0].centerAsset, 'paw.png');
});

test('rejects executable and malformed plugin declarations', () => {
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 1,
        id: 'bad-plugin',
        name: 'Bad',
        version: '1.0.0',
        runtime: 'index.mjs',
        contributes: { nodes: [{ id: 'node', label: 'Node' }] },
      }),
    /v1 插件不支持运行时代码/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 1,
        id: 'bad-plugin',
        name: 'Bad',
        version: '1.0.0',
        contributes: { nodes: [{ id: 'node', label: 'Node', input: 'shell' }] },
      }),
    /端口类型/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 1,
        id: 'bad-plugin',
        name: 'Bad',
        version: '1.0.0',
        contributes: {
          widgets: [{ id: 'bad-pet', type: 'pet', label: 'Bad', asset: '../secret.png' }],
        },
      }),
    /图片文件名无效/,
  );
});

test('accepts Markdown as a flat declared plugin asset', () => {
  const manifest = parsePluginManifest({
    schemaVersion: 2,
    id: 'style-skill-plugin',
    name: 'Style Skill Plugin',
    version: '1.0.0',
    runtime: { entry: 'runtime.js', apiVersion: 2 },
    permissions: ['assets:read'],
    assets: ['style-skill.md'],
    contributes: {
      panels: [{ id: 'studio', label: 'Style Skills', view: 'style-skills' }],
    },
  });

  assert.deepEqual(manifest.assets, ['style-skill.md']);
});

test('accepts a v2 sandbox runtime with nodes, panels and canvas menus', () => {
  const manifest = parsePluginManifest({
    schemaVersion: 2,
    id: 'studio-tools',
    name: 'Studio Tools',
    version: '2.0.0',
    runtime: { entry: 'runtime.js', apiVersion: 1 },
    permissions: ['canvas:add-node', 'canvas:update-own-node', 'canvas:notify'],
    assets: ['actor.glb'],
    contributes: {
      nodes: [
        {
          id: 'studio-node',
          label: '新3D导演台',
          input: 'reference',
          output: 'video',
          renderer: 'sandbox',
          presentation: 'immersive',
          view: 'studio-node',
          width: 670,
          height: 600,
        },
        {
          id: 'audio-node',
          label: '音频节点',
          input: 'audio',
          output: 'audio',
          hostKind: 'audio',
        },
      ],
      panels: [
        {
          id: 'studio-panel',
          label: '导演布局面板',
          position: 'fullscreen',
          hostChrome: 'integrated',
          view: 'studio-panel',
          width: 420,
          height: 600,
        },
      ],
      menus: [
        {
          id: 'open-studio-panel',
          label: '打开导演布局面板',
          location: 'canvas',
          action: { type: 'open-panel', panelId: 'studio-panel' },
        },
        {
          id: 'add-audio-node',
          label: '添加音频节点',
          location: 'canvas',
          action: { type: 'add-node', nodeId: 'audio-node' },
        },
      ],
    },
  });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.contributes.nodes[0].renderer, 'sandbox');
  assert.equal(manifest.contributes.nodes[0].presentation, 'immersive');
  assert.equal(manifest.contributes.nodes[1].hostKind, 'audio');
  assert.equal(manifest.contributes.nodes[1].presentation, 'card');
  assert.equal(manifest.contributes.panels[0].position, 'fullscreen');
  assert.equal(manifest.contributes.panels[0].hostChrome, 'integrated');
  assert.equal(manifest.contributes.menus[0].action.type, 'open-panel');
  assert.deepEqual(manifest.assets, ['actor.glb']);
});

test('limits integrated and custom host chrome to fullscreen panels', () => {
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 2,
        id: 'compact-panel',
        name: 'Compact Panel',
        version: '1.0.0',
        runtime: { entry: 'runtime.js', apiVersion: 2 },
        contributes: {
          panels: [
            {
              id: 'compact',
              label: 'Compact',
              position: 'right',
              hostChrome: 'integrated',
              view: 'compact',
            },
          ],
        },
      }),
    /只有全屏面板可以使用集成或自绘宿主顶栏/,
  );

  const custom = parsePluginManifest({
    schemaVersion: 2,
    id: 'custom-studio',
    name: 'Custom Studio',
    version: '1.0.0',
    runtime: { entry: 'runtime.js', apiVersion: 2 },
    contributes: {
      panels: [
        {
          id: 'studio',
          label: 'Studio',
          position: 'fullscreen',
          hostChrome: 'custom',
          view: 'studio',
        },
      ],
    },
  });
  assert.equal(custom.contributes.panels[0].hostChrome, 'custom');
});

test('accepts a v2 audio generator with API 2 and explicit loopback limits', () => {
  const manifest = parsePluginManifest({
    schemaVersion: 2,
    id: 'voxcpm-audio',
    name: 'VoxCPM Audio',
    version: '1.0.0',
    runtime: { entry: 'runtime.js', apiVersion: 2 },
    permissions: ['canvas:read-own-inputs', 'audio:generate'],
    contributes: {
      nodes: [
        {
          id: 'speech-node',
          label: 'VoxCPM 语音',
          input: 'text',
          output: 'audio',
          renderer: 'sandbox',
          view: 'speech-node',
        },
      ],
      audioGenerators: [
        {
          id: 'voxcpm-local',
          label: 'VoxCPM2 本机服务',
          protocol: 'qiansi-audio-v1',
          endpoint: 'http://127.0.0.1:9880/v1/audio/generate',
          healthEndpoint: 'http://127.0.0.1:9880/health',
          canvasOutput: 'audio-node',
          timeoutMs: 180000,
          maxBytes: 33554432,
        },
      ],
    },
  });
  assert.equal(manifest.runtime.apiVersion, 2);
  assert.deepEqual(manifest.contributes.audioGenerators, [
    {
      id: 'voxcpm-local',
      label: 'VoxCPM2 本机服务',
      protocol: 'qiansi-audio-v1',
      endpoint: 'http://127.0.0.1:9880/v1/audio/generate',
      healthEndpoint: 'http://127.0.0.1:9880/health',
      canvasOutput: 'audio-node',
      timeoutMs: 180000,
      maxBytes: 33554432,
    },
  ]);
});

test('accepts bounded host-proxied image reads only with runtime API 2', () => {
  const base = {
    schemaVersion: 2,
    id: 'panorama-viewer',
    name: 'Panorama Viewer',
    version: '1.0.0',
    permissions: ['canvas:read-own-image'],
    contributes: {
      nodes: [
        {
          id: 'panorama-node',
          label: '全景节点',
          input: 'image',
          output: 'image',
          renderer: 'sandbox',
          view: 'panorama-node',
        },
      ],
    },
  };
  const manifest = parsePluginManifest({
    ...base,
    runtime: { entry: 'runtime.js', apiVersion: 2 },
  });
  assert.deepEqual(manifest.permissions, ['canvas:read-own-image']);
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        runtime: { entry: 'runtime.js', apiVersion: 1 },
      }),
    /apiVersion 2/,
  );
});

test('accepts plugin-scoped preferences only with runtime API 2', () => {
  const base = {
    schemaVersion: 2,
    id: 'voice-presets',
    name: 'Voice Presets',
    version: '1.0.0',
    permissions: ['storage:preferences'],
    contributes: {
      panels: [
        {
          id: 'presets-panel',
          label: 'Voice Presets',
          position: 'fullscreen',
          view: 'presets-panel',
        },
      ],
    },
  };
  const manifest = parsePluginManifest({
    ...base,
    runtime: { entry: 'runtime.js', apiVersion: 2 },
  });
  assert.deepEqual(manifest.permissions, ['storage:preferences']);
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        runtime: { entry: 'runtime.js', apiVersion: 1 },
      }),
    /apiVersion 2/,
  );
});

test('gates project graphs, project documents, shared covers and managed models behind runtime API 2', () => {
  const permissions = [
    'canvas:create-project-graph',
    'storage:project-documents',
    'storage:shared-style-covers',
    'models:use-text',
    'models:use-media',
    'audio:reference-library',
    'vision:pose',
    'vision:install',
  ];
  const base = {
    schemaVersion: 2,
    id: 'production-studio',
    name: 'Production Studio',
    version: '1.0.0',
    permissions,
    contributes: {
      panels: [
        {
          id: 'studio',
          label: 'Studio',
          position: 'fullscreen',
          view: 'studio',
        },
      ],
    },
  };
  const manifest = parsePluginManifest({
    ...base,
    runtime: { entry: 'runtime.js', apiVersion: 2 },
  });
  assert.deepEqual(manifest.permissions, permissions);

  for (const permission of permissions) {
    assert.throws(
      () =>
        parsePluginManifest({
          ...base,
          runtime: { entry: 'runtime.js', apiVersion: 1 },
          permissions: [permission],
        }),
      /apiVersion 2/,
    );
  }
});

test('accepts all six trusted adapters in one Qiansi-audio manifest', () => {
  const base = {
    schemaVersion: 2,
    id: 'qiansi-audio',
    name: 'Qiansi-audio',
    version: '1.0.0',
    runtime: { entry: 'runtime.js', apiVersion: 2 },
    permissions: ['audio:generate', 'audio:install'],
    contributes: {
      nodes: [
        {
          id: 'speech-node',
          label: 'VoxCPM2 语音',
          input: 'text',
          output: 'audio',
          renderer: 'sandbox',
          view: 'speech-node',
        },
      ],
      audioGenerators: [
        {
          id: 'voxcpm-local',
          label: 'VoxCPM2 宿主管理服务',
          protocol: 'qiansi-audio-v1',
          hostAdapter: 'voxcpm2',
          timeoutMs: 600000,
          maxBytes: 67108864,
        },
        {
          id: 'chattts-local',
          label: 'ChatTTS 宿主管理服务',
          protocol: 'qiansi-audio-v1',
          hostAdapter: 'chattts',
          timeoutMs: 600000,
          maxBytes: 67108864,
        },
        {
          id: 'qwen3-tts-local',
          label: 'Qwen3-TTS 宿主管理服务',
          protocol: 'qiansi-audio-v1',
          hostAdapter: 'qwen3tts',
          timeoutMs: 600000,
          maxBytes: 67108864,
        },
        {
          id: 'cosyvoice3-local',
          label: 'CosyVoice 3 宿主管理服务',
          protocol: 'qiansi-audio-v1',
          hostAdapter: 'cosyvoice3',
          timeoutMs: 600000,
          maxBytes: 67108864,
        },
        {
          id: 'woosh-local',
          label: 'Sony Woosh 宿主管理服务',
          protocol: 'qiansi-audio-v1',
          hostAdapter: 'woosh',
          timeoutMs: 600000,
          maxBytes: 67108864,
        },
        {
          id: 'acestep-xl-local',
          label: 'ACE-Step 1.5 XL Turbo / SFT 宿主管理服务',
          protocol: 'qiansi-audio-v1',
          hostAdapter: 'acestepXl',
          timeoutMs: 600000,
          maxBytes: 268435456,
        },
      ],
    },
  };
  const manifest = parsePluginManifest(base);
  assert.deepEqual(
    manifest.contributes.audioGenerators.map((generator) => generator.hostAdapter),
    ['voxcpm2', 'chattts', 'qwen3tts', 'cosyvoice3', 'woosh', 'acestepXl'],
  );
  assert.ok(manifest.permissions.includes('audio:install'));
  assert.ok(manifest.contributes.audioGenerators.every((generator) => !('endpoint' in generator)));
});

test('rejects unsafe or incomplete v2 audio generator declarations', () => {
  const base = {
    schemaVersion: 2,
    id: 'voxcpm-audio',
    name: 'VoxCPM Audio',
    version: '1.0.0',
    runtime: { entry: 'runtime.js', apiVersion: 2 },
    permissions: ['audio:generate'],
    contributes: {
      audioGenerators: [
        {
          id: 'voxcpm-local',
          label: 'VoxCPM2 本机服务',
          protocol: 'qiansi-audio-v1',
          endpoint: 'http://127.0.0.1:9880/generate',
          healthEndpoint: 'http://127.0.0.1:9880/health',
        },
      ],
    },
  };
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        contributes: {
          audioGenerators: [
            {
              ...base.contributes.audioGenerators[0],
              endpoint: 'http://localhost:9880/generate',
            },
          ],
        },
      }),
    /127\.0\.0\.1/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        contributes: {
          audioGenerators: [
            {
              ...base.contributes.audioGenerators[0],
              healthEndpoint: 'http://127.0.0.1:9881/health',
            },
          ],
        },
      }),
    /必须同源/,
  );
  assert.throws(() => parsePluginManifest({ ...base, permissions: [] }), /必须申请 audio:generate/);
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        permissions: ['audio:install'],
        contributes: { audioGenerators: [] },
      }),
    /audio:install 权限的插件必须声明音频生成器/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        runtime: { entry: 'runtime.js', apiVersion: 1 },
      }),
    /apiVersion 2/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        contributes: { audioGenerators: [] },
      }),
    /必须声明音频生成器/,
  );
});

test('accepts a data-only language pack and canonicalizes its locale', () => {
  const manifest = parsePluginManifest({
    schemaVersion: 2,
    id: 'english-uk-pack',
    name: 'English UK',
    version: '1.0.0',
    contributes: {
      locales: [
        { locale: 'en-gb', nativeName: 'English (UK)', file: 'en-GB.json', direction: 'ltr' },
      ],
    },
  });
  assert.deepEqual(manifest.contributes.locales, [
    { locale: 'en-GB', nativeName: 'English (UK)', file: 'en-GB.json', direction: 'ltr' },
  ]);
  assert.deepEqual(manifest.permissions, []);
});

test('rejects built-in overrides, duplicate locales and unsafe language files', () => {
  const base = {
    schemaVersion: 2,
    id: 'locale-pack',
    name: 'Locale Pack',
    version: '1.0.0',
  };
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        contributes: {
          locales: [{ locale: 'en-US', nativeName: 'Override', file: 'en.json' }],
        },
      }),
    /不能覆盖内置语言/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        contributes: {
          locales: [
            { locale: 'ja-JP', nativeName: '日本語', file: 'ja.json' },
            { locale: 'ja-jp', nativeName: '日本語', file: 'ja-2.json' },
          ],
        },
      }),
    /语言代码重复/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        ...base,
        contributes: {
          locales: [{ locale: 'ja-JP', nativeName: '日本語', file: '../ja.json' }],
        },
      }),
    /同目录 JSON/,
  );
});

test('rejects unsafe v2 permissions, paths and unresolved contributions', () => {
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 2,
        id: 'bad-runtime',
        name: 'Bad runtime',
        version: '1.0.0',
        runtime: { entry: '../steal.js', apiVersion: 1 },
        contributes: { nodes: [{ id: 'node', label: 'Node' }] },
      }),
    /运行时入口/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 2,
        id: 'bad-permission',
        name: 'Bad permission',
        version: '1.0.0',
        permissions: ['secrets:read'],
        contributes: { nodes: [{ id: 'node', label: 'Node' }] },
      }),
    /不支持的插件权限/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 2,
        id: 'bad-menu',
        name: 'Bad menu',
        version: '1.0.0',
        contributes: {
          nodes: [{ id: 'node', label: 'Node' }],
          menus: [
            {
              id: 'missing-node',
              label: 'Missing',
              location: 'canvas',
              action: { type: 'add-node', nodeId: 'other-node' },
            },
          ],
        },
      }),
    /不存在的节点/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 2,
        id: 'bad-presentation',
        name: 'Bad presentation',
        version: '1.0.0',
        runtime: { entry: 'runtime.js', apiVersion: 1 },
        contributes: {
          nodes: [
            {
              id: 'node',
              label: 'Node',
              renderer: 'sandbox',
              presentation: 'fullscreen-window',
              view: 'node',
            },
          ],
        },
      }),
    /呈现方式不受支持/,
  );
  assert.throws(
    () =>
      parsePluginManifest({
        schemaVersion: 2,
        id: 'unsafe-immersive-host',
        name: 'Unsafe immersive host',
        version: '1.0.0',
        contributes: {
          nodes: [
            {
              id: 'node',
              label: 'Node',
              presentation: 'immersive',
            },
          ],
        },
      }),
    /沉浸式呈现只能用于沙箱界面/,
  );
});

test('normalizes persisted enable states', () => {
  assert.deepEqual(normalizePluginState({ enabled: { 'holder-tools': false, '../bad': true } }), {
    schemaVersion: 1,
    enabled: { 'holder-tools': false },
  });
});

test('compares beta plugin engine requirements without dropping prerelease identifiers', () => {
  assert.equal(isPluginEngineCompatible('>=0.1.0-beta.1', '0.1.0-beta.1'), true);
  assert.equal(isPluginEngineCompatible('>=0.1.0-beta.2', '0.1.0-beta.1'), false);
  assert.equal(isPluginEngineCompatible('0.1.0-beta.1', '0.1.0-beta.1'), true);
  assert.equal(isPluginEngineCompatible('>=0.1', '0.1.0-beta.1'), false);
  assert.equal(isPluginEngineCompatible('^0.1.0', '0.1.0-beta.1'), false);
});
