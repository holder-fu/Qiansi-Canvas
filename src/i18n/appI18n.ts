import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  useCanvasPreferences,
  setRegisteredImportedLanguages,
  type AppLanguage,
  type BuiltInAppLanguage,
} from '../store/canvasPreferences';
import { DOMAIN_LANGUAGE_PACKS } from './domainPacks';

/**
 * Shared UI copy for the application shell. Feature modules pass their
 * canonical Chinese copy as a final safety fallback. Non-Chinese locales use
 * the English pack when a native domain translation is still in progress, so
 * switching languages never produces blank or untranslated protocol values.
 */
type LanguagePack = Record<string, string>;
export type TranslationParams = Record<string, string | number>;

function interpolate(message: string, params?: TranslationParams): string {
  if (!params) return message;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

const zhCN: LanguagePack = {
  'settings.title': 'Qiansi-Canvas 设置',
  'settings.close': '关闭设置',
  'settings.search': '搜索设置…',
  'settings.navigation': '设置分类',
  'settings.empty': '没有匹配的设置',
  'settings.locked': '已锁定',
  'settings.accountComingSoon': '画布账号暂未开放',
  'settings.group.basic': '基础',
  'settings.group.ai': 'AI 与生成',
  'settings.group.extensions': '扩展',
  'settings.group.data': '画布与数据',
  'settings.group.system': '系统',
  'settings.general': '常规',
  'settings.language': '语言',
  'settings.canvas': '画布与交互',
  'settings.appearance': '外观',
  'settings.shortcuts': '快捷键',
  'settings.sound': '声音与通知',
  'settings.models': 'AI 模型',
  'settings.comfyui': 'ComfyUI',
  'settings.generation': '生成默认值',
  'settings.localTools': '本地工具',
  'settings.plugins': '插件',
  'settings.canvasSave': '画布与自动保存',
  'settings.storage': '存储与清理',
  'settings.canvasAccount': '画布账号',
  'settings.diagnostics': '运行与诊断',
  'settings.systemUpdate': '系统更新',
  'settings.about': '关于',
  'general.title': '常规',
  'general.description': '管理无限画布的基础行为和当前默认工作方式。',
  'general.profile': '资料作者',
  'general.userName': '用户名',
  'general.userNameDescription':
    '之后新建的风格、特效、角色和提示词会显示这个作者名；已有资料和导入资料的原作者不会被覆盖。',
  'general.userNamePlaceholder': '输入显示名称',
  'general.startup': '启动',
  'general.startupTarget': '启动目标',
  'general.startupTargetDescription':
    '下次打开 Qiansi-Canvas 时进入工作台首页，或恢复关闭前所在的位置。',
  'general.lastSession': '上次位置',
  'general.home': '工作台首页',
  'general.deleteBehavior': '删除行为',
  'general.confirmMoveToTrash': '移到回收站前确认',
  'general.confirmMoveToTrashDescription':
    '开启时会先显示确认提示；关闭后节点会直接进入当前画布回收站。',
  'general.requestCapacity': '请求与并发容量',
  'general.requestRateLimit': 'Bridge 每分钟请求额度',
  'general.requestRateLimitDescription':
    '同一客户端 60 秒内可访问 Bridge API 与受管媒体的总次数；刷新素材较多的画布也会计入。',
  'general.generationConcurrency': '全局生成并发',
  'general.generationConcurrencyDescription':
    '图片、视频、音频和文本生成共享的 Bridge 上限；提高后会增加供应商请求、费用和本机负载。',
  'general.uploadConcurrency': '上传并发',
  'general.uploadConcurrencyDescription': '素材库、预览和生成前参考素材可同时上传的任务数。',
  'general.updateConcurrency': '更新并发',
  'general.updateConcurrencyDescription': '系统更新检查、下载或回滚可同时占用的任务数。',
  'general.batchGeneration': '批量生成',
  'general.imageBatchSize': '图片单批节点数',
  'general.imageBatchSizeDescription':
    '批量生成图片时，本批最多处理的已选图片生成节点；菜单会显示实际进入本批的数量。',
  'general.imageGenerationConcurrency': '图片生成并发',
  'general.imageGenerationConcurrencyDescription':
    '一批图片中可同时执行的节点数；实际不会超过上面的全局生成并发。',
  'general.videoGenerationConcurrency': '视频生成并发',
  'general.videoGenerationConcurrencyDescription':
    '批量视频中可同时执行的节点数；更多视频会排队，且实际不会超过全局生成并发。',
  'general.perMinute': '次/分钟',
  'general.jobs': '个任务',
  'general.nodes': '个节点',
  'general.generationLimitsNotice':
    '数值会在离开输入框时保存并立即应用；供应商、本机 GPU 或 ComfyUI 仍可能使用更低的并发或排队限制。',
  'general.generationLimitsSaved': '设置已保存到本机 Bridge，并立即生效。',
  'general.generationLimitsSaveFailed':
    'Bridge 暂时不可用；当前浏览器已保留这些值，重新连接后请再次确认。',
  'language.title': '语言',
  'language.description': '选择 Qiansi-Canvas 的界面语言与本地化格式。',
  'language.interface': '界面语言',
  'language.notice':
    '语言会立即保存到本机，并同步浏览器语言标记，供日期、数字等本地化格式和界面语言包读取。尚未完成本地化的第三方内容会安全回退到英文或原始文案，绝不会显示为空白。',
  'language.current': '当前语言：',
  'language.pluginProvidedBy': '语言插件 · {name}',
  'language.importTitle': '导入语言包',
  'language.importDescription':
    '导入完整 JSON 语言包后，所有画布、设置、节点、弹窗和资料库界面都会使用该语言。',
  'language.importButton': '选择语言包 JSON',
  'language.importSuccess': '已导入并切换到 {locale}。',
  'language.importFailed': '语言包导入失败。',
  'language.importInvalidMetadata': '语言包缺少有效的语言代码。',
  'language.importDuplicate': '该语言已存在或与内置语言重复。',
  'language.locale.zh-CN': '中国大陆',
  'language.locale.en-US': '英语（美国）',
  'toolbar.styleLibrary': '风格库',
  'toolbar.effectsLibrary': '特效库',
  'toolbar.characterLibrary': '角色库',
  'toolbar.promptLibrary': '提示词',
  'canvas.assets': '资产管理',
  'canvas.snap': '切换节点对齐吸附',
  'canvas.snapOn': '节点对齐吸附已开启',
  'canvas.snapOff': '节点对齐吸附已关闭',
  'canvas.hideEdges': '隐藏节点连线',
  'canvas.showEdges': '显示节点连线',
  'canvas.search': '搜索',
  'canvas.searchNodes': '搜索节点',
  'canvas.layers': '图层',
  'canvas.layerManagement': '图层管理',
  'canvas.fullscreen': '全屏',
  'canvas.exitFullscreen': '退出全屏',
  'canvas.zoomOut': '缩小',
  'canvas.zoomIn': '放大',
  'canvas.zoomMenu': '画布缩放菜单',
  'canvas.fitView': '适应画布',
  'canvas.resetView': '重置视图',
  'canvas.shortcuts': '快捷键',
  'canvas.trash': '回收站',
  'node.video.untitled': '未命名视频',
  'node.video.upload': '上传视频',
  'node.video.edit': '剪辑',
  'node.video.remake': '片段重拍',
  'node.video.crop': '裁剪',
  'node.video.animatedImage': '转动态图',
  'node.video.enhance': '高清',
  'node.video.extend': '智能续写',
  'node.video.subtitles': '智能去字幕',
  'node.video.audio': '音频分离',
  'node.video.visualEdit': '画面编辑',
  'node.video.aiVisualEdit': 'AI 画面编辑',
  'node.video.fullAudio': '提取完整原声音轨',
  'node.video.voiceSeparation': '人声 / 伴奏分轨',
  'node.video.firstFrame': '截取首帧',
  'node.video.currentFrame': '截取当前帧',
  'node.video.lastFrame': '截取尾帧',
  'node.video.download': '下载视频',
  'node.video.fullscreen': '放大预览',
  'composer.reference': '参考',
  'composer.references': '参考图',
  'composer.reference.locked': '导演参考顺序已锁定',
  'composer.reference.reorderable': '可拖动排序',
  'composer.cancelReference': '取消参考',
  'composer.mark': '标记',
  'composer.cancelMark': '取消标记',
  'composer.effects': '特效',
  'composer.assets': '资产库',
  'asset.globalLibraryTitle': '全局资产库',
  'asset.scope.all': '全部素材',
  'composer.camera': '运镜',
  'pluginHost.recentProjectImagePicker.title': '从最近项目选择图片',
  'pluginHost.recentProjectImagePicker.source': '只读取最近使用的第一个项目：{name}',
  'pluginHost.recentProjectImagePicker.hint': '只读取首页最近使用列表中的第一个项目',
  'pluginHost.recentProjectImagePicker.loading': '正在读取最近项目图片…',
  'pluginHost.recentProjectImagePicker.noProject': '还没有可读取的最近项目',
  'pluginHost.recentProjectImagePicker.noImages': '最近项目中没有可用的真实图片',
  'header.home': '回到主页',
  'header.allProjects': '所有项目',
  'header.currentProject': '当前项目',
  'header.unnamedProject': '未命名项目',
  'header.import': '导入',
  'header.export': '导出',
  'header.undo': '撤销',
  'header.redo': '重做',
  'header.group': '分组',
  'header.groupSelected': '将选中节点分组',
  'header.persistenceError': '画布自动保存失败；请立即导出画布或检查本机 Bridge 与磁盘空间。',
  'header.exportConflictCopy': '导出冲突副本',
  'header.backupAndReloadHost': '备份并载入主机版本',
  'header.reloadingHost': '正在载入…',
  'header.retryPersistence': '重试保存',
  'header.retryingPersistence': '正在重试…',
  'header.dismissPersistence': '关闭画布保存提示',
  'header.lanConflict':
    '检测到本地未保存修改与主机画布内容不同；已停止自动覆盖，请重新载入或先导出双方副本。',
  'header.lanRemoteConflict':
    '主画布已由其他窗口或局域网终端更新；当前未保存修改没有覆盖主机数据。请重新载入或先导出双方副本。',
  'header.exportLanConflictCopy': '导出双方副本',
  'header.dismissLanConflict': '关闭局域网冲突提示',
  'header.homeTitle': 'Qiansi-Canvas AI 创作工作台',
  'home.eyebrow': 'AI 动漫与影视创作工作台',
  'home.title': '千丝无限画布',
  'home.subtitle': '让创意、素材与 AI 工作流自然连接',
  'home.description':
    '从故事脚本、角色设定到图片与视频生成，在同一张无限画布中完成创作、整理和迭代。',
  'home.continueCanvas': '进入画布',
  'home.currentCanvas': '当前画布',
  'home.autosave': '自动保存',
  'home.selectWorkflow': '选择创作流程',
  'home.workflowHint': '进入后仍可自由添加、删除和连接所有节点',
  'home.commonWorkspaces': '4 个常用工作区',
  'home.openWorkspace': '打开工作区',
  'home.recentProjects': '最近使用的画布',
  'home.recentProjectsHint': '快速进入最近使用的 4 个画布',
  'home.viewAllProjects': '查看全部项目',
  'home.openRecentProject': '打开项目“{name}”',
  'home.openingProject': '正在打开…',
  'home.noRecentProjects': '暂无可打开的项目',
  'home.recentProjectsLoadFailed': '最近项目读取失败。',
  'home.recentProjectOpenFailed': '项目未能安全打开，请前往“所有项目”检查。',
  'home.resources': '创作资源',
  'home.openFromCanvas': '从当前画布打开',
  'home.shortcuts': '快捷键',
  'home.help': '帮助',
  'home.availablePlugins': '可用插件',
  'home.availablePluginCount': '{count} 个可用插件',
  'home.openPlugin': '打开 {name}',
  'home.pluginEnabled': '{name} 已启用',
  'home.morePlugins': '更多',
  'home.morePluginsCount': '还有 {count} 个插件',
  'home.morePluginsMenu': '更多可用插件',
  'home.creatorLinks': '个人主页',
  'home.creator.github': 'GitHub 主页',
  'home.creator.youtube': 'YouTube 视频主页',
  'home.creator.bilibili': '哔哩哔哩视频主页',
  'home.creator.douyin': '抖音视频主页',
  'home.license': 'GPL-3.0-or-later',
  'home.newProject': '新建项目',
  'home.navigationLabel': '首页导航',
  'home.nav.home': '首页',
  'home.nav.projects': '项目',
  'home.new': '新建',
  'home.workflowLaunchFailed':
    '新项目未能完整创建并保存，已保留原项目，请重试或前往“所有项目”检查。',
  'home.creatingProject': '正在创建项目…',
  'home.canvasLoading': '项目加载中…',
  'home.library.prompt': '提示词库',
  'home.library.promptDescription': '查找并复用创作提示词',
  'home.library.style': '风格库',
  'home.library.styleDescription': '选择可复用的视觉风格',
  'home.library.effects': '特效库',
  'home.library.effectsDescription': '浏览动态 WebP 画面特效',
  'home.library.character': '角色库',
  'home.library.characterDescription': '管理角色与人物参考',
  'projects.title': '全部项目',
  'projects.description': '管理本机 Bridge 中保存的创作项目',
  'projects.refresh': '刷新项目列表',
  'projects.newProject': '新建项目',
  'projects.allCount': '全部 {count}',
  'projects.uncategorized': '未分类',
  'projects.deleteFolderLabel': '删除文件夹“{name}”',
  'projects.newFolder': '新建文件夹',
  'projects.loading': '正在读取项目…',
  'projects.reload': '重新加载',
  'projects.empty.all': '还没有项目',
  'projects.empty.folder': '这个文件夹暂无项目',
  'projects.empty.allDescription': '创建一个空白项目，开始整理角色、分镜、视频和声音。',
  'projects.empty.folderDescription': '可以从项目卡片菜单把项目移动到这里。',
  'projects.createFirst': '创建第一个项目',
  'projects.dialog.new.title': '新建项目',
  'projects.dialog.new.description': '项目会保存到本机 Bridge，并使用独立的画布修订。',
  'projects.dialog.projectNamePlaceholder': '输入项目名称',
  'projects.dialog.createAndOpen': '创建并打开',
  'projects.dialog.rename.title': '重命名项目',
  'projects.dialog.save': '保存',
  'projects.dialog.folder.title': '新建文件夹',
  'projects.dialog.folderNamePlaceholder': '输入文件夹名称',
  'projects.dialog.create': '创建',
  'projects.dialog.deleteProject.title': '删除“{name}”？',
  'projects.dialog.deleteProject.description':
    '项目将移入可恢复的主机归档，不会立即删除素材库原文件。',
  'projects.dialog.deleteProject.confirm': '删除项目',
  'projects.dialog.deleteFolder.title': '删除文件夹“{name}”？',
  'projects.dialog.deleteFolder.description': '文件夹中的项目不会被删除，而是移动到“未分类”。',
  'projects.dialog.deleteFolder.confirm': '删除文件夹',
  'projects.card.openLabel': '打开项目“{name}”',
  'projects.menu.openLabel': '打开“{name}”项目菜单',
  'projects.menu.actionsLabel': '{name} 项目操作',
  'projects.menu.open': '打开',
  'projects.menu.rename': '重命名',
  'projects.menu.cover': '修改封面',
  'projects.menu.duplicate': '创建副本',
  'projects.menu.move': '移动至文件夹',
  'projects.menu.folderLabel': '选择目标文件夹',
  'projects.menu.uncategorized': '未分类',
  'projects.menu.delete': '删除项目',
  'projects.menu.defaultCannotDelete': '默认项目不可删除',
  'projects.error.catalog': '项目目录读取失败。',
  'projects.error.operation': '项目操作失败。',
  'projects.error.open': '项目未能安全打开，请检查主机存储后重试。',
  'projects.error.coverType': '项目封面必须是图片文件。',
  'projects.error.activeSave': '当前项目尚未安全保存，已取消删除。',
  'projects.error.fallbackOpen': '项目已删除，但默认项目读取失败；请刷新项目列表后重试。',
  'workspace.script.title': '故事脚本生成',
  'workspace.script.tagline': '输入一句话，自动生成故事脚本与分镜',
  'workspace.views.title': '角色三视图',
  'workspace.views.tagline': '上传角色参考，一键生成正视 / 侧视 / 背视三视图',
  'workspace.video.title': '首帧图生视频',
  'workspace.video.tagline': '上传首帧图片，延展为完整视频',
  'workspace.audio.title': '音频生视频',
  'workspace.audio.tagline': '导入音频，驱动画面生成对口型或节奏视频',
  'common.back': '返回',
  'common.open': '打开',
  'common.close': '关闭',
  'common.cancel': '取消',
  'common.retry': '重试',
  'common.confirm': '确认',
  'common.edit': '编辑',
  'common.delete': '删除',
  'common.default': '默认',
  'common.paste': '粘贴',
  'common.play': '播放',
  'common.pause': '暂停',
  'common.saveFailedRetry': '保存失败，请重试',
  'context.effectReferenceRestricted': '特效节点仅支持复制节点和移到回收站',
  'context.effectVideoOnly': '特效只能连接到视频节点',
  'toolbarDrag.dropPrimary': '松手放到常用栏',
  'toolbarDrag.dropOverflow': '松手收纳到更多工具',
  'toolbarDrag.chooseTarget': '拖到蓝色标记处',
  'node.kind.text': '文本',
  'node.kind.image': '图片',
  'node.kind.imageCompare': '图片对比',
  'node.kind.video': '视频',
  'node.kind.audio': '音频',
  'node.kind.script': '脚本',
  'node.kind.frontFrame': '首帧图',
  'assets.category.character': '人物',
  'assets.category.scene': '场景',
  'assets.category.storyboard': '分镜',
  'assets.category.item': '物品',
  'assets.category.video': '视频',
  'assets.category.audio': '音频',
  'library.target.style': '风格库',
  'library.target.effect': '特效库',
  'library.target.character': '角色库',
  'library.target.prompt': '提示词库',
  'media.persist.saving': '正在把媒体保存到本机素材库…',
  'media.persist.saved': '媒体已保存到本机素材库。',
  'media.persist.sessionOnlyWithError': '媒体仅在当前会话可用：{message}',
  'media.persist.sessionOnly': '媒体仅在当前会话可用，本机素材保存失败。',
  'context.group.colorAria': '选择分组背景颜色',
  'context.menuAria': '画布操作菜单',
  'context.assetCategory': '选择资产分类',
  'context.saveTo': '另存到',
  'context.libraryCategory': '{library} · 选择分类',
  'context.librarySaving': '正在保存图片、视频与文字…',
  'context.selectedNodes': '已选择 {count} 个节点',
  'context.createGroup': '创建分组',
  'context.arrangeGrid': '网格排列',
  'context.arrangeGridTitle': '网格排列',
  'context.arrangeGridAuto': '自动排列',
  'context.arrangeGridColumns': '{count} 列',
  'context.arrangeGridUnavailable': '所选节点需要位于同一画布层级才能排列',
  'context.independentTextNode': '独立文本节点',
  'context.independentImageNode': '独立图片节点',
  'context.createImageComparison': '图片对比',
  'context.imageComparisonUnavailable': '请选择两个包含真实图片的节点',
  'context.independentTextUnavailable': '部分所选节点不能连接到文本节点，未执行批量创建',
  'context.independentImageUnavailable': '部分所选节点不能连接到图片节点，未执行批量创建',
  'context.contentBatchGenerate': '内容批量生成',
  'context.contentBatchUnavailable': '所选节点没有可执行的默认生成操作',
  'context.contentBatchRunning': '所选内容节点正在生成中',
  'imageCompare.image1': '图1',
  'imageCompare.image2': '图2',
  'imageCompare.connectImage1': '连接图1',
  'imageCompare.connectImage2': '连接图2',
  'imageCompare.connectSecondHint': '再连接一张图片即可开始拖动对比',
  'imageCompare.aspectRatioAligned': '比例不同 · 已居中裁切对齐',
  'imageCompare.slider': '图片对比分隔线',
  'imageCompare.trash': '将图片对比节点移到回收站',
  'context.batchGenerateImage': '批量生成图片',
  'context.batchGenerateVideo': '批量生成视频',
  'context.nodeCount': '{count} 个节点',
  'context.noBatchTasksHint': '所选节点没有可批量执行的图片或视频生成任务',
  'context.noBatchTasks': '没有可批量生成的图片或视频节点',
  'context.connectionActions': '连线操作',
  'context.deleteConnection': '删除连线',
  'context.groupActions': '分组操作',
  'context.renameGroup': '重命名分组',
  'context.changeGroupColor': '修改背景颜色',
  'context.fitGroup': '收紧分组边框',
  'context.ungroup': '拆解分组（保留节点）',
  'context.trashGroup': '将分组移到回收站',
  'context.duplicateNode': '复制节点',
  'context.noSavableMedia': '当前节点没有可保存的媒体内容',
  'context.saveAsAsset': '保存为资产',
  'context.fullscreenPreview': '全屏预览',
  'context.copyImage': '复制图片',
  'context.copyingImage': '正在复制图片…',
  'context.noCopyableImage': '当前节点没有可复制的图片',
  'context.copyImageFailed': '复制图片失败，请检查浏览器剪贴板权限或图片来源。',
  'context.noEditableImage': '当前节点没有可编辑的图片',
  'context.noStyleImage': '当前节点没有可应用风格的图片',
  'context.applyStyle': '应用风格',
  'context.saveToLibrary': '保存到素材库',
  'context.subjectCreated': '已创建主体',
  'context.createSubject': '创建主体',
  'context.regenerateWithModel': '{model} 重新生成',
  'context.selectVideoModel': '请先选择视频模型',
  'context.moveToTrash': '移到回收站',
  'context.openDirector': '打开导演台',
  'context.createDirector': '新建导演台',
  'context.addDirector': '添加导演台',
  'context.director': '导演台',
  'context.directorHint': '站位与人数约束',
  'context.selectPlugin': '选择插件',
  'context.pluginActions': '插件功能',
  'context.addNode': '添加节点',
  'context.library': '素材库',
  'context.addResources': '添加资源',
  'context.uploadLocalFile': '上传本地文件',
  'context.generationHistory': '从生成历史选择',
  'context.noCanvasAssetHint': '空白处没有可保存的内容，请在包含媒体的节点上右键',
  'context.saveToAssets': '保存到我的资产',
  'director.2d': '2D导演台',
  'director.2d.description': '平面构图与分镜',
  'director.2d.connectionDescription': '分镜图片约束',
  'director.3d': '3D导演台',
  'director.3d.description': '角色、机位与运动轨迹',
  'director.3d.connectionDescription': '角色与机位预演',
};

const enUS: LanguagePack = {
  'settings.title': 'Qiansi-Canvas Settings',
  'settings.close': 'Close settings',
  'settings.search': 'Search settings…',
  'settings.navigation': 'Settings categories',
  'settings.empty': 'No matching settings',
  'settings.locked': 'Locked',
  'settings.accountComingSoon': 'Canvas account is not available yet',
  'settings.group.basic': 'Basics',
  'settings.group.ai': 'AI & generation',
  'settings.group.extensions': 'Extensions',
  'settings.group.data': 'Canvas & data',
  'settings.group.system': 'System',
  'settings.general': 'General',
  'settings.language': 'Language',
  'settings.canvas': 'Canvas & interaction',
  'settings.appearance': 'Appearance',
  'settings.shortcuts': 'Keyboard shortcuts',
  'settings.sound': 'Sound & notifications',
  'settings.models': 'AI models',
  'settings.comfyui': 'ComfyUI',
  'settings.generation': 'Generation defaults',
  'settings.localTools': 'Local tools',
  'settings.plugins': 'Plugins',
  'settings.canvasSave': 'Canvas & autosave',
  'settings.storage': 'Storage & cleanup',
  'settings.canvasAccount': 'Canvas account',
  'settings.diagnostics': 'Runtime & diagnostics',
  'settings.systemUpdate': 'System update',
  'settings.about': 'About',
  'general.title': 'General',
  'general.description': 'Manage fundamental canvas behavior and your current defaults.',
  'general.profile': 'Library author',
  'general.userName': 'User name',
  'general.userNameDescription':
    'New styles, effects, characters, and prompts will show this author name. Existing and imported author credits are preserved.',
  'general.userNamePlaceholder': 'Enter a display name',
  'general.startup': 'Startup',
  'general.startupTarget': 'Startup destination',
  'general.startupTargetDescription':
    'When Qiansi-Canvas opens, go to the workbench home or restore where you left off.',
  'general.lastSession': 'Last location',
  'general.home': 'Workbench home',
  'general.deleteBehavior': 'Deletion behavior',
  'general.confirmMoveToTrash': 'Confirm before moving to trash',
  'general.confirmMoveToTrashDescription':
    'When enabled, a confirmation appears first. When disabled, nodes move directly to the current canvas trash.',
  'general.requestCapacity': 'Request and concurrency capacity',
  'general.requestRateLimit': 'Bridge requests per minute',
  'general.requestRateLimitDescription':
    'Total Bridge API and managed-media requests allowed for one client in 60 seconds. Refreshing a media-rich canvas also counts.',
  'general.generationConcurrency': 'Global generation concurrency',
  'general.generationConcurrencyDescription':
    'Shared Bridge limit for image, video, audio, and text generation. Higher values increase provider traffic, cost, and local load.',
  'general.uploadConcurrency': 'Upload concurrency',
  'general.uploadConcurrencyDescription':
    'Number of Asset Library, preview, and pre-generation reference uploads that may run together.',
  'general.updateConcurrency': 'Update concurrency',
  'general.updateConcurrencyDescription':
    'Number of system update checks, downloads, or rollbacks that may run together.',
  'general.batchGeneration': 'Batch generation',
  'general.imageBatchSize': 'Image nodes per batch',
  'general.imageBatchSizeDescription':
    'Maximum selected image-generation nodes handled in this batch. The menu shows how many will enter the batch.',
  'general.imageGenerationConcurrency': 'Image generation concurrency',
  'general.imageGenerationConcurrencyDescription':
    'Image nodes that may run together in one batch. The global generation limit above still applies.',
  'general.videoGenerationConcurrency': 'Video generation concurrency',
  'general.videoGenerationConcurrencyDescription':
    'Video nodes that may run together. Additional videos queue, and the global generation limit still applies.',
  'general.perMinute': '/ minute',
  'general.jobs': 'jobs',
  'general.nodes': 'nodes',
  'general.generationLimitsNotice':
    'Values save when the field loses focus and apply immediately. Providers, local GPUs, and ComfyUI may still enforce lower concurrency or queues.',
  'general.generationLimitsSaved': 'Saved to the local Bridge and applied immediately.',
  'general.generationLimitsSaveFailed':
    'Bridge is temporarily unavailable. This browser kept the values; confirm them again after reconnecting.',
  'language.title': 'Language',
  'language.description': 'Choose the Qiansi-Canvas display language and locale format.',
  'language.interface': 'Display language',
  'language.notice':
    'Your choice is saved on this device and updates the browser language marker for dates, numbers, and UI language packs. Third-party content that is not localized safely falls back to English or its original copy—nothing is left blank.',
  'language.current': 'Current language:',
  'language.pluginProvidedBy': 'Language plugin · {name}',
  'language.importTitle': 'Import language pack',
  'language.importDescription':
    'Import a complete JSON pack to localize the canvas, settings, nodes, dialogs, and libraries.',
  'language.importButton': 'Choose language pack JSON',
  'language.importSuccess': 'Imported and switched to {locale}.',
  'language.importFailed': 'Language pack import failed.',
  'language.importInvalidMetadata': 'The language pack needs a valid locale.',
  'language.importDuplicate': 'This language already exists or matches a built-in locale.',
  'language.locale.zh-CN': 'Chinese (Simplified, China)',
  'language.locale.en-US': 'English (United States)',
  'toolbar.styleLibrary': 'Style library',
  'toolbar.effectsLibrary': 'Effects library',
  'toolbar.characterLibrary': 'Character library',
  'toolbar.promptLibrary': 'Prompt library',
  'canvas.assets': 'Assets',
  'canvas.snap': 'Toggle node snapping',
  'canvas.snapOn': 'Node snapping is on',
  'canvas.snapOff': 'Node snapping is off',
  'canvas.hideEdges': 'Hide node connections',
  'canvas.showEdges': 'Show node connections',
  'canvas.search': 'Search',
  'canvas.searchNodes': 'Search nodes',
  'canvas.layers': 'Layers',
  'canvas.layerManagement': 'Layer management',
  'canvas.fullscreen': 'Fullscreen',
  'canvas.exitFullscreen': 'Exit fullscreen',
  'canvas.zoomOut': 'Zoom out',
  'canvas.zoomIn': 'Zoom in',
  'canvas.zoomMenu': 'Canvas zoom menu',
  'canvas.fitView': 'Fit canvas',
  'canvas.resetView': 'Reset view',
  'canvas.shortcuts': 'Shortcuts',
  'canvas.trash': 'Trash',
  'node.video.untitled': 'Untitled video',
  'node.video.upload': 'Upload video',
  'node.video.edit': 'Edit',
  'node.video.remake': 'Remake segment',
  'node.video.crop': 'Crop',
  'node.video.animatedImage': 'Animated image',
  'node.video.enhance': 'Enhance',
  'node.video.extend': 'Continue with AI',
  'node.video.subtitles': 'Remove subtitles',
  'node.video.audio': 'Extract audio',
  'node.video.visualEdit': 'Visual editing',
  'node.video.aiVisualEdit': 'AI visual editing',
  'node.video.fullAudio': 'Extract full original audio',
  'node.video.voiceSeparation': 'Voice / music separation',
  'node.video.firstFrame': 'Capture first frame',
  'node.video.currentFrame': 'Capture current frame',
  'node.video.lastFrame': 'Capture last frame',
  'node.video.download': 'Download video',
  'node.video.fullscreen': 'Enlarge preview',
  'composer.reference': 'Reference',
  'composer.references': 'References',
  'composer.reference.locked': 'Director reference order is locked',
  'composer.reference.reorderable': 'Reorderable',
  'composer.cancelReference': 'Cancel reference',
  'composer.mark': 'Mark',
  'composer.cancelMark': 'Cancel mark',
  'composer.effects': 'Effects',
  'composer.assets': 'Assets',
  'asset.globalLibraryTitle': 'Global asset library',
  'asset.scope.all': 'All assets',
  'composer.camera': 'Camera motion',
  'pluginHost.recentProjectImagePicker.title': 'Select an image from a recent project',
  'pluginHost.recentProjectImagePicker.source':
    'Reading images only from the most recently used project: {name}',
  'pluginHost.recentProjectImagePicker.hint':
    'Reads images only from the first project in the recent-project list',
  'pluginHost.recentProjectImagePicker.loading': 'Loading recent project images…',
  'pluginHost.recentProjectImagePicker.noProject': 'No recent project is available',
  'pluginHost.recentProjectImagePicker.noImages':
    'The recent project has no usable source images',
  'header.home': 'Back to home',
  'header.allProjects': 'All projects',
  'header.currentProject': 'Current project',
  'header.unnamedProject': 'Untitled project',
  'header.import': 'Import',
  'header.export': 'Export',
  'header.undo': 'Undo',
  'header.redo': 'Redo',
  'header.group': 'Group',
  'header.groupSelected': 'Group selected nodes',
  'header.persistenceError':
    'Canvas autosave failed. Export the canvas now or check the local Bridge and disk space.',
  'header.exportConflictCopy': 'Export conflict copy',
  'header.backupAndReloadHost': 'Back up & load host version',
  'header.reloadingHost': 'Loading host version…',
  'header.retryPersistence': 'Retry save',
  'header.retryingPersistence': 'Retrying…',
  'header.dismissPersistence': 'Dismiss canvas save notice',
  'header.lanConflict':
    'Unsaved local changes differ from the host canvas. Automatic overwrite has stopped; reload or export both copies first.',
  'header.lanRemoteConflict':
    'The host canvas was updated by another window or LAN client. Unsaved local changes did not overwrite it; reload or export both copies first.',
  'header.exportLanConflictCopy': 'Export both copies',
  'header.dismissLanConflict': 'Dismiss LAN conflict notice',
  'header.homeTitle': 'Qiansi-Canvas AI Creative Workspace',
  'home.eyebrow': 'AI animation & filmmaking workspace',
  'home.title': 'Qiansi Infinite Canvas',
  'home.subtitle': 'Connect ideas, media, and AI workflows naturally',
  'home.description':
    'Create, organize, and iterate from story scripts and character design to image and video generation on one infinite canvas.',
  'home.continueCanvas': 'Enter canvas',
  'home.currentCanvas': 'Current canvas',
  'home.autosave': 'Autosave',
  'home.selectWorkflow': 'Choose a creative workflow',
  'home.workflowHint': 'You can still add, remove, and connect any node after entering',
  'home.commonWorkspaces': '4 common workspaces',
  'home.openWorkspace': 'Open workspace',
  'home.recentProjects': 'Recently used canvases',
  'home.recentProjectsHint': 'Quick access to your 4 most recently used canvases',
  'home.viewAllProjects': 'View all projects',
  'home.openRecentProject': 'Open project “{name}”',
  'home.openingProject': 'Opening…',
  'home.noRecentProjects': 'No projects available',
  'home.recentProjectsLoadFailed': 'Could not load recent projects.',
  'home.recentProjectOpenFailed': 'The project could not be opened safely. Check All projects.',
  'home.resources': 'Creative resources',
  'home.openFromCanvas': 'Open from current canvas',
  'home.shortcuts': 'Shortcuts',
  'home.help': 'Help',
  'home.availablePlugins': 'Available plugins',
  'home.availablePluginCount': '{count} available plugins',
  'home.openPlugin': 'Open {name}',
  'home.pluginEnabled': '{name} is enabled',
  'home.morePlugins': 'More',
  'home.morePluginsCount': '{count} more plugins',
  'home.morePluginsMenu': 'More available plugins',
  'home.creatorLinks': 'Creator profiles',
  'home.creator.github': 'GitHub profile',
  'home.creator.youtube': 'YouTube channel',
  'home.creator.bilibili': 'Bilibili channel',
  'home.creator.douyin': 'Douyin channel',
  'home.license': 'GPL-3.0-or-later',
  'home.newProject': 'New project',
  'home.navigationLabel': 'Home navigation',
  'home.nav.home': 'Home',
  'home.nav.projects': 'Projects',
  'home.new': 'New',
  'home.workflowLaunchFailed':
    'The new project could not be fully created and saved. Your previous project was kept unchanged. Try again or check All projects.',
  'home.creatingProject': 'Creating project…',
  'home.canvasLoading': 'Loading project…',
  'home.library.prompt': 'Prompt library',
  'home.library.promptDescription': 'Find and reuse creative prompts',
  'home.library.style': 'Style library',
  'home.library.styleDescription': 'Choose reusable visual styles',
  'home.library.effects': 'Effects library',
  'home.library.effectsDescription': 'Browse image and video effects',
  'home.library.character': 'Character library',
  'home.library.characterDescription': 'Manage characters and identity references',
  'projects.title': 'All projects',
  'projects.description': 'Manage creative projects saved in the local Bridge',
  'projects.refresh': 'Refresh project list',
  'projects.newProject': 'New project',
  'projects.allCount': 'All {count}',
  'projects.uncategorized': 'Uncategorized',
  'projects.deleteFolderLabel': 'Delete folder “{name}”',
  'projects.newFolder': 'New folder',
  'projects.loading': 'Loading projects…',
  'projects.reload': 'Reload',
  'projects.empty.all': 'No projects yet',
  'projects.empty.folder': 'No projects in this folder',
  'projects.empty.allDescription':
    'Create a blank project and start organizing characters, storyboards, video, and audio.',
  'projects.empty.folderDescription': 'Move projects here from a project card menu.',
  'projects.createFirst': 'Create first project',
  'projects.dialog.new.title': 'New project',
  'projects.dialog.new.description':
    'The project will be saved to the local Bridge with its own canvas revision.',
  'projects.dialog.projectNamePlaceholder': 'Enter a project name',
  'projects.dialog.createAndOpen': 'Create and open',
  'projects.dialog.rename.title': 'Rename project',
  'projects.dialog.save': 'Save',
  'projects.dialog.folder.title': 'New folder',
  'projects.dialog.folderNamePlaceholder': 'Enter a folder name',
  'projects.dialog.create': 'Create',
  'projects.dialog.deleteProject.title': 'Delete “{name}”?',
  'projects.dialog.deleteProject.description':
    'The project will be moved to the recoverable host archive. Original Asset Library files will not be deleted immediately.',
  'projects.dialog.deleteProject.confirm': 'Delete project',
  'projects.dialog.deleteFolder.title': 'Delete folder “{name}”?',
  'projects.dialog.deleteFolder.description':
    'Projects in this folder will not be deleted; they will be moved to Uncategorized.',
  'projects.dialog.deleteFolder.confirm': 'Delete folder',
  'projects.card.openLabel': 'Open project “{name}”',
  'projects.menu.openLabel': 'Open menu for project “{name}”',
  'projects.menu.actionsLabel': 'Actions for project {name}',
  'projects.menu.open': 'Open',
  'projects.menu.rename': 'Rename',
  'projects.menu.cover': 'Change cover',
  'projects.menu.duplicate': 'Duplicate',
  'projects.menu.move': 'Move to folder',
  'projects.menu.folderLabel': 'Choose destination folder',
  'projects.menu.uncategorized': 'Uncategorized',
  'projects.menu.delete': 'Delete project',
  'projects.menu.defaultCannotDelete': 'Default project cannot be deleted',
  'projects.error.catalog': 'Could not load the project catalog.',
  'projects.error.operation': 'Project operation failed.',
  'projects.error.open':
    'The project could not be opened safely. Check host storage and try again.',
  'projects.error.coverType': 'The project cover must be an image file.',
  'projects.error.activeSave':
    'The current project has not been saved safely, so deletion was cancelled.',
  'projects.error.fallbackOpen':
    'The project was deleted, but the default project could not be loaded. Refresh the project list and try again.',
  'workspace.script.title': 'Story script generation',
  'workspace.script.tagline': 'Turn one sentence into a story script and storyboard',
  'workspace.views.title': 'Character turnaround',
  'workspace.views.tagline': 'Upload a character reference to generate front, side, and back views',
  'workspace.video.title': 'First-frame to video',
  'workspace.video.tagline': 'Upload a first frame and extend it into a complete video',
  'workspace.audio.title': 'Audio to video',
  'workspace.audio.tagline': 'Import audio to drive lip-sync or rhythm-based video',
  'common.back': 'Back',
  'common.open': 'Open',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.retry': 'Retry',
  'common.confirm': 'Confirm',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.default': 'Default',
  'common.paste': 'Paste',
  'common.play': 'Play',
  'common.pause': 'Pause',
  'common.saveFailedRetry': 'Save failed. Please try again.',
  'context.effectReferenceRestricted':
    'Effect nodes only support duplicating the node or moving it to Trash',
  'context.effectVideoOnly': 'Effects can only connect to video nodes',
  'toolbarDrag.dropPrimary': 'Release to add to the main toolbar',
  'toolbarDrag.dropOverflow': 'Release to move into More tools',
  'toolbarDrag.chooseTarget': 'Drag to a blue target',
  'node.kind.text': 'Text',
  'node.kind.image': 'Image',
  'node.kind.imageCompare': 'Image comparison',
  'node.kind.video': 'Video',
  'node.kind.audio': 'Audio',
  'node.kind.script': 'Script',
  'node.kind.frontFrame': 'First frame',
  'assets.category.character': 'Character',
  'assets.category.scene': 'Scene',
  'assets.category.storyboard': 'Storyboard',
  'assets.category.item': 'Object',
  'assets.category.video': 'Video',
  'assets.category.audio': 'Audio',
  'library.target.style': 'Style library',
  'library.target.effect': 'Effects library',
  'library.target.character': 'Character library',
  'library.target.prompt': 'Prompt library',
  'media.persist.saving': 'Saving media to the local asset library…',
  'media.persist.saved': 'Media saved to the local asset library.',
  'media.persist.sessionOnlyWithError': 'Media is available for this session only: {message}',
  'media.persist.sessionOnly': 'Media is available for this session only; local save failed.',
  'context.group.colorAria': 'Choose group background color',
  'context.menuAria': 'Canvas actions menu',
  'context.assetCategory': 'Choose asset category',
  'context.saveTo': 'Save to',
  'context.libraryCategory': '{library} · Choose category',
  'context.librarySaving': 'Saving image, video, and text…',
  'context.selectedNodes': '{count} nodes selected',
  'context.createGroup': 'Create group',
  'context.arrangeGrid': 'Arrange in grid',
  'context.arrangeGridTitle': 'Grid arrangement',
  'context.arrangeGridAuto': 'Automatic',
  'context.arrangeGridColumns': '{count} columns',
  'context.arrangeGridUnavailable':
    'Selected nodes must be on the same canvas level to arrange them',
  'context.independentTextNode': 'Independent text nodes',
  'context.independentImageNode': 'Independent image nodes',
  'context.createImageComparison': 'Compare images',
  'context.imageComparisonUnavailable': 'Select two nodes that contain real images',
  'context.independentTextUnavailable':
    'Some selected nodes cannot connect to a text node; nothing was created',
  'context.independentImageUnavailable':
    'Some selected nodes cannot connect to an image node; nothing was created',
  'context.contentBatchGenerate': 'Generate selected content',
  'context.contentBatchUnavailable': 'The selected nodes have no default generation action',
  'context.contentBatchRunning': 'The selected content nodes are already generating',
  'imageCompare.image1': 'Image 1',
  'imageCompare.image2': 'Image 2',
  'imageCompare.connectImage1': 'Connect image 1',
  'imageCompare.connectImage2': 'Connect image 2',
  'imageCompare.connectSecondHint': 'Connect another image to start dragging the comparison',
  'imageCompare.aspectRatioAligned': 'Different ratios · center-cropped to align',
  'imageCompare.slider': 'Image comparison divider',
  'imageCompare.trash': 'Move image comparison node to Trash',
  'context.batchGenerateImage': 'Generate images in batch',
  'context.batchGenerateVideo': 'Generate videos in batch',
  'context.nodeCount': '{count} nodes',
  'context.noBatchTasksHint': 'The selected nodes have no runnable image or video tasks',
  'context.noBatchTasks': 'No image or video nodes available for batch generation',
  'context.connectionActions': 'Connection actions',
  'context.deleteConnection': 'Delete connection',
  'context.groupActions': 'Group actions',
  'context.renameGroup': 'Rename group',
  'context.changeGroupColor': 'Change background color',
  'context.fitGroup': 'Fit group to contents',
  'context.ungroup': 'Ungroup and keep nodes',
  'context.trashGroup': 'Move group to trash',
  'context.duplicateNode': 'Duplicate node',
  'context.noSavableMedia': 'This node has no media to save',
  'context.saveAsAsset': 'Save as asset',
  'context.fullscreenPreview': 'Fullscreen preview',
  'context.copyImage': 'Copy image',
  'context.copyingImage': 'Copying image…',
  'context.noCopyableImage': 'This node has no image to copy',
  'context.copyImageFailed':
    'Could not copy the image. Check the browser clipboard permission or image source.',
  'context.noEditableImage': 'This node has no editable image',
  'context.noStyleImage': 'This node has no image that can receive a style',
  'context.applyStyle': 'Apply style',
  'context.saveToLibrary': 'Save to library',
  'context.subjectCreated': 'Subject created',
  'context.createSubject': 'Create subject',
  'context.regenerateWithModel': 'Regenerate with {model}',
  'context.selectVideoModel': 'Select a video model first',
  'context.moveToTrash': 'Move to trash',
  'context.openDirector': 'Open director',
  'context.createDirector': 'Create director',
  'context.addDirector': 'Add director',
  'context.director': 'Director',
  'context.directorHint': 'Position and subject constraints',
  'context.selectPlugin': 'Select plugin',
  'context.pluginActions': 'Plugin actions',
  'context.addNode': 'Add node',
  'context.library': 'Libraries',
  'context.addResources': 'Add resources',
  'context.uploadLocalFile': 'Upload local file',
  'context.generationHistory': 'Choose from generation history',
  'context.noCanvasAssetHint': 'Right-click a node containing media to save an asset',
  'context.saveToAssets': 'Save to my assets',
  'director.2d': '2D Director',
  'director.2d.description': 'Flat composition and storyboards',
  'director.2d.connectionDescription': 'Storyboard image constraints',
  'director.3d': '3D Director',
  'director.3d.description': 'Characters, cameras, and motion paths',
  'director.3d.connectionDescription': 'Character and camera previs',
};

const packs: Record<BuiltInAppLanguage, LanguagePack> = {
  'zh-CN': { ...DOMAIN_LANGUAGE_PACKS['zh-CN'], ...zhCN },
  'en-US': { ...DOMAIN_LANGUAGE_PACKS['en-US'], ...enUS },
};

for (const language of Object.keys(packs) as BuiltInAppLanguage[]) {
  const pack = packs[language];
  const aliases: Record<string, string> = {
    'library.style.title': 'toolbar.styleLibrary',
    'library.effects.title': 'toolbar.effectsLibrary',
    'library.character.title': 'toolbar.characterLibrary',
    'library.prompt.title': 'toolbar.promptLibrary',
    'trash.title': 'canvas.trash',
  };
  for (const [target, source] of Object.entries(aliases)) {
    const localizedSource = pack[source];
    if (!pack[target] && localizedSource) pack[target] = localizedSource;
  }
}

export type PluginLanguagePack = {
  locale: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  pluginId: string;
  pluginName: string;
  translations: LanguagePack;
};

export type AvailableAppLanguage = Omit<PluginLanguagePack, 'translations'> & {
  builtIn: boolean;
};

const pluginPacks = new Map<string, PluginLanguagePack>();
const importedPacks = new Map<string, PluginLanguagePack>();
const languageListeners = new Set<() => void>();
let languageRegistryVersion = 0;

const IMPORTED_LANGUAGE_PACKS_STORAGE_KEY = 'qiansi-canvas-imported-language-packs-v1';

function emitLanguageRegistryChange() {
  languageRegistryVersion += 1;
  for (const listener of languageListeners) listener();
}

function subscribeLanguageRegistry(listener: () => void) {
  languageListeners.add(listener);
  return () => languageListeners.delete(listener);
}

export function requiredEnglishTranslationKeys(): string[] {
  return Object.entries(packs['en-US'])
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
    .sort();
}

export function englishTranslationTemplate(): LanguagePack {
  return Object.fromEntries(Object.entries(packs['en-US']).filter(([, value]) => Boolean(value)));
}

export function replacePluginLanguagePacks(next: PluginLanguagePack[]) {
  pluginPacks.clear();
  for (const pack of next) pluginPacks.set(pack.locale, pack);
  emitLanguageRegistryChange();
}

function isLanguagePack(value: unknown): value is PluginLanguagePack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pack = value as Partial<PluginLanguagePack>;
  if (
    typeof pack.locale !== 'string' ||
    typeof pack.nativeName !== 'string' ||
    (pack.direction !== 'ltr' && pack.direction !== 'rtl') ||
    typeof pack.pluginId !== 'string' ||
    typeof pack.pluginName !== 'string' ||
    !pack.translations ||
    typeof pack.translations !== 'object' ||
    Array.isArray(pack.translations)
  ) {
    return false;
  }
  return Object.entries(pack.translations).every(
    ([key, translation]) =>
      Boolean(key) &&
      key.length <= 240 &&
      typeof translation === 'string' &&
      translation.length <= 8000,
  );
}

