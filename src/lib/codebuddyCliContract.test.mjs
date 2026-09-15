import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCodeBuddyTextArgs,
  getCodeBuddyInputModalities,
  mergeCodeBuddyModels,
  parseCodeBuddyActiveSessions,
  parseCodeBuddyConfiguredModel,
  parseCodeBuddySupportedModels,
} from './codebuddyCliContract.mjs';

const CODEBUDDY_HELP_MODEL_OPTION =
  '  --model <model>                                  Model for the current session. Please provide the model ID. Currently supported: (default-model, gemini-3.1-pro, gemini-3.0-flash, gemini-3.5-flash, gemini-2.5-pro, gemini-2.5-flash, gemini-3.1-flash-lite, gpt-5.5, gpt-5.4, gpt-5.3-codex, gpt-5.1-codex, gpt-5.1-codex-mini, deepseek-v3-2-volc, glm-5.0, kimi-k2.5)';

test('parses the configured WorkBuddy model without terminal decoration', () => {
  assert.equal(parseCodeBuddyConfiguredModel('\u001b[32mgpt-5\u001b[0m'), 'gpt-5');
  assert.equal(parseCodeBuddyConfiguredModel('model: claude-sonnet-4.5'), 'claude-sonnet-4.5');
  assert.equal(parseCodeBuddyConfiguredModel('model: invalid model name'), '');
});

test('parses and region-orders the current WorkBuddy supported model list', () => {
  assert.deepEqual(parseCodeBuddySupportedModels(CODEBUDDY_HELP_MODEL_OPTION), [
    'deepseek-v3-2-volc',
    'glm-5.0',
    'kimi-k2.5',
    'default-model',
    'gemini-3.1-pro',
    'gemini-3.0-flash',
    'gemini-3.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.3-codex',
    'gpt-5.1-codex',
    'gpt-5.1-codex-mini',
  ]);
});

test('accepts wrapped ANSI help, rejects unsafe ids and removes duplicates', () => {
  const wrapped = [
    '\u001b[36m--model <model>\u001b[0m Model for this session. Currently supported: (',
    '  gpt-5.4, qwen3-max, vendor/model-v1,',
    '  deepseek-v3, qwen3-max, invalid model, model;remove, claude-sonnet-4.5,',
    '  hunyuan-t1, doubao-pro',
    ')',
    '--fallback-model <model> unrelated',
  ].join('\r\n');

  assert.deepEqual(parseCodeBuddySupportedModels(wrapped), [
    'qwen3-max',
    'deepseek-v3',
    'hunyuan-t1',
    'doubao-pro',
    'vendor/model-v1',
    'gpt-5.4',
    'claude-sonnet-4.5',
  ]);
  assert.deepEqual(parseCodeBuddySupportedModels('Currently supported: (gpt-5.4)'), []);
});

test('merges automatic routing, help discovery and the configured model stably', () => {
  const help = '--model <model> Currently supported: (gpt-5.4, custom-model, deepseek-v3, gpt-5.4)';
  assert.deepEqual(mergeCodeBuddyModels(help, 'qwen3-max'), [
    'auto',
    'deepseek-v3',
    'qwen3-max',
    'custom-model',
    'gpt-5.4',
  ]);
  assert.deepEqual(mergeCodeBuddyModels('', 'claude-sonnet-4.5'), ['auto', 'claude-sonnet-4.5']);
});

test('keeps the user prompt off the command line and disables mutating tools', () => {
  const args = buildCodeBuddyTextArgs('gpt-5');
  assert.deepEqual(args.slice(0, 2), ['--model', 'gpt-5']);
  assert.ok(args.includes('--print'));
  assert.ok(args.includes('--disallowedTools'));
  assert.equal(
    args.some((arg) => arg.includes('用户输入; del')),
    false,
  );
});

test('omits --model for WorkBuddy automatic routing', () => {
  assert.equal(buildCodeBuddyTextArgs('auto').includes('--model'), false);
});

test('getCodeBuddyInputModalities advertises image for known vision models', () => {
  assert.deepEqual(getCodeBuddyInputModalities('auto'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('hy3'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('gpt-5.1'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('gpt-4o-mini'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('claude-sonnet-4.5'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('gemini-2.5-pro'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('glm-5.3'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('glm-5v-turbo'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('kimi-k3-1'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('MiniMax-m3'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('pixtral-large'), ['text', 'image']);
  assert.deepEqual(getCodeBuddyInputModalities('doubao-1.5-vision-pro'), ['text', 'image']);
});

test('getCodeBuddyInputModalities keeps text-only models out of the vision list', () => {
  assert.deepEqual(getCodeBuddyInputModalities(''), ['text']);
  assert.deepEqual(getCodeBuddyInputModalities('gpt-5.3-codex'), ['text']);
  assert.deepEqual(getCodeBuddyInputModalities('deepseek-v3-2-volc'), ['text']);
  assert.deepEqual(getCodeBuddyInputModalities('some-unknown-model'), ['text']);
});

test('requires a real process-backed WorkBuddy session', () => {
  assert.deepEqual(parseCodeBuddyActiveSessions('No active sessions.'), []);
  assert.deepEqual(parseCodeBuddyActiveSessions('{invalid json'), []);
  assert.deepEqual(
    parseCodeBuddyActiveSessions(
      JSON.stringify([
        { pid: 101, kind: 'interactive', sessionId: 'live', status: 'running' },
        { pid: 102, kind: 'prewarm', sessionId: 'warm', status: 'running' },
        { pid: 103, kind: 'daemon', sessionId: 'manual', manual: true },
        { pid: 0, kind: 'interactive', sessionId: 'invalid' },
      ]),
    ),
    [{ pid: 101, kind: 'interactive', sessionId: 'live', status: 'running' }],
  );
});
