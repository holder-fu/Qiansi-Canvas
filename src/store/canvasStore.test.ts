import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { canShowFloatingComposer } from '../composer/composerVisibility';
import { collectNodeInputs } from '../graph/graph';
import { createDefaultDirectorScene } from '../lib/directorConstraints';
import { parseCanvasPersistence } from './canvasPersistenceCodec';
import {
  flushCanvasPersistence,
  exportCanvasPersistenceConflictCopy,
  getCanvasPersistenceConflictCopy,
  isCanvasProjectRevisionConflict,
  restoreTrashIntoSnapshot,
  runCanvasHistoryTransaction,
  sanitizeNodes,
  useCanvasStore,
  type GenParams,
} from './canvasStore';
import { IMAGE_REFERENCE_PROMPT, VIDEO_REFERENCE_PROMPT } from '../lib/textReferencePrompt';
import { canvasWorkspaceStorageKey } from './canvasWorkspaceStorage';
import { useCanvasPreferences } from './canvasPreferences';

function emptyTextNode(): FlowNode {
  return {
    id: 'text-source',
    type: 'text',
    position: { x: 400, y: 300 },
    selected: true,
    style: { width: 350, height: 350 },
    data: {
      kind: 'text',
      title: '提示词',
      description: '文本提示词输入',
    },
  };
}

describe('interrupted media generation recovery', () => {
  const interruptedImage: FlowNode = {
    id: 'interrupted-image',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      title: '图片',
      description: '图片生成',
      prompt: '云海中的灵树，电影感广角镜头',
      generating: true,
      generationRequestId: 'gen-recoverable',
      progress: 42,
    },
  };

  it('keeps the request token and exposes a recovery message for restored projects', () => {
    const [restored] = sanitizeNodes([interruptedImage], {
      recoverInterruptedMediaGeneration: true,
    });

    expect(restored?.data).toMatchObject({
      generating: false,
      generationRequestId: 'gen-recoverable',
      progress: 0,
      generationError: expect.stringContaining('检查生成结果'),
    });
  });

  it.each([
    ['video', '视频'],
    ['audio', '音频'],
    ['text', '文本'],
  ] as const)('keeps an interrupted %s request only when it has no result', (kind, label) => {
    const interrupted: FlowNode = {
      id: `interrupted-${kind}`,
      type: kind,
      position: { x: 0, y: 0 },
      data: {
        kind,
        title: label,
        description: `${label}生成`,
        generating: kind === 'audio' ? false : true,
        generationRequestId: `gen-recover-${kind}`,
        progress: 61,
      },
    };

    const [restored] = sanitizeNodes([interrupted], {
      recoverInterruptedMediaGeneration: true,
    });

    expect(restored?.data).toMatchObject({
      generating: false,
      generationRequestId: `gen-recover-${kind}`,
      progress: 0,
      generationError: expect.stringContaining(label),
    });
  });

  it('still clears live request state for imported or shared workflows', () => {
    const [sanitized] = sanitizeNodes([interruptedImage]);

    expect(sanitized?.data).toMatchObject({ generating: false, progress: 0 });
    expect(sanitized?.data.generationRequestId).toBeUndefined();
  });
});

describe('canvas project revision contract', () => {
  it('blocks only a newer revision written by another tab', () => {
    expect(
      isCanvasProjectRevisionConflict(2, 'this-tab', {
        revision: 3,
        writerId: 'other-tab',
      }),
    ).toBe(true);
    expect(
      isCanvasProjectRevisionConflict(2, 'this-tab', {
        revision: 3,
        writerId: 'this-tab',
      }),
    ).toBe(false);
    expect(
      isCanvasProjectRevisionConflict(3, 'this-tab', {
        revision: 3,
        writerId: 'other-tab',
      }),
    ).toBe(true);
    expect(
      isCanvasProjectRevisionConflict(
        3,
        'this-tab',
        { revision: 3, writerId: 'baseline-tab' },
        'baseline-tab',
      ),
    ).toBe(false);
  });
});

describe('default numbered node titles', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [], clipboard: null });
  });

  it('numbers newly created image, text and video nodes independently', () => {
    const image1 = useCanvasStore.getState().addNode('image', { x: 0, y: 0 });
    const text1 = useCanvasStore.getState().addNode('text', { x: 400, y: 0 });
    const image2 = useCanvasStore.getState().addNode('image', { x: 800, y: 0 });
    const video1 = useCanvasStore.getState().addNode('video', { x: 0, y: 400 });
    const text2 = useCanvasStore.getState().addNode('text', { x: 400, y: 400 });

    const title = (id: string) =>
      useCanvasStore.getState().nodes.find((node) => node.id === id)?.data.title;
    expect(title(image1)).toBe('图片1');
    expect(title(image2)).toBe('图片2');
    expect(title(text1)).toBe('文本1');
    expect(title(text2)).toBe('文本2');
    expect(title(video1)).toBe('视频1');
  });

  it('starts a new video with audio off even when an old global preference was true', () => {
    const originalGenParams = useCanvasStore.getState().genParams;
    try {
      useCanvasStore.setState({ genParams: { ...originalGenParams, audio: true } });
      const videoId = useCanvasStore.getState().addNode('video', { x: 0, y: 0 });
      const video = useCanvasStore.getState().nodes.find((node) => node.id === videoId);

      expect(video?.data.genParams?.audio).toBe(false);
      expect(video?.data.composerParams?.videoAudioSelectionExplicit).not.toBe(true);
    } finally {
      useCanvasStore.setState({ genParams: originalGenParams });
    }
  });

  it('gives copied default nodes the next name while preserving custom titles', () => {
    const image1 = useCanvasStore.getState().addNode('image', { x: 0, y: 0 });
    useCanvasStore.getState().duplicateNode(image1);
    const imageTitles = useCanvasStore
      .getState()
      .nodes.filter((node) => node.data.kind === 'image')
      .map((node) => node.data.title);
    expect(imageTitles).toEqual(['图片1', '图片2']);

    const custom = useCanvasStore.getState().addNode('video', { x: 0, y: 400 });
    useCanvasStore.getState().updateNodeData(custom, { title: '最终成片' });
    useCanvasStore.getState().duplicateNode(custom);
    expect(
      useCanvasStore
        .getState()
        .nodes.filter((node) => node.data.kind === 'video')
        .map((node) => node.data.title),
    ).toEqual(['最终成片', '最终成片']);
  });

  it('does not carry disconnected graph-input caches into a duplicate', () => {
    const source = useCanvasStore.getState().addNode('image', { x: 0, y: 0 });
    useCanvasStore.getState().updateNodeData(source, {
      portInputs: { ref: ['/asset-library/files/old-reference.png'] },
      input: '/asset-library/files/old-reference.png',
    });

    useCanvasStore.getState().duplicateNode(source);

    const duplicate = useCanvasStore.getState().nodes.at(-1);
    expect(duplicate?.id).not.toBe(source);
    expect(duplicate?.data.portInputs).toBeUndefined();
    expect(duplicate?.data.input).toBeUndefined();
  });
});

describe('materialized graph input integrity', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [], clipboard: null });
  });

  it('clears a target and its descendants after their incoming edge is deleted', () => {
    const source: FlowNode = {
      ...emptyTextNode(),
      id: 'source',
      data: { ...emptyTextNode().data, prompt: '旧提示词' },
    };
    const target: FlowNode = {
      id: 'target',
      type: 'image',
      position: { x: 800, y: 300 },
      data: {
        kind: 'image',
        title: '目标图片',
        description: '图片生成',
        portInputs: { prompt: ['旧提示词'] },
        input: '旧提示词',
      },
    };
    const collector: FlowNode = {
      id: 'collector',
      type: 'output',
      position: { x: 1200, y: 300 },
      data: {
        kind: 'output',
        title: '结果收集',
        description: '聚合上游生成结果',
        portInputs: { in: ['stale-result'] },
        input: 'stale-result',
        output: 'stale-result',
        outputText: 'stale-result',
      },
    };
    useCanvasStore.setState({
      nodes: [source, target, collector],
      edges: [
        {
          id: 'source-target',
          source: 'source',
          sourceHandle: 'text',
          target: 'target',
          targetHandle: 'prompt',
          type: 'flow',
        },
        {
          id: 'target-collector',
          source: 'target',
          sourceHandle: 'image',
          target: 'collector',
          targetHandle: 'in',
          type: 'flow',
        },
      ],
    });

    useCanvasStore.getState().deleteEdge('source-target');

    const state = useCanvasStore.getState();
    expect(state.nodes.find((node) => node.id === 'target')?.data).toMatchObject({
      portInputs: {},
      input: undefined,
    });
    expect(state.nodes.find((node) => node.id === 'collector')?.data).toMatchObject({
      portInputs: {},
      input: undefined,
      output: [],
      outputText: undefined,
    });
  });
});

describe('compound canvas history transactions', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [], clipboard: null });
  });

  it('undoes a created target and all of its multi-source edges in one step', () => {
    const first = useCanvasStore.getState().addNode('text', { x: 0, y: 0 });
    const second = useCanvasStore.getState().addNode('text', { x: 0, y: 400 });
    useCanvasStore.setState({ past: [], future: [] });

    runCanvasHistoryTransaction(() => {
      const target = useCanvasStore.getState().addNode('image', { x: 700, y: 200 });
      useCanvasStore
        .getState()
        .onConnect({ source: first, target, sourceHandle: null, targetHandle: null });
      useCanvasStore
        .getState()
        .onConnect({ source: second, target, sourceHandle: null, targetHandle: null });
    });

    expect(useCanvasStore.getState().past).toHaveLength(1);
    expect(useCanvasStore.getState().edges).toHaveLength(2);
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual([first, second]);
    expect(useCanvasStore.getState().edges).toEqual([]);
  });
});

describe('AI SKILL panel visibility', () => {
  beforeEach(() => {
    useCanvasStore.setState({ aiSkillOpen: false });
  });

  it('shares the open state with canvas nodes', () => {
    useCanvasStore.getState().setAiSkillOpen(true);
    expect(useCanvasStore.getState().aiSkillOpen).toBe(true);

    useCanvasStore.getState().setAiSkillOpen(false);
    expect(useCanvasStore.getState().aiSkillOpen).toBe(false);
  });
});

describe('independent director node creation', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [] });
  });

  it('creates 2D and 3D directors as different node kinds with fixed names', () => {
    const store = useCanvasStore.getState();
    const twoId = store.addNode('director-2d', { x: 0, y: 0 });
    const threeId = useCanvasStore.getState().addNode('director-3d', { x: 520, y: 0 });
    const nodes = useCanvasStore.getState().nodes;

    expect(nodes.find((node) => node.id === twoId)).toMatchObject({
      type: 'director-2d',
      data: { kind: 'director-2d', title: '2D导演台' },
    });
    expect(nodes.find((node) => node.id === threeId)).toMatchObject({
      type: 'director-3d',
      data: { kind: 'director-3d', title: '3D导演台' },
    });
  });
});

describe('image node self references', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [] });
  });

  it('does not register a newly dropped image as its own composer reference', () => {
    const nodeId = useCanvasStore
      .getState()
      .addNodeWithImage('image', { x: 100, y: 100 }, 'data:image/png;base64,current', '当前图');
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);

    expect(node?.data.imageUrl).toBe('data:image/png;base64,current');
    expect(node?.data.composerReferences).toEqual([]);
    expect(node?.data.referenceOnly).toBe(true);
    const textId = useCanvasStore.getState().addNode('text', { x: 500, y: 100 });
    useCanvasStore
      .getState()
      .onConnect({ source: nodeId, target: textId, sourceHandle: null, targetHandle: null });
    const state = useCanvasStore.getState();
    expect(state.edges.some((edge) => edge.source === nodeId && edge.target === textId)).toBe(true);
    expect(Object.values(collectNodeInputs(state.nodes, state.edges, textId)).flat()).toContain(
      'data:image/png;base64,current',
    );
    if (!node) throw new Error('Source image was not created');
    expect(canShowFloatingComposer(node, false)).toBe(false);
  });
});

