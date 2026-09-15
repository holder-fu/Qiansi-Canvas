import { describe, it, expect } from 'vitest';
import {
  NODE_KIND_META,
  type FlowNode,
  type FlowEdge,
  type NodeKind,
  type ImageNodeData,
} from '../canvas/nodeTypes';
import { NODE_SPECS, getNodeSpec, resolveOutputPort } from './nodeSpecs';
import { placeholderImage } from '../canvas/placeholders';
import { BRIDGE_BASE_URL } from '../lib/bridgeUrl';
import {
  collectUpstream,
  collectNodeInputs,
  topoSort,
  hasCycle,
  wouldCreateCycle,
  isValidConnection,
  portCompatible,
  resolveConnectionPorts,
} from './graph';

function node(id: string, kind: NodeKind, data: Partial<ImageNodeData> = {}): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: { kind, title: '', ...data },
  } as FlowNode;
}

function edge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): FlowEdge {
  return {
    id: `e-${source}-${target}-${sourceHandle ?? ''}-${targetHandle ?? ''}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'flow',
  } as FlowEdge;
}

// ── NodeSpec registration ────────────────────────────────────────────────
describe('NodeSpec registration', () => {
  it('every NodeKind in NODE_KIND_META is registered in NODE_SPECS', () => {
    const metaKinds = Object.keys(NODE_KIND_META) as NodeKind[];
    for (const kind of metaKinds) {
      expect(NODE_SPECS[kind], `missing spec for ${kind}`).toBeDefined();
      expect(getNodeSpec(kind).kind).toBe(kind);
    }
    // No extra specs beyond the declared kinds either.
    expect(Object.keys(NODE_SPECS).sort()).toEqual(metaKinds.sort());
  });

  it('every node has explicit PortDef arrays (inputs/outputs)', () => {
    for (const kind of Object.keys(NODE_SPECS) as NodeKind[]) {
      const spec = getNodeSpec(kind);
      expect(Array.isArray(spec.inputs)).toBe(true);
      expect(Array.isArray(spec.outputs)).toBe(true);
      for (const p of [...spec.inputs, ...spec.outputs]) {
        expect(p.id).toBeTruthy();
        expect(['in', 'out']).toContain(p.direction);
        expect(p.assetType).toBeTruthy();
      }
    }
  });

  it('keeps text composers focused on task and model without advanced settings', () => {
    for (const kind of ['text', 'script', 'llm'] as const) {
      expect(getNodeSpec(kind).composer.controls).toEqual(['context', 'mode', 'prompt', 'model']);
    }
  });

  it('omits advanced settings from every image composer', () => {
    for (const kind of [
      'image',
      'views',
      'front-frame',
      'generator',
      'comfy',
      'midjourney',
      'msgen',
      'rh',
    ] as const) {
      expect(getNodeSpec(kind).composer.type).toBe('image');
      expect(getNodeSpec(kind).composer.controls).not.toContain('advanced');
    }
  });

  it('port ids are unique within a single node', () => {
    for (const kind of Object.keys(NODE_SPECS) as NodeKind[]) {
      const spec = getNodeSpec(kind);
      const ids = [...spec.inputs, ...spec.outputs].map((p) => p.id);
      expect(new Set(ids).size, `duplicate port id in ${kind}`).toBe(ids.length);
    }
  });

  it('asset types come from port declarations, not node.kind guessing', () => {
    // Text-producing kinds emit a text output port; media kinds do not.
    expect(resolveOutputPort('text', null)?.assetType).toBe('text');
    expect(resolveOutputPort('image', null)?.assetType).toBe('image');
    expect(resolveOutputPort('video', null)?.assetType).toBe('video');
    expect(resolveOutputPort('audio', null)?.assetType).toBe('audio');
  });

  it('uses each plugin node declared input and output asset type', () => {
    const nodes = [
      node('plugin-source', 'plugin', {
        pluginInputType: 'text',
        pluginOutputType: 'video',
        output: 'video.mp4',
      }),
      node('video-target', 'video'),
      node('image-target', 'views'),
    ];
    expect(
      resolveConnectionPorts(nodes, 'plugin-source', null, 'video-target', null)?.source,
    ).toMatchObject({ id: 'out', assetType: 'video' });
    expect(isValidConnection(nodes, [], 'plugin-source', null, 'video-target', null)).toBe(true);
    expect(isValidConnection(nodes, [], 'plugin-source', null, 'image-target', null)).toBe(false);
  });

  it('video composer exposes the same reference workflow plus video libraries', () => {
    const video = getNodeSpec('video');
    expect(video.capabilities).toEqual(
      expect.arrayContaining(['reference', 'mark', 'effect', 'character', 'camera']),
    );
    expect(video.composer.controls).toEqual(
      expect.arrayContaining([
        'references',
        'marks',
        'effects',
        'character',
        'camera',
        'model',
        'mode',
        'videoSettings',
      ]),
    );
  });

  it('does not advertise a fake video input on image nodes', () => {
    const nodes = [node('source', 'video'), node('frame', 'image')];
    const ports = resolveConnectionPorts(nodes, 'source', null, 'frame', null);
    expect(getNodeSpec('image').inputs.map((port) => port.id)).toEqual(['prompt', 'ref']);
    expect(ports).toBeUndefined();
    expect(isValidConnection(nodes, [], 'source', null, 'frame', null)).toBe(false);
  });

  it('allows generated video results to remain connected to their batch source', () => {
    const nodes = [node('source', 'video'), node('result', 'video')];
    const ports = resolveConnectionPorts(nodes, 'source', null, 'result', null);
    expect(ports?.source.id).toBe('video');
    expect(ports?.target.id).toBe('batch-source');
    expect(isValidConnection(nodes, [], 'source', null, 'result', null)).toBe(true);
  });

  it('exposes dedicated video character-replacement ports', () => {
    const video = getNodeSpec('video');
    expect(video.inputs.map((port) => port.id)).toEqual(
      expect.arrayContaining(['source-video', 'character-reference', 'mask']),
    );
    const nodes = [
      node('source-video', 'video'),
      node('character', 'image'),
      node('mask', 'image'),
      node('target', 'video'),
    ];
    expect(
      resolveConnectionPorts(nodes, 'source-video', 'video', 'target', 'source-video')?.target.id,
    ).toBe('source-video');
    expect(
      resolveConnectionPorts(nodes, 'character', 'image', 'target', 'character-reference')?.target
        .id,
    ).toBe('character-reference');
    expect(resolveConnectionPorts(nodes, 'mask', 'image', 'target', 'mask')?.target.id).toBe(
      'mask',
    );
  });

  it('allows an audio node to feed the video music track input', () => {
    const nodes = [node('music', 'audio'), node('video', 'video')];
    const ports = resolveConnectionPorts(nodes, 'music', null, 'video', 'audio-track');
    expect(ports?.source.id).toBe('audio');
    expect(ports?.target.id).toBe('audio-track');
    expect(isValidConnection(nodes, [], 'music', null, 'video', 'audio-track')).toBe(true);
  });

  it('allows a video to feed the audio extraction source input', () => {
    const nodes = [node('source', 'video'), node('audio', 'audio')];
    const ports = resolveConnectionPorts(nodes, 'source', null, 'audio', 'source-video');
    expect(ports?.source.id).toBe('video');
    expect(ports?.target.id).toBe('source-video');
    expect(isValidConnection(nodes, [], 'source', null, 'audio', 'source-video')).toBe(true);
  });

  it('accepts multiple image references on the director stage', () => {
    const nodes = [
      node('scene', 'image'),
      node('character', 'image'),
      node('director', 'director'),
    ];
    const first = resolveConnectionPorts(nodes, 'scene', null, 'director', null);
    expect(first?.target.id).toBe('references');
    const firstEdge = edge('scene', 'director', 'image', 'references');
    expect(isValidConnection(nodes, [], 'scene', 'image', 'director', 'references')).toBe(true);
    expect(
      isValidConnection(nodes, [firstEdge], 'character', 'image', 'director', 'references'),
    ).toBe(true);
  });

  it('accepts exactly two image connections on an image comparison node', () => {
    const nodes = [
      node('first', 'image', { imageUrl: 'data:image/png;base64,first' }),
      node('second', 'image', { imageUrl: 'data:image/png;base64,second' }),
      node('third', 'image', { imageUrl: 'data:image/png;base64,third' }),
      node('comparison', 'image-compare'),
    ];
    const firstEdge = edge('first', 'comparison', 'image', 'images');
    const secondEdge = edge('second', 'comparison', 'image', 'images');
    expect(getNodeSpec('image-compare').inputs[0]).toMatchObject({
      id: 'images',
      multiple: true,
      maxConnections: 2,
    });
    expect(isValidConnection(nodes, [], 'first', 'image', 'comparison', 'images')).toBe(true);
    expect(isValidConnection(nodes, [firstEdge], 'second', 'image', 'comparison', 'images')).toBe(
      true,
    );
    expect(
      isValidConnection(nodes, [firstEdge, secondEdge], 'third', 'image', 'comparison', 'images'),
    ).toBe(false);
  });

  it.each(['director-2d', 'director-3d'] as const)(
    'keeps %s as an independently typed reference stage',
    (directorKind) => {
      const nodes = [node('scene', 'image'), node('director', directorKind)];
      const ports = resolveConnectionPorts(nodes, 'scene', null, 'director', null);
      expect(ports?.target.id).toBe('references');
      expect(isValidConnection(nodes, [], 'scene', null, 'director', null)).toBe(true);
    },
  );
});

// ── Upstream collection (port-based, behaviour-equivalent) ───────────────
describe('collectUpstream (port-based, behaviour-equivalent to legacy)', () => {
  it('text source feeds the prompt, media source feeds reference images', () => {
    const nodes = [
      node('t', 'text', { output: 'hello prompt' }),
      node('img', 'image', { output: ['a.png', 'b.png'] }),
      node('dest', 'image', {}),
    ];
    const edges = [edge('t', 'dest'), edge('img', 'dest')];
    const r = collectUpstream(nodes, edges, 'dest');
    expect(r.prompt).toContain('hello prompt');
    expect(r.referenceImages).toEqual(['a.png', 'b.png']);
  });

  it('falls back to imageUrl / images when output is missing', () => {
    const nodes = [
      node('a', 'image', { imageUrl: 'x.png' }),
      node('b', 'image', { images: ['y.png', 'z.png'] }),
      node('dest', 'image', {}),
    ];
    const r = collectUpstream(nodes, [edge('a', 'dest'), edge('b', 'dest')], 'dest');
    expect(r.referenceImages).toEqual(['x.png', 'y.png', 'z.png']);
  });

  it('uses the clean annotation source when a downstream node requests the original', () => {
    const nodes = [
      node('annotated', 'image', {
        imageUrl: 'annotated.png',
        annotationSourceUrl: 'original.png',
        annotationHints: [{ id: 'a', kind: 'arrow' }],
        aiReferenceMode: 'original',
      }),
      node('dest', 'image', {}),
    ];
    const result = collectUpstream(nodes, [edge('annotated', 'dest')], 'dest');
    expect(result.referenceImages).toEqual(['original.png']);
  });

  it('does not collect built-in empty-state artwork as an upstream image', () => {
    const placeholderUrl = placeholderImage('front-frame').imageUrl;
    const nodes = [
      node('empty', 'front-frame', { imageUrl: placeholderUrl }),
      node('dest', 'image', {}),
    ];

    const r = collectUpstream(nodes, [edge('empty', 'dest')], 'dest');
    expect(r.referenceImages).toEqual([]);
  });

  it('preserves all connected reference images for model-specific capability checks', () => {
    const nodes = [
      node('a', 'image', { output: ['1', '2', '3', '4', '5', '6'] }),
      node('dest', 'image', {}),
    ];
    const r = collectUpstream(nodes, [edge('a', 'dest')], 'dest');
    expect(r.referenceImages).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('injects director composition constraints into a downstream generation prompt', () => {
    const nodes = [
      node('director', 'director', {
        output: ['layout.png', 'hero.png'],
        directorConstraintPrompt: '画面中必须且只能出现1名人物。',
      }),
      node('dest', 'image', { prompt: '电影感停车场' }),
    ];

    const result = collectUpstream(nodes, [edge('director', 'dest')], 'dest');

    expect(result.prompt).toBe('电影感停车场\n画面中必须且只能出现1名人物。');
    expect(result.referenceImages).toEqual(['layout.png', 'hero.png']);
    expect(result.directorReferenceImages).toEqual(['layout.png', 'hero.png']);
  });

  it('injects the independent 3D director output into downstream generation', () => {
    const nodes = [
      node('director', 'director-3d', {
        output: ['3d-frame.png'],
        directorConstraintPrompt: '3D角色保持骨骼姿态。',
      }),
      node('dest', 'video', { prompt: '生成视频' }),
    ];

    const result = collectUpstream(nodes, [edge('director', 'dest')], 'dest');

    expect(result.prompt).toContain('3D角色保持骨骼姿态。');
    expect(result.directorReferenceImages).toEqual(['3d-frame.png']);
  });

  it('keeps duplicate URLs as separate ordered roles in a 3D director bundle', () => {
    const nodes = [
      node('director', 'director-3d', {
        images: ['motion-frame.png', 'shared-identity.png', 'shared-identity.png'],
        output: ['motion-frame.png', 'shared-identity.png', 'shared-identity.png'],
        directorConstraintPrompt: '参考图2与参考图3代表两个独立人物槽位。',
      }),
      node('dest', 'video', { prompt: '生成双人镜头' }),
    ];

    const result = collectUpstream(nodes, [edge('director', 'dest')], 'dest');

    expect(result.directorReferenceImages).toEqual([
      'motion-frame.png',
      'shared-identity.png',
      'shared-identity.png',
    ]);
  });

  it('prepends the node own prompt', () => {
    const nodes = [node('t', 'text', { output: 'up' }), node('dest', 'image', { prompt: 'self' })];
    const r = collectUpstream(nodes, [edge('t', 'dest')], 'dest');
    expect(r.prompt).toBe('self\nup');
  });

  it('resolves via the edge sourceHandle port (old handle-less edges still work)', () => {
    // Old edges carry no handle ids — resolveOutputPort falls back to the
    // default output port, so relationships survive load.
    const nodes = [node('t', 'text', { output: 'legacy' }), node('dest', 'image', {})];
    const legacyEdge = { id: 'e1', source: 't', target: 'dest', type: 'flow' } as FlowEdge;
    const r = collectUpstream(nodes, [legacyEdge], 'dest');
    expect(r.prompt).toContain('legacy');
  });

  it('reads the specific source port when the edge carries a handle id', () => {
    const nodes = [node('t', 'text', { output: 'via-handle' }), node('dest', 'image', {})];
    const r = collectUpstream(nodes, [edge('t', 'dest', 'text')], 'dest');
    expect(r.prompt).toContain('via-handle');
  });

  it('routes values to the target port instead of collapsing all fan-in', () => {
    const nodes = [
      node('text', 'text', { output: 'cinematic dusk' }),
      node('image', 'image', { output: 'frame.png' }),
      node('dest', 'image', {}),
    ];
    const inputs = collectNodeInputs(
      nodes,
      [edge('text', 'dest', 'text', 'prompt'), edge('image', 'dest', 'image', 'ref')],
      'dest',
    );
    expect(inputs).toEqual({ prompt: ['cinematic dusk'], ref: ['frame.png'] });
  });

  it('preserves every generated audio result for downstream nodes', () => {
    const nodes = [
      node('music', 'audio', { audios: ['track-a.mp3', 'track-b.mp3'] }),
      node('video', 'video', {}),
    ];
    const inputs = collectNodeInputs(
      nodes,
      [edge('music', 'video', 'audio', 'audio-track')],
      'video',
    );
    expect(inputs).toEqual({ 'audio-track': ['track-a.mp3', 'track-b.mp3'] });
  });

  it('resolves the persisted audio output before fallback fields for downstream nodes', () => {
    const nodes = [
      node('music', 'audio', {
        output: '/asset-library/files/audio-output-1',
        audioUrl: '/asset-library/files/audio-fallback-1',
        audios: ['/asset-library/files/audio-fallback-2'],
      }),
      node('video', 'video', {}),
    ];
    const inputs = collectNodeInputs(
      nodes,
      [edge('music', 'video', 'audio', 'audio-track')],
      'video',
    );

    expect(inputs).toEqual({
      'audio-track': [`${BRIDGE_BASE_URL}/asset-library/files/audio-output-1`],
    });
  });

  it('does not propagate an unrestorable persisted audio Blob downstream', () => {
    const expiredUrl = 'blob:http://127.0.0.1/expired-audio';
    const nodes = [
      node('music', 'audio', {
        output: expiredUrl,
        audioUrl: expiredUrl,
        audios: [expiredUrl],
        audioSourceState: 'unavailable-after-restore',
      }),
      node('video', 'video', {}),
    ];
    const inputs = collectNodeInputs(
      nodes,
      [edge('music', 'video', 'audio', 'audio-track')],
      'video',
    );

    expect(inputs).toEqual({});
  });

  it('maps a legacy handle-less media edge to the first compatible input port', () => {
    const nodes = [node('source', 'image', { output: 'legacy.png' }), node('dest', 'image', {})];
    const ports = resolveConnectionPorts(nodes, 'source', null, 'dest', null);
    expect(ports?.source.id).toBe('image');
    expect(ports?.target.id).toBe('ref');
    expect(collectUpstream(nodes, [edge('source', 'dest')], 'dest').referenceImages).toEqual([
      'legacy.png',
    ]);
  });

  it('routes an image node into the text reference slot for prompt analysis', () => {
    const nodes = [
      node('source', 'image', { imageUrl: 'reference.png' }),
      node('dest', 'text', { prompt: '分析图片并反推提示词' }),
    ];
    const ports = resolveConnectionPorts(nodes, 'source', null, 'dest', null);

    expect(ports?.source.id).toBe('image');
    expect(ports?.target.id).toBe('ref');
    expect(isValidConnection(nodes, [], 'source', null, 'dest', null)).toBe(true);
    expect(collectUpstream(nodes, [edge('source', 'dest')], 'dest').referenceImages).toEqual([
      'reference.png',
    ]);
  });

  it('routes a video node into the text video slot for prompt analysis', () => {
    const nodes = [
      node('source', 'video', { videoUrl: 'reference.mp4' }),
      node('dest', 'text', { prompt: '分析视频并反推提示词' }),
    ];
    const ports = resolveConnectionPorts(nodes, 'source', null, 'dest', null);

    expect(ports?.source.id).toBe('video');
    expect(ports?.target.id).toBe('video-ref');
    expect(isValidConnection(nodes, [], 'source', null, 'dest', null)).toBe(true);
    expect(collectNodeInputs(nodes, [edge('source', 'dest')], 'dest')).toEqual({
      'video-ref': ['reference.mp4'],
    });
    expect(collectUpstream(nodes, [edge('source', 'dest')], 'dest').referenceVideos).toEqual([
      'reference.mp4',
    ]);
  });

  it('normalizes a persisted effect video before passing it downstream', () => {
    const nodes = [
      node('effect', 'video', {
        effectPresetId: 'effect-earth-zoom',
        output: '/asset-library/files/earth-zoom',
      }),
      node('target', 'video'),
    ];
    const edges = [edge('effect', 'target', 'video', 'batch-source')];

    expect(collectUpstream(nodes, edges, 'target').referenceVideos).toEqual([
      'http://127.0.0.1:2895/asset-library/files/earth-zoom',
    ]);
  });

  it('allows an effect reference to connect only to a video node', () => {
    const effect = node('effect', 'image', {
      effectPresetId: 'effect-earth-zoom',
      imageUrl: 'earth-zoom.webp',
    });
    const targets = [
      node('video-target', 'video'),
      node('image-target', 'image'),
      node('text-target', 'text'),
      node('audio-target', 'audio'),
    ];
    const nodes = [effect, ...targets];

    expect(isValidConnection(nodes, [], 'effect', null, 'video-target', null)).toBe(true);
    expect(isValidConnection(nodes, [], 'effect', null, 'image-target', null)).toBe(false);
    expect(isValidConnection(nodes, [], 'effect', null, 'text-target', null)).toBe(false);
    expect(isValidConnection(nodes, [], 'effect', null, 'audio-target', null)).toBe(false);
  });
});

// ── Graph topology (pure functions) ──────────────────────────────────────
describe('topoSort', () => {
  it('places sources before their dependents', () => {
    const nodes = [node('a', 'image'), node('b', 'image'), node('c', 'image')];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const order = topoSort(nodes, edges, 'c');
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('never infinite-loops on a cyclic graph', () => {
    const nodes = [node('a', 'image'), node('b', 'image')];
    const edges = [edge('a', 'b'), edge('b', 'a')];
    expect(() => topoSort(nodes, edges, 'a')).not.toThrow();
    expect(topoSort(nodes, edges, 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('cycle detection', () => {
  it('detects A -> B -> C -> A', () => {
    const nodes = [node('a', 'image'), node('b', 'image'), node('c', 'image')];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
    expect(hasCycle(nodes, edges)).toBe(true);
  });

  it('reports no cycle for a DAG', () => {
    const nodes = [node('a', 'image'), node('b', 'image')];
    expect(hasCycle(nodes, [edge('a', 'b')])).toBe(false);
  });

  it('wouldCreateCycle is true only when target can reach source', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
  });
});

// ── Type compatibility ───────────────────────────────────────────────────
describe('portCompatible / isValidConnection (typed ports)', () => {
  it('image -> image slot is legal, text -> image slot is illegal', () => {
    expect(portCompatible('image', 'image')).toBe(true);
    expect(portCompatible('text', 'image')).toBe(false);
    expect(portCompatible('text', 'reference')).toBe(false);
    expect(portCompatible('image', 'reference')).toBe(true); // image fills a reference slot
  });

  it('isValidConnection: image -> image node is legal', () => {
    const nodes = [node('a', 'image'), node('b', 'image')];
    expect(isValidConnection(nodes, [], 'a', null, 'b', null)).toBe(true);
  });

  it('isValidConnection: text -> image node ref slot is illegal', () => {
    const nodes = [node('t', 'text'), node('i', 'image')];
    // text output into the image node's `ref` (reference) slot must be rejected.
    expect(isValidConnection(nodes, [], 't', 'text', 'i', 'ref')).toBe(false);
    // ...but text into the image node's `prompt` slot is legal.
    expect(isValidConnection(nodes, [], 't', 'text', 'i', 'prompt')).toBe(true);
  });

  it('rejects self-connections, duplicates and cycles', () => {
    const nodes = [node('a', 'image'), node('b', 'image'), node('c', 'image')];
    expect(isValidConnection(nodes, [], 'a', null, 'a', null)).toBe(false);
    expect(isValidConnection(nodes, [edge('a', 'b')], 'a', null, 'b', null)).toBe(false);
    const chain = [edge('a', 'b'), edge('b', 'c')];
    expect(isValidConnection(nodes, chain, 'c', null, 'a', null)).toBe(false); // cycle
  });

  it('rejects connections into a port-less group node', () => {
    const nodes = [node('a', 'image'), node('g', 'group')];
    expect(isValidConnection(nodes, [], 'a', null, 'g', null)).toBe(false);
  });

  it('rejects an explicit unknown port instead of silently falling back', () => {
    const nodes = [node('t', 'text'), node('i', 'image')];
    expect(isValidConnection(nodes, [], 't', 'does-not-exist', 'i', 'prompt')).toBe(false);
    expect(isValidConnection(nodes, [], 't', 'text', 'i', 'does-not-exist')).toBe(false);
  });

  it('allows fan-in only on ports declared as multiple', () => {
    const nodes = [node('a', 'image'), node('b', 'image'), node('video', 'video')];
    const occupiedFrame = [edge('a', 'video', 'image', 'frame')];
    expect(isValidConnection(nodes, occupiedFrame, 'b', 'image', 'video', 'frame')).toBe(true);

    const prompts = [edge('a', 'video', 'image', 'frame')];
    expect(isValidConnection(nodes, prompts, 'a', 'image', 'video', 'frame')).toBe(false);
  });

  it('allows multiple text sources into a prompt port declared as multiple', () => {
    const nodes = [node('a', 'text'), node('b', 'text'), node('dest', 'image')];
    const first = [edge('a', 'dest', 'text', 'prompt')];
    expect(isValidConnection(nodes, first, 'b', 'text', 'dest', 'prompt')).toBe(true);
  });
});