function persistImportedLanguagePacks() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      IMPORTED_LANGUAGE_PACKS_STORAGE_KEY,
      JSON.stringify([...importedPacks.values()]),
    );
    setRegisteredImportedLanguages([...importedPacks.keys()]);
  } catch {
    // The imported pack remains active for this session if storage is unavailable.
  }
}

function hydrateImportedLanguagePacks() {
  if (typeof localStorage === 'undefined') return;
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(IMPORTED_LANGUAGE_PACKS_STORAGE_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return;
    for (const candidate of parsed) {
      if (!isLanguagePack(candidate)) continue;
      const pack = candidate as PluginLanguagePack;
      const expectedKeys = Object.keys(packs['en-US']);
      if (expectedKeys.some((key) => !pack.translations[key])) continue;
      importedPacks.set(pack.locale, pack);
    }
    setRegisteredImportedLanguages([...importedPacks.keys()]);
  } catch {
    // Corrupt local language data is ignored and never blocks the application.
  }
}

/** Registers a validated language pack imported by the user and persists it locally. */
export function registerImportedLanguagePack(
  pack: Omit<PluginLanguagePack, 'pluginId'> & {
    pluginId?: string;
  },
) {
  const normalized: PluginLanguagePack = {
    ...pack,
    pluginId: pack.pluginId ?? 'user-imported-language',
  };
  importedPacks.set(normalized.locale, normalized);
  persistImportedLanguagePacks();
  emitLanguageRegistryChange();
}