describe('image node library selection', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      past: [],
      future: [],
      openModal: null,
      modalNodeId: null,
      libraryImagePickerTargetId: null,
    });
  });

  it('opens a dedicated library picker and fills the target with durable library media', () => {
    const nodeId = useCanvasStore.getState().addNode('image', { x: 40, y: 60 });
    useCanvasStore.setState({ past: [], future: [] });

    useCanvasStore.getState().openLibraryImagePicker('style-library', nodeId);
    expect(useCanvasStore.getState()).toMatchObject({
      openModal: 'style-library',
      modalNodeId: null,
      libraryImagePickerTargetId: nodeId,
    });

    expect(
      useCanvasStore.getState().applyLibraryImageToNode({
        url: 'https://canvas.test/assets/style-original.png',
        previewUrl: 'https://canvas.test/previews/style.webp',
        title: '水墨风格',
        aspectRatio: '4:5',
      }),
    ).toBe(true);

    const state = useCanvasStore.getState();
    expect(state.nodes.find((node) => node.id === nodeId)?.data).toMatchObject({
      originalUrl: 'https://canvas.test/assets/style-original.png',
      previewUrl: 'https://canvas.test/previews/style.webp',
      imageUrl: 'https://canvas.test/assets/style-original.png',
      images: ['https://canvas.test/assets/style-original.png'],
      output: 'https://canvas.test/assets/style-original.png',
      imageFileName: '水墨风格',
      aspectRatio: '4:5',
      genParams: { aspectRatio: '4:5' },
    });
    expect(state.openModal).toBeNull();
    expect(state.libraryImagePickerTargetId).toBeNull();
    expect(state.past).toHaveLength(1);
  });

  it('does not enter image-picking mode for a non-image node', () => {
    const videoId = useCanvasStore.getState().addNode('video', { x: 0, y: 0 });
    useCanvasStore.getState().openLibraryImagePicker('character-library', videoId);

    expect(useCanvasStore.getState().openModal).toBeNull();
    expect(useCanvasStore.getState().libraryImagePickerTargetId).toBeNull();
  });
});

describe('style preset source images', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [], modalNodeId: null });
  });

  it('uses the retained original image when adding a style preset to the canvas', () => {
    useCanvasStore.getState().applyStylePreset({
      id: 'style-original',
      title: '原图风格',
      category: '推荐',
      tags: ['推荐'],
      thumbnail: 'data:image/webp;base64,cropped-thumbnail',
      image: 'https://canvas.test/assets/original-style.png',
      position: { x: 360, y: 180 },
    });

    const node = useCanvasStore.getState().nodes[0];
    expect(node?.data).toMatchObject({
      imageUrl: 'https://canvas.test/assets/original-style.png',
      images: ['https://canvas.test/assets/original-style.png'],
    });
    expect(node?.position).toEqual({ x: 360, y: 180 });
    expect(node?.data.prompt).toContain('名称：原图风格');
  });

  it('adds a style-only reference without replacing the command prompt', () => {
    const nodeId = useCanvasStore.getState().addNode('image', { x: 0, y: 0 });
    useCanvasStore.getState().updateNodeData(nodeId, { prompt: '人物站在雨中的街道上' });
    useCanvasStore.setState({ modalNodeId: nodeId });

    useCanvasStore.getState().applyStylePreset({
      id: 'style-composer',
      title: '水墨氛围',
      category: '推荐',
      tags: ['推荐'],
      prompt: '水墨晕染、柔和留白',
      image: 'https://canvas.test/assets/style.png',
    });

    expect(useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data).toMatchObject({
      prompt: '人物站在雨中的街道上',
      composerReferences: [
        {
          id: 'style-preset:style-composer',
          type: 'image',
          url: 'https://canvas.test/assets/style.png',
          label: '水墨氛围',
          role: 'style',
          stylePrompt: '水墨晕染、柔和留白',
        },
      ],
    });
  });
});

describe('animated WebP effect reference application', () => {
  const earthZoomEffect = {
    id: 'effect-earth-zoom',
    title: '地球缩放',
    category: '空间变换',
    tags: ['空间变换', '快速拉远'],
    prompt: '从近景快速拉远到地球全景',
    imageUrl: 'https://canvas.test/assets/earth-zoom.webp',
    previewUrl: 'https://canvas.test/assets/earth-zoom.webp',
    mediaWidth: 1080,
    mediaHeight: 1920,
    bridgeAssetId: 'effect-earth-zoom-webp',
    position: { x: 320, y: 180 },
  };

  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      past: [],
      future: [],
      selectedNodeId: null,
      modalNodeId: null,
      openModal: 'effects-library',
    });
  });

  it('adds one undoable reference-only image asset with a stable graph output', () => {
    useCanvasStore.getState().applyEffectPreset(earthZoomEffect);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]).toMatchObject({
      type: 'image',
      position: { x: 320, y: 180 },
      data: {
        kind: 'image',
        title: '素材-特效-地球缩放',
        referenceOnly: true,
        effectPresetId: 'effect-earth-zoom',
        effectPreset: '地球缩放',
        effectPrompt: '从近景快速拉远到地球全景',
        originalUrl: 'https://canvas.test/assets/earth-zoom.webp',
        imageUrl: 'https://canvas.test/assets/earth-zoom.webp',
        images: ['https://canvas.test/assets/earth-zoom.webp'],
        output: 'https://canvas.test/assets/earth-zoom.webp',
        previewUrl: 'https://canvas.test/assets/earth-zoom.webp',
        bridgeAssetId: 'effect-earth-zoom-webp',
      },
    });
    expect(state.edges).toHaveLength(0);
    expect(state.past).toHaveLength(1);
    expect(state.openModal).toBeNull();

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it('connects to the active video without replacing its prompt or existing media', () => {
    const targetId = useCanvasStore.getState().addNode('video', { x: 900, y: 200 });
    useCanvasStore.getState().updateNodeData(targetId, {
      prompt: '人物站在悬崖边',
      videoUrl: 'https://canvas.test/assets/existing-result.mp4',
      output: 'https://canvas.test/assets/existing-result.mp4',
    });
    useCanvasStore.setState({
      past: [],
      future: [],
      modalNodeId: targetId,
      openModal: 'effects-library',
    });

    useCanvasStore.getState().applyEffectPreset(earthZoomEffect);

    const state = useCanvasStore.getState();
    const target = state.nodes.find((node) => node.id === targetId);
    const effect = state.nodes.find((node) => node.id !== targetId);
    expect(target?.data).toMatchObject({
      prompt: '人物站在悬崖边',
      videoUrl: 'https://canvas.test/assets/existing-result.mp4',
      output: 'https://canvas.test/assets/existing-result.mp4',
      composerParams: { mode: '全能参考', effectReferenceSourceId: effect?.id },
    });
    expect(effect?.data.referenceOnly).toBe(true);
    expect(state.edges).toContainEqual(
      expect.objectContaining({
        source: effect?.id,
        sourceHandle: 'image',
        target: targetId,
        targetHandle: 'frame',
      }),
    );
    expect(target?.data.portInputs?.frame).toEqual(['https://canvas.test/assets/earth-zoom.webp']);
    expect(state.past).toHaveLength(1);

    useCanvasStore.getState().undo();
    const restored = useCanvasStore.getState();
    expect(restored.nodes).toHaveLength(1);
    expect(restored.nodes[0]?.data).toMatchObject({
      prompt: '人物站在悬崖边',
      videoUrl: 'https://canvas.test/assets/existing-result.mp4',
    });
    expect(restored.edges).toHaveLength(0);
  });

  it('replaces the active effect connection while leaving the previous asset recoverable', () => {
    const targetId = useCanvasStore.getState().addNode('video', { x: 900, y: 200 });
    useCanvasStore.setState({ past: [], future: [], modalNodeId: targetId });
    useCanvasStore.getState().applyEffectPreset(earthZoomEffect);
    const firstEffect = useCanvasStore
      .getState()
      .nodes.find((node) => node.data.effectPresetId === earthZoomEffect.id);

    useCanvasStore.setState({ modalNodeId: targetId, openModal: 'effects-library' });
    useCanvasStore.getState().applyEffectPreset({
      ...earthZoomEffect,
      id: 'effect-dolly-zoom',
      title: '希区柯克变焦',
      prompt: '主体尺寸稳定，背景透视剧烈变化',
      imageUrl: 'https://canvas.test/assets/dolly-zoom.webp',
    });

    const state = useCanvasStore.getState();
    const currentEffect = state.nodes.find(
      (node) => node.data.effectPresetId === 'effect-dolly-zoom',
    );
    expect(state.nodes).toContainEqual(firstEffect);
    expect(state.edges.filter((edge) => edge.target === targetId)).toEqual([
      expect.objectContaining({ source: currentEffect?.id, targetHandle: 'frame' }),
    ]);
    expect(
      state.nodes.find((node) => node.id === targetId)?.data.composerParams
        ?.effectReferenceSourceId,
    ).toBe(currentEffect?.id);
  });

  it('keeps one dedicated effect reference when effect assets are connected manually', () => {
    useCanvasStore.getState().applyEffectPreset(earthZoomEffect);
    useCanvasStore.getState().applyEffectPreset({
      ...earthZoomEffect,
      id: 'effect-dolly-zoom',
      title: '希区柯克变焦',
      imageUrl: 'https://canvas.test/assets/dolly-zoom.webp',
    });
    const firstEffect = useCanvasStore
      .getState()
      .nodes.find((node) => node.data.effectPresetId === earthZoomEffect.id);
    const secondEffect = useCanvasStore
      .getState()
      .nodes.find((node) => node.data.effectPresetId === 'effect-dolly-zoom');
    const targetId = useCanvasStore.getState().addNode('video', { x: 900, y: 200 });
    if (!firstEffect || !secondEffect) throw new Error('Expected both effect assets');

    useCanvasStore.getState().onConnect({
      source: firstEffect.id,
      sourceHandle: 'image',
      target: targetId,
      targetHandle: 'frame',
    });
    useCanvasStore.getState().onConnect({
      source: secondEffect.id,
      sourceHandle: 'image',
      target: targetId,
      targetHandle: 'frame',
    });

    const state = useCanvasStore.getState();
    expect(state.edges.filter((edge) => edge.target === targetId)).toEqual([
      expect.objectContaining({ source: secondEffect.id, targetHandle: 'frame' }),
    ]);
    expect(state.nodes.find((node) => node.id === targetId)?.data.composerParams).toMatchObject({
      mode: '全能参考',
      effectReferenceSourceId: secondEffect.id,
    });
  });
});

describe('camera prompt application', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [], modalNodeId: null });
  });

  it('persists multiple camera chips and toggles a selected camera off', () => {
    const nodeId = useCanvasStore.getState().addNode('video', { x: 0, y: 0 });
    useCanvasStore.getState().updateNodeData(nodeId, { prompt: '人物穿过雨夜街道' });

    useCanvasStore.setState({ modalNodeId: nodeId });
    useCanvasStore.getState().applyCameraPreset({
      id: 'tilt-up',
      title: '镜头上摇',
      category: '基础运镜',
      tags: ['基础运镜', '镜头上摇'],
      prompt: '镜头从人物脚步平稳上摇到面部',
    });
    useCanvasStore.setState({ modalNodeId: nodeId });
    useCanvasStore.getState().applyCameraPreset({
      id: 'orbit-down',
      title: '镜头盘旋下降',
      category: '旋转',
      tags: ['旋转', '镜头盘旋下降'],
      prompt: '围绕主体盘旋并逐渐降低机位',
    });

    expect(useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data).toMatchObject({
      cameraPresets: [
        { id: 'tilt-up', title: '镜头上摇', prompt: '镜头从人物脚步平稳上摇到面部' },
        { id: 'orbit-down', title: '镜头盘旋下降', prompt: '围绕主体盘旋并逐渐降低机位' },
      ],
      cameraPreset: '镜头盘旋下降',
    });
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data.prompt,
    ).toContain('运镜：镜头上摇');
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data.prompt,
    ).toContain('运镜：镜头盘旋下降');

    useCanvasStore.setState({ modalNodeId: nodeId });
    useCanvasStore.getState().applyCameraPreset({
      id: 'tilt-up',
      title: '镜头上摇',
      category: '基础运镜',
      tags: ['基础运镜', '镜头上摇'],
      prompt: '镜头从人物脚步平稳上摇到面部',
    });

    const updated = useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data;
    expect(updated?.cameraPresets).toEqual([
      { id: 'orbit-down', title: '镜头盘旋下降', prompt: '围绕主体盘旋并逐渐降低机位' },
    ]);
    expect(updated?.prompt).not.toContain('镜头上摇');
    expect(updated?.prompt).toContain('运镜：镜头盘旋下降');
  });
});

