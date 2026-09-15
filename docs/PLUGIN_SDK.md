# Qiansi-Canvas 插件 SDK（v2）

Qiansi-Canvas v2 插件是一个以根目录 `plugin.json` 为入口的插件文件夹，也可以通过设置页导入小型平铺文件包。v1 声明式节点/挂件仍兼容；只有 v2 可以运行代码、增加面板、画布右键菜单和完整界面语言包。

## 安装包

- 在设置 → 插件中同时选择 `plugin.json`、运行时和清单声明的素材文件。
- 完整目录型插件可直接复制到 `data/plugins/<任意目录名>/`；重新打开或刷新插件设置后，宿主从该目录根部读取 `plugin.json`。普通插件的目录名不作为插件 ID，清单中的 `id` 才是稳定身份。例外是宿主编译时内置的受信任多模型音频伴随包：`qiansi-audio` 必须安装到同名规范目录，宿主还会分别绑定六个引擎的 worker 摘要后才允许启动。
- 设置页导入的文件名必须是平铺的安全相对文件名，不能包含目录穿越；沙箱运行时入口只接受 `.js` / `.mjs`，声明式只读文本素材可以使用 `.json`、`.txt`、`.md` 或 `.css`。受信任音频包的嵌套 Python、源码与模型目录不由清单声明为沙箱素材。
- 设置页平铺导入的单包最多 64 个文件、12 MB；运行时最多 2 MB。包含绿色 Python 与模型的大型受信任音频包不走文件导入，而是完整复制到规范目录后由目录扫描发现。
- 请求了画布权限的 v2 插件导入后默认关闭，用户检查权限和运行时 SHA-256 后再手动启用。
- 纯语言插件不需要运行时或画布权限；必须同时选择 `plugin.json` 和清单声明的语言 JSON。

## 版本兼容

插件自身的 `version`、Canvas 版本和 Bridge 启动版本彼此独立，不要求相同。`engine.qiansiCanvas` 只描述插件所需的最低 Canvas 宿主能力；普通插件应写成 `">=最低可用版本"`，例如 `">=1.55.0"`。这样插件在 Canvas 1.55.0、1.56.1 及后续兼容版本中都可以继续使用，无需仅因 Canvas 升级而同步提高插件版本。

只有插件实际开始调用较新宿主 API 时，才需要提高 `engine.qiansiCanvas` 的最低版本。直接填写不带 `>=` 的版本表示有意要求精确匹配，不建议用于普通第三方插件。Bridge 会按磁盘上当前有效的 Canvas 版本计算兼容性；即使 Bridge 进程早于本次 Canvas 更新启动，也不会再把自己的启动版本当成插件门禁。更新过程中若 `package.json` 暂时不可读或无效，Bridge 会安全回退到启动时版本，待文件有效后下一次目录刷新会自动采用新版本。

## 完整界面语言包

语言插件通过 `contributes.locales` 注册 BCP 47 语言代码。`zh-CN` 和 `en-US` 是受保护的内置语言，插件不能覆盖。安装器只接受同目录 `.json` 文件；运行时还会校验语言代码、2 MB 上限、非空字符串和动态占位符。

```json
{
  "schemaVersion": 2,
  "id": "example-en-gb-language-pack",
  "name": "English (UK) Language Pack",
  "version": "1.0.0",
  "permissions": [],
  "contributes": {
    "locales": [
      {
        "locale": "en-GB",
        "nativeName": "English (UK)",
        "file": "en-GB.json",
        "direction": "ltr"
      }
    ]
  }
}
```

`en-GB.json` 的格式如下：

```json
{
  "locale": "en-GB",
  "translations": {
    "settings.title": "Qiansi-Canvas Settings"
  }
}
```

实际文件必须包含“设置 → 插件 → 下载语言包示例”所生成的全部英文键，不能只包含上方片段。完整性门禁会以当前版本的内置英文为基准，因此设置页、画布节点、编辑器、导演台、素材库和共享弹窗拥有相同覆盖范围；缺少任何键或改变 `{count}`、`{name}` 等占位符都会阻止加载。额外键允许用于同一插件自己的显示文案。

语言文件只改变明确接入 i18n 的显示文本和本地化格式。模型/节点 ID、API/提示词协议、持久化枚举、项目文件以及用户输入内容不会被翻译或改写。停用、卸载或校验失败时，该语言从选择列表移除；若用户正在使用它，界面安全回退到简体中文。

```json
{
  "schemaVersion": 2,
  "id": "example-story-tools",
  "name": "故事工具",
  "version": "1.0.0",
  "runtime": { "entry": "runtime.js", "apiVersion": 1 },
  "permissions": ["canvas:add-node", "canvas:notify"],
  "contributes": {
    "nodes": [
      {
        "id": "shot-card",
        "label": "镜头卡",
        "hostKind": "plugin",
        "renderer": "sandbox",
        "view": "shot-card",
        "input": "text",
        "output": "video",
        "width": 420,
        "height": 280
      }
    ],
    "panels": [
      {
        "id": "story-panel",
        "label": "故事面板",
        "position": "right",
        "view": "story-panel",
        "width": 360,
        "height": 520
      }
    ],
    "menus": [
      {
        "id": "add-shot-card",
        "label": "新增镜头卡",
        "location": "canvas",
        "action": { "type": "add-node", "nodeId": "shot-card" }
      },
      {
        "id": "open-story-panel",
        "label": "打开故事面板",
        "location": "canvas",
        "action": { "type": "open-panel", "panelId": "story-panel" }
      }
    ]
  }
}
```

节点贡献的 `hostKind` 可以是 `plugin`、`text`、`image`、`video`、`audio`、`director-2d` 或 `director-3d`。`plugin + sandbox` 用插件自己的界面；其他类型复用宿主节点和对应的图片、视频、音频或导演台能力。

面板贡献的 `position` 支持 `left`、`right`、`bottom`、`floating` 和 `fullscreen`。`fullscreen` 会注册为可从插件设置卡片直接打开的全屏工作台，不会在画布左侧额外生成固定启动按钮；使用 `Esc` 或页面关闭按钮返回，沙箱和权限边界与普通面板相同。全屏音频工作台可以生成并保存素材。音频生成器可声明 `"canvasOutput": "audio-node"`，在不贡献插件节点或“添加插件节点”菜单的前提下，把每次生成结果同时写回当前画布的原生音频节点；不声明时结果仍只进入素材库。

沙箱节点还可以声明 `presentation: "immersive"`，把清单中的 `width` × `height` 作为完整交互视口；未声明时默认使用 `presentation: "card"`，继续显示宿主的通用插件卡片。沉浸节点未选中时 iframe 暂不接收指针和滚轮，用户可以正常选择、拖动画布节点或缩放无限画布；节点选中后 iframe 才接管场景内的拖拽、滚轮和键盘交互，节点外侧的宿主操作条仍用于移动或删除节点。沉浸 iframe 获得浏览器全屏能力，运行时可以在明确的用户点击中调用 `document.documentElement.requestFullscreen()`；用户仍可用浏览器的退出全屏操作返回同一个画布节点和运行时会话。

## 沙箱 API

运行时只通过 `window.qiansi` 调用经过授权的能力，不接触 React、Zustand、本地桥、密钥保险箱或宿主 DOM。

```js
const { context } = window.qiansi;
document.querySelector('#root').innerHTML = `<button id="create">${context.pluginName}</button>`;

document.querySelector('#create').onclick = async () => {
  const result = await window.qiansi.addNode({
    kind: 'video',
    position: { x: 120, y: 160 },
    data: { title: '插件视频', prompt: '镜头缓慢推进' },
  });
  await window.qiansi.notify(`已创建 ${result.nodeId}`);
};
```

`context.launchMode` 会在 iframe 创建时固定为 `"canvas"` 或 `"standalone"`：宿主创建 iframe 时若处于画布工作区则为前者，若处于首页工作区则为后者。因此从画布菜单打开属于画布模式，从首页直接打开属于独立模式；设置页打开时则沿用其下方工作区。插件可以据此隐藏只对画布有意义的入口；宿主不会在面板打开后因工作区切换而改写该值。

