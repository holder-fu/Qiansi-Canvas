import { describe, expect, it } from 'vitest';
import type { ProviderConnection } from './providerRegistry';
import { createModelCatalogDocument, parseModelCatalogDocument } from './modelCatalog';

function connectedApi(now = Date.now()): ProviderConnection {
  return {
    id: 'api-test',
    name: 'Test API',
    mark: 'T',
    protocol: 'openai',
    category: 'text',
    baseUrl: 'https://api.example.test/v1',
    apiKey: 'must-never-be-persisted',
    enabled: true,
    verifiedAt: now,
    lastVerifiedAt: now,
    models: {
      chat: ['chat-model'],
      image: ['image-model'],
      video: ['video-model'],
      audio: ['audio-model'],
    },
    modelCapabilities: {
      'image-model': { displayName: 'Image Model', inputModalities: ['text', 'image'] },
      'video-model': { displayName: 'Video Model', videoReferenceInput: false },
      'audio-model': { displayName: 'Music Model' },
    },
  };
}

function restoredCli(now = Date.now()): ProviderConnection {
  return {
    id: 'cli-test',
    name: 'Test CLI',
    mark: 'C',
    protocol: 'codex',
    category: 'cli',
    baseUrl: 'http://127.0.0.1:2895/v1',
    apiKey: '',
    enabled: true,
    lastVerifiedAt: now,
    cliStatus: {
      installed: true,
      runnable: true,
      authenticated: true,
      ready: true,
      state: 'ready',
      version: '1.0.0',
      commandPath: 'codex',
      message: '上次检测通过。',
      checkedAt: now,
    },
    models: { chat: ['codex:default'], image: [], video: [] },
  };
}

function runningWorkBuddy(now = Date.now()): ProviderConnection {
  return {
    id: 'workbuddy',
    name: 'WorkBuddy CLI',
    mark: 'WB',
    protocol: 'codebuddy',
    category: 'cli',
    baseUrl: 'http://127.0.0.1:2895/v1',
    apiKey: '',
    enabled: true,
    verifiedAt: now,
    lastVerifiedAt: now,
    cliStatus: {
      installed: true,
      runnable: true,
      running: true,
      authenticated: true,
      ready: true,
      state: 'ready',
      version: '2.133.1',
      commandPath: 'codebuddy',
      message: '活动会话运行中。',
      checkedAt: now,
    },
    models: { chat: ['workbuddy:auto'], image: [], video: [] },
  };
}

