import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { parsePluginAudioGeneratorContribution } from './plugin-audio-proxy.mjs';

const pluginRoot = new URL('./data/plugins/doubao-seed-audio/', import.meta.url);

async function source(name) {
  return readFile(new URL(name, pluginRoot), 'utf8');
}

function extractTemplates(runtime) {
  const start = runtime.indexOf('  const templates = Object.freeze([');
  const end = runtime.indexOf('\n\n  const escapeHtml', start);
  assert.ok(start >= 0 && end > start, 'template definition should be extractable');
  const statement = runtime
    .slice(start, end)
    .replace('const templates =', 'globalThis.templates =');
  const context = {};
  runInNewContext(statement, context);
  return Array.from(context.templates);
}

function extractTemplateStyleSkillAssets(runtime) {
  const start = runtime.indexOf('  const TEMPLATE_STYLE_SKILL_ASSETS = Object.freeze([');
  const end = runtime.indexOf('\n\n  const templates', start);
  assert.ok(start >= 0 && end > start, 'template style skill assets should be extractable');
  const statement = runtime
    .slice(start, end)
    .replace('const TEMPLATE_STYLE_SKILL_ASSETS =', 'globalThis.assets =');
  const context = {};
  runInNewContext(statement, context);
  return Array.from(context.assets);
}

