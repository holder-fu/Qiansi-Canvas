import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const packageRoots = ['.codex-tmp/qiansi-audio-package', 'data/plugins/qiansi-audio'];

async function packageFiles(root) {
  const [manifestSource, runtime] = await Promise.all([
    readFile(`${root}/plugin.json`, 'utf8'),
    readFile(`${root}/runtime.js`, 'utf8'),
  ]);
  return { manifest: JSON.parse(manifestSource), runtime };
}

test('installed Qiansi Audio Studio manifest exposes six managed engines', async () => {
  const { manifest } = await packageFiles(packageRoots[1]);
  assert.equal(manifest.id, 'qiansi-audio');
  assert.equal(manifest.name, 'Qiansi Audio Studio');
  assert.equal(manifest.version, '1.13.3');
  assert.ok(manifest.permissions.includes('storage:preferences'));
  assert.equal(manifest.contributes.nodes.length, 0);
  assert.equal(manifest.contributes.panels.length, 1);
  assert.deepEqual(
    manifest.contributes.menus.map((menu) => [menu.label, menu.action.type]),
    [['打开 Qiansi Audio Studio', 'open-panel']],
  );
  assert.ok(!manifest.permissions.includes('canvas:read-own-inputs'));
  assert.deepEqual(
    manifest.contributes.audioGenerators.map((generator) => [generator.id, generator.hostAdapter]),
    [
      ['qwen3-tts-local', 'qwen3tts'],
      ['voxcpm2-local', 'voxcpm2'],
      ['cosyvoice3-local', 'cosyvoice3'],
      ['chattts-local', 'chattts'],
      ['woosh-local', 'woosh'],
      ['acestep-xl-local', 'acestepXl'],
    ],
  );
  assert.ok(
    manifest.contributes.audioGenerators.every((generator) => generator.canvasOutput === undefined),
  );
});

test('unified workbench exposes six local engines and two ACE music variants', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'Qiansi Audio Studio',
    '七套本机语音、音效与音乐模型',
    'data-model="voxcpm2"',
    'data-model="chattts"',
    'data-model="qwen3tts"',
    'data-model="cosyvoice3"',
    'data-model="woosh"',
    'data-model="acestepXlTurbo"',
    'data-model="acestepXlSft"',
    "voxcpm2: 'voxcpm2-local'",
    "chattts: 'chattts-local'",
    "qwen3tts: 'qwen3-tts-local'",
    "cosyvoice3: 'cosyvoice3-local'",
    "woosh: 'woosh-local'",
    "acestepXlTurbo: 'acestep-xl-local'",
    "acestepXlSft: 'acestep-xl-local'",
    'selected-model.v1',
    'VoxCPM2 模型参数',
    'ChatTTS 模型参数',
    'Qwen3-TTS 模型参数',
    'CosyVoice 3 模型参数',
    'Sony Woosh 音效参数',
    'ACE-Step 1.5 XL Turbo 音乐参数',
    'ACE-Step 1.5 XL SFT 音乐参数',
    '声音克隆',
    '极致克隆',
    'Temperature',
    'Top P',
    'Top K',
    '仅限非商业用途',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const selectorOrder = [
    'qwen3tts',
    'voxcpm2',
    'cosyvoice3',
    'chattts',
    'woosh',
    'acestepXlTurbo',
    'acestepXlSft',
  ].map((model) => runtime.indexOf(`data-model="${model}"`));
  assert.ok(selectorOrder.every((offset) => offset >= 0));
  assert.deepEqual(
    selectorOrder,
    [...selectorOrder].sort((left, right) => left - right),
  );
  assert.match(runtime, /let activeModel = 'qwen3tts';/);
  assert.match(runtime, /let preferred = 'qwen3tts';/);
});

test('canvas history keeps destructive actions inline and requires explicit asset saving', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    "typeof api.addAudioHistoryToCanvasAssets === 'function'",
    'grid-template-columns: repeat(4,minmax(0,1fr))',
    'data-history-action="repeat">再次生成</button><button class="qa-button qa-danger" type="button" data-history-action="delete">删除</button>',
    'data-history-action="add-canvas-asset">添加到画布资产中</button>',
    'api.addAudioHistoryToCanvasAssets(entryGeneratorId, entry.id)',
    'class="qa-history-feedback qa-hidden" role="status" aria-live="polite"',
    "elements.historyList.querySelectorAll('[data-history-action]')",
    "action.addEventListener('click', handleHistoryAction)",
    "setHistoryFeedback(entry, '正在读取历史音频…')",
    "setHistoryFeedback(entry, '正在准备保存历史音频…')",
    "setHistoryFeedback(entry, '正在恢复历史参数…')",
  ]) {
    assert.ok(runtime.includes(contract), `missing explicit canvas-asset contract: ${contract}`);
  }
  assert.ok(!runtime.includes("elements.historyList.addEventListener('click'"));
});

test('standalone studio footer exposes copyright, license scope, and plugin version', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'class="qa-footer"',
    'aria-label="Qiansi Audio Studio 信息"',
    '© 2026 holder（老树苗） · Qiansi Audio Studio 第一方代码：MIT 许可证',
    '模型、权重与音色遵循各自许可证',
    "footerVersion.textContent = 'v1.13.3';",
    "'Qiansi Audio Studio information'",
    "'Qiansi Audio Studio first-party code: MIT License'",
    "'Models, weights, and voices follow their respective licenses'",
    '.qa-studio .qa-footer { grid-column: 1 / -1; grid-row: 3;',
    '.qa-standalone .qa-footer { padding-bottom: 58px;',
    "${isStandalone ? ' qa-standalone' : ''}",
    '.qa-footer { display: grid; grid-template-columns: minmax(143px,1fr) minmax(0,auto) minmax(143px,1fr);',
    '.qa-footer > span:first-child { grid-column: 2; grid-row: 1; justify-self: center; text-align: center;',
    '.qa-footer-right { display: contents;',
    '.qa-footer-details { display: inline-flex; grid-column: 3; grid-row: 1; justify-self: end;',
    '.qa-social-links { display: inline-flex; grid-column: 1; grid-row: 1; justify-self: start;',
    '.qa-footer { grid-template-columns: minmax(0,1fr) minmax(0,1fr);',
    '.qa-social-links { grid-column: 1; grid-row: 2;',
    '.qa-footer-details { grid-column: 2; grid-row: 2;',
  ]) {
    assert.ok(runtime.includes(contract), `missing studio footer contract: ${contract}`);
  }
  assert.equal(runtime.match(/<footer class="qa-footer"/g)?.length, 1);
  for (const contract of [
    'class="qa-social-links" aria-label="个人主页"',
    'https://github.com/holder-fu/',
    'https://www.youtube.com/@holder6522',
    'https://space.bilibili.com/410771067',
    'https://www.douyin.com/user/MS4wLjABAAAA_h2K39mV-GSqRhsncB7G85OIKcNabnNSckQKOuH0sL4?from_tab_name=main&amp;vid=7661509584624054885',
    'aria-label="GitHub 主页"',
    'aria-label="YouTube 视频主页"',
    'aria-label="哔哩哔哩视频主页"',
    'aria-label="抖音视频主页"',
    "个人主页: 'Creator links'",
    "'GitHub 主页': 'GitHub profile'",
    "'YouTube 视频主页': 'YouTube channel'",
    "'哔哩哔哩视频主页': 'Bilibili channel'",
    "'抖音视频主页': 'Douyin profile'",
  ]) {
    assert.ok(runtime.includes(contract), `missing creator-link contract: ${contract}`);
  }
  assert.equal(runtime.match(/class="qa-social-link(?: qa-social-github)?"/g)?.length, 4);
  assert.equal(runtime.match(/target="_blank" rel="noopener noreferrer"/g)?.length, 4);
  assert.match(
    runtime,
    /\.qa-shell \{[^}]*height: 100vh;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/,
    'the workbench shell must provide an internal vertical scroller inside the Canvas iframe',
  );
  assert.match(
    runtime,
    /\.qa-studio \{[^}]*grid-template-rows: auto auto auto;[^}]*height: 100vh;[^}]*min-height: 0;/,
    'studio content and footer must use content-sized rows within the scrollable viewport',
  );
  for (const contract of [
    'function mountStudioMainColumn()',
    "mainColumn.className = 'qa-workbench-main';",
    'mainColumn.append(inputCard, controlColumns);',
    '.qa-studio .qa-workbench-main { grid-column: 2; grid-row: 2; display: flex;',
    '.qa-studio .qa-input-card, .qa-studio .qa-workbench-main > .qa-control-columns { margin: 0; }',
    '.qa-studio .qa-side { grid-column: 3; grid-row: 2;',
  ]) {
    assert.ok(runtime.includes(contract), `missing compact studio-column contract: ${contract}`);
  }
});

