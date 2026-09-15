import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LAUNCHER_ENTRY = fileURLToPath(import.meta.url);
const DEFAULT_INSTALL_ROOT = dirname(LAUNCHER_ENTRY);
const MINIMUM_NODE_VERSION = '22.12.0';
const DEFAULT_BRIDGE_PORT = 2895;
const STATUS_REFRESH_MS = 2_000;
const MANUAL_LAUNCHER_CATALOG = {
  win32: [
    { id: 'install-app', filename: '安装Qiansi-Canvas.bat' },
    { id: 'install-cli', filename: '安装CLI工具-Windows.bat' },
    { id: 'start-development', filename: '启动开发模式.bat' },
    { id: 'start-canvas', filename: '启动Qiansi-Canvas.bat' },
  ],
  darwin: [
    { id: 'install-app', filename: '安装Qiansi-Canvas-macOS.command' },
    { id: 'install-cli', filename: '安装CLI工具-macOS.command' },
    { id: 'open-canvas', filename: '打开Qiansi-Canvas-macOS.command' },
    { id: 'start-canvas', filename: '启动Qiansi-Canvas-macOS.command' },
  ],
};
const LAUNCH_CENTER_MESSAGES = {
  'zh-CN': {
    languageName: '简体中文',
    pageTitle: 'Qiansi-Canvas 启动中心',
    subtitle: '检查运行环境，然后一键进入无限画布',
    languageLabel: '页面语言',
    coreTitle: '画布核心',
    optionalTitle: '可选创作能力',
    loading: '正在检查…',
    optionalNote: '可选项目未安装不会阻止打开无限画布，需要对应功能时再配置即可。',
    checking: '正在检查本机环境…',
    manualInstall: '手动安装',
    manualInstallTitle: '手动安装',
    manualInstallDescription: '选择需要的工具，脚本会在新的终端窗口中启动。',
    manualInstallRun: '运行',
    manualInstallClose: '关闭',
    manualInstallEmpty: '当前系统没有可运行的安装工具。',
    manualInstallStarting: '正在启动 {filename}…',
    manualInstallStarted: '已启动 {filename}，请在新窗口中继续。',
    manualInstallFailed: '无法启动安装工具',
    manualInstallActions: {
      'install-app': '安装项目依赖并构建无限画布页面。',
      'install-cli': '打开 AI CLI 工具安装菜单。',
      'start-development': '启动 Vite 与开发 Bridge。',
      'start-canvas': '使用源码辅助入口启动 Qiansi-Canvas。',
      'open-canvas': '打开 Qiansi-Canvas 启动中心。',
    },
    openCanvas: '打开无限画布',
    enterCanvas: '进入无限画布',
    starting: '正在启动…',
    statusReady: '正常',
    statusBlocked: '需要处理',
    statusOptional: '未安装',
    checkFailed: '环境检查失败',
    readyRunning: '无限画布已经运行，可以直接进入。',
    readyStopped: '画布核心已就绪。',
    coreBlocked: '请先处理“画布核心”中的问题。',
    waitingBridge: '正在等待本机 Bridge 就绪…',
    canvasTarget: '无限画布地址：{canvasUrl}',
    enteringCanvas: '正在进入无限画布：{canvasUrl}',
    startFailed: '启动失败',
    descriptionTitle: '功能说明',
    guideTitle: '安装与使用帮助',
    solutionTitle: '解决办法',
    solutionFallback: '展开检查详情，按提示修复后重新检查。',
    actionInstall: '一键安装 / 修复',
    actionRepair: '重新安装 / 修复',
    actionRecheck: '立即重新检查',
    actionRechecking: '正在重新检查…',
    actionDownload: '打开官方下载页',
    actionStarting: '正在启动处理程序…',
    actionRepairing: '正在安装 / 修复，请不要关闭启动中心…',
    actionStarted: '处理程序已启动，请按新窗口中的提示完成操作。',
    actionCompleted: '安装 / 修复已完成，正在重新检查…',
    actionFailed: '处理失败',
    solutions: {
      runtime:
        '源码目录可用一键修复准备项目专用 Node.js；绿色包缺失运行环境时，请重新下载与 Mac/Windows 架构匹配的完整包。',
      package: '程序文件不完整。请重新获取完整源码或绿色包，不要只复制部分文件。',
      bridge: '缺少本机 Bridge 主程序。请重新获取完整程序目录，保留 data 后再替换程序文件。',
      web: '源码目录可用一键修复重新安装依赖并生成页面；绿色包请重新下载完整包。',
      integrity: '绿色包文件已缺失或被改变。请重新下载完整包，不要混用不同版本的程序文件。',
      storage: '确认程序目录或自定义 data 目录可写，并检查磁盘空间、安全软件拦截和文件夹权限。',
      port: '该端口也可能是已启动的 Qiansi-Canvas。请先在浏览器打开 {canvasUrl}；若无法进入画布，再关闭占用 {bridgePort} 端口的旧 Qiansi-Canvas 或其它程序并重新检查。',
      ffmpeg: '从 FFmpeg 官方推荐来源下载当前系统版本，并按 tools/README.md 放置 ffmpeg 文件。',
      ffprobe: 'FFprobe 通常随 FFmpeg 一起提供；按 tools/README.md 将它放入 tools 目录。',
      codex: '安装 Codex CLI 后按新窗口提示登录，再返回启动中心重新检查。',
      gemini: '安装 Gemini CLI 后在终端运行 gemini 完成登录，再返回启动中心重新检查。',
    },
    descriptions: {
      runtime: '为 Qiansi-Canvas 提供运行 Bridge 和本机服务所需的 Node.js 环境。',
      package: '识别当前 Qiansi-Canvas 程序版本，用于诊断、更新与兼容性判断。',
      bridge: '在本机提供项目保存、素材管理、AI 和可选工具等受管能力。',
      web: '提供浏览器中的无限画布界面及其交互功能。',
      integrity: '确认绿色运行包的必需文件完整且未被意外更改；源码目录则标记为开发运行方式。',
      storage: '检查本机数据目录是否可写，画布项目、素材与设置会保存在这里。',
      port: '检查 Bridge 使用的本机端口 {bridgePort}，确保启动中心能连接或启动无限画布。',
      ffmpeg: '为视频转码、剪辑、帧提取和其它本机视频处理功能提供支持。',
      ffprobe: '读取音视频的时长、编码、尺寸等信息，用于媒体校验与处理。',
      codex: '连接 Codex CLI，为画布提供可选的本机 AI 命令行能力。',
      gemini: '连接 Gemini CLI，为画布提供可选的本机 AI 命令行能力。',
    },
    guides: {
      runtime:
        '普通用户无需单独安装，绿色包已内置对应系统架构的 Node.js。源码开发者在 Windows 运行 tools/launchers/安装Qiansi-Canvas.bat，macOS 运行 tools/launchers/安装Qiansi-Canvas-macOS.command；也可手动安装 Node.js {minimumNodeVersion} 或更高版本。显示“正常”即可继续，更换电脑时需重新下载匹配 x64/ARM64 的完整绿色包。',
      package:
        '版本信息随完整程序提供，不需单独安装。更新或重装时先停止启动窗口，保留 data 中需要的项目和素材，再用同平台的完整程序文件替换；请在反馈问题时附上此处显示的版本号。',
      bridge:
        'Bridge 已包含在完整绿色包或源码中，不单独安装。使用包根目录的 Qiansi-Canvas-windows.bat 或 Qiansi-Canvas-macOS.command 启动，使用期间保留启动窗口；关闭窗口或按 Ctrl+C 会停止项目保存、素材和本机服务。',
      web: '绿色包已内置预构建的 dist 页面，普通用户无需构建。源码开发者运行对应安装器，或在项目根目录执行 npm ci 后执行 npm run build。页面空白时先确认启动窗口仍在运行，再强制刷新并优先使用最新版 Chrome 或 Edge。',
      integrity:
        '该检查无需单独安装。普通用户应完整解压与电脑架构匹配的绿色包，不要在 ZIP 预览中运行，也不要混用不同版本的文件。“源码运行目录”是开发环境的正常提示；绿色包校验失败时请重新获取完整包。',
      storage:
        '首次启动会自动准备 data 目录，不需额外安装。请把程序完整解压到当前用户可读写的本地磁盘，不要放在只读目录、ZIP 内部或不稳定网盘。当前数据位置是 {dataRoot}；更新、移动或卸载前先确认其中的项目和素材是否需要保留。',
      port: '端口不需安装，根目录启动入口会自动使用 {bridgePort}。画布地址为 {canvasUrl}；如果该地址已能打开画布，不要重复启动。如果无法打开，请关闭旧的 Qiansi-Canvas、开发模式或占用端口的其它程序；不要把该端口直接暴露到公网。',
      ffmpeg:
        '安装时从 FFmpeg 官方下载页选择当前系统的可信构建；Windows 可下载 essentials ZIP，解压后将 ffmpeg.exe 放入项目 tools 目录。重新打开启动中心完成检测。它用于预览、帧提取、转码和本地导出；使用的第三方构建应保留其许可说明。',
      ffprobe:
        'FFprobe 通常与 FFmpeg 在同一个下载包中；Windows 将 ffprobe.exe 与 ffmpeg.exe 一起放入项目 tools 目录，然后重新启动检测。它主要读取时长、编码和尺寸等媒体信息；如果 FFmpeg 正常而此项缺失，请检查是否只复制了单个可执行文件。',
      codex:
        'Windows 运行 tools/launchers/安装CLI工具-Windows.bat，macOS 运行 tools/launchers/安装CLI工具-macOS.command，按菜单安装 Codex；Linux 可执行 npm install -g @openai/codex@latest。安装后重新打开终端，按 Codex 官方流程登录并先确认 codex 版本命令可用，再重新启动 Qiansi-Canvas。CLI 为可选功能，未安装不影响打开画布。',
      gemini:
        'Windows 运行 tools/launchers/安装CLI工具-Windows.bat，macOS 运行 tools/launchers/安装CLI工具-macOS.command，按菜单安装 Gemini；Linux 可执行 npm install -g @google/gemini-cli@latest。安装后重新打开终端，运行 gemini 完成登录并确认命令可用，再重新启动 Qiansi-Canvas。CLI 为可选功能，未安装不影响打开画布。',
    },
    checks: {
      runtime: {
        label: '绿色运行环境',
        ready: 'Node.js {nodeVersion}',
        blocked: '需要 Node.js {minimumNodeVersion} 或更高版本',
      },
      package: {
        label: '程序版本信息',
        ready: '版本 {appVersion}',
        blocked: '缺少 package.json',
      },
      bridge: { label: '本机 Bridge', ready: '已就绪', blocked: '缺少 local-bridge.mjs' },
      web: { label: '无限画布页面', ready: '已就绪', blocked: '缺少 dist/index.html' },
      integrity: {
        label: '绿色包完整性',
        source: '源码运行目录',
        portable: '绿色运行包 {appVersion} · {target}',
        blocked: '完整性检查失败：{detail}',
      },
      storage: {
        label: '本机数据目录',
        ready: '可正常保存画布与素材',
        blocked: '不可写入：{dataRoot}',
      },
      port: {
        label: '本机端口 {bridgePort}',
        running: 'Qiansi-Canvas 已经在运行',
        ready: '可用',
        blocked: '端口已占用；程序可能已经启动',
      },
      ffmpeg: {
        label: 'FFmpeg 视频处理',
        ready: '已安装',
        optional: '未安装；不影响打开画布，但部分视频功能不可用',
      },
      ffprobe: {
        label: 'FFprobe 媒体检测',
        ready: '已安装',
        optional: '未安装；不影响打开画布，但媒体校验能力受限',
      },
      codex: { label: 'Codex CLI', ready: '已安装', optional: '可选 AI 命令行工具' },
      gemini: { label: 'Gemini CLI', ready: '已安装', optional: '可选 AI 命令行工具' },
    },
  },
  en: {
    languageName: 'English',
    pageTitle: 'Qiansi-Canvas Launch Center',
    subtitle: 'Check the runtime, then open the infinite canvas in one click',
    languageLabel: 'Page language',
    coreTitle: 'Canvas Core',
    optionalTitle: 'Optional Creative Tools',
    loading: 'Checking…',
    optionalNote:
      'Missing optional tools will not prevent the canvas from opening. Configure them only when needed.',
    checking: 'Checking this computer…',
    manualInstall: 'Manual install',
    manualInstallTitle: 'Manual install',
    manualInstallDescription: 'Choose a tool. Its script will start in a new terminal window.',
    manualInstallRun: 'Run',
    manualInstallClose: 'Close',
    manualInstallEmpty: 'No installation tools are available for this system.',
    manualInstallStarting: 'Starting {filename}…',
    manualInstallStarted: '{filename} started. Continue in the new window.',
    manualInstallFailed: 'Could not start the installation tool',
    manualInstallActions: {
      'install-app': 'Install project dependencies and build the Infinite Canvas page.',
      'install-cli': 'Open the AI CLI installation menu.',
      'start-development': 'Start Vite and the development Bridge.',
      'start-canvas': 'Start Qiansi-Canvas through the source helper.',
      'open-canvas': 'Open the Qiansi-Canvas launch center.',
    },
    openCanvas: 'Open Infinite Canvas',
    enterCanvas: 'Enter Infinite Canvas',
    starting: 'Starting…',
    statusReady: 'Ready',
    statusBlocked: 'Action required',
    statusOptional: 'Not installed',
    checkFailed: 'Environment check failed',
    readyRunning: 'The infinite canvas is already running and ready to enter.',
    readyStopped: 'The canvas core is ready.',
    coreBlocked: 'Resolve the issues under “Canvas Core” first.',
    waitingBridge: 'Waiting for the local Bridge…',
    canvasTarget: 'Infinite Canvas address: {canvasUrl}',
    enteringCanvas: 'Opening Infinite Canvas: {canvasUrl}',
    startFailed: 'Failed to start',
    descriptionTitle: 'What it does',
    guideTitle: 'Installation and usage help',
    solutionTitle: 'How to fix it',
    solutionFallback: 'Expand the diagnostic, follow the steps, then check again.',
    actionInstall: 'Install / repair',
    actionRepair: 'Reinstall / repair',
    actionRecheck: 'Check again now',
    actionRechecking: 'Checking again…',
    actionDownload: 'Open official download',
    actionStarting: 'Starting the helper…',
    actionRepairing: 'Installing / repairing. Keep the launch center open…',
    actionStarted: 'The helper has started. Complete the steps in the new window.',
    actionCompleted: 'Installation / repair completed. Checking again…',
    actionFailed: 'The action failed',
    solutions: {
      runtime:
        'In a source tree, use Install / repair to prepare the project Node.js runtime. For a portable package, download the complete package for this Mac or Windows architecture again.',
      package:
        'Program files are incomplete. Download the complete source tree or portable package instead of copying only part of it.',
      bridge:
        'The local Bridge program is missing. Keep data, then replace the program files with a complete package.',
      web: 'In a source tree, Install / repair reinstalls dependencies and builds the page. For a portable package, download the complete package again.',
      integrity:
        'Portable-package files are missing or changed. Download a complete package and do not mix program files from different versions.',
      storage:
        'Make sure the program or custom data directory is writable, then check disk space, security software, and folder permissions.',
      port: 'Qiansi-Canvas may already be running on this port. First open {canvasUrl} in your browser. If the canvas does not open, close the old Qiansi-Canvas instance or other program using port {bridgePort}, then check again.',
      ffmpeg:
        'Download the correct build from an FFmpeg-recommended source and place ffmpeg as described in tools/README.md.',
      ffprobe:
        'FFprobe normally ships with FFmpeg. Place it in tools as described in tools/README.md.',
      codex: 'Install the Codex CLI, sign in in the new window, then return here and check again.',
      gemini:
        'Install the Gemini CLI, run gemini in a terminal to sign in, then return here and check again.',
    },
    descriptions: {
      runtime:
        'Provides the Node.js environment used by Qiansi-Canvas, its Bridge, and local services.',
      package:
        'Identifies the current Qiansi-Canvas version for diagnostics, updates, and compatibility checks.',
      bridge:
        'Runs managed local capabilities such as project storage, media, AI, and optional tools.',
      web: 'Provides the infinite-canvas interface and its browser interactions.',
      integrity:
        'Checks that required portable-package files are complete and unchanged; source trees are identified as development runtimes.',
      storage:
        'Checks that the local data directory can store canvas projects, media, and settings.',
      port: 'Checks local Bridge port {bridgePort} so the launch center can connect to or start the infinite canvas.',
      ffmpeg:
        'Supports local video transcoding, editing, frame extraction, and related video processing.',
      ffprobe:
        'Reads duration, codecs, dimensions, and other media metadata for validation and processing.',
      codex: 'Connects Codex CLI as an optional local AI command-line capability for the canvas.',
      gemini: 'Connects Gemini CLI as an optional local AI command-line capability for the canvas.',
    },
    checks: {
      runtime: {
        label: 'Bundled Runtime',
        ready: 'Node.js {nodeVersion}',
        blocked: 'Node.js {minimumNodeVersion} or later is required',
      },
      package: {
        label: 'Application Version',
        ready: 'Version {appVersion}',
        blocked: 'package.json is missing',
      },
      bridge: { label: 'Local Bridge', ready: 'Ready', blocked: 'local-bridge.mjs is missing' },
      web: { label: 'Infinite Canvas Page', ready: 'Ready', blocked: 'dist/index.html is missing' },
      integrity: {
        label: 'Package Integrity',
        source: 'Source runtime directory',
        portable: 'Portable package {appVersion} · {target}',
        blocked: 'Integrity check failed: {detail}',
      },
      storage: {
        label: 'Local Data Directory',
        ready: 'Canvas and media can be saved normally',
        blocked: 'Cannot write to: {dataRoot}',
      },
      port: {
        label: 'Local Port {bridgePort}',
        running: 'Qiansi-Canvas is already running',
        ready: 'Available',
        blocked: 'Port is in use; Qiansi-Canvas may already be running',
      },
      ffmpeg: {
        label: 'FFmpeg Video Processing',
        ready: 'Installed',
        optional: 'Not installed; the canvas still opens, but some video tools are unavailable',
      },
      ffprobe: {
        label: 'FFprobe Media Inspection',
        ready: 'Installed',
        optional: 'Not installed; the canvas still opens, but media validation is limited',
      },
      codex: { label: 'Codex CLI', ready: 'Installed', optional: 'Optional AI command-line tool' },
      gemini: {
        label: 'Gemini CLI',
        ready: 'Installed',
        optional: 'Optional AI command-line tool',
      },
    },
  },
  ja: {
    languageName: '日本語',
    pageTitle: 'Qiansi-Canvas 起動センター',
    subtitle: '実行環境を確認して、ワンクリックで無限キャンバスを開きます',
    languageLabel: 'ページ言語',
    coreTitle: 'キャンバス本体',
    optionalTitle: 'オプションの制作機能',
    loading: '確認中…',
    optionalNote:
      'オプション機能が未導入でもキャンバスは開けます。必要になったときに設定してください。',
    checking: 'このコンピューターを確認中…',
    manualInstall: '手動インストール',
    manualInstallTitle: '手動インストール',
    manualInstallDescription:
      '必要なツールを選択すると、新しいターミナルでスクリプトを起動します。',
    manualInstallRun: '実行',
    manualInstallClose: '閉じる',
    manualInstallEmpty: 'このシステムで実行できる導入ツールはありません。',
    manualInstallStarting: '{filename} を起動しています…',
    manualInstallStarted: '{filename} を起動しました。新しいウィンドウで続行してください。',
    manualInstallFailed: '導入ツールを起動できませんでした',
    manualInstallActions: {
      'install-app': '依存関係を導入し、無限キャンバス画面をビルドします。',
      'install-cli': 'AI CLI ツールの導入メニューを開きます。',
      'start-development': 'Vite と開発用 Bridge を起動します。',
      'start-canvas': 'ソース補助入口から Qiansi-Canvas を起動します。',
      'open-canvas': 'Qiansi-Canvas 起動センターを開きます。',
    },
    openCanvas: '無限キャンバスを開く',
    enterCanvas: '無限キャンバスに入る',
    starting: '起動中…',
    statusReady: '正常',
    statusBlocked: '対応が必要',
    statusOptional: '未導入',
    checkFailed: '環境確認に失敗しました',
    readyRunning: '無限キャンバスはすでに起動しています。',
    readyStopped: 'キャンバス本体の準備ができました。',
    coreBlocked: '先に「キャンバス本体」の問題を解決してください。',
    waitingBridge: 'ローカル Bridge の起動を待っています…',
    canvasTarget: '無限キャンバスのアドレス：{canvasUrl}',
    enteringCanvas: '無限キャンバスを開いています：{canvasUrl}',
    startFailed: '起動に失敗しました',
    descriptionTitle: '機能説明',
    guideTitle: '導入と使い方',
    solutionTitle: '解決方法',
    solutionFallback: '詳細を開き、案内に従って修復してから再確認してください。',
    actionInstall: 'ワンクリック導入・修復',
    actionRepair: '再導入・修復',
    actionRecheck: '今すぐ再確認',
    actionRechecking: '再確認中…',
    actionDownload: '公式ダウンロードを開く',
    actionStarting: '処理ツールを起動中…',
    actionRepairing: '導入・修復中です。起動センターを閉じないでください…',
    actionStarted: '処理ツールを起動しました。新しいウィンドウの案内に従ってください。',
    actionCompleted: '導入・修復が完了しました。再確認しています…',
    actionFailed: '処理に失敗しました',
    solutions: {
      runtime:
        'ソース版ではワンクリック修復で専用 Node.js を準備できます。ポータブル版では Mac/Windows のアーキテクチャに合う完全なパッケージを再取得してください。',
      package:
        'プログラムが不完全です。ファイルの一部だけでなく、完全なソースまたはパッケージを再取得してください。',
      bridge:
        'ローカル Bridge がありません。data を保持したまま完全なプログラムで置き換えてください。',
      web: 'ソース版ではワンクリック修復で依存関係と画面を再生成できます。ポータブル版は完全なパッケージを再取得してください。',
      integrity:
        'パッケージ内のファイルが欠落または変更されています。異なる版を混在させず、完全なパッケージを再取得してください。',
      storage:
        'データ保存先の書き込み権限、空き容量、セキュリティソフト、フォルダー権限を確認してください。',
      port: 'このポートでは Qiansi-Canvas がすでに起動している可能性があります。まずブラウザーで {canvasUrl} を開いてください。キャンバスを開けない場合は、{bridgePort} 番ポートを使用中の古い Qiansi-Canvas または他のアプリを終了して再確認してください。',
      ffmpeg: 'FFmpeg 公式推奨元から対応版を取得し、tools/README.md に従って配置してください。',
      ffprobe:
        'FFprobe は通常 FFmpeg に含まれます。tools/README.md に従って tools に配置してください。',
      codex: 'Codex CLI を導入し、新しいウィンドウでログインしてから再確認してください。',
      gemini: 'Gemini CLI を導入し、端末で gemini を実行してログイン後に再確認してください。',
    },
    descriptions: {
      runtime: 'Qiansi-Canvas、Bridge、ローカルサービスの実行に必要な Node.js 環境です。',
      package: '診断、更新、互換性確認に使う Qiansi-Canvas の現在のバージョンを識別します。',
      bridge:
        'プロジェクト保存、メディア、AI、オプションツールなどの管理機能をローカルで提供します。',
      web: 'ブラウザー上の無限キャンバス画面と操作機能を提供します。',
      integrity:
        'ポータブル版の必須ファイルが完全で未変更か確認し、ソースツリーは開発用として識別します。',
      storage:
        'キャンバス、素材、設定を保存するローカルデータフォルダーが書き込み可能か確認します。',
      port: '起動センターが無限キャンバスに接続または起動できるよう、Bridge のポート {bridgePort} を確認します。',
      ffmpeg: '動画の変換、編集、フレーム抽出などのローカル処理を支援します。',
      ffprobe: 'メディアの検証と処理のため、再生時間、コーデック、サイズなどを読み取ります。',
      codex: 'Codex CLI をキャンバスの任意のローカル AI コマンドライン機能として接続します。',
      gemini: 'Gemini CLI をキャンバスの任意のローカル AI コマンドライン機能として接続します。',
    },
    checks: {
      runtime: {
        label: '同梱ランタイム',
        ready: 'Node.js {nodeVersion}',
        blocked: 'Node.js {minimumNodeVersion} 以降が必要です',
      },
      package: {
        label: 'アプリ情報',
        ready: 'バージョン {appVersion}',
        blocked: 'package.json がありません',
      },
      bridge: {
        label: 'ローカル Bridge',
        ready: '準備完了',
        blocked: 'local-bridge.mjs がありません',
      },
      web: {
        label: '無限キャンバスページ',
        ready: '準備完了',
        blocked: 'dist/index.html がありません',
      },
      integrity: {
        label: 'パッケージ整合性',
        source: 'ソース実行ディレクトリ',
        portable: 'ポータブル版 {appVersion} · {target}',
        blocked: '整合性確認に失敗：{detail}',
      },
      storage: {
        label: 'ローカルデータフォルダー',
        ready: 'キャンバスと素材を保存できます',
        blocked: '書き込み不可：{dataRoot}',
      },
      port: {
        label: 'ローカルポート {bridgePort}',
        running: 'Qiansi-Canvas は起動済みです',
        ready: '使用可能',
        blocked: 'ポートは使用中です。Qiansi-Canvas が起動済みの可能性があります',
      },
      ffmpeg: {
        label: 'FFmpeg 動画処理',
        ready: '導入済み',
        optional: '未導入；キャンバスは開けますが、一部の動画機能は使えません',
      },
      ffprobe: {
        label: 'FFprobe メディア確認',
        ready: '導入済み',
        optional: '未導入；キャンバスは開けますが、メディア検証が制限されます',
      },
      codex: { label: 'Codex CLI', ready: '導入済み', optional: '任意の AI コマンドラインツール' },
      gemini: {
        label: 'Gemini CLI',
        ready: '導入済み',
        optional: '任意の AI コマンドラインツール',
      },
    },
  },
  ko: {
    languageName: '한국어',
    pageTitle: 'Qiansi-Canvas 시작 센터',
    subtitle: '실행 환경을 확인한 뒤 한 번의 클릭으로 무한 캔버스를 엽니다',
    languageLabel: '페이지 언어',
    coreTitle: '캔버스 핵심',
    optionalTitle: '선택형 제작 기능',
    loading: '확인 중…',
    optionalNote: '선택 기능이 설치되지 않아도 캔버스를 열 수 있습니다. 필요할 때 설정하세요.',
    checking: '이 컴퓨터를 확인 중…',
    manualInstall: '수동 설치',
    manualInstallTitle: '수동 설치',
    manualInstallDescription: '필요한 도구를 선택하면 새 터미널 창에서 스크립트가 시작됩니다.',
    manualInstallRun: '실행',
    manualInstallClose: '닫기',
    manualInstallEmpty: '이 시스템에서 실행할 수 있는 설치 도구가 없습니다.',
    manualInstallStarting: '{filename} 시작 중…',
    manualInstallStarted: '{filename}을(를) 시작했습니다. 새 창에서 계속하세요.',
    manualInstallFailed: '설치 도구를 시작할 수 없습니다',
    manualInstallActions: {
      'install-app': '프로젝트 의존성을 설치하고 무한 캔버스 페이지를 빌드합니다.',
      'install-cli': 'AI CLI 도구 설치 메뉴를 엽니다.',
      'start-development': 'Vite와 개발 Bridge를 시작합니다.',
      'start-canvas': '소스 도우미로 Qiansi-Canvas를 시작합니다.',
      'open-canvas': 'Qiansi-Canvas 시작 센터를 엽니다.',
    },
    openCanvas: '무한 캔버스 열기',
    enterCanvas: '무한 캔버스 들어가기',
    starting: '시작 중…',
    statusReady: '정상',
    statusBlocked: '조치 필요',
    statusOptional: '미설치',
    checkFailed: '환경 확인 실패',
    readyRunning: '무한 캔버스가 이미 실행 중입니다.',
    readyStopped: '캔버스 핵심이 준비되었습니다.',
    coreBlocked: '먼저 “캔버스 핵심” 문제를 해결하세요.',
    waitingBridge: '로컬 Bridge가 준비되기를 기다리는 중…',
    canvasTarget: '무한 캔버스 주소: {canvasUrl}',
    enteringCanvas: '무한 캔버스를 여는 중: {canvasUrl}',
    startFailed: '시작 실패',
    descriptionTitle: '기능 설명',
    guideTitle: '설치 및 사용 도움말',
    solutionTitle: '해결 방법',
    solutionFallback: '세부 정보를 펼쳐 안내에 따라 복구한 뒤 다시 확인하세요.',
    actionInstall: '원클릭 설치 / 복구',
    actionRepair: '재설치 / 복구',
    actionRecheck: '지금 다시 확인',
    actionRechecking: '다시 확인 중…',
    actionDownload: '공식 다운로드 열기',
    actionStarting: '도우미를 시작하는 중…',
    actionRepairing: '설치 / 복구 중입니다. 시작 센터를 닫지 마세요…',
    actionStarted: '도우미를 시작했습니다. 새 창의 안내를 완료하세요.',
    actionCompleted: '설치 / 복구가 완료되었습니다. 다시 확인하는 중…',
    actionFailed: '처리에 실패했습니다',
    solutions: {
      runtime:
        '소스 폴더에서는 원클릭 복구로 프로젝트 Node.js를 준비할 수 있습니다. 포터블 패키지는 Mac/Windows 아키텍처에 맞는 전체 패키지를 다시 받으세요.',
      package:
        '프로그램 파일이 불완전합니다. 일부 파일만 복사하지 말고 전체 소스나 패키지를 다시 받으세요.',
      bridge: '로컬 Bridge가 없습니다. data를 보존하고 전체 프로그램 파일로 교체하세요.',
      web: '소스 폴더에서는 원클릭 복구로 의존성과 화면을 다시 생성할 수 있습니다. 포터블 패키지는 전체 패키지를 다시 받으세요.',
      integrity:
        '포터블 파일이 누락되었거나 변경되었습니다. 서로 다른 버전을 섞지 말고 전체 패키지를 다시 받으세요.',
      storage: '데이터 폴더 쓰기 권한, 디스크 공간, 보안 프로그램과 폴더 권한을 확인하세요.',
      port: '이 포트에서 Qiansi-Canvas가 이미 실행 중일 수 있습니다. 먼저 브라우저에서 {canvasUrl}을 여세요. 캔버스가 열리지 않으면 {bridgePort} 포트를 사용하는 이전 Qiansi-Canvas나 다른 프로그램을 닫고 다시 확인하세요.',
      ffmpeg:
        'FFmpeg 공식 권장 출처에서 현재 시스템용 파일을 받아 tools/README.md에 따라 배치하세요.',
      ffprobe: 'FFprobe는 보통 FFmpeg에 포함됩니다. tools/README.md에 따라 tools에 배치하세요.',
      codex: 'Codex CLI를 설치하고 새 창에서 로그인한 다음 다시 확인하세요.',
      gemini: 'Gemini CLI를 설치하고 터미널에서 gemini로 로그인한 다음 다시 확인하세요.',
    },
    descriptions: {
      runtime: 'Qiansi-Canvas, Bridge 및 로컬 서비스에 필요한 Node.js 실행 환경을 제공합니다.',
      package: '진단, 업데이트, 호환성 확인을 위해 현재 Qiansi-Canvas 버전을 식별합니다.',
      bridge: '프로젝트 저장, 미디어, AI, 선택 도구 등의 관리된 로컬 기능을 제공합니다.',
      web: '브라우저에서 무한 캔버스 화면과 상호작용을 제공합니다.',
      integrity:
        '포터블 패키지의 필수 파일이 완전하고 변경되지 않았는지 확인하며, 소스 트리는 개발 환경으로 식별합니다.',
      storage: '캔버스, 미디어, 설정을 저장할 로컬 데이터 폴더에 쓸 수 있는지 확인합니다.',
      port: '시작 센터가 무한 캔버스에 연결하거나 시작할 수 있도록 Bridge 포트 {bridgePort}를 확인합니다.',
      ffmpeg: '비디오 변환, 편집, 프레임 추출 등의 로컬 비디오 처리를 지원합니다.',
      ffprobe: '미디어 검증과 처리를 위해 길이, 코덱, 크기 등의 정보를 읽습니다.',
      codex: 'Codex CLI를 캔버스의 선택형 로컬 AI 명령줄 기능으로 연결합니다.',
      gemini: 'Gemini CLI를 캔버스의 선택형 로컬 AI 명령줄 기능으로 연결합니다.',
    },
    checks: {
      runtime: {
        label: '내장 실행 환경',
        ready: 'Node.js {nodeVersion}',
        blocked: 'Node.js {minimumNodeVersion} 이상이 필요합니다',
      },
      package: {
        label: '프로그램 정보',
        ready: '버전 {appVersion}',
        blocked: 'package.json이 없습니다',
      },
      bridge: { label: '로컬 Bridge', ready: '준비됨', blocked: 'local-bridge.mjs가 없습니다' },
      web: { label: '무한 캔버스 페이지', ready: '준비됨', blocked: 'dist/index.html이 없습니다' },
      integrity: {
        label: '패키지 무결성',
        source: '소스 실행 디렉터리',
        portable: '포터블 패키지 {appVersion} · {target}',
        blocked: '무결성 검사 실패: {detail}',
      },
      storage: {
        label: '로컬 데이터 폴더',
        ready: '캔버스와 미디어를 정상적으로 저장할 수 있습니다',
        blocked: '쓸 수 없음: {dataRoot}',
      },
      port: {
        label: '로컬 포트 {bridgePort}',
        running: 'Qiansi-Canvas가 이미 실행 중입니다',
        ready: '사용 가능',
        blocked: '포트 사용 중; Qiansi-Canvas가 이미 실행 중일 수 있습니다',
      },
      ffmpeg: {
        label: 'FFmpeg 비디오 처리',
        ready: '설치됨',
        optional: '미설치; 캔버스는 열리지만 일부 비디오 기능을 사용할 수 없습니다',
      },
      ffprobe: {
        label: 'FFprobe 미디어 검사',
        ready: '설치됨',
        optional: '미설치; 캔버스는 열리지만 미디어 검사가 제한됩니다',
      },
      codex: { label: 'Codex CLI', ready: '설치됨', optional: '선택형 AI 명령줄 도구' },
      gemini: { label: 'Gemini CLI', ready: '설치됨', optional: '선택형 AI 명령줄 도구' },
    },
  },
  es: {
    languageName: 'Español',
    pageTitle: 'Centro de inicio de Qiansi-Canvas',
    subtitle: 'Comprueba el entorno y abre el lienzo infinito con un clic',
    languageLabel: 'Idioma de la página',
    coreTitle: 'Núcleo del lienzo',
    optionalTitle: 'Herramientas creativas opcionales',
    loading: 'Comprobando…',
    optionalNote:
      'Las herramientas opcionales ausentes no impiden abrir el lienzo. Configúralas cuando las necesites.',
    checking: 'Comprobando este equipo…',
    manualInstall: 'Instalación manual',
    manualInstallTitle: 'Instalación manual',
    manualInstallDescription:
      'Elija una herramienta. Su script se iniciará en una nueva ventana de terminal.',
    manualInstallRun: 'Ejecutar',
    manualInstallClose: 'Cerrar',
    manualInstallEmpty: 'No hay herramientas de instalación disponibles para este sistema.',
    manualInstallStarting: 'Iniciando {filename}…',
    manualInstallStarted: '{filename} se inició. Continúe en la ventana nueva.',
    manualInstallFailed: 'No se pudo iniciar la herramienta de instalación',
    manualInstallActions: {
      'install-app': 'Instala las dependencias y compila la página del lienzo infinito.',
      'install-cli': 'Abre el menú de instalación de herramientas de AI CLI.',
      'start-development': 'Inicia Vite y el Bridge de desarrollo.',
      'start-canvas': 'Inicia Qiansi-Canvas mediante el asistente del código fuente.',
      'open-canvas': 'Abre el centro de inicio de Qiansi-Canvas.',
    },
    openCanvas: 'Abrir lienzo infinito',
    enterCanvas: 'Entrar al lienzo infinito',
    starting: 'Iniciando…',
    statusReady: 'Listo',
    statusBlocked: 'Requiere atención',
    statusOptional: 'No instalado',
    checkFailed: 'Falló la comprobación del entorno',
    readyRunning: 'El lienzo infinito ya está en ejecución.',
    readyStopped: 'El núcleo del lienzo está listo.',
    coreBlocked: 'Resuelve primero los problemas de “Núcleo del lienzo”.',
    waitingBridge: 'Esperando al Bridge local…',
    canvasTarget: 'Dirección del lienzo infinito: {canvasUrl}',
    enteringCanvas: 'Abriendo el lienzo infinito: {canvasUrl}',
    startFailed: 'No se pudo iniciar',
    descriptionTitle: 'Descripción de la función',
    guideTitle: 'Ayuda de instalación y uso',
    solutionTitle: 'Cómo resolverlo',
    solutionFallback: 'Abra el diagnóstico, siga los pasos y vuelva a comprobar.',
    actionInstall: 'Instalar / reparar',
    actionRepair: 'Reinstalar / reparar',
    actionRecheck: 'Comprobar de nuevo',
    actionRechecking: 'Comprobando de nuevo…',
    actionDownload: 'Abrir descarga oficial',
    actionStarting: 'Iniciando el asistente…',
    actionRepairing: 'Instalando / reparando. Mantenga abierto el centro de inicio…',
    actionStarted: 'El asistente se inició. Complete los pasos en la ventana nueva.',
    actionCompleted: 'Instalación / reparación completada. Comprobando de nuevo…',
    actionFailed: 'La acción falló',
    solutions: {
      runtime:
        'En el código fuente, use Instalar / reparar para preparar Node.js. En un paquete portátil, vuelva a descargar el paquete completo para la arquitectura de Mac o Windows.',
      package:
        'Los archivos están incompletos. Descargue el código o paquete completo en vez de copiar solo una parte.',
      bridge:
        'Falta el Bridge local. Conserve data y reemplace los archivos del programa por un paquete completo.',
      web: 'En el código fuente, Instalar / reparar reinstala dependencias y compila la página. En un paquete portátil, vuelva a descargarlo completo.',
      integrity:
        'Faltan archivos o fueron modificados. Descargue un paquete completo y no mezcle versiones.',
      storage:
        'Compruebe permisos de escritura, espacio, antivirus y permisos de la carpeta de datos.',
      port: 'Es posible que Qiansi-Canvas ya se esté ejecutando en este puerto. Primero abra {canvasUrl} en el navegador. Si el lienzo no se abre, cierre la instancia anterior de Qiansi-Canvas u otro programa que use el puerto {bridgePort} y vuelva a comprobar.',
      ffmpeg:
        'Descargue la versión correcta desde una fuente recomendada por FFmpeg y siga tools/README.md.',
      ffprobe: 'FFprobe suele venir con FFmpeg. Colóquelo en tools según tools/README.md.',
      codex: 'Instale Codex CLI, inicie sesión en la ventana nueva y vuelva a comprobar.',
      gemini: 'Instale Gemini CLI, ejecute gemini para iniciar sesión y vuelva a comprobar.',
    },
    descriptions: {
      runtime:
        'Proporciona el entorno Node.js necesario para Qiansi-Canvas, el Bridge y los servicios locales.',
      package:
        'Identifica la versión actual de Qiansi-Canvas para diagnósticos, actualizaciones y compatibilidad.',
      bridge:
        'Ejecuta funciones locales administradas, como proyectos, medios, IA y herramientas opcionales.',
      web: 'Proporciona la interfaz del lienzo infinito y sus interacciones en el navegador.',
      integrity:
        'Comprueba que los archivos necesarios del paquete portátil estén completos y sin cambios; el código fuente se identifica como entorno de desarrollo.',
      storage:
        'Comprueba que el directorio local pueda guardar proyectos del lienzo, medios y configuración.',
      port: 'Comprueba el puerto {bridgePort} del Bridge para conectar o iniciar el lienzo infinito.',
      ffmpeg:
        'Permite transcodificar y editar vídeo, extraer fotogramas y realizar otros procesos locales.',
      ffprobe:
        'Lee duración, códecs, dimensiones y otros metadatos para validar y procesar medios.',
      codex: 'Conecta Codex CLI como capacidad local opcional de IA para el lienzo.',
      gemini: 'Conecta Gemini CLI como capacidad local opcional de IA para el lienzo.',
    },
    checks: {
      runtime: {
        label: 'Entorno incluido',
        ready: 'Node.js {nodeVersion}',
        blocked: 'Se requiere Node.js {minimumNodeVersion} o posterior',
      },
      package: {
        label: 'Información de la aplicación',
        ready: 'Versión {appVersion}',
        blocked: 'Falta package.json',
      },
      bridge: { label: 'Bridge local', ready: 'Listo', blocked: 'Falta local-bridge.mjs' },
      web: {
        label: 'Página del lienzo infinito',
        ready: 'Listo',
        blocked: 'Falta dist/index.html',
      },
      integrity: {
        label: 'Integridad del paquete',
        source: 'Directorio de ejecución del código fuente',
        portable: 'Paquete portátil {appVersion} · {target}',
        blocked: 'Falló la integridad: {detail}',
      },
      storage: {
        label: 'Directorio de datos local',
        ready: 'El lienzo y los medios se pueden guardar',
        blocked: 'No se puede escribir en: {dataRoot}',
      },
      port: {
        label: 'Puerto local {bridgePort}',
        running: 'Qiansi-Canvas ya está en ejecución',
        ready: 'Disponible',
        blocked: 'Puerto en uso; Qiansi-Canvas puede estar ejecutándose',
      },
      ffmpeg: {
        label: 'Procesamiento de vídeo FFmpeg',
        ready: 'Instalado',
        optional:
          'No instalado; el lienzo se abre, pero algunas funciones de vídeo no estarán disponibles',
      },
      ffprobe: {
        label: 'Inspección multimedia FFprobe',
        ready: 'Instalado',
        optional: 'No instalado; el lienzo se abre, pero la validación multimedia será limitada',
      },
      codex: {
        label: 'Codex CLI',
        ready: 'Instalado',
        optional: 'Herramienta de línea de comandos de IA opcional',
      },
      gemini: {
        label: 'Gemini CLI',
        ready: 'Instalado',
        optional: 'Herramienta de línea de comandos de IA opcional',
      },
    },
  },
};

