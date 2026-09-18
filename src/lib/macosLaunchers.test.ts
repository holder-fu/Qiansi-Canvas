import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

describe('macOS launch packages', () => {
  it('keeps Windows batch launchers on CRLF line endings', () => {
    for (const name of [
      'Qiansi-Canvas-windows.bat',
      'Qiansi-Motion-Captur-windows.bat',
      'tools/launchers/qiansi-install.bat',
      'tools/launchers/安装Qiansi-Canvas.bat',
      'tools/launchers/启动Qiansi-Canvas.bat',
      'tools/launchers/启动开发模式.bat',
      'tools/launchers/安装CLI工具-Windows.bat',
      'tools/launchers/安装CLI工具.bat',
    ]) {
      const source = read(name);
      expect(source).toContain('\r\n');
      expect(source).not.toMatch(/(?<!\r)\n/);
    }
  });

  it('provides LF-only zsh command files with platform-labelled names', () => {
    for (const name of [
      'Qiansi-Canvas-macOS.command',
      'tools/launchers/安装Qiansi-Canvas-macOS.command',
      'tools/launchers/打开Qiansi-Canvas-macOS.command',
      'tools/launchers/启动Qiansi-Canvas-macOS.command',
      'tools/launchers/安装CLI工具-macOS.command',
    ]) {
      const source = read(name);
      expect(source.startsWith('#!/bin/zsh\n')).toBe(true);
      expect(source).not.toContain('\r\n');
      expect(source).not.toMatch(/npm\.cmd|\.exe|%APPDATA%|%ProgramFiles%/);
    }
  });

  it('keeps source installation but routes ordinary use through the same visual launch center', () => {
    const install = read('tools/launchers/安装Qiansi-Canvas-macOS.command');
    const start = read('Qiansi-Canvas-macOS.command');
    const compatibility = read('tools/launchers/打开Qiansi-Canvas-macOS.command');
    expect(install).toContain('npm ci --ignore-scripts --no-audit --no-fund');
    expect(install).toContain('npm run build');
    expect(install).toContain('scripts/install-portable-node-macos.zsh');
    expect(install).toContain('tools/cache/npm');
    expect(install).toContain('22.12.0');
    expect(install).toContain('PROJECT_ROOT="${SCRIPT_DIR:h:h}"');
    expect(start).toContain('22.12.0');
    expect(read('tools/launchers/qiansi-install.bat')).toContain('22.12.0');
    expect(read('Qiansi-Canvas-windows.bat')).toContain('22.12.0');
    expect(start).toContain('qiansi-launcher.mjs');
    expect(start).toContain('tools/runtime/node/macos/bin/node');
    expect(start).toContain('PROJECT_ROOT="$SCRIPT_DIR"');
    expect(start).not.toContain('npm run build');
    expect(start).not.toContain('node_modules');
    expect(compatibility).toContain('${SCRIPT_DIR:h:h}/Qiansi-Canvas-macOS.command');
    expect(read('tools/launchers/启动Qiansi-Canvas-macOS.command')).toContain(
      'Qiansi-Canvas-macOS.command',
    );
    expect(install).toContain('if [[ "${1:-}" == "--repair" ]]');
    expect(install).toContain('if (( REPAIR_MODE )); then');
    expect(install).toContain('启动中心修复已成功完成。');
    const releaseBuilder = read('scripts/build-portable-release.mjs');
    expect(releaseBuilder).toContain("'Qiansi-Canvas-macOS.command'");
  });

  it('downloads and verifies an architecture-matched project-local Node runtime on macOS', () => {
    const bootstrap = read('scripts/install-portable-node-macos.zsh');
    expect(bootstrap).toContain("NODE_VERSION='22.23.2'");
    expect(bootstrap).toContain('https://nodejs.org/download/release/v${NODE_VERSION}');
    expect(bootstrap).toContain('SHASUMS256.txt');
    expect(bootstrap).toContain("arm64) NODE_ARCH='arm64'");
    expect(bootstrap).toContain("x86_64) NODE_ARCH='x64'");
    expect(bootstrap.indexOf('shasum -a 256')).toBeLessThan(bootstrap.indexOf('tar -xzf'));
    expect(bootstrap).toContain('tools/runtime/node/macos');
  });

  it('uses official macOS-capable CLI installers and verifies Ark CLI before login', () => {
    const cli = read('tools/launchers/安装CLI工具-macOS.command');
    expect(cli).toContain('https://antigravity.google/cli/install.sh');
    expect(cli).toContain('https://jimeng.jianying.com/cli');
    expect(cli).toContain('@openai/codex@latest');
    expect(cli).toContain('@volcengine/ark-cli@latest');
    expect(cli).toContain('@google/gemini-cli@latest');
    expect(cli).toContain('@tencent-ai/codebuddy-code@latest');
    expect(cli).toContain('bailian-cli');
    expect(cli).toContain('tools/runtime/node/macos/bin/node');
    expect(cli).toContain('tools/cache/npm');
    expect(cli).toContain('--codex) install_codex');
    expect(cli).toContain('--arkcli|--volcengine) install_volcengine');
    expect(cli).toContain('--gemini) install_gemini');
    expect(cli).toContain('arkcli --version');
    expect(cli).toContain('arkcli auth login volc-sso');
    expect(cli).toContain('arkcli auth status');
    expect(cli).toContain('mktemp "${TMPDIR:-/tmp}/qiansi-antigravity.XXXXXX"');
    expect(cli).toContain('mktemp "${TMPDIR:-/tmp}/qiansi-dreamina.XXXXXX"');
    expect(cli).not.toMatch(/mktemp[^\n]*XXXXXX\.(?:sh|cmd)/);
    expect(cli.indexOf('[1] 山火 CLI（火山方舟官方 Ark CLI）')).toBeLessThan(
      cli.indexOf('[2] 安装或更新 OpenAI Codex CLI'),
    );
    const verification = cli.match(/\nverify_volcengine\(\) \{\n([\s\S]*?)\n\}/)?.[1];
    expect(verification).toBeDefined();
    expect(verification).toContain('arkcli --version');
    expect(verification).not.toMatch(/auth status|\blogin\b/i);
    expect(cli).not.toContain('install_ark');
    const installAll = cli.match(/\ninstall_all\(\) \{\n([\s\S]*?)\n\}/)?.[1];
    expect(installAll).toBeDefined();
    expect(installAll?.indexOf('install_volcengine')).toBeLessThan(
      installAll?.indexOf('install_codex') ?? -1,
    );
    const antigravity = cli.match(/\ninstall_antigravity\(\) \{\n([\s\S]*?)\n\}/)?.[1];
    const dreamina = cli.match(/\ninstall_dreamina\(\) \{\n([\s\S]*?)\n\}/)?.[1];
    expect(antigravity).toContain('return 0');
    expect(dreamina).toContain('return 0');
    expect(antigravity).toContain('尚未安装');
    expect(dreamina).toContain('尚未安装');
    expect(cli).not.toMatch(/curl[^\n]*\|[^\n]*(?:bash|sh)/);
    expect(cli).not.toMatch(/(?:bash|sh)\s+"\$installer"/);
    const windows = read('tools/launchers/qiansi-install.bat');
    expect(windows).toContain('if /I "%~1"=="--codex" goto :installCodex');
    expect(windows).toContain('if /I "%~1"=="--gemini" goto :installGemini');
    expect(windows).not.toMatch(/curl[^\r\n]*\|[^\r\n]*(?:bash|sh)/i);
    expect(windows).not.toMatch(/call\s+"%QIANSI_(?:AGY|DREAMINA)_INSTALLER%"/i);
  });

  it('keeps an explicitly labelled Windows CLI entry', () => {
    expect(read('tools/launchers/安装CLI工具-Windows.bat')).toContain('qiansi-install.bat" --cli');
    expect(read('tools/launchers/安装CLI工具.bat')).toContain('安装CLI工具-Windows.bat');
  });

  it('documents the complete cross-platform installation flow from the repository root', () => {
    const guide = read('安装与启动指南.md');
    expect(guide).toContain('## 3. Windows 安装流程');
    expect(guide).toContain('## 4. macOS 安装流程');
    expect(guide).toContain('## 5. Linux 安装流程');
    expect(guide).toContain('安装Qiansi-Canvas.bat');
    expect(guide).toContain('安装Qiansi-Canvas-macOS.command');
    expect(guide).toContain('Qiansi-Canvas-windows.bat');
    expect(guide).toContain("export QIANSI_CANVAS_HOST='127.0.0.1'");
    expect(guide).toContain('export QIANSI_CANVAS_LAN=1');
    expect(guide).toContain('http://127.0.0.1:2895');
    expect(read('README.md')).toContain('./安装与启动指南.md');
    expect(read('README.md')).toContain('Node.js 22.12.0');
    expect(read('tools/launchers/qiansi-install.bat')).not.toContain('Use start.bat');
  });
});