test('installed workbench exposes one persisted pin control per model card', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    "const pinnedModelPreferenceKey = 'pinned-model.v1';",
    'const modelOrder = Object.freeze(Object.keys(generators));',
    "let pinnedModel = '';",
    'function safePinnedModel(value)',
    'function syncPinnedModelCards()',
    '? [pinnedModel, ...modelOrder.filter((model) => model !== pinnedModel)]',
    'modelsNav.insertBefore(cell, elements.modelsEmpty);',
    'const pressed = model === pinnedModel;',
    "const label = `${pressed ? '取消置顶' : '置顶'} ${modelLabels[model] || model}`;",
    "button.setAttribute('aria-pressed', String(pressed));",
    "pinnedModel = pinnedModel === model ? '' : model;",
    'event.stopPropagation();',
    'togglePinnedModel(button.dataset.pinModel);',
    'writePreferenceWithFallback(pinnedModelPreferenceKey, preferenceValue)',
    'pinnedModel = safePinnedModel(await readPreferenceWithFallback(pinnedModelPreferenceKey));',
    'if (match) return `Pin ${match[1]}`;',
    'if (match) return `Unpin ${match[1]}`;',
    '.qa-model-pin[aria-pressed="true"]',
  ]) {
    assert.ok(runtime.includes(contract), `missing model pin contract: ${contract}`);
  }
  assert.match(runtime, /\.qa-model-pin, \.qa-model-delete\s*\{[^}]*display:\s*none;/);
  assert.match(
    runtime,
    /\.qa-model\[aria-pressed="true"\] \+ \.qa-model-pin\s*\{[^}]*display:\s*grid;/,
  );

  const modelCells = [...runtime.matchAll(/<div class="qa-model-cell" hidden>([\s\S]*?)<\/div>/g)];
  assert.equal(modelCells.length, 5);
  const pinnedCardModels = [];
  for (const [, cell] of modelCells) {
    const modelMatch = cell.match(
      /^\s*<button class="qa-model"[^>]*data-model="([^"]+)"[^>]*>[\s\S]*?<\/button>\s*<button class="qa-model-pin"[^>]*data-pin-model="\1"[^>]*aria-pressed="false"[^>]*aria-label="置顶 [^"]+"[^>]*title="置顶 [^"]+"[^>]*>[\s\S]*?<\/button>\s*$/,
    );
    assert.ok(modelMatch);
    pinnedCardModels.push(modelMatch[1]);
    assert.equal(cell.match(/<button\b/g)?.length, 3);
  }
  assert.deepEqual(pinnedCardModels, ['qwen3tts', 'voxcpm2', 'cosyvoice3', 'chattts', 'woosh']);
  assert.equal(runtime.match(/data-pin-model="/g)?.length, 7);
  assert.equal(runtime.match(/data-delete-model="/g)?.length, 7);

  for (const model of ['acestepXlTurbo', 'acestepXlSft']) {
    assert.match(runtime, new RegExp(`data-model="${model}"`));
    assert.match(runtime, new RegExp(`data-pin-model="${model}"`));
  }

  const visibilityFlow = runtime.slice(
    runtime.indexOf('function refreshModelVisibility(availability)'),
    runtime.indexOf('function refreshInstallOptions(availability)'),
  );
  assert.ok(
    visibilityFlow.indexOf('syncPinnedModelCards();') <
      visibilityFlow.indexOf('let firstInstalled'),
  );
  assert.ok(visibilityFlow.includes('cell.hidden = !selectable;'));
});

test('selected installed model exposes a guarded local-model delete control', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'class="qa-model-delete"',
    'id="qa-model-delete-dialog"',
    '只删除该模型的本机引擎文件，不删除历史音频、参考音频或工作台偏好。',
    'function syncModelDeleteButtons()',
    'cachedAvailability[model]?.installed === true',
    'function openModelDeleteDialog(model)',
    'async function deleteSelectedModel()',
    'let modelDeleteInProgress = false;',
    'if (modelDeleteInProgress) return;',
    'elements.closeModelDelete.disabled = true;',
    'elements.cancelModelDelete.disabled = true;',
    "typeof api.uninstallEngine !== 'function'",
    'await api.uninstallEngine(pending.generatorId)',
    'ACE-Step XL Turbo 与 SFT 共用同一个本机模型',
    'refreshInstallOptions(availability);',
  ]) {
    assert.ok(runtime.includes(contract), `missing model deletion contract: ${contract}`);
  }
  assert.match(runtime, /\.qa-model-delete\s*\{\s*right:\s*9px;/);
  assert.match(runtime, /\.qa-model-pin\s*\{\s*right:\s*9px;/);
  assert.match(
    runtime,
    /\.qa-model-cell\[data-delete-available="true"\] \.qa-model-pin\s*\{\s*right:\s*45px;/,
  );
  assert.match(
    runtime,
    /\.qa-model-cell \.qa-model\[aria-pressed="true"\]\s*\{\s*padding-right:\s*50px;/,
  );
  assert.match(
    runtime,
    /\.qa-model-cell\[data-delete-available="true"\] \.qa-model\[aria-pressed="true"\]\s*\{\s*padding-right:\s*86px;/,
  );
  assert.match(
    runtime,
    /\.qa-model\[aria-pressed="true"\] ~ \.qa-model-delete:not\(\[hidden\]\)\s*\{[^}]*display:\s*grid;/,
  );
});

test('ACE music variants share one installable local engine and real generation path', async () => {
  const { manifest, runtime } = await packageFiles(packageRoots[1]);
  assert.equal(manifest.contributes.audioGenerators.length, 6);
  assert.ok(
    manifest.contributes.audioGenerators.some(
      (item) => item.id === 'acestep-xl-local' && item.hostAdapter === 'acestepXl',
    ),
  );
  for (const contract of [
    "acestepXlTurbo: 'acestep-xl-local'",
    "acestepXlSft: 'acestep-xl-local'",
    'function isMusicModel(model)',
    'else if (isMusicModel(activeModel)) request = await aceRequest(text);',
    'async function aceRequest(text)',
    'aceVariant: variant',
    'if (!adapter || !isLocalModel(adapter)) return;',
    'ACE-Step 两个 XL 版本共用一次安装',
    'let modelSelectionSequence = 0;',
    'let modelPreferenceWrite = Promise.resolve();',
    'const selectionSequence = ++modelSelectionSequence;',
    'if (!isStudio || !isLocalModel(model)) return;',
    'api.listAudioHistory(historyGeneratorId)',
  ]) {
    assert.ok(runtime.includes(contract), `missing local ACE music contract: ${contract}`);
  }
  assert.doesNotMatch(
    runtime,
    /bundledMusicModels|本机不安装|当前界面尚未连接可验证的官方生成服务/,
  );
  assert.match(
    runtime,
    /selectionSequence !== modelSelectionSequence \|\| activeModel !== checkedModel/,
  );

  const detectionFlow = runtime.slice(
    runtime.indexOf('async function detectAvailability()'),
    runtime.indexOf('function installAdapterForGenerator'),
  );
  assert.match(detectionFlow, /Object\.entries\(generators\)/);
  assert.match(detectionFlow, /generatorId === item\.generatorId \|\| generatorId === item\.id/);
});

test('ACE-Step music interfaces expose official capability-shaped controls and English copy', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'id="qa-acestep-panel"',
    'data-ace-task="text"',
    'data-ace-task="cover"',
    'data-ace-task="repaint"',
    'data-music-tag="[Chorus]"',
    'id="qa-ace-duration" type="number" min="10" max="600"',
    'id="qa-ace-steps" type="number" value="8" disabled',
    'id="qa-ace-cfg-field" class="qa-field qa-hidden"',
    "elements.aceStepSteps.value = isSft ? '50' : '8';",
    "elements.aceStepCfgField.classList.toggle('qa-hidden', !isSft);",
    "'8 步快速音乐生成': 'Fast 8-step music generation'",
    "variant = activeModel === 'acestepXlSft'",
    'else if (isMusicModel(activeModel)) request = await aceRequest(text);',
    "audioFormat: 'wav'",
  ]) {
    assert.ok(runtime.includes(contract), `missing bundled music UI contract: ${contract}`);
  }
  const taskStart = runtime.indexOf(
    '<section class="qa-music-block" aria-labelledby="qa-acestep-task-title">',
  );
  const taskBlock = runtime.slice(taskStart, runtime.indexOf('</section>', taskStart));
  assert.match(
    taskBlock,
    /id="qa-ace-language"[\s\S]*id="qa-ace-reference-block"/,
    'the task-specific reference audio controls must sit below the creation task controls',
  );
  assert.doesNotMatch(
    runtime,
    /qa-interface-banner|qa-acestep-variant-note|本机运行 · 可一键安装|查看官方项目/,
  );
  assert.doesNotMatch(runtime, /suno/i);
  assert.doesNotMatch(runtime, /seed.?music/i);
  assert.match(
    runtime,
    /\.qa-music-reference \.qa-grid\s*\{\s*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\);/,
  );
});

test('current workbench binds asynchronous history actions to the selected local model', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'let pendingDeleteHistory = null;',
    'closeHistoryDeleteDialog();\n    closeModelDeleteDialog();\n    setWorkbenchVisible(true);',
    'model: activeModel,',
    'generatorId: generatorId(),',
    'async function deleteHistory(entry, entryModel, entryGeneratorId)',
    'const result = await api.deleteAudioHistory(entryGeneratorId, entry.id);',
    "if (result?.deleted !== true) throw new Error('历史音频删除失败。');",
    'selectionSequence !== modelSelectionSequence || activeModel !== entryModel',
    'activeModel !== pending.model || generatorId() !== pending.generatorId',
    'deleteHistory(entry, pending.model, pending.generatorId)',
  ]) {
    assert.ok(runtime.includes(contract), `missing model-bound history contract: ${contract}`);
  }
});

