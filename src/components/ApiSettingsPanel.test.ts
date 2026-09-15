import { describe, expect, it } from 'vitest';
import apiDeepPacksSource from '../i18n/apiDeepPacks.ts?raw';
import source from './ApiSettingsPanel.tsx?raw';

describe('API settings provider creation', () => {
  it('keeps generic provider creation on text and image pages and gives CLI a remote ComfyUI action', () => {
    expect(source).toContain("if (activeCategory === 'cli') return;");
    expect(source).toContain("activeCategory === 'text' || activeCategory === 'image'");
    expect(source).not.toContain(
      "activeCategory === 'text' ||\n                activeCategory === 'image' ||\n                activeCategory === 'cli'",
    );
    expect(source).not.toContain("protocol: isCli ? 'cli' : 'openai'");
    expect(source).toContain('const addRemoteComfyUi = () => {');
    expect(source).toContain("activeCategory === 'cli' && (");
    expect(source).toContain("'apiSettings.comfy.addRemoteConnection'");
    expect(apiDeepPacksSource.match(/'apiSettings\.comfy\.addRemoteConnection'/g)).toHaveLength(2);
  });

  it('does not expose a non-functional bridge token for local CLI providers', () => {
    expect(source).not.toContain("t('apiSettings.cli.bridgeToken', '桥接令牌（可选）')");
  });

  it('revokes historical API availability when an explicit recheck fails', () => {
    const manualFailureGuards = source.match(/lastVerifiedAt: undefined,/g) ?? [];
    expect(manualFailureGuards.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain('lastVerifiedAt: provider.verifiedAt ?? provider.lastVerifiedAt,');
  });

  it('hides managed text CLI models while the CLI is disconnected', () => {
    expect(source).toContain(
      '(isCodex || isVolcengineCli || isWorkBuddy || isGemini) && !connected',
    );
    const codexDetection = source.slice(
      source.indexOf("if (p.protocol === 'codex')"),
      source.indexOf("} else if (p.protocol === 'codebuddy')"),
    );
    expect(codexDetection).toContain('if (!ready)');
    expect(codexDetection).toContain(
      'detectedModels = { chat: [], image: [], video: [], audio: [] };',
    );
    expect(codexDetection).toContain('detectedCapabilities = {};');
  });

  it('maps Volcengine CLI to arkcli and refuses to publish session model metadata', () => {
    expect(source).toMatch(/p\.protocol === 'volcengine-cli'\s*\? 'arkcli'/);
    const volcengineDetection = source.slice(
      source.indexOf("} else if (p.protocol === 'volcengine-cli')"),
      source.indexOf("} else if (p.protocol === 'codebuddy')"),
    );
    expect(volcengineDetection).toContain(
      'detectedModels = { chat: [], image: [], video: [], audio: [] };',
    );
    expect(volcengineDetection).toContain('detectedCapabilities = {};');
    expect(volcengineDetection).not.toContain('session.models');
    expect(volcengineDetection).not.toContain('ark:');
    expect(source).toContain("p.protocol === 'volcengine-cli' ||");
  });

  it('keeps Volcengine CLI management-only and prevents editing every model kind', () => {
    const cliDetail = source.slice(source.indexOf('function CliDetail'));
    expect(cliDetail).toContain("const isVolcengineCli = provider.protocol === 'volcengine-cli';");
    expect(cliDetail).toContain(
      "const unsupported =\n            kind === 'audio' ||\n            isVolcengineCli ||",
    );
    expect(cliDetail).toContain(
      "isGemini ? 'agy' : isVolcengineCli ? 'arkcli' : provider.protocol",
    );
    expect(cliDetail.match(/!isVolcengineCli/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(cliDetail).toContain('官方 Ark CLI 已接入安装与检测，当前尚不提供画布生成模型。');
  });

  it('provides dedicated bilingual Volcengine CLI guidance', () => {
    expect(source).toContain("'apiSettings.cli.description.volcengine'");
    expect(apiDeepPacksSource.match(/'apiSettings\.cli\.description\.volcengine'/g)).toHaveLength(
      2,
    );
    expect(apiDeepPacksSource).toContain('检测火山方舟官方 Ark CLI（arkcli）的安装与登录状态');
    expect(apiDeepPacksSource).toContain('当前尚未接入画布生成适配器');
    expect(apiDeepPacksSource).toContain('Detect the official Volcengine Ark CLI (arkcli)');
    expect(apiDeepPacksSource).not.toContain('apiSettings.cli.description.ark');
  });

  it('shows a fourth audio model group without claiming that discovery is an audio adapter', () => {
    expect(source).toContain("(['chat', 'image', 'video', 'audio'] as ProviderModelKind[])");
    expect(source).toContain("t('apiSettings.modelKind.audio', '音乐 / 音频生成模型')");
    expect(source).toContain("'apiSettings.audioModelAdapterNotice'");
    expect(apiDeepPacksSource.match(/'apiSettings\.audioModelAdapterNotice'/g)).toHaveLength(2);
    expect(apiDeepPacksSource).toContain('只有实现对应厂商的音频请求适配器后');
  });

  it('detects built-in CLIs through the current page Bridge, not a restored provider URL', () => {
    expect(source).toContain('const bridgeBase = BRIDGE_BASE_URL;');
    expect(source).not.toContain(
      "const bridgeBase = p.baseUrl.replace(/\\/v1\\/?$/, '').replace(/\\/$/, '');",
    );
    expect(source).not.toContain(
      "const bridgeBase = provider.baseUrl.replace(/\\/v1\\/?$/, '').replace(/\\/$/, '');",
    );
  });

  it('describes browser encryption without claiming OS-level vault isolation', () => {
    const honestNotice = '浏览器本地加密，避免项目配置明文；同源脚本/浏览器配置读取者仍可访问';
    expect(source.match(new RegExp(honestNotice, 'g'))).toHaveLength(3);
    expect(source).not.toContain('保存至本机保险箱');
  });

  it('keeps only the bottom setup-help entry in the CLI detail', () => {
    const cliDetail = source.slice(source.indexOf('function CliDetail'));
    expect(cliDetail.match(/apiSettings\.setupHelp/g)).toHaveLength(1);
    expect(cliDetail).not.toContain('apiSettings.cli.loginHelp');
    expect(cliDetail).not.toContain('apiSettings.cli.installGuide');
  });

  it('keeps long CLI command paths inside the installation-status card', () => {
    const cliDetail = source.slice(source.indexOf('function CliDetail'));
    expect(
      cliDetail.match(/<article className="min-w-0 rounded-lg bg-black\/25 p-2\.5">/g),
    ).toHaveLength(3);
    expect(cliDetail).toContain(
      '<span className="mt-0.5 block break-all text-[10px] text-white/35">',
    );
  });
});
