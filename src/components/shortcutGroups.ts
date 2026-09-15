export interface ShortcutItem {
  id: string;
  action: string;
  keys: string[];
}

export interface ShortcutGroup {
  id: string;
  title: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'creation',
    title: '创作',
    items: [
      { id: 'selectAllNodes', action: '全选画布节点', keys: ['Ctrl/⌘', 'A'] },
      { id: 'groupSelected', action: '选中节点分组', keys: ['Ctrl/⌘', 'G'] },
      { id: 'copySelected', action: '复制选中节点', keys: ['Ctrl/⌘', 'C'] },
      { id: 'pasteNodes', action: '粘贴节点', keys: ['Ctrl/⌘', 'V'] },
      { id: 'duplicateNodes', action: '创建节点副本', keys: ['Ctrl/⌘', 'D'] },
      { id: 'dragDuplicate', action: '拖拽复制节点', keys: ['Alt', '拖拽节点'] },
      { id: 'collapseComposer', action: '收起指令框（单选 / 多选共享）', keys: ['Ctrl', '↑'] },
      { id: 'expandComposer', action: '展开指令框（单选 / 多选共享）', keys: ['Ctrl', '↓'] },
      { id: 'saveText', action: '保存文本编辑', keys: ['Ctrl/⌘', 'Enter'] },
      { id: 'sendAgent', action: '发送 Agent 消息', keys: ['Enter'] },
      { id: 'agentNewline', action: 'Agent 输入换行', keys: ['Shift', 'Enter'] },
    ],
  },
  {
    id: 'zoom',
    title: '缩放',
    items: [
      { id: 'zoomIn', action: '放大画布', keys: ['滚轮向上'] },
      { id: 'zoomOut', action: '缩小画布', keys: ['滚轮向下'] },
      { id: 'preciseZoom', action: '精细缩放', keys: ['Ctrl/⌘', '滚轮'] },
      { id: 'toggleMinimap', action: '切换小地图', keys: ['Ctrl/⌘', 'M'] },
    ],
  },
  {
    id: 'navigation',
    title: '移动画布',
    items: [
      { id: 'panCanvas', action: '平移画布', keys: ['拖拽空白处'] },
      { id: 'middlePan', action: '中键平移', keys: ['鼠标中键', '拖拽'] },
      { id: 'temporaryHand', action: '临时抓手', keys: ['Space', '拖拽'] },
      { id: 'multiSelect', action: '多选节点', keys: ['Ctrl', '点击'] },
      { id: 'boxSelect', action: '框选节点', keys: ['Ctrl', '拖拽空白处'] },
    ],
  },
  {
    id: 'other',
    title: '其他',
    items: [
      { id: 'undo', action: '撤销', keys: ['Ctrl/⌘', 'Z'] },
      { id: 'redo', action: '重做', keys: ['Ctrl/⌘', 'Shift', 'Z'] },
      { id: 'redoWindows', action: '重做（Windows）', keys: ['Ctrl', 'Y'] },
      { id: 'deleteSelected', action: '删除选中内容', keys: ['Delete / Backspace'] },
      { id: 'closeOverlay', action: '关闭弹窗或菜单', keys: ['Esc'] },
      { id: 'openShortcuts', action: '打开快捷键', keys: ['?'] },
    ],
  },
];