describe('character preset source images', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [], modalNodeId: null });
  });

  it('applies the selected real character references to an existing node instead of the cover', () => {
    const nodeId = useCanvasStore.getState().addNode('image', { x: 0, y: 0 });
    useCanvasStore.setState({ modalNodeId: nodeId });

    useCanvasStore.getState().applyCharacterPreset({
      id: 'character-original',
      title: '原图角色',
      category: '角色',
      tags: ['角色'],
      thumbnail: 'data:image/webp;base64,cropped-thumbnail',
      image: 'https://canvas.test/assets/original-character.png',
      referenceImages: {
        standing: 'https://canvas.test/assets/standing.png',
        portrait: 'https://canvas.test/assets/portrait.png',
      },
    });

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data.composerReferences,
    ).toEqual([
      {
        id: 'character-preset:character-original:standing',
        type: 'image',
        url: 'https://canvas.test/assets/standing.png',
        label: '原图角色 角色立绘',
        role: 'character',
      },
      {
        id: 'character-preset:character-original:portrait',
        type: 'image',
        url: 'https://canvas.test/assets/portrait.png',
        label: '原图角色 脸部近景',
        role: 'character',
      },
    ]);
  });

  it('keeps the user prompt when applying character identity references', () => {
    const nodeId = useCanvasStore.getState().addNode('image', { x: 0, y: 0 });
    useCanvasStore.getState().updateNodeData(nodeId, { prompt: '用户自己的场景与动作描述' });
    useCanvasStore.setState({ modalNodeId: nodeId });

    useCanvasStore.getState().applyCharacterPreset({
      id: 'character-preserve-prompt',
      title: '角色甲',
      category: '角色',
      tags: ['角色'],
      prompt: '黑色短发，蓝色外套',
      referenceImages: { portrait: 'portrait.png' },
    });

    const data = useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data;
    expect(data?.prompt).toBe('用户自己的场景与动作描述');
    expect(data?.characterPrompt).toContain('黑色短发');
    expect(data?.composerReferences?.[0]).toMatchObject({ role: 'character' });
  });

  it('adds one undoable four-image character sheet to the canvas', () => {
    useCanvasStore.setState({ openModal: 'character-library' });

    useCanvasStore.getState().applyCharacterPreset({
      id: 'character-sheet',
      title: '清新少女',
      category: '现代',
      tags: ['现代', '少女'],
      thumbnail: 'portrait.webp',
      image: 'standing.png',
      referenceImages: {
        standing: 'standing.png',
        portrait: 'portrait.webp',
        expressions: 'expressions.png',
        turnaround: 'turnaround.png',
      },
      position: { x: 100, y: 200 },
    });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(4);
    expect(state.nodes.map((node) => node.type)).toEqual(['image', 'image', 'image', 'image']);
    expect(state.nodes.map((node) => node.position)).toEqual([
      { x: 100, y: 200 },
      { x: 350, y: 200 },
      { x: 600, y: 200 },
      { x: 100, y: 544 },
    ]);
    expect(state.nodes.map((node) => node.data.imageFileName)).toEqual([
      '清新少女 角色立绘',
      '清新少女 脸部近景',
      '清新少女 表情参考',
      '清新少女 三视图',
    ]);
    expect(state.nodes.map((node) => node.data.imageUrl)).toEqual([
      'standing.png',
      'portrait.webp',
      'expressions.png',
      'turnaround.png',
    ]);
    expect(
      state.nodes.map((node) => [node.data.canvasFrameWidth, node.data.canvasFrameHeight]),
    ).toEqual([
      [236, 294],
      [236, 294],
      [236, 294],
      [736, 414],
    ]);
    expect(state.past).toHaveLength(1);
    expect(state.openModal).toBeNull();

    state.undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it('adds only the selected available character references and keeps them compact', () => {
    useCanvasStore.getState().applyCharacterPreset({
      id: 'partial-character-sheet',
      title: '部分资料角色',
      category: '现代',
      tags: ['现代'],
      referenceImages: {
        portrait: 'portrait.png',
        expressions: 'expressions.png',
      },
      position: { x: 50, y: 80 },
    });

    const state = useCanvasStore.getState();
    expect(state.nodes.map((node) => node.data.characterReferenceKind)).toEqual([
      'portrait',
      'expressions',
    ]);
    expect(state.nodes.map((node) => node.position)).toEqual([
      { x: 50, y: 80 },
      { x: 300, y: 80 },
    ]);
    expect(state.past).toHaveLength(1);
  });

  it('does not fabricate canvas nodes from the cover image when reference slots are empty', () => {
    useCanvasStore.setState({ openModal: 'character-library' });

    useCanvasStore.getState().applyCharacterPreset({
      id: 'cover-only-character',
      title: '只有封面的角色',
      category: '现代',
      tags: ['现代'],
      thumbnail: 'cover.webp',
      image: 'original.png',
      position: { x: 100, y: 200 },
    });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(0);
    expect(state.past).toHaveLength(0);
    expect(state.openModal).toBe('character-library');
  });
});

describe('declarative plugin node propagation', () => {
  it('passes connected upstream data through to existing downstream nodes', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'source',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { kind: 'text', title: '来源', output: '插件数据' },
        },
        {
          id: 'plugin',
          type: 'plugin',
          position: { x: 300, y: 0 },
          data: { kind: 'plugin', title: '第三方节点', pluginId: 'example-tools' },
        },
        {
          id: 'sink',
          type: 'output',
          position: { x: 600, y: 0 },
          data: { kind: 'output', title: '结果' },
        },
      ],
      edges: [
        {
          id: 'source-plugin',
          source: 'source',
          target: 'plugin',
          sourceHandle: 'text',
          targetHandle: 'in',
        },
        {
          id: 'plugin-sink',
          source: 'plugin',
          target: 'sink',
          sourceHandle: 'out',
          targetHandle: 'in',
        },
      ],
      past: [],
      future: [],
    });

    useCanvasStore.getState().propagate('source');

    const nodes = useCanvasStore.getState().nodes;
    expect(nodes.find((node) => node.id === 'plugin')?.data).toMatchObject({
      input: '插件数据',
      output: '插件数据',
    });
    expect(nodes.find((node) => node.id === 'sink')?.data.output).toBe('插件数据');
  });
});