test('Sony Woosh exposes synchronized sampling controls and a strict text-to-sound request', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'data-model="woosh"',
    'data-pin-model="woosh"',
    "woosh: 'woosh-local'",
    'id="qa-woosh-panel"',
    'id="qa-woosh-cfg"',
    'id="qa-woosh-steps"',
    'id="qa-woosh-seed"',
    'id="qa-random-woosh-seed"',
    'data-woosh-steps="4" aria-pressed="true"',
    'data-woosh-steps="6" aria-pressed="false"',
    'data-woosh-steps="8" aria-pressed="false"',
    'function syncWooshStepButtons()',
    'const steps = String(elements.wooshSteps.value);',
    "button.setAttribute('aria-pressed', String(button.dataset.wooshSteps === steps));",
    "if (!['4', '6', '8'].includes(button.dataset.wooshSteps)) return;",
    'elements.wooshSteps.value = button.dataset.wooshSteps;',
    "elements.wooshSteps.addEventListener('input', syncWooshStepButtons);",
    "elements.wooshSteps.addEventListener('change', syncWooshStepButtons);",
    "elements.randomWooshSeed.addEventListener('click', () => {",
    'elements.wooshSeed.value = String(randomSeed());',
    "elements.wooshPanel.classList.toggle('qa-hidden', model !== 'woosh');",
    'elements.text.maxLength = isSoundEffect ? 1000 : isMusicInterface ? 4000 : 8000;',
    "else if (activeModel === 'woosh') request = await wooshRequest(text);",
    "generationModel === 'woosh'",
    "? '请输入英文音效描述。'",
    '? `正在请求本机 ${modelLabels[generationModel]} 文本生成音效；首次加载模型可能需要较长时间。`',
    "? '文本生成音效'",
    'const fallbackName =',
    "'单击展开完整音效描述；双击选择文字'",
    "return generating ? '正在生成音效…' : `使用 ${modelLabels[model]} 文本生成音效`;",
    "generationIsSoundEffect ? '音效生成完成' : generationIsMusic ? '音乐生成完成' : '生成完成'",
    "generationIsSoundEffect ? '音效' : generationIsMusic ? '音乐' : '语音'",
    "'请输入音效描述。': 'Enter a sound-effect description.'",
    "'正在生成音效…': 'Generating sound effect…'",
    "文本生成音效: 'Text-to-sound effects'",
    "'Sony Woosh 音效': 'Sony Woosh sound effect'",
    "'Click to expand the full sound-effect description; double-click to select text'",
    "'Detecting installed speech and sound-effects models…'",
    'const controlIsInterfaceText = isSoundEffect && !entry.control;',
    "${controlIsInterfaceText ? ' data-interface-text' : ''}",
    'if (match) return `Generate a sound effect with ${match[1]}`;',
    'return `Requesting local ${match[1]} text-to-sound-effect generation; initial model loading may take longer.`;',
    'return `${match[1]} sound effect generated${duration}; saved to ${destination} and ready to save as WAV.`;',
    "'Sony Woosh 采样步数预设': 'Sony Woosh sampling-step presets'",
    '英文音效描述',
    '当前公开权重使用英文文本条件器，请用英文描述单个音效场景',
    '英文示例：sportscar engine revving and driving away quickly',
    'function containsUnsupportedWooshCharacters(value)',
    'if (containsUnsupportedWooshCharacters(text))',
    'Sony Woosh 当前公开权重只可靠支持英文音效描述；请先改为英文再生成。',
    "elements.text.setAttribute('lang', 'en');",
  ]) {
    assert.ok(runtime.includes(contract), `missing Woosh workbench contract: ${contract}`);
  }

  const requestBlock = runtime.slice(
    runtime.indexOf('async function wooshRequest(text)'),
    runtime.indexOf('async function aceRequest(text)'),
  );
  assert.match(
    requestBlock,
    /return \{\s*mode: 'design',\s*text,\s*options: \{\s*seed: bounded\(elements\.wooshSeed, 0, 4294967295, '随机种子', true\),\s*wooshCfg: bounded\(elements\.wooshCfg, 0, 9, 'CFG'\),\s*wooshSteps: bounded\(elements\.wooshSteps, 4, 8, '迭代步数', true\),\s*\},\s*\};/,
  );
  assert.match(requestBlock, /if \(text\.length > 1000\)/);
  const guardSource = runtime.slice(
    runtime.indexOf('function containsUnsupportedWooshCharacters(value)'),
    runtime.indexOf('async function wooshRequest(text)'),
  );
  const containsUnsupportedWooshCharacters = Function(`return (${guardSource.trim()})`)();
  assert.equal(containsUnsupportedWooshCharacters('sportscar engine revving'), false);
  assert.equal(containsUnsupportedWooshCharacters('跑车发动机轰鸣'), true);
  assert.equal(containsUnsupportedWooshCharacters('車のエンジン音'), true);
  assert.equal(containsUnsupportedWooshCharacters('자동차 엔진 소리'), true);
  assert.doesNotMatch(
    requestBlock,
    /referenceAudio|promptText|control|speaker|language|temperature|topP|topK/,
  );

  const installFlow = runtime.slice(
    runtime.indexOf('function refreshInstallOptions(availability)'),
    runtime.indexOf('void (async () => {'),
  );
  assert.ok(installFlow.includes('for (const adapter of Object.keys(generators))'));
});

