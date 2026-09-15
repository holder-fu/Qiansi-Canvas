# Qiansi-Canvas（千丝无限画布）

Qiansi-Canvas 是一个面向 AI 动漫、影视和多媒体工作流的本地无限画布创作平台。它把脚本、角色参考、图片、视频、音频、导演台、素材和生成流程组织在同一张可视化画布中，并通过本机 Bridge 保存项目与媒体。

> 当前版本以根目录 `package.json` 的 `version` 字段为准。重要项目请自行保留备份；本机 Bridge 只应运行在可信设备和可信局域网中，不建议直接暴露到公网。

## 主要能力

- 多项目无限画布、节点连接、自动保存、回收站和项目封面。
- 文本、图片、视频、音频及动态 WebP 素材节点。
- 故事脚本、角色三视图、首帧图生视频、音频生视频等创作入口。
- 2D/3D 导演台、图片编辑、视频剪辑、分镜与镜头运动工具。
- 提示词库、风格库、角色库、特效库、资产库和插件工作台。
- 可选的本机 CLI、OpenAI 兼容接口、ComfyUI 和第三方模型服务集成。
- 可信局域网中的画布协作与受管媒体访问。

AI 模型、API Key、第三方 CLI、插件和模型权重不是启动画布的必需项，也不会随开源源码自动提供。

## 环境要求

- 普通用户请使用对应系统和架构的绿色运行包。包内已经包含固定 Node.js 运行环境和预构建画布，不需要安装 Node.js、npm、TypeScript 或 Vite。
- 只有从源码开发、修改或重新构建 Qiansi-Canvas 时，才需要 Node.js 22.12.0 或更高版本及 npm。
- Windows 10/11 64 位、仍受安全更新支持的 macOS，或常见桌面 Linux 发行版。
- 较新版本的 Chrome、Edge、Safari 或 Firefox；涉及 WebGL、麦克风和视频能力时优先使用 Chrome 或 Edge。
- 绿色运行包打开画布本身不需要联网；调用在线模型或安装可选 AI CLI 时才需要网络连接。

## 快速开始

完整说明见 [安装与启动指南](./安装与启动指南.md)。

### Windows

1. 解压对应架构的绿色运行包。
2. 双击唯一的普通用户入口 `Qiansi-Canvas-windows.bat`。
3. 浏览器会先打开使用随机临时端口的“Qiansi-Canvas 启动中心”，清楚显示画布核心和可选创作能力的安装状态；右上角可切换简体中文、English、日本語、한국어或Español，该选择只翻译启动页。
4. 启动中心会同时显示真正的无限画布地址（默认 `http://127.0.0.1:2895/`）。画布核心全部正常后点击“打开无限画布”，当前页面会直接进入该地址。

绿色运行包无需单独配置系统 PATH，也不会运行 npm、tsc、Vite 或现场构建。源码仓库根目录同时提供 `Qiansi-Canvas-windows.bat` 和 `Qiansi-Canvas-macOS.command` 两个带平台标识的普通入口；安装、开发、CLI 和兼容入口统一放在 `tools/launchers/`。

本机安装了 Qiansi Motion Captur 插件时，Windows 还提供两个互不依赖的动作捕捉入口：

- 双击 `Qiansi-Canvas-windows.bat`，进入无限画布后以插件方式打开动作捕捉。
- 双击 `Qiansi-Motion-Captur-windows.bat`，只启动独立版动作捕捉，不启动无限画布或 Canvas Bridge。

两种入口共用 `data/plugins/qiansi-motion-capture/` 内的程序、模型和 Worker；独立版项目记录保存在插件自己的 `standalone-data/` 中，不会写入画布项目。

### macOS

绿色运行包首次使用时在终端进入目录并执行：

```zsh
chmod +x Qiansi-Canvas-macOS.command
```

随后双击 `Qiansi-Canvas-macOS.command`，在启动中心检查完成后打开无限画布。Apple Silicon 与 Intel 使用不同的绿色包；包内已经包含对应架构的 Node.js。未签名包第一次打开仍可能需要在 Finder 中按住 Control 点击并选择“打开”。

### Linux / 通用命令行

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
export QIANSI_CANVAS_HOST=127.0.0.1
node local-bridge.mjs
```

Windows PowerShell 中可使用：

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
$env:QIANSI_CANVAS_HOST = '127.0.0.1'
node local-bridge.mjs
```

## 开发

安装依赖：

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

启动完整开发环境（推荐）：

```bash
npm run dev
```

- 画布页面：`http://127.0.0.1:2895`
- 开发 Bridge：`http://127.0.0.1:2896`
- `npm run dev:canvas` 是完整开发环境的兼容别名。
- 只有排查纯前端显示问题时才使用 `npm run dev:web`；它不提供项目目录和画布持久化。

常用验证命令：

```bash
npm test
npm run quality
npm run build:check
```

`build:check` 在临时目录验证生产构建，不替换正在使用的画布。需要更新本机运行产物时再执行 `npm run build`：先准备完整资源，最后切换入口，并保留旧页面可能仍需加载的哈希资源。不要在用户使用期间直接运行原始 `vite build` 清空服务目录。详见 [页面更新与编辑保护](docs/WEB_UPDATE_SAFETY.md)。