describe('text starter node creation', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [emptyTextNode()],
      edges: [],
      past: [],
      future: [],
      selectedNodeId: 'text-source',
    });
  });

  it.each([['text-to-video', 'video', 'text-source', '文生视频']] as const)(
    'creates and connects the %s module',
    (starter, kind, source, title) => {
      const createdId = useCanvasStore
        .getState()
        .createTextStarterNode('text-source', starter, 'starter prompt');
      const state = useCanvasStore.getState();

      expect(createdId).toBeTruthy();
      expect(state.nodes.find((node) => node.id === createdId)?.data).toMatchObject({
        kind,
        title,
      });
      expect(state.edges).toHaveLength(1);
      expect(state.edges[0]).toMatchObject({ source, target: createdId });
      expect(state.nodes.find((node) => node.id === 'text-source')?.data).toMatchObject({
        prompt: undefined,
        textInstruction: 'starter prompt',
        textContentRole: 'instruction',
      });
    },
  );

  it('creates an image on the left and connects it into the text reference input', () => {
    const createdId = useCanvasStore
      .getState()
      .createTextStarterNode('text-source', 'image-to-prompt', 'analyse image');
    const state = useCanvasStore.getState();

    expect(createdId).toBeTruthy();
    expect(state.nodes.find((node) => node.id === createdId)?.data).toMatchObject({
      kind: 'image',
      title: '参考图片',
      referenceOnly: true,
    });
    expect(state.edges[0]).toMatchObject({
      source: createdId,
      target: 'text-source',
      sourceHandle: 'image',
      targetHandle: 'ref',
    });
  });

  it('creates a reference video before the text node and connects it into the video input', () => {
    const createdId = useCanvasStore
      .getState()
      .createTextStarterNode('text-source', 'video-to-prompt', 'analyse video');
    const state = useCanvasStore.getState();
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(createdId).toBeTruthy();
    expect(createdNode?.data).toMatchObject({
      kind: 'video',
      title: '参考视频',
      referenceOnly: true,
    });
    expect(createdNode?.position.x).toBeLessThan(emptyTextNode().position.x);
    expect(createdNode?.position.y).toBe(emptyTextNode().position.y);
    expect(state.edges[0]).toMatchObject({
      source: createdId,
      target: 'text-source',
      sourceHandle: 'video',
      targetHandle: 'video-ref',
    });
    expect(state.nodes.find((node) => node.id === 'text-source')?.data).toMatchObject({
      prompt: undefined,
      textInstruction: 'analyse video',
      textContentRole: 'instruction',
    });
  });

  it('undoes the prompt, created node and edge as one operation', () => {
    useCanvasStore
      .getState()
      .createTextStarterNode('text-source', 'text-to-video', 'starter prompt');

    expect(useCanvasStore.getState().past).toHaveLength(1);
    useCanvasStore.getState().undo();

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.id).toBe('text-source');
    expect(state.nodes[0]?.data.prompt).toBeUndefined();
    expect(state.nodes[0]?.data.textInstruction).toBeUndefined();
    expect(state.edges).toHaveLength(0);
  });

  it('creates a video module connected to an audio track', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'audio-source',
          type: 'audio',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'audio',
            title: '音频',
            audioUrl: 'http://127.0.0.1:2895/assets/voice.mp3',
            audios: ['http://127.0.0.1:2895/assets/voice.mp3'],
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoFromAudio('audio-source');
    const state = useCanvasStore.getState();

    expect(state.nodes.find((node) => node.id === createdId)?.data).toMatchObject({
      kind: 'video',
      title: '音频生视频',
      composerParams: { mode: '全能参考' },
    });
    expect(state.edges[0]).toMatchObject({
      source: 'audio-source',
      target: createdId,
      sourceHandle: 'audio',
      targetHandle: 'audio-track',
    });
    expect(state.nodes.find((node) => node.id === createdId)?.data.portInputs).toEqual({
      'audio-track': ['http://127.0.0.1:2895/assets/voice.mp3'],
    });
  });

  it('does not create an audio-driven video before the audio node has real media', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'empty-audio',
          type: 'audio',
          position: { x: 0, y: 0 },
          data: { kind: 'audio', title: '空音频' },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    expect(useCanvasStore.getState().createVideoFromAudio('empty-audio')).toBeNull();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it('does not create an audio-driven video from an expired restored Blob', () => {
    const expiredUrl = 'blob:http://127.0.0.1/expired-audio';
    useCanvasStore.setState({
      nodes: [
        {
          id: 'expired-audio',
          type: 'audio',
          position: { x: 0, y: 0 },
          data: {
            kind: 'audio',
            title: '失效音频',
            audioUrl: expiredUrl,
            audios: [expiredUrl],
            output: expiredUrl,
            audioSourceState: 'unavailable-after-restore',
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    expect(useCanvasStore.getState().createVideoFromAudio('expired-audio')).toBeNull();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it('creates a selected video remake node connected through the source-video port', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'video',
            title: '镜头 01',
            videoUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
            videos: ['http://127.0.0.1:2895/assets/shot-01.mp4'],
            aspectRatio: '16:9',
            mediaWidth: 1596,
            mediaHeight: 682,
            durationSeconds: 12.4,
            genParams: { duration: 10, resolution: '1080P', videoAspectRatio: 'Auto' },
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoRemake('video-source');
    const state = useCanvasStore.getState();
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(createdNode).toMatchObject({
      selected: true,
      data: {
        kind: 'video',
        title: '镜头 01 · 片段重拍',
        aspectRatio: '21:9',
        genParams: {
          aspectRatio: '21:9',
          videoAspectRatio: '21:9',
          duration: 12,
          resolution: '1080P',
          count: 1,
        },
        composerParams: {
          mode: '全能参考',
          videoTool: 'remake',
          sourceVideoId: 'video-source',
          sourceVideoDuration: 12.4,
        },
      },
    });
    expect(state.selectedNodeId).toBe(createdId);
    expect(state.edges[0]).toMatchObject({
      source: 'video-source',
      target: createdId,
      sourceHandle: 'video',
      targetHandle: 'source-video',
    });
    expect(createdNode?.data.portInputs).toEqual({
      'source-video': ['http://127.0.0.1:2895/assets/shot-01.mp4'],
    });
  });

  it('creates a selected video enhance node connected through the source-video port', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'video',
            title: '镜头 01',
            videoUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
            videos: ['http://127.0.0.1:2895/assets/shot-01.mp4'],
            aspectRatio: '16:9',
            genParams: { duration: 10, resolution: '720P' },
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoEnhance('video-source');
    const state = useCanvasStore.getState();
    const sourceNode = state.nodes.find((node) => node.id === 'video-source');
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(sourceNode?.data.videoUrl).toBe('http://127.0.0.1:2895/assets/shot-01.mp4');
    expect(createdNode).toMatchObject({
      selected: true,
      data: {
        kind: 'video',
        title: '高清 (1080P)',
        description: '配置参数生成高清视频',
        videoPreviewUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
        aspectRatio: '16:9',
        genParams: { duration: 10, resolution: '1080P', count: 1 },
        composerParams: {
          mode: '视频高清',
          videoTool: 'enhance',
          sourceVideoId: 'video-source',
          enhancementModel: 'auto',
          interpolationMode: 'none',
          slowMotionRate: 1,
        },
      },
    });
    expect(state.selectedNodeId).toBe(createdId);
    expect(state.edges[0]).toMatchObject({
      source: 'video-source',
      target: createdId,
      sourceHandle: 'video',
      targetHandle: 'source-video',
    });
    expect(createdNode?.data.portInputs).toEqual({
      'source-video': ['http://127.0.0.1:2895/assets/shot-01.mp4'],
    });
  });

  it('creates a selected video continuation node with the source video and a continuity prompt', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'video',
            title: '镜头 01',
            videoUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
            videos: ['http://127.0.0.1:2895/assets/shot-01.mp4'],
            aspectRatio: '16:9',
            genParams: { duration: 8, resolution: '720P' },
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoContinuation('video-source');
    const state = useCanvasStore.getState();
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(createdNode).toMatchObject({
      selected: true,
      data: {
        kind: 'video',
        title: '镜头 01 · 智能续写',
        description: '承接原视频结尾生成下一段连续镜头',
        videoPreviewUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
        aspectRatio: '16:9',
        genParams: { duration: 8, resolution: '720P', count: 1 },
        composerParams: {
          mode: '全能参考',
          videoTool: 'extend',
          sourceVideoId: 'video-source',
        },
      },
    });
    expect(createdNode?.data.prompt).toContain('从连接的原视频最后一帧开始自然续写');
    expect(createdNode?.data.prompt).toContain('补充下一段需要发生的剧情、动作或镜头要求');
    expect(state.selectedNodeId).toBe(createdId);
    expect(state.edges[0]).toMatchObject({
      source: 'video-source',
      target: createdId,
      sourceHandle: 'video',
      targetHandle: 'source-video',
    });
    expect(createdNode?.data.portInputs).toEqual({
      'source-video': ['http://127.0.0.1:2895/assets/shot-01.mp4'],
    });
  });

  it('creates a selected subtitle-removal node with an explicit source-video contract', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'video',
            title: '镜头 01',
            videoUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
            aspectRatio: '16:9',
            genParams: { duration: 10, resolution: '1080P' },
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore
      .getState()
      .createVideoSubtitleRemoval('video-source', 'bottom');
    const state = useCanvasStore.getState();
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(createdNode).toMatchObject({
      selected: true,
      data: {
        kind: 'video',
        title: '镜头 01 · 智能去字幕',
        aspectRatio: '16:9',
        genParams: { duration: 10, resolution: '1080P', count: 1 },
        composerParams: {
          videoTool: 'remove-subtitles',
          subtitleRegion: 'bottom',
          sourceVideoId: 'video-source',
        },
      },
    });
    expect(createdNode?.data.prompt).toContain('只移除后期烧录到画面上的字幕');
    expect(createdNode?.data.prompt).toContain('保留原视频');
    expect(state.edges[0]).toMatchObject({
      source: 'video-source',
      target: createdId,
      sourceHandle: 'video',
      targetHandle: 'source-video',
    });
    expect(createdNode?.data.portInputs).toEqual({
      'source-video': ['http://127.0.0.1:2895/assets/shot-01.mp4'],
    });
  });

  it('creates a selected general visual-edit node without modifying the source', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'video',
            title: '镜头 01',
            videoUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoVisualEdit('video-source');
    const state = useCanvasStore.getState();
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(state.nodes.find((node) => node.id === 'video-source')?.data.videoUrl).toBe(
      'http://127.0.0.1:2895/assets/shot-01.mp4',
    );
    expect(createdNode?.data).toMatchObject({
      kind: 'video',
      title: '镜头 01 · 画面编辑',
      videoPreviewUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
      composerParams: { videoTool: 'visual-edit', sourceVideoId: 'video-source' },
    });
    expect(createdNode?.data.prompt).toContain('继续描述需要替换、移除、增加、修复或调整');
    expect(state.edges[0]?.targetHandle).toBe('source-video');
  });

  it('creates a non-destructive downstream keyframe mask repair draft', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'video',
            title: '镜头 01',
            videoUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
            genParams: { duration: 8, resolution: '1080P' },
            composerParams: { temperature: 0.4 },
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const spec = {
      maskImage: 'data:image/png;base64,binary-mask',
      maskPreview: 'data:image/png;base64,preview-overlay',
      rangeStart: 1.25,
      rangeEnd: 3.75,
      keyframeTime: 2.5,
      tracking: 'provider' as const,
    };
    const createdId = useCanvasStore
      .getState()
      .createVideoMaskRepair('video-source', spec, '修复人物右手的形变');
    const state = useCanvasStore.getState();
    const sourceNode = state.nodes.find((node) => node.id === 'video-source');
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(sourceNode?.data.videoUrl).toBe('http://127.0.0.1:2895/assets/shot-01.mp4');
    expect(createdNode).toMatchObject({
      selected: true,
      position: { y: 100 },
      data: {
        kind: 'video',
        title: '镜头 01 · 关键帧蒙版修复',
        prompt: '修复人物右手的形变',
        genParams: { duration: 8, resolution: '1080P', count: 1 },
        composerParams: {
          temperature: 0.4,
          videoTool: 'masked-repair',
          sourceVideoId: 'video-source',
        },
        videoMaskRepair: spec,
      },
    });
    expect(createdNode?.position.x).toBeGreaterThan(sourceNode?.position.x ?? 0);
    expect(createdNode?.data.videoUrl).toBeUndefined();
    expect(createdNode?.data.videoPreviewUrl).toBeUndefined();
    expect(state.edges[0]).toMatchObject({
      source: 'video-source',
      target: createdId,
      sourceHandle: 'video',
      targetHandle: 'source-video',
    });
    expect(createdNode?.data.portInputs).toEqual({
      'source-video': ['http://127.0.0.1:2895/assets/shot-01.mp4'],
    });
  });

  it('creates a pending audio node connected to the source video', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'video',
            title: '镜头 01',
            videoUrl: 'http://127.0.0.1:2895/assets/shot-01.mp4',
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoAudioExtraction('video-source');
    const state = useCanvasStore.getState();
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(createdNode).toMatchObject({
      selected: true,
      data: {
        kind: 'audio',
        title: '镜头 01 · 原声音轨',
        generating: true,
        progress: 0,
        composerParams: { audioTool: 'extract-original', sourceVideoId: 'video-source' },
      },
    });
    expect(createdNode?.data.audioExtractionRequestId).toEqual(expect.any(String));
    expect(state.edges[0]).toMatchObject({
      source: 'video-source',
      target: createdId,
      sourceHandle: 'video',
      targetHandle: 'source-video',
    });
    expect(createdNode?.data.portInputs).toEqual({
      'source-video': ['http://127.0.0.1:2895/assets/shot-01.mp4'],
    });
  });

  it('exports an applied director plan into a final AI-video node', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'director-source',
          type: 'director',
          position: { x: 100, y: 100 },
          selected: true,
          data: {
            kind: 'director',
            title: '3D 导演台',
            directorConstraintPrompt: '3D导演预演：保持人物景深。',
            directorScene: {
              ...createDefaultDirectorScene(),
              stageMode: 'spatial',
              duration: 8,
              animationSampleCount: 3,
              supportingReferenceCount: 2,
            },
            images: [
              'layout-start.jpg',
              'layout-middle.jpg',
              'layout-end.jpg',
              'actor-reference.jpg',
              'scene-reference.jpg',
            ],
            output: [
              'layout-start.jpg',
              'layout-middle.jpg',
              'layout-end.jpg',
              'actor-reference.jpg',
              'scene-reference.jpg',
            ],
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoFromDirector('director-source');
    const state = useCanvasStore.getState();

    expect(state.nodes.find((node) => node.id === createdId)?.data).toMatchObject({
      kind: 'video',
      title: '3D 导演 · 最终视频',
      composerParams: {
        mode: '全能参考',
        directorSourceId: 'director-source',
        directorAnimationFrameCount: 3,
      },
    });
    expect(state.edges[0]).toMatchObject({
      source: 'director-source',
      target: createdId,
      sourceHandle: 'layout',
      targetHandle: 'frame',
    });
  });

  it('creates a connected task that plays and submits the persisted 3D previsualization', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'director-previs-source',
          type: 'director',
          position: { x: 40, y: 80 },
          data: {
            kind: 'director-3d',
            title: '3D 导演台',
            directorConstraintPrompt: '严格遵循预演机位、角色动作与身份参考。',
            directorScene: {
              ...createDefaultDirectorScene(),
              stageMode: 'spatial',
              supportingReferenceCount: 2,
            },
            imageUrl: 'layout.jpg',
            images: ['layout.jpg', 'actor.jpg', 'scene.jpg'],
            output: ['layout.jpg', 'actor.jpg', 'scene.jpg'],
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    const createdId = useCanvasStore.getState().createVideoFromDirector('director-previs-source', {
      originalUrl: 'http://127.0.0.1:2895/assets/director-previs.webm',
      previewUrl: 'http://127.0.0.1:2895/media-previews/director-previs.jpg',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      bridgeAssetId: 'asset-director-previs',
      cameraLabel: 'CAM 2 · 正面全景',
    });
    const created = useCanvasStore.getState().nodes.find((node) => node.id === createdId);

    expect(created?.data).toMatchObject({
      kind: 'video',
      title: '3D 导演 · 视频任务',
      originalUrl: 'http://127.0.0.1:2895/assets/director-previs.webm',
      videoUrl: 'http://127.0.0.1:2895/assets/director-previs.webm',
      videos: ['http://127.0.0.1:2895/assets/director-previs.webm'],
      videoPreviewUrl: 'http://127.0.0.1:2895/assets/director-previs.webm',
      directorPrevisUrl: 'http://127.0.0.1:2895/assets/director-previs.webm',
      directorPrevisCameraLabel: 'CAM 2 · 正面全景',
      bridgeAssetId: 'asset-director-previs',
      durationSeconds: 5,
      composerParams: {
        mode: '全能参考',
        directorSourceId: 'director-previs-source',
        directorAnimationFrameCount: 3,
        directorSupportingReferenceCount: 2,
        directorPrevisReferenceUrl: 'http://127.0.0.1:2895/assets/director-previs.webm',
      },
      composerReferences: [
        {
          id: 'director-previs-director-previs-source',
          type: 'video',
          url: 'http://127.0.0.1:2895/assets/director-previs.webm',
          label: '3D 动画预演 · CAM 2 · 正面全景',
        },
      ],
    });
    expect(useCanvasStore.getState().edges).toContainEqual(
      expect.objectContaining({ source: 'director-previs-source', target: createdId }),
    );
  });
});