test('every bundled model keeps its interface visible before installation while generation stays disabled', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'return isLocalModel(model);',
    'const installableInterface = hasInstallableInterface(adapter);',
    'const selectable = installed || installableInterface;',
    'const isInstallationPreview =',
    'hasInstallableInterface(model) && !isModelInstalled(model);',
    'elements.generate.disabled = isInstallationPreview;',
    '${modelLabels[model]} 界面已内置；请先完成一键安装，再开始生成。',
    'if (cachedAvailability[generationModel]?.installed !== true) {',
    '请先完成 ${modelLabels[generationModel]} 的一键安装，再开始生成。',
  ]) {
    assert.ok(runtime.includes(contract), `missing uninstalled model UI contract: ${contract}`);
  }
  assert.match(runtime, /\.qa-status\[data-state="preview"\] \{[^}]*color: #fca5a5;/);
  assert.doesNotMatch(runtime, /<small|\.qa-model small|installState/);
  assert.doesNotMatch(runtime, /本机已安装/);
});

test('Qwen3-TTS and CosyVoice 3 expose only their official task surfaces', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'data-qwen-task="custom"',
    'data-qwen-task="design"',
    'data-qwen-task="clone"',
    'id="qa-qwen-language"',
    'id="qa-qwen-speaker"',
    'id="qa-qwen-reference"',
    'id="qa-qwen-tone"',
    'id="qa-qwen-emotion"',
    'id="qa-qwen-pace"',
    'id="qa-qwen-instruction-preview"',
    'id="qa-qwen-vector-only"',
    'id="qa-qwen-temperature"',
    'id="qa-qwen-top-p"',
    'id="qa-qwen-top-k"',
    'id="qa-qwen-repetition"',
    'function qwenControlInstruction()',
    'const control = qwenControlInstruction()',
    'qwenTemperature: bounded(elements.qwenTemperature, 0.1, 2',
    'qwenTopP: bounded(elements.qwenTopP, 0.1, 1',
    'qwenTopK: bounded(elements.qwenTopK, 1, 100',
    'qwenRepetitionPenalty: bounded(elements.qwenRepetition, 1, 2',
    'xVectorOnly: elements.qwenVectorOnly.checked',
    'async function qwenRequest(text)',
    'engineTask: qwenTask',
    'data-cosy-task="zeroShot"',
    'data-cosy-task="crossLingual"',
    'data-cosy-task="instruct"',
    'id="qa-cosy-rate"',
    'id="qa-cosy-language"',
    'id="qa-cosy-dialect"',
    'id="qa-cosy-emotion"',
    'id="qa-cosy-pace"',
    'id="qa-cosy-volume"',
    'id="qa-cosy-persona"',
    'id="qa-cosy-instruction-preview"',
    "['[breath]', '呼吸', '']",
    "['[quick_breath]', '快速吸气', '']",
    "['[laughter]', '笑声', '']",
    "['<strong>', '强调片段', '</strong>']",
    "['<laughter>', '笑声片段', '</laughter>']",
    "['[cough]', '咳嗽', '']",
    "['[sigh]', '叹气', '']",
    "['[lipsmack]', '咂嘴', '']",
    'function cosyControlInstruction()',
    'const control = cosyControlInstruction()',
    "insertCosyToken(button.dataset.cosyToken, button.dataset.cosyClose || '')",
    '报到[j][ǐ]予好评',
    'read [R][IY1][D]',
    'async function cosyRequest(text)',
    'engineTask: cosyTask',
    "speechRate: bounded(elements.cosyRate, 0.5, 2, '语速')",
    '三个官方 1.7B 权重均已离线安装',
    'Fun-CosyVoice3-0.5B-2512 模型采用 Apache 2.0',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('local reference audio selections are automatically persisted to the shared library', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    "if (label) label.textContent = '本地音频文件'",
    "选择文件: 'Choose file'",
    "未选择任何文件: 'No file chosen'",
    "fileControl.className = 'qa-file-control'",
    "filePicker.className = 'qa-file-picker'",
    "fileName.className = 'qa-file-name'",
    "input.classList.add('qa-file-input')",
    "input.addEventListener('change', () => syncReferenceFileControl(input))",
    'function syncReferenceFileControls()',
    "interfaceLocale === 'en-US' ? 'No file chosen' : '未选择任何文件'",
    'syncReferenceFileControl(referenceFileElement(model));',
    'data-reference-library-select="${model}"',
    'data-reference-library-preview="${model}"',
    'aria-label="试听参考音频">试听</button>',
    '.qa-reference-library-controls { display: grid; grid-template-columns: minmax(0,1fr) auto auto;',
    'async function toggleReferenceAudioPreview(model)',
    "async function loadReferenceLibrary(preserveId = '') {\n    stopReferenceAudioPreview();",
    'async function importSelectedReferenceAudio(model, file) {\n    stopReferenceAudioPreview();',
    "button.textContent = loading ? '正在加载…' : active ? '停止试听' : '试听';",
    "audio.addEventListener('ended', stopReferenceAudioPreview, { once: true });",
    'referencePreviewEntryId === entry.id',
    'stopReferenceAudioPreview();\n    const sequence = ++referencePreviewSequence;',
    "试听: 'Preview'",
    "停止试听: 'Stop preview'",
    "试听参考音频: 'Preview reference audio'",
    'function renderReferenceLibrarySelectors()',
    "select.addEventListener('change'",
    'selectedReferenceAudio[model] = entry',
    'const result = await api.readReferenceAudioLibrary(entry.id)',
    "...(referenceAudio && qwenTask === 'clone'",
    'async function importSelectedReferenceAudio(model, file)',
    'api.importReferenceAudioLibrary(',
    'api.createReferenceAudioCategory(category)',
    'id="qa-create-reference-library-category"',
    '已新增分类：${created}',
    'referenceAudioImportSequence[model] === sequence',
    '已将 ${entry.fileName || file.name} 加入参考音频库，可立即用于当前模型。',
    'id="qa-reference-library-transcript"',
    'class="qa-reference-library-layout"',
    'id="qa-reference-library-list"',
    "item.className = 'qa-library-entry'",
    "item.role = 'listitem'",
    "selectButton.className = 'qa-library-entry-select'",
    "previewButton.className = 'qa-library-preview-button'",
    'previewButton.dataset.referenceLibraryEntryPreview = entry.id',
    'id="qa-reference-library-selected-preview"',
    'async function toggleReferenceAudioEntryPreview(entry, reportInLibrary = false)',
    'function syncReferenceLibraryPreviewButtons()',
    "previewButton.addEventListener('click', (event) => {",
    "selectButton.addEventListener('click', () => {",
    'entry.avatarDataUrl',
    "音频库文件: 'Audio library files'",
    '保存名称、分类与转写',
    '.qa-library-edit > .qa-actions { justify-content: flex-end; }',
    "if (transcript) transcript.value = entry.transcript || ''",
    'api.renameReferenceAudioLibrary(id, name, category, transcript)',
    "'对应文字（参考音频准确转写）': 'Matching text (accurate reference transcript)'",
    'The accurate transcript was filled automatically.',
  ]) {
    assert.ok(
      runtime.includes(contract),
      `missing automatic reference library import: ${contract}`,
    );
  }
  assert.ok(!runtime.includes("label.textContent = '本地音频文件（"));
});