`npm test` 运行公开源码中可复现的 Vitest 与 Node 合同测试。Qiansi Audio Studio 已拆分到独立的 `Qiansi-Audio-Studio` 仓库，其 Python 安装器、模型清单与独立程序测试不再由 Qiansi-Canvas CI 运行。

## 本地数据与安全

- `data/` 保存项目、素材、插件、模型、本机索引和本机设置；这些运行数据已被 Git 忽略。公开源码只保留 `data/canvas-themes/` 中明确列出的内置主题说明/安装资源，不发布 `data/plugins/`。Qiansi Audio Studio 的程序、一键安装器、模型清单、测试和发行工具由独立的 `Qiansi-Audio-Studio` 仓库提供。
- 公开源码使用 `public/prompt-library/library.opensource.json` 作为空提示词库种子；本机采样缩略图与 `library.json` 不进入公开仓库，用户可在界面中添加或导入自己有权使用的记录。
- `tools/runtime/` 保存项目专用 Node.js，`tools/cache/npm/` 保存可复用的依赖下载缓存；它们属于程序依赖，不进入用户数据目录。
- 不要提交 `.env`、API Key、Cookie、凭据库、生成素材或个人项目数据。
- 默认只在本机回环地址使用。局域网功能只应在可信专用网络中开启，TCP 2895 不应直接暴露到公网。
- 主题、快捷键和部分界面偏好保存在当前浏览器；项目与受管媒体由本机 Bridge 管理。
- 第三方模型、API、CLI、插件和素材继续受各自许可证、服务条款与隐私规则约束。

## 可选媒体工具

Windows 的部分媒体校验、预览和导出能力使用 FFmpeg/FFprobe。大型可执行文件不进入普通 Git 源码历史；其来源、版本和校验信息见 [tools/README.md](./tools/README.md) 与 [tools/FFmpeg-README.txt](./tools/FFmpeg-README.txt)。发行包应按对应许可证单独提供或在安装阶段获取并校验。

## 项目结构

```text
src/                 React/TypeScript 应用源码
public/              浏览器运行所需的公开静态资源
docs/                Bridge、媒体持久化和插件等技术文档
scripts/             项目检查与 CI 辅助脚本
local-bridge.mjs      本机项目、媒体与受控集成服务
data/                 本机运行数据；仅提交明确列出的内置主题安装资源
tools/                媒体工具说明与可选本机二进制
```

Bridge、媒体持久化、插件与工作台的公开技术说明集中在 [docs/](./docs/)；内部开发状态与本机验证记录不包含在公开源码包中。

版本变更见 [CHANGELOG.md](./CHANGELOG.md)，安全问题的私下报告方式见 [SECURITY.md](./SECURITY.md)。

## 贡献

提交 Issue 时请提供可复现步骤、系统与浏览器版本，并移除 API Key、私人素材和项目数据。代码、文档或其他可版权化贡献在合并前需要完成贡献者许可安排，详情见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证与内容权利

项目原创源代码和项目文档采用双许可证模式：

- 开源路径：[GNU GPL v3 或任何后续版本](./LICENSE)。GPL 允许商业使用，但传播软件时必须履行对应的源码和许可义务。
- 闭源商业路径：需要与版权人另行签署商业许可，具体边界见 [许可策略](./LICENSING.md)。

GPL 路径允许合规收费分发，但第三方发行或收费服务不代表官方授权。未经书面授权，不得冒充官方、以官方授权名义宣传，或以容易造成来源混淆的方式使用 Qiansi-Canvas 名称与标识；修改版应明确标注“非官方版本”。完整边界见 [许可策略](./LICENSING.md)。

独立插件在满足 [许可策略中的插件例外](./LICENSING.md#插件) 时可以采用自己的许可证。Qiansi Audio Studio 不随本仓库发布；它在独立的 `Qiansi-Audio-Studio` 仓库中以 MIT 许可维护第一方程序代码、测试、清单与文档，第三方引擎、模型、权重、音色和运行环境仍遵守各自条款。用户使用本软件创作或导入的内容仍归用户或其原权利人；完整边界统一见 [许可策略](./LICENSING.md)。第三方依赖概览见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

```text
Copyright (c) 2026 holder（老树苗）
```

商业许可咨询：`46168745@qq.com`

项目主页：[github.com/holder-fu](https://github.com/holder-fu/)

---

## English summary

Qiansi-Canvas is a local-first infinite canvas for AI animation, filmmaking and multimedia workflows. It organizes scripts, references, images, video, audio, directing tools, assets and generation flows in one visual workspace.

The portable end-user package includes its own Node.js runtime and prebuilt canvas, so npm is only required for source development. See the [installation guide](./安装与启动指南.md) for Windows, macOS and Linux instructions.

Original project code and documentation are available under `GPL-3.0-or-later`, with a separately signed commercial license available for closed-source distribution. User-created content is not automatically covered by the software license. See [LICENSING.md](./LICENSING.md) for details.