describe('2D director image task creation', () => {
  const referenceImages = [
    'data:image/png;base64,director-layout',
    'data:image/png;base64,hero-identity',
    'data:image/png;base64,scene-identity',
  ];
  const genParams: GenParams = {
    viewCount: 3,
    aspectRatio: '9:16',
    quality: '4K',
    count: 2,
    mode: 'first-frame',
    duration: 5,
    resolution: '720P',
    audio: true,
    strength: 0.5,
  };

  function appliedDirector(overrides: Partial<FlowNode['data']> = {}): FlowNode {
    return {
      id: 'director-2d-source',
      type: 'director-2d',
      position: { x: 100, y: 160 },
      selected: true,
      data: {
        kind: 'director-2d',
        title: '2D导演台',
        directorScene: {
          ...createDefaultDirectorScene(),
          prompt: '女主站在咖啡吧台左侧，正面中景。',
        },
        directorConstraintPrompt: '锁定人物身份、左侧站位、正面朝向和中景景别。',
        directorReferenceLabels: [
          '参考图 1 · 导演构图控制图',
          '参考图 2 · 女主身份参考',
          '参考图 3 · 场景参考',
        ],
        directorLayoutUrl: referenceImages[0],
        directorOutputDirty: false,
        imageUrl: referenceImages[0],
        images: [...referenceImages],
        output: [...referenceImages],
        aspectRatio: '4:3',
        ...overrides,
      },
    };
  }

  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [appliedDirector()],
      edges: [],
      past: [],
      future: [],
      selectedNodeId: 'director-2d-source',
      genParams,
    });
  });

  it('creates a downstream image with the applied prompt, aspect ratio, references, and composer contract', () => {
    const createdId = useCanvasStore.getState().createImageFromDirector('director-2d-source');
    const state = useCanvasStore.getState();
    const createdNode = state.nodes.find((node) => node.id === createdId);

    expect(createdId).toEqual(expect.any(String));
    expect(createdNode).toMatchObject({
      type: 'image',
      selected: true,
      data: {
        kind: 'image',
        title: '2D 导演 · 构图图片',
        prompt: '女主站在咖啡吧台左侧，正面中景。',
        aspectRatio: '4:3',
        genParams: {
          aspectRatio: '4:3',
          quality: '4K',
          count: 2,
        },
        composerParams: {
          directorSourceId: 'director-2d-source',
          directorReferenceCount: 3,
          requiresImageInput: true,
        },
        portInputs: { ref: referenceImages },
      },
    });
    expect(state.selectedNodeId).toBe(createdId);
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'director-2d-source',
        target: createdId,
        sourceHandle: 'layout',
        targetHandle: 'ref',
      }),
    ]);
  });

  it('reuses the existing downstream image and connection on repeated creation', () => {
    const firstId = useCanvasStore.getState().createImageFromDirector('director-2d-source');
    useCanvasStore.setState((current) => ({
      nodes: current.nodes.map((node) =>
        node.id === firstId
          ? {
              ...node,
              data: {
                ...node.data,
                originalUrl: 'https://old.test/result.png',
                previewUrl: 'https://old.test/result-preview.webp',
                mediaWidth: 1024,
                mediaHeight: 768,
                bridgeAssetId: 'old-result',
                imageUrl: 'https://old.test/result.png',
                images: ['https://old.test/result.png'],
                output: 'https://old.test/result.png',
                imagePreviewUrl: 'https://old.test/source.png',
                imagePreviewPosterUrl: 'https://old.test/source-preview.webp',
                imageFileName: 'old-result.png',
                generationRequestId: 'old-request',
                progress: 100,
                annotationSourceUrl: 'https://old.test/unmarked.png',
                composerMarks: [],
              },
            }
          : node,
      ),
    }));
    const secondId = useCanvasStore.getState().createImageFromDirector('director-2d-source');
    const state = useCanvasStore.getState();
    const reused = state.nodes.find((node) => node.id === secondId)?.data;

    expect(secondId).toBe(firstId);
    expect(state.nodes.filter((node) => node.data.kind === 'image')).toHaveLength(1);
    expect(
      state.edges.filter((edge) => edge.source === 'director-2d-source' && edge.target === firstId),
    ).toHaveLength(1);
    expect(reused).toMatchObject({
      portInputs: { ref: referenceImages },
      generating: false,
      progress: 0,
    });
    for (const field of [
      'originalUrl',
      'previewUrl',
      'mediaWidth',
      'mediaHeight',
      'bridgeAssetId',
      'imageUrl',
      'images',
      'output',
      'imagePreviewUrl',
      'imagePreviewPosterUrl',
      'imageFileName',
      'generationRequestId',
      'annotationSourceUrl',
      'composerMarks',
    ] as const) {
      expect(reused?.[field]).toBeUndefined();
    }
  });

  it('detaches copied director tasks from live execution state and locked references', () => {
    const createdId = useCanvasStore.getState().createImageFromDirector('director-2d-source');
    useCanvasStore.setState((current) => ({
      nodes: current.nodes.map((node) =>
        node.id === createdId
          ? {
              ...node,
              data: {
                ...node.data,
                generating: true,
                generationRequestId: 'live-request',
              },
            }
          : node,
      ),
    }));

    useCanvasStore.getState().duplicateNode(createdId as string);

    const copied = useCanvasStore
      .getState()
      .nodes.find((node) => node.data.kind === 'image' && node.id !== createdId);
    expect(copied?.data).toMatchObject({ generating: false, progress: 0 });
    expect(copied?.data.generationRequestId).toBeUndefined();
    expect(copied?.data.portInputs).toBeUndefined();
    expect(copied?.data.composerReferenceSubmission).toBeUndefined();
    expect(copied?.data.composerParams).not.toHaveProperty('directorSourceId');
    expect(copied?.data.composerParams).not.toHaveProperty('directorReferenceCount');
    expect(copied?.data.composerParams).not.toHaveProperty('requiresImageInput');
  });

  it('rejects a dirty director snapshot without mutating the graph', () => {
    useCanvasStore.setState({
      nodes: [appliedDirector({ directorOutputDirty: true })],
      edges: [],
      past: [],
      future: [],
    });

    expect(useCanvasStore.getState().createImageFromDirector('director-2d-source')).toBeNull();
    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.data.kind).toBe('director-2d');
    expect(state.edges).toEqual([]);
    expect(state.past).toEqual([]);
  });

  it('blocks an existing image task after its director draft changes', async () => {
    const createdId = useCanvasStore.getState().createImageFromDirector('director-2d-source');
    expect(createdId).toEqual(expect.any(String));
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'director-2d-source'
          ? { ...node, data: { ...node.data, directorOutputDirty: true } }
          : node,
      ),
    }));
    const pastBefore = useCanvasStore.getState().past;

    await useCanvasStore.getState().generateNode(createdId as string);

    const state = useCanvasStore.getState();
    expect(state.nodes.find((node) => node.id === createdId)?.data).toMatchObject({
      generating: false,
      generationError: '2D 导演台站位已更改，请先重新应用导演台。',
    });
    expect(state.past).toBe(pastBefore);
  });

  it('blocks generation when the image task ratio no longer matches the control image', async () => {
    const createdId = useCanvasStore.getState().createImageFromDirector('director-2d-source');
    useCanvasStore.setState((current) => ({
      nodes: current.nodes.map((node) =>
        node.id === createdId
          ? {
              ...node,
              data: {
                ...node.data,
                aspectRatio: '9:16',
                genParams: { ...node.data.genParams, aspectRatio: '9:16' },
              },
            }
          : node,
      ),
    }));
    const pastBefore = useCanvasStore.getState().past;

    await useCanvasStore.getState().generateNode(createdId as string);

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === createdId)?.data,
    ).toMatchObject({
      generating: false,
      generationError: '图片节点画幅已与 2D 导演控制图不一致，请回到导演台重新应用站位。',
    });
    expect(useCanvasStore.getState().past).toBe(pastBefore);
  });
});

describe('connected text node prompt state', () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], future: [] });
  });

  it.each([
    ['image', 'image', 'ref', IMAGE_REFERENCE_PROMPT],
    ['video', 'video', 'video-ref', VIDEO_REFERENCE_PROMPT],
  ] as const)(
    'shows the %s analysis prompt when that media type is connected',
    (kind, sourceHandle, targetHandle, expectedPrompt) => {
      useCanvasStore.setState({
        nodes: [
          {
            id: 'media-source',
            type: kind,
            position: { x: 0, y: 0 },
            data: { kind, title: kind === 'image' ? '参考图片' : '参考视频' },
          },
          emptyTextNode(),
        ],
      });

      useCanvasStore.getState().onConnect({
        source: 'media-source',
        target: 'text-source',
        sourceHandle,
        targetHandle,
      });

      const textData = useCanvasStore
        .getState()
        .nodes.find((node) => node.id === 'text-source')?.data;
      expect(textData?.prompt).toBeUndefined();
      expect(textData?.textInstruction).toBe(expectedPrompt);
      expect(textData?.textContentRole).toBe('instruction');
      expect(textData?.connectionPromptPreset).toBe(kind);
    },
  );

  it('returns an automatically prompted text node to its default state after disconnecting', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'image-source',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { kind: 'image', title: '参考图片' },
        },
        emptyTextNode(),
      ],
    });
    useCanvasStore.getState().onConnect({
      source: 'image-source',
      target: 'text-source',
      sourceHandle: 'image',
      targetHandle: 'ref',
    });
    const edgeId = useCanvasStore.getState().edges[0]?.id;
    expect(edgeId).toBeTruthy();
    if (!edgeId) throw new Error('Expected the image reference edge to be created.');

    useCanvasStore.getState().deleteEdge(edgeId);

    const textData = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === 'text-source')?.data;
    expect(textData?.prompt).toBeUndefined();
    expect(textData?.textInstruction).toBeUndefined();
    expect(textData?.connectionPromptPreset).toBeUndefined();
  });

  it('keeps a completed text result when its automatic media prompt is disconnected', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'image-source',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { kind: 'image', title: '参考图片' },
        },
        emptyTextNode(),
      ],
    });
    useCanvasStore.getState().onConnect({
      source: 'image-source',
      target: 'text-source',
      sourceHandle: 'image',
      targetHandle: 'ref',
    });
    useCanvasStore.getState().updateNodeData('text-source', {
      result: '已反推的提示词',
      outputText: '已反推的提示词',
      output: '已反推的提示词',
    });
    const edgeId = useCanvasStore.getState().edges[0]?.id;
    if (!edgeId) throw new Error('Expected the image reference edge to be created.');

    useCanvasStore.getState().deleteEdge(edgeId);

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'text-source')?.data,
    ).toMatchObject({
      textInstruction: undefined,
      connectionPromptPreset: undefined,
      result: '已反推的提示词',
      outputText: '已反推的提示词',
      output: '已反推的提示词',
    });
  });

  it('hydrates the connected prompt when importing an older workflow without the preset marker', () => {
    useCanvasStore.getState().importWorkflow(
      [
        {
          id: 'video-source',
          type: 'video',
          position: { x: 0, y: 0 },
          data: { kind: 'video', title: '参考视频' },
        },
        emptyTextNode(),
      ],
      [
        {
          id: 'video-text',
          source: 'video-source',
          target: 'text-source',
          sourceHandle: 'video',
          targetHandle: 'video-ref',
        },
      ],
    );

    const textData = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === 'text-source')?.data;
    expect(textData?.prompt).toBeUndefined();
    expect(textData?.textInstruction).toBe(VIDEO_REFERENCE_PROMPT);
    expect(textData?.connectionPromptPreset).toBe('video');
  });
});

