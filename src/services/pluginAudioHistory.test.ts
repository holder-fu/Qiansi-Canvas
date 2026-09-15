import { describe, expect, it } from 'vitest';
import {
  appendPluginAudioHistory,
  createPluginAudioHistoryEntry,
  deletePluginAudioHistory,
  findPluginAudioHistory,
  listPluginAudioHistory,
} from './pluginAudioHistory';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => values.set(key, value),
  };
}

describe('plugin audio history', () => {
  it('persists safe generation metadata without retaining cloned voice bytes', () => {
    const storage = memoryStorage();
    const entry = createPluginAudioHistoryEntry({
      id: 'history-0001',
      createdAt: 1_785_000_000_000,
      pluginId: 'voxcpm2-tts',
      generatorId: 'voxcpm2-local',
      projectId: 'project-a',
      request: {
        mode: 'clone',
        text: '欢迎回到千丝画布。',
        control: '温柔女声',
        referenceAudio: {
          base64: 'c2Vuc2l0aXZlLXZvaWNlLWJ5dGVz',
          mimeType: 'audio/wav',
          fileName: 'voice.wav',
        },
        options: {
          engineTask: 'clone',
          language: 'Chinese',
          speechRate: 1.15,
          qwenTemperature: 0.9,
          qwenTopP: 0.8,
          qwenTopK: 50,
          qwenRepetitionPenalty: 1.05,
          xVectorOnly: true,
          cfgValue: 2,
          inferenceTimesteps: 10,
          normalize: true,
          ignored: { nested: 'value' },
        },
      },
      assetId: 'asset-1',
      audioUrl: '/asset-library/files/asset-1',
      mimeType: 'audio/wav',
      fileName: 'voxcpm2-output.wav',
      durationSeconds: 3.5,
    });

    expect(appendPluginAudioHistory(entry, storage)).toMatchObject({ persisted: true });
    const [stored] = listPluginAudioHistory('voxcpm2-tts', 'voxcpm2-local', 'project-a', storage);

    expect(stored).toMatchObject({
      id: 'history-0001',
      text: '欢迎回到千丝画布。',
      control: '温柔女声',
      requiresReferenceAudio: true,
      options: {
        engineTask: 'clone',
        language: 'Chinese',
        speechRate: 1.15,
        qwenTemperature: 0.9,
        qwenTopP: 0.8,
        qwenTopK: 50,
        qwenRepetitionPenalty: 1.05,
        xVectorOnly: true,
        cfgValue: 2,
        inferenceTimesteps: 10,
        normalize: true,
      },
      durationSeconds: 3.5,
    });
    expect(storage.getItem('qiansi-plugin-audio-history-v1')).not.toContain(
      'c2Vuc2l0aXZlLXZvaWNlLWJ5dGVz',
    );
  });

  it('reports an ephemeral history entry when browser storage is unavailable or full', () => {
    const entry = createPluginAudioHistoryEntry({
      id: 'history-ephemeral',
      createdAt: 1_785_000_000_001,
      pluginId: 'qiansi-audio',
      generatorId: 'qwen3-tts-local',
      projectId: 'project-a',
      request: { mode: 'design', text: '仍可立即保存的音频' },
      assetId: 'asset-ephemeral',
      audioUrl: '/asset-library/files/asset-ephemeral',
      mimeType: 'audio/wav',
      fileName: 'ephemeral.wav',
    });
    const fullStorage = memoryStorage();
    fullStorage.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };

    expect(appendPluginAudioHistory(entry, null)).toEqual({ entry, persisted: false });
    expect(appendPluginAudioHistory(entry, fullStorage)).toEqual({ entry, persisted: false });
    expect(
      listPluginAudioHistory('qiansi-audio', 'qwen3-tts-local', 'project-a', fullStorage),
    ).toEqual([]);
  });

  it('marks multi-reference requests without persisting any reference bytes', () => {
    const storage = memoryStorage();
    const sensitive = 'c2Vuc2l0aXZlLW11bHRpLXJlZmVyZW5jZQ==';
    const entry = createPluginAudioHistoryEntry({
      id: 'history-multi-reference',
      createdAt: 1_785_000_000_002,
      pluginId: 'doubao-seed-audio',
      generatorId: 'doubao-seed-audio-cloud',
      projectId: 'project-a',
      request: {
        mode: 'clone',
        text: '@参考录音1 与 @参考录音2 对话',
        referenceAudios: [
          { base64: sensitive, mimeType: 'audio/wav', fileName: 'voice-1.wav' },
          { base64: sensitive, mimeType: 'audio/wav', fileName: 'voice-2.wav' },
        ],
      },
      assetId: 'asset-multi-reference',
      audioUrl: '/asset-library/files/asset-multi-reference',
      mimeType: 'audio/wav',
      fileName: 'seed-audio.wav',
    });

    expect(appendPluginAudioHistory(entry, storage)).toMatchObject({ persisted: true });
    expect(
      listPluginAudioHistory(
        'doubao-seed-audio',
        'doubao-seed-audio-cloud',
        'project-a',
        storage,
      )[0]?.requiresReferenceAudio,
    ).toBe(true);
    expect(storage.getItem('qiansi-plugin-audio-history-v1')).not.toContain(sensitive);
  });

  it('scopes history and exact audio lookup to the current project and generator', () => {
    const storage = memoryStorage();
    for (const [id, projectId, createdAt] of [
      ['history-0001', 'project-a', 100],
      ['history-0002', 'project-b', 300],
      ['history-0003', 'project-a', 200],
    ] as const) {
      appendPluginAudioHistory(
        createPluginAudioHistoryEntry({
          id,
          createdAt,
          pluginId: 'voxcpm2-tts',
          generatorId: 'voxcpm2-local',
          projectId,
          request: { mode: 'design', text: `提示词 ${id}` },
          assetId: `asset-${id}`,
          audioUrl: `/asset-library/files/asset-${id}`,
          mimeType: 'audio/wav',
          fileName: `${id}.wav`,
        }),
        storage,
      );
    }

    expect(
      listPluginAudioHistory('voxcpm2-tts', 'voxcpm2-local', 'project-a', storage).map(
        (entry) => entry.id,
      ),
    ).toEqual(['history-0003', 'history-0001']);
    expect(
      findPluginAudioHistory('voxcpm2-tts', 'voxcpm2-local', 'project-b', 'history-0001', storage),
    ).toBeUndefined();
  });

  it('shows legacy VoxCPM2 and ChatTTS history inside the matching Qiansi-audio model', () => {
    const storage = memoryStorage();
    for (const [pluginId, generatorId, id, options] of [
      ['voxcpm2-tts', 'voxcpm2-local', 'legacy-vox', { cfgValue: 2 }],
      [
        'chattts-tts',
        'chattts-local',
        'legacy-chat',
        { speakerPreset: '1025.csv', temperature: 0.3, topP: 0.7, topK: 20, speed: 5 },
      ],
    ] as const) {
      appendPluginAudioHistory(
        createPluginAudioHistoryEntry({
          id,
          createdAt: id === 'legacy-vox' ? 100 : 200,
          pluginId,
          generatorId,
          projectId: 'project-a',
          request: { mode: 'design', text: id, options },
          assetId: `asset-${id}`,
          audioUrl: `/asset-library/files/asset-${id}`,
          mimeType: 'audio/wav',
          fileName: `${id}.wav`,
        }),
        storage,
      );
    }

    expect(
      listPluginAudioHistory('qiansi-audio', 'voxcpm2-local', 'project-a', storage).map(
        (entry) => entry.id,
      ),
    ).toEqual(['legacy-vox']);
    expect(
      listPluginAudioHistory('qiansi-audio', 'chattts-local', 'project-a', storage)[0],
    ).toMatchObject({
      id: 'legacy-chat',
      options: {
        speakerPreset: '1025.csv',
        temperature: 0.3,
        topP: 0.7,
        topK: 20,
        speed: 5,
      },
    });
  });

  it('deletes only the exact project-scoped history entry, including a legacy owner', () => {
    const storage = memoryStorage();
    for (const [pluginId, projectId, id] of [
      ['chattts-tts', 'project-a', 'history-delete'],
      ['chattts-tts', 'project-b', 'history-keep-b'],
      ['another-plugin', 'project-a', 'history-keep-other'],
    ] as const) {
      appendPluginAudioHistory(
        createPluginAudioHistoryEntry({
          id,
          createdAt: Date.now(),
          pluginId,
          generatorId: 'chattts-local',
          projectId,
          request: { mode: 'design', text: `${pluginId}-${projectId}` },
          assetId: `asset-${pluginId}-${projectId}`,
          audioUrl: `/asset-library/files/asset-${pluginId}-${projectId}`,
          mimeType: 'audio/wav',
          fileName: `${id}.wav`,
        }),
        storage,
      );
    }

    expect(
      deletePluginAudioHistory(
        'qiansi-audio',
        'chattts-local',
        'project-a',
        'history-delete',
        storage,
      ),
    ).toBe(true);
    expect(listPluginAudioHistory('qiansi-audio', 'chattts-local', 'project-a', storage)).toEqual(
      [],
    );
    expect(
      listPluginAudioHistory('qiansi-audio', 'chattts-local', 'project-b', storage),
    ).toHaveLength(1);
    expect(
      listPluginAudioHistory('another-plugin', 'chattts-local', 'project-a', storage),
    ).toHaveLength(1);
    expect(
      deletePluginAudioHistory(
        'qiansi-audio',
        'chattts-local',
        'project-a',
        'history-delete',
        storage,
      ),
    ).toBe(false);
  });
});
