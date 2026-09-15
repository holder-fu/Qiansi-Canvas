import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeComfyWorkflowDependencies,
  createComfyDependencyPowerShell,
  deleteLocalComfyWorkflow,
  fetchComfyUiStatus,
  fetchLocalComfyUiStatus,
  parseComfyWorkflowApiJson,
  parseComfyWorkflowImportJson,
  saveLocalComfyWorkflow,
} from './comfyWorkflow';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ComfyUI workflow bridge client', () => {
  it('accepts API Format workflows', () => {
    expect(
      parseComfyWorkflowApiJson(
        JSON.stringify({ '1': { class_type: 'CLIPTextEncode', inputs: { text: 'hello' } } }),
      ),
    ).toEqual({ '1': { class_type: 'CLIPTextEncode', inputs: { text: 'hello' } } });
  });

  it('converts regular nodes and links workflows into API Format without shifting seed controls', () => {
    const parsed = parseComfyWorkflowImportJson(
      JSON.stringify({
        nodes: [
          {
            id: 1,
            type: 'LoadImage',
            title: 'Body Reference',
            inputs: [
              { name: 'image', type: 'COMBO', link: null, widget: { name: 'image' } },
              { name: 'upload', type: 'IMAGEUPLOAD', link: null, widget: { name: 'upload' } },
            ],
            widgets_values: ['body.png', 'image'],
          },
          {
            id: 2,
            type: 'KSampler',
            inputs: [
              { name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } },
              { name: 'steps', type: 'INT', link: null, widget: { name: 'steps' } },
            ],
            widgets_values: [123, 'randomize', 10],
          },
          {
            id: 3,
            type: 'SaveImage',
            inputs: [
              { name: 'images', type: 'IMAGE', link: 9 },
              {
                name: 'filename_prefix',
                type: 'STRING',
                link: null,
                widget: { name: 'filename_prefix' },
              },
            ],
            widgets_values: ['four-view'],
          },
          {
            id: 4,
            type: 'Seed (rgthree)',
            inputs: [],
            widgets_values: [847181417704469, '', '', 'okay'],
          },
          {
            id: 5,
            type: 'RandomNoise',
            inputs: [{ name: 'noise_seed', type: 'INT', link: 10 }],
            widgets_values: [],
          },
          {
            id: 6,
            type: 'Fast Groups Bypasser (rgthree)',
            inputs: [],
            widgets_values: [],
          },
          {
            id: 7,
            type: 'DisabledPromptHelper',
            mode: 4,
            inputs: [],
            widgets_values: ['not part of the API graph'],
          },
          {
            id: 34,
            type: 'Label (rgthree)',
            title: 'display only',
            inputs: [],
          },
        ],
        links: [
          [9, 2, 0, 3, 0, 'IMAGE'],
          [10, 4, 0, 5, 0, 'INT'],
        ],
      }),
    );

    expect(parsed.sourceFormat).toBe('layout');
    expect(parsed.workflow).toMatchObject({
      1: { class_type: 'LoadImage', inputs: { image: 'body.png' } },
      2: { class_type: 'KSampler', inputs: { seed: 123, steps: 10 } },
      3: {
        class_type: 'SaveImage',
        inputs: { images: ['2', 0], filename_prefix: 'four-view' },
      },
      5: { class_type: 'RandomNoise', inputs: { noise_seed: 847181417704469 } },
    });
    expect(parsed.workflow).not.toHaveProperty('4');
    expect(parsed.workflow).not.toHaveProperty('6');
    expect(parsed.workflow).not.toHaveProperty('7');
    expect(parsed.workflow).not.toHaveProperty('34');
  });

  it('converts Workflow JSON v1.0 object links, named widgets and reroutes', () => {
    const parsed = parseComfyWorkflowImportJson(
      JSON.stringify({
        version: 1,
        state: { lastNodeId: 3, lastLinkId: 9, lastRerouteId: 44 },
        nodes: [
          {
            id: 'source-A',
            type: 'KSampler',
            inputs: [
              { name: 'seed', type: 'INT', link: null, widget: { name: 'seed' } },
              { name: 'steps', type: 'INT', link: null, widget: { name: 'steps' } },
            ],
            outputs: [{ name: 'samples', type: 'LATENT', links: [9], slot_index: 0 }],
            widgets_values: { seed: 321, control_after_generate: 'randomize', steps: 12 },
            properties: { cnr_id: 'comfy-core', ver: '0.3.50' },
          },
          {
            id: 3,
            type: 'SaveImage',
            inputs: [
              { name: 'images', type: 'IMAGE', link: 9, slot_index: 0 },
              {
                name: 'filename_prefix',
                type: 'STRING',
                link: null,
                widget: { name: 'filename_prefix' },
              },
            ],
            outputs: [],
            widgets_values: { filename_prefix: 'workflow-v1' },
          },
        ],
        links: [
          {
            id: 9,
            origin_id: 'source-A',
            origin_slot: 'samples',
            target_id: 3,
            target_slot: 0,
            type: 'IMAGE',
            parentId: 44,
          },
        ],
        reroutes: [{ id: 44, pos: [100, 200], linkIds: [9] }],
      }),
    );

    expect(parsed).toMatchObject({
      sourceFormat: 'layout',
      sourceVersion: '1.0',
      sourceMetadata: {
        nodePackages: [{ id: 'comfy-core', version: '0.3.50' }],
      },
      workflow: {
        'source-A': { class_type: 'KSampler', inputs: { seed: 321, steps: 12 } },
        3: {
          class_type: 'SaveImage',
          inputs: { images: ['source-A', 0], filename_prefix: 'workflow-v1' },
        },
      },
    });
  });

  it('keeps explicit Workflow JSON v0.4 tuple links compatible', () => {
    const parsed = parseComfyWorkflowImportJson(
      JSON.stringify({
        version: 0.4,
        nodes: [
          {
            id: 1,
            type: 'PrimitiveNode',
            inputs: [{ name: 'value', type: 'INT', link: null, widget: { name: 'value' } }],
            widgets_values: [7],
          },
        ],
        links: [],
      }),
    );

    expect(parsed.workflow).toMatchObject({
      1: { class_type: 'PrimitiveNode', inputs: { value: 7 } },
    });
    expect(parsed.sourceVersion).toBe('0.4');
  });

  it('rejects unsupported regular workflow schema versions', () => {
    expect(() =>
      parseComfyWorkflowImportJson(JSON.stringify({ version: 2, state: {}, nodes: [], links: [] })),
    ).toThrow('不支持的 ComfyUI Workflow JSON 版本');
  });

  it('rejects incomplete regular workflow layout data', () => {
    expect(() => parseComfyWorkflowApiJson(JSON.stringify({ nodes: [] }))).toThrow(
      '必须同时包含 nodes 和 links',
    );
  });

  it('identifies the malformed API node in import errors', () => {
    expect(() =>
      parseComfyWorkflowApiJson(JSON.stringify({ 34: { inputs: { text: 'hello' } } })),
    ).toThrow('节点「34」缺少“节点类型（class_type）”');
  });

  it('ignores unreferenced visual placeholders from API exports', () => {
    expect(
      parseComfyWorkflowApiJson(
        JSON.stringify({
          1: { class_type: 'CLIPTextEncode', inputs: { text: 'hello' } },
          34: { inputs: {}, _meta: { title: '▶四视图生成流-krea2' } },
        }),
      ),
    ).toEqual({ 1: { class_type: 'CLIPTextEncode', inputs: { text: 'hello' } } });
  });

  it('keeps malformed placeholders that are referenced by an execution node', () => {
    expect(() =>
      parseComfyWorkflowApiJson(
        JSON.stringify({
          1: { class_type: 'CLIPTextEncode', inputs: { clip: ['34', 0] } },
          34: { inputs: {}, _meta: { title: 'required node' } },
        }),
      ),
    ).toThrow('节点「34」缺少“节点类型（class_type）”');
  });

  it('translates malformed-node errors returned by the local bridge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: { message: 'workflow.34.class_type must be a non-empty string' },
        }),
      } as Response),
    );

    await expect(
      saveLocalComfyWorkflow('损坏工作流', { 34: { inputs: { text: 'hello' } } }),
    ).rejects.toThrow('节点「34」缺少“节点类型（class_type）”');
  });

  it('detects node classes and model files without inventing download URLs', () => {
    const workflow = {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'video\\wan_2.1.safetensors' },
      },
      '2': { class_type: 'VAELoader', inputs: { vae_name: 'wan_vae.safetensors' } },
      extra: {
        models: [
          {
            name: 'wan_vae.safetensors',
            url: 'https://huggingface.co/example/resolve/main/wan_vae.safetensors',
          },
        ],
      },
    };
    const analysis = analyzeComfyWorkflowDependencies(workflow);
    expect(analysis.nodeClasses).toEqual(['CheckpointLoaderSimple', 'VAELoader']);
    expect(analysis.models).toEqual([
      expect.objectContaining({ name: 'wan_2.1.safetensors', relativePath: 'models/checkpoints' }),
      expect.objectContaining({
        name: 'wan_vae.safetensors',
        relativePath: 'models/vae',
        downloadUrl: 'https://huggingface.co/example/resolve/main/wan_vae.safetensors',
      }),
    ]);
    expect(analysis.downloadableModels).toBe(1);
  });

  it('builds a standalone PowerShell installer around the official comfy CLI', () => {
    const workflow = { '1': { class_type: 'VAELoader', inputs: { vae_name: 'wan.safetensors' } } };
    const script = createComfyDependencyPowerShell(
      workflow,
      analyzeComfyWorkflowDependencies(workflow),
    );
    expect(script).toContain('node install-deps --workflow');
    expect(script).toContain('未找到官方 comfy CLI');
    expect(script).not.toContain('wan.safetensors');
    expect(script).not.toContain('Invoke-Expression');
  });

  it('uses only the canvas bridge for status, import and deletion', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ready: true,
          workflows: [{ id: 'wan-i2v', name: 'Wan 图生视频', modes: ['图生视频'] }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'wan-i2v', name: 'Wan 图生视频', modes: ['图生视频'] }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLocalComfyUiStatus()).resolves.toMatchObject({
      ready: true,
      workflows: [{ id: 'wan-i2v', name: 'Wan 图生视频' }],
    });
    await expect(
      saveLocalComfyWorkflow('Wan 图生视频', {
        '1': { class_type: 'CLIPTextEncode', inputs: {} },
      }),
    ).resolves.toMatchObject({ id: 'wan-i2v' });
    await deleteLocalComfyWorkflow('wan-i2v');

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      'http://127.0.0.1:2895/api/comfyui/status',
      'http://127.0.0.1:2895/api/comfyui/workflows',
      'http://127.0.0.1:2895/api/comfyui/workflows/wan-i2v',
    ]);
    expect(urls.every((url) => !url.includes(':8188'))).toBe(true);
  });

  it('keeps explicit video-reference support while accepting older workflow summaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ready: true,
          workflows: [
            {
              id: 'video-reference',
              name: 'Video Reference',
              modes: ['全能参考'],
              supportsVideoReference: true,
            },
            {
              id: 'text-to-video',
              name: 'Text to Video',
              modes: ['文生视频'],
              supportsVideoReference: false,
            },
            {
              id: 'legacy-workflow',
              name: 'Legacy Workflow',
              modes: ['文生视频'],
            },
            {
              id: 'invalid-capability',
              name: 'Invalid Capability',
              modes: ['文生视频'],
              supportsVideoReference: 'yes',
            },
          ],
        }),
      } as Response),
    );

    const status = await fetchLocalComfyUiStatus();

    expect(status.workflows.map((workflow) => workflow.supportsVideoReference)).toEqual([
      true,
      false,
      undefined,
      undefined,
    ]);
  });

  it('parses bounded live workflow compatibility details returned by the bridge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ready: true,
          workflows: [
            {
              id: 'broken-workflow',
              name: 'Broken Workflow',
              kind: 'image',
              modes: [],
              compatibility: {
                status: 'incompatible',
                message: '需要重新导入或迁移',
                missingNodeClasses: ['OldCustomNode'],
                missingInputs: [{ nodeId: '1', classType: 'PromptNode', input: 'text' }],
                unknownInputs: [],
                typeMismatches: [],
                missingModels: [],
              },
            },
          ],
        }),
      } as Response),
    );

    const status = await fetchLocalComfyUiStatus();
    expect(status.workflows[0]?.compatibility).toMatchObject({
      status: 'incompatible',
      missingNodeClasses: ['OldCustomNode'],
      missingInputs: [{ input: 'text' }],
    });
  });

  it('sends remote ComfyUI connection settings only to the canvas bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ready: true, workflows: [] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await fetchComfyUiStatus({
      id: 'comfyui-remote-s1-a1b2c3d4',
      baseUrl: 'https://gpu.example.com/comfyui',
      apiKey: 'secret-token',
      authType: 'bearer',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:2895/api/comfyui/status');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      connectionId: 'comfyui-remote-s1-a1b2c3d4',
      baseUrl: 'https://gpu.example.com/comfyui',
      apiKey: 'secret-token',
      authType: 'bearer',
    });
  });

  it('sends Comfy Cloud credentials only to the local canvas bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ready: true, workflows: [] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await fetchComfyUiStatus({
      id: 'comfyui-cloud',
      baseUrl: 'https://cloud.comfy.org',
      apiKey: 'cloud-secret',
      authType: 'x-key',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:2895/api/comfyui/status');
    expect(String(url)).not.toContain('cloud-secret');
    expect(JSON.parse(String(init.body))).toMatchObject({
      connectionId: 'comfyui-cloud',
      baseUrl: 'https://cloud.comfy.org',
      apiKey: 'cloud-secret',
      authType: 'x-key',
    });
  });
});