describe('canvas groups', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      past: [],
      future: [],
      trash: [],
      deleteConfirm: null,
    });
    useCanvasPreferences.setState({ confirmMoveToTrash: true });
  });

  it('wraps selected nodes using their rendered sizes', () => {
    const first: FlowNode = {
      ...emptyTextNode(),
      id: 'first',
      position: { x: 100, y: 120 },
      style: { width: 200, height: 100 },
    };
    const second: FlowNode = {
      ...emptyTextNode(),
      id: 'second',
      position: { x: 400, y: 180 },
      style: { width: 150, height: 120 },
    };
    useCanvasStore.setState({ nodes: [first, second] });

    useCanvasStore.getState().createGroupFromSelection();

    const nodes = useCanvasStore.getState().nodes;
    const group = nodes.find((node) => node.data.kind === 'group');
    expect(group).toMatchObject({
      position: { x: 64, y: 56 },
      style: { width: 522, height: 280 },
    });
    expect(nodes.filter((node) => node.parentId === group?.id)).toHaveLength(2);
    expect(nodes.find((node) => node.id === 'first')).toMatchObject({
      position: { x: 36, y: 64 },
      expandParent: true,
    });
  });

  it('shrinks a group without changing the children absolute positions', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          width: 1000,
          height: 800,
          measured: { width: 1000, height: 800 },
          style: { width: 1000, height: 800 },
          data: { kind: 'group', title: '分组' },
        },
        {
          ...emptyTextNode(),
          id: 'first',
          parentId: 'group',
          position: { x: 100, y: 100 },
          style: { width: 200, height: 100 },
        },
        {
          ...emptyTextNode(),
          id: 'second',
          parentId: 'group',
          position: { x: 500, y: 250 },
          style: { width: 150, height: 120 },
        },
      ],
    });

    useCanvasStore.getState().fitGroupsToChildren();

    const nodes = useCanvasStore.getState().nodes;
    expect(nodes.find((node) => node.id === 'group')).toMatchObject({
      position: { x: 64, y: 36 },
      width: 622,
      height: 370,
      measured: { width: 622, height: 370 },
      style: { width: 622, height: 370 },
    });
    expect(nodes.find((node) => node.id === 'first')).toMatchObject({
      position: { x: 36, y: 64 },
      expandParent: true,
    });
    expect(nodes.find((node) => node.id === 'second')?.position).toEqual({ x: 436, y: 214 });
  });

  it('keeps a smaller measured child attached when it is inside the fitted group', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 100, y: 100 },
          style: { width: 422, height: 450 },
          data: { kind: 'group', title: '分组' },
        },
        {
          ...emptyTextNode(),
          id: 'child',
          parentId: 'group',
          extent: 'parent',
          position: { x: 36, y: 64 },
          measured: { width: 350, height: 350 },
          style: { width: 350, height: 350 },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    useCanvasStore.getState().detachOutOfBoundsChildren();

    expect(useCanvasStore.getState().nodes.find((node) => node.id === 'child')).toMatchObject({
      parentId: 'group',
      extent: 'parent',
      position: { x: 36, y: 64 },
    });
  });

  it('explains that deleting a group also deletes its children', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          data: { kind: 'group', title: '镜头分组' },
        },
        { ...emptyTextNode(), id: 'child', parentId: 'group' },
      ],
    });

    useCanvasStore.getState().requestDeleteNode('group');

    expect(useCanvasStore.getState().deleteConfirm).toMatchObject({
      title: '将整个分组移到回收站？',
      nodeTitle: '镜头分组 · 1个节点',
    });
    expect(useCanvasStore.getState().deleteConfirm?.description).toContain('拆解分组');
  });

  it('moves a node directly to trash when confirmation is disabled', () => {
    useCanvasPreferences.setState({ confirmMoveToTrash: false });
    useCanvasStore.setState({ nodes: [{ ...emptyTextNode(), id: 'direct-delete' }], trash: [] });

    useCanvasStore.getState().requestDeleteNode('direct-delete');

    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(useCanvasStore.getState().trash[0]?.nodes[0]?.id).toBe('direct-delete');
    expect(useCanvasStore.getState().deleteConfirm).toBeNull();
  });

  it('applies the confirmation preference to keyboard removal changes', () => {
    useCanvasStore.setState({ nodes: [{ ...emptyTextNode(), id: 'keyboard-delete' }], trash: [] });

    useCanvasStore.getState().onNodesChange([{ id: 'keyboard-delete', type: 'remove' }]);

    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toContain('keyboard-delete');
    expect(useCanvasStore.getState().deleteConfirm?.nodeId).toBe('keyboard-delete');

    useCanvasStore.getState().deleteConfirm?.onConfirm();
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(useCanvasStore.getState().trash[0]?.nodes[0]?.id).toBe('keyboard-delete');
  });

  it('moves deleted nodes and their connected edges into the project trash', () => {
    const first = { ...emptyTextNode(), id: 'first' };
    const second = { ...emptyTextNode(), id: 'second', position: { x: 900, y: 300 } };
    useCanvasStore.setState({
      activeProjectId: 'project-trash-test',
      workspace: 'views',
      nodes: [first, second],
      edges: [{ id: 'edge', source: 'first', target: 'second', type: 'flow' }],
      trash: [],
    });

    useCanvasStore.getState().deleteNode('first');

    const state = useCanvasStore.getState();
    expect(state.nodes.map((node) => node.id)).toEqual(['second']);
    expect(state.edges).toHaveLength(0);
    expect(state.trash).toHaveLength(1);
    expect(state.trash[0]).toMatchObject({
      projectId: 'project-trash-test',
      workspace: 'views',
      nodes: [{ id: 'first' }],
      edges: [{ id: 'edge' }],
    });
  });

  it('restores a trashed node and any connection whose endpoints still exist', () => {
    const first = { ...emptyTextNode(), id: 'first' };
    const second = { ...emptyTextNode(), id: 'second', position: { x: 900, y: 300 } };
    useCanvasStore.setState({
      activeProjectId: 'project-trash-test',
      workspace: 'views',
      nodes: [first, second],
      edges: [{ id: 'edge', source: 'first', target: 'second', type: 'flow' }],
      trash: [],
    });
    useCanvasStore.getState().deleteNode('first');
    const trashId = useCanvasStore.getState().trash[0]?.id;
    expect(trashId).toBeTruthy();
    if (!trashId) throw new Error('trash item was not created');

    useCanvasStore.getState().restoreTrashItem(trashId);

    const state = useCanvasStore.getState();
    expect(state.trash).toHaveLength(0);
    expect(state.nodes.map((node) => node.id).sort()).toEqual(['first', 'second']);
    expect(state.edges).toMatchObject([{ id: 'edge', source: 'first', target: 'second' }]);
  });

  it('moves keyboard removals directly to trash when confirmation is disabled', () => {
    useCanvasPreferences.setState({ confirmMoveToTrash: false });
    useCanvasStore.setState({
      activeProjectId: 'project-trash-test',
      workspace: 'views',
      nodes: [{ ...emptyTextNode(), id: 'keyboard-node' }],
      edges: [],
      trash: [],
    });

    useCanvasStore.getState().onNodesChange([{ id: 'keyboard-node', type: 'remove' }]);

    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(useCanvasStore.getState().trash[0]?.nodes[0]?.id).toBe('keyboard-node');
  });

  it('moves a group and all of its children into one trash entry', () => {
    useCanvasStore.setState({
      activeProjectId: 'project-trash-test',
      workspace: 'views',
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 0, y: 0 },
          data: { kind: 'group', title: '镜头组' },
        },
        { ...emptyTextNode(), id: 'child', parentId: 'group' },
      ],
      edges: [],
      trash: [],
    });

    useCanvasStore.getState().deleteNode('group');

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(0);
    expect(state.trash).toHaveLength(1);
    expect(state.trash[0]?.nodes.map((node) => node.id).sort()).toEqual(['child', 'group']);
  });
});

describe('workflow import', () => {
  const originalNode = emptyTextNode();
  const importedNode: FlowNode = {
    id: 'imported-image',
    type: 'image',
    position: { x: 120, y: 80 },
    selected: true,
    dragging: true,
    data: {
      kind: 'image',
      title: '导入图片',
      generating: true,
      generationRequestId: 'stale-request',
      progress: 72,
    },
  };

  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [originalNode],
      edges: [],
      past: [],
      future: [{ nodes: [], edges: [] }],
      selectedNodeId: originalNode.id,
      referencePickerTargetId: originalNode.id,
      markPickerTargetId: originalNode.id,
      openModal: 'node-params',
      modalNodeId: originalNode.id,
    });
  });

  it('replaces the canvas atomically and clears transient state', () => {
    useCanvasStore.getState().importWorkflow([importedNode], []);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]).toMatchObject({
      id: 'imported-image',
      selected: false,
      dragging: false,
      data: { generating: false, progress: 0 },
    });
    expect(state.nodes[0]?.data.generationRequestId).toBeUndefined();
    expect(state.selectedNodeId).toBeNull();
    expect(state.referencePickerTargetId).toBeNull();
    expect(state.markPickerTargetId).toBeNull();
    expect(state.openModal).toBeNull();
    expect(state.modalNodeId).toBeNull();
    expect(state.past).toHaveLength(1);
    expect(state.future).toHaveLength(0);
  });

  it('restores the previous canvas with one undo', () => {
    useCanvasStore.getState().importWorkflow([importedNode], []);
    useCanvasStore.getState().undo();

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.id).toBe(originalNode.id);
    expect(state.edges).toHaveLength(0);
  });
});

describe('image context menu actions', () => {
  const imageNode: FlowNode = {
    id: 'image-source',
    type: 'image',
    position: { x: 100, y: 100 },
    selected: true,
    data: {
      kind: 'image',
      title: '产品主图',
      imageUrl: 'data:image/png;base64,source',
      aspectRatio: '1:1',
    },
  };

  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [imageNode],
      edges: [],
      assets: [],
      past: [],
      future: [],
      selectedNodeId: 'image-source',
    });
  });

  it('reports when an image enhancement model is not configured', async () => {
    const completed = await useCanvasStore.getState().applyEnhancement('image-source', 'panorama');
    const state = useCanvasStore.getState();

    expect(completed).toBe(false);
    expect(state.nodes[0]?.data.enhancementError).toContain('API 设置');
    expect(state.edges).toHaveLength(0);
    expect(state.past).toHaveLength(0);
  });

  it('creates a subject asset once and marks the source node', () => {
    expect(useCanvasStore.getState().createSubjectFromNode('image-source')).toBe(true);
    expect(useCanvasStore.getState().createSubjectFromNode('image-source')).toBe(false);

    const state = useCanvasStore.getState();
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0]).toMatchObject({
      sourceNodeId: 'image-source',
      title: '产品主图',
      category: 'character',
    });
    expect(state.nodes[0]?.data).toMatchObject({
      isSubject: true,
      characterPreset: '产品主图',
    });
  });
});

describe('director to video connection', () => {
  it('switches text-to-video into all-reference mode so director images reach the model', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'director',
          type: 'director',
          position: { x: 0, y: 0 },
          data: {
            kind: 'director',
            title: '导演台',
            output: ['layout.png', 'hero.png'],
          },
        },
        {
          id: 'video',
          type: 'video',
          position: { x: 500, y: 0 },
          data: {
            kind: 'video',
            title: '文生视频',
            composerParams: { mode: '文生视频' },
          },
        },
      ] as unknown as FlowNode[],
      edges: [],
      past: [],
      future: [],
    });

    useCanvasStore.getState().onConnect({
      source: 'director',
      target: 'video',
      sourceHandle: 'layout',
      targetHandle: 'frame',
    });

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'video')?.data.composerParams,
    ).toMatchObject({ mode: '全能参考', directorSourceId: 'director' });
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });
});