| API                                                                           | 权限                          | 说明                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateOwnNode(patch)`                                                        | `canvas:update-own-node`      | 只更新当前插件节点允许的标题、描述、提示词、输出和生成参数字段                                                                                                                                                                                                                                                                                                 |
| `addNode(request)`                                                            | `canvas:add-node`             | 新增宿主文本、图片、视频、音频、2D/3D 导演台节点                                                                                                                                                                                                                                                                                                               |
| `createProjectGraph(request)`                                                 | `canvas:create-project-graph` | API v2：幂等地创建并打开一个新宿主项目；请求使用 `{ applicationId, name, nodes, edges, retryFailed? }`，一次最多写入 240 个原生节点和 480 条连线，节点图不超过 4 MiB；不会自动运行模型                                                                                                                                                                         |
| `readSelection()`                                                             | `canvas:read-selection`       | 读取去除了供应商、密钥和内部状态的当前选择快照                                                                                                                                                                                                                                                                                                                 |
| `readSelectedImage()`                                                         | `canvas:read-selection`       | API v2：仅在 `context.launchMode === "canvas"` 时读取最近选中的一个图片节点；宿主只解析当前 `selectedNodeId`，校验图片内容后登记为当前插件 iframe 会话的 opaque `mediaId`，返回 `{ mediaId, kind, providerId, model, title }`，不枚举全画布，也不返回原始 URL、字节或本机路径                                                                                   |
| `readManagedCanvasImageCopy({ mediaId })`                                     | `canvas:read-selection`       | API v2：仅对用户通过 `readSelectedImage()` 或宿主选择器明确选中的 Canvas 图片句柄，返回 `{ mediaId, kind: 'image', imageUrl }`；沙箱引导层从宿主传入的原始图片 Blob 创建会话级 `blob:` 地址，供插件制作独立持久化副本。模型生成媒体、视频、伪造／跨插件／跨会话句柄均拒绝；原始 URL 与本机路径仍不返回插件。 |
| `readSelectedVideo()`                                                         | `canvas:read-selection`       | API v2：仅在 `context.launchMode === "canvas"` 时读取当前选中视频节点，宿主校验节点、媒体来源与类型后传回 `{ bytes, mimeType, fileName, size }`；支持 MP4／WebM／MOV，单次上限 256 MB，不返回媒体 URL                                                                                                                                                          |
| `readOwnImage({ portId, index })`                                             | `canvas:read-own-image`       | API v2：由宿主读取当前插件节点指定输入端口上的图片并传回 `{ bytes, mimeType, fileName }`；只接受受信任的画布媒体地址，单张上限 64 MB                                                                                                                                                                                                                           |
| `notify(message)`                                                             | `canvas:notify`               | 显示限长的插件通知                                                                                                                                                                                                                                                                                                                                             |
| `readAsset(name)`                                                             | `assets:read`                 | 读取 `plugin.json#assets` 已声明的本地素材为 `ArrayBuffer`                                                                                                                                                                                                                                                                                                     |
| `readPreference(key)`                                                         | `storage:preferences`         | API v2：读取当前插件命名空间中的 JSON 偏好；不存在时返回 `null`                                                                                                                                                                                                                                                                                                |
| `writePreference(key, value)`                                                 | `storage:preferences`         | API v2：保存当前插件专属的 JSON 偏好并返回规范化后的值                                                                                                                                                                                                                                                                                                         |
| `deletePreference(key)`                                                       | `storage:preferences`         | API v2：删除当前插件命名空间中的指定偏好，返回 `{ deleted }`                                                                                                                                                                                                                                                                                                   |
| `readProjectDocument(key)`                                                    | `storage:project-documents`   | API v2：读取当前插件＋该 iframe 启动时来源画布项目命名空间中的版本化 JSON 文档；返回 `{ key, value, revision, updatedAt }` 或 `null`                                                                                                                                                                                                                           |
| `writeProjectDocument(key, value, expectedRevision?)`                         | `storage:project-documents`   | API v2：以修订号 CAS 写入该 iframe 来源项目文档，返回更新后的文档快照；单文档最多 16 MiB                                                                                                                                                                                                                                                                       |
| `deleteProjectDocument(key, expectedRevision?)`                               | `storage:project-documents`   | API v2：删除当前插件＋该 iframe 来源画布项目中修订匹配的文档，返回 `{ deleted }`                                                                                                                                                                                                                                                                               |
| `readSharedStyleCover(styleId)`                                               | `storage:shared-style-covers` | API v2：读取当前插件跨项目共享的受管 WebP 封面；返回包含 `dataUrl`、哈希、尺寸与修订号的快照或 `null`                                                                                                                                                                                                                                                          |
| `writeSharedStyleCover(styleId, cover, expectedRevision?)`                    | `storage:shared-style-covers` | API v2：以 CAS 写入不超过 768 KiB、最大边 1600 的 WebP；`cover` 只接受 `{ dataUrl, fileName, width, height }`，不能提交路径                                                                                                                                                                                                                                    |
| `deleteSharedStyleCover(styleId, expectedRevision?)`                          | `storage:shared-style-covers` | API v2：删除当前插件该风格的共享封面，返回 `{ deleted }`                                                                                                                                                                                                                                                                                                       |
| `listManagedTextModels()`                                                     | `models:use-text`             | API v2：列出宿主已启用且可用的文本模型公开标识与能力；不返回 API Key、认证头或连接密钥                                                                                                                                                                                                                                                                         |
| `runManagedTextModel(request)`                                                | `models:use-text`             | API v2：由宿主用已验证连接执行 `{ providerId, model, operation, prompt, temperature?, maxLength? }`；插件不能指定任意网络端点                                                                                                                                                                                                                                  |
| `listManagedImageModels()`                                                    | `models:use-media`            | API v2：列出宿主已启用且具备真实图片适配器的公开模型能力；不返回连接地址或凭据                                                                                                                                                                                                                                                                                 |
| `listManagedVideoModels()`                                                    | `models:use-media`            | API v2：列出宿主已启用且具备真实视频适配器的公开模型能力；每个视频模型都返回 `videoAudioOutput: true`，表示插件可独立提交 `audio: true/false`，不代表上游一定产出音轨                                                                                                                                                                                           |
| `runManagedImageModel(request)`                                               | `models:use-media`            | API v2：单次固定生成 1 张图片；请求仅接受 `{ providerId, model, prompt, requestId?, size?, aspectRatio?, quality?, referenceMediaIds? }`，返回不含 URL/字节的受管媒体句柄                                                                                                                                                                                                          |
| `runManagedVideoModel(request)`                                               | `models:use-media`            | API v2：单次固定生成 1 段视频；请求仅接受 `{ providerId, model, prompt, requestId?, duration?, aspectRatio?, resolution?, audio?, referenceMediaIds? }`，参考项只能是同一会话先前生成的图片；返回结果含 `audioRequested` 与 FFprobe 实测的 `audioTrackStatus`                                                                                                                                 |
| `captureManagedVideoFrame({ mediaId, position })`                             | `media:transform`             | API v2：由宿主在浏览器内解码当前插件会话的受管视频，并截取 `position: 'first' | 'last'`；返回新的 opaque 图片 `mediaId` 及宽高，不返回视频 URL、像素字节或本地路径。截帧不调用模型；来源跨会话、非视频、不可解码、跨域像素不可读或输出超限时 fail-closed                                                                                          |
| `previewManagedMedia({ mediaId })`                                            | `models:use-media`            | API v2：为当前会话的受管图片生成宽度受限的 WebP 缩略图，并向插件代码返回 `{ mediaId, kind: 'image', previewUrl }`；沙箱引导层用宿主返回的缩略数据在 iframe 内创建可撤销 `blob:` 展示地址，它不是原图 URL，也不支持视频                                                                                                                                         |
| `inspectManagedMedia({ mediaId })`                                            | `models:use-media`            | API v2：仅检查当前插件 iframe 会话仍登记的句柄，返回 `{ mediaId, kind, providerId, model }`；视频还返回 `audioRequested` 与 `audioTrackStatus`；失效或跨会话句柄明确失败                                                                                                                                                                                     |
| `downloadManagedMedia({ mediaId, fileName? })`                                | `models:use-media`            | API v2：宿主直接下载当前会话登记的媒体并返回 `{ status: 'downloaded', mediaId, fileName }`；媒体字节和底层 URL 不经过 `postMessage`                                                                                                                                                                                                                            |
| `listPoseEngines()`                                                           | `vision:pose`                 | API v2：列出宿主认可的动作捕捉引擎及其模型、骨架、关节数、坐标空间、手／脸／多人能力和当前可用状态。内置 Motion Captur 只列出 `gem-x` 与 `rtmw3d`；只有独立 Qiansi AI Motion Worker 及对应模型真实就绪后才会标记为 `available: true`，未安装时返回 `runtime-required`，不会静默改用 MediaPipe。                                                                |
| `installPoseEngine(engineId, onProgress)`                                     | `vision:install`              | API v2，仅受信任 `qiansi-motion-capture`：安装固定目录中的 `gem-x` 或 `rtmw3d` 官方模型包并轮询进度。调用方不能提交 URL 或路径；下载先进入插件 `models/.installing/`，固定字节数完整后再原子移动到 `models/<engineId>/`。                                                                                                                                      |
| `readPoseEngineInstallStatus(engineId)` / `cancelPoseEngineInstall(engineId)` | `vision:install`              | 读取或取消固定动作模型安装；仅接受 `gem-x`、`rtmw3d`。                                                                                                                                                                                                                                                                                                         |
| `uninstallPoseEngine(engineId)`                                               | `vision:install`              | 删除当前插件 `models/<engineId>/` 对应模型包；不会删除动作捕捉项目数据、视频或其他引擎。                                                                                                                                                                                                                                                                       |
| `startPoseVideoCapture(request)`                                              | `vision:pose`                 | API v2，仅受信任 `qiansi-motion-capture`：把一个 MP4／WebM／MOV `ArrayBuffer` 提交给宿主管理的 GEM-X 或 RTMW3D 本机任务。请求固定包含引擎、文件名、时长／尺寸、5／10／15 FPS、1–4 人、关键点置信度、时序平滑、`staticCamera`、人体检测阈值、`iou`／`oks` 跟踪方式和跟踪阈值；GEM-X 使用相机假设，RTMW3D 使用检测／跟踪项。视频上限 256 MB／90 秒。返回不含路径的任务 ID 与进度快照。 |
| `readPoseVideoCaptureStatus(engineId, jobId)`                                | `vision:pose`                 | 读取当前受信任插件的动作任务状态、阶段、完成帧数和进度；任务 ID 与引擎必须匹配。                                                                                                                                                                                                                                                                                 |
| `readPoseVideoCaptureResult(engineId, jobId)`                                | `vision:pose`                 | 任务完成后返回有界动作帧。GEM-X 为 `qiansi-soma-77`，RTMW3D 为 `qiansi-coco-wholebody-133`；两者前 33 点均采用导演台规范顺序，后续点保留原生手／脸／脚数据，包含稳定 `trackId`、屏幕坐标和 3D 坐标。                                                                                                                                            |
| `cancelPoseVideoCapture(engineId, jobId)`                                    | `vision:pose`                 | 取消正在运行的本机 AI 动作任务并触发临时视频清理。同一宿主一次只运行一个 GPU 动作任务，防止多个模型同时占满显存。                                                                                                                                                                                                                                               |
| `listDepthModels()`                                                           | `vision:pose`                 | API v2，仅受信任 `qiansi-motion-capture`：列出固定的 `depth-anything-v2-small` Q8 ONNX 与 `sapiens2-normal-0.4b`，并分别报告权重安装及 Worker 健康状态。为兼容旧版宿主，白模读取沿用 `vision:pose` 权限。 |
| `installDepthModel(modelId, onProgress)`／`readDepthModelInstallStatus(modelId)`／`cancelDepthModelInstall(modelId)`／`uninstallDepthModel(modelId)` | `vision:install` | 安装、查询、取消或删除固定的 Depth Anything V2 Small／Sapiens2 Normal 0.4B。Sapiens2 权重已存在而 Worker 缺失时，同一安装入口继续安装插件目录内的隔离 Python 3.12、PyTorch CUDA 和固定官方源码；调用方不能提交 URL、路径或命令。 |
| `renderDepthFrame(request)`                                                   | `vision:pose`                 | API v2，仅受信任 `qiansi-motion-capture`：请求通过 `modelId` 明确选择模型。Depth Anything 使用 WebGPU／WASM、392／518／686 输入及反相、黑白点、Gamma、时序平滑后返回 WebP 灰度帧；Sapiens2 使用持久 Python/PyTorch CUDA Worker 和官方 1024 × 768 配置返回逐像素表面法线 WebP，模型只在首帧载入并按时间顺序复用。两条路径都不上传视频、不生成可旋转几何体；Sapiens2 当前保留完整画面，不强制人物分割蒙版。 |
| `detectPoseFrame(request)`                                                    | `vision:pose`                 | API v2：对一张本地解码的视频帧执行 MediaPipe Full 33 点人体姿态识别；请求仅接受小于 1.5 MB 的 JPEG／PNG／WebP `ArrayBuffer`、时间戳、16–1280 像素尺寸与可选 `maxPoses`（1–4，默认 1）。结果的 `poses` 返回每个人的规范化关键点、近似世界坐标与平均关键点可见度，并保留置信度最高人物的顶层字段供旧插件兼容；不上传源视频。可见度不是带人工真值的坐标误差精度。 |
| `mountPoseRigPreview({ canvas, modelId, view })`                              | `vision:pose`                 | API v2：插件自己的 `HTMLCanvasElement` 留在沙箱内，仅用于显示宿主返回的 `ImageBitmap`；宿主读取画布内置的 `studio-mannequin.glb`，创建独立 OffscreenCanvas，并把画布和模型字节一次性交给专用 3D Worker 驱动同一套蒙皮骨骼。帧返回采用逐帧确认，较新的姿态会合并而不会无界堆积。当前只接受 `modelId: "studio-mannequin"` 和 `view: "mapping"                    | "director"`。控制器 `update(frame)`兼容 33 个三维关节点，也接受`qiansi-humanoid-v1` 重定向帧：局部静止姿态相对的关节四元数、根旋转和根位移可直接驱动脊柱、颈、肩肘、手腕、髋膝和脚踝；`dispose()` 关闭会话。插件只能驱动受信任的内置角色，不能传入模型 URL 或取得 GLB 字节。 |
| `chooseSaveFile({ fileName, mimeType })`                                      | 无（仅内置 Motion Captur）    | API v2，仅受信任 `qiansi-motion-capture`：在用户点击导出后立即由顶层 Canvas 打开系统“另存为”。只接受安全的 `.webm` 文件名和 `video/webm`，返回当前 iframe 会话内短期有效的 opaque 保存位置 ID；取消返回 `status: "cancelled"`，不会开始编码。 |
| `downloadFile({ bytes, fileName, mimeType, destinationId })`                  | 无（仅内置 Motion Captur）    | API v2，仅受信任 `qiansi-motion-capture`：把不超过 256 MB 的 WebM 写入前一步所选文件句柄。保存位置 ID 必须匹配当前 iframe 会话，插件不取得绝对路径；只有底层写入并关闭成功后才返回 `status: "saved"`。不带位置 ID 的调用仅为旧版本兼容下载。 |
| `requestClose()`                                                              | 无（仅宿主可关闭面板）        | 全屏或浮动面板存在关闭回调时可用；请求宿主关闭当前插件视图，不能关闭其他插件或页面                                                                                                                                                                                                                                                                             |

