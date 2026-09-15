import { describe, expect, it } from 'vitest';
import type { FlowEdge, FlowNode } from '../canvas/nodeTypes';
import { resolvedAudioSource } from '../lib/mediaPreview';
import {
  comfyProviderNodeWorkflowFileToString,
  parseWorkflowFileString,
  toWorkflowJSON,
  workflowFileToString,
} from './workflow';

function roundTripGraph(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [
    {
      id: 'group-1',
      type: 'group',
      position: { x: 40, y: 80 },
      style: { width: 900, height: 600 },
      zIndex: -1,
      data: { kind: 'group', title: '人物镜头', description: '' },
    },
    {
      id: 'image-1',
      type: 'image',
      position: { x: 60, y: 70 },
      parentId: 'group-1',
      extent: 'parent',
      data: {
        kind: 'image',
        title: '人物参考',
        description: '主角参考图',
        imageUrl: 'data:image/png;base64,ZmFrZQ==',
        providerId: 'provider-1',
        model: 'image-model',
        composerParams: { imageType: '电影感' },
        generating: true,
        generationRequestId: 'request-that-must-not-return',
        generationTargetMediaSignature: 'signature-that-must-not-return',
        progress: 61,
      },
    },
    {
      id: 'text-1',
      type: 'text',
      position: { x: 1_100, y: 80 },
      style: { width: 350, height: 350 },
      data: {
        kind: 'text',
        title: '反推提示词',
        description: '文本提示词输入',
        prompt: '保留这段未生成的提示词',
        model: 'chat-model',
      },
    },
  ];
  const edges: FlowEdge[] = [
    {
      id: 'edge-1',
      type: 'flow',
      source: 'image-1',
      target: 'text-1',
      sourceHandle: 'image',
      targetHandle: 'ref',
    },
  ];
  return { nodes, edges };
}