describe('model catalog documents', () => {
  it('stores connected model metadata without credentials or endpoints', () => {
    const document = createModelCatalogDocument([connectedApi(100)], undefined, 200);
    const serialized = JSON.stringify(document);

    expect(document).toMatchObject({
      version: 1,
      updatedAt: 200,
      providers: [
        {
          providerId: 'api-test',
          providerName: 'Test API',
          protocol: 'openai',
          state: 'ready',
          discoveredAt: 200,
        },
      ],
    });
    expect(document.providers[0]?.models.image).toEqual([
      {
        id: 'image-model',
        displayName: 'Image Model',
        recommended: false,
        inputModalities: ['text', 'image'],
      },
    ]);
    expect(document.providers[0]?.models.video).toEqual([
      {
        id: 'video-model',
        displayName: 'Video Model',
        recommended: false,
        videoReferenceInput: false,
      },
    ]);
    expect(document.providers[0]?.models.audio).toEqual([]);
    expect(serialized).not.toContain('must-never-be-persisted');
    expect(serialized).not.toContain('api.example.test');
    expect(serialized).not.toContain('apiKey');
  });

  it('keeps a verified remote API ready across a page reload', () => {
    const ready = createModelCatalogDocument([connectedApi(100)], undefined, 200);
    const staleConnection = { ...connectedApi(100), verifiedAt: undefined };
    const restored = createModelCatalogDocument([staleConnection], ready, 300);

    expect(restored.providers[0]).toMatchObject({
      providerId: 'api-test',
      state: 'ready',
      discoveredAt: 200,
    });
    expect(restored.providers[0]?.models).toEqual(ready.providers[0]?.models);
  });

  it('keeps a fully verified CLI catalog ready across a page reload', () => {
    const restored = createModelCatalogDocument([restoredCli(100)], undefined, 200);

    expect(restored.providers[0]).toMatchObject({
      providerId: 'cli-test',
      state: 'ready',
      discoveredAt: 200,
    });
    expect(restored.providers[0]?.models.chat).toEqual([
      expect.objectContaining({ id: 'codex:default' }),
    ]);
  });

  it('removes WorkBuddy from the catalog as soon as its active session closes', () => {
    const now = Date.now();
    const running = runningWorkBuddy(now);
    const ready = createModelCatalogDocument([running], undefined, now + 1);
    const runningStatus = running.cliStatus;
    if (!runningStatus) throw new Error('WorkBuddy status fixture is missing.');
    const closed: ProviderConnection = {
      ...running,
      verifiedAt: undefined,
      cliStatus: { ...runningStatus, running: false, ready: false },
    };

    expect(ready.providers[0]?.providerId).toBe('workbuddy');
    expect(createModelCatalogDocument([closed], ready, now + 2).providers).toEqual([]);
  });

  it('removes a cached provider after its connection history is cleared', () => {
    const ready = createModelCatalogDocument([connectedApi(100)], undefined, 200);
    const disconnected = {
      ...connectedApi(100),
      verifiedAt: undefined,
      lastVerifiedAt: undefined,
    };

    expect(createModelCatalogDocument([disconnected], ready, 300).providers).toEqual([]);
  });

  it('sanitizes malformed files and removes duplicate models', () => {
    const parsed = parseModelCatalogDocument({
      version: 1,
      updatedAt: 123,
      providers: [
        {
          providerId: 'api-test',
          providerName: 'Test API',
          protocol: 'openai',
          state: 'ready',
          discoveredAt: 100,
          apiKey: 'secret',
          models: {
            chat: [
              {
                id: 'chat-model',
                displayName: 'Chat',
                inputModalities: ['text', 'image', 'audio', 'image'],
                videoReferenceInput: true,
              },
              { id: 'chat-model', displayName: 'Duplicate' },
              { id: '', displayName: 'Invalid' },
            ],
            image: [],
            video: [],
          },
        },
      ],
    });

    expect(parsed.providers[0]?.models.chat).toEqual([
      {
        id: 'chat-model',
        displayName: 'Chat',
        recommended: false,
        inputModalities: ['text', 'image'],
        videoReferenceInput: true,
      },
    ]);
    expect(parsed.providers[0]).not.toHaveProperty('apiKey');
    expect(parsed.providers[0]?.models.audio).toEqual([]);
  });

  it('ignores non-boolean video-reference capability values', () => {
    const parsed = parseModelCatalogDocument({
      version: 1,
      updatedAt: 123,
      providers: [
        {
          providerId: 'api-test',
          providerName: 'Test API',
          protocol: 'openai',
          state: 'ready',
          discoveredAt: 100,
          models: {
            chat: [
              { id: 'legacy-model', videoReferenceInput: 'unknown' },
              { id: 'supported-model', videoReferenceInput: true },
            ],
            image: [],
            video: [],
          },
        },
      ],
    });

    expect(parsed.providers[0]?.models.chat).toEqual([
      { id: 'legacy-model', displayName: 'legacy-model', recommended: false },
      {
        id: 'supported-model',
        displayName: 'supported-model',
        recommended: false,
        videoReferenceInput: true,
      },
    ]);
  });

  it('retains bounded visual limits and explicit video operations only', () => {
    const parsed = parseModelCatalogDocument({
      version: 1,
      updatedAt: 123,
      providers: [
        {
          providerId: 'video-api',
          providerName: 'Video API',
          protocol: 'openai',
          state: 'ready',
          discoveredAt: 100,
          models: {
            chat: [],
            image: [],
            video: [
              {
                id: 'video-model',
                maxReferenceImages: 3,
                maxReferenceVideos: 1,
                maxReferenceAudios: 2,
                maxOutputCount: 2,
                videoModes: ['文生视频', '图生视频', 'unknown'],
                videoOperations: ['extend', 'visual-edit', 'masked-repair', 'fake-operation'],
              },
            ],
          },
        },
      ],
    });

    expect(parsed.providers[0]?.models.video[0]).toMatchObject({
      maxReferenceImages: 3,
      maxReferenceVideos: 1,
      maxReferenceAudios: 2,
      maxOutputCount: 2,
      videoModes: ['文生视频', '图生视频'],
      videoOperations: ['extend', 'visual-edit', 'masked-repair'],
    });
  });

  it('rejects a poisoned future revision and invisible direction controls', () => {
    const parsed = parseModelCatalogDocument({
      version: 1,
      updatedAt: Date.now() + 10 * 365 * 24 * 60 * 60_000,
      providers: [
        {
          providerId: 'api-test',
          providerName: 'Test\u202e API',
          protocol: 'openai',
          state: 'stale',
          discoveredAt: 100,
          models: { chat: [{ id: 'chat\u200b-model' }], image: [], video: [] },
        },
      ],
    });

    expect(parsed.updatedAt).toBe(0);
    expect(parsed.providers[0]?.providerName).toBe('Test API');
    expect(parsed.providers[0]?.models.chat[0]?.id).toBe('chat-model');
  });
});
