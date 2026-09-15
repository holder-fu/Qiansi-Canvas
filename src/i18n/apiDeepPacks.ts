export const API_DEEP_LANGUAGE_PACKS: Record<'zh-CN' | 'en-US', Record<string, string>> = {
  'zh-CN': {
    'apiSettings.cli.models.historicalSnapshot':
      '以下为上次验证保留的模型记录，正在等待后台复核；不代表本次会话已实时连接。',
    'apiSettings.status.fixedConfigurationValidated':
      '固定模型与接口格式已校验；API Key 将在首次生成时由上游验证。',
    'apiSettings.status.sessionConnectionVerified': '本次会话已验证连接。',
    'apiSettings.status.restoredConnectionReviewing': '已恢复上次验证通过的连接，后台将自动复核。',
    'apiSettings.status.restoredConnectionReady': '已恢复上次验证通过的连接，画布可直接使用。',
    'apiSettings.status.verifyingLiveConnection': '正在验证真实连接…',
    'apiSettings.status.connectionSucceeded': '连接成功。',
    'apiSettings.status.readingAndClassifyingModels': '正在读取并分类模型…',
    'apiSettings.status.performingLiveCheck': '正在执行真实连接检测…',
    'apiSettings.status.autoDetecting': '正在自动检测…',
    'apiSettings.error.invalidImageConfiguration': '图片 API 配置无效。',
    'apiSettings.error.connectionFailed': '连接失败。',
    'apiSettings.error.modelFetchFailed': '读取模型失败。',
    'apiSettings.error.keyDeleteFailed': '密钥删除失败，请重试。',
    'apiSettings.notice.keySaveFailed': '密钥未能安全保存；请检查浏览器存储权限后重试。',
    'apiSettings.notice.fixedModelsRetained': '该平台使用固定模型，已保留管理员配置',
    'apiSettings.notice.modelsFetched': '已拉取并分类模型',
    'apiSettings.notice.providerNameAndAddressRequired': '请输入平台名称和地址',
    'apiSettings.notice.localBridgeAdded': '已新增本地桥平台',
    'apiSettings.notice.imageProviderAdded': '已新增图像平台',
    'apiSettings.notice.providerAdded': '已新增平台',
    'apiSettings.notice.providerReset': '已重置该平台',
    'apiSettings.notice.providerDeleted': '已删除平台',
    'apiSettings.providerTitle.connected': '已连接',
    'apiSettings.providerTitle.checkingCapabilities': '正在验证真实登录与可用能力',
    'apiSettings.providerTitle.fixedPendingKey': '配置格式有效；首次生成时验证 API Key',
    'apiSettings.providerTitle.historyCannotGenerate': '仅有历史记录，不能用于生成',
    'apiSettings.providerTitle.cliUnavailable': '未安装、未登录或检测失败',
    'apiSettings.providerTitle.connectionTestFailed': '连接测试失败',
    'apiSettings.providerTitle.missingApiKey': '缺少 API Key',
    'apiSettings.providerTitle.disabled': '已停用',
    'apiSettings.placeholder.localBridgeUrl': 'http://127.0.0.1:端口',
    'apiSettings.placeholder.imageApiUrl': 'https://图像API地址',
    'apiSettings.region.mainlandChina': '国内',
    'apiSettings.region.international': '海外',
    'apiSettings.modelKindPlaceholder': '输入{kind}…',
    'apiSettings.modelKindUnavailableDescription':
      '官方接口需要专用请求或异步轮询适配；当前仅保留配置，不会把这些模型放入画布生成菜单。',
    'apiSettings.audioModelAdapterNotice':
      '音频模型会被识别并保存；只有实现对应厂商的音频请求适配器后，才会进入音频节点的生成菜单。',
    'apiSettings.deleteModel': '删除 {model}',
    'apiSettings.imageModelIdPlaceholder': '模型 ID，例如 gpt-image-2',
    'apiSettings.fixedModelsDescription': '官方无模型目录，保留管理员填写的固定模型',
    'apiSettings.dynamicModelsDescription': '从上游读取并分类',
    'apiSettings.cli.status.restoredHistoryReviewing': '已恢复历史检测记录，正在后台复核。',
    'apiSettings.cli.status.connectionChangedScanAgain': '连接配置已变更，请重新扫码。',
    'apiSettings.cli.status.revalidatingCapabilities': '正在重新验证命令、登录态和真实可用能力。',
    'apiSettings.cli.status.detectingLocalCli': '正在检测本机 CLI…',
    'apiSettings.cli.status.localCommandFound': '已检测到本机命令。',
    'apiSettings.cli.status.providerNotFound': '未找到 {name}。',
    'apiSettings.cli.status.bridgeNeedsRestart':
      '当前本地桥只确认 CLI 已安装，没有验证登录、运行状态和模型可用性；请重启 Qiansi-Canvas 后重新检测。',
    'apiSettings.cli.status.antigravityFallbackRejected':
      '检测到的是 Gemini CLI，不是 Antigravity CLI；该回退已停用，请安装或登录 agy 后重新检测。',
    'apiSettings.cli.status.historyOnlyWithMessage': '仅保留历史检测记录；{message}',
    'apiSettings.cli.status.historyBlocksCapabilities':
      '仅保留上次检测记录；完成实时复核前不会开放模型或执行能力。',
    'apiSettings.cli.error.unverifiableCustomProtocol':
      '自定义 CLI 尚未声明可验证的桥接协议，不能标记为已连接。',
    'apiSettings.cli.error.detectionServiceStopped': '本地检测服务未启动。',
    'apiSettings.cli.error.autoDetectionFailed': '本地 CLI 自动检测失败。',
    'apiSettings.cli.error.bridgeUnavailable':
      '未能连接画布桥（{url}）。请确认主机上的 Qiansi-Canvas 服务已启动且未被防火墙拦截，然后点“重新检测”。',
    'apiSettings.cli.error.detectionTimedOut':
      'CLI 登录状态检测超时，请稍后重试；这不代表本地桥未启动。',
    'apiSettings.cli.workBuddyAutoModel': 'WorkBuddy 自动选择',
    'apiSettings.cli.localBridgeDescription':
      '本平台由本地桥（项目根目录 local-bridge.mjs）驱动，需先双击根目录的“打开Qiansi-Canvas.bat”并保持窗口打开。桥运行后本页会自动检测已安装的命令行工具、版本与登录状态；也可点“重新检测”。请勿在此填写 API Key——CLI 走本机登录态。',
    'apiSettings.cli.description.volcengine':
      '检测火山方舟官方 Ark CLI（arkcli）的安装与登录状态；当前尚未接入画布生成适配器。',
    'apiSettings.cli.description.jimeng':
      '安装并检测即梦官方 CLI；登录后可在图片、视频节点中直接使用官方生成模型。',
    'apiSettings.cli.description.workBuddy':
      '检测 WorkBuddy 官方 CodeBuddy Code CLI；只有软件已打开并保持活动会话时，才可用于 AI 助手、文本节点，以及原生多模态 Hy3 图片分析。',
    'apiSettings.cli.description.antigravity':
      '仅检测官方 Antigravity CLI（agy）；不会回退到 Gemini CLI，登录验证通过后才开放文本模型。',
    'apiSettings.cli.description.bailian': '检测阿里云百炼官方 bl CLI；用于云端图片与视频生成。',
    'apiSettings.cli.description.lightX2V': '检测本机 LightX2V Python 环境、模型目录与生成配置。',
    'apiSettings.cli.description.default': '进入设置后自动检测本机命令、版本与登录状态。',
    'apiSettings.cli.commandFound': '命令已找到',
    'apiSettings.cli.commandNotFound': '未找到命令',
    'apiSettings.cli.localCommandFound': '已找到本机命令',
    'apiSettings.cli.officialInstallerAvailable': '可在下方使用官方安装器',
    'apiSettings.cli.rootInstallerHint': '使用平台安装器或查看帮助',
    'apiSettings.cli.capability.accountTools': '账户工具',
    'apiSettings.cli.capability.openapiIdentity': '方舟身份',
    'apiSettings.cli.capability.volcengineIdentityDescription':
      '通过 arkcli auth status 验证官方登录状态',
    'apiSettings.cli.capability.canvasAdapter': '画布适配',
    'apiSettings.cli.capability.managementOnly': '尚未启用',
    'apiSettings.cli.capability.volcengineNoGeneration':
      '当前不发布画布模型；生成内容请使用火山方舟 API 服务商',
    'apiSettings.cli.capability.bailianAccount': '百炼账户',
    'apiSettings.cli.capability.localRuntime': '本地运行时',
    'apiSettings.cli.capability.textTasks': '文本任务',
    'apiSettings.cli.capability.unavailable': '不可用',
    'apiSettings.cli.capability.accountValidatedOnUse': '调用时验证账户',
    'apiSettings.cli.capability.workBuddyRunning': '会话运行中 · 可用',
    'apiSettings.cli.capability.openWorkBuddy': '请先打开 WorkBuddy',
    'apiSettings.cli.capability.workBuddySessionRequired':
      '保持 codebuddy 会话运行；关闭后模型自动停用',
    'apiSettings.cli.capability.loggedInAvailable': '已登录 · 可用',
    'apiSettings.cli.capability.loginRequired': '需要登录',
    'apiSettings.cli.capability.pythonReady': 'Python 环境可用',
    'apiSettings.cli.capability.incompleteConfiguration': '配置不完整',
    'apiSettings.cli.capability.loginUnverified': '登录状态未验证',
    'apiSettings.cli.capability.jimengAccountActions': '扫码、积分与退出登录',
    'apiSettings.cli.capability.bailianManagedLogin': '登录态由 bl CLI 管理',
    'apiSettings.cli.capability.lightX2VRequirements': 'Python、包与路径均需通过检测',
    'apiSettings.cli.capability.textTaskDescription': '用于 AI 对话和文本节点',
    'apiSettings.cli.capability.imageVideoAvailable': '图片、视频生成可用',
    'apiSettings.cli.capability.imageAvailable': '图片生成可用',
    'apiSettings.cli.capability.videoAvailable': '视频生成可用',
    'apiSettings.cli.capability.generationDisabled': '生成能力未启用',
    'apiSettings.cli.capability.generationNotReady': '生成配置未就绪',
    'apiSettings.cli.capability.imageDisabled': '图片能力未启用',
    'apiSettings.cli.capability.textOnly': '仅支持文本',
    'apiSettings.cli.capability.configureGenerationApi': '请配置生成 API',
    'apiSettings.cli.capability.restoredStillValidated':
      '已恢复上次可用能力，实际调用仍由本地桥校验',
    'apiSettings.cli.capability.modelsAppearInNodes': '官方 CLI 模型会显示在对应节点的模型下拉框中',
    'apiSettings.cli.capability.loginThenDetect': '完成登录并重新检测后开放节点模型',
    'apiSettings.cli.capability.codexImageFeatures': '支持生成、扩图和参考图修改',
    'apiSettings.cli.capability.upgradeCodex': '请升级 Codex CLI 并重新检测',
    'apiSettings.cli.capability.textOrAccountOnly': '当前 CLI 仅用于文本或账户功能',
    'apiSettings.cli.login.antigravity': '请启动 Antigravity CLI 完成登录，然后重新检测。',
    'apiSettings.cli.login.completeThenDetect': '请先完成 CLI 登录，再重新检测。',
    'apiSettings.cli.install.jimengOfficial':
      '点击“安装 / 修复 CLI”将通过 jimeng.jianying.com 官方安装器进行安装。',
    'apiSettings.cli.install.rootBatchHint':
      'Windows 可运行 tools/launchers/安装CLI工具-Windows.bat；macOS 可运行 tools/launchers/安装CLI工具-macOS.command，或打开对应设置帮助。',
    'apiSettings.cli.bridgeToken': '桥接令牌（可选）',
    'apiSettings.cli.models.generationModelsAvailable':
      '已通过真实连接检测；以下官方模型已开放到图片和视频节点',
    'apiSettings.cli.models.workBuddyModelsLoaded':
      '已读取当前 WorkBuddy CLI 版本支持的 {count} 个模型（含 Hy3 原生图片分析）',
    'apiSettings.cli.models.workBuddyClosed':
      '当前没有活动 WorkBuddy 会话；模型已隐藏，请打开 WorkBuddy 后重新检测。',
    'apiSettings.cli.models.antigravityUnavailable':
      'Antigravity 尚未通过 agy 登录检测；模型已隐藏，完成登录后请重新检测。',
    'apiSettings.cli.models.codexReasoningAvailable': '已通过真实连接检测；Codex 模型可设推理强度',
    'apiSettings.cli.models.textModelsLoaded': '已读取当前 CLI 的可用文本模型',
    'apiSettings.cli.models.volcengineIdentityReady':
      '官方 Ark CLI 已安装并通过身份验证；画布生成适配器尚未启用。',
    'apiSettings.cli.models.volcengineManagementOnly':
      '官方 Ark CLI 已接入安装与检测，当前尚不提供画布生成模型。',
    'apiSettings.cli.models.cachedOnly':
      '以下仅为预设或缓存模型，连接成功前不会出现在节点模型选择中',
    'apiSettings.cli.models.unsupportedKind': '当前 CLI 没有接入这类生成任务，请选择其它可用平台。',
    'apiSettings.cli.models.noneAfterLogin': '尚未检测到可用模型，请完成登录后点击「拉取模型」。',
    'apiSettings.cli.models.noneConfigured': '暂无模型，可手动添加或点击「拉取模型」。',
    'apiSettings.cli.jimeng.startingInstaller': '正在启动即梦官方安装器…',
    'apiSettings.cli.jimeng.installerStartFailed': '即梦 CLI 安装启动失败。',
    'apiSettings.cli.jimeng.detected': '已检测到即梦 CLI。',
    'apiSettings.cli.jimeng.installStatusFailed': '无法读取即梦 CLI 安装状态。',
    'apiSettings.cli.jimeng.installComplete': '即梦 CLI 安装完成',
    'apiSettings.cli.jimeng.installEndedNotDetected': '安装进程已结束，但未检测到 dreamina CLI。',
    'apiSettings.cli.jimeng.installTimedOut':
      '安装等待超时。安装器可能仍在运行，请稍后点击“重新检测”。',
    'apiSettings.cli.jimeng.installFailed': '即梦 CLI 安装失败。',
    'apiSettings.cli.jimeng.bridgeUnavailableForInstall':
      '未能连接本地桥。请先用根目录的“打开Qiansi-Canvas.bat”重新启动画布，再点击安装。',
    'apiSettings.cli.jimeng.startingQrLogin': '正在启动扫码登录…',
    'apiSettings.cli.jimeng.qrLoginStartFailed': '扫码登录启动失败。',
    'apiSettings.cli.jimeng.loginStatusFailed': '无法读取即梦登录状态。',
    'apiSettings.cli.jimeng.loggedIn': '即梦 CLI 已登录。',
    'apiSettings.cli.jimeng.qrLoginSucceeded': '扫码成功，已登录',
    'apiSettings.cli.jimeng.loginSucceeded': '即梦登录成功',
    'apiSettings.cli.jimeng.loginIncomplete': '登录未完成，请重新打开扫码登录页面。',
    'apiSettings.cli.jimeng.qrTimedOut': '二维码已超时，请重新扫码。',
    'apiSettings.cli.jimeng.queryingCredits': '正在查询积分…',
    'apiSettings.cli.jimeng.creditQueryFailed': '积分查询失败。',
    'apiSettings.cli.jimeng.creditQuerySucceeded': '积分查询成功。',
    'apiSettings.cli.jimeng.loggedOut': '即梦 CLI 已退出登录。',
    'apiSettings.cli.jimeng.signOutSucceeded': '已退出登录',
    'apiSettings.cli.jimeng.installBeforeLogin': '请先安装并检测即梦 CLI',
    'apiSettings.cli.jimeng.installingTitle': '即梦 CLI 安装中',
    'apiSettings.cli.jimeng.installResultTitle': '即梦 CLI 安装结果',
    'apiSettings.cli.jimeng.waitingInstallerOutput': '正在等待官方安装器输出…',
    'apiSettings.cli.jimeng.qrCodeAlt': '即梦扫码登录二维码',
    'apiSettings.cli.jimeng.openQrPage': '打开即梦扫码登录页面',
    'apiSettings.cli.jimeng.authorizationCode': '登录授权码',
    'apiSettings.cli.jimeng.completeAuthorization': '请在官方页面扫码并完成授权',
    'apiSettings.cli.jimeng.privacyNotice':
      'Qiansi-Canvas 只展示本机 CLI 返回的官方授权地址和状态，不读取账号密码。',
    'apiSettings.cli.jimeng.waitingCompatibleOutput': '正在等待兼容命令输出…',
    'apiSettings.cli.lightX2V.title': '本地推理配置',
    'apiSettings.cli.lightX2V.description':
      '路径仅保存在本机浏览器配置中，并以参数数组传给固定的 LightX2V 适配器。',
    'apiSettings.cli.lightX2V.pythonExecutable': 'Python 解释器',
    'apiSettings.cli.lightX2V.pythonExecutablePlaceholder':
      '例如 C:\\miniconda3\\envs\\lightx2v\\python.exe',
    'apiSettings.cli.lightX2V.workingDirectory': 'LightX2V 工作目录',
    'apiSettings.cli.lightX2V.workingDirectoryPlaceholder': '例如 D:\\AI\\LightX2V',
    'apiSettings.cli.lightX2V.imageModelPath': '图片模型目录',
    'apiSettings.cli.lightX2V.imageModelPathPlaceholder': 'Qwen-Image 等模型权重目录',
    'apiSettings.cli.lightX2V.imageModelClass': '图片模型类型',
    'apiSettings.cli.lightX2V.imageModelClassPlaceholder': '例如 qwen-image-2512',
    'apiSettings.cli.lightX2V.imageTask': '图片任务类型',
    'apiSettings.cli.lightX2V.imageTaskPlaceholder': 't2i 或 i2i',
    'apiSettings.cli.lightX2V.imageConfigPath': '图片 config_json',
    'apiSettings.cli.lightX2V.imageConfigPathPlaceholder': '官方图片生成 JSON 配置文件',
    'apiSettings.cli.lightX2V.videoModelPath': '视频模型目录',
    'apiSettings.cli.lightX2V.videoModelPathPlaceholder': 'Wan / HunyuanVideo 等模型权重目录',
    'apiSettings.cli.lightX2V.videoModelClass': '视频模型类型',
    'apiSettings.cli.lightX2V.videoModelClassPlaceholder': '默认 wan2.2_moe',
    'apiSettings.cli.lightX2V.videoTask': '视频任务类型',
    'apiSettings.cli.lightX2V.videoTaskPlaceholder': 't2v 或 i2v',
    'apiSettings.cli.lightX2V.videoConfigPath': '视频 config_json',
    'apiSettings.cli.lightX2V.videoConfigPathPlaceholder': '官方视频生成 JSON 配置文件',
    'apiSettings.comfy.status.connectedWithWorkflows':
      'ComfyUI 已连接，已载入 {count} 个图片或视频工作流。',
    'apiSettings.comfy.status.connectedNeedsWorkflow':
      'ComfyUI 已连接，请导入 ComfyUI 图片或视频工作流 JSON。',
    'apiSettings.comfy.error.localUnavailable': '画布桥已启动，但未能连接本机 ComfyUI。',
    'apiSettings.comfy.error.remoteUnavailable': '画布桥已启动，但未能连接远程 ComfyUI。',
    'apiSettings.comfy.addRemoteConnection': '新增远程 ComfyUI',
    'apiSettings.comfy.notice.remoteConnectionAdded': '已新增远程 ComfyUI：{name}',
    'apiSettings.comfy.remoteHttpsNotice':
      '只允许 HTTPS 公网地址；请填写 API 根地址，不要包含 /prompt、查询参数或 #工作流片段。',
    'apiSettings.comfy.remoteAddressPending': '待填写的远程地址',
    'apiSettings.comfy.remoteStartHint': '请填写远程 ComfyUI HTTPS 地址和可选密钥，再检测连接。',
    'apiSettings.comfy.error.workflowTooLarge': '工作流 JSON 不能超过 5 MB。',
    'apiSettings.comfy.error.importFailed': '导入工作流失败。',
    'apiSettings.comfy.error.copyDenied': '浏览器未允许复制，请使用“下载 PowerShell”按钮。',
    'apiSettings.comfy.error.deleteFailed': '删除工作流失败。',
    'apiSettings.comfy.defaultWorkflowName': 'ComfyUI 工作流',
    'apiSettings.comfy.notice.workflowSaved':
      '已保存“{name}”；检测到 {nodeCount} 类节点、{modelCount} 个模型引用。',
    'apiSettings.comfy.notice.workflowConverted':
      '已将普通 ComfyUI 工作流转换为 API Format 并保存“{name}”；检测到 {nodeCount} 类节点、{modelCount} 个模型引用。',
    'apiSettings.comfy.notice.scriptCopied': 'PowerShell 安装脚本已复制。',
    'apiSettings.comfy.notice.scriptDownloaded':
      'PowerShell 安装脚本已下载；执行前请检查内容并确认工作流来源可信。',
    'apiSettings.comfy.notice.workflowDeleted': '已删除“{name}”。',
    'apiSettings.comfy.bridgeRouting':
      '浏览器仅连接画布桥 {bridgeUrl}，由画布桥转发到 {providerUrl}。',
    'apiSettings.comfy.startServicesHint': '请先启动 ComfyUI 和 Qiansi-Canvas 本地桥，再检测连接。',
    'apiSettings.comfy.workflowStorageDescription':
      '工作流会保存在本地桥中，并按输出类型作为图片或视频模型传给生成任务。',
    'apiSettings.comfy.trustedWorkflowHint':
      '支持 API Format 及含 nodes / links 的普通工作流；普通格式会在本地转换。输出节点需保存图片，或生成 MP4、WebM、MOV 视频。',
    'apiSettings.comfy.dependencySummary':
      '{nodeCount} 类节点 · {modelCount} 个模型引用 · {downloadCount} 个带可验证下载地址',
    'apiSettings.comfy.nodeClasses': '节点类（由官方 comfy CLI 映射所属模块）',
    'apiSettings.comfy.modelFiles': '模型文件',
    'apiSettings.comfy.scriptCanDownload': '脚本可下载',
    'apiSettings.comfy.manualSourceRequired': '需人工提供来源',
    'apiSettings.comfy.noModelFilesDetected': '没有从常见模型输入字段中检测到模型文件名。',
    'apiSettings.comfy.workflowJson': '无限画布节点 JSON',
    'apiSettings.comfy.workflowJsonDescription':
      '下载后可从画布顶部直接导入，将创建已绑定当前 ComfyUI 工作流模型的图片或视频节点。',
    'apiSettings.comfy.downloadWorkflowJson': '下载画布 JSON',
    'apiSettings.comfy.downloadApiWorkflowJson': '下载 API JSON',
    'apiSettings.comfy.workflowJsonTruncated': '预览已截断；下载文件包含完整 JSON。',
    'apiSettings.comfy.installScriptSafety':
      '脚本使用官方命令 comfy node install-deps --workflow。模型只有在 JSON 同时提供可信 HTTP(S) 下载地址时才会自动下载；只有文件名的模型不会猜测来源。在 PowerShell 中运行脚本；如果 comfy CLI 没有记住工作区，可追加参数 -Workspace “D:\\ComfyUI”。',
    'apiSettings.comfy.workflowCount': '{count} 个',
    'apiSettings.comfy.deleteWorkflow': '删除 {name}',
    'apiSettings.comfy.emptyWorkflows':
      '尚未导入工作流。连接成功后导入 ComfyUI JSON，对应的图片或视频节点会显示 ComfyUI 模型。',
  },
  'en-US': {
    'apiSettings.cli.models.historicalSnapshot':
      'These models are retained from the previous verification and await a background recheck; they do not indicate a live connection in this session.',
    'apiSettings.status.fixedConfigurationValidated':
      'The fixed models and request format are valid. The upstream service will verify the API key on the first generation request.',
    'apiSettings.status.sessionConnectionVerified': 'The connection was verified in this session.',
    'apiSettings.status.restoredConnectionReviewing':
      'The previously verified connection was restored and will be rechecked in the background.',
    'apiSettings.status.restoredConnectionReady':
      'The previously verified connection was restored and is ready for the canvas.',
    'apiSettings.status.verifyingLiveConnection': 'Verifying the live connection…',
    'apiSettings.status.connectionSucceeded': 'Connection successful.',
    'apiSettings.status.readingAndClassifyingModels': 'Reading and classifying models…',
    'apiSettings.status.performingLiveCheck': 'Running a live connection check…',
    'apiSettings.status.autoDetecting': 'Detecting automatically…',
    'apiSettings.error.invalidImageConfiguration': 'The image API configuration is invalid.',
    'apiSettings.error.connectionFailed': 'Connection failed.',
    'apiSettings.error.modelFetchFailed': 'Could not fetch models.',
    'apiSettings.error.keyDeleteFailed': 'Could not delete the key. Try again.',
    'apiSettings.notice.keySaveFailed':
      'The key could not be saved securely. Check browser storage permissions and try again.',
    'apiSettings.notice.fixedModelsRetained':
      'This platform uses fixed models. The administrator configuration was retained.',
    'apiSettings.notice.modelsFetched': 'Models fetched and classified.',
    'apiSettings.notice.providerNameAndAddressRequired': 'Enter a platform name and address.',
    'apiSettings.notice.localBridgeAdded': 'Local bridge platform added.',
    'apiSettings.notice.imageProviderAdded': 'Image platform added.',
    'apiSettings.notice.providerAdded': 'Platform added.',
    'apiSettings.notice.providerReset': 'Platform reset.',
    'apiSettings.notice.providerDeleted': 'Platform deleted.',
    'apiSettings.providerTitle.connected': 'Connected',
    'apiSettings.providerTitle.checkingCapabilities': 'Verifying sign-in and live capabilities',
    'apiSettings.providerTitle.fixedPendingKey':
      'Configuration is valid; the API key is verified on first use',
    'apiSettings.providerTitle.historyCannotGenerate':
      'Only a previous verification is available; generation is disabled',
    'apiSettings.providerTitle.cliUnavailable': 'Not installed, not signed in, or detection failed',
    'apiSettings.providerTitle.connectionTestFailed': 'Connection test failed',
    'apiSettings.providerTitle.missingApiKey': 'API key missing',
    'apiSettings.providerTitle.disabled': 'Disabled',
    'apiSettings.placeholder.localBridgeUrl': 'http://127.0.0.1:port',
    'apiSettings.placeholder.imageApiUrl': 'https://image-api-address',
    'apiSettings.region.mainlandChina': 'Mainland China',
    'apiSettings.region.international': 'International',
    'apiSettings.modelKindPlaceholder': 'Enter a {kind} model…',
    'apiSettings.modelKindUnavailableDescription':
      'The official API requires a dedicated request or asynchronous polling adapter. The configuration is retained, but these models are not shown in canvas generation menus yet.',
    'apiSettings.audioModelAdapterNotice':
      'Audio models are detected and saved. They enter the audio-node generation menu only after a matching provider audio adapter is implemented.',
    'apiSettings.deleteModel': 'Delete {model}',
    'apiSettings.imageModelIdPlaceholder': 'Model ID, for example gpt-image-2',
    'apiSettings.fixedModelsDescription':
      'The official service has no model catalog; administrator-defined fixed models are retained.',
    'apiSettings.dynamicModelsDescription': 'Read and classify models from upstream.',
    'apiSettings.cli.status.restoredHistoryReviewing':
      'Previous detection results were restored and are being rechecked in the background.',
    'apiSettings.cli.status.connectionChangedScanAgain':
      'The connection configuration changed. Scan the QR code again.',
    'apiSettings.cli.status.revalidatingCapabilities':
      'Revalidating the command, sign-in session, and live capabilities.',
    'apiSettings.cli.status.detectingLocalCli': 'Detecting the local CLI…',
    'apiSettings.cli.status.localCommandFound': 'A local command was detected.',
    'apiSettings.cli.status.providerNotFound': '{name} was not found.',
    'apiSettings.cli.status.bridgeNeedsRestart':
      'The current local bridge only confirms that the CLI is installed; it cannot verify sign-in, runtime state, or model availability. Restart Qiansi-Canvas and check again.',
    'apiSettings.cli.status.antigravityFallbackRejected':
      'Gemini CLI was detected instead of Antigravity CLI. This fallback is disabled; install or sign in to agy and check again.',
    'apiSettings.cli.status.historyOnlyWithMessage':
      'Only previous detection results remain; {message}',
    'apiSettings.cli.status.historyBlocksCapabilities':
      'Only the previous detection result remains. Models and execution stay disabled until a live check succeeds.',
    'apiSettings.cli.error.unverifiableCustomProtocol':
      'This custom CLI does not declare a verifiable bridge protocol and cannot be marked as connected.',
    'apiSettings.cli.error.detectionServiceStopped': 'The local detection service is not running.',
    'apiSettings.cli.error.autoDetectionFailed': 'Automatic local CLI detection failed.',
    'apiSettings.cli.error.bridgeUnavailable':
      'Could not connect to the canvas bridge at {url}. Confirm that Qiansi-Canvas is running on the host and is not blocked by the firewall, then choose “Check again.”',
    'apiSettings.cli.error.detectionTimedOut':
      'CLI sign-in detection timed out. Try again later; this does not necessarily mean that the local bridge is stopped.',
    'apiSettings.cli.workBuddyAutoModel': 'WorkBuddy automatic selection',
    'apiSettings.cli.localBridgeDescription':
      'This platform is driven by local-bridge.mjs in the project root. Run the root “打开Qiansi-Canvas.bat” launcher and keep its window open. This page will then detect installed CLI tools, versions, and sign-in status automatically; you can also choose “Check again.” Do not enter an API key here—the CLI uses the local sign-in session.',
    'apiSettings.cli.description.volcengine':
      'Detect the official Volcengine Ark CLI (arkcli) installation and sign-in status. Its canvas generation adapter is not enabled yet.',
    'apiSettings.cli.description.jimeng':
      'Install and detect the official Jimeng CLI. After signing in, official image and video models can be used directly in their nodes.',
    'apiSettings.cli.description.workBuddy':
      'Detect the official WorkBuddy CodeBuddy Code CLI. With an active session it is available to the AI assistant and text nodes; the native multimodal Hy3 model also supports image analysis.',
    'apiSettings.cli.description.antigravity':
      'Detect only the official Antigravity CLI (agy). Gemini CLI is never used as a fallback, and text models remain hidden until sign-in verification passes.',
    'apiSettings.cli.description.bailian':
      'Detect the official Alibaba Cloud Model Studio bl CLI for cloud image and video generation.',
    'apiSettings.cli.description.lightX2V':
      'Detect the local LightX2V Python environment, model directories, and generation configuration.',
    'apiSettings.cli.description.default':
      'Automatically detects the local command, version, and sign-in status when settings opens.',
    'apiSettings.cli.commandFound': 'Command found',
    'apiSettings.cli.commandNotFound': 'Command not found',
    'apiSettings.cli.localCommandFound': 'Local command found',
    'apiSettings.cli.officialInstallerAvailable': 'Use the official installer below',
    'apiSettings.cli.rootInstallerHint': 'Use the installer for your platform or view help',
    'apiSettings.cli.capability.accountTools': 'Account tools',
    'apiSettings.cli.capability.openapiIdentity': 'Ark identity',
    'apiSettings.cli.capability.volcengineIdentityDescription':
      'Verify the official sign-in state with arkcli auth status.',
    'apiSettings.cli.capability.canvasAdapter': 'Canvas adapter',
    'apiSettings.cli.capability.managementOnly': 'Not enabled yet',
    'apiSettings.cli.capability.volcengineNoGeneration':
      'No canvas models are published yet; use the Volcengine Ark API provider to generate content.',
    'apiSettings.cli.capability.bailianAccount': 'Model Studio account',
    'apiSettings.cli.capability.localRuntime': 'Local runtime',
    'apiSettings.cli.capability.textTasks': 'Text tasks',
    'apiSettings.cli.capability.unavailable': 'Unavailable',
    'apiSettings.cli.capability.accountValidatedOnUse': 'Account is verified when used',
    'apiSettings.cli.capability.workBuddyRunning': 'Session running · available',
    'apiSettings.cli.capability.openWorkBuddy': 'Open WorkBuddy first',
    'apiSettings.cli.capability.workBuddySessionRequired':
      'Keep the codebuddy session running; models are disabled when it closes',
    'apiSettings.cli.capability.loggedInAvailable': 'Signed in · available',
    'apiSettings.cli.capability.loginRequired': 'Sign-in required',
    'apiSettings.cli.capability.pythonReady': 'Python environment ready',
    'apiSettings.cli.capability.incompleteConfiguration': 'Configuration incomplete',
    'apiSettings.cli.capability.loginUnverified': 'Sign-in status not verified',
    'apiSettings.cli.capability.jimengAccountActions': 'QR sign-in, credits, and sign-out',
    'apiSettings.cli.capability.bailianManagedLogin': 'Sign-in is managed by the bl CLI',
    'apiSettings.cli.capability.lightX2VRequirements':
      'Python, packages, and paths must all pass detection',
    'apiSettings.cli.capability.textTaskDescription': 'For AI chat and text nodes',
    'apiSettings.cli.capability.imageVideoAvailable': 'Image and video generation available',
    'apiSettings.cli.capability.imageAvailable': 'Image generation available',
    'apiSettings.cli.capability.videoAvailable': 'Video generation available',
    'apiSettings.cli.capability.generationDisabled': 'Generation capabilities are disabled',
    'apiSettings.cli.capability.generationNotReady': 'Generation configuration is not ready',
    'apiSettings.cli.capability.imageDisabled': 'Image capability is disabled',
    'apiSettings.cli.capability.textOnly': 'Text only',
    'apiSettings.cli.capability.configureGenerationApi': 'Configure a generation API',
    'apiSettings.cli.capability.restoredStillValidated':
      'Previous capabilities were restored; the local bridge still validates each request',
    'apiSettings.cli.capability.modelsAppearInNodes':
      'Official CLI models appear in the corresponding node model menus',
    'apiSettings.cli.capability.loginThenDetect':
      'Sign in and check again to enable models in nodes',
    'apiSettings.cli.capability.codexImageFeatures':
      'Supports generation, outpainting, and reference-image editing',
    'apiSettings.cli.capability.upgradeCodex': 'Upgrade the Codex CLI and check again',
    'apiSettings.cli.capability.textOrAccountOnly':
      'This CLI currently supports only text or account features',
    'apiSettings.cli.login.antigravity':
      'Start Antigravity CLI, complete sign-in, and then check again.',
    'apiSettings.cli.login.completeThenDetect': 'Complete CLI sign-in, then check again.',
    'apiSettings.cli.install.jimengOfficial':
      'Choose “Install / repair CLI” to use the official installer from jimeng.jianying.com.',
    'apiSettings.cli.install.rootBatchHint':
      'On Windows, run tools/launchers/安装CLI工具-Windows.bat; on macOS, run tools/launchers/安装CLI工具-macOS.command, or open the corresponding setup help.',
    'apiSettings.cli.bridgeToken': 'Bridge token (optional)',
    'apiSettings.cli.models.generationModelsAvailable':
      'The live connection passed. These official models are available in image and video nodes.',
    'apiSettings.cli.models.workBuddyModelsLoaded':
      '{count} models supported by the current WorkBuddy CLI version were loaded, including native multimodal Hy3 image analysis.',
    'apiSettings.cli.models.workBuddyClosed':
      'There is no active WorkBuddy session. Models are hidden; open WorkBuddy and check again.',
    'apiSettings.cli.models.antigravityUnavailable':
      'Antigravity has not passed agy sign-in verification. Models are hidden; sign in and check again.',
    'apiSettings.cli.models.codexReasoningAvailable':
      'The live connection passed. Reasoning effort can be set for Codex models.',
    'apiSettings.cli.models.textModelsLoaded': 'Available text models were loaded from the CLI.',
    'apiSettings.cli.models.volcengineIdentityReady':
      'The official Ark CLI is installed and authenticated; its canvas generation adapter is not enabled yet.',
    'apiSettings.cli.models.volcengineManagementOnly':
      'The official Ark CLI installer and status checks are available, but it currently provides no canvas generation models.',
    'apiSettings.cli.models.cachedOnly':
      'These are presets or cached models only and do not appear in node model menus until the connection succeeds.',
    'apiSettings.cli.models.unsupportedKind':
      'This CLI does not support this type of generation task. Choose another available platform.',
    'apiSettings.cli.models.noneAfterLogin':
      'No available models were detected. Complete sign-in, then choose “Fetch models.”',
    'apiSettings.cli.models.noneConfigured':
      'No models yet. Add one manually or choose “Fetch models.”',
    'apiSettings.cli.jimeng.startingInstaller': 'Starting the official Jimeng installer…',
    'apiSettings.cli.jimeng.installerStartFailed': 'Could not start the Jimeng CLI installer.',
    'apiSettings.cli.jimeng.detected': 'Jimeng CLI detected.',
    'apiSettings.cli.jimeng.installStatusFailed':
      'Could not read the Jimeng CLI installation status.',
    'apiSettings.cli.jimeng.installComplete': 'Jimeng CLI installation complete.',
    'apiSettings.cli.jimeng.installEndedNotDetected':
      'The installer exited, but dreamina CLI was not detected.',
    'apiSettings.cli.jimeng.installTimedOut':
      'Waiting for the installer timed out. It may still be running; choose “Check again” later.',
    'apiSettings.cli.jimeng.installFailed': 'Jimeng CLI installation failed.',
    'apiSettings.cli.jimeng.bridgeUnavailableForInstall':
      'Could not connect to the local bridge. Restart the canvas with the root “打开Qiansi-Canvas.bat” launcher, then try the installation again.',
    'apiSettings.cli.jimeng.startingQrLogin': 'Starting QR-code sign-in…',
    'apiSettings.cli.jimeng.qrLoginStartFailed': 'Could not start QR-code sign-in.',
    'apiSettings.cli.jimeng.loginStatusFailed': 'Could not read the Jimeng sign-in status.',
    'apiSettings.cli.jimeng.loggedIn': 'Jimeng CLI is signed in.',
    'apiSettings.cli.jimeng.qrLoginSucceeded': 'QR code accepted; signed in.',
    'apiSettings.cli.jimeng.loginSucceeded': 'Jimeng sign-in successful.',
    'apiSettings.cli.jimeng.loginIncomplete':
      'Sign-in was not completed. Open the QR-code sign-in page again.',
    'apiSettings.cli.jimeng.qrTimedOut': 'The QR code expired. Scan a new one.',
    'apiSettings.cli.jimeng.queryingCredits': 'Checking credits…',
    'apiSettings.cli.jimeng.creditQueryFailed': 'Could not retrieve credits.',
    'apiSettings.cli.jimeng.creditQuerySucceeded': 'Credits retrieved.',
    'apiSettings.cli.jimeng.loggedOut': 'Jimeng CLI is signed out.',
    'apiSettings.cli.jimeng.signOutSucceeded': 'Signed out.',
    'apiSettings.cli.jimeng.installBeforeLogin': 'Install and detect Jimeng CLI first',
    'apiSettings.cli.jimeng.installingTitle': 'Installing Jimeng CLI',
    'apiSettings.cli.jimeng.installResultTitle': 'Jimeng CLI installation result',
    'apiSettings.cli.jimeng.waitingInstallerOutput': 'Waiting for official installer output…',
    'apiSettings.cli.jimeng.qrCodeAlt': 'Jimeng QR-code sign-in',
    'apiSettings.cli.jimeng.openQrPage': 'Open the Jimeng QR-code sign-in page',
    'apiSettings.cli.jimeng.authorizationCode': 'Authorization code',
    'apiSettings.cli.jimeng.completeAuthorization':
      'Scan the code and complete authorization on the official page',
    'apiSettings.cli.jimeng.privacyNotice':
      'Qiansi-Canvas only displays the official authorization URL and status returned by the local CLI. It never reads the account password.',
    'apiSettings.cli.jimeng.waitingCompatibleOutput': 'Waiting for compatible command output…',
    'apiSettings.cli.lightX2V.title': 'Local inference configuration',
    'apiSettings.cli.lightX2V.description':
      'Paths are stored only in this browser and passed as an argument array to the fixed LightX2V adapter.',
    'apiSettings.cli.lightX2V.pythonExecutable': 'Python executable',
    'apiSettings.cli.lightX2V.pythonExecutablePlaceholder':
      'For example C:\\miniconda3\\envs\\lightx2v\\python.exe',
    'apiSettings.cli.lightX2V.workingDirectory': 'LightX2V working directory',
    'apiSettings.cli.lightX2V.workingDirectoryPlaceholder': 'For example D:\\AI\\LightX2V',
    'apiSettings.cli.lightX2V.imageModelPath': 'Image model directory',
    'apiSettings.cli.lightX2V.imageModelPathPlaceholder': 'Qwen-Image or another model directory',
    'apiSettings.cli.lightX2V.imageModelClass': 'Image model type',
    'apiSettings.cli.lightX2V.imageModelClassPlaceholder': 'For example qwen-image-2512',
    'apiSettings.cli.lightX2V.imageTask': 'Image task type',
    'apiSettings.cli.lightX2V.imageTaskPlaceholder': 't2i or i2i',
    'apiSettings.cli.lightX2V.imageConfigPath': 'Image config_json',
    'apiSettings.cli.lightX2V.imageConfigPathPlaceholder':
      'Official image-generation JSON configuration file',
    'apiSettings.cli.lightX2V.videoModelPath': 'Video model directory',
    'apiSettings.cli.lightX2V.videoModelPathPlaceholder':
      'Wan, HunyuanVideo, or another model directory',
    'apiSettings.cli.lightX2V.videoModelClass': 'Video model type',
    'apiSettings.cli.lightX2V.videoModelClassPlaceholder': 'Default: wan2.2_moe',
    'apiSettings.cli.lightX2V.videoTask': 'Video task type',
    'apiSettings.cli.lightX2V.videoTaskPlaceholder': 't2v or i2v',
    'apiSettings.cli.lightX2V.videoConfigPath': 'Video config_json',
    'apiSettings.cli.lightX2V.videoConfigPathPlaceholder':
      'Official video-generation JSON configuration file',
    'apiSettings.comfy.status.connectedWithWorkflows':
      'ComfyUI is connected. {count} image or video workflows were loaded.',
    'apiSettings.comfy.status.connectedNeedsWorkflow':
      'ComfyUI is connected. Import a ComfyUI image or video workflow JSON.',
    'apiSettings.comfy.error.localUnavailable':
      'The canvas bridge is running but could not connect to local ComfyUI.',
    'apiSettings.comfy.error.remoteUnavailable':
      'The canvas bridge is running but could not connect to remote ComfyUI.',
    'apiSettings.comfy.addRemoteConnection': 'Add remote ComfyUI',
    'apiSettings.comfy.notice.remoteConnectionAdded': 'Added remote ComfyUI: {name}',
    'apiSettings.comfy.remoteHttpsNotice':
      'Only public HTTPS addresses are accepted. Enter the API root without /prompt, query parameters, or a #workflow fragment.',
    'apiSettings.comfy.remoteAddressPending': 'the remote address you enter',
    'apiSettings.comfy.remoteStartHint':
      'Enter the remote ComfyUI HTTPS address and optional key, then test the connection.',
    'apiSettings.comfy.error.workflowTooLarge': 'The workflow JSON must not exceed 5 MB.',
    'apiSettings.comfy.error.importFailed': 'Could not import the workflow.',
    'apiSettings.comfy.error.copyDenied':
      'The browser did not allow copying. Use “Download PowerShell” instead.',
    'apiSettings.comfy.error.deleteFailed': 'Could not delete the workflow.',
    'apiSettings.comfy.defaultWorkflowName': 'ComfyUI workflow',
    'apiSettings.comfy.notice.workflowSaved':
      'Saved “{name}”; detected {nodeCount} node classes and {modelCount} model references.',
    'apiSettings.comfy.notice.workflowConverted':
      'Converted the regular ComfyUI workflow to API Format and saved “{name}”; detected {nodeCount} node classes and {modelCount} model references.',
    'apiSettings.comfy.notice.scriptCopied': 'The PowerShell installation script was copied.',
    'apiSettings.comfy.notice.scriptDownloaded':
      'The PowerShell installation script was downloaded. Review it and confirm that the workflow source is trusted before running it.',
    'apiSettings.comfy.notice.workflowDeleted': 'Deleted “{name}”.',
    'apiSettings.comfy.bridgeRouting':
      'The browser connects only to the canvas bridge at {bridgeUrl}, which forwards requests to {providerUrl}.',
    'apiSettings.comfy.startServicesHint':
      'Start ComfyUI and the Qiansi-Canvas local bridge, then test the connection.',
    'apiSettings.comfy.workflowStorageDescription':
      'The workflow is stored in the local bridge and is passed to image or video generation tasks according to its output type.',
    'apiSettings.comfy.trustedWorkflowHint':
      'API Format and regular nodes/links workflows are supported; regular workflows are converted locally. The output node must save an image or create an MP4, WebM, or MOV video.',
    'apiSettings.comfy.dependencySummary':
      '{nodeCount} node classes · {modelCount} model references · {downloadCount} with verified download URLs',
    'apiSettings.comfy.nodeClasses': 'Node classes (mapped to modules by the official comfy CLI)',
    'apiSettings.comfy.modelFiles': 'Model files',
    'apiSettings.comfy.scriptCanDownload': 'Script can download',
    'apiSettings.comfy.manualSourceRequired': 'Source must be provided manually',
    'apiSettings.comfy.noModelFilesDetected':
      'No model file names were detected in common model input fields.',
    'apiSettings.comfy.workflowJson': 'Infinite Canvas node JSON',
    'apiSettings.comfy.workflowJsonDescription':
      'Import this file from the canvas header to create an image or video node bound to the current ComfyUI workflow model.',
    'apiSettings.comfy.downloadWorkflowJson': 'Download canvas JSON',
    'apiSettings.comfy.downloadApiWorkflowJson': 'Download API JSON',
    'apiSettings.comfy.workflowJsonTruncated':
      'Preview truncated; the downloaded file contains the complete JSON.',
    'apiSettings.comfy.installScriptSafety':
      'The script uses the official comfy node install-deps --workflow command. A model is downloaded automatically only when the JSON also provides a trusted HTTP(S) URL; the script never guesses a source from a file name. Run the script in PowerShell. If comfy CLI did not remember the workspace, append -Workspace “D:\\ComfyUI”.',
    'apiSettings.comfy.workflowCount': '{count}',
    'apiSettings.comfy.deleteWorkflow': 'Delete {name}',
    'apiSettings.comfy.emptyWorkflows':
      'No workflows have been imported. After connecting, import a ComfyUI JSON workflow so the matching image or video node can show ComfyUI models.',
  },
};