describe('workflow file v2', () => {
  it('migrates legacy mode-switched director nodes into independent 2D and 3D kinds', () => {
    const document = {
      format: 'qiansi-canvas-workflow',
      version: 2,
      exportedAt: '2026-08-13T00:00:00.000Z',
      nodes: [
        {
          id: 'legacy-2d',
          type: 'director',
          position: { x: 0, y: 0 },
          data: { kind: 'director', title: '导演台', directorMode: '2d' },
        },
        {
          id: 'legacy-3d',
          type: 'director',
          position: { x: 520, y: 0 },
          data: { kind: 'director', title: '导演台', directorMode: '3d' },
        },
      ],
      edges: [],
    };

    const parsed = parseWorkflowFileString(JSON.stringify(document));

    expect(parsed.nodes[0]).toMatchObject({
      type: 'director-2d',
      data: { kind: 'director-2d', title: '2D导演台', directorMode: '2d' },
    });
    expect(parsed.nodes[1]).toMatchObject({
      type: 'director-3d',
      data: { kind: 'director-3d', title: '3D导演台', directorMode: '3d' },
    });
  });

  it('exports the Qiansi format and still imports the legacy Kitty format', () => {
    const graph = roundTripGraph();
    const current = JSON.parse(workflowFileToString(graph.nodes, graph.edges)) as Record<
      string,
      unknown
    >;
    expect(current.format).toBe('qiansi-canvas-workflow');

    const legacy = { ...current, format: 'kitty-canvas-workflow' };
    expect(parseWorkflowFileString(JSON.stringify(legacy)).version).toBe(2);
  });

  it('round-trips layout, grouping, node settings and concrete edge handles', () => {
    const graph = roundTripGraph();
    const parsed = parseWorkflowFileString(workflowFileToString(graph.nodes, graph.edges));

    expect(parsed.version).toBe(2);
    expect(parsed.nodes.find((node) => node.id === 'image-1')).toMatchObject({
      type: 'image',
      position: { x: 60, y: 70 },
      parentId: 'group-1',
      extent: 'parent',
      selected: false,
      dragging: false,
      data: {
        kind: 'image',
        title: '人物参考',
        imageUrl: 'data:image/png;base64,ZmFrZQ==',
        providerId: 'provider-1',
        model: 'image-model',
        composerParams: { imageType: '电影感' },
        generating: false,
        progress: 0,
      },
    });
    expect(
      parsed.nodes.find((node) => node.id === 'image-1')?.data.generationRequestId,
    ).toBeUndefined();
    expect(
      parsed.nodes.find((node) => node.id === 'image-1')?.data.generationTargetMediaSignature,
    ).toBeUndefined();
    expect(parsed.nodes.find((node) => node.id === 'text-1')?.data.prompt).toBe(
      '保留这段未生成的提示词',
    );
    expect(parsed.nodes.find((node) => node.id === 'group-1')?.style).toEqual({
      width: 900,
      height: 600,
    });
    expect(parsed.edges).toEqual([
      expect.objectContaining({
        id: 'edge-1',
        source: 'image-1',
        target: 'text-1',
        sourceHandle: 'image',
        targetHandle: 'ref',
        type: 'flow',
      }),
    ]);
  });

  it('round-trips image comparison sources and the saved divider position', () => {
    const nodes: FlowNode[] = [
      {
        id: 'source-a',
        type: 'image',
        position: { x: 20, y: 30 },
        data: {
          kind: 'image',
          title: '图片 1',
          imageUrl: 'data:image/png;base64,Zmlyc3Q=',
        },
      },
      {
        id: 'source-b',
        type: 'image',
        position: { x: 20, y: 400 },
        data: {
          kind: 'image',
          title: '图片 2',
          imageUrl: 'data:image/png;base64,c2Vjb25k',
        },
      },
      {
        id: 'comparison',
        type: 'image-compare',
        position: { x: 520, y: 160 },
        style: { width: 480, height: 320 },
        data: {
          kind: 'image-compare',
          title: '图片对比',
          comparisonPosition: 37,
        },
      },
    ];
    const edges: FlowEdge[] = ['source-a', 'source-b'].map((source, index) => ({
      id: `edge-${index + 1}`,
      type: 'flow',
      source,
      target: 'comparison',
      sourceHandle: 'image',
      targetHandle: 'images',
    }));

    const parsed = parseWorkflowFileString(workflowFileToString(nodes, edges));

    expect(parsed.nodes.find((node) => node.id === 'comparison')).toMatchObject({
      type: 'image-compare',
      position: { x: 520, y: 160 },
      style: { width: 480, height: 320 },
      data: {
        kind: 'image-compare',
        comparisonPosition: 37,
      },
    });
    expect(parsed.edges.map((edge) => edge.source)).toEqual(['source-a', 'source-b']);
    expect(parsed.edges.every((edge) => edge.targetHandle === 'images')).toBe(true);
  });

  it('round-trips the compressed 3D director thumbnail as validated image media', () => {
    const graph = roundTripGraph();
    const thumbnailUrl = 'data:image/jpeg;base64,dGh1bWJuYWls';
    graph.nodes.push({
      id: 'director-3d-1',
      type: 'director-3d',
      position: { x: 1_500, y: 80 },
      data: {
        kind: 'director-3d',
        title: '3D导演台',
        directorMode: '3d',
        directorThumbnailUrl: thumbnailUrl,
        directorThumbnailSceneKey: '["asset_panorama",0,0]',
      },
    });

    const parsed = parseWorkflowFileString(workflowFileToString(graph.nodes, graph.edges));

    expect(parsed.nodes.find((node) => node.id === 'director-3d-1')?.data).toMatchObject({
      directorThumbnailUrl: thumbnailUrl,
      directorThumbnailSceneKey: '["asset_panorama",0,0]',
    });
  });

  it('recovers imported session-only audio without treating expired Blob URLs as playable', () => {
    const expiredUrl = 'blob:http://127.0.0.1/expired-audio';
    const nodes: FlowNode[] = [
      {
        id: 'durable-audio',
        type: 'audio',
        position: { x: 0, y: 0 },
        data: {
          kind: 'audio',
          title: 'Durable voice',
          audioUrl: expiredUrl,
          audios: [expiredUrl],
          output: expiredUrl,
          bridgeAssetId: 'asset_123456',
        },
      },
      {
        id: 'session-audio',
        type: 'audio',
        position: { x: 400, y: 0 },
        data: {
          kind: 'audio',
          title: 'Session voice',
          audioUrl: expiredUrl,
          audios: [expiredUrl],
          output: expiredUrl,
          audioFileName: 'voice.webm',
        },
      },
    ];

    const parsed = parseWorkflowFileString(workflowFileToString(nodes, []));
    const durableNode = parsed.nodes.find((node) => node.id === 'durable-audio');
    const unavailableNode = parsed.nodes.find((node) => node.id === 'session-audio');
    if (!durableNode || !unavailableNode) throw new Error('Expected imported audio nodes.');
    const durable = durableNode.data;
    const unavailable = unavailableNode.data;

    expect(durable).toMatchObject({
      audioUrl: '/asset-library/files/asset_123456',
      audios: ['/asset-library/files/asset_123456'],
      output: '/asset-library/files/asset_123456',
    });
    expect(unavailable).toMatchObject({
      audioUrl: expiredUrl,
      audios: [expiredUrl],
      output: expiredUrl,
      audioFileName: 'voice.webm',
      audioSourceState: 'unavailable-after-restore',
    });
    expect(resolvedAudioSource(unavailable)).toBeUndefined();
  });

  it('orders a parent group before children even when the file lists the child first', () => {
    const graph = roundTripGraph();
    const document = JSON.parse(workflowFileToString(graph.nodes, graph.edges)) as {
      nodes: Array<Record<string, unknown>>;
    };
    const group = document.nodes.find((node) => node.id === 'group-1');
    const image = document.nodes.find((node) => node.id === 'image-1');
    const text = document.nodes.find((node) => node.id === 'text-1');
    if (!group || !image || !text) throw new Error('Invalid test fixture');
    document.nodes = [image, text, group];

    const parsed = parseWorkflowFileString(JSON.stringify(document));

    expect(parsed.nodes.map((node) => node.id)).toEqual(['text-1', 'group-1', 'image-1']);
  });

  it('keeps the existing pipeline v1 adapter unchanged', () => {
    const graph = roundTripGraph();
    const pipeline = toWorkflowJSON(graph.nodes, graph.edges);

    expect(pipeline.version).toBe(1);
    expect(pipeline.nodes.find((node) => node.id === 'text-1')).toMatchObject({
      kind: 'text',
      params: { prompt: '' },
      inputs: ['image-1'],
    });
    expect(pipeline.edges[0]).toEqual({ id: 'edge-1', source: 'image-1', target: 'text-1' });
  });

  it('creates an importable prompt-to-image canvas workflow bound to a saved ComfyUI model', () => {
    const json = comfyProviderNodeWorkflowFileToString({
      kind: 'image',
      title: 'Krea2 四视图',
      providerId: 'comfyui-local',
      model: 'comfy_four_view',
      defaultPrompt: '生成角色四视图，保持人物身份一致。',
    });
    const document = JSON.parse(json) as Record<string, unknown>;
    const parsed = parseWorkflowFileString(json);

    expect(document).toMatchObject({ format: 'qiansi-canvas-workflow', version: 2 });
    expect(parsed.version).toBe(2);
    expect(parsed.edges).toEqual([
      expect.objectContaining({ sourceHandle: 'text', targetHandle: 'prompt' }),
    ]);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes.find((node) => node.data.kind === 'text')?.data.prompt).toBe(
      '生成角色四视图，保持人物身份一致。',
    );
    expect(parsed.nodes.find((node) => node.data.kind === 'image')).toMatchObject({
      type: 'image',
      data: {
        kind: 'image',
        title: 'Krea2 四视图',
        providerId: 'comfyui-local',
        model: 'comfy_four_view',
        generating: false,
        progress: 0,
      },
    });
  });

  it('creates a usable start-and-end-frame video canvas workflow', () => {
    const json = comfyProviderNodeWorkflowFileToString({
      kind: 'video',
      title: '首尾帧视频',
      providerId: 'comfyui-local',
      model: 'comfy_first_last',
      modes: ['首尾帧'],
    });
    const parsed = parseWorkflowFileString(json);

    expect(parsed.nodes.map((node) => node.data.kind)).toEqual(
      expect.arrayContaining(['text', 'image', 'video']),
    );
    const imageInputs = parsed.nodes.filter((node) => node.data.kind === 'image');
    expect(imageInputs).toHaveLength(2);
    expect(imageInputs.map((node) => node.data.title)).toEqual(['首帧图', '尾帧图']);
    expect(imageInputs.every((node) => node.type === 'image')).toBe(true);
    const video = parsed.nodes.find((node) => node.data.kind === 'video');
    expect(video?.data).toMatchObject({
      providerId: 'comfyui-local',
      model: 'comfy_first_last',
      composerParams: { mode: '首尾帧' },
    });
    expect(parsed.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHandle: 'text', targetHandle: 'prompt' }),
        expect.objectContaining({ targetHandle: 'frame' }),
      ]),
    );
    expect(parsed.edges.filter((edge) => edge.targetHandle === 'frame')).toHaveLength(2);
  });

  it('creates an uploadable image node for an image-to-video ComfyUI workflow', () => {
    const json = comfyProviderNodeWorkflowFileToString({
      kind: 'video',
      title: '图生视频',
      providerId: 'comfyui-local',
      model: 'comfy_image_to_video',
      modes: ['图生视频'],
    });
    const parsed = parseWorkflowFileString(json);
    const imageInputs = parsed.nodes.filter((node) => node.data.kind === 'image');

    expect(imageInputs).toHaveLength(1);
    expect(imageInputs[0]).toMatchObject({
      type: 'image',
      data: { kind: 'image', title: '首帧图' },
    });
    expect(parsed.nodes.some((node) => node.data.kind === 'front-frame')).toBe(false);
    expect(parsed.edges).toContainEqual(
      expect.objectContaining({
        source: imageInputs[0]?.id,
        sourceHandle: 'image',
        targetHandle: 'frame',
      }),
    );
  });

  it('migrates legacy ComfyUI start and end inputs into uploadable image nodes', () => {
    const document = JSON.parse(
      comfyProviderNodeWorkflowFileToString({
        kind: 'video',
        title: '旧版首尾帧视频',
        providerId: 'comfyui-local',
        model: 'legacy_first_last',
        modes: ['首尾帧'],
      }),
    ) as { nodes: Array<{ id: string; type: string; data: { kind: string } }> };
    for (const node of document.nodes) {
      if (node.id.endsWith('-start') || node.id.endsWith('-end')) {
        node.type = 'front-frame';
        node.data.kind = 'front-frame';
      }
    }

    const parsed = parseWorkflowFileString(JSON.stringify(document));
    const uploadNodes = parsed.nodes.filter(
      (node) => node.id.endsWith('-start') || node.id.endsWith('-end'),
    );

    expect(uploadNodes).toHaveLength(2);
    expect(uploadNodes.every((node) => node.type === 'image' && node.data.kind === 'image')).toBe(
      true,
    );
  });

  it('creates two distinct image-reference nodes for a multi-image ComfyUI workflow', () => {
    const json = comfyProviderNodeWorkflowFileToString({
      kind: 'video',
      title: 'MiniMax H3 多图参考',
      providerId: 'comfyui-local',
      model: 'comfy_minimax_reference',
      modes: ['图片参考'],
      defaultPrompt: '让两个参考人物在镜头中自然互动。',
    });
    const parsed = parseWorkflowFileString(json);
    const references = parsed.nodes.filter((node) => node.data.kind === 'image');
    const video = parsed.nodes.find((node) => node.data.kind === 'video');

    expect(references).toHaveLength(2);
    expect(references.map((node) => node.data.title)).toEqual(['参考图 1', '参考图 2']);
    expect(new Set(references.map((node) => `${node.position.x},${node.position.y}`)).size).toBe(2);
    expect(video?.data).toMatchObject({ composerParams: { mode: '图片参考' } });
    expect(parsed.edges.filter((edge) => edge.targetHandle === 'frame')).toHaveLength(2);
  });

  it('creates a connected audio input node for a reference-audio ComfyUI workflow', () => {
    const parsed = parseWorkflowFileString(
      comfyProviderNodeWorkflowFileToString({
        kind: 'audio',
        title: '音乐重混',
        providerId: 'comfyui-local',
        model: 'comfy_audio_remix',
        supportsAudioReference: true,
      }),
    );
    const generator = parsed.nodes.find((node) => node.data.kind === 'audio' && node.data.model);
    const source = parsed.nodes.find((node) => node.data.title === '参考音频');
    expect(generator?.data).toMatchObject({ model: 'comfy_audio_remix' });
    expect(source?.data.kind).toBe('audio');
    expect(parsed.edges).toContainEqual(
      expect.objectContaining({
        source: source?.id,
        target: generator?.id,
        sourceHandle: 'audio',
        targetHandle: 'source-audio',
      }),
    );
  });

  it('creates a connected image input node for an image-conditioned 3D workflow', () => {
    const parsed = parseWorkflowFileString(
      comfyProviderNodeWorkflowFileToString({
        kind: '3d',
        title: '图片转 3D',
        providerId: 'comfyui-cloud',
        model: 'comfy_image_to_3d',
        supportsImageReference: true,
      }),
    );
    const generator = parsed.nodes.find((node) => node.data.kind === 'model-3d');
    const source = parsed.nodes.find((node) => node.data.title === '3D 参考图');
    expect(generator?.data).toMatchObject({
      providerId: 'comfyui-cloud',
      model: 'comfy_image_to_3d',
    });
    expect(source?.data.kind).toBe('image');
    expect(parsed.edges).toContainEqual(
      expect.objectContaining({
        source: source?.id,
        target: generator?.id,
        sourceHandle: 'image',
        targetHandle: 'references',
      }),
    );
  });

  it('round-trips durable 3D result URLs through canvas workflow export', () => {
    const node: FlowNode = {
      id: 'model-3d-result',
      type: 'model-3d',
      position: { x: 20, y: 30 },
      data: {
        kind: 'model-3d',
        title: '生成的 3D 模型',
        description: '',
        model3dUrl: '/output/object.glb',
        models3d: ['/output/object.glb'],
      },
    };
    const parsed = parseWorkflowFileString(workflowFileToString([node], []));
    expect(parsed.nodes[0]?.data).toMatchObject({
      model3dUrl: '/output/object.glb',
      models3d: ['/output/object.glb'],
    });
  });
});

