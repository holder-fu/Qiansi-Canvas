import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comfyViewUrl,
  fetchComfyOutputResponse,
  inspectLocalComfy,
  normalizeLocalComfyBaseUrl,
  normalizeRemoteComfyBaseUrl,
  queueComfyWorkflow,
  waitForComfyJob,
  waitForComfyHistory,
} from './comfyui-client.mjs';

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = String(url);
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.emit('open', {}));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((candidate) => candidate !== listener),
    );
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  message(payload) {
    this.emit('message', { data: JSON.stringify(payload) });
  }

  close() {}
}

test('accepts only loopback ComfyUI addresses', () => {
  assert.equal(normalizeLocalComfyBaseUrl('http://127.0.0.1:8188/'), 'http://127.0.0.1:8188');
  assert.equal(normalizeLocalComfyBaseUrl('http://localhost:8288'), 'http://localhost:8288');
  assert.throws(() => normalizeLocalComfyBaseUrl('http://192.168.1.20:8188'), /本地 ComfyUI/);
  assert.throws(() => normalizeLocalComfyBaseUrl('file:///tmp/comfy'), /HTTP/);
});

test('accepts only safe HTTPS addresses for remote ComfyUI', () => {
  assert.equal(
    normalizeRemoteComfyBaseUrl('https://gpu.example.com/comfyui/'),
    'https://gpu.example.com/comfyui',
  );
  assert.throws(() => normalizeRemoteComfyBaseUrl('http://gpu.example.com:8188'), /必须使用 HTTPS/);
  assert.throws(() => normalizeRemoteComfyBaseUrl('https://192.168.1.20:8188'), /私网或保留地址/);
  assert.throws(
    () => normalizeRemoteComfyBaseUrl('https://gpu.example.com/comfyui#workflow'),
    /查询参数或片段/,
  );
});

test('forwards remote ComfyUI authentication without exposing it in the URL', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(String(url), 'https://gpu.example.com/comfyui/prompt');
    assert.equal(init.headers.Authorization, 'Bearer secret-token');
    assert.equal(String(url).includes('secret-token'), false);
    return new Response(JSON.stringify({ prompt_id: 'remote-job' }), { status: 200 });
  };
  const result = await queueComfyWorkflow(
    'https://gpu.example.com/comfyui',
    {},
    {
      allowRemote: true,
      headers: { Authorization: 'Bearer secret-token' },
      fetchImpl,
    },
  );
  assert.equal(result.promptId, 'remote-job');
});

test('uses the Cloud API prefix and partner-node key when queuing a workflow', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(String(url), 'https://cloud.comfy.org/api/prompt');
    assert.equal(init.headers['X-API-Key'], 'cloud-secret');
    const payload = JSON.parse(init.body);
    assert.equal(payload.extra_data.api_key_comfy_org, 'cloud-secret');
    return new Response(JSON.stringify({ prompt_id: 'cloud-job' }), { status: 200 });
  };
  const result = await queueComfyWorkflow('https://cloud.comfy.org/api', {}, {
    allowRemote: true,
    cloud: true,
    apiKey: 'cloud-secret',
    headers: { 'X-API-Key': 'cloud-secret' },
    fetchImpl,
  });
  assert.equal(result.promptId, 'cloud-job');
});

test('does not forward the Cloud API key to a signed output download URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://signed.example-cdn.com/output/model.glb?token=temp' },
      });
    }
    return new Response('glTF', { status: 200 });
  };
  const response = await fetchComfyOutputResponse(
    'https://cloud.comfy.org/api',
    { filename: 'model.glb', type: 'output' },
    {
      allowRemote: true,
      cloud: true,
      headers: { 'X-API-Key': 'cloud-secret' },
      fetchImpl,
    },
  );
  assert.equal(await response.text(), 'glTF');
  assert.equal(calls[0].init.headers['X-API-Key'], 'cloud-secret');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[1].url, 'https://signed.example-cdn.com/output/model.glb?token=temp');
  assert.equal(calls[1].init.headers, undefined);
});

test('builds the Cloud WebSocket at the service root with token authentication', async () => {
  FakeWebSocket.instances = [];
  const waiting = waitForComfyJob('https://cloud.comfy.org/api', 'cloud-ws-job', {
    allowRemote: true,
    cloud: true,
    apiKey: 'cloud-secret',
    clientId: 'cloud-client',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          'cloud-ws-job': { status: { completed: true }, outputs: {} },
        }),
      ),
    wait: () => Promise.resolve(),
    timeoutMs: 1000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    FakeWebSocket.instances[0].url,
    'wss://cloud.comfy.org/ws?clientId=cloud-client&token=cloud-secret',
  );
  await waiting;
});

test('reads local ComfyUI status without exposing it to the browser', async () => {
  const fetchImpl = async (url) => {
    assert.equal(String(url), 'http://127.0.0.1:8188/system_stats');
    return new Response(
      JSON.stringify({
        system: { comfyui_version: '0.3.0' },
        devices: [{ name: 'GPU 0', type: 'cuda', vram_total: 100, vram_free: 60 }],
      }),
      { status: 200 },
    );
  };
  const result = await inspectLocalComfy('http://127.0.0.1:8188', { fetchImpl });
  assert.equal(result.ready, true);
  assert.equal(result.devices[0].name, 'GPU 0');
});