export function importedLanguageLocales(): string[] {
  return [...importedPacks.keys()];
}

export function availableAppLanguages(): AvailableAppLanguage[] {
  return [
    {
      locale: 'zh-CN',
      nativeName: '简体中文',
      direction: 'ltr',
      pluginId: 'builtin',
      pluginName: 'Qiansi-Canvas',
      builtIn: true,
    },
    {
      locale: 'en-US',
      nativeName: 'English',
      direction: 'ltr',
      pluginId: 'builtin',
      pluginName: 'Qiansi-Canvas',
      builtIn: true,
    },
    ...[...pluginPacks.values()].map(({ translations: _translations, ...pack }) => ({
      ...pack,
      builtIn: false,
    })),
    ...[...importedPacks.values()].map(({ translations: _translations, ...pack }) => ({
      ...pack,
      builtIn: false,
    })),
  ];
}

export function useAvailableAppLanguages() {
  useSyncExternalStore(
    subscribeLanguageRegistry,
    () => languageRegistryVersion,
    () => languageRegistryVersion,
  );
  return availableAppLanguages();
}

export function translate(
  language: AppLanguage,
  key: string,
  fallback?: string,
  params?: TranslationParams,
): string {
  const selected = (importedPacks.get(language)?.translations ??
    pluginPacks.get(language)?.translations ??
    packs[language as BuiltInAppLanguage])?.[key];
  if (selected) return interpolate(selected, params);
  // Feature components carry their canonical Chinese copy as a migration fallback.
  // Keep the Simplified Chinese UI Chinese even when English already defines the key.
  if (language === 'zh-CN' && fallback) return interpolate(fallback, params);
  return interpolate(packs['en-US'][key] ?? packs['zh-CN'][key] ?? fallback ?? key, params);
}