test('ACE-Step cover and repaint share the reference audio library with local upload', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    "['acestep', 'qa-ace-reference-file']",
    'acestep: null',
    'acestep: 0',
    "model === 'acestep'",
    "referenceAudioPayload('acestep', elements.aceStepReferenceFile)",
    "if (!referenceAudio) throw new Error('翻唱或局部重绘必须选择参考音频。')",
  ]) {
    assert.ok(
      runtime.includes(contract),
      `missing ACE-Step reference library contract: ${contract}`,
    );
  }
});

test('installed workbench gives ChatTTS, Qwen3-TTS, and CosyVoice 3 grouped rich emotion controls', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'const chatEmotionPresets',
    'const qwenEmotionInstructions',
    'const cosyEmotionInstructions',
    '...Object.entries(voxEmotionPresets).map(([id, preset]) => [',
    'id="qa-chat-clear-controls"',
    'class="qa-emotion-groups" role="group" aria-label="选择 ChatTTS 情绪表演"',
    '情绪表演（听感近似）',
    "const richEmotion = ['qa-qwen-emotion', 'qa-cosy-emotion'].includes(select.id)",
    "field?.classList.add('qa-rich-emotion-field')",
    "groups.className = 'qa-emotion-groups'",
    'preset.speed === speed',
    'elements.speed.value = String(preset.speed)',
    "button.dataset.emotion === (matchedEmotion?.[0] || '')",
    '情绪按钮会转成自然语言表演指令，实际效果随音色、正文与采样结果变化',
    '喜悦、悲伤和愤怒采用官方示例，其它情绪为扩展描述',
    '请至少选择一个控制项或填写自定义指令',
  ]) {
    assert.ok(runtime.includes(contract), `missing rich emotion control contract: ${contract}`);
  }
  const chatEmotionBlock = runtime.slice(
    runtime.indexOf('const chatEmotionPresets'),
    runtime.indexOf('const chatPolyphones'),
  );
  assert.equal(chatEmotionBlock.match(/speed:/g)?.length, 24);
  assert.equal(
    new Set([...chatEmotionBlock.matchAll(/label: '([^']+)'/g)].map((match) => match[1])).size,
    24,
  );
  assert.ok(!runtime.includes('请至少选择一个官方指令或填写自定义指令'));
});

