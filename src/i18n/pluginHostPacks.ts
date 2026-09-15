type PluginHostLanguagePack = Record<string, string>;

const zhCN: PluginHostLanguagePack = {
  'pluginHost.pet.reminder.focus': '专注一会儿啦，记得抬头看看远处，放松一下眼睛。',
  'pluginHost.pet.reminder.drink': '喝一口水吧，身体也在陪你一起努力呀。',
  'pluginHost.pet.reminder.stretch': '坐久了记得活动活动肩颈，慢一点也没关系。',
  'pluginHost.pet.reminder.rest': '辛苦啦，休息半分钟再继续会更有灵感。',
  'pluginHost.pet.reminder.blink': '别忘了眨眨眼，给眼睛一个小小的休息时间。',
  'pluginHost.pet.reminder.morning': '早安！早餐吃了吗？小猫也想陪你补充能量。',
  'pluginHost.pet.reminder.lunch': '到饭点啦，先去吃点热乎的吧，小猫肚子也饿了。',
  'pluginHost.pet.reminder.dinner': '晚饭时间到，忙完这一点就去好好吃饭吧。',
  'pluginHost.pet.highFiveAria': '点击 {label} 举起的手掌击掌',
  'pluginHost.pet.draggableAria': '{label}，可拖动',
  'pluginHost.pet.highFiveAlt': '微笑举掌的橘猫',
  'pluginHost.fallbackPluginName': '插件',
  'pluginHost.panel.close': '关闭 {label}',
  'pluginHost.panel.open': '打开 {label}',
  'pluginHost.panel.fullscreenEyebrow': '本机 AI 音频工作台',
  'pluginHost.panel.languageToggle': '切换中英文界面',
  'pluginHost.panel.languageChinese': '切换为中文',
  'pluginHost.panel.languageEnglish': '切换为英文',
  'pluginHost.sandbox.runtimeLoadFailed': '插件运行时加载失败。',
  'pluginHost.sandbox.starting': '正在启动隔离插件…',
  'pluginHost.node.fallbackPluginName': '第三方插件',
  'pluginHost.node.fallbackDescription': '第三方沙箱插件节点',
  'pluginHost.node.input': '输入 · {type}',
  'pluginHost.node.output': '输出 · {type}',
  'pluginHost.node.moveToTrash': '移到回收站',
  'pluginHost.node.selectToInteract': '单击选择节点后操作场景',
  'pluginHost.node.runtimeUnavailable': '插件运行时未启用、版本不兼容或已被卸载。节点数据仍保留。',
};

const enUS: PluginHostLanguagePack = {
  'pluginHost.pet.reminder.focus':
    'You have been focused for a while. Look into the distance and rest your eyes.',
  'pluginHost.pet.reminder.drink': 'Take a sip of water—your body is working alongside you.',
  'pluginHost.pet.reminder.stretch':
    'If you have been sitting for a while, gently stretch your shoulders and neck.',
  'pluginHost.pet.reminder.rest':
    'You have worked hard. A thirty-second break may bring fresh inspiration.',
  'pluginHost.pet.reminder.blink': 'Remember to blink and give your eyes a brief rest.',
  'pluginHost.pet.reminder.morning':
    'Good morning! Have you had breakfast? The cat wants you to recharge too.',
  'pluginHost.pet.reminder.lunch':
    'It is time for lunch. Have something warm—the cat is getting hungry too.',
  'pluginHost.pet.reminder.dinner':
    'Dinner time is here. Finish this little bit, then enjoy a proper meal.',
  'pluginHost.pet.highFiveAria': 'High-five the raised paw of {label}',
  'pluginHost.pet.draggableAria': '{label}, draggable',
  'pluginHost.pet.highFiveAlt': 'Smiling orange cat raising a paw',
  'pluginHost.fallbackPluginName': 'Plugin',
  'pluginHost.panel.close': 'Close {label}',
  'pluginHost.panel.open': 'Open {label}',
  'pluginHost.panel.fullscreenEyebrow': 'Local AI audio workspace',
  'pluginHost.panel.languageToggle': 'Switch between Chinese and English',
  'pluginHost.panel.languageChinese': 'Switch to Chinese',
  'pluginHost.panel.languageEnglish': 'Switch to English',
  'pluginHost.sandbox.runtimeLoadFailed': 'Failed to load the plugin runtime.',
  'pluginHost.sandbox.starting': 'Starting isolated plugin…',
  'pluginHost.node.fallbackPluginName': 'Third-party plugin',
  'pluginHost.node.fallbackDescription': 'Third-party sandbox plugin node',
  'pluginHost.node.input': 'Input · {type}',
  'pluginHost.node.output': 'Output · {type}',
  'pluginHost.node.moveToTrash': 'Move to trash',
  'pluginHost.node.selectToInteract': 'Select the node to interact with the scene',
  'pluginHost.node.runtimeUnavailable':
    'The plugin runtime is disabled, incompatible, or uninstalled. Node data is still preserved.',
};

export const PLUGIN_HOST_LANGUAGE_PACKS: Record<'zh-CN' | 'en-US', PluginHostLanguagePack> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