### Motion Captur 独立宿主

内置 `qiansi-motion-capture` 的完整程序目录同时提供 `standalone/index.html`、`standalone/standalone.js`、`standalone/server.py`、`worker/adapters/` 与 Windows 启动器。Canvas Bridge 和独立服务器使用同一套固定 GEM-X／RTMW3D Worker 协议：受控完整视频传输、健康检查、单 GPU 任务门禁、进度、结果、取消和临时文件清理；适配器调用官方 GEM-X SOMA／MMPose RTMW3D 流水线。独立适配层在加载同一份 `runtime.js` 前建立与上表兼容的 `window.qiansi`，因此画布模式和独立模式共用 AI 捕捉、二维白模、检查、修补、映射、3D 导演台和导出界面。Depth 白模可选择 5／10／15 FPS、392／518／686 推理精细度、WebGPU 性能倾向或 CPU WASM 线程数，并调整远近反转、黑白场、Gamma 与时序平滑；运行中显示单帧耗时、有效 FPS 和 ETA。它使用确定时间点定位而非前台播放回调，切换窗口时保持采样并持久化参数与断点；完整序列可导出无音频 WebM。Canvas 和顶层独立页面都在编码前打开系统“另存为”，选定文件句柄后才执行实时编码并写入；取消不会编码，写入失败不回退为另一份隐式下载。Canvas 宿主只接受受信 Motion Captur 的安全 `.webm` 文件名、`video/webm` 和最大 256 MB 内容，并以当前 iframe 会话的短期位置 ID 防止复用。浏览器不会向插件公开绝对磁盘路径。独立服务器只绑定 `127.0.0.1`，从固定来源管理 GEM-X／RTMW3D 和 Depth Anything V2 Small 模型，以随包 Transformers.js／ONNX Runtime 生成本地 2D 深度白模，以插件目录内的 3D Worker／人偶资源完成 WebGL 预览，并把最近捕捉写入 `standalone-data/`。MediaPipe 帧识别仍作为宿主开发兼容 API 保留，但内置 Motion Captur 不再把它显示为捕捉选项。

独立模式的 GEM-X／RTMW3D 安装接口仍只接受固定引擎 ID，不接受 URL 或路径。它与 Canvas Bridge 使用相同的官方来源、文件名、精确字节数、`models/.installing/` 暂存和 `models/<engineId>/` 完成目录；按产品要求不做 SHA-256 校验。模型安装状态仍与 Worker 健康状态分离。所有模型包、续传、Worker 环境与删除动作都由模型选择器右侧的独立按钮触发；捕捉／生成主按钮不承担安装。官方运行环境可放在插件 `worker-runtime/<engine>/` 的约定目录，或使用 `QIANSI_GEMX_ROOT`／`QIANSI_GEMX_PYTHON`、`QIANSI_RTMW3D_ROOT`／`QIANSI_RTMW3D_PYTHON` 和 `QIANSI_RTMW3D_DETECTOR_CHECKPOINT` 指向现有环境；任一源码、依赖、CUDA 或附加 detector 缺失都会保持禁用并返回具体原因。

偏好键只能使用 1–64 位字母、数字、点、下划线或连字符；每个插件最多 32 项，单项序列化后最多 32 KB。宿主按清单 `id` 隔离插件数据，沙箱 iframe 不能直接访问 `localStorage`，也不能读写其他插件或画布的存储。此能力适合界面布局、用户预设和其他非敏感 JSON 配置，不应用来保存密钥、参考声音字节或大型媒体。