describe('3D director task integrity', () => {
  it('blocks a task whose unique live director edge has been disconnected', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'director-3d-source',
          type: 'director',
          position: { x: 0, y: 0 },
          data: {
            kind: 'director-3d',
            title: '3D 导演台',
            directorConstraintPrompt: '保持角色身份、机位和动作。',
            images: ['frame.jpg'],
          },
        },
        {
          id: 'director-video-task',
          type: 'video',
          position: { x: 800, y: 0 },
          data: {
            kind: 'video',
            title: '3D 导演视频任务',
            composerParams: {
              directorSourceId: 'director-3d-source',
              directorAnimationFrameCount: 1,
              directorSupportingReferenceCount: 0,
            },
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('director-video-task');

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'director-video-task')?.data
        .generationError,
    ).toContain('唯一实时导演连线');
  });
});

describe('canvas persistence', () => {
  it('flushes the latest director draft before a refresh', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size;
        },
      },
    });
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [
        {
          id: 'director-persisted',
          type: 'director',
          position: { x: 0, y: 0 },
          data: {
            kind: 'director',
            title: '导演台',
            directorScene: {
              schemaVersion: 4,
              subjects: [],
              sceneName: '高中教室',
              sceneObjects: [],
              cameraPreset: 'medium-front',
              cameraMovement: 'static',
              cameraSpeed: 'slow',
              duration: 5,
              startFrame: '',
              endFrame: '',
              negativePrompt: '',
              lockSubjectCount: true,
              forbidExtraSubjects: true,
              preserveIdentity: true,
              preservePositions: true,
              constraintStrength: 80,
              prompt: '人物面朝黑板。',
            },
          },
        },
      ] as unknown as FlowNode[],
      edges: [],
    });

    await flushCanvasPersistence();

    const persisted = parseCanvasPersistence<{
      snapshot?: { nodes?: FlowNode[] };
    }>(
      storage.get(canvasWorkspaceStorageKey(useCanvasStore.getState().activeProjectId, 'views')) ??
        '{}',
    );
    expect(persisted.snapshot?.nodes?.[0]?.data.directorScene).toMatchObject({
      sceneName: '高中教室',
      prompt: '人物面朝黑板。',
      cameraPreset: 'medium-front',
      cameraMovement: 'static',
      cameraSpeed: 'slow',
      duration: 5,
    });
  });

  it('exposes an autosave failure for the active project without throwing', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
    });
    useCanvasStore.setState({ activeProjectId: 'project-save-failure' });

    expect(await flushCanvasPersistence()).toBe(false);
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      projectId: 'project-save-failure',
      state: 'error',
      lastAttemptAt: expect.any(Number),
      message: expect.stringContaining('本地保存空间不足'),
    });
  });

  it('serializes concurrent write intents through the cross-tab Web Lock', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size;
        },
      },
    });
    const originalNavigator = globalThis.navigator;
    let lockTail = Promise.resolve();
    let activeWriters = 0;
    let maximumActiveWriters = 0;
    let lockRequests = 0;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (_name: string, _options: unknown, callback: () => boolean) => {
            lockRequests += 1;
            const result = lockTail.then(async () => {
              activeWriters += 1;
              maximumActiveWriters = Math.max(maximumActiveWriters, activeWriters);
              await Promise.resolve();
              try {
                return callback();
              } finally {
                activeWriters -= 1;
              }
            });
            lockTail = result.then(
              () => undefined,
              () => undefined,
            );
            return result;
          },
        },
      },
    });
    try {
      const projectId = 'project-web-lock-concurrency';
      useCanvasStore.setState({
        activeProjectId: projectId,
        projectName: '并发写入',
        projects: [{ id: projectId, name: '并发写入' }],
        workspace: 'views',
        nodes: [{ ...emptyTextNode(), data: { ...emptyTextNode().data, prompt: 'first' } }],
        edges: [],
      });
      const first = flushCanvasPersistence();
      useCanvasStore.setState({
        nodes: [{ ...emptyTextNode(), data: { ...emptyTextNode().data, prompt: 'second' } }],
      });
      const second = flushCanvasPersistence();

      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      expect(lockRequests).toBe(2);
      expect(maximumActiveWriters).toBe(1);
      const persisted = parseCanvasPersistence<{ snapshot: { nodes: FlowNode[] } }>(
        storage.get(canvasWorkspaceStorageKey(projectId, 'views')) ?? '{}',
      );
      expect(persisted.snapshot.nodes[0]?.data.prompt).toBe('second');
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  it('fails closed when the cross-tab save lock times out', async () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: () => null,
        length: 0,
      },
    });
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: (_name: string, options: { signal: AbortSignal }) =>
            new Promise<boolean>((_resolve, reject) => {
              options.signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }),
        },
      },
    });
    try {
      useCanvasStore.setState({ activeProjectId: 'project-lock-timeout' });
      const saving = flushCanvasPersistence();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(saving).resolves.toBe(false);
      expect(storage.has('kitty-canvas-state')).toBe(false);
      expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
        projectId: 'project-lock-timeout',
        state: 'error',
        message: expect.stringContaining('保存锁超时'),
      });
    } finally {
      vi.useRealTimers();
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  it('blocks a stale tab from overwriting a newer project revision', async () => {
    const storage = new Map<string, string>();
    const projectId = 'project-multitab-conflict';
    const remotePayload = {
      version: 5,
      activeProjectId: projectId,
      projectStates: {
        [projectId]: {
          workspace: 'views',
          workspaces: { views: { nodes: [], edges: [] } },
          tabs: [{ id: 'remote-tab', name: '远端画板', workspace: 'views' }],
          activeTabId: 'remote-tab',
        },
      },
      workspace: 'views',
      workspaces: { views: { nodes: [], edges: [] } },
      tabs: [{ id: 'remote-tab', name: '远端画板', workspace: 'views' }],
      activeTabId: 'remote-tab',
      projectName: '多标签项目',
      projects: [{ id: projectId, name: '多标签项目' }],
      genParams: useCanvasStore.getState().genParams,
      activeTags: [],
      projectRevisions: {
        [projectId]: { revision: 3, writerId: 'another-tab', updatedAt: Date.now() },
      },
    };
    const remoteRaw = JSON.stringify(remotePayload);
    storage.set('kitty-canvas-state', remoteRaw);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size;
        },
      },
    });
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '多标签项目',
      projects: [{ id: projectId, name: '多标签项目' }],
      workspace: 'views',
      nodes: [{ ...emptyTextNode(), data: { ...emptyTextNode().data, prompt: '本标签修改' } }],
      edges: [],
    });

    expect(await flushCanvasPersistence()).toBe(false);
    expect(storage.get('kitty-canvas-state')).toBe(remoteRaw);
    expect(useCanvasStore.getState().persistenceStatus).toMatchObject({
      projectId,
      state: 'conflict',
      conflictingWriterId: 'another-tab',
      revision: 0,
      conflictCopyAvailable: true,
    });
    expect(getCanvasPersistenceConflictCopy(projectId)).toMatchObject({
      projectId,
      remoteRevision: { revision: 3, writerId: 'another-tab' },
    });
    expect(exportCanvasPersistenceConflictCopy(projectId)).toContain('本标签修改');
  });

  it('upgrades a legacy v4 container and preserves an unedited external project', async () => {
    const storage = new Map<string, string>();
    const projectId = 'project-v4-upgrade';
    const externalId = 'project-external-preserved';
    storage.set(
      'kitty-canvas-state',
      JSON.stringify({
        version: 4,
        activeProjectId: projectId,
        projectStates: {
          [projectId]: {
            workspace: 'views',
            workspaces: { views: { nodes: [], edges: [] } },
            tabs: [],
            activeTabId: '',
          },
          [externalId]: {
            workspace: 'views',
            workspaces: {
              views: {
                nodes: [{ ...emptyTextNode(), id: 'external-node' }],
                edges: [],
              },
            },
            tabs: [],
            activeTabId: '',
          },
        },
        workspace: 'views',
        workspaces: { views: { nodes: [], edges: [] } },
        tabs: [],
        activeTabId: '',
        projectName: '旧项目',
        projects: [
          { id: projectId, name: '旧项目' },
          { id: externalId, name: '外部项目' },
        ],
        genParams: useCanvasStore.getState().genParams,
        activeTags: [],
      }),
    );
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size;
        },
      },
    });
    useCanvasStore.setState({
      activeProjectId: projectId,
      projectName: '旧项目',
      projects: [
        { id: projectId, name: '旧项目' },
        { id: externalId, name: '外部项目' },
      ],
      workspace: 'views',
      nodes: [emptyTextNode()],
      edges: [],
    });

    expect(await flushCanvasPersistence()).toBe(true);
    const persisted = parseCanvasPersistence<{
      version: number;
      projectStates: Record<string, { workspaces?: { views?: { nodes?: FlowNode[] } } }>;
      projectRevisions?: Record<string, { revision: number; writerId: string }>;
    }>(storage.get('kitty-canvas-state') ?? '{}');
    expect(persisted.version).toBe(6);
    expect(persisted.projectStates[externalId]).toBeUndefined();
    const externalWorkspace = parseCanvasPersistence<{
      snapshot?: { nodes?: FlowNode[] };
    }>(storage.get(canvasWorkspaceStorageKey(externalId, 'views')) ?? '{}');
    expect(externalWorkspace.snapshot?.nodes?.[0]?.id).toBe('external-node');
    expect(persisted.projectRevisions?.[projectId]).toMatchObject({
      revision: 1,
      writerId: expect.any(String),
    });
  });

  it('keeps generated prompt text when a reference image is repeated across node fields', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size;
        },
      },
    });
    const imageUrl = `data:image/jpeg;base64,${'A'.repeat(50_000)}`;
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [
        {
          id: 'reference-image',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            title: '参考图片',
            imageUrl,
            images: [imageUrl],
            output: imageUrl,
            composerReferences: [{ id: 'reference-image', type: 'image', url: imageUrl }],
          },
        },
        {
          ...emptyTextNode(),
          id: 'generated-prompt',
          data: {
            ...emptyTextNode().data,
            result: '刷新后仍应存在的提示词',
            outputText: '刷新后仍应存在的提示词',
          },
        },
      ] as FlowNode[],
      edges: [],
    });

    await flushCanvasPersistence();

    const raw =
      storage.get(canvasWorkspaceStorageKey(useCanvasStore.getState().activeProjectId, 'views')) ??
      '';
    const persisted = parseCanvasPersistence<{
      snapshot?: { nodes?: FlowNode[] };
    }>(raw);
    const restoredPrompt = persisted.snapshot?.nodes?.find(
      (node) => node.id === 'generated-prompt',
    );
    expect(raw.match(/data:image\/jpeg/g)).toHaveLength(1);
    expect(restoredPrompt?.data.outputText).toBe('刷新后仍应存在的提示词');
  });
});

describe('home workspace entry', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      workspace: 'home',
      nodes: [],
      edges: [],
      tabs: [{ id: 'home-entry-tab', name: '画板 1', workspace: 'views' }],
      activeTabId: 'home-entry-tab',
    });
  });

  it.each([
    ['script', '故事脚本生成'],
    ['views', '角色三视图'],
    ['video', '首帧图生视频'],
    ['audio', '音频生视频'],
  ] as const)('uses the selected home card title for the active canvas tab', (workspace, title) => {
    useCanvasStore.getState().setWorkspace(workspace);

    expect(useCanvasStore.getState().tabs).toContainEqual({
      id: 'home-entry-tab',
      name: title,
      workspace,
    });
  });

  it('keeps other canvas tab names unchanged', () => {
    useCanvasStore.setState({
      tabs: [
        { id: 'home-entry-tab', name: '画板 1', workspace: 'views' },
        { id: 'other-tab', name: '我的分镜', workspace: 'script' },
      ],
    });

    useCanvasStore.getState().setWorkspace('video');

    expect(useCanvasStore.getState().tabs.find((tab) => tab.id === 'other-tab')).toEqual({
      id: 'other-tab',
      name: '我的分镜',
      workspace: 'script',
    });
  });
});

describe('canvas tab workspace consistency', () => {
  it('switches to the replacement tab workspace when the active tab is removed', () => {
    useCanvasStore.setState({
      workspace: 'video',
      nodes: [],
      edges: [],
      tabs: [
        { id: 'video-tab', name: '视频', workspace: 'video' },
        { id: 'script-tab', name: '脚本', workspace: 'script' },
      ],
      activeTabId: 'video-tab',
      past: [],
      future: [],
    });

    useCanvasStore.getState().removeTab('video-tab');

    expect(useCanvasStore.getState()).toMatchObject({
      activeTabId: 'script-tab',
      workspace: 'script',
    });
  });
});