/** Used by coverage tests and diagnostics; does not apply cross-language fallback. */
export function hasTranslation(language: AppLanguage, key: string): boolean {
  return Boolean(
    (importedPacks.get(language)?.translations ??
      pluginPacks.get(language)?.translations ??
      packs[language as BuiltInAppLanguage])?.[key],
  );
}

export function useAppTranslation() {
  useSyncExternalStore(
    subscribeLanguageRegistry,
    () => languageRegistryVersion,
    () => languageRegistryVersion,
  );
  const language = useCanvasPreferences((state) => state.language);
  const t = useCallback(
    (key: string, fallback?: string, params?: TranslationParams) =>
      translate(language, key, fallback, params),
    [language],
  );
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(language, options).format(value),
    [language],
  );
  const formatDate = useCallback(
    (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(language, options).format(value),
    [language],
  );

  return { language, t, formatNumber, formatDate };
}

type DocumentLanguageRoot = {
  lang: string;
  dir: string;
  dataset: { language?: string };
};

/** Applies the locale marker without coupling the contract to React or the browser runtime. */
export function applyDocumentLanguage(
  root: DocumentLanguageRoot,
  language: AppLanguage,
  direction: 'ltr' | 'rtl' = importedPacks.get(language)?.direction ??
    pluginPacks.get(language)?.direction ??
    'ltr',
) {
  root.lang = language;
  root.dir = direction;
  root.dataset.language = language;
}

hydrateImportedLanguagePacks();

/** Keeps the document locale in sync on the home page, canvas and every modal. */
export function AppLanguageRuntime() {
  const language = useCanvasPreferences((state) => state.language);
  const languages = useAvailableAppLanguages();
  const direction = languages.find((item) => item.locale === language)?.direction ?? 'ltr';

  useEffect(() => {
    applyDocumentLanguage(document.documentElement, language, direction);
  }, [direction, language]);

  return null;
}