test('installed workbench places each supported model text-tag palette directly below target text', async () => {
  const { runtime } = await packageFiles(packageRoots[1]);
  for (const contract of [
    'function mountTextTokenTools()',
    "const inputCard = root.querySelector('.qa-input-card');",
    "tokenDock.id = 'qa-text-token-dock';",
    "tokenDock.setAttribute('aria-label', '正文快捷标签');",
    "appendTokenPanel('voxcpm2', voxTokenTools?.closest('details'));",
    "chatPanel.dataset.textTokenModel = 'chattts';",
    "appendTokenPanel('cosyvoice3', cosyTokenTools?.closest('details'));",
    "const textArea = inputCard.querySelector('#qa-text');",
    'if (tokenDock.childElementCount && textArea) textArea.after(tokenDock);',
    'function syncTextTokenPanel(model)',
    "for (const panel of elements.textTokenDock?.querySelectorAll('[data-text-token-model]') || [])",
    "elements.textTokenDock?.classList.toggle('qa-hidden', !hasVisiblePanel);",
    'syncTextTokenPanel(model);',
    '.qa-text-token-dock { margin-top: 12px;',
    '.qa-text-token-panel > .qa-advanced { margin: 0; }',
  ]) {
    assert.ok(runtime.includes(contract), `missing target-text tag palette contract: ${contract}`);
  }
  assert.equal(runtime.match(/data-chat-token="\[laugh\]"/g)?.length, 1);
  assert.equal(runtime.match(/data-vox-token="\$\{tag\}"/g)?.length, 1);
  assert.equal(runtime.match(/data-cosy-token="\$\{open\}"/g)?.length, 1);
  assert.ok(!runtime.includes('chatTonePanel.append(chatTokenHeading, chatTokenTools)'));
});

test('Qwen3-TTS and CosyVoice workers receive the official controls used by the workbench', async () => {
  const [qwenWorker, cosySource] = await Promise.all([
    readFile('data/plugins/qiansi-audio/engines/qwen3tts/service/worker.py', 'utf8'),
    readFile(
      'data/plugins/qiansi-audio/engines/cosyvoice3/runtime/app/CosyVoice/cosyvoice/utils/common.py',
      'utf8',
    ),
  ]);
  for (const contract of [
    '"qwenTemperature"',
    '"qwenTopP"',
    '"qwenTopK"',
    '"qwenRepetitionPenalty"',
    '"xVectorOnly"',
    '"temperature": request["temperature"]',
    '"top_p": request["topP"]',
    '"top_k": request["topK"]',
    '"repetition_penalty": request["repetitionPenalty"]',
    'x_vector_only_mode=request["xVectorOnly"]',
    '**generation_kwargs',
  ]) {
    assert.ok(qwenWorker.includes(contract), `Qwen worker must include ${contract}`);
  }
  for (const officialInstruction of [
    '请用广东话表达。',
    '请非常开心地说一句话。',
    '请用尽可能快地语速说一句话。',
    'Please say a sentence as loudly as possible.',
    '你可以尝试用机器人的方式解答吗？',
  ]) {
    assert.ok(cosySource.includes(officialInstruction));
  }
});

test('unified workbench retains voices, asset output and safe history actions', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'id="qa-voice"',
    'id="qa-manage-voices"',
    'data-voice-action="edit"',
    'data-voice-action="delete"',
    'readPreferenceWithFallback(voicePresetPreferenceKey)',
    'writePreferenceWithFallback(voicePresetPreferenceKey, customVoices)',
    '温柔女声',
    '磁性男声',
    'data-history-action="play"',
    'data-history-action="download"',
    'id="qa-save-output"',
    'data-history-action="repeat"',
    'data-history-action="delete"',
    'listAudioHistory(generatorId())',
    'readAudioHistory(generatorId(), entry.id)',
    'downloadAudioHistory(generatorId(), entry.id)',
    'async function saveLatestOutput()',
    'latestOutput.generatorId',
    'latestOutput.historyId',
    "elements.saveOutput.addEventListener('click'",
    'deleteAudioHistory(entryGeneratorId, entry.id)',
    'installOutput(result)',
    'const generatedHistory = history',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const fallbackContract of [
    "const LOCAL_PREF_PREFIX = 'qiansi-audio.pref.'",
    'window.localStorage.getItem(LOCAL_PREF_PREFIX + key)',
    'window.localStorage.setItem(LOCAL_PREF_PREFIX + key, JSON.stringify(value))',
  ]) {
    assert.ok(runtime.includes(fallbackContract));
  }
});

test('history cards contain long prompts without widening the workbench', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    '.qa-history-item { min-width: 0; overflow: hidden;',
    'grid-template-columns: repeat(4,minmax(0,1fr))',
    '.qa-history-audio { width: 100%; min-width: 0; max-width: 100%;',
    'data-history-action="toggle-text"',
    'role="button" tabindex="0"',
    'data-expanded="false" data-selecting="false" aria-expanded="false"',
    "button.dataset.historyAction === 'toggle-text'",
    'function setHistoryTextExpanded',
    'function setHistoryTextSelectionMode',
    "elements.historyList.addEventListener('dblclick'",
    "elements.historyList.addEventListener('keydown'",
    "elements.historyList.addEventListener('focusout'",
    '拖动选择文字；按 Esc 退出选择状态',
    '.qa-history-text[data-selecting="true"]',
    'user-select: text',
    '<div class="qa-side qa-hidden">',
    '.qa-studio .qa-side { grid-column: 3; grid-row: 2 / span 2; display: flex;',
    'flex-direction: column; align-self: stretch; gap: 12px;',
    '.qa-studio .qa-result-card, .qa-studio .qa-history-card { min-width: 0; margin: 0;',
    '.qa-studio .qa-history-card { flex: 1 1 auto; min-height: 280px;',
    'overflow-x: hidden; overflow-y: auto;',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(runtime, /\.qa-history-text \{[^}]*white-space: nowrap/);
});

test('history audio can be deleted after explicit in-workbench confirmation', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'async function deleteHistory(entry)',
    'id="qa-history-delete-dialog"',
    'id="qa-confirm-history-delete"',
    'function openHistoryDeleteDialog(entry)',
    'function closeHistoryDeleteDialog()',
    '确定从当前工作台历史中删除',
    '独立音频库中的 WAV 也会永久删除',
    '素材库中的正式音频会保留',
    'const entryGeneratorId = generatorId()',
    'await api.deleteAudioHistory(entryGeneratorId, entry.id)',
    'historyUrls.delete(key)',
    'historyEntries = historyEntries.filter((item) => item.id !== entry.id)',
    "button.dataset.historyAction === 'delete') openHistoryDeleteDialog(entry)",
    'qa-button qa-danger',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const historyDeleteFlow = runtime.slice(
    runtime.indexOf('function openHistoryDeleteDialog(entry)'),
    runtime.indexOf('async function repeatHistory(entry)'),
  );
  assert.doesNotMatch(historyDeleteFlow, /\bconfirm\s*\(/);
  assert.doesNotMatch(runtime, /history\s*\|\|\s*historyEntries\[0\]/);
});

test('workbench typography remains readable in the fullscreen layout', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  assert.match(runtime, /body \{[^}]*font-size: 14px;/);
  assert.match(runtime, /\.qa-button \{[^}]*min-height: 40px;[^}]*font-size: 13px;/);
  assert.match(
    runtime,
    /textarea, input\[type="text"\], input\[type="number"\], select \{[^}]*min-height: 40px;[^}]*font-size: 13px;/,
  );
  assert.doesNotMatch(runtime, /font-size:\s*(?:8|9|10)px/);
});

