import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  generatePluginAudioThroughProxy,
  parsePluginAudioGenerationRequest,
  parsePluginAudioGeneratorContribution,
  PLUGIN_AUDIO_MAX_REFERENCE_BYTES,
  PLUGIN_AUDIO_MAX_TOTAL_REFERENCE_BYTES,
  probePluginAudioGeneratorEndpoint,
} from './plugin-audio-proxy.mjs';

const generator = {
  id: 'voxcpm-local',
  label: 'VoxCPM2 本机服务',
  protocol: 'qiansi-audio-v1',
  endpoint: 'http://127.0.0.1:9880/generate',
  healthEndpoint: 'http://127.0.0.1:9880/health',
  timeoutMs: 5000,
  maxBytes: 65536,
};

function tinyWav() {
  return Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
}

test('normalizes strict same-origin loopback audio generator contributions', () => {
  assert.deepEqual(parsePluginAudioGeneratorContribution(generator), generator);
  assert.deepEqual(
    parsePluginAudioGeneratorContribution({ ...generator, canvasOutput: 'audio-node' }),
    { ...generator, canvasOutput: 'audio-node' },
  );
  assert.throws(
    () => parsePluginAudioGeneratorContribution({ ...generator, canvasOutput: 'plugin-node' }),
    /画布输出类型不受支持/,
  );
  assert.equal(
    parsePluginAudioGeneratorContribution({
      ...generator,
      endpoint: 'http://[::1]:9880/generate',
      healthEndpoint: 'http://[::1]:9880/health',
    }).endpoint,
    'http://[::1]:9880/generate',
  );
  for (const endpoint of [
    'https://127.0.0.1:9880/generate',
    'http://localhost:9880/generate',
    'http://192.168.1.8:9880/generate',
    'http://user:pass@127.0.0.1:9880/generate',
    'http://127.0.0.1:9880/generate?token=secret',
    'http://127.0.0.1:9880/generate#fragment',
  ]) {
    assert.throws(() => parsePluginAudioGeneratorContribution({ ...generator, endpoint }));
  }
  assert.throws(() =>
    parsePluginAudioGeneratorContribution({
      ...generator,
      healthEndpoint: 'http://127.0.0.1:9881/health',
    }),
  );
  assert.throws(() =>
    parsePluginAudioGeneratorContribution({ ...generator, protocol: 'openai-audio-v1' }),
  );
  assert.throws(() => parsePluginAudioGeneratorContribution({ ...generator, timeoutMs: 999 }));
  assert.throws(() => parsePluginAudioGeneratorContribution({ ...generator, maxBytes: 268435457 }));
});

test('accepts only trusted host-managed audio adapters without HTTP endpoints', () => {
  for (const [hostAdapter, label, id = `${hostAdapter}-local`] of [
    ['voxcpm2', 'VoxCPM2 宿主管理服务'],
    ['chattts', 'ChatTTS 宿主管理服务'],
    ['qwen3tts', 'Qwen3-TTS 宿主管理服务'],
    ['cosyvoice3', 'CosyVoice 3 宿主管理服务'],
    ['woosh', 'Sony Woosh 宿主管理服务'],
    ['acestepXl', 'ACE-Step XL 宿主管理服务', 'acestep-xl-local'],
  ]) {
    const contribution = {
      id,
      label,
      protocol: 'qiansi-audio-v1',
      hostAdapter,
      timeoutMs: 600000,
      maxBytes: 67108864,
    };
    assert.deepEqual(parsePluginAudioGeneratorContribution(contribution), contribution);
  }
  assert.throws(
    () =>
      parsePluginAudioGeneratorContribution({
        ...generator,
        hostAdapter: 'voxcpm2',
      }),
    /不能同时声明/,
  );
  assert.throws(
    () =>
      parsePluginAudioGeneratorContribution({
        id: 'unknown-worker',
        label: 'Unknown',
        protocol: 'qiansi-audio-v1',
        hostAdapter: 'arbitrary-worker',
      }),
    /不受支持/,
  );
});

