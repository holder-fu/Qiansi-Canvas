export const CANVAS_SHELL_BITS_LANGUAGE_PACKS: Record<'zh-CN' | 'en-US', Record<string, string>> = {
  'zh-CN': {
    'runtimeUpdate.featureFailed': '这个功能暂时未能加载',
    'runtimeUpdate.featureHint': '画布仍可继续使用。可以重试；如有新版本，请完成编辑后更新页面。',
    'runtimeUpdate.retry': '重试',
    'runtimeUpdate.close': '关闭',
    'runtimeUpdate.details': '详细信息',
    'runtimeUpdate.finishEditing': '请先完成运行中的任务，并关闭编辑弹窗，再更新页面。',
    'runtimeUpdate.checkingSave': '正在确认当前内容已保存…',
    'runtimeUpdate.saveBlocked': '暂时无法确认保存，未刷新页面。请稍后重试。',
    'runtimeUpdate.saving': '正在保存…',
    'runtimeUpdate.ready': '新版本已准备好',
    'runtimeUpdate.continue': '可以继续创作，完成当前编辑后再更新页面。',
    'runtimeUpdate.saveAndUpdate': '保存并更新',
    'canvasShell.port.dragToConnect': '拖动以连接节点',
    'canvasShell.common.close': '关闭',

    'canvasShell.composer.error.createNode':
      '未能创建用于执行该指令的新节点，请重新选择节点后再试。',
    'canvasShell.composer.error.send': '发送失败，请稍后重试。',
    'canvasShell.composer.expand': '展开指令框',

    'canvasShell.panorama.title': '生成全景图',
    'canvasShell.panorama.description': '关联当前图片并创建一个新的全景场景图片节点',
    'canvasShell.panorama.confirmAria': '确认{title}',
    'canvasShell.panorama.closePromptAria': '关闭{title}提示',
    'canvasShell.panorama.preparing': '准备中',
    'canvasShell.panorama.generate': '生成',

    'canvasShell.delete.title': '移到回收站？',
    'canvasShell.delete.description': '节点和相关连线会进入当前画布的回收站。',
    'canvasShell.delete.cancel': '取消',
    'canvasShell.delete.confirm': '移到回收站',

    'canvasShell.media.videoPreview': '视频预览',
    'canvasShell.media.imagePreview': '图片预览',
    'canvasShell.media.closePreview': '关闭媒体预览',
    'canvasShell.media.empty': '当前节点没有可预览的媒体。',

    'canvasShell.aiSkill.dragNodeAria': '拖动节点「{label}」到 AI SKILL',
    'canvasShell.aiSkill.dragToComposer': '拖到 AI SKILL 指令框',
    'canvasShell.aiSkill.drag': '拖到 AI SKILL',

    'canvasShell.edge.cutAtPointer': '点击当前位置剪断连线',

    'canvasShell.tabs.new': '新建画板',
    'canvasShell.tabs.renameHint': '双击重命名',
    'canvasShell.tabs.close': '关闭画板：{name}',

    'canvasShell.directorThree.preview': '3D导演台真实模型预览',
  },
  'en-US': {
    'runtimeUpdate.featureFailed': 'This feature could not be loaded',
    'runtimeUpdate.featureHint':
      'You can keep using the canvas. Retry, or finish editing before switching to a new version.',
    'runtimeUpdate.retry': 'Retry',
    'runtimeUpdate.close': 'Close',
    'runtimeUpdate.details': 'Details',
    'runtimeUpdate.finishEditing':
      'Finish running tasks and close editing dialogs before updating.',
    'runtimeUpdate.checkingSave': 'Checking that your current work is saved…',
    'runtimeUpdate.saveBlocked':
      'Saving could not be confirmed. The page was not refreshed. Please retry later.',
    'runtimeUpdate.saving': 'Saving…',
    'runtimeUpdate.ready': 'A new version is ready',
    'runtimeUpdate.continue': 'Keep creating, and update the page when you finish editing.',
    'runtimeUpdate.saveAndUpdate': 'Save and update',
    'canvasShell.port.dragToConnect': 'Drag to connect nodes',
    'canvasShell.common.close': 'Close',

    'canvasShell.composer.error.createNode':
      'Could not create a new node for this command. Select the nodes again and retry.',
    'canvasShell.composer.error.send': 'Could not send the command. Try again later.',
    'canvasShell.composer.expand': 'Expand command composer',

    'canvasShell.panorama.title': 'Generate panorama',
    'canvasShell.panorama.description':
      'Connect the current image and create a new panoramic scene image node',
    'canvasShell.panorama.confirmAria': 'Confirm {title}',
    'canvasShell.panorama.closePromptAria': 'Close the {title} prompt',
    'canvasShell.panorama.preparing': 'Preparing',
    'canvasShell.panorama.generate': 'Generate',

    'canvasShell.delete.title': 'Move to trash?',
    'canvasShell.delete.description':
      'The node and its connected edges will be moved to the current canvas trash.',
    'canvasShell.delete.cancel': 'Cancel',
    'canvasShell.delete.confirm': 'Move to trash',

    'canvasShell.media.videoPreview': 'Video preview',
    'canvasShell.media.imagePreview': 'Image preview',
    'canvasShell.media.closePreview': 'Close media preview',
    'canvasShell.media.empty': 'This node has no media to preview.',

    'canvasShell.aiSkill.dragNodeAria': 'Drag node “{label}” to AI SKILL',
    'canvasShell.aiSkill.dragToComposer': 'Drag to the AI SKILL command composer',
    'canvasShell.aiSkill.drag': 'Drag to AI SKILL',

    'canvasShell.edge.cutAtPointer': 'Cut the connection at this position',

    'canvasShell.tabs.new': 'New canvas',
    'canvasShell.tabs.renameHint': 'Double-click to rename',
    'canvasShell.tabs.close': 'Close canvas: {name}',

    'canvasShell.directorThree.preview': 'Live 3D director model preview',
  },
};