宿主会在创建 iframe 会话时绑定其来源画布项目 ID；之后即使宿主打开了另一个项目，旧 iframe 的项目文档调用仍只读写原来源项目，不会跟随活动项目重定向。插件不能伪造项目 ID 跨项目读写；需要操作另一个项目时，必须在该项目中重新打开一个新的插件 iframe。每个插件在每个画布项目中最多 64 个文档。宿主核对安装目录内的 `plugin.json#id` 后，由本机 Bridge 把文档原子保存到该插件安装目录的 `project-data/<source-project-id>/`，不会自动同步到其他设备或进入导出包；沙箱只能提交受限文档键，不能提交或获知磁盘路径。该持久化接口仅限画布所在主机，不向局域网协作终端开放。

共享风格封面使用独立权限和全插件作用域，保存到插件安装目录的 `project-data/shared-style-covers/<style-id>/cover.webp` 与 `metadata.json`。宿主只接受受限 `styleId` 和 WebP 内容，解析文件中的真实尺寸、重新计算 SHA-256，并用跨进程锁、固定文件名与修订号 CAS 阻止路径穿越、伪造尺寸和静默覆盖。项目文档应只保存封面哈希、尺寸、视觉分析快照和修订号，不应复制 Base64 图片；删除共享封面会影响同机该插件的所有 Canvas 与 standalone 项目。

从旧版本升级时，父页面会在首次访问每个插件／来源项目作用域时只读旧 `qiansi-plugin-documents-v1` IndexedDB，把现有公开文档和宿主收据逐项写入文件库并保留原修订号。只有全部记录成功落盘后才写入迁移完成标记；之后该作用域不再访问旧 IndexedDB。文件库已有同键记录时迁移不会覆盖，避免旧浏览器快照回写新文件数据。

### 项目工作台能力（runtime API v2）

需要保存项目草稿、调用画布已有文本模型并在最后生成新画布的插件，应显式声明以下权限：

```json
{
  "runtime": { "entry": "runtime.js", "apiVersion": 2 },
  "permissions": [
    "canvas:create-project-graph",
    "storage:project-documents",
    "storage:shared-style-covers",
    "models:use-text",
    "models:use-media",
    "media:transform"
  ]
}
```

推荐把过程数据和最终交付分开：项目文档只保存可序列化的草稿与审批状态；`listManagedTextModels()` 只返回宿主允许公开的模型描述；`runManagedTextModel()` 只能选择该目录中的 `providerId` 和 `model`。模型连接、API Key、认证头、密钥保险箱内容与底层网络地址始终留在宿主，不会注入沙箱或出现在返回值中。

模型预览和最终建图都必须由清晰的用户操作触发。尤其是 `createProjectGraph()`，只能绑定到“生成并交付”之类的最终确认按钮；不得在插件初始化、打开面板、自动保存、预览或模型返回后自动调用。首次应用一个 `applicationId` 时会新建并打开项目，不改写来源项目，也不自动运行新节点中的模型。宿主拒绝空图、超过 240 个节点、超过 480 条连线或 UTF-8 序列化后超过 4 MiB 的节点图。

`applicationId` 是必填的 8–80 位稳定交付标识，只能使用字母、数字、点、下划线、冒号和连字符。它应由已批准交付物的稳定身份或修订号生成，不能在每次点击时随机生成。宿主使用创建 iframe 会话时已绑定的来源项目 ID，并在该来源项目的受保护文档命名空间保存 `pending`／`applied`／`failed` 状态与不含凭据的收据；建图切换到新项目后，旧 iframe 再次提交也不会把收据写到新项目：

- 已存在 `applied` 时直接返回原 `{ applicationId, projectId, projectName, nodeIds, edgeCount }`，不会创建第二个项目。
- 已存在 `pending` 时一律拒绝再次执行；这也覆盖“项目已创建，但调用方没有收到响应”的不确定窗口。请先检查“所有项目”，不要换一个随机 ID 重复交付。
- 只有宿主确认项目创建 POST 尚未开始时才会记录 `failed`；该状态默认拒绝重跑。用户再次执行明确的“重试交付”操作后，插件才可使用同一请求并设置 `retryFailed: true`。宿主会复用同一项目创建幂等请求 ID。
- 同一 `applicationId` 对应的名称、节点或连线发生变化时，宿主拒绝复用。应先形成新的已批准交付修订，再使用新的稳定 ID。

这些宿主收据使用保留键，不占插件公开的 64 个项目文档配额，也不能通过 `readProjectDocument`、`writeProjectDocument` 或 `deleteProjectDocument` 读取、覆盖或删除。收据与公开文档保存在同一插件目录文件库，但使用独立的 512 项配额和宿主保留键；宿主还会从插件 ID、来源项目 ID 和 `applicationId` 派生不含正文的稳定 Bridge 项目创建 `requestId`，即使本地收据丢失也不会再创建第二个目标项目。但本地收据丢失后无法安全判断目标项目是否已被人工编辑，因此不应在多个设备上并发提交同一交付。

```js
const [model] = await qiansi.listManagedTextModels();

document.querySelector('#preview').onclick = async () => {
  if (!model) throw new Error('请先在画布 API 设置中启用文本模型');
  const result = await qiansi.runManagedTextModel({
    providerId: model.providerId,
    model: model.model,
    operation: 'screenplay_preview',
    prompt: '把已审批素材整理成可预览的总剧本。',
    maxLength: 8000,
  });
  const saved = await qiansi.readProjectDocument('screenplay-draft');
  await qiansi.writeProjectDocument('screenplay-draft', { text: result.text }, saved?.revision);
};

document.querySelector('#deliver').onclick = async () => {
  const draft = await qiansi.readProjectDocument('screenplay-draft');
  if (!draft) throw new Error('请先预览并确认总剧本');
  await qiansi.createProjectGraph({
    applicationId: `screenplay-draft-v${draft.revision}`,
    name: '小说视频交付',
    nodes: [
      {
        clientId: 'screenplay',
        kind: 'text',
        position: { x: 0, y: 0 },
        data: { title: '总剧本', outputText: draft.value.text },
      },
    ],
    edges: [],
  });
};
```

### 受管图片与视频模型（runtime API v2）

`models:use-media` 是独立付费媒体权限。插件只能从 `listManagedImageModels()`／`listManagedVideoModels()` 的宿主目录中选择 `providerId` 与 `model`，不能传入 API Key、认证头、任意 `baseUrl`、本地路径或供应商 URL。宿主用现有图片／视频适配器执行真实生成；没有已启用且可用的连接、模型未声明所需参考图能力或上游没有返回可用文件时，调用会明确失败，不会制造成功状态。

```js
const [imageModel] = await qiansi.listManagedImageModels();
const [videoModel] = await qiansi.listManagedVideoModels();
if (!imageModel || !videoModel) throw new Error('请先在画布 API 设置中配置图片和视频模型');

const image = await qiansi.runManagedImageModel({
  providerId: imageModel.providerId,
  model: imageModel.model,
  prompt: '镜头 001 的首帧，夜雨山门，人物身份和服装延续已审批分镜。',
  requestId: 'shot-001-image',
  aspectRatio: '16:9',
  quality: '2K',
});

const video = await qiansi.runManagedVideoModel({
  providerId: videoModel.providerId,
  model: videoModel.model,
  prompt: '镜头 001，摄影机缓慢推进，雨丝方向稳定，人物向山门抬眼。',
  requestId: 'shot-001-video',
  duration: 5,
  aspectRatio: '16:9',
  resolution: '720P',
  audio: true,
  referenceMediaIds: [image.mediaId],
});

const lastFrame = await qiansi.captureManagedVideoFrame({
  mediaId: video.mediaId,
  position: 'last',
});

const continuedVideo = await qiansi.runManagedVideoModel({
  providerId: videoModel.providerId,
  model: videoModel.model,
  prompt: '从上一镜实际末帧继续，人物转身进入山门，保持身份、服装、方位与光向连续。',
  requestId: 'shot-002-video',
  duration: 5,
  aspectRatio: '16:9',
  resolution: '720P',
  audio: true,
  referenceMediaIds: [lastFrame.mediaId],
});

const preview = await qiansi.previewManagedMedia({ mediaId: image.mediaId });
document.querySelector('#asset-preview').src = preview.previewUrl;
await qiansi.inspectManagedMedia({ mediaId: video.mediaId });
await qiansi.downloadManagedMedia({ mediaId: video.mediaId, fileName: 'shot-001.mp4' });
```

`runManagedImageModel()` 返回 `{ mediaId, kind, providerId, model }`。`runManagedVideoModel()` 额外返回 `audioRequested` 和 `audioTrackStatus: 'present' | 'absent' | 'unverified'`：前者记录插件实际提交的开关，后者由宿主在媒体保存后用 FFprobe 检查真实音频流。`videoAudioOutput: true` 只表示宿主允许插件控制请求，不能替代结果检测；请求音频却收到 `absent` 时应保留句柄供下载排查，但阻止将其作为带原生音频的成功结果采用；`unverified` 表示本机缺少 FFprobe 或探测失败，不能冒充已含音轨。

`mediaId` 是宿主生成的 opaque 句柄，仅在当前插件 ID＋当前 iframe session 中有效；宿主最多保留该会话最近 256 项。不要把它当永久素材 ID：页面刷新、插件重启或 iframe 重建后，项目文档里保存的旧句柄会失效。恢复草稿时应逐项调用 `inspectManagedMedia()`；失败就显示“上次会话媒体不可用，需重新生成”，不得继续标记为 succeeded，也不得声称仍可下载。