describe('project canvas isolation', () => {
  it('starts a new project from the reference workflow and restores each project independently', () => {
    const firstProjectId = 'project-isolation-first';
    const firstNode = {
      ...emptyTextNode(),
      id: 'first-project-only-node',
      data: { ...emptyTextNode().data, title: '项目一独有节点' },
    };
    useCanvasStore.setState({
      activeProjectId: firstProjectId,
      projectName: '项目一',
      projects: [{ id: firstProjectId, name: '项目一' }],
      workspace: 'views',
      nodes: [firstNode],
      edges: [],
      tabs: [{ id: 'project-one-tab', name: '画板 1', workspace: 'views' }],
      activeTabId: 'project-one-tab',
    });

    useCanvasStore.getState().createProject('项目二');

    const secondProjectId = useCanvasStore.getState().activeProjectId;
    expect(secondProjectId).not.toBe(firstProjectId);
    expect(useCanvasStore.getState().nodes.map((node) => node.data.title)).toEqual([
      '角色参考图',
      '角色三视图',
    ]);
    expect(useCanvasStore.getState().edges).toHaveLength(1);
    expect(useCanvasStore.getState().tabs).toMatchObject([{ name: '画板 1', workspace: 'views' }]);

    useCanvasStore.setState({
      nodes: [
        {
          ...emptyTextNode(),
          id: 'second-project-only-node',
          data: { ...emptyTextNode().data, title: '项目二独有节点' },
        },
      ],
      edges: [],
    });
    useCanvasStore.getState().switchProject(firstProjectId);
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual([
      'first-project-only-node',
    ]);

    useCanvasStore.getState().switchProject(secondProjectId);
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual([
      'second-project-only-node',
    ]);
  });

  it('shares one global asset library while retaining each asset source project', () => {
    globalThis.localStorage.clear();
    const firstProjectId = 'project-assets-first';
    const firstImage: FlowNode = {
      id: 'first-project-image',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '项目一图片',
        imageUrl: 'https://example.test/project-one.png',
      },
    };
    useCanvasStore.setState({
      activeProjectId: firstProjectId,
      projectName: '项目一',
      projects: [{ id: firstProjectId, name: '项目一' }],
      workspace: 'views',
      nodes: [firstImage],
      edges: [],
      assets: [],
    });
    useCanvasStore.getState().saveAsset(firstImage.id, 'character');
    expect(useCanvasStore.getState().assets).toMatchObject([
      { title: '项目一图片', sourceProjectId: firstProjectId },
    ]);

    useCanvasStore.getState().createProject('项目二');
    const secondProjectId = useCanvasStore.getState().activeProjectId;
    expect(useCanvasStore.getState().assets.map((asset) => asset.title)).toEqual(['项目一图片']);

    const secondImage: FlowNode = {
      ...firstImage,
      id: 'second-project-image',
      data: {
        ...firstImage.data,
        title: '项目二图片',
        imageUrl: 'https://example.test/project-two.png',
      },
    };
    useCanvasStore.setState({ nodes: [secondImage] });
    useCanvasStore.getState().saveAsset(secondImage.id, 'scene');
    expect(useCanvasStore.getState().assets).toMatchObject([
      { title: '项目一图片', sourceProjectId: firstProjectId },
      { title: '项目二图片', sourceProjectId: secondProjectId },
    ]);

    useCanvasStore.getState().switchProject(firstProjectId);
    expect(useCanvasStore.getState().assets.map((asset) => asset.title)).toEqual([
      '项目一图片',
      '项目二图片',
    ]);

    useCanvasStore.getState().switchProject(secondProjectId);
    expect(useCanvasStore.getState().assets.map((asset) => asset.title)).toEqual([
      '项目一图片',
      '项目二图片',
    ]);

    useCanvasStore.getState().deleteProject();
    expect(
      useCanvasStore.getState().projects.some((project) => project.id === secondProjectId),
    ).toBe(false);
    expect(useCanvasStore.getState().assets.map((asset) => asset.title)).toEqual([
      '项目一图片',
      '项目二图片',
    ]);
    expect(
      globalThis.localStorage.getItem(`kitty-canvas-assets:${secondProjectId}`),
    ).not.toBeNull();
  });
});

describe('generated asset saving', () => {
  it('adds a persisted audio result without creating a node and ignores duplicates', () => {
    globalThis.localStorage.clear();
    useCanvasStore.setState({
      activeProjectId: 'project-audio-history',
      nodes: [],
      assets: [],
    });

    const first = useCanvasStore.getState().addAudioAsset({
      bridgeAssetId: 'history-audio-1',
      audioUrl: 'http://127.0.0.1:2894/asset-library/files/history-audio-1',
      fileName: 'voxcpm2-output.wav',
      mimeType: 'audio/wav',
      durationSeconds: 8.4,
    });
    const duplicate = useCanvasStore.getState().addAudioAsset({
      bridgeAssetId: 'history-audio-1',
      audioUrl: 'http://127.0.0.1:2894/asset-library/files/history-audio-1',
      fileName: 'voxcpm2-output.wav',
      mimeType: 'audio/wav',
      durationSeconds: 8.4,
    });

    expect(first.added).toBe(true);
    expect(duplicate).toEqual({ assetId: first.assetId, added: false });
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(useCanvasStore.getState().assets).toMatchObject([
      {
        id: first.assetId,
        sourceProjectId: 'project-audio-history',
        bridgeAssetId: 'history-audio-1',
        kind: 'audio',
        category: 'audio',
        audioFileName: 'voxcpm2-output.wav',
        mediaMimeType: 'audio/wav',
      },
    ]);
  });

  it('adds generated media once and infers role setting images as character assets', () => {
    const node: FlowNode = {
      id: 'generated-character',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '紫发剑客',
        imageUrl: 'https://example.test/generated-character.png',
        images: ['https://example.test/generated-character.png'],
        composerParams: { imageType: '角色设定图' },
      },
    };
    useCanvasStore.setState({ nodes: [node], assets: [] });

    useCanvasStore.getState().saveAsset(node.id);
    useCanvasStore.getState().saveAsset(node.id);

    expect(useCanvasStore.getState().assets).toHaveLength(1);
    expect(useCanvasStore.getState().assets[0]).toMatchObject({
      sourceNodeId: node.id,
      category: 'character',
      imageUrl: 'https://example.test/generated-character.png',
    });
  });

  it('allows a newly regenerated result from the same node to be saved separately', () => {
    const first: FlowNode = {
      id: 'regenerated-image',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '生成图',
        imageUrl: 'https://example.test/first.png',
      },
    };
    useCanvasStore.setState({ nodes: [first], assets: [] });
    useCanvasStore.getState().saveAsset(first.id);
    useCanvasStore.setState({
      nodes: [{ ...first, data: { ...first.data, imageUrl: 'https://example.test/second.png' } }],
    });
    useCanvasStore.getState().saveAsset(first.id);

    expect(useCanvasStore.getState().assets.map((asset) => asset.imageUrl)).toEqual([
      'https://example.test/first.png',
      'https://example.test/second.png',
    ]);
  });
});

describe('prompt library execution targets', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      past: [],
      future: [],
      modalNodeId: null,
      openModal: 'prompt-library',
    });
  });

  it.each([
    ['image', 'image'],
    ['video', 'video'],
    ['script', 'script'],
  ] as const)(
    'creates a real %s task node instead of always creating an image shell',
    (target, kind) => {
      useCanvasStore.getState().applyPromptPreset({
        id: `preset-${target}`,
        title: `${target} preset`,
        prompt: '真实提交提示词',
        tags: ['test'],
        target,
      });

      const created = useCanvasStore.getState().nodes.at(-1);
      expect(created?.data).toMatchObject({
        kind,
        prompt: '真实提交提示词',
        title: `${target} preset`,
      });
      if (!created?.data.providerId || !created.data.model) {
        expect(created?.data.result).toContain('请选择');
      }
    },
  );

  it('adds a ready image task without generating until the user clicks', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size;
        },
      },
    });
    localStorage.setItem(
      'kitty-canvas-api-providers-v1',
      JSON.stringify([
        {
          id: 'api',
          enabled: true,
          lastVerifiedAt: Date.now(),
          models: { chat: [], image: ['gpt-image-2'], video: [] },
        },
      ]),
    );
    const originalGenerateNode = useCanvasStore.getState().generateNode;
    const generateNode = vi.fn(async () => {});
    useCanvasStore.setState({ generateNode });

    try {
      useCanvasStore.getState().applyPromptPreset({
        id: 'preset-manual-image',
        title: '手动生成图片',
        prompt: '先添加，后生成',
        tags: ['test'],
        target: 'image',
        position: { x: 321, y: 654 },
      });

      const created = useCanvasStore.getState().nodes.at(-1);
      expect(created?.position).toEqual({ x: 321, y: 654 });
      expect(created?.data).toMatchObject({
        kind: 'image',
        prompt: '先添加，后生成',
        mediaInputMode: 'generation-only',
        providerId: 'api',
        model: 'gpt-image-2',
        result: '提示词已添加到画布。请在指令框确认后点击生成。',
      });
      expect(created?.selected).toBe(true);
      expect(useCanvasStore.getState().selectedNodeId).toBe(created?.id);
      expect(generateNode).not.toHaveBeenCalled();
    } finally {
      useCanvasStore.setState({ generateNode: originalGenerateNode });
    }
  });

  it('only applies a preset to an existing ready node and never starts paid generation', () => {
    const generateNode = vi.fn(async () => {});
    const originalGenerateNode = useCanvasStore.getState().generateNode;
    useCanvasStore.setState({
      nodes: [
        {
          id: 'ready-image',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            title: '图片',
            providerId: 'provider',
            model: 'model',
          },
        },
      ],
      modalNodeId: 'ready-image',
      generateNode,
    });
    try {
      useCanvasStore.getState().applyPromptPreset({
        id: 'manual-only',
        title: '只应用',
        prompt: '用户确认后再生成',
        tags: ['test'],
      });
      expect(generateNode).not.toHaveBeenCalled();
      expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
        prompt: '用户确认后再生成',
        result: '提示词已应用。请在指令框确认后点击生成。',
      });
    } finally {
      useCanvasStore.setState({ generateNode: originalGenerateNode });
    }
  });
});

describe('trash graph integrity', () => {
  it('restores only edges that still satisfy the formal graph contract', () => {
    const source: FlowNode = {
      id: 'source',
      type: 'text',
      position: { x: 0, y: 0 },
      data: { kind: 'text', title: '来源', output: 'prompt' },
    };
    const restored: FlowNode = {
      id: 'restored',
      type: 'image',
      position: { x: 400, y: 0 },
      data: { kind: 'image', title: '图片' },
    };
    const result = restoreTrashIntoSnapshot(
      { nodes: [source], edges: [] },
      {
        id: 'trash-invalid-edge',
        projectId: 'project-1',
        workspace: 'views',
        title: '图片',
        deletedAt: 1,
        nodes: [restored],
        edges: [
          {
            id: 'invalid-edge',
            source: 'restored',
            target: 'source',
            sourceHandle: 'image',
            targetHandle: 'prompt',
          },
        ],
      },
    );
    expect(result.restoredNodeCount).toBe(1);
    expect(result.edges).toEqual([]);
  });

  it('keeps trash synchronized when deleting and undoing', () => {
    useCanvasStore.setState({
      activeProjectId: 'project-trash-undo',
      workspace: 'views',
      nodes: [emptyTextNode()],
      edges: [],
      trash: [],
      past: [],
      future: [],
    });
    useCanvasStore.getState().deleteNode('text-source');
    expect(useCanvasStore.getState().trash).toHaveLength(1);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().trash).toEqual([]);

    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().nodes).toEqual([]);
    expect(useCanvasStore.getState().trash).toHaveLength(1);
  });
});