test('sanitizes design, clone and hifi generation requests', () => {
  assert.equal(PLUGIN_AUDIO_MAX_REFERENCE_BYTES, 10 * 1024 * 1024);
  assert.equal(PLUGIN_AUDIO_MAX_TOTAL_REFERENCE_BYTES, 30 * 1024 * 1024);
  assert.deepEqual(
    parsePluginAudioGenerationRequest({
      mode: 'design',
      text: '  你好，世界。  ',
      control: ' 温暖、自然 ',
      options: { seed: 7, temperature: 0.8 },
    }),
    {
      mode: 'design',
      text: '你好，世界。',
      control: '温暖、自然',
      options: { seed: 7, temperature: 0.8 },
    },
  );
  const referenceAudio = {
    base64: Buffer.from(tinyWav()).toString('base64'),
    mimeType: 'audio/wav',
    fileName: 'voice.wav',
  };
  assert.equal(
    parsePluginAudioGenerationRequest({
      mode: 'clone',
      text: '复刻音色',
      referenceAudio,
    }).referenceAudio.fileName,
    'voice.wav',
  );
  assert.deepEqual(
    parsePluginAudioGenerationRequest({
      mode: 'clone',
      text: '@参考录音1 与 @参考录音2 对话',
      referenceAudios: [referenceAudio, { ...referenceAudio, fileName: 'guest.wav' }],
    }).referenceAudios.map((item) => item.fileName),
    ['voice.wav', 'guest.wav'],
  );
  assert.throws(
    () =>
      parsePluginAudioGenerationRequest({
        mode: 'clone',
        text: '重复入口',
        referenceAudio,
        referenceAudios: [referenceAudio],
      }),
    /不能同时提交/,
  );
  assert.throws(
    () =>
      parsePluginAudioGenerationRequest({
        mode: 'clone',
        text: '过多参考',
        referenceAudios: [referenceAudio, referenceAudio, referenceAudio, referenceAudio],
      }),
    /1 到 3/,
  );
  assert.equal(
    parsePluginAudioGenerationRequest({
      mode: 'hifi',
      text: '高保真复刻',
      referenceAudio,
      options: { promptText: '参考音频的准确转写' },
    }).mode,
    'hifi',
  );
  assert.throws(
    () => parsePluginAudioGenerationRequest({ mode: 'clone', text: '缺少参考音频' }),
    /必须提供参考音频/,
  );
  assert.throws(
    () =>
      parsePluginAudioGenerationRequest({
        mode: 'hifi',
        text: '缺少准确转写',
        referenceAudio,
      }),
    /promptText/,
  );
  assert.throws(
    () => parsePluginAudioGenerationRequest({ mode: 'unknown', text: '无效' }),
    /模式不受支持/,
  );
});

test('probes only the declared health endpoint without following redirects', async () => {
  let captured;
  const result = await probePluginAudioGeneratorEndpoint(generator, {
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 204);
  assert.equal(captured.url, generator.healthEndpoint);
  assert.equal(captured.init.method, 'GET');
  assert.equal(captured.init.redirect, 'error');
  assert.equal(captured.init.credentials, 'omit');

  const notReady = await probePluginAudioGeneratorEndpoint(generator, {
    fetchImpl: async () =>
      new Response(JSON.stringify({ ready: false, message: 'do not expose local details' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  assert.equal(notReady.ok, false);
  assert.match(notReady.message, /尚未就绪/);
  assert.doesNotMatch(notReady.message, /local details/);
});

test('forwards a bounded typed request and returns verified raw audio', async () => {
  let captured;
  const result = await generatePluginAudioThroughProxy(
    generator,
    { mode: 'design', text: '你好', control: '平静', options: { seed: 3 } },
    {
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return new Response(tinyWav(), {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Disposition': `attachment; filename*=UTF-8''voice.wav`,
            'X-Qiansi-Audio-Duration-Seconds': '1.25',
          },
        });
      },
    },
  );
  assert.equal(captured.url, generator.endpoint);
  assert.equal(captured.init.redirect, 'error');
  assert.equal(captured.init.credentials, 'omit');
  assert.deepEqual(JSON.parse(captured.init.body), {
    mode: 'design',
    text: '你好',
    control: '平静',
    options: { seed: 3 },
  });
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.fileName, 'voice.wav');
  assert.equal(result.durationSeconds, 1.25);
  assert.deepEqual(result.bytes, tinyWav());
});

test('rejects oversized, non-audio and signature-mismatched responses', async () => {
  await assert.rejects(
    generatePluginAudioThroughProxy(
      generator,
      { mode: 'design', text: '过大' },
      {
        fetchImpl: async () =>
          new Response(tinyWav(), {
            headers: { 'Content-Type': 'audio/wav', 'Content-Length': '70000' },
          }),
      },
    ),
    /超过清单限制/,
  );
  await assert.rejects(
    generatePluginAudioThroughProxy(
      generator,
      { mode: 'design', text: '错误类型' },
      {
        fetchImpl: async () =>
          new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      },
    ),
    /媒体类型/,
  );
  await assert.rejects(
    generatePluginAudioThroughProxy(
      generator,
      { mode: 'design', text: '伪造音频' },
      {
        fetchImpl: async () =>
          new Response('not wav', { headers: { 'Content-Type': 'audio/wav' } }),
      },
    ),
    /媒体类型不匹配/,
  );
});

test('host proxy never accepts Canvas credentials or calls the legacy Seed Audio API directly', async () => {
  const [proxySource, bridgeSource] = await Promise.all([
    readFile(new URL('./plugin-audio-proxy.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8'),
  ]);
  for (const source of [proxySource, bridgeSource]) {
    assert.doesNotMatch(source, /canvasVolcengineProvider/);
    assert.doesNotMatch(source, /generatePluginAudioWithVolcengine/);
    assert.doesNotMatch(source, /api\/v1\/audio\/generate/);
    assert.doesNotMatch(source, /Authorization:\s*`Bearer/);
  }
});