宿主不向 iframe 提供原始媒体 URL、原始媒体字节或本地路径。图片可以显式调用 `previewManagedMedia()` 获取当前 iframe 会话专用的、可撤销 `blob:` 缩略图地址；宿主读取受管原图后校验格式和 32 MiB 源文件上限，再缩放编码为最多 4 MiB 的 WebP 缩略数据，沙箱引导层收到后在 iframe 自身来源内创建并缓存展示地址。底层供应商签名 URL 与原图字节不进入沙箱。该缩略数据和地址只用于当前界面展示，不是永久素材 ID，不能写入项目文档、作为模型参考、用于下载或最终建图；视频预览不在此接口范围内。预览失败时应保留生成成功状态并显示“预览不可用”，下载和最终建图仍继续使用 `mediaId`。

图片的 `runManagedImageModel()`／`models.runImage` 请求可选 `referenceMediaIds`，最多 16 个非重复 opaque 媒体 ID，且数量不得超过所选模型实际声明的 `maxReferenceImages`；模型还必须声明 `inputModalities` 包含 `image`。每项必须是当前插件、当前 iframe 会话内有效且未释放的受管图片（由模型生成，或由用户明确从 Canvas 选择并登记）；宿主按输入顺序解析为内部 `referenceImages` 后传入图片生成器。视频句柄、跨插件／跨会话句柄、重复或伪造 ID 均拒绝；插件不能提交原始 URL、本机路径或内部 `referenceImages` 字段。此能力沿用 `models:use-media`，没有新增权限。

视频的 `referenceMediaIds` 最多 16 项，只能指向同一会话先前由宿主生成并登记的图片；视频句柄、跨插件句柄、上次会话句柄和伪造 ID 都会 fail-closed。即使模型目录遗漏参考能力声明，也不会把缺失上限当成无限制继续提交。

`captureManagedVideoFrame()` 生成的图片句柄遵守同一会话边界，可直接作为后续 `runManagedVideoModel()` 的单图参考。宿主内部最多按 1920 像素长边编码 JPEG，截帧本身不产生模型费用，也不会覆盖已有图片资产。连续生成应严格串行：上一镜成功后截取末帧，确认取得图片句柄后才提交下一镜；截帧失败必须在下一次付费调用前停止。

最终建图时，图片／视频节点的 `data` 可以携带同会话 `mediaId`；宿主在应用节点图前校验作用域和类型，并分别注入 `imageUrl/images/output` 或 `videoUrl/videos/output`。插件不得在建图数据中传 `url`、`imageUrl`、`videoUrl`、`images`、`videos`、`originalUrl`、`referenceMediaIds` 或媒体节点 `output`。图专用数据还可携带 1–80 字符 `shotId` 与枚举 `role: 'image-prompt' | 'image' | 'video-prompt' | 'video'`，它们不会扩大普通节点更新权限：

```js
await qiansi.createProjectGraph({
  applicationId: 'approved-delivery-v12',
  name: '已批准视频交付',
  nodes: [
    {
      clientId: 'shot_001_video',
      kind: 'video',
      position: { x: 560, y: 0 },
      data: { title: '镜头 001', shotId: 'shot-001', role: 'video', mediaId: video.mediaId },
    },
  ],
  edges: [],
});
```

### 本机音频生成器（runtime API v2）

需要调用本机推理服务的插件必须使用 runtime API v2，并在 `contributes.audioGenerators` 中声明固定回环端点，或选择宿主内置白名单音频适配器。沙箱本身仍然不能联网；检查和生成请求都由宿主转交本地桥。

```json
{
  "schemaVersion": 2,
  "id": "qiansi-audio",
  "name": "Qiansi Audio Studio",
  "version": "1.0.0",
  "runtime": { "entry": "runtime.js", "apiVersion": 2 },
  "permissions": ["audio:generate", "audio:install", "storage:preferences", "canvas:notify"],
  "contributes": {
    "nodes": [],
    "panels": [
      {
        "id": "studio",
        "label": "Qiansi Audio Studio",
        "description": "按顺序选择 Qwen3-TTS、VoxCPM2、CosyVoice 3、ChatTTS 或 Sony Woosh 生成语音与音效。",
        "position": "fullscreen",
        "hostChrome": "default",
        "view": "qiansi-audio-studio",
        "width": 1200,
        "height": 900
      }
    ],
    "menus": [
      {
        "id": "open-qiansi-audio",
        "label": "打开 Qiansi Audio Studio",
        "location": "canvas",
        "action": { "type": "open-panel", "panelId": "studio" }
      }
    ],
    "audioGenerators": [
      {
        "id": "qwen3-tts-local",
        "label": "Qwen3-TTS",
        "protocol": "qiansi-audio-v1",
        "hostAdapter": "qwen3tts",
        "timeoutMs": 600000,
        "maxBytes": 67108864
      },
      {
        "id": "voxcpm2-local",
        "label": "VoxCPM2 本机服务",
        "protocol": "qiansi-audio-v1",
        "hostAdapter": "voxcpm2",
        "timeoutMs": 300000,
        "maxBytes": 67108864
      },
      {
        "id": "cosyvoice3-local",
        "label": "CosyVoice 3",
        "protocol": "qiansi-audio-v1",
        "hostAdapter": "cosyvoice3",
        "timeoutMs": 600000,
        "maxBytes": 67108864
      },
      {
        "id": "chattts-local",
        "label": "ChatTTS",
        "protocol": "qiansi-audio-v1",
        "hostAdapter": "chattts",
        "timeoutMs": 600000,
        "maxBytes": 67108864
      },
      {
        "id": "woosh-local",
        "label": "Sony Woosh",
        "protocol": "qiansi-audio-v1",
        "hostAdapter": "woosh",
        "timeoutMs": 600000,
        "maxBytes": 67108864
      }
    ]
  }
}
```

全屏面板默认由宿主显示独立标题栏。若插件自身已经提供完整顶栏，可将面板的
`hostChrome` 设为 `"integrated"`：宿主不再占用第二行标题栏，而把语言、运行状态和关闭
操作覆盖在插件顶栏右侧。该值只允许用于 `position: "fullscreen"`，插件顶栏需为宿主操作
预留右侧空间。需要严格自定义顶栏的全屏插件可设为 `"custom"`，由插件调用
`window.qiansi.requestClose()` 提供关闭入口，宿主仍保留 Escape 退出；未声明或设为
`"default"` 时保持现有布局。

`qiansi-audio-v1` 有两种受控传输方式：

- `hostAdapter: "voxcpm2"`、`"chattts"`、`"qwen3tts"`、`"cosyvoice3"`、`"woosh"` 或 `"acestepXl"`：只选择宿主编译时内置的受信任音频适配器。六者只能由 `data/plugins/qiansi-audio/` 内的同一个 `qiansi-audio` 插件声明；每个引擎的固定 Python 环境、worker、官方源码和模型分别位于对应的 `engines/<adapter>/`。ACE-Step 的 Turbo 与 SFT 界面共用 `acestep-xl-local`。所有路径从复制后的插件根目录相对解析，不依赖盘符或外部固定路径。开启插件时宿主按需管理六个 worker，关闭插件或退出画布时自动停止；worker 使用标准输入/输出通信，复用现有画布桥，不监听第二个网络端口。插件清单不能提供命令、Python 路径或 worker 脚本，也不能让其他插件借用这些适配器。

`qiansi-audio` 完整发行目录还提供可选的独立启动器。它不扩展普通插件 SDK，也不允许第三方清单指定可执行文件；启动器仅使用包内固定绿色 Python 和六个固定摘要 worker，在 `127.0.0.1` 自动选择临时端口复用同一份 `runtime.js`。独立模式将 WAV 原子保存到插件相对的 `standalone-data/audio/`，将历史与偏好写入 SQLite，保存成功后才响应页面；Canvas 模式仍复用现有画布桥且不新增端口。两种模式的结果卡都通过既有受控历史下载能力提供“保存 WAV 到本地”，没有新增通用文件系统权限。

- `endpoint` + `healthEndpoint`：兼容独立本机服务。健康端点使用 `GET`，生成端点使用 `POST application/json`；两者必须使用同一个 `http://127.0.0.1` 或 `http://[::1]` Origin，不能包含凭据、查询参数、片段或目录穿越，也不接受 `localhost`、局域网或公网地址。

#### 独立 Seed Audio Key 配置（仅内置 `doubao-seed-audio`）

内置 `Qainsi Seed Audio Studio` 的音频生成不读取画布 API、密钥库或 Ark CLI。其两列接入页可通过 `configureSeedAudioApiKey(apiKey)` 直接保存 Key；该方法只注入精确插件 ID `doubao-seed-audio`，宿主固定生成器 ID `doubao-seed-audio-cloud`，并由 Bridge 的固定路由原子写入该插件规范目录唯一的 `config.json`。请求不能提交插件 ID、生成器 ID、文件路径、端点或模型，其他插件、其他生成器、目录越界、符号链接配置文件、未知字段、空值、控制字符和超长 Key 均会被拒绝。

