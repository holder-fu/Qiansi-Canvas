export const GUIDE_LANGUAGE_PACKS: Record<'zh-CN' | 'en-US', Record<string, string>> = {
  'zh-CN': {
    'guide.comfyVideo.title': '千丝无限画布如何调用 ComfyUI 生成视频',
    'guide.comfyVideo.description':
      '千丝不会替代 ComfyUI，也不会修改模型算法。它负责把画布输入写入已导入的 API 工作流、提交队列、等待完成，再把最终视频保存回当前画布。',
    'guide.comfyVideo.stepLabel': '步骤 {number}',
    'guide.comfyVideo.step.prepareWorkflow': '准备工作流',
    'guide.comfyVideo.step.exportApiJson': '导出 API JSON',
    'guide.comfyVideo.step.importAndCheck': '导入并检查依赖',
    'guide.comfyVideo.step.selectWorkflow': '视频节点选择工作流',
    'guide.comfyVideo.step.generateAndRetrieve': '生成并取回视频',
    'guide.comfyVideo.prepare.title': '在 ComfyUI 中准备工作流',
    'guide.comfyVideo.prepare.runOnce': '先在 ComfyUI 中完整运行一次，确认本机可以正常生成视频。',
    'guide.comfyVideo.prepare.addMarkers':
      '给需要由画布替换的节点标题添加下方标记；没有标记的参数保留工作流原值。',
    'guide.comfyVideo.prepare.outputHistory':
      '最终输出必须能在 ComfyUI history 中返回 MP4、WebM 或 MOV 文件。',
    'guide.comfyVideo.prepare.exportApi':
      '使用 ComfyUI 的“Export (API)”或“Save (API Format)”导出 JSON，不要导出普通界面布局 JSON。',
    'guide.comfyVideo.canvasFlow.title': '导入后在画布中的实际流程',
    'guide.comfyVideo.canvasFlow.startServices':
      '启动 ComfyUI（默认 127.0.0.1:8188）和 Qiansi-Canvas 本地桥。',
    'guide.comfyVideo.canvasFlow.importWorkflow':
      '在本页检测连接并导入 API JSON；工作流会成为“视频模型”。',
    'guide.comfyVideo.canvasFlow.selectModel':
      '回到画布创建普通视频节点，在模型菜单选择“ComfyUI 本地 · 工作流名称”。',
    'guide.comfyVideo.canvasFlow.addInput':
      '输入提示词；图生视频时连接图片节点。首尾帧工作流最多连接两张图片。',
    'guide.comfyVideo.canvasFlow.submit':
      '点击生成后，画布桥上传图片、写入已标记参数并向 ComfyUI 提交任务。',
    'guide.comfyVideo.canvasFlow.retrieve':
      '任务完成后，画布桥读取 history、下载视频并写入当前画布素材。',
    'guide.comfyVideo.markers.title': '推荐的节点标题标记',
    'guide.comfyVideo.marker.prompt': '正向提示词',
    'guide.comfyVideo.marker.negative': '负向提示词（可选）',
    'guide.comfyVideo.marker.image': '首帧图片；存在时成为图生视频',
    'guide.comfyVideo.marker.endImage': '尾帧图片；需与首帧一起使用',
    'guide.comfyVideo.marker.size': '允许画布覆盖分辨率',
    'guide.comfyVideo.marker.timing': '允许画布覆盖时长；必须成对标记',
    'guide.comfyVideo.marker.output': '最终 MP4、WebM 或 MOV 输出节点',
    'guide.comfyVideo.safeMapping':
      '画布只覆盖成功识别或明确标记的参数。未映射的采样器、CFG、调度器和模型选择都会保留 JSON 中的原始值。',
    'guide.comfyVideo.warning':
      '当前每次只生成 1 个视频，参考音频尚未接入。依赖脚本会运行第三方节点安装流程，执行前必须确认工作流和节点来源可信。',
    'guide.plugin.copy.success': '已复制',
    'guide.plugin.copy.code': '复制代码',
    'guide.plugin.title': '插件开发帮助',
    'guide.plugin.description':
      '千丝插件 v2 可以提供自定义节点界面、画布右键菜单、布局面板和本地素材。JavaScript 只在无同源权限的隔离 iframe 中运行，通过白名单能力与画布通信。',
    'guide.plugin.purpose.title': '插件有什么用',
    'guide.plugin.purpose.customNodes': '新增自定义节点模块与可编程节点界面。',
    'guide.plugin.purpose.canvasCommands': '在画布右键菜单加入插件命令。',
    'guide.plugin.purpose.layoutPanels': '添加左侧、右侧、底部或浮动布局面板。',
    'guide.plugin.purpose.petWidget': '制作带动画和点击气泡的右下角宠物挂件。',
    'guide.plugin.purpose.share': '把插件文件夹分享给其他千丝无限画布用户。',
    'guide.plugin.purpose.toggle': '随时启用或停用，不需要修改画布核心代码。',
    'guide.plugin.capabilities.title': '目前可以实现',
    'guide.plugin.capabilities.hostNodes': '自定义沙箱节点和图片、视频、音频宿主节点。',
    'guide.plugin.capabilities.directorNodes': '复用 2D / 3D 导演台节点模块。',
    'guide.plugin.capabilities.interfaces': 'WebGL、Canvas 和普通 HTML 插件界面。',
    'guide.plugin.capabilities.ports': 'image、video、audio、text、reference、any 端口。',
    'guide.plugin.capabilities.petAssets': 'PNG、JPG、WebP 本地宠物图片。',
    'guide.plugin.capabilities.management': '多节点、多宠物和插件启停管理。',
    'guide.plugin.security.title': '安全边界',
    'guide.plugin.security.noSecrets': '不能读取 API Key、Cookie、任意本机文件或主页面 DOM。',
    'guide.plugin.security.noSystemAccess':
      '不能联网、启动 Python、EXE、BAT、PowerShell 或系统命令。',
    'guide.plugin.security.noCoreOverwrite': '不能覆盖程序源码、启动器和画布核心模块。',
    'guide.plugin.security.allowlistOnly': '只能调用清单申请且由用户启用授权的画布能力。',
    'guide.plugin.create.title': '从零创建插件',
    'guide.plugin.create.directory.label': '1. 创建目录：',
    'guide.plugin.create.directory.description': '在下方插件目录中新建一个独立文件夹。',
    'guide.plugin.create.manifest.label': '2. 新建清单：',
    'guide.plugin.create.manifest.description': '创建 UTF-8 编码的 plugin.json。',
    'guide.plugin.create.features.label': '3. 填写功能：',
    'guide.plugin.create.features.description': '声明 nodes、menus、panels 或 widgets。',
    'guide.plugin.create.runtime.label': '4. 加入运行时：',
    'guide.plugin.create.runtime.description': '把 runtime.js 与 plugin.json 放在同一文件夹。',
    'guide.plugin.create.refresh.label': '5. 刷新检查：',
    'guide.plugin.create.refresh.description': '回到插件页面点击“刷新”，查看错误提示。',
    'guide.plugin.create.authorization.label': '6. 授权测试：',
    'guide.plugin.create.authorization.description': '检查权限后启用，再从画布右键菜单运行。',
    'guide.plugin.localDirectory': '本机插件目录',
    'guide.plugin.example.manifest': '示例一：v2 插件清单',
    'guide.plugin.example.runtime': '示例二：隔离 runtime.js',
    'guide.plugin.example.pet': '示例三：兼容宠物挂件',
    'guide.plugin.copy.error': '浏览器没有允许复制，请在代码框中手动选择内容。',
    'guide.plugin.requirements.title': '字段和格式要求',
    'guide.plugin.requirements.schema':
      '可编程插件使用 schemaVersion 2；旧版 schemaVersion 1 继续兼容。',
    'guide.plugin.requirements.ids':
      '插件、节点、挂件 ID 必须以小写字母开头，只含小写字母、数字和连字符。',
    'guide.plugin.requirements.accent': 'accent 必须是六位十六进制颜色，例如 #22d3ee。',
    'guide.plugin.requirements.limits':
      '每个插件最多声明 40 个节点、20 个菜单、8 个面板和 12 个挂件。',
    'guide.plugin.requirements.pet': '宠物宽度只能是 72–240 的整数，位置目前固定为 bottom-right。',
    'guide.plugin.install.title': '安装、分享与调试',
    'guide.plugin.install.selectFiles':
      '导入 v2 插件时同时选择 plugin.json、runtime.js 和清单素材。',
    'guide.plugin.install.authorization':
      '有权限申请的 v2 插件导入后默认停用，检查后手动启用即表示授权。',
    'guide.plugin.install.refresh': '修改清单或图片后点击“刷新”；清单错误会显示在插件页面底部。',
    'guide.plugin.install.disable': '停用插件不会删除文件，也不会删除已经保存的插件节点。',
    'guide.plugin.install.crossDevice': '发布前请在另一台电脑复制完整文件夹测试一次。',
    'guide.plugin.safetyAdvice':
      '安全建议：沙箱隔离不等于作者可信认证。仍应检查插件来源、权限列表和运行时 SHA-256；分享前不要把 API Key、账号文件或私人素材放进插件目录。',
    'guide.plugin.warning':
      '注意：插件包只接收白名单文件类型和平面文件名，不允许绝对路径、../ 路径、网络地址或系统可执行文件。',
  },
  'en-US': {
    'guide.comfyVideo.title': 'How Qiansi-Canvas generates video with ComfyUI',
    'guide.comfyVideo.description':
      'Qiansi does not replace ComfyUI or change model algorithms. It writes canvas inputs into an imported API workflow, submits the queue, waits for completion, and saves the final video back to the current canvas.',
    'guide.comfyVideo.stepLabel': 'Step {number}',
    'guide.comfyVideo.step.prepareWorkflow': 'Prepare the workflow',
    'guide.comfyVideo.step.exportApiJson': 'Export API JSON',
    'guide.comfyVideo.step.importAndCheck': 'Import and check dependencies',
    'guide.comfyVideo.step.selectWorkflow': 'Select the workflow on a video node',
    'guide.comfyVideo.step.generateAndRetrieve': 'Generate and retrieve the video',
    'guide.comfyVideo.prepare.title': 'Prepare the workflow in ComfyUI',
    'guide.comfyVideo.prepare.runOnce':
      'Run the complete workflow once in ComfyUI and confirm that this computer can generate video.',
    'guide.comfyVideo.prepare.addMarkers':
      'Add the markers below to the titles of nodes the canvas should replace. Unmarked parameters keep their workflow values.',
    'guide.comfyVideo.prepare.outputHistory':
      'The final output must return an MP4, WebM, or MOV file in ComfyUI history.',
    'guide.comfyVideo.prepare.exportApi':
      'Export JSON with ComfyUI “Export (API)” or “Save (API Format)”; do not export the regular UI layout JSON.',
    'guide.comfyVideo.canvasFlow.title': 'What happens on the canvas after import',
    'guide.comfyVideo.canvasFlow.startServices':
      'Start ComfyUI (127.0.0.1:8188 by default) and the Qiansi-Canvas local bridge.',
    'guide.comfyVideo.canvasFlow.importWorkflow':
      'Check the connection on this page and import the API JSON. The workflow becomes a “video model.”',
    'guide.comfyVideo.canvasFlow.selectModel':
      'Create a regular video node on the canvas and select “Local ComfyUI · Workflow name” from the model menu.',
    'guide.comfyVideo.canvasFlow.addInput':
      'Enter a prompt and connect an image node for image-to-video. A first-and-last-frame workflow accepts at most two images.',
    'guide.comfyVideo.canvasFlow.submit':
      'After you select Generate, the canvas bridge uploads images, writes marked parameters, and submits the task to ComfyUI.',
    'guide.comfyVideo.canvasFlow.retrieve':
      'When the task finishes, the canvas bridge reads history, downloads the video, and adds it to the current canvas assets.',
    'guide.comfyVideo.markers.title': 'Recommended node-title markers',
    'guide.comfyVideo.marker.prompt': 'Positive prompt',
    'guide.comfyVideo.marker.negative': 'Negative prompt (optional)',
    'guide.comfyVideo.marker.image': 'First-frame image; enables image-to-video when present',
    'guide.comfyVideo.marker.endImage': 'Last-frame image; use together with the first frame',
    'guide.comfyVideo.marker.size': 'Allows the canvas to override resolution',
    'guide.comfyVideo.marker.timing': 'Allows the canvas to override duration; mark both values',
    'guide.comfyVideo.marker.output': 'Final MP4, WebM, or MOV output node',
    'guide.comfyVideo.safeMapping':
      'The canvas only overrides parameters that are recognized or explicitly marked. Unmapped samplers, CFG, schedulers, and model selections retain their original JSON values.',
    'guide.comfyVideo.warning':
      'Each task currently generates one video, and reference audio is not connected yet. Dependency scripts run third-party node installation flows, so verify the workflow and node sources before continuing.',
    'guide.plugin.copy.success': 'Copied',
    'guide.plugin.copy.code': 'Copy code',
    'guide.plugin.title': 'Plugin development guide',
    'guide.plugin.description':
      'Qiansi plugin v2 can provide custom node interfaces, canvas context menus, layout panels, and local assets. JavaScript runs only in a sandboxed iframe without same-origin access and communicates with the canvas through allowlisted capabilities.',
    'guide.plugin.purpose.title': 'What plugins can add',
    'guide.plugin.purpose.customNodes': 'Add custom node modules and programmable node interfaces.',
    'guide.plugin.purpose.canvasCommands': 'Add plugin commands to the canvas context menu.',
    'guide.plugin.purpose.layoutPanels': 'Add left, right, bottom, or floating layout panels.',
    'guide.plugin.purpose.petWidget':
      'Create an animated bottom-right pet widget with click bubbles.',
    'guide.plugin.purpose.share': 'Share the plugin folder with other Qiansi-Canvas users.',
    'guide.plugin.purpose.toggle':
      'Enable or disable it at any time without changing canvas core code.',
    'guide.plugin.capabilities.title': 'Currently supported',
    'guide.plugin.capabilities.hostNodes':
      'Custom sandbox nodes and image, video, or audio host nodes.',
    'guide.plugin.capabilities.directorNodes': 'Reuse 2D and 3D Director node modules.',
    'guide.plugin.capabilities.interfaces': 'WebGL, Canvas, and standard HTML plugin interfaces.',
    'guide.plugin.capabilities.ports': 'image, video, audio, text, reference, and any ports.',
    'guide.plugin.capabilities.petAssets': 'Local PNG, JPG, and WebP pet images.',
    'guide.plugin.capabilities.management':
      'Multiple nodes, multiple pets, and plugin enable controls.',
    'guide.plugin.security.title': 'Security boundary',
    'guide.plugin.security.noSecrets':
      'Cannot read API keys, cookies, arbitrary local files, or the host page DOM.',
    'guide.plugin.security.noSystemAccess':
      'Cannot access the network or launch Python, EXE, BAT, PowerShell, or system commands.',
    'guide.plugin.security.noCoreOverwrite':
      'Cannot overwrite application source, launchers, or canvas core modules.',
    'guide.plugin.security.allowlistOnly':
      'Can only call canvas capabilities requested in the manifest and enabled by the user.',
    'guide.plugin.create.title': 'Create a plugin from scratch',
    'guide.plugin.create.directory.label': '1. Create a directory: ',
    'guide.plugin.create.directory.description':
      'Create a separate folder inside the plugin directory shown below.',
    'guide.plugin.create.manifest.label': '2. Add a manifest: ',
    'guide.plugin.create.manifest.description': 'Create a UTF-8 encoded plugin.json file.',
    'guide.plugin.create.features.label': '3. Declare features: ',
    'guide.plugin.create.features.description': 'Declare nodes, menus, panels, or widgets.',
    'guide.plugin.create.runtime.label': '4. Add the runtime: ',
    'guide.plugin.create.runtime.description': 'Put runtime.js and plugin.json in the same folder.',
    'guide.plugin.create.refresh.label': '5. Refresh and check: ',
    'guide.plugin.create.refresh.description':
      'Return to the Plugins page, select “Refresh,” and review any errors.',
    'guide.plugin.create.authorization.label': '6. Authorize and test: ',
    'guide.plugin.create.authorization.description':
      'Review permissions, enable the plugin, then run it from the canvas context menu.',
    'guide.plugin.localDirectory': 'Local plugin directory',
    'guide.plugin.example.manifest': 'Example 1: v2 plugin manifest',
    'guide.plugin.example.runtime': 'Example 2: sandboxed runtime.js',
    'guide.plugin.example.pet': 'Example 3: compatible pet widget',
    'guide.plugin.copy.error':
      'The browser did not allow copying. Select the content manually in the code panel.',
    'guide.plugin.requirements.title': 'Field and format requirements',
    'guide.plugin.requirements.schema':
      'Programmable plugins use schemaVersion 2; legacy schemaVersion 1 remains compatible.',
    'guide.plugin.requirements.ids':
      'Plugin, node, and widget IDs must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.',
    'guide.plugin.requirements.accent':
      'accent must be a six-digit hexadecimal color such as #22d3ee.',
    'guide.plugin.requirements.limits':
      'Each plugin may declare up to 40 nodes, 20 menus, 8 panels, and 12 widgets.',
    'guide.plugin.requirements.pet':
      'Pet width must be an integer from 72 to 240, and position is currently fixed to bottom-right.',
    'guide.plugin.install.title': 'Install, share, and debug',
    'guide.plugin.install.selectFiles':
      'When importing a v2 plugin, select plugin.json, runtime.js, and manifest assets together.',
    'guide.plugin.install.authorization':
      'A v2 plugin that requests permissions is disabled after import. Enabling it after review grants authorization.',
    'guide.plugin.install.refresh':
      'Select “Refresh” after changing the manifest or images. Manifest errors appear at the bottom of the Plugins page.',
    'guide.plugin.install.disable':
      'Disabling a plugin does not delete its files or previously saved plugin nodes.',
    'guide.plugin.install.crossDevice':
      'Before release, copy the complete folder to another computer and test it once.',
    'guide.plugin.safetyAdvice':
      'Security advice: sandbox isolation does not certify an author as trustworthy. Review the plugin source, permission list, and runtime SHA-256. Do not place API keys, account files, or private assets in the plugin directory before sharing.',
    'guide.plugin.warning':
      'Note: plugin packages only accept allowlisted file types and flat filenames. Absolute paths, ../ paths, network addresses, and system executables are not allowed.',
  },
};
