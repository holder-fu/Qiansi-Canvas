import { describe, expect, it, vi } from 'vitest';
import { startDeferredAppRuntimes } from './deferredAppRuntimes';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('startDeferredAppRuntimes', () => {
  it('starts initial runtimes and schedules LAN collaboration in a later idle stage', async () => {
    let initialTask: (() => void) | undefined;
    let followupTask: (() => void) | undefined;
    const cancelInitial = vi.fn();
    const cancelFollowup = vi.fn();
    const stopModel = vi.fn();
    const stopGenerationRecovery = vi.fn();
    const stopLan = vi.fn();
    const startModelCatalogSync = vi.fn(() => stopModel);
    const startGenerationRecoveryCoordinator = vi.fn(() => stopGenerationRecovery);
    const startLanCollaboration = vi.fn(() => stopLan);

    const stop = startDeferredAppRuntimes({
      scheduleInitial: (task) => {
        initialTask = task;
        return cancelInitial;
      },
      scheduleFollowup: (task) => {
        followupTask = task;
        return cancelFollowup;
      },
      loadModelCatalog: async () => ({ startModelCatalogSync }),
      loadGenerationRecovery: async () => ({ startGenerationRecoveryCoordinator }),
      loadLanCollaboration: async () => ({ startLanCollaboration }),
    });

    expect(startModelCatalogSync).not.toHaveBeenCalled();
    expect(startGenerationRecoveryCoordinator).not.toHaveBeenCalled();
    expect(startLanCollaboration).not.toHaveBeenCalled();

    initialTask?.();
    await flushPromises();
    expect(startModelCatalogSync).toHaveBeenCalledOnce();
    expect(startGenerationRecoveryCoordinator).toHaveBeenCalledOnce();
    expect(followupTask).toBeTypeOf('function');
    expect(startLanCollaboration).not.toHaveBeenCalled();

    followupTask?.();
    await flushPromises();
    expect(startLanCollaboration).toHaveBeenCalledOnce();

    stop();
    expect(cancelInitial).toHaveBeenCalledOnce();
    expect(cancelFollowup).toHaveBeenCalledOnce();
    expect(stopLan).toHaveBeenCalledOnce();
    expect(stopGenerationRecovery).toHaveBeenCalledOnce();
    expect(stopModel).toHaveBeenCalledOnce();
  });

  it('starts generation recovery independently while the model catalog is still loading', async () => {
    let initialTask: (() => void) | undefined;
    let resolveModelCatalog: ((runtime: ModelCatalogRuntimeStub) => void) | undefined;
    type ModelCatalogRuntimeStub = {
      startModelCatalogSync: () => () => void;
    };
    const startModelCatalogSync = vi.fn(() => vi.fn());
    const startGenerationRecoveryCoordinator = vi.fn(() => vi.fn());
    const scheduleFollowup = vi.fn(() => vi.fn());

    const stop = startDeferredAppRuntimes({
      scheduleInitial: (task) => {
        initialTask = task;
        return vi.fn();
      },
      scheduleFollowup,
      loadModelCatalog: () =>
        new Promise<ModelCatalogRuntimeStub>((resolve) => {
          resolveModelCatalog = resolve;
        }),
      loadGenerationRecovery: async () => ({ startGenerationRecoveryCoordinator }),
      loadLanCollaboration: async () => ({ startLanCollaboration: vi.fn(() => vi.fn()) }),
    });

    initialTask?.();
    await flushPromises();

    expect(startGenerationRecoveryCoordinator).toHaveBeenCalledOnce();
    expect(startModelCatalogSync).not.toHaveBeenCalled();
    expect(scheduleFollowup).not.toHaveBeenCalled();

    resolveModelCatalog?.({ startModelCatalogSync });
    await flushPromises();

    expect(startModelCatalogSync).toHaveBeenCalledOnce();
    expect(scheduleFollowup).toHaveBeenCalledOnce();
    stop();
  });

  it('does not start a runtime after the app has already unmounted', async () => {
    let initialTask: (() => void) | undefined;
    let resolveModelCatalog: ((runtime: ModelCatalogRuntimeStub) => void) | undefined;
    type ModelCatalogRuntimeStub = {
      startModelCatalogSync: () => () => void;
    };
    type GenerationRecoveryRuntimeStub = {
      startGenerationRecoveryCoordinator: () => () => void;
    };
    const startModelCatalogSync = vi.fn(() => vi.fn());
    const startGenerationRecoveryCoordinator = vi.fn(() => vi.fn());
    const startLanCollaboration = vi.fn(() => vi.fn());
    let resolveGenerationRecovery: ((runtime: GenerationRecoveryRuntimeStub) => void) | undefined;

    const stop = startDeferredAppRuntimes({
      scheduleInitial: (task) => {
        initialTask = task;
        return vi.fn();
      },
      scheduleFollowup: () => vi.fn(),
      loadModelCatalog: () =>
        new Promise<ModelCatalogRuntimeStub>((resolve) => {
          resolveModelCatalog = resolve;
        }),
      loadGenerationRecovery: () =>
        new Promise<GenerationRecoveryRuntimeStub>((resolve) => {
          resolveGenerationRecovery = resolve;
        }),
      loadLanCollaboration: async () => ({ startLanCollaboration }),
    });

    initialTask?.();
    stop();
    resolveModelCatalog?.({ startModelCatalogSync });
    resolveGenerationRecovery?.({ startGenerationRecoveryCoordinator });
    await flushPromises();

    expect(startModelCatalogSync).not.toHaveBeenCalled();
    expect(startGenerationRecoveryCoordinator).not.toHaveBeenCalled();
    expect(startLanCollaboration).not.toHaveBeenCalled();
  });
});