Key 只在用户提交时短暂经过插件沙箱与宿主消息通道；保存结果只返回 `configured` 和时间，不读取或回显现有 Key。明文不会写入画布 API 设置、插件偏好、模板、历史或日志。独立本机服务继续只监听 `127.0.0.1:18961`，并在每次健康检查和生成前重新读取 `config.json`；环境变量 `DOUBAO_SEED_AUDIO_API_KEY` 仍可作为优先级更高的备用方式。

两种方式接收相同的宿主清洗请求外壳：`mode`、`text`、`control`、`referenceAudio`／`referenceAudios` 和 `options`。`referenceAudio` 保留单段兼容格式；HTTP 回环生成器还可使用 `referenceAudios` 传递 1–3 段有序参考音频，两者不能同时提交。参考音频为原始 Base64，单段以及多段合计解码后最多 16 MB；宿主管理适配器会把仅含一项的数组归一为旧单段格式，并拒绝多项，避免本机模型静默忽略。成功结果必须是非空受支持音频，且不得超过清单的 `maxBytes`。`hostAdapter` 不能与 HTTP 地址同时声明，未知适配器会在导入阶段被拒绝。实际模式和参数能力仍由具体适配器收窄，不能把一个适配器的字段视为另一个适配器的功能。

#### 受信任的一键安装（仅 `qiansi-audio`）

`audio:install` 是宿主受信权限，不是普通插件的联网或执行权限。清单解析器要求它只能出现在 runtime API v2 插件中，并且插件必须声明 `audioGenerators`；本机 Bridge 还会再次要求插件 ID 精确等于 `qiansi-audio`、插件已启用且兼容、清单确实含有 `audio:install`，并把每个 `generatorId` 限制在该清单声明的生成器内。其他插件即使把同名权限写入 `plugin.json`，也不能借此下载文件、启动安装器或复用六个受管引擎。

Canvas 内的调用链为：`runtime.js` → 沙箱 `listAudioGenerators()` / `installEngine()` / `cancelEngineInstall()` / `uninstallEngine()` → 宿主插件注册服务 → Bridge 的 `/plugins/audio/install/catalog|start|status|cancel|uninstall` → `ManagedAudioInstallerManager` → 独立控制器 Python → `install/installer.py`。安装或删除开始前宿主停止目标引擎 worker，受管操作进行时拒绝该引擎生成；删除只允许固定 catalog 对应的引擎目录，不触碰历史音频、参考音频或偏好。Bridge 关闭时先取消并收敛安装任务，再停止音频 worker。

独立工作台复用同一份 `runtime.js` 和同一份固定安装目录，但不经过 Canvas Bridge：`standalone/standalone.js` 调用 `standalone/server.py` 的 `/api/generators`、`/api/install`、进度和取消接口，再由同一个 `EngineInstaller` 读取 `install/catalog.json`。`启动 Qiansi Audio Studio.bat` 只先通过 `controller/bootstrap.ps1` 准备固定、校验过的控制器 Python，然后启动本机回环页面；控制器运行环境与六个模型引擎彼此独立。

安装器只接受仓库内固定清单，不接受 runtime、请求体或环境变量传入任意仓库地址，也不依赖维护者重新托管模型核心包。`runtimeBootstrap` 固定 Python.org 嵌入式 Python、PyPA 引导文件及需要时使用的官方 uv Release 的 HTTPS 地址、大小和 SHA-256；每个 `officialInstall` 固定官方 PyPI 包版本、官方源码 requirements 或上游 `uv.lock`，并只复制 `install/adapters/` 中经过摘要校验的第一方 worker。程序依赖和模型都在同盘暂存目录完成安装，固定 worker 健康检查通过后才原子替换旧引擎。

模型权重按固定逐文件清单或固定官方 ZIP 下载并校验大小与 SHA-256。Qwen3-TTS、CosyVoice 3 与 VoxCPM2 的顺序是官方 ModelScope 优先、官方 Hugging Face 固定快照回退；VoxCPM2 所需 ZipEnhancer 当前只有官方 ModelScope 来源。ChatTTS 只使用官方 Hugging Face 快照；Sony Woosh 使用 v1.0.0 官方 GitHub Release 中的 DFlow、TextConditionerA 与 Woosh-AE，并附固定 RoBERTa 配置／分词器快照。ChatTTS 与 Woosh 安装前都要求用户明确确认 CC-BY-NC-4.0 模型许可和非商业用途限制。任何来源失败或校验不符都不能覆盖已有引擎。

```js
const generatorId = 'voxcpm2-local';
const status = await qiansi.checkAudioGenerator(generatorId);
if (!status.ok) throw new Error(status.message || '本机 VoxCPM2 服务未就绪');

const result = await qiansi.generateAudio(generatorId, {
  mode: 'design',
  text: '欢迎使用千丝画布。',
  control: '温暖、自然、语速稍慢',
  options: { cfgValue: 2, inferenceTimesteps: 10, seed: 42 },
});

const previewUrl = URL.createObjectURL(new Blob([result.bytes], { type: result.mimeType }));
document.querySelector('audio').src = previewUrl;
```

