import { describe, expect, it, vi } from 'vitest';
import type { FlowNode, NodeKind } from '../canvas/nodeTypes';
import { DEFAULT_GENERATION_LIMITS } from './generationLimitsContract.mjs';
import {
  BATCH_GENERATION_CONCURRENCY,
  batchGenerationLabel,
  resolveContentGenerationTargetIds,
  resolveContextMenuNodeIds,
  resolveMultiNodeGenerationTargets,
  runContentGenerationBatch,
  runNodeGenerationBatch,
} from './multiNodeGeneration';

function node(id: string, kind: NodeKind, selected = false): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    selected,
    data: { kind, title: id },
  };
}

describe('multi-node context menu generation', () => {
  it('keeps an existing multi-selection when right-clicking one of its nodes', () => {
    const nodes = [node('image-a', 'image', true), node('image-b', 'image', true)];

    expect(resolveContextMenuNodeIds(nodes, 'image-a')).toEqual(['image-a', 'image-b']);
  });

  it('uses only the clicked node when it is outside the current selection', () => {
    const nodes = [node('image-a', 'image', true), node('video-a', 'video')];

    expect(resolveContextMenuNodeIds(nodes, 'video-a')).toEqual(['video-a']);
  });

  it('classifies image and video generators by their declared outputs', () => {
    const nodes = [
      node('image-a', 'image'),
      node('views-a', 'views'),
      node('video-a', 'video'),
      node('compose-a', 'video-comp'),
      node('text-a', 'text'),
      node('audio-a', 'audio'),
    ];

    expect(
      resolveMultiNodeGenerationTargets(
        nodes,
        nodes.map((item) => item.id),
      ),
    ).toEqual({
      imageIds: ['image-a', 'views-a'],
      videoIds: ['video-a', 'compose-a'],
    });
  });

  it('does not offer batch generation for selected nodes that already contain media', () => {
    const generatedImage = node('image-ready', 'image');
    generatedImage.data.imageUrl = 'https://example.test/image.png';
    const uploadedImage = node('image-uploaded', 'image');
    uploadedImage.data.images = ['https://example.test/upload.png'];
    const generatedVideo = node('video-ready', 'video');
    generatedVideo.data.videoUrl = 'https://example.test/video.mp4';
    const emptyImage = node('image-empty', 'image');

    const nodes = [generatedImage, uploadedImage, generatedVideo, emptyImage];

    expect(
      resolveMultiNodeGenerationTargets(
        nodes,
        nodes.map((item) => item.id),
      ),
    ).toEqual({
      imageIds: ['image-empty'],
      videoIds: [],
    });
  });

  it('uses truthful labels for single compatible nodes and real batches', () => {
    expect(batchGenerationLabel('image', 1)).toBe('生成图片');
    expect(batchGenerationLabel('image', 2)).toBe('批量生成图片');
    expect(batchGenerationLabel('video', 2)).toBe('批量生成视频');
  });

  it('resolves every selected node with a declared default generation action', () => {
    const readyImage = node('image-ready', 'image');
    readyImage.data.imageUrl = 'https://example.test/ready.png';
    const nodes = [
      node('text-a', 'text'),
      readyImage,
      node('video-a', 'video'),
      node('loop-a', 'loop'),
      node('audio-a', 'audio'),
      node('group-a', 'group'),
    ];

    expect(
      resolveContentGenerationTargetIds(nodes, [
        'video-a',
        'text-a',
        'image-ready',
        'loop-a',
        'audio-a',
        'group-a',
        'text-a',
      ]),
    ).toEqual(['video-a', 'text-a', 'image-ready', 'loop-a', 'audio-a']);
  });

  it('runs a mixed content batch, skips busy nodes, and isolates failures', async () => {
    const runningText = node('text-running', 'text');
    runningText.data.generating = true;
    const nodes = [
      node('text-a', 'text'),
      runningText,
      node('image-a', 'image'),
      node('video-a', 'video'),
      node('audio-a', 'audio'),
    ];
    const generateNode = vi.fn(async (nodeId: string) => {
      if (nodeId === 'text-a') throw new Error('failed');
    });

    await runContentGenerationBatch(
      nodes,
      nodes.map(({ id }) => id),
      generateNode,
    );

    expect(generateNode.mock.calls.flat()).toEqual(
      expect.arrayContaining(['text-a', 'image-a', 'video-a', 'audio-a']),
    );
    expect(generateNode).toHaveBeenCalledTimes(4);
  });

  it('honors the image batch ceiling and the strictest selected media concurrency', async () => {
    const nodes = [
      node('image-a', 'image'),
      node('image-b', 'image'),
      node('image-c', 'image'),
      node('video-a', 'video'),
      node('text-a', 'text'),
    ];
    let active = 0;
    let peakActive = 0;
    const releaseFirstWave: Array<() => void> = [];
    const firstWave = new Promise<void>((resolve) => releaseFirstWave.push(resolve));
    const generateNode = vi.fn(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await firstWave;
      active -= 1;
    });

    const batch = runContentGenerationBatch(
      nodes,
      nodes.map(({ id }) => id),
      generateNode,
      {
        ...DEFAULT_GENERATION_LIMITS,
        imageBatchSize: 2,
        generationConcurrency: 8,
        imageGenerationConcurrency: 6,
        videoGenerationConcurrency: 2,
      },
    );
    await vi.waitFor(() => expect(generateNode).toHaveBeenCalledTimes(2));
    expect(peakActive).toBe(2);

    releaseFirstWave[0]?.();
    await batch;

    expect(generateNode).toHaveBeenCalledTimes(4);
    expect(generateNode).not.toHaveBeenCalledWith('image-c');
  });

  it('skips running nodes and continues after one generation fails', async () => {
    const runningNode = node('image-running', 'image');
    runningNode.data.generating = true;
    const nodes = [node('image-a', 'image'), runningNode, node('image-b', 'image')];
    const generateNode = vi.fn(async (nodeId: string) => {
      if (nodeId === 'image-a') throw new Error('failed');
    });

    await runNodeGenerationBatch(
      nodes,
      nodes.map((item) => item.id),
      'image',
      generateNode,
    );

    expect(generateNode.mock.calls).toEqual([['image-a'], ['image-b']]);
  });

  it('runs all 20 requested image nodes with bounded concurrency', async () => {
    const nodes = Array.from({ length: 20 }, (_, index) => node(`image-${index + 1}`, 'image'));
    let active = 0;
    let peakActive = 0;
    const releaseFirstWave: Array<() => void> = [];
    const firstWave = new Promise<void>((resolve) => {
      releaseFirstWave.push(resolve);
    });
    const generateNode = vi.fn(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await firstWave;
      active -= 1;
    });

    const batch = runNodeGenerationBatch(
      nodes,
      nodes.map((item) => item.id),
      'image',
      generateNode,
    );

    await vi.waitFor(() => {
      expect(generateNode).toHaveBeenCalledTimes(BATCH_GENERATION_CONCURRENCY.image);
    });
    expect(peakActive).toBe(BATCH_GENERATION_CONCURRENCY.image);

    releaseFirstWave[0]?.();
    await batch;

    expect(generateNode).toHaveBeenCalledTimes(20);
    expect(peakActive).toBe(BATCH_GENERATION_CONCURRENCY.image);
  });

  it('starts five video nodes together and queues the sixth', async () => {
    const nodes = Array.from({ length: 6 }, (_, index) => node(`video-${index + 1}`, 'video'));
    let active = 0;
    let peakActive = 0;
    const releaseFirstWave: Array<() => void> = [];
    const firstWave = new Promise<void>((resolve) => {
      releaseFirstWave.push(resolve);
    });
    const generateNode = vi.fn(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await firstWave;
      active -= 1;
    });

    const batch = runNodeGenerationBatch(
      nodes,
      nodes.map((item) => item.id),
      'video',
      generateNode,
    );

    await vi.waitFor(() => {
      expect(generateNode).toHaveBeenCalledTimes(BATCH_GENERATION_CONCURRENCY.video);
    });
    expect(peakActive).toBe(5);

    releaseFirstWave[0]?.();
    await batch;

    expect(generateNode).toHaveBeenCalledTimes(6);
    expect(peakActive).toBe(5);
  });

  it('uses custom image batch and effective global concurrency limits', async () => {
    const nodes = Array.from({ length: 8 }, (_, index) => node(`image-${index + 1}`, 'image'));
    let active = 0;
    let peakActive = 0;
    const releaseFirstWave: Array<() => void> = [];
    const firstWave = new Promise<void>((resolve) => releaseFirstWave.push(resolve));
    const generateNode = vi.fn(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await firstWave;
      active -= 1;
    });

    const batch = runNodeGenerationBatch(
      nodes,
      nodes.map(({ id }) => id),
      'image',
      generateNode,
      {
        ...DEFAULT_GENERATION_LIMITS,
        imageBatchSize: 3,
        generationConcurrency: 2,
        imageGenerationConcurrency: 8,
      },
    );
    await vi.waitFor(() => expect(generateNode).toHaveBeenCalledTimes(2));
    expect(peakActive).toBe(2);

    releaseFirstWave[0]?.();
    await batch;

    expect(generateNode).toHaveBeenCalledTimes(3);
    expect(peakActive).toBe(2);
  });
});
