import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractCodexImageCandidates,
  inspectCodexPrimaryProbe,
  isCodexReasoningEffort,
  parseCodexModelCatalog,
  summarizeCodexImageFailure,
} from './codexCliContract.mjs';

test('does not probe Codex capabilities before a current authenticated session exists', () => {
  assert.deepEqual(inspectCodexPrimaryProbe({ versionCode: 0, loginCode: 1 }), {
    runnable: true,
    authenticated: false,
    ready: false,
    shouldProbeCapabilities: false,
  });
  assert.equal(
    inspectCodexPrimaryProbe({ versionCode: 0, loginCode: 0 }).shouldProbeCapabilities,
    true,
  );
});

test('accepts Codex ultra reasoning and rejects non-CLI values', () => {
  assert.equal(isCodexReasoningEffort(' ULTRA '), true);
  assert.equal(isCodexReasoningEffort('max'), true);
  assert.equal(isCodexReasoningEffort('auto'), false);
  assert.equal(isCodexReasoningEffort('extreme'), false);
});

test('parses the authenticated Codex model catalog without inventing capabilities', () => {
  assert.deepEqual(
    parseCodexModelCatalog({
      models: [
        {
          slug: 'gpt-5.6-sol',
          display_name: 'GPT-5.6-Sol',
          default_reasoning_level: 'ultra',
          supported_reasoning_levels: [
            { effort: 'low' },
            { effort: 'ultra' },
            { effort: 'ultra' },
            { effort: 'unsupported' },
          ],
          input_modalities: ['text', 'image', 'audio', 'image'],
        },
        { slug: '../unsafe', supported_reasoning_levels: [{ effort: 'high' }] },
      ],
    }),
    [
      {
        slug: 'gpt-5.6-sol',
        displayName: 'GPT-5.6-Sol',
        defaultReasoningEffort: 'ultra',
        reasoningEfforts: ['low', 'ultra'],
        inputModalities: ['text', 'image'],
      },
    ],
  );
  assert.deepEqual(parseCodexModelCatalog('{invalid'), []);
});

test('extracts generated images from Codex JSONL including migrated relative output hints', () => {
  const stdout = [
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'image_generation',
        result: {
          image_url: 'data:image/png;base64,YWJj',
          output_hint: 'renders/final image.webp',
          alternate_url: 'https://images.example.test/result?id=123',
        },
      },
    }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: '已保存：![最终图片](exports/final.png)',
      },
    }),
  ].join('\n');

  assert.deepEqual(extractCodexImageCandidates(stdout), {
    dataUrls: ['data:image/png;base64,YWJj'],
    paths: ['renders/final image.webp', 'exports/final.png'],
    urls: ['https://images.example.test/result?id=123'],
    messages: ['已保存：![最终图片](exports/final.png)'],
  });
});

test('removes the stdin progress notice from an otherwise useful Codex failure', () => {
  assert.equal(
    summarizeCodexImageFailure(
      'Reading prompt from stdin...\n',
      `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Image generation quota is unavailable.' } })}\n`,
    ),
    'Image generation quota is unavailable.',
  );
});