| API                                                     | 权限                     | 说明                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readOwnInputs()`                                       | `canvas:read-own-inputs` | 只读取当前插件节点按端口分组、限量清洗后的输入；面板不能借此读取任意节点                                                                                                               |
| `listAudioGenerators()`                                 | `audio:install`          | 仅受信任 `qiansi-audio`：读取固定六引擎目录、安装状态、发布门禁与许可证提示；不接受调用方 URL                                                                                          |
| `installEngine(generatorId, options, onProgress)`       | `audio:install`          | 仅受信任 `qiansi-audio`：启动固定清单安装并轮询状态；需要许可确认时只接受目录给出的确认摘要                                                                                            |
| `cancelEngineInstall(generatorId)`                      | `audio:install`          | 仅受信任 `qiansi-audio`：请求取消当前引擎的安装或校验任务                                                                                                                              |
| `uninstallEngine(generatorId)`                          | `audio:install`          | 仅受信任 `qiansi-audio`：停止目标 worker 后删除固定 catalog 对应的本机引擎目录；保留历史、参考音频和偏好                                                                               |
| `checkAudioGenerator(generatorId)`                      | `audio:generate`         | 检查当前插件清单中指定的本机音频生成器                                                                                                                                                 |
| `configureSeedAudioApiKey(apiKey)`                      | `audio:generate`         | 仅内置 `doubao-seed-audio`：把一次性提交的有界 Key 写入该插件唯一的本机 `config.json`；不读取或回显 Key，也不接受路径、端点或生成器参数                                                     |
| `generateAudio(generatorId, request)`                   | `audio:generate`         | 生成音频并保存为项目隔离的工作台历史；只有生成器声明 `canvasOutput: "audio-node"` 或插件保留节点贡献时，才创建或更新画布原生音频节点并自动加入画布资产；返回可转移的音频 `ArrayBuffer` |
| `listReferenceAudioLibrary()`                           | `audio:reference-library` | 列出当前插件私有参考音频库的条目元数据，不返回音频字节、本机路径或其他插件条目                                                                                                         |
| `readReferenceAudioLibrary(id)`                         | `audio:reference-library` | 用户显式选择后，按当前插件私有条目 ID 读取音频字节用于会话试听或引用                                                                                                                   |
| `createReferenceAudioCategory(category)`                | `audio:reference-library` | 在当前插件私有参考音频库中创建分类                                                                                                                                                     |
| `renameReferenceAudioLibrary(id, name, category, transcript)` | `audio:reference-library` | 修改当前插件私有条目的受限元数据，不改写音频内容                                                                                                                                       |
| `importReferenceAudioLibrary(file)`                     | `audio:reference-library` | 用户显式上传后校验格式、体积和容器签名，并写入当前插件私有参考音频库                                                                                                                   |
| `listAudioHistory(generatorId)`                         | `audio:generate`         | 列出当前插件、生成器和项目下最多 30 条安全生成元数据；不返回素材地址或克隆参考音频                                                                                                     |
| `readAudioHistory(generatorId, historyId)`              | `audio:generate`         | 按宿主持有的一次性历史 ID 读取对应本机音频字节；历史必须属于当前插件、生成器和项目                                                                                                     |
| `downloadAudioHistory(generatorId, historyId)`          | `audio:generate`         | 校验当前插件、生成器、项目和历史 ID 后，由宿主下载对应音频；沙箱不获得通用下载或文件访问权限                                                                                           |
| `addAudioHistoryToCanvasAssets(generatorId, historyId)` | `audio:generate`         | 校验当前插件、生成器、项目和历史 ID 后，将对应音频显式加入画布资产库；重复添加返回 `added: false`，不会创建画布节点；独立工作台不提供此方法                                            |
| `deleteAudioHistory(generatorId, historyId)`            | `audio:generate`         | 删除当前插件、生成器和项目下的指定工作台历史记录；素材库正式资产保留，避免破坏仍在使用的音频                                                                                           |
| `cancelAudioGeneration()`                               | `audio:generate`         | 中止当前 iframe 发起的音频任务；一个 iframe 同时只允许一个任务                                                                                                                         |

宿主只会从 `options` 转发这组白名单字段：`cfgValue`、`inferenceTimesteps`、`seed`、`normalize`、`denoise`、`promptText`、`voiceConsent`、`temperature`、`topP`、`topK`、`textSeed`、`refineText`、`speed`、`oral`、`laugh`、`breakLevel`、`splitBatch`、`engineTask`、`language`、`speaker`、`speechRate`、`durationSeconds`、`audioFormat`、`wooshCfg` 和 `wooshSteps`；额外字段不会进入本地桥。`durationSeconds` 只接受 1–120 的整数，`audioFormat` 只接受 `mp3` 或 `wav`；具体服务仍可收窄。每个适配器还会再次校验自己的更小子集和取值范围。

VoxCPM2 支持 `design`、`clone` 和 `hifi`。`clone` / `hifi` 直接传 `referenceAudio: { base64, mimeType, fileName? }`；Qiansi Audio Studio 的独立工作台由用户选择本地参考音频。`hifi` 还必须在 `options.promptText` 中提供参考音频的准确转写。其生成参数使用 `cfgValue`、`inferenceTimesteps`、`seed`、`normalize`、`denoise` 和 `promptText`。

VoxCPM2 的情绪、语速、说话方式和音色属性通过自然语言 `control` 描述，并由 worker 按官方格式组合为 `(Control Instruction)正文`；它不接收 ChatTTS 的 `[speed_n]`、`[oral_n]`、`[laugh_n]` 或 `[break_n]`。Qiansi Audio Studio 的六种语气预设与 0–9 语速/口语化滑杆只是把界面等级映射成实时可见的自然语言描述，不会向适配器伪造数值选项。正文可以使用官方非语言标签 `[laughing]`、`[sigh]`、`[Uhm]`、`[Shh]`、`[Question-ah|ei|en|oh]`、`[Surprise-wa|yo]` 与 `[Dissatisfaction-hnn]`；这些标签应少量使用，VoxCPM2 当前不提供可保证精确秒数的停顿控制。`hifi` 按官方路径忽略 `control`。

音频历史由宿主保存项目隔离的生成文本、控制描述、白名单参数和内部音频引用。未声明 `canvasOutput` 的生成器不会把结果自动放入画布或画布资产库，插件可让用户通过 `addAudioHistoryToCanvasAssets` 主动保存。克隆参考音频的 Base64 永远不会写入历史；再次生成 `clone` / `hifi` 时，插件必须要求用户重新选择并授权参考音频。

调用 `clone` 或 `hifi` 前，插件 UI 必须取得用户对目标声音拥有使用权或已获授权的明确确认。宿主可转发经过布尔校验的 `voiceConsent`，但它只是界面流程标记，不能证明真实授权；提供独立 HTTP 服务的实现方如需更强授权，应在自己的受信任界面或部署边界另行执行。

### Qiansi Audio Studio 中的 ChatTTS 引擎

ChatTTS 清单使用固定生成器：

```json
{
  "id": "chattts-local",
  "protocol": "qiansi-audio-v1",
  "hostAdapter": "chattts",
  "timeoutMs": 600000,
  "maxBytes": 67108864
}
```

`chattts` 接受 `mode: "design"` 的随机音色和 `mode: "clone"` 的官方参考音频克隆，以及 1–8000 字正文；不接收自然语言 `control` 或伪造的 Hi-Fi 模式。克隆请求必须提供不超过 16 MB、0.5–120 秒的可解码参考音频、准确转写 `promptText` 和 `voiceConsent: true`；敏感参考字节不进入历史。有效选项及范围为：

| 字段                                              | 范围 / 含义                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `seed`                                            | 0–4294967295 的音色与音频 token 种子                                                                                   |
| `speakerPreset`                                   | 可选的安全 CSV 文件名；只在 `design` 模式读取 `data/plugins/qiansi-audio/speaker/` 中恰好包含 768 个有限数值的固定音色 |
| `textSeed`                                        | 0–4294967295；开启文本润色时使用的独立文本种子                                                                         |
| `temperature`                                     | 0.00001–1                                                                                                              |
| `topP`                                            | 0.1–0.9                                                                                                                |
| `topK`                                            | 1–20 的整数                                                                                                            |
| `refineText`、`normalize`、`homophoneReplacement` | 布尔值                                                                                                                 |
| `speed`、`oral`                                   | 0–9 的整数                                                                                                             |
| `laugh`                                           | 0–2 的整数                                                                                                             |
| `breakLevel`                                      | 0–7 的整数                                                                                                             |
| `splitBatch`                                      | 0–16 的整数；0 关闭自动分句                                                                                            |

`oral`、`laugh`、`breakLevel` 分别映射到 ChatTTS 官方 `[oral_n]`、`[laugh_n]`、`[break_n]` 文本润色标签，`speed` 映射到 `[speed_n]` 推理标签；正文可在跳过 refine text 时使用官方词级 `[laugh]`、`[uv_break]`、`[lbreak]` 标签。固定音色 CSV 只替换随机生成的 `spk_emb`，`seed` 继续控制音频 token 随机性；克隆模式拒绝同时提交 `speakerPreset`。参考克隆会把音频离线重采样到 24 kHz 单声道，并按官方 `sample_audio_speaker` + 准确转写路径生成。worker 固定从插件内完整官方模型离线加载，输出 24 kHz、单声道、16-bit PCM WAV；宿主验证音频签名和大小后写入素材库。Qiansi Audio Studio 只贡献 `position: "fullscreen"` 的独立工作台，不恢复插件节点或“添加插件节点”菜单；其六个生成器通过 `canvasOutput: "audio-node"` 把成功结果同时写入当前画布的原生音频节点。

### Qiansi Audio Studio 中的 Qwen3-TTS 与 CosyVoice 3 引擎

`qwen3tts` 在插件内离线包含官方 `Qwen3-TTS-12Hz-1.7B-CustomVoice`、`VoiceDesign` 和 `Base` 三套权重。`options.engineTask` 分别使用 `custom`、`design` 或 `clone`；前两者使用 `mode: "design"`，克隆使用 `mode: "clone"`。`language` 接受 `Auto`、中文、英语、德语、意大利语、葡萄牙语、西班牙语、日语、韩语、法语、俄语、北京方言与四川方言；`speaker` 只接受九个官方 CustomVoice 说话人。CustomVoice 可选自然语言 `control`，VoiceDesign 必须提供该字段；面板提供语气、情绪与语速快捷描述，但它们会编译成模型真实接收的自然语言指令，并非虚构的离散模型参数。`seed` 为 0–4294967295；`qwenTemperature`、`qwenTopP`、`qwenTopK` 与 `qwenRepetitionPenalty` 分别限制为 0.1–2、0.1–1、1–100 和 1–2，并直接转发为官方生成接口的 `temperature`、`top_p`、`top_k` 与 `repetition_penalty`。完整上下文克隆必须提供不超过 16 MB 的参考音频、准确 `promptText` 与 `voiceConsent: true`；`xVectorOnly: true` 可只提取说话人向量并省略转写，但官方说明这种模式会忽略参考文本与参考编码，质量可能低于完整上下文克隆。

`cosyvoice3` 离线包含官方 `Fun-CosyVoice3-0.5B-2512`，统一使用 `mode: "clone"` 与已授权参考音频。`options.engineTask` 支持 `zeroShot`、`crossLingual`、`instruct`；零样本还要求准确 `promptText`，指令克隆还要求自然语言 `control`。工作台按官方示例组合中文、英语、日语、韩语、德语、西班牙语、法语、意大利语、俄语，广东、东北、甘肃、贵州、河南、湖北、湖南、江西、闽南、宁夏、山西、陕西、山东、上海、四川、天津、云南等方言提示，以及开心、伤心、生气、快慢、音量与角色风格指令，并实时显示实际提交文本。`speechRate` 范围为 0.5–2.0。正文可直接插入官方细粒度 `[breath]`、`[quick_breath]`、`[laughter]`、`<laughter>…</laughter>`、`<strong>…</strong>`、`[sigh]`、`[cough]`、`[noise]`、`[vocalized-noise]`、`[hissing]`、`[lipsmack]`、`[clucking]`、`[mn]` 与 `[accent]`；发音覆写支持中文拼音标签和英文 CMU 音素。语言、方言和表演提示只在 `instruct` 任务中提交，零样本与跨语种克隆不会伪装支持指令控制。

### Qiansi Audio Studio 中的 Sony Woosh 引擎

`woosh` 仅接受 `mode: "design"` 与 1–1000 字音效描述，不接受 `control` 或 `referenceAudio`。有效选项为 0–4294967295 的整数 `seed`、0–9 的 `wooshCfg` 和 4–8 的整数 `wooshSteps`。当前工作台提供 4／6／8 步快捷预设；worker 离线加载固定 Sony Woosh-DFlow、TextConditionerA 与 Woosh-AE，输出约 5 秒的 48 kHz 单声道 PCM16 WAV。该入口是文字生成音效，不宣称语音、音乐、参考克隆或视频条件能力。Seed Audio 1.0 官方当前仅提供 BytePlus 云服务，未作为本地受管适配器或一键安装模型列入本契约。

### Qiansi Audio Studio 中的 ACE-Step 1.5 XL 引擎

`acestepXl` 仅接受 `mode: "design"`，并由 `options.aceVariant` 在固定的 `acestep-v15-xl-turbo` 与 `acestep-v15-xl-sft` 之间选择。Turbo 限制为 4–8 步且 `guidanceScale` 固定为 1；SFT 默认 50 步并支持 CFG。`aceTask` 支持 `text2music`、`cover` 与 `repaint`；后两者必须提供不超过 16 MB 的参考音频和 `voiceConsent: true`。宿主当前只接收单个 WAV，因此 `batchSize` 固定为 1、`audioFormat` 固定为 `wav`。两个界面共用 `acestep-xl-local` 安装条目；安装器固定官方源码提交、官方 `uv.lock`、共用组件和两个 XL 模型 revision，并逐文件校验 SHA-256。

宿主对所有受信任本机音频生成执行进程级串行门禁。同一时刻只允许六个引擎中的一个生成任务；切换适配器前会停止其他适配器的 worker 以释放显存，后续探测或生成需要时再启动。这个行为避免多套大模型同时驻留 GPU，不改变插件 iframe 的权限边界。

当前受信任绑定如下；任一插件 ID、规范目录或 `service/worker.py` SHA-256 不匹配都会在进程启动前被拒绝：

| 适配器       | 插件 ID / 规范目录                                               | worker SHA-256                                                     |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `voxcpm2`    | `qiansi-audio` / `data/plugins/qiansi-audio/engines/voxcpm2/`    | `277257904bb737c4dd68a406b8f27ff27dc730d7c46ec62547eac9434188abc6` |
| `chattts`    | `qiansi-audio` / `data/plugins/qiansi-audio/engines/chattts/`    | `468879aa3f6be032ab0a36c23e22cfb34be0fa141c181e8574560232a362b7db` |
| `qwen3tts`   | `qiansi-audio` / `data/plugins/qiansi-audio/engines/qwen3tts/`   | `42f4a26de57099c4fdd7527fc658ff3b297bc1a51aaa3c9c655c2d565a201493` |
| `cosyvoice3` | `qiansi-audio` / `data/plugins/qiansi-audio/engines/cosyvoice3/` | `47f381d0c06637b8cf473087d8843947f422ff4143329b9544a223c1af54e251` |
| `woosh`      | `qiansi-audio` / `data/plugins/qiansi-audio/engines/woosh/`      | `480783edee4793fd81a88deeca6a991183820dd411b08ba170a860695f5c4941` |
| `acestepXl`  | `qiansi-audio` / `data/plugins/qiansi-audio/engines/acestep-xl/` | `8e6f841ece2c01e6ff0fb8cf9612b00b22f732052108bf89138eab3594742048` |

ChatTTS 官方源码采用 AGPL-3.0-or-later；Sony Woosh 官方源码采用 MIT；两者随包模型权重采用 CC-BY-NC-4.0，仅限非商业用途。复制或分发完整插件目录时必须一并保留其 `LICENSE`、`THIRD_PARTY_NOTICES.md`、官方源码许可证和模型清单；Qiansi-Canvas 的插件例外不会改变上游源码或模型许可。

Qwen3-TTS 与 CosyVoice 3 的官方代码和上述随包模型采用 Apache-2.0；复制或分发完整插件目录时同样必须保留各自源码与模型目录中的许可证和说明文件。

## 安全边界

- 插件在无同源权限的 iframe 中运行；CSP 允许沙箱内联 JavaScript、WASM、`blob:` Worker、WebGL/WebGPU、浏览器音视频解码、用户主动选择文件和下载，但继续禁止任意网络连接、子框架、表单提交、对象嵌入及宿主页 DOM 访问。
- `readOwnImage` 不把宿主媒体地址或文件系统权限暴露给沙箱；宿主校验当前节点、端口、媒体来源、类型与大小后，通过可转移 `ArrayBuffer` 返回图片字节。
- `readSelectedImage` 只读取最近选中的一个 `image` 节点，不扫描、列出或返回其他画布节点；宿主校验图片 MIME、非空内容和 32 MiB 源文件上限后只返回当前会话 opaque 句柄。该选择动作本身不授权把原图发送给模型提供器。
- `qiansi-novel-video-studio` 额外获得宿主限定的 `pickLatestProjectImage()` 入口。它只读取首页“最近使用的画布”排序中的第一项及该项目的 `views` 工作区；另外三个最近项目不会读取。图片列表和原始地址只存在于宿主选择框，插件只收到用户最终选择图片的当前会话 opaque 句柄；取消返回 `{ cancelled: true }`，不会自动发送模型。
- `readSelectedVideo` 只在画布启动会话中读取当前选中的视频节点；宿主仅接受当前 Bridge、当前浏览器会话 Blob 或视频 Data URL，并在传输前限制类型和 256 MB 大小，不开放任意 URL 或文件系统读取。
- 普通插件接口没有文件系统、Shell、PowerShell、EXE、环境变量、API Key、账户凭据或任意 URL 请求能力；唯一例外是宿主按精确插件 ID 固定注入的 `configureSeedAudioApiKey`，它只能一次性写入内置 Seed Audio 插件自己的固定配置文件，不能读取 Key 或选择路径。
- `audio:generate` 不是通用网络或进程权限：沙箱的 `connect-src` 仍为 `none`。HTTP 模式只能访问通过校验的固定回环端点；宿主管理模式只能选择编译时白名单适配器。插件不能改写 Origin、路径、请求方法、命令、脚本或可执行文件。
- `audio:reference-library` 只开放当前插件私有参考音频库的列出、读取、分类、改名和显式导入；它不授予音频生成、网络、进程、其他插件数据或任意本机文件访问能力，也不要求插件声明音频生成器。为兼容已安装的旧音频生成插件，`audio:generate` 暂时仍可调用同一插件自己的参考库；新插件应申请独立权限。
- 普通第三方插件包不能携带或启动 Python、EXE、BAT、PowerShell、模型权重或安装脚本。`qiansi-audio` 是单独安装的受信任多模型伴随组件，其程序与一键安装器由独立的 `Qiansi-Audio-Studio` 仓库发布，不捆绑在 Qiansi-Canvas 源码或 Release 中。宿主只按编译时定义从其六个 `engines/*` 规范目录读取固定 Python/worker 相对路径，并校验统一插件 ID、规范路径与每个 worker 的 SHA-256；清单本身不能提供或改写可执行入口。伴随 worker 具有普通本机进程权限，不属于 iframe 沙箱，因此只应复制来源可信、许可证和模型清单完整的发行目录。
- 宿主只接受白名单消息、权限和字段，并限制节点坐标、消息长度、素材大小和 JSON 深度。
- `storage:preferences` 只开放按插件 ID 隔离、限量的 JSON 偏好，不开放浏览器存储对象；插件被禁用不会自动删除用户预设。
- `storage:project-documents` 同时按插件 ID 和当前画布项目 ID 隔离，由本机 Bridge 写入插件自身 `project-data/`，并使用跨进程文件锁、原子替换和修订号阻止多页面静默覆盖；接口不向局域网协作终端开放。
- `storage:shared-style-covers` 只开放当前插件的受限 style-id 与固定 WebP 文件，不接受磁盘路径、任意 MIME 或超限尺寸；数据跨该插件项目共享，使用哈希校验、跨进程锁和修订号 CAS，项目 JSON 只保存元数据引用。
- `models:use-text` 只允许使用宿主已启用且可用的文本模型；插件可见模型标识和公开能力，但不可见凭据、本机命令或任意端点。
- `models:use-media` 只允许使用宿主已启用且有真实适配器的图片／视频模型；结果以当前插件 iframe 会话内的 opaque `mediaId` 登记，URL、媒体字节、凭据、任意端点和本地路径不返回沙箱。下载和最终建图都由宿主重新校验句柄作用域及媒体类型。
- `media:transform` 只允许宿主处理当前插件＋当前 iframe 会话已经登记的受管媒体；目前公开的截帧操作只接受首帧或末帧，并返回新的图片句柄。它不授予任意文件读取、网络访问、系统编解码器命令或原始媒体导出能力。
- 设置页平铺安装器拒绝未声明文件、不安全路径、脚本字段和可执行文件，并展示 JavaScript runtime SHA-256 供审查；大型受信任音频包通过规范目录扫描与上述独立 worker 摘要门禁加载。

沙箱和权限只能缩小影响范围，不能证明第三方代码“绝对无木马”。插件仍可能写出误导界面、消耗 CPU 或存在业务错误；来源不可信、权限超出用途或无法审查源码的插件不应启用。

## 插件许可

仅通过本文件所述公开插件清单、沙箱和宿主 API 工作，且不复制或合并 Qiansi-Canvas 核心代码的独立插件，可以依据根目录 [许可策略中的插件例外](../LICENSING.md#插件) 使用插件作者自行选择的许可证，包括专有许可证。修改画布核心、复制核心代码或依赖未公开内部接口的模块不属于该例外，仍适用项目的 GPL 或另行签署的商业许可。