describe('legacy workflow v1 import', () => {
  it('rebuilds deterministic positions and resolves current typed ports', () => {
    const parsed = parseWorkflowFileString(
      JSON.stringify({
        version: 1,
        nodes: [
          {
            id: 'legacy-image',
            kind: 'image',
            title: '旧图片',
            params: { imageUrl: 'https://example.com/reference.png', images: null, prompt: '' },
            inputs: [],
          },
          {
            id: 'legacy-text',
            kind: 'text',
            title: '旧提示词',
            params: { imageUrl: null, images: null, prompt: '旧版生成结果' },
            inputs: ['legacy-image'],
          },
        ],
        edges: [{ id: 'legacy-edge', source: 'legacy-image', target: 'legacy-text' }],
      }),
    );

    expect(parsed.version).toBe(1);
    expect(parsed.nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 520, y: 0 },
    ]);
    expect(parsed.nodes[1]?.data).toMatchObject({
      prompt: '旧版生成结果',
      result: '旧版生成结果',
      outputText: '旧版生成结果',
    });
    expect(parsed.edges[0]).toMatchObject({
      sourceHandle: 'image',
      targetHandle: 'ref',
      type: 'flow',
    });
  });
});

describe('workflow file validation', () => {
  const valid = () => {
    const graph = roundTripGraph();
    return JSON.parse(workflowFileToString(graph.nodes, graph.edges)) as Record<string, unknown>;
  };
  const itemAt = (document: Record<string, unknown>, key: 'nodes' | 'edges', index: number) => {
    const collection = document[key];
    const item = Array.isArray(collection) ? collection[index] : undefined;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid test fixture ${key}[${index}]`);
    }
    return item as Record<string, unknown>;
  };

  it.each([
    ['', '文件内容为空'],
    ['{broken', '文件不是有效的 JSON'],
    [JSON.stringify({ version: 9, nodes: [], edges: [] }), '不支持的工作流版本'],
    [
      JSON.stringify({ 5: { class_type: 'SaveImage', inputs: { images: ['4', 0] } } }),
      '这是 ComfyUI API JSON',
    ],
    [
      JSON.stringify({ nodes: [{ id: 5, type: 'SaveImage' }], links: [] }),
      '这是 ComfyUI 普通工作流 JSON',
    ],
  ])('rejects an invalid document without producing a partial graph', (source, message) => {
    expect(() => parseWorkflowFileString(source)).toThrow(message);
  });

  it('rejects unknown kinds and duplicate node ids', () => {
    const unknown = valid();
    itemAt(unknown, 'nodes', 0).type = 'unknown';
    expect(() => parseWorkflowFileString(JSON.stringify(unknown))).toThrow('未知节点类型');

    const duplicate = valid();
    itemAt(duplicate, 'nodes', 1).id = 'group-1';
    expect(() => parseWorkflowFileString(JSON.stringify(duplicate))).toThrow('与其它节点重复');
  });

  it('rejects dangling, incompatible and cyclic edges', () => {
    const dangling = valid();
    itemAt(dangling, 'edges', 0).target = 'missing';
    expect(() => parseWorkflowFileString(JSON.stringify(dangling))).toThrow('不存在的节点');

    const incompatible = valid();
    itemAt(incompatible, 'edges', 0).targetHandle = 'prompt';
    expect(() => parseWorkflowFileString(JSON.stringify(incompatible))).toThrow('节点端口不兼容');

    const cyclic = {
      format: 'kitty-canvas-workflow',
      version: 2,
      nodes: ['a', 'b'].map((id, index) => ({
        id,
        type: 'text',
        position: { x: index * 500, y: 0 },
        data: { kind: 'text', title: id },
      })),
      edges: [
        { id: 'a-b', source: 'a', target: 'b', sourceHandle: 'text', targetHandle: 'prompt' },
        { id: 'b-a', source: 'b', target: 'a', sourceHandle: 'text', targetHandle: 'prompt' },
      ],
    };
    expect(() => parseWorkflowFileString(JSON.stringify(cyclic))).toThrow('形成循环');
  });

  it('rejects unsafe media URLs and arbitrary style fields', () => {
    const unsafeMedia = valid();
    const node = itemAt(unsafeMedia, 'nodes', 1);
    (node.data as Record<string, unknown>).imageUrl = 'javascript:alert(1)';
    expect(() => parseWorkflowFileString(JSON.stringify(unsafeMedia))).toThrow('不安全的媒体地址');

    const unsafeStyle = valid();
    itemAt(unsafeStyle, 'nodes', 0).style = {
      width: 500,
      backgroundImage: 'url(https://example.com/track)',
    };
    expect(() => parseWorkflowFileString(JSON.stringify(unsafeStyle))).toThrow('不支持的样式字段');
  });
});
