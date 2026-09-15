import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRemoteChatPayload,
  collectCliChatInput,
  describeEmptyRemoteChatResponse,
  extractRemoteChatText,
} from './bridge-chat.mjs';

test('extracts text and image attachments for Codex CLI chat', () => {
  const input = collectCliChatInput([
    { role: 'system', content: '只输出提示词。' },
    {
      role: 'user',
      content: [
        { type: 'text', text: '帮我读取图片上的提示词。' },
        { type: 'image_url', image_url: { url: '/output/reference.png' } },
      ],
    },
  ]);

  assert.equal(input.prompt, 'system: 只输出提示词。\n\nuser: 帮我读取图片上的提示词。');
  assert.deepEqual(input.imageUrls, ['/output/reference.png']);
});

test('forwards bounded output length to ordinary OpenAI-compatible chat models', () => {
  assert.deepEqual(
    buildRemoteChatPayload({
      protocol: 'deepseek',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.7,
      maxLength: 5000,
      reasoningEffort: 'high',
    }),
    {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.7,
      max_tokens: 5000,
      stream: false,
    },
  );
});

test('uses current completion and reasoning fields for OpenAI reasoning models', () => {
  assert.deepEqual(
    buildRemoteChatPayload({
      protocol: 'openai',
      model: 'gpt-5.6',
      messages: [],
      temperature: 0.8,
      maxLength: 999999,
      reasoningEffort: 'high',
    }),
    {
      model: 'gpt-5.6',
      messages: [],
      max_completion_tokens: 32768,
      reasoning_effort: 'high',
      stream: false,
    },
  );
});

test('deduplicates and caps CLI image attachments at five', () => {
  const urls = ['1.png', '1.png', '2.png', '3.png', '4.png', '5.png', '6.png'];
  const input = collectCliChatInput([
    {
      role: 'user',
      content: urls.map((url) => ({ type: 'image_url', image_url: { url } })),
    },
  ]);

  assert.deepEqual(input.imageUrls, ['1.png', '2.png', '3.png', '4.png', '5.png']);
});

test('extracts text from string and structured chat completion content', () => {
  assert.equal(
    extractRemoteChatText({ choices: [{ message: { content: 'plain text' } }] }),
    'plain text',
  );
  assert.equal(
    extractRemoteChatText({
      choices: [
        {
          message: {
            content: [
              { type: 'output_text', text: 'first block' },
              { type: 'text', text: { value: 'second block' } },
            ],
          },
        },
      ],
    }),
    'first block\nsecond block',
  );
});

test('extracts text from Responses-compatible payloads and legacy completion text', () => {
  assert.equal(extractRemoteChatText({ choices: [{ text: 'legacy text' }] }), 'legacy text');
  assert.equal(
    extractRemoteChatText({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'response text' }] }],
    }),
    'response text',
  );
  assert.equal(extractRemoteChatText({ output_text: 'direct response text' }), 'direct response text');
});

test('classifies empty final responses without returning private reasoning text', () => {
  assert.match(
    describeEmptyRemoteChatResponse({ choices: [{ finish_reason: 'length', message: {} }] }),
    /输出长度限制/,
  );
  assert.match(
    describeEmptyRemoteChatResponse({
      choices: [{ finish_reason: 'stop', message: { reasoning_content: 'private reasoning' } }],
    }),
    /只返回了推理过程/,
  );
  assert.equal(
    extractRemoteChatText({
      choices: [{ finish_reason: 'stop', message: { reasoning_content: 'private reasoning' } }],
    }),
    '',
  );
});