test('panel-only workbench has no plugin node surface or connected-node controls', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const removedContract of [
    'qa-sync',
    '读取连线文本',
    'readOwnInputs',
    '写入原生音频节点',
    '连接一个有内容的文本节点',
  ]) {
    assert.ok(
      !runtime.includes(removedContract),
      `${removedContract} must stay out of the workbench`,
    );
  }
  assert.ok(runtime.includes("isStandalone ? '已保存到独立音频库' : '已保存到素材库'"));
});

test('custom voice categories use the plugin dark listbox instead of the native popup', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'id="qa-voice-trigger"',
    'aria-haspopup="listbox"',
    'id="qa-voice-menu"',
    'role="listbox"',
    'class="qa-voice-menu-group"',
    '我的声色分类',
    'data-voice-option=',
    '.qa-voice-trigger {',
    'background: #0f0f10',
    '.qa-voice-menu {',
    'background: #18181b',
    '.qa-voice-option[aria-selected="true"]',
    'background: #14532d',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(runtime, /elements\.voiceTrigger\.addEventListener\('keydown'/);
  assert.match(runtime, /elements\.voiceMenu\.addEventListener\('keydown'/);
});

test('ChatTTS exposes official tone presets, speed control and prompt preview', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'const tonePresets',
    "label: '自然'",
    "label: '沉稳'",
    "label: '亲切'",
    "label: '活泼'",
    "label: '轻松'",
    "label: '利落'",
    'role="group" aria-label="选择语气预设"',
    'id="qa-speed" type="range"',
    'id="qa-prosody-preview"',
    'class="qa-chat-prosody-controls"',
    'class="qa-grid qa-chat-prosody-levels"',
    '#qa-chat-prompt-controls .qa-chat-prosody-controls { display: grid; grid-template-columns: repeat(6,minmax(0,1fr));',
    '#qa-chat-prompt-controls .qa-chat-prosody-controls > .qa-speed-control { display: flex; grid-column: span 3;',
    '#qa-chat-prompt-controls .qa-chat-prosody-levels { display: contents;',
    '#qa-chat-prompt-controls .qa-prosody-preview { width: fit-content;',
    'function applyTonePreset',
    'function updateProsodyUi',
    '[speed_${speed}]',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(runtime, /speed: bounded\(elements\.speed, 0, 9, '语速', true\)/);
  assert.match(runtime, /oral: bounded\(elements\.oral, 0, 9, '口语化', true\)/);
  assert.match(runtime, /laugh: bounded\(elements\.laugh, 0, 2, '笑声', true\)/);
  assert.match(runtime, /breakLevel: bounded\(elements\.breakLevel, 0, 7, '停顿', true\)/);
});