function versionAtLeast(actual, expected) {
  const parse = (value) =>
    String(value)
      .replace(/^v/, '')
      .split('.')
      .slice(0, 3)
      .map((part) => Number(part) || 0);
  const left = parse(actual);
  const right = parse(expected);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function manualLauncherCatalog() {
  return MANUAL_LAUNCHER_CATALOG[process.platform] || [];
}

async function availableManualLaunchers(installRoot, portable) {
  if (portable) return [];
  const launchers = [];
  for (const launcher of manualLauncherCatalog()) {
    if (await fileExists(join(installRoot, 'tools', 'launchers', launcher.filename))) {
      launchers.push(launcher);
    }
  }
  return launchers;
}

async function readPackageVersion(installRoot) {
  try {
    const packageJson = JSON.parse(await readFile(join(installRoot, 'package.json'), 'utf8'));
    return typeof packageJson.version === 'string' && packageJson.version.trim()
      ? packageJson.version.trim()
      : null;
  } catch {
    return null;
  }
}

function executableFound(command) {
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(finder, [command], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 && String(result.stdout || '').trim() !== '';
}

async function canWriteDirectory(directory) {
  const probe = join(directory, `.qiansi-launcher-write-${process.pid}-${Date.now()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(probe, 'qiansi-canvas-write-probe', { flag: 'wx' });
    await rm(probe, { force: true });
    return true;
  } catch {
    await rm(probe, { force: true }).catch(() => undefined);
    return false;
  }
}

function bridgeOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

async function readBridgeHealth(port, signal) {
  try {
    const response = await fetch(`${bridgeOrigin(port)}/health?session=1`, {
      headers: { Origin: bridgeOrigin(port) },
      signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && payload.ok === true ? payload : null;
  } catch {
    return null;
  }
}

async function portIsAvailable(port) {
  return new Promise((resolveAvailability) => {
    const server = createNetServer();
    server.unref();
    server.once('error', () => resolveAvailability(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolveAvailability(true));
    });
  });
}

function requiredCheck(id, label, ready, detail, meta = {}) {
  return { id, label, required: true, state: ready ? 'ready' : 'blocked', detail, meta };
}

function optionalCheck(id, label, ready, detail, meta = {}) {
  return { id, label, required: false, state: ready ? 'ready' : 'optional', detail, meta };
}

async function verifyPortableInstallIfPresent(installRoot) {
  const manifestPath = join(installRoot, 'portable-release.json');
  if (!(await fileExists(manifestPath)))
    return { portable: false, ready: true, detail: '源码运行目录' };
  try {
    const contractPath = join(installRoot, 'scripts', 'portable-release-contract.mjs');
    const { verifyPortableRelease } = await import(pathToFileURL(contractPath).href);
    const manifest = await verifyPortableRelease(installRoot, { quick: true });
    return {
      portable: true,
      ready: true,
      detail: `绿色运行包 ${manifest.appVersion} · ${manifest.target}`,
      appVersion: manifest.appVersion,
      target: manifest.target,
    };
  } catch (error) {
    return {
      portable: true,
      ready: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectLauncherDiagnostics(options = {}) {
  const installRoot = resolve(options.installRoot || DEFAULT_INSTALL_ROOT);
  const bridgePort = Number(options.bridgePort || DEFAULT_BRIDGE_PORT);
  const dataRoot = resolve(
    options.dataRoot || process.env.QIANSI_CANVAS_DATA_DIR || join(installRoot, 'data'),
  );
  const health = await readBridgeHealth(bridgePort);
  const portable = await verifyPortableInstallIfPresent(installRoot);
  const nodeReady = versionAtLeast(process.versions.node, MINIMUM_NODE_VERSION);
  const appVersion = await readPackageVersion(installRoot);
  const packageReady = appVersion !== null;
  const bridgeReady = await fileExists(join(installRoot, 'local-bridge.mjs'));
  const webReady = await fileExists(join(installRoot, 'dist', 'index.html'));
  const writable = await canWriteDirectory(dataRoot);
  const portReady = health !== null || (await portIsAvailable(bridgePort));
  const mediaSuffix = process.platform === 'win32' ? '.exe' : '';
  const ffmpegReady = await fileExists(join(installRoot, 'tools', `ffmpeg${mediaSuffix}`));
  const ffprobeReady = await fileExists(join(installRoot, 'tools', `ffprobe${mediaSuffix}`));
  const codexReady = executableFound(process.platform === 'win32' ? 'codex.cmd' : 'codex');
  const geminiReady = executableFound(process.platform === 'win32' ? 'gemini.cmd' : 'gemini');
  const appInstallerReady =
    process.platform === 'win32'
      ? await fileExists(join(installRoot, 'tools', 'launchers', '安装Qiansi-Canvas.bat'))
      : process.platform === 'darwin'
        ? await fileExists(
            join(installRoot, 'tools', 'launchers', '安装Qiansi-Canvas-macOS.command'),
          )
        : false;
  const cliInstallerReady =
    process.platform === 'win32'
      ? await fileExists(join(installRoot, 'tools', 'launchers', 'qiansi-install.bat'))
      : process.platform === 'darwin'
        ? await fileExists(join(installRoot, 'tools', 'launchers', '安装CLI工具-macOS.command'))
        : false;
  const manualInstallActions = await availableManualLaunchers(installRoot, portable.portable);

  const core = [
    requiredCheck(
      'runtime',
      '绿色运行环境',
      nodeReady,
      nodeReady
        ? `Node.js ${process.versions.node}`
        : `需要 Node.js ${MINIMUM_NODE_VERSION} 或更高版本`,
      {
        nodeVersion: process.versions.node,
        minimumNodeVersion: MINIMUM_NODE_VERSION,
        portable: portable.portable,
        action: !portable.portable && appInstallerReady ? 'install-app' : '',
        actionKind: 'install',
      },
    ),
    requiredCheck(
      'package',
      '程序版本信息',
      packageReady,
      packageReady ? `版本 ${appVersion}` : '缺少 package.json',
      {
        present: packageReady,
        appVersion,
        portable: portable.portable,
        action: !portable.portable && appInstallerReady ? 'install-app' : '',
        actionKind: 'install',
      },
    ),
    requiredCheck(
      'bridge',
      '本机 Bridge',
      bridgeReady,
      bridgeReady ? '已就绪' : '缺少 local-bridge.mjs',
      {
        present: bridgeReady,
        portable: portable.portable,
        action: !portable.portable && appInstallerReady ? 'install-app' : '',
        actionKind: 'install',
      },
    ),
    requiredCheck('web', '无限画布页面', webReady, webReady ? '已就绪' : '缺少 dist/index.html', {
      present: webReady,
      portable: portable.portable,
      action: !portable.portable && appInstallerReady ? 'install-app' : '',
      actionKind: 'install',
    }),
    requiredCheck('integrity', '绿色包完整性', portable.ready, portable.detail, {
      portable: portable.portable,
      appVersion: portable.appVersion || '',
      target: portable.target || '',
      action: !portable.portable && appInstallerReady ? 'install-app' : '',
      actionKind: 'install',
    }),
    requiredCheck(
      'storage',
      '本机数据目录',
      writable,
      writable ? '可正常保存画布与素材' : `不可写入：${dataRoot}`,
      { dataRoot },
    ),
    requiredCheck(
      'port',
      `本机端口 ${bridgePort}`,
      portReady,
      health ? 'Qiansi-Canvas 已经在运行' : portReady ? '可用' : '已被其它程序占用',
      { bridgePort, canvasUrl: `${bridgeOrigin(bridgePort)}/`, running: health !== null },
    ),
  ];

  const optional = [
    optionalCheck(
      'ffmpeg',
      'FFmpeg 视频处理',
      ffmpegReady,
      ffmpegReady ? '已安装' : '未安装；不影响打开画布，但部分视频功能不可用',
      {
        installed: ffmpegReady,
        action: ffmpegReady ? '' : 'open-ffmpeg-download',
        actionKind: 'download',
      },
    ),
    optionalCheck(
      'ffprobe',
      'FFprobe 媒体检测',
      ffprobeReady,
      ffprobeReady ? '已安装' : '未安装；不影响打开画布，但媒体校验能力受限',
      {
        installed: ffprobeReady,
        action: ffprobeReady ? '' : 'open-ffmpeg-download',
        actionKind: 'download',
      },
    ),
    optionalCheck('codex', 'Codex CLI', codexReady, '可选 AI 命令行工具', {
      installed: codexReady,
      action: !codexReady && cliInstallerReady ? 'install-codex' : '',
      actionKind: 'install',
    }),
    optionalCheck('gemini', 'Gemini CLI', geminiReady, '可选 AI 命令行工具', {
      installed: geminiReady,
      action: !geminiReady && cliInstallerReady ? 'install-gemini' : '',
      actionKind: 'install',
    }),
  ];

  return {
    product: 'Qiansi-Canvas',
    installRoot,
    dataRoot,
    bridgePort,
    canvasUrl: `${bridgeOrigin(bridgePort)}/`,
    running: health !== null,
    ready: core.every((item) => item.state === 'ready'),
    manualInstallAvailable: manualInstallActions.length > 0,
    manualInstallActions,
    core,
    optional,
  };
}

function launchCenterHtml(token) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Qiansi-Canvas 启动中心</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,"Microsoft YaHei",system-ui,sans-serif;background:#111;color:#f4f4f4}
    *{box-sizing:border-box}body{display:flow-root;margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0,#173027 0,transparent 36%),#111}
    main{width:min(880px,calc(100% - 32px));margin:48px auto;padding-bottom:48px}.hero{display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:center;gap:16px;margin-bottom:24px}
    .logo{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:#2f8f5b;font-size:28px;font-weight:800;box-shadow:0 10px 34px #12593455}
    h1{font-size:28px;margin:0 0 5px}.subtitle{margin:0;color:#a8aaa9}.language-control{display:flex;align-items:center;gap:8px;color:#a8aaa9;font-size:12px}.language-control select{appearance:none;min-width:126px;border:1px solid #3a3e3c;border-radius:10px;background:#1b1e1c;color:#f4f4f4;padding:9px 30px 9px 11px;font:600 13px inherit;cursor:pointer;background-image:linear-gradient(45deg,transparent 50%,#a8aaa9 50%),linear-gradient(135deg,#a8aaa9 50%,transparent 50%);background-position:calc(100% - 14px) 14px,calc(100% - 9px) 14px;background-size:5px 5px,5px 5px;background-repeat:no-repeat}.language-control select:focus-visible{outline:2px solid #36a66b;outline-offset:2px}.panel{border:1px solid #303332;border-radius:18px;background:#181a19dd;padding:22px;margin-top:16px;box-shadow:0 18px 60px #0004}
    h2{font-size:16px;margin:0 0 14px;color:#e7e8e7}.check{border-top:1px solid #292c2a}.check:first-child{border-top:0}.check-summary{display:grid;grid-template-columns:12px 1fr auto 18px;gap:13px;align-items:center;padding:13px 4px;list-style:none;cursor:pointer}.check-summary::-webkit-details-marker{display:none}.check-summary:focus-visible{outline:2px solid #36a66b;outline-offset:3px;border-radius:8px}.check-summary::after{content:'›';color:#8e9390;font-size:20px;line-height:1;transform:rotate(90deg);transition:transform .15s}.check[open] .check-summary::after{transform:rotate(-90deg)}
    .check-dot{width:10px;height:10px;border-radius:50%;background:#777}.ready .check-dot{background:#28c47c;box-shadow:0 0 0 4px #28c47c18}.blocked .check-dot{background:#f1b83c}.optional .check-dot{background:#707473}
    .check strong{font-size:14px}.check p{margin:4px 0 0;color:#929695;font-size:12px;overflow-wrap:anywhere}.check-status{font-size:12px;color:#a6aaa8;border:1px solid #3a3e3c;border-radius:999px;padding:4px 9px}.blocked .check-status{color:#ffd777;border-color:#72591a}.check-summary .check-status{grid-column:3}.solution{margin:0 4px 13px 25px;padding:13px 14px;border:1px solid #343836;border-radius:12px;background:#121513}.solution-title{display:block;margin-bottom:6px;color:#d9dcda;font-size:13px}.solution p{margin:0;color:#aeb2b0;line-height:1.65}.guide-section{margin-top:12px;padding-top:11px;border-top:1px solid #292d2b}.guide-title{display:block;margin-bottom:5px;color:#d9dcda;font-size:13px}.solution-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.solution-action{min-width:0;margin:0;padding:8px 13px;border-radius:9px;font-size:12px}.solution-recheck{border:1px solid #3a3e3c;background:#202422;color:#d9dcda}.solution-recheck:hover{background:#2b302d}.solution-action[aria-busy="true"]{opacity:.65;cursor:wait}
    .actions{position:sticky;bottom:18px;display:flex;align-items:center;gap:12px;margin-top:18px;padding:14px;border:1px solid #303332;border-radius:18px;background:#171918ee;backdrop-filter:blur(18px)}
    button{appearance:none;border:0;border-radius:12px;padding:13px 20px;font:600 15px inherit;cursor:pointer;background:#329461;color:white;min-width:190px}button:hover{background:#3aa86f}button:disabled{cursor:not-allowed;background:#303432;color:#777}.manual-install{min-width:132px;background:#202422;color:#d9dcda;box-shadow:inset 0 0 0 1px #3a3e3c}.manual-install:hover:not(:disabled){background:#2b302d}
    .manual-modal{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:24px;background:#0009;backdrop-filter:blur(8px)}.manual-modal[hidden]{display:none}.manual-dialog{width:min(580px,100%);max-height:min(640px,calc(100vh - 48px));overflow:auto;border:1px solid #3a3e3c;border-radius:18px;background:#181a19;box-shadow:0 24px 80px #0009;padding:20px}.manual-dialog-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.manual-dialog-title{margin:0;font-size:18px;color:#f4f4f4}.manual-dialog-description{margin:7px 0 0;color:#9da19f;font-size:13px;line-height:1.6}.manual-dialog-close{display:grid;place-items:center;flex:0 0 auto;min-width:36px;width:36px;height:36px;padding:0;border-radius:10px;background:#242826;color:#c8ccca;font-size:20px}.manual-dialog-close:hover{background:#303532}.manual-tool-list{display:grid;gap:10px;margin-top:18px}.manual-tool{display:flex;align-items:center;gap:14px;padding:13px;border:1px solid #313533;border-radius:12px;background:#121513}.manual-tool-copy{flex:1;min-width:0}.manual-tool code{color:#e5e8e6;font:600 13px ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.manual-tool p{margin:5px 0 0;color:#929695;font-size:12px;line-height:1.5}.manual-tool-run{flex:0 0 auto;min-width:76px;padding:9px 14px;border-radius:9px;font-size:13px}.manual-dialog-status{min-height:20px;margin:14px 2px 0;color:#77d5a5;font-size:12px;line-height:1.55}.manual-dialog-status.error{color:#ffb5a7!important}.manual-dialog-empty{margin:18px 0 0;color:#929695;font-size:13px}.modal-open{overflow:hidden}
    .action-copy{flex:1;min-width:0}#summary{color:#a6aaa8;font-size:13px}.target-url{margin-top:5px;color:#6fc99b;font:500 12px ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.error{color:#ffb5a7!important}.optional-note{font-size:12px;color:#858988;margin:12px 0 0}.loading{animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{opacity:.5}}
    @media(max-width:620px){main{margin:22px auto}.hero{grid-template-columns:52px minmax(0,1fr)}.language-control{grid-column:1/-1;justify-self:end}.panel{padding:17px}.check-summary{grid-template-columns:10px 1fr 18px}.check-status{grid-column:2;justify-self:start}.check-summary .check-status{grid-column:2}.check-summary::after{grid-column:3;grid-row:1/3}.solution{margin-left:20px}.actions{align-items:stretch;flex-direction:column}button{width:100%}.action-copy{width:100%}.manual-modal{padding:12px}.manual-dialog{max-height:calc(100vh - 24px);padding:17px}.manual-tool{align-items:stretch;flex-direction:column}.manual-tool-run{width:100%}.manual-dialog-close{width:36px}}
  </style>
</head>
<body><main>
  <header class="hero"><div class="logo">千</div><div><h1 id="page-title">Qiansi-Canvas 启动中心</h1><p class="subtitle" id="subtitle">检查运行环境，然后一键进入无限画布</p></div><label class="language-control"><span id="language-label">页面语言</span><select id="language" aria-label="页面语言"></select></label></header>
  <section class="panel"><h2 id="core-title">画布核心</h2><div id="core"><p class="loading">正在检查…</p></div></section>
  <section class="panel"><h2 id="optional-title">可选创作能力</h2><div id="optional"><p class="loading">正在检查…</p></div><p class="optional-note" id="optional-note">可选项目未安装不会阻止打开无限画布，需要对应功能时再配置即可。</p></section>
  <div class="actions"><div class="action-copy"><div id="summary">正在检查本机环境…</div><div class="target-url" id="target-url" hidden></div></div><button id="manual-install" class="manual-install" hidden>手动安装</button><button id="launch" disabled>打开无限画布</button></div>
  <div class="manual-modal" id="manual-modal" hidden><section class="manual-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-dialog-title" aria-describedby="manual-dialog-description"><header class="manual-dialog-header"><div><h2 class="manual-dialog-title" id="manual-dialog-title">手动安装</h2><p class="manual-dialog-description" id="manual-dialog-description"></p></div><button type="button" class="manual-dialog-close" id="manual-dialog-close" aria-label="关闭">×</button></header><div class="manual-tool-list" id="manual-tool-list"></div><div class="manual-dialog-status" id="manual-dialog-status" aria-live="polite"></div></section></div>
</main>
<script>
  const token=${JSON.stringify(token)};const messages=${JSON.stringify(LAUNCH_CENTER_MESSAGES)};
  const core=document.querySelector('#core');const optional=document.querySelector('#optional');const summary=document.querySelector('#summary');const targetUrl=document.querySelector('#target-url');const manualInstall=document.querySelector('#manual-install');const manualModal=document.querySelector('#manual-modal');const manualDialogTitle=document.querySelector('#manual-dialog-title');const manualDialogDescription=document.querySelector('#manual-dialog-description');const manualDialogClose=document.querySelector('#manual-dialog-close');const manualToolList=document.querySelector('#manual-tool-list');const manualDialogStatus=document.querySelector('#manual-dialog-status');const launch=document.querySelector('#launch');const language=document.querySelector('#language');
  const supported=Object.keys(messages);const detected=(navigator.languages||[navigator.language||'']).map(value=>String(value).toLowerCase()).find(value=>supported.some(code=>value===code.toLowerCase()||value.startsWith(code.split('-')[0].toLowerCase())));let locale=supported.find(code=>detected&&(detected===code.toLowerCase()||detected.startsWith(code.split('-')[0].toLowerCase())))||'en';let lastData=null;let launching=false;let runningManualAction='';let manualStatus={type:'',filename:'',detail:''};let lastManualTrigger=null;let activeRepairAction='';const expandedChecks=new Set();
  const escapeHtml=(value)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const format=(template,values={})=>String(template||'').replace(/\\{(\\w+)\\}/g,(_,key)=>values[key]??'');
  const text=()=>messages[locale]||messages.en;
  const diagnosticText=(item)=>{const copy=text().checks[item.id]||{};const meta={...(item.meta||{}),detail:item.detail};let detailKey=item.state==='ready'?'ready':item.state==='blocked'?'blocked':'optional';if(item.id==='integrity'&&item.state==='ready')detailKey=meta.portable?'portable':'source';if(item.id==='port'&&item.state==='ready'&&meta.running)detailKey='running';return {label:format(copy.label||item.label,meta),detail:format(copy[detailKey]||item.detail,meta)};};
  const checkBody=(copy,status)=>'<span class="check-dot" aria-hidden="true"></span><div><strong>'+escapeHtml(copy.label)+'</strong><p>'+escapeHtml(copy.detail)+'</p></div><span class="check-status">'+escapeHtml(status)+'</span>';
  const render=(item)=>{const copy=diagnosticText(item);const status=item.state==='ready'?text().statusReady:item.state==='blocked'?text().statusBlocked:text().statusOptional;const ready=item.state==='ready';const meta={...(item.meta||{}),detail:item.detail};const detail=format(ready?(text().descriptions?.[item.id]||copy.detail):(text().solutions?.[item.id]||text().solutionFallback),meta);const detailTitle=ready?text().descriptionTitle:text().solutionTitle;const guide=ready?format(text().guides?.[item.id]||text().solutions?.[item.id]||copy.detail,meta):'';const guideContent=ready?'<div class="guide-section"><strong class="guide-title">'+escapeHtml(text().guideTitle)+'</strong><p>'+escapeHtml(guide)+'</p></div>':'';const action=item.meta?.action||'';const actionLabel=item.meta?.actionKind==='download'?text().actionDownload:(ready?text().actionRepair:text().actionInstall);const actionDisabled=activeRepairAction?' disabled aria-busy="true"':'';const repairButton=action?'<button type="button" class="solution-action" data-repair-action="'+escapeHtml(action)+'"'+actionDisabled+'>'+escapeHtml(actionLabel)+'</button>':'';const recheckButton='<button type="button" class="solution-action solution-recheck" data-recheck-check="'+escapeHtml(item.id)+'"'+(activeRepairAction?' disabled':'')+'>'+escapeHtml(text().actionRecheck)+'</button>';return '<details class="check '+item.state+'" data-check-id="'+escapeHtml(item.id)+'"'+(expandedChecks.has(item.id)?' open':'')+'><summary class="check-summary">'+checkBody(copy,status)+'</summary><div class="solution"><strong class="solution-title">'+escapeHtml(detailTitle)+'</strong><p>'+escapeHtml(detail)+'</p>'+guideContent+'<div class="solution-actions">'+repairButton+recheckButton+'</div></div></details>'};
  const renderManualDialog=()=>{const copy=text();manualDialogTitle.textContent=copy.manualInstallTitle;manualDialogDescription.textContent=copy.manualInstallDescription;manualDialogClose.setAttribute('aria-label',copy.manualInstallClose);const launchers=lastData?.manualInstallActions||[];manualToolList.innerHTML=launchers.length?launchers.map(launcher=>'<article class="manual-tool"><div class="manual-tool-copy"><code>'+escapeHtml(launcher.filename)+'</code><p>'+escapeHtml(copy.manualInstallActions?.[launcher.id]||'')+'</p></div><button type="button" class="manual-tool-run" data-manual-action="'+escapeHtml(launcher.id)+'"'+(runningManualAction?' disabled aria-busy="true"':'')+'>'+escapeHtml(copy.manualInstallRun)+'</button></article>').join(''):'<p class="manual-dialog-empty">'+escapeHtml(copy.manualInstallEmpty)+'</p>';manualDialogStatus.className='manual-dialog-status'+(manualStatus.type==='error'?' error':'');manualDialogStatus.textContent=manualStatus.type==='starting'?format(copy.manualInstallStarting,{filename:manualStatus.filename}):manualStatus.type==='started'?format(copy.manualInstallStarted,{filename:manualStatus.filename}):manualStatus.type==='error'?copy.manualInstallFailed+': '+manualStatus.detail:'';};
  const closeManualDialog=()=>{manualModal.hidden=true;document.body.classList.remove('modal-open');manualStatus={type:'',filename:'',detail:''};const trigger=lastManualTrigger;lastManualTrigger=null;trigger?.focus();};
  const renderPage=()=>{const copy=text();document.documentElement.lang=locale;document.title=copy.pageTitle;document.querySelector('#page-title').textContent=copy.pageTitle;document.querySelector('#subtitle').textContent=copy.subtitle;document.querySelector('#language-label').textContent=copy.languageLabel;language.setAttribute('aria-label',copy.languageLabel);document.querySelector('#core-title').textContent=copy.coreTitle;document.querySelector('#optional-title').textContent=copy.optionalTitle;document.querySelector('#optional-note').textContent=copy.optionalNote;manualInstall.textContent=copy.manualInstall;if(lastData){core.innerHTML=lastData.core.map(render).join('');optional.innerHTML=lastData.optional.map(render).join('');targetUrl.hidden=false;targetUrl.textContent=format(copy.canvasTarget,{canvasUrl:lastData.canvasUrl});manualInstall.hidden=!lastData.manualInstallAvailable;manualInstall.disabled=launching||!!runningManualAction||!!activeRepairAction;launch.disabled=launching||!!runningManualAction||!!activeRepairAction||!lastData.ready;launch.textContent=launching?copy.starting:(lastData.running?copy.enterCanvas:copy.openCanvas);summary.className='';if(activeRepairAction){summary.textContent=activeRepairAction==='install-app'?copy.actionRepairing:copy.actionStarting;}else if(!launching){summary.textContent=lastData.ready?(lastData.running?copy.readyRunning:copy.readyStopped):copy.coreBlocked;}}else{core.innerHTML='<p class="loading">'+escapeHtml(copy.loading)+'</p>';optional.innerHTML='<p class="loading">'+escapeHtml(copy.loading)+'</p>';targetUrl.hidden=true;manualInstall.hidden=true;summary.textContent=copy.checking;launch.textContent=copy.openCanvas;}renderManualDialog();};
  supported.forEach(code=>{const option=document.createElement('option');option.value=code;option.textContent=messages[code].languageName;language.append(option);});language.value=locale;language.addEventListener('change',()=>{locale=language.value;renderPage();});
  document.addEventListener('toggle',(event)=>{const details=event.target;if(!(details instanceof HTMLDetailsElement)||!details.dataset.checkId)return;if(details.open)expandedChecks.add(details.dataset.checkId);else expandedChecks.delete(details.dataset.checkId);},true);
  document.addEventListener('click',async(event)=>{const recheck=event.target.closest?.('[data-recheck-check]');if(recheck){event.preventDefault();event.stopPropagation();if(recheck.disabled||activeRepairAction)return;recheck.disabled=true;recheck.setAttribute('aria-busy','true');summary.className='';summary.textContent=text().actionRechecking;await refresh();return;}const button=event.target.closest?.('[data-repair-action]');if(!button)return;event.preventDefault();event.stopPropagation();const action=button.dataset.repairAction;if(!action||button.disabled||activeRepairAction)return;activeRepairAction=action;renderPage();try{const response=await fetch('/api/action?action='+encodeURIComponent(action),{method:'POST',headers:{'X-Qiansi-Launcher':token}});const data=await response.json();if(!response.ok)throw new Error(data.error||text().actionFailed);if(data.completed){summary.textContent=text().actionCompleted;activeRepairAction='';await refresh();}else{activeRepairAction='';renderPage();summary.textContent=text().actionStarted;}}catch(error){activeRepairAction='';renderPage();summary.className='error';summary.textContent=text().actionFailed+': '+error.message;}});
  async function refresh(){try{const response=await fetch('/api/status',{headers:{'X-Qiansi-Launcher':token}});if(!response.ok)throw new Error(text().checkFailed);lastData=await response.json();renderPage();launch.dataset.url=lastData.canvasUrl;}catch(error){summary.className='error';summary.textContent=error.message;launch.disabled=true;}}
  manualInstall.addEventListener('click',()=>{if(launching||activeRepairAction||!lastData?.manualInstallActions?.length)return;lastManualTrigger=manualInstall;manualStatus={type:'',filename:'',detail:''};manualModal.hidden=false;document.body.classList.add('modal-open');renderManualDialog();manualDialogClose.focus();});
  manualDialogClose.addEventListener('click',closeManualDialog);manualModal.addEventListener('click',(event)=>{if(event.target===manualModal&&!runningManualAction)closeManualDialog();});document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!manualModal.hidden&&!runningManualAction)closeManualDialog();});
  manualToolList.addEventListener('click',async(event)=>{const button=event.target.closest?.('[data-manual-action]');if(!button||button.disabled||runningManualAction)return;const action=button.dataset.manualAction;const launcher=lastData?.manualInstallActions?.find(candidate=>candidate.id===action);if(!launcher)return;runningManualAction=action;manualStatus={type:'starting',filename:launcher.filename,detail:''};renderPage();try{const response=await fetch('/api/manual-install/run?action='+encodeURIComponent(action),{method:'POST',headers:{'X-Qiansi-Launcher':token}});const data=await response.json();if(!response.ok)throw new Error(data.error||text().manualInstallFailed);manualStatus={type:'started',filename:data.filename||launcher.filename,detail:''};}catch(error){manualStatus={type:'error',filename:launcher.filename,detail:error.message};}finally{runningManualAction='';renderPage();}});
  launch.addEventListener('click',async()=>{launching=true;renderPage();summary.className='';summary.textContent=text().waitingBridge;try{const response=await fetch('/api/start',{method:'POST',headers:{'X-Qiansi-Launcher':token}});const data=await response.json();if(!response.ok)throw new Error(data.error||text().startFailed);summary.textContent=format(text().enteringCanvas,{canvasUrl:data.canvasUrl});location.replace(data.canvasUrl);}catch(error){launching=false;summary.className='error';summary.textContent=error.message;await refresh();}});
  renderPage();
  refresh();setInterval(refresh,${STATUS_REFRESH_MS});
</script></body></html>`;
}

async function waitForBridge(port, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error(`Bridge 已退出，退出码 ${child.exitCode}。`);
    const health = await readBridgeHealth(port, AbortSignal.timeout(1_500));
    if (health) return health;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('Bridge 启动超时，请查看启动窗口中的错误信息。');
}

function openBrowser(url) {
  if (process.env.QIANSI_LAUNCHER_NO_BROWSER === '1') return false;
  const command =
    process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function runManualLauncher(action, installRoot) {
  const launcher = manualLauncherCatalog().find((candidate) => candidate.id === action);
  if (!launcher) throw new Error('不支持的手动安装工具。');
  const script = join(installRoot, 'tools', 'launchers', launcher.filename);
  if (!(await fileExists(script))) throw new Error('安装工具不存在，请重新获取完整源码。');
  const command =
    process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/c', 'start', '', 'cmd.exe', '/d', '/s', '/c', 'call', script]]
      : process.platform === 'darwin'
        ? ['open', [script]]
        : null;
  if (!command) throw new Error('当前系统不支持从启动中心运行这些安装工具。');
  const child = spawn(command[0], command[1], {
    cwd: installRoot,
    stdio: 'ignore',
    windowsHide: false,
  });
  await new Promise((resolveChild, rejectChild) => {
    child.once('error', (error) => rejectChild(new Error(`无法启动安装工具：${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveChild();
        return;
      }
      const result = signal ? `被信号 ${signal} 中止` : `退出码 ${code ?? '未知'}`;
      rejectChild(new Error(`系统未能打开安装工具（${result}）。`));
    });
  });
  return { started: true, filename: launcher.filename };
}

const LAUNCHER_REPAIR_ACTIONS = new Set([
  'install-app',
  'install-codex',
  'install-gemini',
  'open-ffmpeg-download',
]);

export async function runLauncherRepairAction(action, installRoot) {
  if (!LAUNCHER_REPAIR_ACTIONS.has(action)) throw new Error('不支持的启动中心处理操作。');
  if (action === 'open-ffmpeg-download') {
    if (!openBrowser('https://ffmpeg.org/download.html')) {
      throw new Error('无法打开浏览器，请手动访问 https://ffmpeg.org/download.html。');
    }
    return { completed: false };
  }

  const isApplicationInstall = action === 'install-app';
  const cliTarget = action === 'install-codex' ? '--codex' : '--gemini';
  let command;
  let args;
  if (process.platform === 'win32') {
    const script = join(
      installRoot,
      'tools',
      'launchers',
      isApplicationInstall ? '安装Qiansi-Canvas.bat' : 'qiansi-install.bat',
    );
    if (!(await fileExists(script))) throw new Error('安装程序不存在，请重新获取完整源码。');
    command = 'cmd.exe';
    args = [
      '/d',
      '/s',
      '/c',
      'call',
      script,
      ...(isApplicationInstall ? ['--repair'] : [cliTarget]),
    ];
  } else if (process.platform === 'darwin') {
    const script = join(
      installRoot,
      'tools',
      'launchers',
      isApplicationInstall ? '安装Qiansi-Canvas-macOS.command' : '安装CLI工具-macOS.command',
    );
    if (!(await fileExists(script))) throw new Error('安装程序不存在，请重新获取完整源码。');
    command = 'zsh';
    args = [script, ...(isApplicationInstall ? ['--repair'] : [cliTarget])];
  } else {
    throw new Error('当前系统暂不支持从启动中心自动安装，请按安装指南手动处理。');
  }

  const child = spawn(command, args, {
    cwd: installRoot,
    detached: !isApplicationInstall,
    stdio: 'inherit',
    windowsHide: false,
  });
  if (!isApplicationInstall) {
    child.once('error', (error) => console.error(`启动安装程序失败：${error.message}`));
    child.unref();
    return { completed: false };
  }

  await new Promise((resolveChild, rejectChild) => {
    child.once('error', (error) => rejectChild(new Error(`无法启动安装程序：${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveChild();
        return;
      }
      const result = signal ? `被信号 ${signal} 中止` : `退出码 ${code ?? '未知'}`;
      rejectChild(new Error(`一键安装 / 修复未完成（${result}），请查看启动窗口中的错误信息。`));
    });
  });
  return { completed: true };
}

export async function startLaunchCenter(options = {}) {
  const installRoot = resolve(options.installRoot || DEFAULT_INSTALL_ROOT);
  const bridgePort = Number(
    options.bridgePort || process.env.QIANSI_CANVAS_BRIDGE_PORT || DEFAULT_BRIDGE_PORT,
  );
  const token = randomBytes(24).toString('base64url');
  let bridgeChild = null;
  let bridgeStartPromise = null;
  let repairActionPromise = null;
  const repairActionRunner = options.repairActionRunner || runLauncherRepairAction;
  const manualInstallRunner = options.manualInstallRunner || runManualLauncher;

  const startBridge = async () => {
    const diagnostics = await collectLauncherDiagnostics({ installRoot, bridgePort });
    if (!diagnostics.ready) throw new Error('画布核心尚未就绪，请先处理检查页面中的问题。');
    if (diagnostics.running) return diagnostics.canvasUrl;
    if (bridgeStartPromise) return bridgeStartPromise;

    bridgeStartPromise = (async () => {
      const environment = { ...process.env, QIANSI_CANVAS_BRIDGE_PORT: String(bridgePort) };
      if (process.platform === 'win32' && environment.QIANSI_CANVAS_LAN === undefined) {
        environment.QIANSI_CANVAS_LAN = '1';
        environment.QIANSI_CANVAS_TRUSTED_LAN = environment.QIANSI_CANVAS_TRUSTED_LAN || '1';
      }
      environment.QIANSI_CANVAS_HOST =
        environment.QIANSI_CANVAS_LAN === '1'
          ? environment.QIANSI_CANVAS_HOST || '0.0.0.0'
          : environment.QIANSI_CANVAS_HOST || '127.0.0.1';
      bridgeChild = spawn(process.execPath, [join(installRoot, 'local-bridge.mjs')], {
        cwd: installRoot,
        env: environment,
        stdio: 'inherit',
        windowsHide: false,
      });
      bridgeChild.once('exit', () => {
        bridgeChild = null;
        bridgeStartPromise = null;
      });
      await waitForBridge(bridgePort, bridgeChild);
      return `${bridgeOrigin(bridgePort)}/`;
    })();
    try {
      return await bridgeStartPromise;
    } catch (error) {
      bridgeStartPromise = null;
      throw error;
    }
  };

  const handleRequest = async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(launchCenterHtml(token));
      return;
    }
    if (request.headers['x-qiansi-launcher'] !== token) {
      response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: '启动中心会话无效，请重新双击启动文件。' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/status') {
      const diagnostics = await collectLauncherDiagnostics({ installRoot, bridgePort });
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(diagnostics));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/action') {
      const action = url.searchParams.get('action') || '';
      const diagnostics = await collectLauncherDiagnostics({ installRoot, bridgePort });
      const availableActions = new Set(
        [...diagnostics.core, ...diagnostics.optional]
          .map((item) => item.meta?.action)
          .filter(Boolean),
      );
      if (!availableActions.has(action)) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: '该处理操作当前不可用，请重新检查状态。' }));
        return;
      }
      if (repairActionPromise) {
        response.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: '已有安装或修复任务正在执行，请等待完成。' }));
        return;
      }
      repairActionPromise = Promise.resolve(repairActionRunner(action, installRoot));
      try {
        const result = await repairActionPromise;
        const completed = result?.completed === true;
        response.writeHead(completed ? 200 : 202, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(JSON.stringify({ ok: true, completed }));
      } finally {
        repairActionPromise = null;
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/manual-install/run') {
      const action = url.searchParams.get('action') || '';
      const diagnostics = await collectLauncherDiagnostics({ installRoot, bridgePort });
      const launcher = diagnostics.manualInstallActions.find(
        (candidate) => candidate.id === action,
      );
      if (!launcher) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: '该安装工具当前不可用。' }));
        return;
      }
      await manualInstallRunner(action, installRoot);
      response.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, filename: launcher.filename }));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/start') {
      try {
        const canvasUrl = await startBridge();
        console.log(`启动中心正在进入无限画布：${canvasUrl}`);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ ok: true, canvasUrl }));
      } catch (error) {
        response.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(
          JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        );
      }
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  };
  const server = createHttpServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (response.headersSent) {
        if (error instanceof Error) response.destroy(error);
        else response.destroy();
        return;
      }
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      );
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen({ host: '127.0.0.1', port: Number(options.centerPort || 0) }, resolveListen);
  });
  const address = server.address();
  const centerUrl = `http://127.0.0.1:${address.port}/`;
  console.log('============================================================');
  console.log('  Qiansi-Canvas 启动中心');
  console.log('============================================================');
  console.log(`启动中心：${centerUrl}（仅用于环境检查）`);
  console.log(`无限画布目标：${bridgeOrigin(bridgePort)}/`);
  console.log('在浏览器中完成检查后，点击“打开无限画布”。');
  if (options.openBrowser !== false && !openBrowser(centerUrl)) {
    console.log('未能自动打开浏览器，请手动复制上面的地址。');
  }

  const stop = () => {
    if (bridgeChild && bridgeChild.exitCode === null) bridgeChild.kill();
    return new Promise((resolveStop) => {
      if (!server.listening) {
        resolveStop();
        return;
      }
      server.close(resolveStop);
    });
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  return {
    server,
    centerUrl,
    canvasUrl: `${bridgeOrigin(bridgePort)}/`,
    token,
    startBridge,
    stop,
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(LAUNCHER_ENTRY);
if (invokedDirectly) {
  startLaunchCenter().catch((error) => {
    console.error(
      `Qiansi-Canvas 启动中心失败：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
