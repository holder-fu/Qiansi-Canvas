import {
  scheduleAfterFirstPaint,
  scheduleWhenIdle,
  type CancelScheduledStartupTask,
} from './startupScheduling';

type RuntimeCleanup = () => void;
type RuntimeScheduler = (task: () => void) => CancelScheduledStartupTask;

interface ModelCatalogRuntimeModule {
  startModelCatalogSync: () => RuntimeCleanup;
}

interface GenerationRecoveryRuntimeModule {
  startGenerationRecoveryCoordinator: () => RuntimeCleanup;
}

interface LanCollaborationRuntimeModule {
  startLanCollaboration: () => RuntimeCleanup;
}

export interface DeferredAppRuntimeOptions {
  scheduleInitial?: RuntimeScheduler;
  scheduleFollowup?: RuntimeScheduler;
  loadModelCatalog?: () => Promise<ModelCatalogRuntimeModule>;
  loadGenerationRecovery?: () => Promise<GenerationRecoveryRuntimeModule>;
  loadLanCollaboration?: () => Promise<LanCollaborationRuntimeModule>;
}

/**
 * Start background services in two idle stages. Model availability and
 * generation recovery start independently; LAN discovery follows model setup
 * in a later idle slice so none of them block the first usable canvas frame.
 */
export function startDeferredAppRuntimes(options: DeferredAppRuntimeOptions = {}): RuntimeCleanup {
  const scheduleInitial =
    options.scheduleInitial ?? ((task) => scheduleAfterFirstPaint(task, 1_500));
  const scheduleFollowup = options.scheduleFollowup ?? ((task) => scheduleWhenIdle(task, 4_000));
  const loadModelCatalog = options.loadModelCatalog ?? (() => import('./modelCatalog'));
  const loadGenerationRecovery =
    options.loadGenerationRecovery ?? (() => import('../services/generationRecoveryCoordinator'));
  const loadLanCollaboration =
    options.loadLanCollaboration ?? (() => import('../services/lanCollaboration'));

  let stopped = false;
  let stopModelCatalog: RuntimeCleanup = () => {};
  let stopGenerationRecovery: RuntimeCleanup = () => {};
  let stopLanCollaboration: RuntimeCleanup = () => {};
  let cancelFollowup: CancelScheduledStartupTask = () => {};

  const cancelInitial = scheduleInitial(() => {
    void loadGenerationRecovery()
      .then((runtime) => {
        if (stopped) return;
        stopGenerationRecovery = runtime.startGenerationRecoveryCoordinator();
      })
      .catch(() => {
        // Recovery remains available through the existing manual node action.
      });

    void loadModelCatalog()
      .then((runtime) => {
        if (stopped) return;
        stopModelCatalog = runtime.startModelCatalogSync();
      })
      .catch(() => {
        // Keep the canvas usable if the optional startup warm-up cannot load.
      })
      .finally(() => {
        if (stopped) return;
        cancelFollowup = scheduleFollowup(() => {
          void loadLanCollaboration()
            .then((runtime) => {
              if (stopped) return;
              stopLanCollaboration = runtime.startLanCollaboration();
            })
            .catch(() => {
              // LAN collaboration remains optional outside a paired session.
            });
        });
      });
  });

  return () => {
    stopped = true;
    cancelInitial();
    cancelFollowup();
    stopLanCollaboration();
    stopGenerationRecovery();
    stopModelCatalog();
  };
}