test('VoxCPM2 maps convenience controls to official instructions and nonverbal tags', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'const voxTonePresets',
    'const voxEmotionPresets',
    "instruction: '自然、真实、语气平和'",
    "instruction: '沉稳、克制、节奏从容'",
    "instruction: '亲切、温暖、带有交流感'",
    "instruction: '活泼、明亮、富有感染力'",
    "instruction: '轻松、松弛、呼吸自然'",
    "instruction: '利落、清晰、表达干脆'",
    "label: '喜悦', instruction: '情绪喜悦，声音带有自然笑意，表达明快'",
    "label: '悲伤', instruction: '情绪悲伤而克制，声音低落，句尾略带哽咽'",
    "label: '愤怒', instruction: '情绪愤怒但保持克制，重音明确，语气有力量'",
    "label: '紧张', instruction: '情绪紧张不安，呼吸略急，表达谨慎'",
    "label: '恐惧', instruction: '情绪害怕，声音轻微颤抖，语气不安'",
    "label: '惊讶', instruction: '情绪惊讶，语调明显上扬，反应鲜明'",
    "label: '感动', instruction: '情绪真挚感动，声音温暖，略带哽咽'",
    "label: '期待', instruction: '情绪充满期待，语气明亮，带有好奇与希望'",
    "label: '兴奋', instruction: '情绪兴奋热烈，能量充沛，节奏明快'",
    "label: '焦虑', instruction: '情绪焦虑不安，呼吸略乱，语气急促而犹疑'",
    "label: '绝望', instruction: '情绪绝望无力，声音低沉空洞，表达逐渐失去力量'",
    "label: '委屈', instruction: '情绪委屈压抑，声音柔弱，像在忍住眼泪'",
    "label: '内疚', instruction: '情绪内疚自责，语气迟疑，声音低而克制'",
    "label: '嫉妒', instruction: '情绪嫉妒不甘，语气酸涩克制，重音带刺'",
    "label: '自信', instruction: '情绪自信坚定，声音稳定有力，表达从容'",
    "label: '害羞', instruction: '情绪害羞拘谨，声音轻柔，表达略带犹豫'",
    "label: '冷漠', instruction: '情绪冷漠疏离，表达收敛，声音平直克制'",
    "label: '怀疑', instruction: '情绪怀疑戒备，语气试探，关键词带有审视感'",
    "label: '神秘', instruction: '情绪神秘含蓄，声音压低，节奏留有悬念'",
    "label: '疯狂', instruction: '情绪疯狂失控，情绪高涨且不稳定，强弱变化明显'",
    "label: '疲惫', instruction: '情绪疲惫虚弱，气息沉重，语速偏慢'",
    "label: '庄严', instruction: '情绪庄严肃穆，声音稳重，节奏缓慢而有仪式感'",
    "label: '嘲讽', instruction: '情绪嘲讽轻蔑，语气带刺，重音刻意'",
    "label: '哀求', instruction: '情绪急切哀求，声音脆弱而真诚'",
    'const voxEmotionGroups',
    "label: '常用情绪'",
    "label: '人物内心'",
    "label: '戏剧表演'",
    'aria-label="选择 VoxCPM2 语气预设"',
    'aria-label="选择 VoxCPM2 情绪表演"',
    'data-vox-emotion=""',
    'id="qa-vox-emotion-summary"',
    'id="qa-vox-speed" data-vox-control type="range"',
    'id="qa-vox-oral" data-vox-control type="range"',
    'id="qa-vox-control-preview"',
    'function voxControlInstruction',
    'function applyVoxEmotionPreset',
    'const control = voxControlInstruction()',
    'control,',
    '极致克隆模式：不提交 Control Instruction',
    "['[laughing]', '笑声']",
    "['[sigh]', '叹气']",
    "['[Uhm]', '思考停顿']",
    "['[Shh]', '轻声示意']",
    "['[Question-ah]', '疑问 啊']",
    "['[Surprise-wa]', '惊讶 哇']",
    "['[Dissatisfaction-hnn]', '不满 哼']",
    'data-vox-token="${tag}"',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(runtime, /voxSpeedInstructions\[speed\]/);
  assert.match(runtime, /voxOralInstructions\[oral\]/);
  assert.match(runtime, /voxEmotionPresets\[activeVoxEmotion\]/);
  assert.match(runtime, /activeVoxEmotion = '';/);
  const emotionBlock = runtime.slice(
    runtime.indexOf('const voxEmotionPresets'),
    runtime.indexOf('const voxEmotionGroups'),
  );
  assert.equal(emotionBlock.match(/instruction:/g)?.length, 24);
  assert.match(
    runtime,
    /\.qa-prompt-controls \.qa-emotion-groups \{ grid-template-columns: repeat\(3/,
  );
  assert.match(
    runtime,
    /\.qa-prompt-controls \.qa-emotion-presets \{ grid-template-columns: repeat\(2/,
  );
  assert.match(runtime, /\.qa-prompt-controls \.qa-emotion-none \{ width: auto; min-height: 26px;/);
  assert.match(
    runtime,
    /<span id="qa-vox-emotion-summary" class="qa-tone-summary">不附加<\/span> · <button class="qa-tone-preset qa-emotion-none"/,
  );
  assert.match(
    runtime,
    /\.qa-prompt-controls \.qa-tone-presets \{ grid-template-columns: repeat\(6/,
  );
  assert.match(runtime, /\.qa-prompt-controls \.qa-tone-preset \{ min-height: 30px/);
  assert.match(runtime, /@media \(max-width: 900px\)/);
  assert.match(runtime, /@media \(max-width: 520px\)/);
  assert.match(runtime, /@container \(max-width: 360px\)/);
  assert.match(runtime, /control\.length > 600/);
  assert.doesNotMatch(runtime, /data-vox-token="\[break_/);
  assert.doesNotMatch(runtime, /data-vox-token="\[speed_/);
});

test('VoxCPM2 groups the wide parameter surface into a responsive two-row layout', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'class="qa-vox-layout"',
    'id="qa-vox-source-title"',
    '声音与模式',
    'id="qa-vox-performance-title"',
    '表演与韵律',
    'class="qa-vox-block qa-vox-block-wide"',
    'id="qa-vox-engine-title"',
    '生成参数',
    'grid-template-columns: repeat(2,minmax(0,1fr))',
    '.qa-vox-block-wide { grid-column: 1 / -1; }',
    '@container (max-width: 720px)',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('ChatTTS exposes the remaining supported official WebUI controls without a second service', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'data-chat-mode="design"',
    'data-chat-mode="clone"',
    'id="qa-chat-file"',
    'id="qa-chat-prompt"',
    'id="qa-chat-consent"',
    'const chatTimbres',
    'const chatSpeakerPresets',
    'id="qa-chat-speaker"',
    'speakerPreset: elements.chatSpeaker.value',
    'data-chat-seed=',
    'id="qa-random-chat-seed"',
    'id="qa-random-text-seed"',
    'id="qa-homophone"',
    'id="qa-autoplay"',
    'data-chat-token="[laugh]"',
    'data-chat-token="[uv_break]"',
    'data-chat-token="[lbreak]"',
    'function insertChatToken',
    'homophoneReplacement: elements.homophone.checked',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(runtime, /server_port|localhost:8080|stream_mode/);
});

test('ChatTTS uses a responsive two-row surface and exposes every bundled 768-dimensional voice', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'class="qa-chat-layout"',
    'id="qa-chat-source-title"',
    '声音与采样',
    'id="qa-chat-performance-title"',
    '表演与韵律',
    'class="qa-advanced qa-chat-block-wide"',
    '.qa-chat-block-wide { grid-column: 1 / -1; }',
    '.qa-chat-seed-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr))',
    '固定 768 维音色',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const speakerFiles = (await readdir('data/plugins/qiansi-audio/speaker'))
    .filter((fileName) => fileName.endsWith('.csv'))
    .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  assert.equal(speakerFiles.length, 24);
  for (const fileName of speakerFiles) {
    const values = (await readFile(`data/plugins/qiansi-audio/speaker/${fileName}`, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map(Number);
    assert.equal(values.length, 768, `${fileName} must contain 768 values`);
    assert.ok(values.every(Number.isFinite), `${fileName} must contain only finite values`);
    assert.ok(runtime.includes(`'${fileName}'`), `${fileName} must be exposed in the workbench`);
  }
});

test('active-model expression controls and model parameters share a responsive two-column row', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'function mountPromptControls()',
    "const modelCard = root.querySelector('.qa-model-card');",
    'function configurePromptControls(section, id)',
    'section.id = id;',
    "'qa-instruction-controls',",
    "section.classList.add('qa-prompt-controls', 'qa-card', 'qa-expression-card', 'qa-hidden');",
    "configurePromptControls(voxPromptControls, 'qa-vox-prompt-controls');",
    "configurePromptControls(chatPromptControls, 'qa-chat-prompt-controls');",
    "configurePromptControls(qwenPromptControls, 'qa-qwen-prompt-controls');",
    "configurePromptControls(cosyPromptControls, 'qa-cosy-prompt-controls');",
    "voxPromptControls.querySelector('.qa-subsection-title').textContent = '语气与情绪控制';",
    "chatPromptControls.querySelector('.qa-subsection-title').textContent = '语气与韵律控制';",
    "controlColumns.className = 'qa-control-columns qa-hidden';",
    'modelCard.before(controlColumns);',
    'controlColumns.append(',
    'qwenPromptControls,',
    'cosyPromptControls,',
    '.qa-control-columns { display: flex; flex-wrap: wrap; align-items: stretch; gap: 16px; margin-top: 12px; }',
    '.qa-control-columns > .qa-card { flex: 1 1 520px; min-width: 0; margin: 0; }',
    '.qa-studio > .qa-control-columns { grid-column: 2; grid-row: 3; margin: 0; }',
    "chatTokenHeading.textContent = '正文快捷标签';",
    'chatTonePanel.append(chatTokenHeading, chatTokenTools);',
    "elements.voxPromptControls.classList.toggle('qa-hidden', model !== 'voxcpm2');",
    "elements.chatPromptControls.classList.toggle('qa-hidden', model !== 'chattts');",
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('ChatTTS fixed voices use editable persisted names while retaining stable CSV identities', async () => {
  const { runtime } = await packageFiles(packageRoots[0]);
  for (const contract of [
    'const defaultChatSpeakerAliases',
    "'5.csv': '晨曦'",
    "'9999.csv': '冬青'",
    "const chatSpeakerAliasPreferenceKey = 'chat-speaker-aliases.v1'",
    'id="qa-manage-chat-speakers"',
    'ChatTTS 固定声线名称',
    'id="qa-save-chat-speaker-name"',
    'id="qa-reset-chat-speaker-name"',
    'function safeChatSpeakerAliases',
    'function renderChatSpeakerOptions',
    'function persistChatSpeakerAliases',
    'await writePreferenceWithFallback(chatSpeakerAliasPreferenceKey, chatSpeakerAliases)',
  ]) {
    assert.match(runtime, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(runtime, />声线 \$\{fileName\.replace/);
});
