import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

describe('Windows one-click installer', () => {
  it('bootstraps Node.js before installing locked project dependencies', () => {
    const installer = read('tools/launchers/qiansi-install.bat');
    expect(installer).toContain('set "QIANSI_ROOT=%%~fI\\"');
    expect(installer).toContain('cd /d "%QIANSI_ROOT%"');
    expect(installer.indexOf('call :ensureNodeRuntime')).toBeLessThan(
      installer.indexOf('npm.cmd ci --ignore-scripts --no-audit --no-fund'),
    );
    expect(installer).toContain('scripts\\install-portable-node.ps1');
    expect(installer).toContain('tools\\runtime\\node\\windows\\node.exe');
    expect(installer).toContain('tools\\cache\\npm');
    expect(installer).toContain('call :nodeRuntimeReady');
  });

  it('downloads a pinned official runtime and verifies its published SHA-256 before install', () => {
    const bootstrap = read('scripts/install-portable-node.ps1');
    expect(bootstrap).toContain("$NodeVersion = '22.23.2'");
    expect(bootstrap).toContain('https://nodejs.org/download/release/v$NodeVersion');
    expect(bootstrap).toContain('SHASUMS256.txt');
    expect(bootstrap).toContain('Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256');
    expect(bootstrap.indexOf('if ($ActualHash -ne $ExpectedHash)')).toBeLessThan(
      bootstrap.indexOf('Expand-Archive'),
    );
    expect(bootstrap).toContain("'X64' { $NodeArchitecture = 'x64' }");
    expect(bootstrap).toContain("'Arm64' { $NodeArchitecture = 'arm64' }");
  });

  it('uses the project-local runtime for the visual launch center and development mode', () => {
    const launcher = read('Qiansi-Canvas-windows.bat');
    expect(launcher).toContain('tools\\runtime\\node\\windows\\node.exe');
    expect(launcher).toContain('qiansi-launcher.mjs');
    expect(launcher).not.toMatch(/node_modules|npm(?:\.cmd)?|tsc|vite|run build/i);

    const development = read('tools/launchers/启动开发模式.bat');
    expect(development).toContain('set "QIANSI_ROOT=%%~fI\\"');
    expect(development).toContain('call :activatePortableNode');
    expect(development).toContain('tools\\runtime\\node\\windows\\node.exe');
  });

  it('provides a root-level standalone Motion Captur entry without starting Canvas', () => {
    const launcher = read('Qiansi-Motion-Captur-windows.bat');
    expect(launcher).toContain(
      'data\\plugins\\qiansi-motion-capture\\启动 Qiansi Motion Captur.bat',
    );
    expect(launcher).toContain('if not exist "%QIANSI_MOTION_LAUNCHER%"');
    expect(launcher).toContain('call "%QIANSI_MOTION_LAUNCHER%"');
    expect(launcher).not.toMatch(/qiansi-launcher|local-bridge|npm(?:\.cmd)?|vite/i);
  });

  it('routes the legacy production entry to the visual center without rebuilding', () => {
    const compatibility = read('tools/launchers/启动Qiansi-Canvas.bat');
    expect(compatibility).toContain('Qiansi-Canvas-windows.bat');
    expect(compatibility).not.toContain('npm.cmd run build');
    const center = read('qiansi-launcher.mjs');
    expect(center).toContain("join(installRoot, 'dist', 'index.html')");
    expect(center).toContain('打开无限画布');
  });

  it('stops after any non-zero npm exit code, including Windows negative native-file errors', () => {
    const installer = read('tools/launchers/qiansi-install.bat');
    expect(installer.indexOf('call :ensureCanvasStopped')).toBeLessThan(
      installer.indexOf('npm.cmd ci --ignore-scripts --no-audit --no-fund'),
    );
    expect(installer).toContain(':2895 .*LISTENING');
    expect(installer).toContain(':2896 .*LISTENING');
    expect(installer).toContain('set "DEPENDENCY_EXIT_CODE=%errorlevel%"');
    expect(installer).toContain(
      'if not "%DEPENDENCY_EXIT_CODE%"=="0" goto :dependencyInstallFailed',
    );
    expect(installer).toContain('set "BUILD_EXIT_CODE=%errorlevel%"');
    expect(installer).toContain('if not "%BUILD_EXIT_CODE%"=="0" goto :buildFailed');
    expect(installer).toContain('EPERM');
    expect(installer).toContain('Close every running Qiansi-Canvas');
  });

  it('provides a non-interactive repair mode for the launch center', () => {
    const installer = read('tools/launchers/qiansi-install.bat');
    const wrapper = read('tools/launchers/安装Qiansi-Canvas.bat');
    const center = read('qiansi-launcher.mjs');
    expect(wrapper).toContain('call "%~dp0qiansi-install.bat" %*');
    expect(installer).toContain('if /I "%~1"=="--repair" set "QIANSI_REPAIR_MODE=1"');
    expect(installer).toContain('if defined QIANSI_REPAIR_MODE goto :repairDone');
    expect(installer).toContain('if defined QIANSI_REPAIR_MODE exit /b 1');
    expect(installer).toContain(':repairDone');
    expect(center).toContain("isApplicationInstall ? ['--repair'] : [cliTarget]");
    expect(center).toContain('return { completed: true }');
  });

  it('installs the official Volcengine Ark CLI first and keeps login separate', () => {
    const installer = read('tools/launchers/qiansi-install.bat');
    expect(installer).toContain('if /I "%~1"=="--volcengine" goto :installVolcengine');
    expect(installer).toContain('if /I "%~1"=="--arkcli" goto :installVolcengine');
    expect(installer.indexOf('[1] 山火 CLI（火山方舟官方 Ark CLI）')).toBeLessThan(
      installer.indexOf('[2] Install or update OpenAI Codex CLI'),
    );
    expect(installer).toContain('npm.cmd install --global @volcengine/ark-cli@latest');
    expect(installer).toContain('where.exe arkcli.cmd 2^>nul');
    expect(installer).toContain('where.exe arkcli.exe 2^>nul');
    expect(installer).toContain('npm.cmd prefix --global 2^>nul');
    expect(installer).toContain('call "%QIANSI_VOLCENGINE_CMD%" --version');
    expect(installer).toContain('arkcli auth login volc-sso');
    expect(installer).toContain('arkcli auth status');

    const verification = installer.match(
      /\r\n:verifyVolcengine\r\n([\s\S]*?)\r\n:resolveVolcengineCommand\r\n/,
    )?.[1];
    expect(verification).toBeDefined();
    expect(verification).toContain('call "%QIANSI_VOLCENGINE_CMD%" --version');
    expect(verification).not.toMatch(/GetCallerIdentity|\blogin\b/i);
    expect(installer).not.toContain(':installArk');

    const installAll = installer.match(/\r\n:installAll\r\n([\s\S]*?)\r\n:afterCli\r\n/)?.[1];
    expect(installAll).toBeDefined();
    expect(installAll?.indexOf('call :installVolcengineTool')).toBeLessThan(
      installAll?.indexOf('@openai/codex@latest') ?? -1,
    );
  });

  it('documents automatic installation and its safe failure behavior', () => {
    const guide = read('安装与启动指南.md');
    expect(guide).toContain('自动下载并校验项目专用 Node.js');
    expect(guide).toContain('SHASUMS256.txt');
    expect(guide).toContain('tools/runtime/node/windows/');
    expect(guide).toContain('tools/cache/npm/');
    expect(guide).toContain('不要删除整个 `data/`');
    expect(read('README.md')).toContain('无需单独配置系统 PATH');
    expect(read('README.md')).toContain('Qiansi-Canvas-windows.bat');
  });
});
