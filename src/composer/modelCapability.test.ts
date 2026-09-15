import { describe, expect, it } from 'vitest';
import type { AvailableProviderModel } from '../lib/providerRegistry';
import {
  findReadyGenerationModel,
  generationCapabilityIssue,
  requestedVideoAudio,
} from './modelCapability';

const MODEL: AvailableProviderModel = {
  key: 'provider\u0000visual',
  providerId: 'provider',
  providerName: 'Provider',
  model: 'visual',
  displayName: 'Visual',
  label: 'Provider · Visual',
  recommended: false,
  inputModalities: ['text', 'image'],
  videoModes: ['文生视频', '图生视频'],
  maxReferenceImages: 1,
  maxReferenceVideos: 0,
  maxReferenceAudios: 0,
  maxOutputCount: 2,
  videoOperations: ['extend'],
};

describe('visual model capability gate', () => {
  it('requires an exact model from the ready catalog', () => {
    expect(findReadyGenerationModel([MODEL], { providerId: 'provider', model: 'visual' })).toBe(
      MODEL,
    );
    expect(findReadyGenerationModel([MODEL], { providerId: 'provider', model: 'missing' })).toBe(
      undefined,
    );
  });

  it('treats missing capability declarations as unsupported instead of unlimited', () => {
    const unknown = { ...MODEL, inputModalities: undefined, maxReferenceImages: undefined };
    expect(
      generationCapabilityIssue(unknown, {
        kind: 'image',
        references: [{ id: 'image', type: 'image', label: '参考图', url: 'blob:image' }],
        count: 1,
      }),
    ).toBe('image-input-unverified');
    expect(
      generationCapabilityIssue(
        { ...MODEL, maxOutputCount: undefined },
        {
          kind: 'image',
          references: [],
          count: 2,
        },
      ),
    ).toBe('output-count-unsupported');
  });

  it('validates video modes and workflow-backed tools independently', () => {
    expect(
      generationCapabilityIssue(MODEL, {
        kind: 'video',
        references: [],
        count: 1,
        mode: '全能参考',
      }),
    ).toBe('video-mode-unsupported');
    expect(
      generationCapabilityIssue(MODEL, {
        kind: 'video',
        references: [],
        count: 1,
        mode: '图生视频',
      }),
    ).toBe('video-mode-input-missing');
    expect(
      generationCapabilityIssue(MODEL, {
        kind: 'video',
        references: [],
        count: 1,
        mode: '文生视频',
        videoTool: 'remake',
      }),
    ).toBe('video-operation-unsupported');
    expect(
      generationCapabilityIssue(
        { ...MODEL, videoOperations: ['masked-repair'] },
        {
          kind: 'video',
          references: [],
          count: 1,
          mode: '文生视频',
          videoTool: 'masked-repair',
        },
      ),
    ).toBeNull();
    expect(
      generationCapabilityIssue(MODEL, {
        kind: 'video',
        references: [],
        count: 1,
        mode: '文生视频',
        videoTool: 'unknown-tool',
      }),
    ).toBe('video-operation-unsupported');
    expect(
      generationCapabilityIssue(MODEL, {
        kind: 'video',
        references: [{ id: 'image', type: 'image', label: '参考图', url: 'blob:image' }],
        count: 1,
        mode: '图生视频',
        videoTool: 'extend',
      }),
    ).toBeNull();
  });

  it('does not treat a legacy global audio value as a node audio request', () => {
    expect(requestedVideoAudio(undefined, true)).toBe(false);
    expect(requestedVideoAudio(false, true)).toBe(false);
    expect(requestedVideoAudio(true, false)).toBe(false);
    expect(requestedVideoAudio(true, true)).toBe(true);
  });

  it('deduplicates connected references and marks by canonical media URL', () => {
    const referenceUrl = 'https://canvas.test/assets/hero.png?preview=image&w=320';
    expect(
      generationCapabilityIssue(MODEL, {
        kind: 'image',
        references: [{ id: 'hero', type: 'image', label: '人物', url: referenceUrl }],
        additionalImageReferenceUrls: ['https://canvas.test/assets/hero.png'],
        count: 1,
      }),
    ).toBeNull();
    expect(
      generationCapabilityIssue(MODEL, {
        kind: 'image',
        references: [{ id: 'hero', type: 'image', label: '人物', url: referenceUrl }],
        additionalImageReferenceUrls: ['https://canvas.test/assets/other.png'],
        count: 1,
      }),
    ).toBe('too-many-image-references');
  });

  it('gates an unsupported effect-video input as its submitted poster image', () => {
    const effectReference = {
      id: 'earth-zoom',
      type: 'video' as const,
      role: 'effect' as const,
      label: '地球缩放',
      url: 'https://canvas.test/assets/earth-zoom.mp4',
      previewUrl: 'https://canvas.test/assets/earth-zoom-poster.webp',
    };
    expect(
      generationCapabilityIssue(
        { ...MODEL, videoReferenceInput: false },
        {
          kind: 'video',
          references: [effectReference],
          count: 1,
          mode: '图生视频',
        },
      ),
    ).toBeNull();
    expect(
      generationCapabilityIssue(
        { ...MODEL, videoReferenceInput: true },
        {
          kind: 'video',
          references: [effectReference],
          count: 1,
          mode: '图生视频',
        },
      ),
    ).toBe('too-many-video-references');
  });

  it('accepts declared video and audio references and rejects them beyond model limits', () => {
    const references = [
      { id: 'clip', type: 'video' as const, label: '参考视频', url: 'blob:video' },
      { id: 'sound', type: 'audio' as const, label: '参考音频', url: 'blob:audio' },
    ];
    const capableModel: AvailableProviderModel = {
      ...MODEL,
      videoModes: ['全能参考'],
      videoReferenceInput: true,
      maxReferenceVideos: 1,
      maxReferenceAudios: 1,
    };
    expect(
      generationCapabilityIssue(capableModel, {
        kind: 'video',
        references,
        count: 1,
        mode: '全能参考',
      }),
    ).toBeNull();
    expect(
      generationCapabilityIssue(
        { ...capableModel, maxReferenceVideos: 0 },
        { kind: 'video', references, count: 1, mode: '全能参考' },
      ),
    ).toBe('too-many-video-references');
    expect(
      generationCapabilityIssue(
        { ...capableModel, maxReferenceAudios: 0 },
        { kind: 'video', references, count: 1, mode: '全能参考' },
      ),
    ).toBe('too-many-audio-references');
  });

  it('normalizes the legacy first/last-frame mode before checking the model contract', () => {
    expect(
      generationCapabilityIssue(
        {
          ...MODEL,
          videoModes: ['首尾帧'],
          maxReferenceImages: 2,
        },
        {
          kind: 'video',
          references: [
            { id: 'first', type: 'image', label: '首帧', url: 'blob:first' },
            { id: 'last', type: 'image', label: '尾帧', url: 'blob:last' },
          ],
          count: 1,
          mode: '首尾帧视频',
        },
      ),
    ).toBeNull();
  });
});