test('reads ComfyUI feature flags and object definitions for workflow preflight', async () => {
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/system_stats') {
      return new Response(JSON.stringify({ system: { comfyui_version: '0.3.50' }, devices: [] }));
    }
    if (pathname === '/features') {
      return new Response(JSON.stringify({ feature_flags: ['custom_nodes_from_web'] }));
    }
    if (pathname === '/object_info') {
      return new Response(
        JSON.stringify({
          LoadImage: { input: { required: { image: ['STRING', {}] } }, output: ['IMAGE'] },
          SaveImage: { input: { required: { images: ['IMAGE', {}] } }, output: [] },
        }),
      );
    }
    return new Response('not found', { status: 404 });
  };

  const result = await inspectLocalComfy('http://127.0.0.1:8188', { fetchImpl });
  assert.deepEqual(result.features.feature_flags, ['custom_nodes_from_web']);
  assert.equal(result.objectInfo.LoadImage.output[0], 'IMAGE');
  assert.deepEqual(result.capabilityWarnings, []);
});

test('keeps older ComfyUI servers usable when optional capability routes are unavailable', async () => {
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/system_stats') {
      return new Response(JSON.stringify({ system: { comfyui_version: '0.2.7' }, devices: [] }));
    }
    return new Response(JSON.stringify({ error: 'missing route' }), { status: 404 });
  };

  const result = await inspectLocalComfy('http://127.0.0.1:8188', { fetchImpl });
  assert.equal(result.ready, true);
  assert.equal(result.features, null);
  assert.equal(result.objectInfo, null);
  assert.equal(result.capabilityWarnings.length, 2);
});

test('surfaces ComfyUI prompt validation errors', async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: { message: 'Prompt outputs failed validation' },
        node_errors: { 12: { errors: [{ message: 'model not found' }] } },
      }),
      { status: 400 },
    );
  await assert.rejects(
    queueComfyWorkflow('http://127.0.0.1:8188', {}, { fetchImpl }),
    /Prompt outputs failed validation.*节点 12.*model not found/,
  );
});

test('rejects a non-Comfy service listening on the configured port', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  await assert.rejects(
    inspectLocalComfy('http://127.0.0.1:8188', { fetchImpl }),
    /不是有效 ComfyUI/,
  );
});

test('polls history until the matching prompt completes', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(
      JSON.stringify(
        calls === 1
          ? {}
          : {
              job_1: {
                status: { completed: true, status_str: 'success' },
                outputs: { 99: { gifs: [{ filename: 'result.mp4', type: 'output' }] } },
              },
            },
      ),
      { status: 200 },
    );
  };
  const result = await waitForComfyHistory('http://127.0.0.1:8188', 'job_1', {
    fetchImpl,
    wait: () => Promise.resolve(),
    timeoutMs: 1000,
  });
  assert.equal(result.outputs[99].gifs[0].filename, 'result.mp4');
  assert.equal(calls, 2);
});

test('uses ComfyUI WebSocket progress and confirms completion through history', async () => {
  FakeWebSocket.instances = [];
  const events = [];
  let historyCalls = 0;
  const fetchImpl = async () => {
    historyCalls += 1;
    return new Response(
      JSON.stringify(
        historyCalls === 1
          ? {}
          : {
              job_ws: {
                status: { completed: true, status_str: 'success' },
                outputs: { 9: { videos: [{ filename: 'result.mp4', type: 'output' }] } },
              },
            },
      ),
    );
  };
  const waiting = waitForComfyJob('http://127.0.0.1:8188', 'job_ws', {
    clientId: 'qiansi-test',
    WebSocketImpl: FakeWebSocket,
    fetchImpl,
    onEvent: (event) => events.push(event),
    wait: () => Promise.resolve(),
    timeoutMs: 1000,
    silenceTimeoutMs: 500,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeWebSocket.instances[0];
  assert.match(socket.url, /^ws:\/\/127\.0\.0\.1:8188\/ws\?clientId=qiansi-test$/);
  socket.message({
    type: 'progress',
    data: { prompt_id: 'job_ws', node: '7', value: 4, max: 10 },
  });
  socket.message({ type: 'execution_success', data: { prompt_id: 'job_ws' } });

  const result = await waiting;
  assert.equal(result.outputs[9].videos[0].filename, 'result.mp4');
  assert.ok(events.some((event) => event.type === 'progress' && event.progress === 40));
});

test('reconnects once and lets history recover a task completed during disconnection', async () => {
  FakeWebSocket.instances = [];
  let historyCalls = 0;
  const fetchImpl = async () => {
    historyCalls += 1;
    return new Response(
      JSON.stringify(
        historyCalls < 2
          ? {}
          : {
              job_reconnect: {
                status: { completed: true },
                outputs: { 1: { images: [{ filename: 'done.png' }] } },
              },
            },
      ),
    );
  };
  const waiting = waitForComfyJob('http://127.0.0.1:8188', 'job_reconnect', {
    clientId: 'qiansi-reconnect',
    WebSocketImpl: FakeWebSocket,
    fetchImpl,
    wait: () => Promise.resolve(),
    reconnectDelayMs: 0,
    timeoutMs: 1000,
    silenceTimeoutMs: 500,
  });
  await new Promise((resolve) => setImmediate(resolve));
  FakeWebSocket.instances[0].emit('close', {});

  const result = await waiting;
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(result.outputs[1].images[0].filename, 'done.png');
});

test('builds encoded ComfyUI view URLs', () => {
  const url = comfyViewUrl('http://127.0.0.1:8188', {
    filename: 'video 01.mp4',
    subfolder: 'kitty outputs',
    type: 'output',
  });
  assert.equal(url.searchParams.get('filename'), 'video 01.mp4');
  assert.equal(url.searchParams.get('subfolder'), 'kitty outputs');
});