function extractRuntimeFunction(runtime, startMarker, endMarker) {
  const start = runtime.indexOf(startMarker);
  const end = runtime.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${startMarker} should be extractable`);
  return runtime.slice(start, end);
}

test('Qainsi Seed Audio is a new independent enabled fullscreen plugin', async () => {
  const [manifestSource, pluginStateSource, originalManifestSource, originalRuntime] =
    await Promise.all([
      source('plugin.json'),
      readFile(new URL('./data/plugin-state.json', import.meta.url), 'utf8'),
      readFile(new URL('./data/plugins/qiansi-audio/plugin.json', import.meta.url), 'utf8'),
      readFile(new URL('./data/plugins/qiansi-audio/runtime.js', import.meta.url), 'utf8'),
    ]);
  const manifest = JSON.parse(manifestSource);
  const pluginState = JSON.parse(pluginStateSource);
  const originalManifest = JSON.parse(originalManifestSource);
  assert.equal(manifest.id, 'doubao-seed-audio');
  assert.equal(manifest.name, 'Qainsi Seed Audio Studio');
  assert.equal(manifest.version, '1.16.1');
  assert.equal(manifest.engine.qiansiCanvas, '>=1.63.0');
  assert.equal(manifest.contributes.panels[0].label, 'Qainsi Seed Audio Studio');
  assert.equal(manifest.contributes.menus[0].label, '打开 Qainsi Seed Audio Studio');
  assert.equal(pluginState.enabled['doubao-seed-audio'], true);
  assert.equal(manifest.contributes.panels[0].position, 'fullscreen');
  assert.equal(manifest.contributes.panels[0].hostChrome, 'integrated');
  assert.ok(manifest.permissions.includes('assets:read'));
  assert.ok(manifest.permissions.includes('models:use-text'));
  assert.ok(manifest.permissions.includes('storage:shared-style-covers'));
  assert.equal(manifest.assets.length, 89);
  assert.equal(manifest.contributes.audioGenerators.length, 1);
  assert.deepEqual(parsePluginAudioGeneratorContribution(manifest.contributes.audioGenerators[0]), {
    id: 'doubao-seed-audio-cloud',
    label: 'Doubao Seed Audio 1.0',
    protocol: 'qiansi-audio-v1',
    endpoint: 'http://127.0.0.1:18961/generate',
    healthEndpoint: 'http://127.0.0.1:18961/health',
    canvasOutput: 'audio-node',
    timeoutMs: 600000,
    maxBytes: 268435456,
  });
  assert.equal(originalManifest.version, '1.13.3');
  assert.doesNotMatch(originalRuntime, /qa-ark-like|studioTemplates|做同款/);
});

test('right-side EN control loads a complete plugin-local English interface pack', async () => {
  const [runtime, manifestSource, languagePackSource] = await Promise.all([
    source('runtime.js'),
    source('plugin.json'),
    source('ui-en-US.json'),
  ]);
  const manifest = JSON.parse(manifestSource);
  const languagePack = JSON.parse(languagePackSource);
  const templates = extractTemplates(runtime);

  assert.ok(manifest.assets.includes('ui-en-US.json'));
  assert.equal(languagePack.locale, 'en-US');
  assert.equal(languagePack.name, 'Qainsi Seed Audio Studio English UI');
  assert.ok(Object.keys(languagePack.messages).length >= 190);
  for (const sourceText of [
    '首页',
    '体验',
    '文本生成',
    '参考生成',
    '时间控制',
    '多语言',
    '音频脚本',
    '命令',
    '选择画布 AI 模型',
    '指令润色',
    '语调',
    '语速',
    '音量',
    '全部清空',
    '生成',
    '模板',
    '历史',
    '做同款',
    '播放',
    '下载',
    '＋ 模板',
    '新建自定义模板',
    '润色 Skill',
    '默认提示词',
  ]) {
    assert.equal(typeof languagePack.messages[sourceText], 'string', sourceText);
    assert.ok(languagePack.messages[sourceText].trim(), sourceText);
  }
  for (const template of templates) {
    assert.equal(typeof languagePack.messages[template.title], 'string', template.title);
    if (template.description)
      assert.equal(
        typeof languagePack.messages[template.description],
        'string',
        template.description,
      );
  }
  for (const contract of [
    "const INTERFACE_LANGUAGE_ASSET = 'ui-en-US.json'",
    "api.context.locale === 'en-US'",
    "addEventListener('qiansi:languagechange'",
    'applyInterfaceLocale(event.detail?.locale)',
    'await api.readAsset(INTERFACE_LANGUAGE_ASSET)',
    'interfaceObserver.observe(root',
    "'placeholder', 'data-placeholder', 'title', 'aria-label'",
    "'.sa-editor, .sa-program-script, .sa-history-item > strong, .sa-history-item > p",
    '<option value="自动">自动</option>',
  ]) {
    assert.ok(runtime.includes(contract), `missing English interface contract: ${contract}`);
  }
});

test('Seed Audio runtime exposes the reference workflow and real playback controls', async () => {
  const runtime = await source('runtime.js');
  const templates = extractTemplates(runtime);
  for (const contract of [
    "api.context?.view !== 'doubao-seed-audio-studio'",
    'Qainsi Seed Audio Studio',
    'data-category-filter="text"',
    'data-category-filter="reference"',
    'data-category-filter="timing"',
    'data-category-filter="multilingual"',
    'data-template-play',
    'data-template-same',
    '做同款',
    'async function playTemplatePreview(index)',
    'async function loadTemplatePreview(template)',
    'api.readAsset(name)',
    "new Blob(chunks, { type: 'audio/wav' })",
    'id="sa-audio"',
    'id="sa-reference-add"',
    'id="sa-reference-list"',
    'multiple />',
    "function addReferenceFiles(fileList, source = 'user')",
    'if (!editorValue().includes(token)) insertReferenceMention(referenceIndex);',
    'const EDITOR_MAX_CHARACTERS = 3000;',
    'template.characterCount - template.text.length',
    '0 / 3000',
    'async function referenceAudios(text)',
    '@参考录音${index + 1}',
    'data-reference-play',
    'data-reference-remove',
    "mode: references ? 'clone' : 'design'",
    'referenceAudios: references',
    'durationSeconds',
    'audioFormat',
    'api.generateAudio(GENERATOR_ID',
    'api.listAudioHistory(GENERATOR_ID)',
    'api.readAudioHistory(GENERATOR_ID, id)',
    'api.downloadAudioHistory(GENERATOR_ID, id)',
    'URL.createObjectURL(blob)',
  ]) {
    assert.ok(runtime.includes(contract), `missing runtime contract: ${contract}`);
  }
  assert.equal(templates.length, 36);
  assert.ok(templates.every((template) => Array.isArray(template.previewAssets)));
  assert.doesNotMatch(runtime, /16000/);
  assert.doesNotMatch(runtime, /speechSynthesis/);
  assert.doesNotMatch(runtime, /YOUR_API_KEY|api_key\s*[:=]\s*['"][^'"]+/i);
});

test('program production mode segments long scripts, runs a bounded queue and exports locally', async () => {
  const [runtime, manifestSource, languagePackSource] = await Promise.all([
    source('runtime.js'),
    source('plugin.json'),
    source('ui-en-US.json'),
  ]);
  const manifest = JSON.parse(manifestSource);
  const languagePack = JSON.parse(languagePackSource);

  assert.equal(manifest.version, '1.16.1');
  for (const contract of [
    'data-open-program',
    'id="sa-program-panel"',
    'id="sa-program-segment"',
    'id="sa-program-queue"',
    'id="sa-program-pause"',
    'id="sa-program-merge"',
    'id="sa-program-vtt"',
    'id="sa-program-metadata"',
    'function createProgramSegments(source, targetSeconds, proposedGroups = null)',
    'function validateProgramGroups(groups, unitCount)',
    "operation: 'seed_audio_program_segment'",
    'await api.runManagedTextModel({',
    'for (let index = 0; index < programSegments.length; index += 1)',
    'await generateProgramTake(index, preparedReferences)',
    'const PROGRAM_MAX_TAKES = 3;',
    'function mergeProgramAudio()',
    'new AudioContextClass()',
    "new Blob([view.buffer], { type: 'audio/wav' })",
    'function downloadProgramVtt()',
    'function downloadProgramMetadata()',
  ]) {
    assert.ok(runtime.includes(contract), `missing program-production contract: ${contract}`);
  }
  assert.doesNotMatch(runtime, /while\s*\([^)]*retry|autoRetry|自动重试/);

  for (const label of [
    '节目工程',
    'AI 智能分段',
    '开始批量生成',
    '暂停队列',
    '合并 WAV',
    '段落级 VTT',
    '工程记录',
    '再生成版本',
  ]) {
    assert.equal(typeof languagePack.messages[label], 'string', label);
    assert.ok(languagePack.messages[label].trim(), label);
  }

  const helperSource = extractRuntimeFunction(
    runtime,
    '  function programSpokenCharacterCount',
    '\n\n  function buildProgramSegmentationPrompt',
  );
  const context = {};
  runInNewContext(
    `const PROGRAM_MAX_SEGMENTS = 24;\nconst EDITOR_MAX_CHARACTERS = 3000;\n${helperSource}\nglobalThis.createProgramSegments = createProgramSegments;\nglobalThis.validateProgramGroups = validateProgramGroups;`,
    context,
  );
  const script = `主播 是青年女性，普通话，声音自然清晰\n\n背景音乐轻柔铺底，环境安静。\n\n主播自然地说道：“第一段介绍今天的问题。”\n主播稍作停顿后说道：“第二段给出可执行的方法。”`;
  const segments = Array.from(context.createProgramSegments(script, 45, [[1], [2]]));
  assert.equal(segments.length, 2);
  assert.ok(segments.every((segment) => segment.text.startsWith('主播 是青年女性')));
  assert.ok(segments.every((segment) => segment.text.includes('背景音乐轻柔铺底')));
  assert.equal(segments.filter((segment) => segment.text.includes('第一段介绍')).length, 1);
  assert.equal(segments.filter((segment) => segment.text.includes('第二段给出')).length, 1);
  assert.throws(() => context.validateProgramGroups([[1, 3], [2]], 3));

  const audioHelperSource = extractRuntimeFunction(
    runtime,
    '  function programTrimBounds',
    '\n\n  async function mergeProgramAudio',
  );
  const audioContext = { Blob };
  runInNewContext(
    `const PROGRAM_MAX_EDGE_TRIM_SECONDS = 0.8;\n${audioHelperSource}\nglobalThis.programTrimBounds = programTrimBounds;\nglobalThis.resampleProgramBuffer = resampleProgramBuffer;\nglobalThis.createProgramWavBlob = createProgramWavBlob;`,
    audioContext,
  );
  const mockAudioBuffer = {
    length: 6,
    sampleRate: 4,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array([0, 0, 0.5, -1, 0, 0]),
  };
  const trimBounds = audioContext.programTrimBounds(mockAudioBuffer, true);
  assert.equal(trimBounds.start, 2);
  assert.equal(trimBounds.end, 4);
  const normalized = audioContext.resampleProgramBuffer(mockAudioBuffer, 4, 1, true, true);
  assert.equal(normalized.length, 1);
  assert.ok(Math.abs(normalized[0][0] - 0.4455) < 0.0001);
  assert.ok(Math.abs(normalized[0][1] + 0.891) < 0.0001);
  const wavBytes = Buffer.from(
    await audioContext.createProgramWavBlob([new Float32Array([0, -1, 1])], 48_000).arrayBuffer(),
  );
  assert.equal(wavBytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wavBytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wavBytes.length, 50);
});

test('program project exposes optional shared reference audio with stable queue semantics', async () => {
  const runtime = await source('runtime.js');
  for (const contract of [
    'class="sa-program-reference-intro"',
    '节目参考声线（可选）',
    'function referenceWorkspaceActive()',
    "return programMode || activeCategory === 'reference';",
    'elements.reference.classList.toggle(\'sa-hidden\', !referenceWorkspaceActive())',
    'if (!referenceWorkspaceActive()) return false;',
    'async function prepareProgramReferences(segmentText)',
    'if (!referenceItems.length) return undefined;',
    'if (referenceItems.length) {',
    'function resetProgramTakesAfterReferenceChange()',
    '旧版本仍保留在历史中',
    'function syncReferenceControls()',
  ]) {
    assert.ok(runtime.includes(contract), `missing program reference-audio contract: ${contract}`);
  }
});

test('reference add control uses a stable waveform plus SVG icon', async () => {
  const runtime = await source('runtime.js');
  assert.match(runtime, /<svg class="sa-reference-add-icon"/);
  assert.match(runtime, /class="sa-reference-add-badge"/);
  assert.match(runtime, /aria-label="添加参考音频"/);
  assert.doesNotMatch(runtime, /repeating-linear-gradient\(90deg/);
  assert.doesNotMatch(runtime, /\.sa-reference-add-icon[^}]*clip-path/);
});

test('main script editor uses the requested larger type size', async () => {
  const runtime = await source('runtime.js');
  assert.match(runtime, /\.sa-editor \{[^}]*font-size: 16px;/);
});

test('voice and scene instructions use only the main script editor', async () => {
  const runtime = await source('runtime.js');
  assert.doesNotMatch(runtime, /id="sa-control"/);
  assert.doesNotMatch(runtime, /声音、角色与场景要求/);
  assert.doesNotMatch(runtime, /elements\.control\b/);
  assert.doesNotMatch(runtime, /voice: ''/);
  assert.match(runtime, /const control = buildGenerationControl\(\);/);
});

test('official prompt toolbar controls real generation behavior', async () => {
  const [runtime, manifestSource] = await Promise.all([
    source('runtime.js'),
    source('plugin.json'),
  ]);
  const manifest = JSON.parse(manifestSource);

  for (const contract of [
    'id="sa-command"',
    'id="sa-command-menu"',
    'data-command-insert',
    'id="sa-polish"',
    '指令润色',
    'id="sa-tuning"',
    'id="sa-tuning-panel"',
    'id="sa-tone"',
    'id="sa-speed"',
    'id="sa-volume"',
    'min="-12" max="12"',
    'min="-50" max="100"',
    'function syncTuningControls()',
    'function buildGenerationControl()',
    'async function polishPrompt()',
    'api.listManagedTextModels()',
    'api.runManagedTextModel({',
    "operation: 'seed_audio_prompt_polish'",
    'const control = buildGenerationControl();',
    'seedAudioPitchRate:',
    'seedAudioSpeechRate:',
    'seedAudioLoudnessRate:',
  ]) {
    assert.ok(runtime.includes(contract), `missing official toolbar contract: ${contract}`);
  }

  assert.ok(manifest.permissions.includes('models:use-text'));
  assert.doesNotMatch(runtime, /<section id="sa-controls" class="sa-controls"/);
  assert.doesNotMatch(runtime, /id="sa-toggle-controls"/);
  assert.doesNotMatch(runtime, /id="sa-seed"|随机种子/);
});

test('canvas AI model selector controls the model used for prompt polishing', async () => {
  const runtime = await source('runtime.js');
  for (const contract of [
    'id="sa-model-picker"',
    'id="sa-model-menu"',
    'id="sa-model-list"',
    "modelPicker: $('sa-model-picker')",
    'let managedTextModels = [];',
    'function selectedManagedTextModel()',
    'async function loadManagedTextModels()',
    'api.listManagedTextModels()',
    "elements.modelList.addEventListener('click'",
    "elements.modelPicker.addEventListener('click'",
    "closePromptPopovers(open ? 'model' : '')",
    'void loadManagedTextModels();',
  ]) {
    assert.ok(runtime.includes(contract), `missing managed model selector contract: ${contract}`);
  }

  const polishRuntime = extractRuntimeFunction(
    runtime,
    '  async function polishPrompt()',
    '  function chooseReferenceMention(index)',
  );
  assert.match(
    polishRuntime,
    /const model = selectedManagedTextModel\(\) \|\| \(await loadManagedTextModels\(\)\)/,
  );
  assert.doesNotMatch(polishRuntime, /const \[model\] = await api\.listManagedTextModels\(\)/);
  assert.match(polishRuntime, /providerId: model\.providerId/);
  assert.match(polishRuntime, /model: model\.model/);
});

test('model selection and prompt polishing share one segmented toolbar frame', async () => {
  const runtime = await source('runtime.js');
  const frameStart = runtime.indexOf(
    '<div class="sa-ai-tools" role="group" aria-label="AI 辅助工具">',
  );
  const frameEnd = runtime.indexOf(
    '<div class="sa-popover-anchor"><button id="sa-tuning"',
    frameStart,
  );

  assert.ok(frameStart >= 0 && frameEnd > frameStart, 'AI tool frame should be extractable');
  const frame = runtime.slice(frameStart, frameEnd);
  assert.match(frame, /id="sa-model-picker"/);
  assert.match(frame, /class="sa-ai-tool-divider"/);
  assert.match(frame, /id="sa-polish"/);
  assert.doesNotMatch(frame, /id="sa-(?:model-picker|polish)" class="sa-tool/);
  assert.match(runtime, /\.sa-ai-tools \{[^}]*border: 1px solid #e2e4ea;/);
  assert.match(runtime, /\.sa-ai-tool-button \{[^}]*border: 0;/);
  assert.match(
    runtime,
    /\.sa-model-trigger\[data-selected="true"\] \{[^}]*background: transparent;/,
  );
  assert.doesNotMatch(
    runtime,
    /\.sa-model-trigger\[data-selected="true"\] \{[^}]*background: #f8f6ff;/,
  );
});

test('every template bundles a unique official-format polishing contract', async () => {
  const [runtime, manifestSource] = await Promise.all([
    source('runtime.js'),
    source('plugin.json'),
  ]);
  const manifest = JSON.parse(manifestSource);
  const templates = extractTemplates(runtime);
  const styleSkillAssets = extractTemplateStyleSkillAssets(runtime);

  assert.equal(styleSkillAssets.length, templates.length);
  assert.equal(new Set(styleSkillAssets).size, templates.length);
  assert.equal(manifest.assets.length, 89);

  const templatePolishContracts = new Set();
  for (const [index, assetName] of styleSkillAssets.entries()) {
    assert.match(assetName, /^style-\d{2}-[a-z0-9-]+\.md$/);
    assert.ok(manifest.assets.includes(assetName), `${assetName} should be declared`);
    const skill = await source(assetName);
    assert.ok(skill.length >= 300, `${assetName} should contain actionable style guidance`);
    assert.match(skill, /^---\nname: /);
    assert.ok(skill.includes(`template: ${templates[index].title}`));
    assert.match(skill, /# 风格目标/);
    assert.match(skill, /## (固定结构|推荐结构)/);
    assert.match(skill, /## 写作规则/);
    assert.match(skill, /## 输出约束/);
    assert.match(skill, /## 官方格式润色提示词/);
    const polishContract = skill.split('## 官方格式润色提示词')[1]?.trim() || '';
    assert.ok(
      polishContract.length >= 180,
      `${assetName} should define a detailed polish contract`,
    );
    assert.match(polishContract, /角色定义格式：/);
    assert.match(polishContract, /声音正文格式：/);
    assert.match(polishContract, /模板专属格式：/);
    assert.match(polishContract, /完成自检：/);
    templatePolishContracts.add(polishContract);
    assert.match(skill, /@参考录音(?:N|1)/);
    assert.match(skill, /\[起始s:结束s\]/);
  }
  assert.equal(templatePolishContracts.size, templates.length);

  for (const contract of [
    'let activeTemplateStyleSkill = null;',
    'async function loadTemplateStyleSkill(index)',
    "new TextDecoder('utf-8', { fatal: true })",
    'function parseTemplateStyleSkill(content, template, index, assetName)',
    "templateStyleSkillSection(content, '官方格式润色提示词')",
    'await loadTemplateStyleSkill(index)',
    '<official_seed_audio_format>',
    '</official_seed_audio_format>',
    '<template_polish_contract>',
    '</template_polish_contract>',
    '<source_script>',
    '</source_script>',
    'function buildOfficialPolishPrompt(source, styleSkill)',
    'function validateOfficialPolishResult(source, polished, styleSkill)',
    'clearTemplateStyleSkill();',
  ]) {
    assert.ok(runtime.includes(contract), `missing template style skill contract: ${contract}`);
  }

  const polishRuntime = extractRuntimeFunction(
    runtime,
    '  async function polishPrompt()',
    '  function chooseReferenceMention(index)',
  );
  assert.match(polishRuntime, /const styleSkill = activeTemplateStyleSkill;/);
  assert.match(polishRuntime, /buildOfficialPolishPrompt\(source, styleSkill\)/);
  assert.match(polishRuntime, /validateOfficialPolishResult\(source, polished, styleSkill\)/);
  assert.match(polishRuntime, /temperature: 0\.15/);
  assert.match(polishRuntime, /activeTemplateStyleSkill !== styleSkill/);
});

test('official-format polish payload uses category rules and rejects structural loss', async () => {
  const runtime = await source('runtime.js');
  const helpers = extractRuntimeFunction(
    runtime,
    '  function templateStyleSkillSection(content, heading)',
    '  async function polishPrompt()',
  );
  const context = {};
  runInNewContext(
    `const EDITOR_MAX_CHARACTERS = 3000;\n${helpers}\nglobalThis.parseSkill = parseTemplateStyleSkill;\nglobalThis.buildPrompt = buildOfficialPolishPrompt;\nglobalThis.validateResult = validateOfficialPolishResult;`,
    context,
  );
  const templates = extractTemplates(runtime);
  const assets = extractTemplateStyleSkillAssets(runtime);
  const skills = await Promise.all(
    assets.map(async (assetName, index) =>
      context.parseSkill(await source(assetName), templates[index], index, assetName),
    ),
  );

  for (const category of ['text', 'reference', 'timing', 'multilingual']) {
    const skill = skills.find((candidate) => candidate.category === category);
    assert.ok(skill, `${category} skill should exist`);
    const sourceText =
      category === 'reference'
        ? '讲述者 是青年女性，饰演者为 @参考录音1\n\n讲述者平静地说道：“保留事实。”'
        : category === 'timing'
          ? '旁白 是青年女性\n\n旁白说道：[1.0s:3.0s]“保留事实。”'
          : '讲述者 是青年女性\n\n讲述者平静地说道：“保留事实。”';
    const prompt = context.buildPrompt(sourceText, skill);
    assert.match(prompt, /<official_seed_audio_format>/);
    assert.match(prompt, /<template_polish_contract>/);
    assert.match(prompt, /<source_script>/);
    assert.ok(prompt.includes(skill.polishInstructions));
    assert.ok(prompt.includes(sourceText));
    assert.match(prompt, new RegExp(`当前模式：${category}`));
  }

  const referenceSkill = skills.find((candidate) => candidate.category === 'reference');
  assert.throws(
    () =>
      context.validateResult(
        '角色 是青年女性，饰演者为 @参考录音1\n\n角色说道：“原文。”',
        '角色 是青年女性\n\n角色说道：“原文。”',
        referenceSkill,
      ),
    /遗漏了 @参考录音1/,
  );
  assert.throws(
    () =>
      context.validateResult(
        '角色 是青年女性，饰演者为 @参考录音1\n\n角色说道：“原文。”',
        '角色 是青年女性\n\n角色说道：“原文。”，饰演者为 @参考录音1',
        referenceSkill,
      ),
    /没有把 @参考录音1 放入角色定义/,
  );
  const timingSkill = skills.find((candidate) => candidate.category === 'timing');
  assert.throws(
    () =>
      context.validateResult('旁白说道：[1.0s:3.0s]“原文。”', '旁白说道：“原文。”', timingSkill),
    /遗漏了 \[1\.0s:3\.0s\]/,
  );
});

test('command insertions preserve the editor caret and slash opens the command menu', async () => {
  const runtime = await source('runtime.js');
  for (const contract of [
    'let savedEditorRange = null;',
    'let slashCommandRange = null;',
    'function rememberEditorRange()',
    'function slashCommandRangeAtCaret()',
    "elements.command.addEventListener('pointerdown', rememberEditorRange);",
    "elements.text.addEventListener('input', (event) => {",
    'openSlashCommandMenu();',
    "if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey)",
    "event.key === 'ArrowDown'",
    "if (event.data === '/') closePromptPopovers('command');",
    "document.addEventListener('selectionchange', rememberEditorRange);",
  ]) {
    assert.ok(runtime.includes(contract), `missing caret command contract: ${contract}`);
  }

  const insertionRuntime = extractRuntimeFunction(
    runtime,
    '  function insertCommand(kind)',
    '  function boundedInteger(value, minimum, maximum, fallback = 0)',
  );
  assert.match(insertionRuntime, /insertEditorText\(snippet, commandRange\)/);
  assert.doesNotMatch(insertionRuntime, /editorValue\(\)\.endsWith\('\n'\)/);
  assert.doesNotMatch(runtime, /elements\.text\.addEventListener\('blur', \(\) => setEditorValue/);
});

test('reference generation @ menu inserts a loaded reference at the editor caret', async () => {
  const runtime = await source('runtime.js');
  for (const contract of [
    'id="sa-reference-mention-menu"',
    "referenceMentionMenu: $('sa-reference-mention-menu')",
    'let referenceMentionRange = null;',
    'function referenceMentionRangeAtCaret()',
    'function openReferenceMentionMenu()',
    'if (!referenceWorkspaceActive()) return false;',
    'referenceItems.map((item, index)',
    "if (event.data === '@')",
    "elements.referenceMentionMenu.addEventListener('click'",
    "elements.referenceMentionMenu.querySelector('[data-reference-mention]')?.focus();",
  ]) {
    assert.ok(runtime.includes(contract), `missing reference mention contract: ${contract}`);
  }

  const insertionRuntime = extractRuntimeFunction(
    runtime,
    '  function chooseReferenceMention(index)',
    '  function syncCount()',
  );
  assert.match(insertionRuntime, /insertReferenceMention\(index, mentionRange\)/);
  assert.match(insertionRuntime, /createReferenceMention\(`@参考录音\$\{index \+ 1\}`\)/);
});

test('official tone, speed and volume values are translated into the generation control', async () => {
  const runtime = await source('runtime.js');
  const controlRuntime = [
    extractRuntimeFunction(
      runtime,
      '  function boundedInteger(value, minimum, maximum, fallback = 0)',
      '  function setTuningPair(range, number, summary, value)',
    ),
    extractRuntimeFunction(
      runtime,
      '  function signedValue(value)',
      '  function buildGenerationControl()',
    ),
    extractRuntimeFunction(
      runtime,
      '  function buildGenerationControl()',
      '  function restoreGenerationControl(control)',
    ),
  ].join('\n');
  const createControl = new Function(
    'elements',
    `${controlRuntime}\nreturn buildGenerationControl;`,
  );
  const elements = {
    language: { value: '自动' },
    tone: { value: '0' },
    speed: { value: '0' },
    volume: { value: '0' },
  };
  const buildControl = createControl(elements);
  assert.equal(buildControl(), '');

  elements.language.value = '中文';
  elements.tone.value = '4';
  elements.speed.value = '34';
  elements.volume.value = '25';
  assert.equal(
    buildControl(),
    '输出语言：中文；整体语调：+4（范围 -12 到 12）；整体语速：+34（范围 -50 到 100）；整体音量：+25（范围 -50 到 100）',
  );

  elements.tone.value = '999';
  elements.speed.value = '-999';
  elements.volume.value = 'not-a-number';
  assert.equal(
    buildControl(),
    '输出语言：中文；整体语调：+12（范围 -12 到 12）；整体语速：-50（范围 -50 到 100）',
  );
});

test('reference audio auto-plays on hover and stops on leave unless click-pinned', async () => {
  const runtime = await source('runtime.js');
  assert.match(runtime, /async function startReferencePreview\(index, mode\)/);
  assert.match(runtime, /elements\.referenceList\.addEventListener\('pointerover'/);
  assert.match(runtime, /referencePreviewMode === 'click'/);
  assert.match(runtime, /void startReferencePreview\(index, 'hover'\)/);
  assert.match(runtime, /elements\.referenceList\.addEventListener\('pointerout'/);
  assert.match(runtime, /function stopHoveredReferencePreview\(index\)/);
  assert.match(runtime, /referencePreviewMode !== 'hover'/);
  assert.match(runtime, /await startReferencePreview\(index, 'click'\)/);

  const previewRuntime = [
    extractRuntimeFunction(
      runtime,
      '  function stopReferencePreview()',
      '  function syncReferencePreviewButtons()',
    ),
    extractRuntimeFunction(
      runtime,
      '  function syncReferencePreviewButtons()',
      '  function renderReferenceItems()',
    ),
    extractRuntimeFunction(
      runtime,
      '  async function startReferencePreview(index, mode)',
      '  async function toggleReferencePreview(index)',
    ),
    extractRuntimeFunction(
      runtime,
      '  async function toggleReferencePreview(index)',
      '  function stopHoveredReferencePreview(index)',
    ),
    extractRuntimeFunction(
      runtime,
      '  function stopHoveredReferencePreview(index)',
      '  function validateReferenceMentions(text)',
    ),
  ].join('\n');
  const buttonState = new Map();
  const icon = { textContent: '▶' };
  const button = {
    dataset: { referencePlay: '0' },
    querySelector() {
      return icon;
    },
    setAttribute(name, value) {
      buttonState.set(name, value);
    },
  };
  const audio = {
    currentTime: 0,
    paused: true,
    playCalls: 0,
    src: '',
    load() {},
    pause() {
      this.paused = true;
    },
    async play() {
      this.playCalls += 1;
      this.paused = false;
    },
    removeAttribute(name) {
      if (name === 'src') this.src = '';
    },
  };
  const messages = [];
  const createPreviewController = new Function(
    'referenceItems',
    'elements',
    'stopTemplatePreview',
    'setMessage',
    `let referencePreviewIndex = -1;
     let referencePreviewMode = '';
     let referencePreviewRequestId = 0;
     ${previewRuntime}
     return { startReferencePreview, toggleReferencePreview, stopHoveredReferencePreview };`,
  );
  const controller = createPreviewController(
    [{ url: 'blob:reference-1' }],
    {
      referenceList: { querySelectorAll: () => [button] },
      referencePreview: audio,
    },
    () => {},
    (message, tone) => messages.push({ message, tone }),
  );

  await controller.startReferencePreview(0, 'hover');
  assert.equal(audio.paused, false);
  assert.equal(audio.src, 'blob:reference-1');
  assert.equal(buttonState.get('aria-pressed'), 'true');
  assert.equal(icon.textContent, '■');
  assert.deepEqual(messages.at(-1), {
    message: '正在试听参考录音1；移开鼠标后停止。',
    tone: 'ok',
  });

  controller.stopHoveredReferencePreview(0);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  assert.equal(buttonState.get('aria-pressed'), 'false');
  assert.equal(icon.textContent, '▶');

  await controller.startReferencePreview(0, 'hover');
  await controller.toggleReferencePreview(0);
  controller.stopHoveredReferencePreview(0);
  assert.equal(audio.paused, false, 'click-pinned playback survives pointer leave');
  assert.equal(audio.src, 'blob:reference-1');
  assert.deepEqual(messages.at(-1), {
    message: '正在持续试听参考录音1；再次点击可停止。',
    tone: 'ok',
  });

  await controller.toggleReferencePreview(0);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  assert.equal(messages.at(-1).message, '已停止参考录音1。');
});

test('top bar omits the redundant service status while setup keeps explicit recheck', async () => {
  const runtime = await source('runtime.js');
  assert.doesNotMatch(runtime, /id="sa-service"|class="sa-service"|elements\.service/);
  assert.match(runtime, /id="sa-check-setup"/);
  assert.match(runtime, /const status = await api\.checkAudioGenerator\(GENERATOR_ID\)/);
  assert.match(runtime, /elements\.checkSetup\.addEventListener\('click'/);
});

test('setup uses a two-column standalone official API configuration flow', async () => {
  const runtime = await source('runtime.js');
  assert.match(runtime, /\.sa-setup-layout \{[^}]*grid-template-columns:/);
  assert.match(runtime, /data-setup-view="status"/);
  assert.match(runtime, /data-setup-view="api"/);
  assert.match(runtime, /id="sa-setup-content"/);
  assert.match(runtime, /id="sa-api-key-form"/);
  assert.match(runtime, /id="sa-api-key"[^>]*type="password"/);
  assert.match(runtime, /autocomplete="off"/);
  assert.match(runtime, /await api\.configureSeedAudioApiKey\(apiKey\)/);
  assert.match(runtime, /elements\.apiKey\.value = ''/);
  assert.doesNotMatch(runtime, /复制插件目录中的 <code>config\.example\.json<\/code>/);
  assert.match(runtime, /官方 Seed Audio HTTP/);
  assert.match(runtime, /不读取画布 API 或 CLI/);
  assert.doesNotMatch(runtime, /id="sa-open-api-settings"/);
  assert.doesNotMatch(runtime, /api\.openVolcengineApiSettings\(\)/);
  assert.doesNotMatch(runtime, /status\?\.access\?\.route/);
  assert.doesNotMatch(runtime, /id="sa-setup-api-state"|id="sa-setup-cli-state"/);
  assert.doesNotMatch(runtime, /插件偏好[^\n]+API Key|writePreference\([^\n]+api[_-]?key/i);
});

test('template play uses the visible main player instead of a hidden audio element', async () => {
  const runtime = await source('runtime.js');
  const playTemplatePreview = runtime.match(
    /async function playTemplatePreview\(index\) \{([\s\S]*?)\n  \}/,
  )?.[1];
  assert.ok(playTemplatePreview, 'missing template preview workflow');
  assert.match(playTemplatePreview, /await loadTemplatePreview\(template\)/);
  assert.match(
    playTemplatePreview,
    /installOutputBlob\(blob, `\$\{template\.title\} · 官方模板音频`\)/,
  );
  assert.match(playTemplatePreview, /await elements\.audio\.play\(\)/);
  assert.doesNotMatch(playTemplatePreview, /elements\.templatePreview|generateAudio/);
  assert.doesNotMatch(runtime, /id="sa-template-preview"/);
});

test('做同款 mounts the official sample in the main player without autoplay or generation', async () => {
  const runtime = await source('runtime.js');
  const mountTemplateOutput = runtime.match(
    /async function mountTemplateOutput\(index\) \{([\s\S]*?)\n  \}/,
  )?.[1];
  assert.ok(mountTemplateOutput, 'missing main-player template mount workflow');
  assert.match(mountTemplateOutput, /await loadTemplatePreview\(template\)/);
  assert.match(
    mountTemplateOutput,
    /installOutputBlob\(blob, `\$\{template\.title\} · 官方同款音频`\)/,
  );
  assert.doesNotMatch(mountTemplateOutput, /generateAudio|\.play\(/);
  assert.match(runtime, /async function applyTemplate\(index\)/);
  assert.match(runtime, /await mountTemplateOutput\(index\)/);
  assert.match(
    runtime,
    /elements\.templateGrid\.addEventListener\('click',[\s\S]*?void applyTemplate\(Number\(button\.dataset\.templateSame\)\)/,
  );
});

test('做同款 preserves all official default prompts', async () => {
  const runtime = await source('runtime.js');
  const templates = extractTemplates(runtime);
  const officialTemplates = templates.filter((template) => template.source !== 'qiansi');
  assert.equal(templates.length, 36);
  assert.equal(officialTemplates.length, 35);
  const expectedTitles = [
    '悬疑刑侦片',
    '宫廷试药',
    '灵山宣战',
    '未来科幻片',
    '古装喜剧片',
    '双人播客对谈',
    '火场追踪',
    '马来播客',
    '西语访谈',
    '悬疑追踪',
    '泰语播客',
    '李米的回忆',
    '带货双人',
    '警局对峙',
    '播客聊天',
    '多角演绎',
    '西语 Vlog',
    '法语播客',
    '韩语 ASMR',
    '日语有声书',
    '印尼社会',
    '控制音效卡点',
    '控制情绪递进',
    '控制叙事转场',
    '控制旁白推进',
    '法语',
    '日文',
    '韩文',
    '马来语',
    '德语',
    '英文',
    '泰语',
    '印尼语',
    '西班牙语',
    '越南语',
  ];
  const order = new Map(expectedTitles.map((title, index) => [title, index]));
  const officialOrder = [...officialTemplates].sort(
    (left, right) => order.get(left.title) - order.get(right.title),
  );
  assert.deepEqual(
    officialOrder.map((template) => template.title),
    expectedTitles,
  );
  assert.deepEqual(
    officialOrder.map((template) => template.characterCount),
    [
      644, 1293, 1567, 885, 628, 648, 592, 1993, 1408, 595, 962, 572, 596, 657, 889, 172, 637, 343,
      177, 134, 156, 404, 165, 384, 566, 2734, 853, 1009, 1768, 1080, 1663, 1066, 1498, 1816, 464,
    ],
  );
  for (const snippet of [
    '钟 sir，你是什么时候被收买的？',
    '太后用冰冷、不容置疑的最终命令说道',
    '斜月三星洞',
    'The surface temperature today is seventy',
    '风兄，是这样的',
    '女主 是青年女子',
    'Pocara面霜',
    'Maju Johor 2030',
    'salir de las relaciones tóxicas',
    '张寒燕刚打完电话',
    'La femme est une jeune femme adulte',
    '그거 알파카인데요',
    '[3.8s:7.1s]',
    'With great power comes great responsibility',
    'あったかい豆乳だ',
  ]) {
    assert.ok(
      templates.some((template) => template.text.includes(snippet)),
      `missing prompt: ${snippet}`,
    );
  }
  const policePrompt = templates.find((template) => template.title === '警局对峙').text;
  assert.equal((policePrompt.match(/@参考录音[123]/g) || []).length, 3);
  assert.match(policePrompt, /陈子龙！道歉！/);
  assert.match(policePrompt, /你给我道歉啊！/);
});

test('single-creator custom template lives in reference generation without a fake official sample', async () => {
  const [runtime, manifestSource, languagePackSource] = await Promise.all([
    source('runtime.js'),
    source('plugin.json'),
    source('ui-en-US.json'),
  ]);
  const templates = extractTemplates(runtime);
  const styleSkillAssets = extractTemplateStyleSkillAssets(runtime);
  const manifest = JSON.parse(manifestSource);
  const languagePack = JSON.parse(languagePackSource);
  const template = templates.find((candidate) => candidate.title === '单人自媒体通用');

  assert.ok(template, 'missing single-creator template');
  assert.equal(template.source, 'qiansi');
  assert.equal(template.featured, true);
  assert.equal(template.category, 'reference');
  assert.equal(template.previewAssets.length, 0);
  assert.equal(template.referenceAssets.length, 0);
  assert.equal(template.characterCount, template.text.length);
  assert.equal((template.text.match(/@参考录音1/g) || []).length, 1);
  assert.match(template.text, /饰演者为 @参考录音1/);
  assert.match(template.text, /开场|钩子/);
  assert.match(template.text, /核心观点|重点/);
  assert.match(template.text, /关注|评论|收藏/);

  const index = templates.indexOf(template);
  assert.equal(styleSkillAssets[index], 'style-36-single-creator.md');
  assert.ok(manifest.assets.includes('style-36-single-creator.md'));
  assert.equal(languagePack.messages[template.title], 'Solo creator');
  assert.equal(typeof languagePack.messages[template.description], 'string');

  assert.match(runtime, /function hasTemplatePreview\(template\)/);
  assert.match(runtime, /template\.featured/);
  assert.match(runtime, /hasTemplatePreview\(template\)/);
  assert.match(runtime, /addReferenceFiles\(files, 'official-template'\)/);
  assert.match(runtime, /function discardBundledTemplateReferences\(\)/);
  assert.match(runtime, /请先添加你的参考音频/);
  assert.match(runtime, /clearOutput\(\)/);
});

test('custom template builder persists editable prompts, skills, covers and sample audio', async () => {
  const [runtime, manifestSource] = await Promise.all([
    source('runtime.js'),
    source('plugin.json'),
  ]);
  const manifest = JSON.parse(manifestSource);

  for (const contract of [
    'id="sa-custom-template-add"',
    'id="sa-custom-template-dialog"',
    'id="sa-custom-template-form"',
    'id="sa-custom-template-title"',
    'id="sa-custom-template-description"',
    'id="sa-custom-template-category"',
    'id="sa-custom-template-language"',
    'id="sa-custom-template-duration"',
    'id="sa-custom-template-cover"',
    'id="sa-custom-template-audio"',
    'id="sa-custom-template-prompt"',
    'id="sa-custom-template-skill"',
    'data-template-edit',
    "const CUSTOM_TEMPLATE_INDEX_PREFERENCE = 'custom-templates.index.v1'",
    'const CUSTOM_TEMPLATE_MAX_COUNT = 12',
    'const CUSTOM_TEMPLATE_SKILL_MAX_CHARACTERS = 8000',
    'async function loadCustomTemplates()',
    'async function saveCustomTemplate(event)',
    'function sanitizeCustomTemplateRecord(value)',
    'function activateCustomTemplateStyle(template, index)',
    'function renderTemplateCards()',
    'await api.readPreference(CUSTOM_TEMPLATE_INDEX_PREFERENCE)',
    'await api.writePreference(customTemplatePreferenceKey(id), record)',
    'await api.writeSharedStyleCover(',
    'await api.readSharedStyleCover(record.coverStyleId)',
    'await api.importReferenceAudioLibrary(',
    'await api.readReferenceAudioLibrary(template.previewAudioLibraryId)',
    "elements.templateGrid.addEventListener('click'",
  ]) {
    assert.ok(runtime.includes(contract), `missing custom-template contract: ${contract}`);
  }

  assert.ok(manifest.permissions.includes('storage:preferences'));
  assert.ok(manifest.permissions.includes('storage:shared-style-covers'));
  assert.match(runtime, /accept="image\/\*"/);
  assert.match(runtime, /accept="\.wav,.mp3,.ogg,.opus,.webm,.m4a,.mp4,.flac,audio\/\*"/);
  assert.match(runtime, /image\/webp/);
  assert.match(runtime, /768 \* 1024/);
  assert.match(runtime, /16 \* 1024 \* 1024/);
});

test('every template card exposes a top-right pencil editor without mutating bundled templates', async () => {
  const runtime = await source('runtime.js');
  const editButton = runtime.match(/<button class="sa-template-edit"[\s\S]*?<\/button>/)?.[0];

  assert.ok(editButton, 'missing template edit button');
  assert.match(editButton, /data-template-edit="\$\{index\}"/);
  assert.match(editButton, /<svg[\s\S]*?<\/svg>/);
  assert.match(runtime, /\.sa-template-edit \{[^}]*top: 8px;[^}]*right: 8px;/);
  assert.match(runtime, /async function openTemplateEditor\(index\)/);
  assert.match(runtime, /await readTemplateStyleSkill\(index\)/);
  assert.match(
    runtime,
    /const styleSkill = await readTemplateStyleSkill\(index\);\s*setMessage\(''\);\s*const suffix/,
  );
  assert.match(runtime, /baseTemplateIndex/);
  assert.match(runtime, /官方模板保持不变/);
  assert.match(
    runtime,
    /button\.dataset\.templateEdit != null[\s\S]*void openTemplateEditor\(Number\(button\.dataset\.templateEdit\)\)/,
  );
  assert.doesNotMatch(runtime, /\$\{custom \? `<button class="sa-template-edit"/);
});

test('all official reference templates mount their bundled reference recordings', async () => {
  const runtime = await source('runtime.js');
  const templates = extractTemplates(runtime);
  const referenceTemplates = templates.filter(
    (template) => template.category === 'reference' && template.source !== 'qiansi',
  );
  assert.equal(referenceTemplates.length, 10);
  assert.equal(
    referenceTemplates.reduce((total, template) => total + template.referenceAssets.length, 0),
    15,
  );
  for (const template of referenceTemplates) {
    assert.equal(
      template.referenceAssets.length,
      new Set(template.text.match(/@参考录音[1-3]/g) || []).size,
      `${template.title} should mount every referenced official recording`,
    );
  }
  assert.match(runtime, /async function loadTemplateReferences\(template\)/);
  assert.match(runtime, /await loadTemplateReferences\(template\)/);
  assert.match(runtime, /new File\(\[buffer\], `官方参考录音\$\{index \+ 1\}\.wav`/);
});

test('official template preview assets are declared, bounded and byte-identical', async () => {
  const [manifestSource, runtime] = await Promise.all([
    source('plugin.json'),
    source('runtime.js'),
  ]);
  const manifest = JSON.parse(manifestSource);
  const declaredAudioAssets = new Set(
    manifest.assets.filter((name) => !name.endsWith('.md') && !name.endsWith('.json')),
  );
  for (const name of manifest.assets) {
    const bytes = await readFile(new URL(name, pluginRoot));
    assert.ok(bytes.byteLength > 0, `${name} is empty`);
    assert.ok(bytes.byteLength <= 16 * 1024 * 1024, `${name} exceeds the host asset limit`);
  }

  const samples = [
    [
      ['preview-01-suspense-crime.wav'],
      'e5ba0284f32fed5226a390681299f00abcf59ff8f73545781a1e195edb9e5aa9',
    ],
    [
      ['preview-02-palace-drug-trial.wav'],
      'ef84ecd181869c3f210c9c0ad95573b5597098c988e55dc86d6f06ed7524c161',
    ],
    [
      ['preview-03-lingshan-declaration-1.bin', 'preview-03-lingshan-declaration-2.bin'],
      '0cb495ffdefc0d158919bc6d9790ef4c66cae5e2a9a52593901d5710d04f7294',
    ],
    [
      ['preview-04-sci-fi-future.wav'],
      '9b2efe7d515dbc6fc727c1fa81ad320acbe6138f703bb4b4f1f4cb94444da617',
    ],
    [
      ['preview-05-costume-comedy.wav'],
      'ce3190e0c9fd8873dc4e649c580e2eefa5321693c2e2b31de7fdeaa969e54ef5',
    ],
    [
      ['preview-06-li-mi-memory.wav'],
      '74c060890bd42151ca969cdee9c5c5aeb1502e5f0abaeaff1316c9888fcd9042',
    ],
    [
      ['preview-07-ecommerce-duo.wav'],
      'ba562bce1abd5cc139b4dc4e4725838b8f38e2e490e69c2ae341c5169923d0f9',
    ],
    [
      ['preview-08-police-standoff.wav'],
      '51980e4b9070a8807b679adb8510e28b1d1c39ff4f972707a980827859b09ab8',
    ],
    [
      ['preview-09-sound-effect-cue.wav'],
      'a7fe33b6f542a655b7b472b0f423d9f09d27258d685536d7adbdb919bf029496',
    ],
    [
      ['preview-10-emotion-progression.wav'],
      '3eb32e0f32196c1de62507d47e27a71bb77f99793b65654dee74fee046c3618d',
    ],
    [
      ['preview-11-english-1.bin', 'preview-11-english-2.bin'],
      'f702f1f3d605868746f37b025b51675b269a2828a2df3331e07973fc80634eb4',
    ],
    [
      ['preview-12-japanese.wav'],
      'bef3cf97e1222429be0f0f6326af0e2587ccd8c0181ef3f26d01413c5a0ae0bd',
    ],
  ];
  for (const [parts, expectedHash] of samples) {
    const chunks = await Promise.all(parts.map((name) => readFile(new URL(name, pluginRoot))));
    assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'), expectedHash);
  }
  const templates = extractTemplates(runtime);
  const requiredAssets = new Set(
    templates.flatMap((template) => [
      ...template.previewAssets,
      ...(template.referenceAssets || []),
    ]),
  );
  assert.deepEqual(requiredAssets, declaredAudioAssets);

  const report = JSON.parse(
    execFileSync(process.execPath, ['./scripts/sync-doubao-seed-audio-assets.mjs', '--check'], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
    }),
  );
  assert.equal(report.length, 35);
  assert.equal(
    report.reduce(
      (total, item) =>
        total +
        item.previewSize +
        item.references.reduce((sum, reference) => sum + reference.size, 0),
      0,
    ),
    315641766,
  );
  assert.deepEqual(
    new Set(
      report.flatMap((item) => [
        ...item.previewParts,
        ...item.references.map((reference) => reference.name),
      ]),
    ),
    declaredAudioAssets,
  );
  const sourceRecord = await source('TEMPLATE_AUDIO_SOURCES.md');
  for (const item of report) {
    assert.match(sourceRecord, new RegExp(`${item.remoteStem}/generated\\.wav`));
    for (let index = 1; index <= item.references.length; index += 1) {
      assert.match(sourceRecord, new RegExp(`${item.remoteStem}/reference-${index}\\.wav`));
    }
  }
});

test('Seed Audio uses the official independent HTTP adapter and self-tests without network', async () => {
  const [server, config, readme] = await Promise.all([
    source('server.mjs'),
    source('config.example.json'),
    source('README.md'),
  ]);
  const example = JSON.parse(config);
  assert.equal(example.api_key, '');
  assert.deepEqual(Object.keys(example).sort(), ['api_key', 'request_timeout_seconds']);
  assert.match(server, /https:\/\/openspeech\.bytedance\.com\/api\/v3\/tts\/create/);
  assert.match(server, /seed-audio-1\.0/);
  assert.match(server, /'X-Api-Key'/);
  assert.match(server, /'X-Api-Request-Id'/);
  assert.match(server, /text_prompt/);
  assert.match(server, /references/);
  assert.match(server, /audio_config/);
  assert.match(server, /audio_data/);
  assert.match(server, /speech_rate/);
  assert.match(server, /loudness_rate/);
  assert.match(server, /pitch_rate/);
  assert.doesNotMatch(server, /api\/v1\/audio\/generate/);
  assert.doesNotMatch(server, /Authorization\s*:/);
  assert.doesNotMatch(server, /reference_audio/);
  assert.doesNotMatch(server, /payload\.seed/);
  assert.match(server, /redirect: 'error'/);
  assert.match(server, /Seed Audio API Key/);
  assert.match(readme, /独立 Qiansi Canvas 插件/);
  assert.match(readme, /docs\.volcengine\.com\/docs\/6561\/2550782/);
  assert.match(readme, /不会读取(?:或使用)?画布.*API.*CLI/);
  const runtime = await source('runtime.js');
  assert.match(runtime, /config\.json/);
  assert.match(runtime, /configureSeedAudioApiKey/);
  assert.doesNotMatch(runtime, /openVolcengineApiSettings/);
  assert.doesNotMatch(runtime, /火山方舟 CLI/);
  const output = execFileSync(
    process.execPath,
    [fileURLToPath(new URL('server.mjs', pluginRoot)), '--self-test'],
    {
      encoding: 'utf8',
    },
  );
  assert.match(output, /self-test passed/);
});
