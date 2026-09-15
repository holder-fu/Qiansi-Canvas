import { useCallback, useState, useEffect, useRef, type ChangeEvent } from 'react';
import {
  X,
  Key,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  Copy,
  AlertCircle,
  Plus,
  RefreshCw,
  BookOpen,
  Plug,
  Power,
  Lock,
  ShieldAlert,
  Download,
  Upload,
  Server,
  ExternalLink,
} from 'lucide-react';
import {
  loadProviderConnections,
  saveProviderConnections,
  providerSetupGuide,
  isCliProtocol,
  isProviderConnectionVerified,
  isProviderConnectionUsable,
  fetchProviderModels,
  mergeDiscoveredProviderModels,
  providerHasModelAdapter,
  validateFixedProviderConfiguration,
  sortProvidersForSettings,
  createRemoteComfyUiConnection,
  isCloudComfyUiProvider,
  isRemoteComfyUiProvider,
  CATEGORY_LABELS,
  comfyWorkflowModelCapability,
  type ProviderConnection,
  type ProviderModelKind,
  type ProviderCategory,
  type ProviderReasoningEffort,
} from '../lib/providerRegistry';
import { BRIDGE_BASE_URL, BRIDGE_V1_BASE_URL } from '../lib/bridgeUrl';
import {
  analyzeComfyWorkflowDependencies,
  createComfyDependencyPowerShell,
  deleteLocalComfyWorkflow,
  fetchComfyUiStatus,
  parseComfyWorkflowImportJson,
  saveLocalComfyWorkflow,
  type ComfyWorkflowDependencyAnalysis,
} from '../lib/comfyWorkflow';
import { hydrateApiKeys, sealKey, isVaultSupported } from '../lib/keyVault';
import {
  JIMENG_IMAGE_MODELS,
  JIMENG_MODEL_DISPLAY_NAMES,
  JIMENG_VIDEO_MODELS,
} from '../lib/jimengCliContract.mjs';
import { ProviderBrandIcon } from './ProviderBrandIcon';
import { resolveApiSettingsSelection } from '../lib/apiSettingsNavigation';
import { ComfyUiVideoGuide } from './ComfyUiVideoGuide';
import { useAppTranslation } from '../i18n/appI18n';
import { comfyProviderNodeWorkflowFileToString } from '../serialization/workflow';
import {
  apiSettingsCliConnectionState,
  mergeApiSettingsRuntimeState,
  subscribeApiSettingsProviderChanges,
} from '../lib/apiSettingsRuntimeState';

type ConnState = 'idle' | 'testing' | 'ok' | 'stale' | 'error';
type PullState = 'idle' | 'pulling' | 'ok' | 'error';

/** Per-provider last known connection result */
type ConnResult = { status: ConnState; message: string; at: number };

/** CLI tool detection status */
type CliStatus = {
  installed: boolean;
  runnable?: boolean;
  running?: boolean;
  cliKind?: string;
  authenticated?: boolean;
  ready?: boolean;
  state?: 'ready' | 'installed' | 'unauthenticated' | 'unavailable' | 'error';
  reasonCode?: string;
  imageGeneration?: boolean;
  imageEditing?: boolean;
  videoGeneration?: boolean;
  hasVipAccess?: boolean;
  version: string;
  commandPath: string;
  message: string;
};
type CliPhase = 'idle' | 'checking' | 'ready' | 'stale' | 'bridge-error';
type CliViewState = { phase: CliPhase; status: CliStatus };
const CLI_DETECTION_TIMEOUT_MS = 45_000;

const emptyCliStatus = (): CliStatus => ({
  installed: false,
  version: '',
  commandPath: '',
  message: '',
});

function providerModelCounts(provider: ProviderConnection) {
  const kinds: ProviderModelKind[] = ['chat', 'image', 'video', 'audio'];
  const connected =
    isProviderConnectionUsable(provider) &&
    (provider.modelDiscovery !== 'fixed' ||
      Boolean(provider.verifiedAt || provider.lastVerifiedAt));
  return kinds.reduce(
    (counts, kind) => {
      const amount = (provider.models[kind] ?? []).length;
      if (
        provider.canGenerate === false ||
        provider.disabledModelKinds?.includes(kind) ||
        !providerHasModelAdapter(provider, kind)
      ) {
        counts.deferred += amount;
      } else if (!connected) {
        counts.unverified += amount;
      } else {
        counts.available += amount;
      }
      return counts;
    },
    { available: 0, deferred: 0, unverified: 0 },
  );
}

function restoredCliStatus(provider: ProviderConnection, historicalMessage: string): CliStatus {
  if (provider.cliStatus) {
    return {
      installed: provider.cliStatus.installed,
      runnable: provider.cliStatus.runnable,
      running: provider.cliStatus.running,
      cliKind: provider.cliStatus.cliKind,
      authenticated: provider.cliStatus.authenticated,
      ready: provider.cliStatus.ready,
      state: provider.cliStatus.state,
      reasonCode: provider.cliStatus.reasonCode,
      imageGeneration: provider.cliStatus.imageGeneration,
      imageEditing: provider.cliStatus.imageEditing,
      videoGeneration: provider.cliStatus.videoGeneration,
      hasVipAccess: provider.cliStatus.hasVipAccess,
      version: provider.cliStatus.version,
      commandPath: provider.cliStatus.commandPath,
      message: provider.cliStatus.message,
    };
  }
  if (provider.lastVerifiedAt) {
    return {
      installed: false,
      runnable: undefined,
      running: undefined,
      cliKind: undefined,
      authenticated: undefined,
      ready: false,
      state: undefined,
      reasonCode: 'historical_snapshot',
      imageGeneration: undefined,
      version: '',
      commandPath: '',
      message: historicalMessage,
    };
  }
  return emptyCliStatus();
}

function cliStatusIsReady(status: CliStatus): boolean {
  return (
    status.installed &&
    status.runnable === true &&
    status.authenticated === true &&
    status.ready === true
  );
}

function hasHistoricalCliConnection(provider: ProviderConnection): boolean {
  return !isProviderConnectionVerified(provider) && isProviderConnectionUsable(provider);
}

const CATEGORY_ORDER: ProviderCategory[] = ['text', 'image', 'cli'];

export function ApiSettingsPanel({
  onClose,
  embedded = false,
  initialProviderId,
}: {
  onClose: () => void;
  embedded?: boolean;
  initialProviderId?: string;
}) {
  const { t } = useAppTranslation();
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ProviderCategory>('text');
  const [selectedId, setSelectedId] = useState<string>('');
  const [pullStates, setPullStates] = useState<Record<string, PullState>>({});
  const [showGuide, setShowGuide] = useState(false);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [vaultWarn, setVaultWarn] = useState(false);
  /** Per-provider connection test result (survives tab switches) */
  const [connResults, setConnResults] = useState<Record<string, ConnResult>>({});
  const apiDetectionRunRef = useRef<Record<string, number>>({});
  const cliDetectionRunRef = useRef<Record<string, number>>({});
  const cliDetectionAbortRef = useRef<Record<string, AbortController>>({});
  const pendingLocalProviderIdsRef = useRef(new Set<string>());
  const panelActiveRef = useRef(true);
  const jimengLoginPollRef = useRef<{
    providerId: string;
    poll: number;
    timeout: number;
  } | null>(null);

  /** CLI detection state */
  const [cliStates, setCliStates] = useState<Record<string, CliViewState>>({});
  /** Jimeng-specific account state */
  const [jimengAccount, setJimengAccount] = useState<{
    phase: 'idle' | 'installing' | 'waiting' | 'checking' | 'logged-in' | 'error';
    running: boolean;
    loggedIn: boolean;
    credit?: string;
    installText?: string;
    text?: string;
    qrUrl?: string;
    verificationUri?: string;
    userCode?: string;
    expiresAt?: string;
    message?: string;
  }>({ phase: 'idle', running: false, loggedIn: false });

  // Add-custom-provider form (text category only)
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const cancelAllProviderWork = useCallback(() => {
    Object.keys(apiDetectionRunRef.current).forEach((providerId) => {
      apiDetectionRunRef.current[providerId] = (apiDetectionRunRef.current[providerId] ?? 0) + 1;
    });
    Object.keys(cliDetectionRunRef.current).forEach((providerId) => {
      cliDetectionRunRef.current[providerId] = (cliDetectionRunRef.current[providerId] ?? 0) + 1;
    });
    Object.values(cliDetectionAbortRef.current).forEach((controller) => controller.abort());
    const loginPoll = jimengLoginPollRef.current;
    if (loginPoll) {
      window.clearInterval(loginPoll.poll);
      window.clearTimeout(loginPoll.timeout);
      jimengLoginPollRef.current = null;
    }
  }, []);

  // Load + decrypt (hydrate) the stored keys into memory on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = loadProviderConnections();
      const decrypted = await hydrateApiKeys(loaded);
      if (cancelled) return;
      setConnections(decrypted);
      setConnResults(
        Object.fromEntries(
          decrypted
            .filter(
              (provider) =>
                provider.verifiedAt || provider.lastVerifiedAt || provider.configValidatedAt,
            )
            .map((provider) => [
              provider.id,
              {
                status: provider.configValidatedAt
                  ? ('stale' as const)
                  : isProviderConnectionUsable(provider)
                    ? ('ok' as const)
                    : ('stale' as const),
                message: provider.configValidatedAt
                  ? t(
                      'apiSettings.status.fixedConfigurationValidated',
                      '固定模型与接口格式已校验；API Key 将在首次生成时由上游验证。',
                    )
                  : provider.verifiedAt
                    ? t('apiSettings.status.sessionConnectionVerified', '本次会话已验证连接。')
                    : isCliProtocol(provider.protocol)
                      ? t(
                          'apiSettings.status.restoredConnectionReviewing',
                          '已恢复上次验证通过的连接，后台将自动复核。',
                        )
                      : t(
                          'apiSettings.status.restoredConnectionReady',
                          '已恢复上次验证通过的连接，画布可直接使用。',
                        ),
                at:
                  provider.verifiedAt ??
                  provider.lastVerifiedAt ??
                  provider.configValidatedAt ??
                  Date.now(),
              },
            ]),
        ),
      );
      const initialSelection = resolveApiSettingsSelection(decrypted, initialProviderId);
      setActiveCategory(initialSelection.category);
      setSelectedId(initialSelection.providerId);
      setHydrated(true);
      if (!isVaultSupported()) setVaultWarn(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialProviderId, t]);

  // Persist on every change — plaintext keys are stripped before writing;
  // the real secret lives in the encrypted vault (see keyVault.ts).
  useEffect(() => {
    if (!hydrated) return;
    saveProviderConnections(connections);
    pendingLocalProviderIdsRef.current.clear();
    setConnections((current) => mergeApiSettingsRuntimeState(current, loadProviderConnections()));
  }, [connections, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    return subscribeApiSettingsProviderChanges(() => {
      const pendingLocalProviderIds = new Set(pendingLocalProviderIdsRef.current);
      const latest = loadProviderConnections();
      setConnections((current) =>
        mergeApiSettingsRuntimeState(current, latest, pendingLocalProviderIds),
      );
    });
  }, [hydrated]);

  // The app-level catalog warm-up is intentionally deferred so the canvas can
  // paint first. If the user opens API settings before that idle task runs,
  // start the same shared refresh here rather than requiring a manual probe.
  // The model-catalog module deduplicates this with the app-level refresh.
  useEffect(() => {
    if (!hydrated || activeCategory !== 'cli') return;
    let cancelled = false;
    void import('../lib/modelCatalog')
      .then(({ refreshModelCatalog }) => {
        if (!cancelled) return refreshModelCatalog();
        return undefined;
      })
      .catch(() => {
        /* The explicit detection button remains available if the bridge is down. */
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory, hydrated]);

  useEffect(() => {
    panelActiveRef.current = true;
    return () => {
      panelActiveRef.current = false;
      cancelAllProviderWork();
    };
  }, [cancelAllProviderWork]);

  const categoryProviders = sortProvidersForSettings(
    connections.filter((c) => c.category === activeCategory),
  );
  const selected =
    connections.find((c) => c.id === selectedId && c.category === activeCategory) ??
    categoryProviders[0];
  const selectedCliState = selected
    ? (cliStates[selected.id] ?? {
        phase: isProviderConnectionUsable(selected)
          ? ('ready' as const)
          : selected.lastVerifiedAt
            ? ('stale' as const)
            : ('idle' as const),
        status: restoredCliStatus(
          selected,
          t(
            'apiSettings.cli.status.restoredHistoryReviewing',
            '已恢复历史检测记录，正在后台复核。',
          ),
        ),
      })
    : { phase: 'idle' as const, status: emptyCliStatus() };
  const cliPhase = selectedCliState.phase;
  const cliStatus = selectedCliState.status;
  const selectedResult = selected ? connResults[selected.id] : undefined;
  const connState = selectedResult?.status ?? 'idle';
  const connMessage = selectedResult?.message ?? '';
  const pullState = selected ? (pullStates[selected.id] ?? 'idle') : 'idle';

  useEffect(() => {
    if (!selected && categoryProviders[0]) setSelectedId(categoryProviders[0].id);
  }, [activeCategory, categoryProviders, selected]);

  const switchCategory = (category: ProviderCategory) => {
    setActiveCategory(category);
    const first = sortProvidersForSettings(
      connections.filter((connection) => connection.category === category),
    )[0];
    if (first) {
      setSelectedId(first.id);
      if (category === 'cli') {
        // The app-level catalog coordinator owns automatic probes. Entering
        // settings only adopts its latest in-memory result; an explicit
        // "重新检测" remains the sole force-probe action in this panel.
        const latestById = new Map(
          loadProviderConnections().map((provider) => [provider.id, provider]),
        );
        setConnections((current) =>
          current.map((provider) => {
            if (!isCliProtocol(provider.protocol)) return provider;
            const latest = latestById.get(provider.id);
            if (!latest) return provider;
            return {
              ...provider,
              verifiedAt: latest.verifiedAt,
              lastVerifiedAt: latest.lastVerifiedAt,
              cliStatus: latest.cliStatus,
              models: latest.models,
              modelCapabilities: latest.modelCapabilities,
            };
          }),
        );
      }
    }
  };

  const recordConnectionResult = (id: string, status: ConnState, message: string) => {
    setConnResults((prev) => ({ ...prev, [id]: { status, message, at: Date.now() } }));
  };

  const setCliProviderState = (id: string, phase: CliPhase, status: CliStatus) => {
    setCliStates((prev) => ({ ...prev, [id]: { phase, status } }));
  };

  const invalidateProviderDetections = (providerId: string) => {
    apiDetectionRunRef.current[providerId] = (apiDetectionRunRef.current[providerId] ?? 0) + 1;
    cliDetectionRunRef.current[providerId] = (cliDetectionRunRef.current[providerId] ?? 0) + 1;
    cliDetectionAbortRef.current[providerId]?.abort();
    delete cliDetectionAbortRef.current[providerId];
    const loginPoll = jimengLoginPollRef.current;
    if (loginPoll?.providerId === providerId) {
      window.clearInterval(loginPoll.poll);
      window.clearTimeout(loginPoll.timeout);
      jimengLoginPollRef.current = null;
      setJimengAccount((current) => ({
        ...current,
        phase: 'idle',
        running: false,
        loggedIn: false,
        message: t(
          'apiSettings.cli.status.connectionChangedScanAgain',
          '连接配置已变更，请重新扫码。',
        ),
      }));
    }
  };

  const updateConnection = (
    targetId: string,
    patch: Partial<ProviderConnection>,
    clearConnectionResult = true,
  ) => {
    // A result from the old URL/key/protocol must never authenticate the
    // newly edited connection. `false` is reserved for applying the result of
    // the current probe itself.
    if (clearConnectionResult) invalidateProviderDetections(targetId);
    pendingLocalProviderIdsRef.current.add(targetId);
    setConnections((prev) =>
      prev.map((c) => {
        if (c.id !== targetId) return c;
        const next: ProviderConnection = { ...c, ...patch };
        if (patch.models) {
          next.models = {
            chat: [...patch.models.chat],
            image: [...patch.models.image],
            video: [...patch.models.video],
            audio: [...(patch.models.audio ?? [])],
            '3d': [...(patch.models['3d'] ?? [])],
          };
        }
        if (clearConnectionResult) {
          next.verifiedAt = undefined;
          next.lastVerifiedAt = undefined;
          next.configValidatedAt = undefined;
        }
        if (clearConnectionResult && isCliProtocol(next.protocol)) {
          delete next.cliStatus;
        }
        return next;
      }),
    );
    if (clearConnectionResult) {
      setConnResults((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      setCliStates((prev) => {
        if (!(targetId in prev)) return prev;
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }
    if (typeof patch.apiKey === 'string') {
      sealKey(targetId, patch.apiKey).catch(() => {
        flashToast(
          t('apiSettings.notice.keySaveFailed', '密钥未能安全保存；请检查浏览器存储权限后重试。'),
        );
      });
    }
  };

  const updateSelected = (patch: Partial<ProviderConnection>) => {
    if (selected) updateConnection(selected.id, patch);
  };

  // Model ordering and reasoning effort are canvas preferences, not connection
  // credentials. Changing them must not revoke an already verified provider.
  const updateSelectedPreference = (patch: Partial<ProviderConnection>) => {
    if (selected) updateConnection(selected.id, patch, false);
  };

  const testConnection = async () => {
    if (!selected) return;
    if (isCli) {
      detectCli();
      return;
    }
    const provider = selected;
    if (provider.modelDiscovery === 'fixed') {
      try {
        const message = validateFixedProviderConfiguration(provider);
        const checkedAt = Date.now();
        updateConnection(
          provider.id,
          {
            configValidatedAt: checkedAt,
            verifiedAt: undefined,
            lastVerifiedAt: undefined,
          },
          false,
        );
        recordConnectionResult(provider.id, 'stale', message);
      } catch (error) {
        recordConnectionResult(
          provider.id,
          'error',
          error instanceof Error
            ? error.message
            : t('apiSettings.error.invalidImageConfiguration', '图片 API 配置无效。'),
        );
      }
      return;
    }
    const runId = (apiDetectionRunRef.current[provider.id] ?? 0) + 1;
    apiDetectionRunRef.current[provider.id] = runId;
    recordConnectionResult(
      provider.id,
      'testing',
      t('apiSettings.status.verifyingLiveConnection', '正在验证真实连接…'),
    );
    try {
      const data = await fetchProviderModels(provider);
      if (runId !== apiDetectionRunRef.current[provider.id]) return;
      const msg = data.message || t('apiSettings.status.connectionSucceeded', '连接成功。');
      const checkedAt = Date.now();
      const discoveredModels = mergeDiscoveredProviderModels(provider, data);
      updateConnection(
        provider.id,
        {
          models: discoveredModels,
          verifiedAt: checkedAt,
          lastVerifiedAt: checkedAt,
        },
        false,
      );
      recordConnectionResult(provider.id, 'ok', msg);
    } catch (e) {
      if (runId !== apiDetectionRunRef.current[provider.id]) return;
      const msg =
        e instanceof Error ? e.message : t('apiSettings.error.connectionFailed', '连接失败。');
      updateConnection(
        provider.id,
        {
          verifiedAt: undefined,
          // This explicit recheck is authoritative. Keeping an older success
          // would leave the model selectable while Settings reports failure.
          lastVerifiedAt: undefined,
        },
        false,
      );
      recordConnectionResult(provider.id, 'error', msg);
    }
  };

  const pullModels = async () => {
    if (!selected) return;
    const provider = selected;
    if (provider.modelDiscovery === 'fixed') {
      try {
        const message = validateFixedProviderConfiguration(provider);
        updateConnection(provider.id, { configValidatedAt: Date.now() }, false);
        recordConnectionResult(provider.id, 'stale', message);
        flashToast(
          t('apiSettings.notice.fixedModelsRetained', '该平台使用固定模型，已保留管理员配置'),
        );
      } catch (error) {
        recordConnectionResult(
          provider.id,
          'error',
          error instanceof Error
            ? error.message
            : t('apiSettings.error.invalidImageConfiguration', '图片 API 配置无效。'),
        );
      }
      return;
    }
    const runId = (apiDetectionRunRef.current[provider.id] ?? 0) + 1;
    apiDetectionRunRef.current[provider.id] = runId;
    setPullStates((prev) => ({ ...prev, [provider.id]: 'pulling' }));
    recordConnectionResult(
      provider.id,
      'testing',
      t('apiSettings.status.readingAndClassifyingModels', '正在读取并分类模型…'),
    );
    try {
      const data = await fetchProviderModels(provider);
      if (runId !== apiDetectionRunRef.current[provider.id]) return;
      const checkedAt = Date.now();
      updateConnection(
        provider.id,
        {
          models: mergeDiscoveredProviderModels(provider, data),
          verifiedAt: checkedAt,
          lastVerifiedAt: checkedAt,
        },
        false,
      );
      recordConnectionResult(provider.id, 'ok', data.message);
      setPullStates((prev) => ({ ...prev, [provider.id]: 'ok' }));
      flashToast(t('apiSettings.notice.modelsFetched', '已拉取并分类模型'));
    } catch (e) {
      if (runId !== apiDetectionRunRef.current[provider.id]) return;
      updateConnection(
        provider.id,
        {
          verifiedAt: undefined,
          // A failed manual pull must revoke the last usable observation too.
          lastVerifiedAt: undefined,
        },
        false,
      );
      recordConnectionResult(
        provider.id,
        'error',
        e instanceof Error ? e.message : t('apiSettings.error.modelFetchFailed', '读取模型失败。'),
      );
      setPullStates((prev) => ({ ...prev, [provider.id]: 'error' }));
    }
  };

  // ── CLI detection (mirrors old version detectLocalCliTools) ──
  const detectCli = async (provider?: ProviderConnection) => {
    const p = provider ?? selected;
    if (!p) return;
    const loginPoll = jimengLoginPollRef.current;
    if (loginPoll?.providerId === p.id) {
      window.clearInterval(loginPoll.poll);
      window.clearTimeout(loginPoll.timeout);
      jimengLoginPollRef.current = null;
    }
    const runId = (cliDetectionRunRef.current[p.id] ?? 0) + 1;
    cliDetectionRunRef.current[p.id] = runId;
    cliDetectionAbortRef.current[p.id]?.abort();
    const controller = new AbortController();
    cliDetectionAbortRef.current[p.id] = controller;
    const timeoutId = window.setTimeout(
      () => controller.abort(new DOMException('CLI status detection timed out', 'TimeoutError')),
      CLI_DETECTION_TIMEOUT_MS,
    );
    const previousStatus =
      cliStates[p.id]?.status ??
      restoredCliStatus(
        p,
        t('apiSettings.cli.status.restoredHistoryReviewing', '已恢复历史检测记录，正在后台复核。'),
      );
    setCliProviderState(p.id, 'checking', {
      ...previousStatus,
      message: previousStatus.installed
        ? t(
            'apiSettings.cli.status.revalidatingCapabilities',
            '正在重新验证命令、登录态和真实可用能力。',
          )
        : t('apiSettings.cli.status.detectingLocalCli', '正在检测本机 CLI…'),
    });
    recordConnectionResult(
      p.id,
      'testing',
      p.verifiedAt || p.lastVerifiedAt
        ? t('apiSettings.status.performingLiveCheck', '正在执行真实连接检测…')
        : t('apiSettings.status.autoDetecting', '正在自动检测…'),
    );
    try {
      if (p.protocol === 'comfyui') {
        const data = await fetchComfyUiStatus(p, controller.signal);
        if (runId !== cliDetectionRunRef.current[p.id]) return;
        const checkedAt = Date.now();
        const discoveredImageWorkflowIds = data.workflows
          .filter((workflow) => workflow.kind === 'image')
          .map((workflow) => workflow.id);
        const discoveredVideoWorkflowIds = data.workflows
          .filter((workflow) => workflow.kind === 'video')
          .map((workflow) => workflow.id);
        const discoveredAudioWorkflowIds = data.workflows
          .filter((workflow) => workflow.kind === 'audio')
          .map((workflow) => workflow.id);
        const discovered3dWorkflowIds = data.workflows
          .filter((workflow) => workflow.kind === '3d')
          .map((workflow) => workflow.id);
        const imageWorkflowIds = [
          ...p.models.image.filter((id) => discoveredImageWorkflowIds.includes(id)),
          ...discoveredImageWorkflowIds.filter((id) => !p.models.image.includes(id)),
        ];
        const videoWorkflowIds = [
          ...p.models.video.filter((id) => discoveredVideoWorkflowIds.includes(id)),
          ...discoveredVideoWorkflowIds.filter((id) => !p.models.video.includes(id)),
        ];
        const audioWorkflowIds = [
          ...(p.models.audio ?? []).filter((id) => discoveredAudioWorkflowIds.includes(id)),
          ...discoveredAudioWorkflowIds.filter((id) => !(p.models.audio ?? []).includes(id)),
        ];
        const model3dWorkflowIds = [
          ...(p.models['3d'] ?? []).filter((id) => discovered3dWorkflowIds.includes(id)),
          ...discovered3dWorkflowIds.filter((id) => !(p.models['3d'] ?? []).includes(id)),
        ];
        const workflowCount =
          imageWorkflowIds.length +
          videoWorkflowIds.length +
          audioWorkflowIds.length +
          model3dWorkflowIds.length;
        const ready = data.ready;
        const status: CliStatus = {
          installed: ready,
          runnable: ready,
          authenticated: ready,
          ready,
          state: ready ? 'ready' : 'unavailable',
          reasonCode: ready ? undefined : 'comfyui_unavailable',
          imageGeneration: ready && imageWorkflowIds.length > 0,
          imageEditing: false,
          videoGeneration: ready && videoWorkflowIds.length > 0,
          version: String(data.system?.comfyui_version ?? data.system?.version ?? '').trim(),
          commandPath: p.baseUrl,
          message: ready
            ? workflowCount
              ? t(
                  'apiSettings.comfy.status.connectedWithWorkflows',
                  'ComfyUI 已连接，已载入 {count} 个图片、视频、音频或 3D 工作流。',
                  { count: workflowCount },
                )
              : t(
                  'apiSettings.comfy.status.connectedNeedsWorkflow',
                  'ComfyUI 已连接，请导入 ComfyUI 图片、视频、音频或 3D 工作流 JSON。',
                )
            : data.error ||
              (isRemoteComfyUiProvider(p)
                ? t(
                    'apiSettings.comfy.error.remoteUnavailable',
                    '画布桥已启动，但未能连接远程 ComfyUI。',
                  )
                : t(
                    'apiSettings.comfy.error.localUnavailable',
                    '画布桥已启动，但未能连接本机 ComfyUI。',
                  )),
        };
        setCliProviderState(p.id, 'ready', status);
        recordConnectionResult(p.id, ready ? 'ok' : 'error', status.message);
        updateConnection(
          p.id,
          {
            verifiedAt: ready ? checkedAt : undefined,
            lastVerifiedAt: ready ? checkedAt : undefined,
            cliStatus: { ...status, checkedAt },
            models: {
              chat: [],
              image: imageWorkflowIds,
              video: videoWorkflowIds,
              audio: audioWorkflowIds,
              '3d': model3dWorkflowIds,
            },
            modelCapabilities: Object.fromEntries(
              data.workflows.map((workflow) => [
                workflow.id,
                comfyWorkflowModelCapability(workflow),
              ]),
            ),
          },
          false,
        );
        return;
      }
      // Built-in CLI status belongs to the Bridge serving this page. Provider
      // baseUrl may be a restored localhost/LAN address from an earlier run and
      // must not decide whether the current local CLI is connected.
      const bridgeBase = BRIDGE_BASE_URL;
      const toolKey =
        p.protocol === 'codex'
          ? 'codex'
          : p.protocol === 'volcengine-cli'
            ? 'arkcli'
            : p.protocol === 'codebuddy'
              ? 'codebuddy'
              : p.protocol === 'gemini-cli'
                ? 'gemini'
                : p.protocol === 'jimeng'
                  ? 'jimeng'
                  : p.protocol === 'bailian'
                    ? 'bailian'
                    : p.protocol === 'lightx2v'
                      ? 'lightx2v'
                      : '';
      if (!toolKey) {
        throw new Error(
          t(
            'apiSettings.cli.error.unverifiableCustomProtocol',
            '自定义 CLI 尚未声明可验证的桥接协议，不能标记为已连接。',
          ),
        );
      }
      const statusQuery = new URLSearchParams({ tool: toolKey, force: '1' });
      if (p.protocol === 'lightx2v') {
        const saved = await fetch(`${bridgeBase}/lightx2v/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: p.cliConfig ?? {} }),
          signal: controller.signal,
        });
        if (!saved.ok) {
          const payload = (await saved.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(payload.error?.message || 'LightX2V 本机配置保存失败。');
        }
      }
      const statusUrl = `${bridgeBase}/cli/status?${statusQuery.toString()}`;
      // `/health` verifies the real Dreamina login with `user_credit`; on a
      // normal connection that command can take longer than eight seconds.
      let res = await fetch(statusUrl, {
        signal: controller.signal,
      });
      // A bridge process started before this update does not know the
      // provider-specific route yet. Keep it usable until the next restart.
      if (res.status === 404) {
        res = await fetch(`${bridgeBase}/health`, {
          signal: controller.signal,
        });
      }
      if (runId !== cliDetectionRunRef.current[p.id]) return;
      const data = (await res.json()) as {
        tools?: Record<string, boolean>;
        capabilities?: Record<
          string,
          { imageGeneration?: boolean; imageEditing?: boolean; videoGeneration?: boolean }
        >;
        sessions?: Record<
          string,
          Partial<CliStatus> & {
            loggedIn?: boolean;
            hasVipAccess?: boolean;
            models?:
              | Array<{
                  slug?: string;
                  displayName?: string;
                  defaultReasoningEffort?: string;
                  reasoningEfforts?: string[];
                  inputModalities?: string[];
                }>
              | { image?: string[]; video?: string[] };
          }
        >;
        error?: { message?: string };
      };
      if (runId !== cliDetectionRunRef.current[p.id]) return;
      if (!res.ok)
        throw new Error(
          data.error?.message ||
            t('apiSettings.cli.error.detectionServiceStopped', '本地检测服务未启动。'),
        );

      const session = data.sessions?.[toolKey] || {};
      const installed = Boolean(data.tools?.[toolKey] ?? session.installed);
      const hasVipAccess =
        typeof session.hasVipAccess === 'boolean' ? session.hasVipAccess : undefined;
      const jimengVipBlocked = p.protocol === 'jimeng' && hasVipAccess !== true;
      const status: CliStatus = {
        installed,
        runnable: typeof session.runnable === 'boolean' ? session.runnable : undefined,
        authenticated:
          typeof session.authenticated === 'boolean'
            ? session.authenticated
            : typeof session.loggedIn === 'boolean'
              ? session.loggedIn
              : undefined,
        ready:
          installed &&
          session.runnable === true &&
          (p.protocol !== 'codebuddy' || session.running === true) &&
          (p.protocol !== 'gemini-cli' || session.cliKind === 'agy') &&
          !jimengVipBlocked &&
          (session.authenticated === true || session.loggedIn === true) &&
          session.ready === true,
        state: session.state,
        cliKind: typeof session.cliKind === 'string' ? session.cliKind.trim() : undefined,
        reasonCode: jimengVipBlocked
          ? hasVipAccess === false
            ? 'vip_required'
            : 'vip_status_unknown'
          : String(session.reasonCode || '').trim() || undefined,
        imageGeneration: Boolean(
          data.capabilities?.[toolKey]?.imageGeneration ?? session.imageGeneration,
        ),
        imageEditing: Boolean(data.capabilities?.[toolKey]?.imageEditing ?? session.imageEditing),
        videoGeneration: Boolean(
          data.capabilities?.[toolKey]?.videoGeneration ?? session.videoGeneration,
        ),
        hasVipAccess,
        version: String(session.version || '').trim(),
        commandPath: String(session.commandPath || '').trim(),
        message: String(
          session.message ||
            (jimengVipBlocked
              ? hasVipAccess === false
                ? '即梦 CLI 已登录，但当前账号不是 VIP；不会在画布中显示即梦模型。'
                : '即梦 CLI 已登录，但无法确认 VIP 权限；请更新官方 CLI 后重新检测。'
              : installed
                ? t('apiSettings.cli.status.localCommandFound', '已检测到本机命令。')
                : t('apiSettings.cli.status.providerNotFound', '未找到 {name}。', {
                    name: p.name,
                  })),
        ).trim(),
      };

      status.running = typeof session.running === 'boolean' ? session.running : undefined;
      const ready =
        cliStatusIsReady(status) &&
        (p.protocol !== 'codebuddy' || status.running === true) &&
        (p.protocol !== 'gemini-cli' || status.cliKind === 'agy') &&
        (p.protocol !== 'jimeng' || status.hasVipAccess === true);
      status.ready = ready;
      status.state =
        status.state ??
        (ready
          ? 'ready'
          : jimengVipBlocked
            ? 'installed'
            : installed
              ? 'unauthenticated'
              : 'unavailable');
      if (
        (p.protocol === 'gemini-cli' || p.protocol === 'codebuddy') &&
        installed &&
        !ready &&
        typeof session.ready !== 'boolean'
      ) {
        status.message = t(
          'apiSettings.cli.status.bridgeNeedsRestart',
          '当前本地桥只确认 CLI 已安装，没有验证登录、运行状态和模型可用性；请重启 Qiansi-Canvas 后重新检测。',
        );
      }
      if (p.protocol === 'gemini-cli' && installed && session.cliKind !== 'agy') {
        status.message = t(
          'apiSettings.cli.status.antigravityFallbackRejected',
          '检测到的是 Gemini CLI，不是 Antigravity CLI；该回退已停用，请安装或登录 agy 后重新检测。',
        );
      }
      setCliProviderState(p.id, 'ready', status);
      recordConnectionResult(p.id, ready ? 'ok' : 'error', status.message);

      let detectedModels = p.models;
      let detectedCapabilities = p.modelCapabilities;
      if (p.protocol === 'codex') {
        if (!ready) {
          detectedModels = { chat: [], image: [], video: [], audio: [] };
          detectedCapabilities = {};
        } else {
          const sessionModels = Array.isArray(session.models) ? session.models : [];
          const models = sessionModels
            .map((model) => String(model.slug || '').trim())
            .filter(Boolean)
            .map((model) => `codex:${model}`);
          const modelCapabilities: NonNullable<ProviderConnection['modelCapabilities']> = {};
          for (const model of sessionModels) {
            const slug = String(model.slug || '').trim();
            if (!slug) continue;
            const efforts = (model.reasoningEfforts ?? []).filter((effort) =>
              ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(effort),
            ) as Array<'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'>;
            const defaultReasoningEffort = model.defaultReasoningEffort as
              'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
            const inputModalities = Array.from(
              new Set(
                (model.inputModalities ?? []).filter(
                  (modality): modality is 'text' | 'image' =>
                    modality === 'text' || modality === 'image',
                ),
              ),
            );
            modelCapabilities[`codex:${slug}`] = {
              displayName: String(model.displayName || slug),
              defaultReasoningEffort: efforts.includes(defaultReasoningEffort)
                ? defaultReasoningEffort
                : (efforts[0] ?? 'medium'),
              reasoningEfforts: efforts,
              inputModalities,
            };
          }
          detectedModels = {
            chat: Array.from(new Set([...models, 'codex:default'])),
            image: status.imageGeneration ? ['codex:$imagegen'] : [],
            video: [],
            audio: [],
          };
          detectedCapabilities = {
            ...(p.modelCapabilities?.['codex:default']
              ? { 'codex:default': p.modelCapabilities['codex:default'] }
              : {}),
            ...modelCapabilities,
            ...(status.imageGeneration
              ? {
                  'codex:$imagegen': {
                    displayName: 'GPT Image',
                    inputModalities: ['text', 'image'] as const,
                    maxReferenceImages: 5,
                    maxReferenceVideos: 0,
                    maxReferenceAudios: 0,
                    maxOutputCount: 1 as const,
                  },
                }
              : {}),
          };
        }
      } else if (p.protocol === 'volcengine-cli') {
        // Ark CLI installation/authentication is exposed for terminal use, but
        // no canvas execution adapter is enabled yet. Never publish session
        // metadata as canvas generation models.
        detectedModels = { chat: [], image: [], video: [], audio: [] };
        detectedCapabilities = {};
      } else if (p.protocol === 'codebuddy') {
        const sessionModels = Array.isArray(session.models) ? session.models : [];
        const configuredModels = sessionModels
          .map((model) => String(model.slug || '').trim())
          .filter((model) => model && model !== 'auto');
        detectedModels = {
          chat: ready
            ? Array.from(
                new Set([
                  'workbuddy:auto',
                  ...configuredModels.map((model) => `workbuddy:${model}`),
                ]),
              )
            : [],
          image: ready && status.imageGeneration ? ['workbuddy:$imagegen'] : [],
          video: [],
          audio: [],
        };
        detectedCapabilities = ready
          ? {
              'workbuddy:auto': {
                displayName: t('apiSettings.cli.workBuddyAutoModel', 'WorkBuddy 自动选择'),
                inputModalities: ['text', 'image'],
              },
              ...Object.fromEntries(
                configuredModels.map((model) => [
                  `workbuddy:${model}`,
                  {
                    displayName: model,
                    inputModalities:
                      model.toLowerCase() === 'hy3'
                        ? (['text', 'image'] as const)
                        : (['text'] as const),
                  },
                ]),
              ),
              ...(ready && status.imageGeneration
                ? {
                    'workbuddy:$imagegen': {
                      displayName: 'CodeBuddy 图片生成',
                      inputModalities: ['text', 'image'] as const,
                      maxReferenceImages: 1,
                      maxOutputCount: 1,
                    },
                  }
                : {}),
            }
          : {};
      } else if (p.protocol === 'jimeng') {
        const advertisedModels =
          session.models && !Array.isArray(session.models) ? session.models : undefined;
        const supportedImages = new Set(JIMENG_IMAGE_MODELS);
        const supportedVideos = new Set(JIMENG_VIDEO_MODELS);
        const imageModels = (
          Array.isArray(advertisedModels?.image) ? advertisedModels.image : [...JIMENG_IMAGE_MODELS]
        ).filter((model) => supportedImages.has(model));
        const videoModels = (
          Array.isArray(advertisedModels?.video) ? advertisedModels.video : [...JIMENG_VIDEO_MODELS]
        ).filter((model) => supportedVideos.has(model));
        detectedModels = {
          chat: [],
          image: ready && status.imageGeneration ? imageModels : [],
          video: ready && status.videoGeneration ? videoModels : [],
          audio: [],
        };
        detectedCapabilities = ready
          ? Object.fromEntries(
              [...JIMENG_IMAGE_MODELS, ...JIMENG_VIDEO_MODELS].map((model) => [
                model,
                {
                  displayName: JIMENG_MODEL_DISPLAY_NAMES[model] ?? model,
                  ...(JIMENG_VIDEO_MODELS.includes(model) ? { videoReferenceInput: false } : {}),
                },
              ]),
            )
          : {};
      } else if (p.protocol === 'bailian' || p.protocol === 'lightx2v') {
        const advertisedModels =
          session.models && !Array.isArray(session.models) ? session.models : undefined;
        detectedModels = {
          chat: [],
          image: status.imageGeneration
            ? Array.isArray(advertisedModels?.image)
              ? advertisedModels.image
              : p.models.image
            : [],
          video: status.videoGeneration
            ? Array.isArray(advertisedModels?.video)
              ? advertisedModels.video
              : p.models.video
            : [],
          audio: [],
        };
      }

      const checkedAt = Date.now();
      updateConnection(
        p.id,
        {
          verifiedAt: ready ? checkedAt : undefined,
          lastVerifiedAt: ready ? checkedAt : undefined,
          cliStatus: { ...status, checkedAt },
          ...(p.protocol === 'codex' ||
          p.protocol === 'volcengine-cli' ||
          p.protocol === 'codebuddy' ||
          p.protocol === 'jimeng' ||
          p.protocol === 'bailian' ||
          p.protocol === 'lightx2v'
            ? { models: detectedModels, modelCapabilities: detectedCapabilities }
            : {}),
        },
        false,
      );

      if (toolKey === 'jimeng') {
        setJimengAccount((prev) =>
          prev.running
            ? prev
            : {
                ...prev,
                phase: status.authenticated ? 'logged-in' : status.installed ? 'idle' : 'error',
                installed: status.installed,
                loggedIn: Boolean(status.authenticated),
                version: status.version,
                message: status.message,
              },
        );
      }
    } catch (e) {
      if (runId !== cliDetectionRunRef.current[p.id]) return;
      const raw =
        e instanceof Error
          ? e.message
          : t('apiSettings.cli.error.autoDetectionFailed', '本地 CLI 自动检测失败。');
      const timedOut = /signal timed out|timeout|timed out|aborterror/i.test(raw);
      const bridgeUnavailable = /failed to fetch|networkerror|econnrefused|net::err/i.test(raw);
      const msg = bridgeUnavailable
        ? t(
            'apiSettings.cli.error.bridgeUnavailable',
            '未能连接画布桥（{url}）。请确认主机上的 Qiansi-Canvas 服务已启动且未被防火墙拦截，然后点“重新检测”。',
            { url: BRIDGE_BASE_URL },
          )
        : timedOut
          ? t(
              'apiSettings.cli.error.detectionTimedOut',
              'CLI 登录状态检测超时，请稍后重试；这不代表本地桥未启动。',
            )
          : raw;
      const lastVerifiedAt = p.verifiedAt ?? p.lastVerifiedAt;
      const hasLastKnownConnection = Boolean(lastVerifiedAt);
      updateConnection(
        p.id,
        {
          verifiedAt: undefined,
          lastVerifiedAt: hasLastKnownConnection ? lastVerifiedAt : undefined,
        },
        false,
      );
      setCliProviderState(
        p.id,
        hasLastKnownConnection ? 'stale' : bridgeUnavailable ? 'bridge-error' : 'ready',
        { ...previousStatus, ready: false, message: msg },
      );
      recordConnectionResult(
        p.id,
        hasLastKnownConnection ? 'stale' : 'error',
        hasLastKnownConnection
          ? t('apiSettings.cli.status.historyOnlyWithMessage', '仅保留历史检测记录；{message}', {
              message: msg,
            })
          : msg,
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (runId === cliDetectionRunRef.current[p.id]) {
        delete cliDetectionAbortRef.current[p.id];
      }
    }
  };

  /** Install the official Dreamina/Jimeng CLI through the local bridge. */
  const installJimeng = async () => {
    const provider = selected;
    if (!provider || provider.protocol !== 'jimeng') return;
    invalidateProviderDetections(provider.id);
    const workflowRunId = cliDetectionRunRef.current[provider.id] ?? 0;
    const workflowIsCurrent = () =>
      panelActiveRef.current && workflowRunId === (cliDetectionRunRef.current[provider.id] ?? 0);
    const bridgeBase = BRIDGE_BASE_URL;
    setJimengAccount((prev) => ({
      ...prev,
      phase: 'installing',
      installText: '',
      message: t('apiSettings.cli.jimeng.startingInstaller', '正在启动即梦官方安装器…'),
    }));

    try {
      const start = await fetch(`${bridgeBase}/jimeng/install/start`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
      });
      const initial = await start.json();
      if (!workflowIsCurrent()) return;
      if (!start.ok)
        throw new Error(
          initial.error?.message ||
            t('apiSettings.cli.jimeng.installerStartFailed', '即梦 CLI 安装启动失败。'),
        );

      if (initial.installed) {
        setJimengAccount((prev) => ({
          ...prev,
          phase: 'idle',
          installText: initial.text || '',
          message: t('apiSettings.cli.jimeng.detected', '已检测到即梦 CLI。'),
        }));
        const detection = detectCli(provider);
        const detectionRunId = cliDetectionRunRef.current[provider.id];
        await detection;
        if (panelActiveRef.current && cliDetectionRunRef.current[provider.id] === detectionRunId) {
          flashToast(t('apiSettings.cli.jimeng.detected', '已检测到即梦 CLI。'));
        }
        return;
      }

      const deadline = Date.now() + 240_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (!workflowIsCurrent()) return;
        const statusResponse = await fetch(`${bridgeBase}/jimeng/install/status`, {
          signal: AbortSignal.timeout(8000),
        });
        const status = await statusResponse.json();
        if (!workflowIsCurrent()) return;
        if (!statusResponse.ok)
          throw new Error(
            status.error?.message ||
              t('apiSettings.cli.jimeng.installStatusFailed', '无法读取即梦 CLI 安装状态。'),
          );

        setJimengAccount((prev) => ({
          ...prev,
          phase: status.running ? 'installing' : status.installed ? 'idle' : 'error',
          installText: status.text || prev.installText,
          message: status.message || prev.message,
        }));

        if (status.installed) {
          const detection = detectCli(provider);
          const detectionRunId = cliDetectionRunRef.current[provider.id];
          await detection;
          if (
            panelActiveRef.current &&
            cliDetectionRunRef.current[provider.id] === detectionRunId
          ) {
            flashToast(t('apiSettings.cli.jimeng.installComplete', '即梦 CLI 安装完成'));
          }
          return;
        }
        if (!status.running) {
          throw new Error(
            status.message ||
              t(
                'apiSettings.cli.jimeng.installEndedNotDetected',
                '安装进程已结束，但未检测到 dreamina CLI。',
              ),
          );
        }
      }
      throw new Error(
        t(
          'apiSettings.cli.jimeng.installTimedOut',
          '安装等待超时。安装器可能仍在运行，请稍后点击“重新检测”。',
        ),
      );
    } catch (error) {
      if (!workflowIsCurrent()) return;
      const raw =
        error instanceof Error
          ? error.message
          : t('apiSettings.cli.jimeng.installFailed', '即梦 CLI 安装失败。');
      const message = /failed to fetch|networkerror|econnrefused|net::err/i.test(raw)
        ? t(
            'apiSettings.cli.jimeng.bridgeUnavailableForInstall',
            '未能连接本地桥。请先用根目录的“打开Qiansi-Canvas.bat”重新启动画布，再点击安装。',
          )
        : raw;
      setJimengAccount((prev) => ({
        ...prev,
        phase: 'error',
        message,
      }));
    }
  };

  /** Jimeng QR login */
  const startJimengLogin = async () => {
    const provider = selected;
    if (!provider || provider.protocol !== 'jimeng') return;
    invalidateProviderDetections(provider.id);
    const workflowRunId = cliDetectionRunRef.current[provider.id] ?? 0;
    const workflowIsCurrent = () =>
      panelActiveRef.current && workflowRunId === (cliDetectionRunRef.current[provider.id] ?? 0);
    setJimengAccount((prev) => ({
      ...prev,
      phase: 'waiting',
      running: true,
      loggedIn: false,
      message: t('apiSettings.cli.jimeng.startingQrLogin', '正在启动扫码登录…'),
      text: '',
      qrUrl: '',
      verificationUri: '',
      userCode: '',
      expiresAt: '',
    }));
    try {
      const bridgeBase = BRIDGE_BASE_URL;
      const res = await fetch(`${bridgeBase}/jimeng/login/start`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (!workflowIsCurrent()) return;
      if (!res.ok)
        throw new Error(
          data.error?.message ||
            t('apiSettings.cli.jimeng.qrLoginStartFailed', '扫码登录启动失败。'),
        );
      setJimengAccount((prev) => ({ ...prev, ...data, phase: 'waiting' }));

      const poll = window.setInterval(async () => {
        if (!workflowIsCurrent()) return;
        try {
          const r = await fetch(`${bridgeBase}/jimeng/login/status`);
          const s = await r.json();
          if (!workflowIsCurrent()) return;
          if (!r.ok)
            throw new Error(
              s.error?.message ||
                t('apiSettings.cli.jimeng.loginStatusFailed', '无法读取即梦登录状态。'),
            );
          if (s.loggedIn) {
            const activePoll = jimengLoginPollRef.current;
            if (activePoll?.poll === poll) {
              window.clearInterval(activePoll.poll);
              window.clearTimeout(activePoll.timeout);
              jimengLoginPollRef.current = null;
            }
            const checkedAt = Date.now();
            const loggedInStatus: CliStatus = {
              ...restoredCliStatus(
                provider,
                t(
                  'apiSettings.cli.status.restoredHistoryReviewing',
                  '已恢复历史检测记录，正在后台复核。',
                ),
              ),
              installed: true,
              runnable: true,
              authenticated: true,
              ready: true,
              state: 'ready',
              reasonCode: '',
              imageGeneration: true,
              imageEditing: true,
              videoGeneration: true,
              message: t('apiSettings.cli.jimeng.loggedIn', '即梦 CLI 已登录。'),
            };
            setJimengAccount((prev) => ({
              ...prev,
              ...s,
              phase: 'logged-in',
              running: false,
              loggedIn: true,
              credit: s.credit ? JSON.stringify(s.credit, null, 2) : prev.credit,
              message: t('apiSettings.cli.jimeng.qrLoginSucceeded', '扫码成功，已登录'),
            }));
            // The login-status endpoint has already executed `user_credit` and
            // is the authoritative result. Mark this provider connected now;
            // calling the aggregate `/health` endpoint again used to race its
            // shorter timeout and overwrite this success with a false error.
            setCliProviderState(provider.id, 'ready', loggedInStatus);
            updateConnection(
              provider.id,
              {
                verifiedAt: checkedAt,
                lastVerifiedAt: checkedAt,
                cliStatus: { ...loggedInStatus, checkedAt },
                models: {
                  chat: [],
                  image: [...JIMENG_IMAGE_MODELS],
                  video: [...JIMENG_VIDEO_MODELS],
                },
                modelCapabilities: Object.fromEntries(
                  [...JIMENG_IMAGE_MODELS, ...JIMENG_VIDEO_MODELS].map((model) => [
                    model,
                    { displayName: JIMENG_MODEL_DISPLAY_NAMES[model] ?? model },
                  ]),
                ),
              },
              false,
            );
            recordConnectionResult(
              provider.id,
              'ok',
              t('apiSettings.cli.jimeng.loggedIn', '即梦 CLI 已登录。'),
            );
            flashToast(t('apiSettings.cli.jimeng.loginSucceeded', '即梦登录成功'));
          } else if (s.running) {
            setJimengAccount((prev) => ({
              ...prev,
              ...s,
              phase: 'waiting',
              running: true,
              loggedIn: false,
            }));
          } else if (!s.running) {
            const activePoll = jimengLoginPollRef.current;
            if (activePoll?.poll === poll) {
              window.clearInterval(activePoll.poll);
              window.clearTimeout(activePoll.timeout);
              jimengLoginPollRef.current = null;
            }
            setJimengAccount((prev) => ({
              ...prev,
              ...s,
              phase: 'error',
              running: false,
              message:
                s.message ||
                t('apiSettings.cli.jimeng.loginIncomplete', '登录未完成，请重新打开扫码登录页面。'),
            }));
          }
        } catch {
          /* keep polling */
        }
      }, 3000);

      const timeout = window.setTimeout(() => {
        if (!workflowIsCurrent()) return;
        window.clearInterval(poll);
        if (jimengLoginPollRef.current?.poll === poll) {
          jimengLoginPollRef.current = null;
        }
        setJimengAccount((prev) =>
          prev.running
            ? {
                ...prev,
                phase: 'error',
                running: false,
                message: t('apiSettings.cli.jimeng.qrTimedOut', '二维码已超时，请重新扫码。'),
              }
            : prev,
        );
      }, 300_000);
      jimengLoginPollRef.current = { providerId: provider.id, poll, timeout };
    } catch (e) {
      if (!workflowIsCurrent()) return;
      setJimengAccount((prev) => ({
        ...prev,
        phase: 'error',
        running: false,
        message:
          e instanceof Error
            ? e.message
            : t('apiSettings.cli.jimeng.qrLoginStartFailed', '扫码登录启动失败。'),
      }));
    }
  };

  /** Query jimeng credits */
  const queryJimengCredit = async () => {
    const provider = selected;
    if (!provider || provider.protocol !== 'jimeng') return;
    const workflowRunId = cliDetectionRunRef.current[provider.id] ?? 0;
    const workflowIsCurrent = () =>
      panelActiveRef.current && workflowRunId === (cliDetectionRunRef.current[provider.id] ?? 0);
    setJimengAccount((prev) => ({
      ...prev,
      phase: 'checking',
      message: t('apiSettings.cli.jimeng.queryingCredits', '正在查询积分…'),
    }));
    try {
      const bridgeBase = BRIDGE_BASE_URL;
      const res = await fetch(`${bridgeBase}/jimeng/credits`);
      const data = await res.json();
      if (!workflowIsCurrent()) return;
      if (!res.ok)
        throw new Error(
          data.error?.message || t('apiSettings.cli.jimeng.creditQueryFailed', '积分查询失败。'),
        );
      setJimengAccount((prev) => ({
        ...prev,
        phase: 'logged-in',
        credit: JSON.stringify(data.raw || data, null, 2),
        message: t('apiSettings.cli.jimeng.creditQuerySucceeded', '积分查询成功。'),
      }));
    } catch (e) {
      if (!workflowIsCurrent()) return;
      setJimengAccount((prev) => ({
        ...prev,
        phase: 'error',
        message:
          e instanceof Error
            ? e.message
            : t('apiSettings.cli.jimeng.creditQueryFailed', '积分查询失败。'),
      }));
    }
  };

  /** Jimeng logout */
  const logoutJimeng = async () => {
    const provider = selected;
    if (!provider || provider.protocol !== 'jimeng') return;
    invalidateProviderDetections(provider.id);
    const workflowRunId = cliDetectionRunRef.current[provider.id] ?? 0;
    const workflowIsCurrent = () =>
      panelActiveRef.current && workflowRunId === (cliDetectionRunRef.current[provider.id] ?? 0);
    try {
      const bridgeBase = BRIDGE_BASE_URL;
      await fetch(`${bridgeBase}/jimeng/logout`, { method: 'POST' });
    } catch {
      /* best-effort */
    }
    if (!workflowIsCurrent()) return;
    setJimengAccount({ phase: 'idle', running: false, loggedIn: false });
    const status: CliStatus = {
      ...restoredCliStatus(
        provider,
        t('apiSettings.cli.status.restoredHistoryReviewing', '已恢复历史检测记录，正在后台复核。'),
      ),
      installed: true,
      authenticated: false,
      ready: false,
      state: 'unauthenticated',
      reasonCode: 'logged_out',
      message: t('apiSettings.cli.jimeng.loggedOut', '即梦 CLI 已退出登录。'),
    };
    setCliProviderState(provider.id, 'ready', status);
    updateConnection(
      provider.id,
      {
        verifiedAt: undefined,
        lastVerifiedAt: undefined,
        cliStatus: { ...status, checkedAt: Date.now() },
      },
      false,
    );
    recordConnectionResult(provider.id, 'error', status.message);
    flashToast(t('apiSettings.cli.jimeng.signOutSucceeded', '已退出登录'));
  };

  const addModel = (kind: ProviderModelKind, value: string) => {
    if (!selected) return;
    const model = value.trim();
    if (!model) return;
    updateSelectedPreference({
      models: {
        ...selected.models,
        [kind]: Array.from(new Set([...(selected.models[kind] ?? []), model])),
      },
    });
  };

  const removeModel = (kind: ProviderModelKind, model: string) => {
    if (!selected) return;
    updateSelectedPreference({
      models: {
        ...selected.models,
        [kind]: (selected.models[kind] ?? []).filter((m) => m !== model),
      },
    });
  };

  const setDefaultModel = (kind: ProviderModelKind, model: string) => {
    if (!selected) return;
    const list = selected.models[kind] ?? [];
    if (list[0] === model) return;
    updateSelectedPreference({
      models: { ...selected.models, [kind]: [model, ...list.filter((m) => m !== model)] },
    });
  };

  const toggleEnabled = (id: string) => {
    invalidateProviderDetections(id);
    pendingLocalProviderIdsRef.current.add(id);
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const addCustomProvider = () => {
    if (activeCategory === 'cli') return;
    if (!newName.trim() || !newBaseUrl.trim()) {
      flashToast(t('apiSettings.notice.providerNameAndAddressRequired', '请输入平台名称和地址'));
      return;
    }
    const id = `custom-${Date.now()}`;
    const isImage = activeCategory === 'image';
    const provider: ProviderConnection = {
      id,
      name: newName.trim(),
      mark: newName.trim().slice(0, 3).toUpperCase(),
      protocol: 'openai',
      category: activeCategory,
      baseUrl: newBaseUrl.trim().replace(/\/+$/, ''),
      apiKey: '',
      enabled: true,
      custom: true,
      region: '通用',
      models: { chat: [], image: [], video: [], audio: [] },
    };
    pendingLocalProviderIdsRef.current.add(id);
    setConnections((prev) => [...prev, provider]);
    setSelectedId(id);
    setNewName('');
    setNewBaseUrl('');
    setAdding(false);
    flashToast(
      isImage
        ? t('apiSettings.notice.imageProviderAdded', '已新增图像平台')
        : t('apiSettings.notice.providerAdded', '已新增平台'),
    );
  };

  const addRemoteComfyUi = () => {
    const provider = createRemoteComfyUiConnection(connections);
    pendingLocalProviderIdsRef.current.add(provider.id);
    setConnections((previous) => [...previous, provider]);
    setSelectedId(provider.id);
    flashToast(
      t('apiSettings.comfy.notice.remoteConnectionAdded', '已新增远程 ComfyUI：{name}', {
        name: provider.name,
      }),
    );
  };

  const deleteProvider = (id: string) => {
    const target = connections.find((c) => c.id === id);
    invalidateProviderDetections(id);
    pendingLocalProviderIdsRef.current.add(id);
    setCliStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setConnResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (!target?.custom) {
      setConnections((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                apiKey: '',
                ...(id === 'comfyui-remote' ? { baseUrl: '', authType: 'bearer' as const } : {}),
                models: { chat: [], image: [], video: [], audio: [], '3d': [] },
                enabled: true,
                verifiedAt: undefined,
                lastVerifiedAt: undefined,
                cliStatus: undefined,
              }
            : c,
        ),
      );
      sealKey(id, '').catch(() =>
        flashToast(t('apiSettings.error.keyDeleteFailed', '密钥删除失败，请重试。')),
      );
      flashToast(t('apiSettings.notice.providerReset', '已重置该平台'));
      return;
    }
    sealKey(id, '').catch(() =>
      flashToast(t('apiSettings.error.keyDeleteFailed', '密钥删除失败，请重试。')),
    );
    setConnections((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(connections.find((c) => c.id !== id)?.id ?? '');
    flashToast(t('apiSettings.notice.providerDeleted', '已删除平台'));
  };

  const guide = selected ? providerSetupGuide(selected) : null;
  const isCli = selected ? isCliProtocol(selected.protocol) : false;

  /** Derive display status for a provider's power icon */
  const providerStatus = (c: ProviderConnection): 'ok' | 'checking' | 'stale' | 'warn' | 'off' => {
    if (!c.enabled) return 'off';

    // CLI providers are driven by local bridge detection, not by an API key.
    if (isCliProtocol(c.protocol)) {
      const state = cliStates[c.id];
      if (state?.phase === 'checking') return 'checking';
      if (state?.phase === 'stale') return isProviderConnectionUsable(c) ? 'ok' : 'stale';
      if (state?.phase === 'ready') {
        if (isProviderConnectionUsable(c) && cliStatusIsReady(state.status)) return 'ok';
        return hasHistoricalCliConnection(c) ? 'stale' : 'warn';
      }
      if (isProviderConnectionUsable(c)) return 'ok';
      return 'warn';
    }

    const r = connResults[c.id];
    if (r?.status === 'testing') return 'checking';
    if (r?.status === 'error') return 'warn';
    if (r?.status === 'ok' && isProviderConnectionUsable(c)) return 'ok';
    if (c.modelDiscovery === 'fixed' && c.configValidatedAt) return 'stale';
    if (isProviderConnectionUsable(c)) return 'ok';
    if (c.apiKey) return 'stale';
    return 'warn';
  };

  const providerRegionLabel = (region?: string) => {
    if (region === '国内') return t('apiSettings.region.mainlandChina', '国内');
    if (region === '海外') return t('apiSettings.region.international', '海外');
    if (!region || region === '通用') return t('apiSettings.region.general', '通用');
    return region;
  };

  return (
    <>
      {/* Centered backdrop + modal */}
      <div
        className={
          embedded
            ? 'flex min-h-0 flex-1'
            : 'fixed inset-0 z-[59] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'
        }
        onClick={embedded ? undefined : onClose}
      >
        <div
          className={
            embedded
              ? 'relative flex h-full min-h-0 w-full flex-col overflow-hidden'
              : 'relative flex h-full w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#1a1a1c] shadow-2xl'
          }
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {!embedded && (
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-400" />
                <span className="text-[15px] font-medium text-white/90">
                  {t('apiSettings.title', 'AI 大模型设置')}
                </span>
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/40">
                  {t('apiSettings.localEncryption', '密钥本地加密保存')}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                aria-label={t('common.close', '关闭')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Category tabs */}
          <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.08] px-3">
            {CATEGORY_ORDER.map((category) => {
              const count = connections.filter((c) => c.category === category).length;
              const active = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => switchCategory(category)}
                  className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    active ? 'text-white' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {t(`apiSettings.category.${category}`, CATEGORY_LABELS[category])}
                  <span className={`text-[11px] ${active ? 'text-white/60' : 'text-white/25'}`}>
                    {count}
                  </span>
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {/* Platform directory */}
            <aside className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/[0.08] bg-black/20 p-2">
              {categoryProviders.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    selectedId === c.id ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      if (isCliProtocol(c.protocol)) detectCli(c);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ProviderBrandIcon
                      providerId={c.id}
                      providerName={c.name}
                      mark={c.mark}
                      accent={c.accent}
                      className="h-6 w-6"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-white/85">
                        {c.name}
                      </span>
                      <span className="block truncate text-[11px] text-white/35">
                        {c.category === 'image'
                          ? providerRegionLabel(c.region)
                          : c.category === 'cli'
                            ? c.canGenerate === false
                              ? `${providerRegionLabel(c.region)} · ${
                                  providerStatus(c) === 'ok'
                                    ? t('apiSettings.provider.accountConnected', '账户工具已连接')
                                    : t(
                                        'apiSettings.provider.accountDisconnected',
                                        '账户工具未连接',
                                      )
                                }`
                              : providerStatus(c) === 'ok'
                                ? `${providerRegionLabel(c.region)} · ${t(
                                    'apiSettings.provider.availableModels',
                                    '{count} 可用模型',
                                    {
                                      count:
                                        c.models.chat.length +
                                        c.models.image.length +
                                        c.models.video.length +
                                        (c.models.audio?.length ?? 0),
                                    },
                                  )}`
                                : `${providerRegionLabel(c.region)} · ${t(
                                    'apiSettings.provider.presetsUnavailable',
                                    '{count} 个预设 · 不可用',
                                    {
                                      count:
                                        c.models.chat.length +
                                        c.models.image.length +
                                        c.models.video.length +
                                        (c.models.audio?.length ?? 0),
                                    },
                                  )}`
                            : (() => {
                                const counts = providerModelCounts(c);
                                return `${providerRegionLabel(c.region)} · ${t(
                                  'apiSettings.provider.availableCount',
                                  '{count} 可用',
                                  { count: counts.available },
                                )}${
                                  counts.deferred
                                    ? ` · ${t(
                                        'apiSettings.provider.pendingAdaptation',
                                        '{count} 待适配',
                                        { count: counts.deferred },
                                      )}`
                                    : ''
                                }${
                                  counts.unverified
                                    ? ` · ${t(
                                        'apiSettings.provider.pendingVerification',
                                        '{count} 待验证',
                                        { count: counts.unverified },
                                      )}`
                                    : ''
                                }`;
                              })()}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleEnabled(c.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                      providerStatus(c) === 'ok'
                        ? 'text-emerald-400'
                        : providerStatus(c) === 'checking'
                          ? 'text-sky-400 animate-pulse'
                          : providerStatus(c) === 'stale'
                            ? 'text-amber-400'
                            : providerStatus(c) === 'warn'
                              ? 'text-red-400'
                              : 'text-white/25'
                    }`}
                    aria-label={
                      providerStatus(c) === 'ok'
                        ? t('apiSettings.status.connected', '已连接')
                        : providerStatus(c) === 'checking'
                          ? t('apiSettings.status.checking', '正在检测')
                          : providerStatus(c) === 'stale'
                            ? c.modelDiscovery === 'fixed'
                              ? t(
                                  'apiSettings.status.validPendingVerification',
                                  '配置格式有效，密钥待首次调用验证',
                                )
                              : t('apiSettings.status.historical', '历史记录，等待复核')
                            : providerStatus(c) === 'warn'
                              ? t('apiSettings.status.connectionProblem', '未正常连接')
                              : t('apiSettings.status.disabled', '已停用')
                    }
                    title={
                      providerStatus(c) === 'ok'
                        ? t('apiSettings.providerTitle.connected', '已连接')
                        : providerStatus(c) === 'checking'
                          ? t(
                              'apiSettings.providerTitle.checkingCapabilities',
                              '正在验证真实登录与可用能力',
                            )
                          : providerStatus(c) === 'stale'
                            ? c.modelDiscovery === 'fixed'
                              ? t(
                                  'apiSettings.providerTitle.fixedPendingKey',
                                  '配置格式有效；首次生成时验证 API Key',
                                )
                              : t(
                                  'apiSettings.providerTitle.historyCannotGenerate',
                                  '仅有历史记录，不能用于生成',
                                )
                            : providerStatus(c) === 'warn'
                              ? isCliProtocol(c.protocol)
                                ? t(
                                    'apiSettings.providerTitle.cliUnavailable',
                                    '未安装、未登录或检测失败',
                                  )
                                : c.apiKey
                                  ? t(
                                      'apiSettings.providerTitle.connectionTestFailed',
                                      '连接测试失败',
                                    )
                                  : t('apiSettings.providerTitle.missingApiKey', '缺少 API Key')
                              : t('apiSettings.providerTitle.disabled', '已停用')
                    }
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {(activeCategory === 'text' || activeCategory === 'image') &&
                (adding ? (
                  <div className="mt-1 space-y-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t('apiSettings.providerNamePlaceholder', '平台名称')}
                      className="w-full rounded-md border border-white/[0.08] bg-white/[0.05] px-2 py-1 text-[13px] text-white outline-none placeholder:text-white/30"
                    />
                    <input
                      value={newBaseUrl}
                      onChange={(e) => setNewBaseUrl(e.target.value)}
                      placeholder={
                        activeCategory === 'image'
                          ? t('apiSettings.placeholder.imageApiUrl', 'https://图像API地址')
                          : 'https://...'
                      }
                      className="w-full rounded-md border border-white/[0.08] bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-white outline-none placeholder:text-white/30"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={addCustomProvider}
                        className="flex-1 rounded-md bg-amber-500/20 py-1 text-[12px] font-medium text-amber-300 hover:bg-amber-500/30"
                      >
                        {t('common.add', '添加')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setNewName('');
                          setNewBaseUrl('');
                        }}
                        className="rounded-md bg-white/[0.06] px-2 py-1 text-[12px] text-white/50 hover:bg-white/10"
                      >
                        {t('common.cancel', '取消')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-white/[0.12] py-1.5 text-[12px] text-white/40 hover:border-white/[0.2] hover:text-white/70"
                  >
                    <Plus className="h-3 w-3" />
                    {t('apiSettings.addProvider', '新增平台')}
                  </button>
                ))}

              {activeCategory === 'cli' && (
                <button
                  type="button"
                  onClick={addRemoteComfyUi}
                  className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-white/[0.12] py-1.5 text-[12px] text-white/40 hover:border-white/[0.2] hover:text-white/70"
                >
                  <Plus className="h-3 w-3" />
                  {t('apiSettings.comfy.addRemoteConnection', '新增远程 ComfyUI')}
                </button>
              )}
            </aside>

            {/* Detail */}
            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              {!hydrated ? (
                <p className="text-[15px] text-white/30">
                  {t('apiSettings.loading', '正在解密并加载配置…')}
                </p>
              ) : !selected ? (
                <p className="text-[15px] text-white/30">
                  {t('apiSettings.selectProvider', '请选择左侧平台进行配置。')}
                </p>
              ) : selected.category === 'image' ? (
                <ImageDetail
                  provider={selected}
                  connState={connState}
                  connMessage={connMessage}
                  pullState={pullState}
                  showKey={showKey[selected.id] ?? false}
                  onToggleKey={() => setShowKey((p) => ({ ...p, [selected.id]: !p[selected.id] }))}
                  onBlurKey={() => setShowKey((p) => ({ ...p, [selected.id]: false }))}
                  onApiKey={(value) => updateSelected({ apiKey: value })}
                  onBaseUrl={(value) => updateSelected({ baseUrl: value })}
                  onEndpoint={(value) => updateSelected({ endpoint: value })}
                  onAuthType={(value) => updateSelected({ authType: value })}
                  onModel={(value) => {
                    const rest = selected.models.image.slice(1);
                    const next = value.trim() ? [value.trim(), ...rest] : rest;
                    updateSelectedPreference({ models: { ...selected.models, image: next } });
                  }}
                  onAddModel={(m) => addModel('image', m)}
                  onRemoveModel={(m) => removeModel('image', m)}
                  onTest={testConnection}
                  onPull={pullModels}
                  onDelete={() => deleteProvider(selected.id)}
                  onGuide={() => setShowGuide(true)}
                />
              ) : selected.protocol === 'comfyui' ? (
                <ComfyUiDetail
                  provider={selected}
                  cliPhase={cliPhase}
                  cliStatus={cliStatus}
                  connMessage={connMessage}
                  onDetect={() => detectCli()}
                  showKey={showKey[selected.id] ?? false}
                  onToggleKey={() =>
                    setShowKey((previous) => ({
                      ...previous,
                      [selected.id]: !previous[selected.id],
                    }))
                  }
                  onBlurKey={() =>
                    setShowKey((previous) => ({ ...previous, [selected.id]: false }))
                  }
                  onBaseUrl={(value) => updateSelected({ baseUrl: value })}
                  onApiKey={(value) => updateSelected({ apiKey: value })}
                  onAuthType={(value) => updateSelected({ authType: value })}
                  onDefaultModel={(kind, model) => setDefaultModel(kind, model)}
                  onDelete={() => deleteProvider(selected.id)}
                  onGuide={() => setShowGuide(true)}
                />
              ) : isCli ? (
                <CliDetail
                  provider={selected}
                  cliPhase={cliPhase}
                  cliStatus={cliStatus}
                  jimengAccount={jimengAccount}
                  connMessage={connMessage}
                  onDetect={() => detectCli()}
                  onJimengInstall={installJimeng}
                  onJimengLogin={startJimengLogin}
                  onJimengCredit={queryJimengCredit}
                  onJimengLogout={logoutJimeng}
                  onBaseUrl={(value) => updateSelected({ baseUrl: value })}
                  onCliConfig={(key, value) =>
                    updateSelected({
                      cliConfig: { ...(selected.cliConfig ?? {}), [key]: value },
                    })
                  }
                  onModel={(kind, model) => setDefaultModel(kind, model)}
                  onAddModel={(kind, m) => addModel(kind, m)}
                  onRemoveModel={(kind, m) => removeModel(kind, m)}
                  onReasoningEffort={(model, effort) =>
                    updateSelectedPreference({
                      modelReasoningEfforts: {
                        ...(selected.modelReasoningEfforts ?? {}),
                        [model]: effort as ProviderReasoningEffort,
                      },
                    })
                  }
                  onDelete={() => deleteProvider(selected.id)}
                  onGuide={() => setShowGuide(true)}
                />
              ) : selected.canGenerate === false ? (
                <UnavailableProviderDetail
                  provider={selected}
                  onDelete={() => deleteProvider(selected.id)}
                  onGuide={() => setShowGuide(true)}
                />
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-[15px] font-semibold text-white/90">{selected.name}</h2>
                      <p className="text-[12px] text-white/40">
                        {t('apiSettings.providerId', '平台 ID')}: {selected.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteProvider(selected.id)}
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {selected.custom ? t('common.delete', '删除') : t('common.reset', '重置')}
                    </button>
                  </div>

                  {isCli && (
                    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5 text-[12px] leading-relaxed text-sky-300/80">
                      {t(
                        'apiSettings.cli.localBridgeDescription',
                        '本平台由本地桥（项目根目录 local-bridge.mjs）驱动，需先双击根目录的“打开Qiansi-Canvas.bat”并保持窗口打开。桥运行后本页会自动检测已安装的命令行工具、版本与登录状态；也可点“重新检测”。请勿在此填写 API Key——CLI 走本机登录态。',
                      )}
                    </div>
                  )}

                  {/* API Key + test */}
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-white/50">API Key</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`flex items-center gap-1 text-[11px] ${
                            connState === 'ok'
                              ? 'text-emerald-400'
                              : connState === 'stale'
                                ? 'text-amber-300'
                                : connState === 'error'
                                  ? 'text-red-400'
                                  : 'text-white/35'
                          }`}
                        >
                          {connState === 'testing' && (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          )}
                          {connState === 'ok' && <CheckCircle2 className="h-3 w-3" />}
                          {connState === 'stale' && <AlertCircle className="h-3 w-3" />}
                          {connState === 'error' && <AlertCircle className="h-3 w-3" />}
                          {connState === 'idle'
                            ? t('apiSettings.status.notChecked', '未检测')
                            : connState === 'testing'
                              ? t('apiSettings.status.checkingShort', '检测中')
                              : connState === 'ok'
                                ? t('apiSettings.status.connected', '已连接')
                                : connState === 'stale'
                                  ? t('apiSettings.status.historicalPending', '历史记录 · 待复核')
                                  : t('apiSettings.status.failed', '失败')}
                        </span>
                        <button
                          type="button"
                          onClick={testConnection}
                          disabled={connState === 'testing' || isCli}
                          className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-[12px] text-white/70 hover:bg-white/15 disabled:opacity-40"
                        >
                          <Plug className="h-3 w-3" />
                          {t('apiSettings.testConnection', '检测连接')}
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type={showKey[selected.id] ? 'text' : 'password'}
                        value={selected.apiKey}
                        onChange={(e) => updateSelected({ apiKey: e.target.value })}
                        onBlur={() => setShowKey((p) => ({ ...p, [selected.id]: false }))}
                        placeholder={
                          isCli
                            ? t('apiSettings.optionalLocalToken', '本机可留空')
                            : t('apiSettings.apiKeyPlaceholder', '粘贴真实 API Key')
                        }
                        autoComplete="off"
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 pr-9 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKey((p) => ({ ...p, [selected.id]: !p[selected.id] }))
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                        aria-label={t('apiSettings.toggleKeyVisibility', '显示/隐藏密钥')}
                      >
                        {showKey[selected.id] ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400/70">
                      <Lock className="h-3 w-3" />
                      {t(
                        'apiSettings.encryptionNotice',
                        '浏览器本地加密，避免项目配置明文；同源脚本/浏览器配置读取者仍可访问',
                      )}
                    </p>
                    {showKey[selected.id] && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-300/80">
                        <ShieldAlert className="h-3 w-3" />
                        {t(
                          'apiSettings.keyVisibleWarning',
                          '密钥已显示，注意防止截屏或他人窥视泄露。',
                        )}
                      </p>
                    )}
                    {connMessage && (
                      <p
                        className={`mt-2 text-[12px] ${
                          connState === 'error'
                            ? 'text-red-400/80'
                            : connState === 'ok'
                              ? 'text-emerald-400/80'
                              : connState === 'stale'
                                ? 'text-amber-300/80'
                                : 'text-white/40'
                        }`}
                      >
                        {connMessage}
                      </p>
                    )}
                  </div>

                  {/* Endpoint */}
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-white/50">
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={selected.baseUrl}
                      onChange={(e) => updateSelected({ baseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
                    />
                    <div className="mt-1.5 flex items-center gap-2 text-[12px] text-white/35">
                      <span>{t('apiSettings.protocol', '接入协议')}</span>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/60">
                        {selected.protocol}
                      </span>
                      <span
                        className={`flex items-center gap-1 ${selected.enabled ? 'text-emerald-400/80' : 'text-white/30'}`}
                      >
                        <Power className="h-3 w-3" />
                        {selected.enabled
                          ? t('apiSettings.status.enabled', '已启用')
                          : t('apiSettings.status.disabled', '已停用')}
                      </span>
                    </div>
                  </div>

                  {/* Models toolbar */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-medium text-white/50">
                        {t('apiSettings.modelList', '模型列表')}
                      </p>
                      <p className="text-[11px] text-white/30">
                        {t('apiSettings.modelListDescription', '从上游自动拉取并按类型分类')}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={pullModels}
                        disabled={pullState === 'pulling' || isCli}
                        className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-[12px] text-white/70 hover:bg-white/15 disabled:opacity-40"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${pullState === 'pulling' ? 'animate-spin' : ''}`}
                        />{' '}
                        {t('apiSettings.pullModels', '拉取模型')}
                      </button>
                      <InlineAddModel
                        onAdd={(v) => addModel('chat', v)}
                        placeholder={t('apiSettings.chatModelPlaceholder', '输入对话模型…')}
                      />
                    </div>
                  </div>

                  {/* Model categories */}
                  {(['chat', 'image', 'video', 'audio'] as ProviderModelKind[]).map((kind) => {
                    const meta = {
                      chat: {
                        zh: t('apiSettings.modelKind.chat', '对话 / 剧本模型'),
                        code: 'CHAT',
                      },
                      image: {
                        zh: t('apiSettings.modelKind.image', '图片生成模型'),
                        code: 'IMAGE',
                      },
                      video: {
                        zh: t('apiSettings.modelKind.video', '视频生成模型'),
                        code: 'VIDEO',
                      },
                      audio: {
                        zh: t('apiSettings.modelKind.audio', '音乐 / 音频生成模型'),
                        code: 'AUDIO',
                      },
                      '3d': {
                        zh: t('apiSettings.modelKind.3d', '3D 生成模型'),
                        code: '3D',
                      },
                    }[kind];
                    const models = selected.models[kind] ?? [];
                    const unsupported = selected.disabledModelKinds?.includes(kind) === true;
                    return (
                      <div
                        key={kind}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                            {meta.code} · {meta.zh}
                          </span>
                          {!unsupported && (
                            <InlineAddModel
                              onAdd={(v) => addModel(kind, v)}
                              placeholder={t('apiSettings.modelKindPlaceholder', '输入{kind}…', {
                                kind: meta.zh,
                              })}
                            />
                          )}
                        </div>
                        {unsupported ? (
                          <p className="py-1 text-[12px] leading-relaxed text-amber-200/55">
                            {t(
                              'apiSettings.modelKindUnavailableDescription',
                              '官方接口需要专用请求或异步轮询适配；当前仅保留配置，不会把这些模型放入画布生成菜单。',
                            )}
                          </p>
                        ) : models.length ? (
                          <div className="space-y-1">
                            {models.map((model) => (
                              <div
                                key={model}
                                className="group flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => setDefaultModel(kind, model)}
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                                    models[0] === model
                                      ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                                      : 'border-white/20 text-transparent hover:border-white/40'
                                  }`}
                                  title={
                                    models[0] === model
                                      ? t('apiSettings.defaultModel', '默认模型')
                                      : t('apiSettings.setDefaultModel', '设为默认')
                                  }
                                >
                                  ★
                                </button>
                                <ProviderBrandIcon
                                  providerId={selected.id}
                                  providerName={selected.name}
                                  mark={selected.mark}
                                  accent={selected.accent}
                                  className="h-5 w-5"
                                />
                                <code className="min-w-0 flex-1 truncate text-[12px] text-white/70">
                                  {model}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => removeModel(kind, model)}
                                  className="text-white/25 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                                  aria-label={t('apiSettings.deleteModel', '删除 {model}', {
                                    model,
                                  })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="py-1 text-[12px] text-white/25">
                            {t('apiSettings.noModels', '暂无模型，可手动添加或点击「拉取模型」。')}
                          </p>
                        )}
                        {kind === 'audio' && !unsupported && (
                          <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed text-amber-200/50">
                            {t(
                              'apiSettings.audioModelAdapterNotice',
                              '音频模型会被识别并保存；只有实现对应厂商的音频请求适配器后，才会进入音频节点的生成菜单。',
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Setup guide */}
                  <button
                    type="button"
                    onClick={() => setShowGuide(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-2 text-[13px] text-white/55 hover:bg-white/[0.05]"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {t('apiSettings.setupHelp', '设置帮助')}
                  </button>

                  <p className="text-center text-[11px] text-white/25">
                    {t(
                      'apiSettings.autoSaveNotice',
                      '配置自动保存到当前浏览器；密钥经过本地加密保存，不会写入项目配置。',
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {vaultWarn && (
            <div className="flex items-center gap-2 border-t border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[12px] text-amber-300/80">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              {t(
                'apiSettings.webCryptoWarning',
                '当前运行环境不支持 Web Crypto，密钥将以明文暂存于本机；请在 https 或 localhost 下使用以获得加密保护。',
              )}
            </div>
          )}

          {/* Setup guide modal */}
          {showGuide && guide && (
            <div
              className="absolute inset-0 z-[61] flex items-center justify-center bg-black/60 p-4"
              onClick={() => setShowGuide(false)}
            >
              <div
                className="max-h-[80%] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#1E1E21] p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold"
                      style={{
                        backgroundColor: selected?.accent
                          ? `${selected.accent}22`
                          : 'rgba(255,255,255,0.06)',
                        color: selected?.accent || 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {selected?.mark}
                    </span>
                    <div>
                      <span className="block text-[11px] uppercase tracking-wider text-amber-400/80">
                        {guide.badge}
                      </span>
                      <span className="block text-[15px] font-medium text-white/90">
                        {selected?.name} · {t('apiSettings.setupHelp', '设置帮助')}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mb-3 text-[13px] leading-relaxed text-white/60">{guide.summary}</p>

                {guide.warning && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[12px] leading-relaxed text-amber-300/80">
                    {guide.warning}
                  </div>
                )}

                <p className="mb-1 text-[12px] font-semibold text-white/50">
                  {t('apiSettings.requirements', '准备条件')}
                </p>
                <ul className="mb-3 list-disc space-y-1 pl-4 text-[12px] text-white/55">
                  {guide.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>

                <p className="mb-1 text-[12px] font-semibold text-white/50">
                  {t('apiSettings.steps', '操作步骤')}
                </p>
                <ol className="mb-3 list-decimal space-y-1 pl-4 text-[12px] text-white/55">
                  {guide.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>

                {guide.commands.length > 0 && (
                  <div className="space-y-1.5">
                    {guide.commands.map((cmd, i) => (
                      <div key={i} className="rounded-lg bg-black/40 p-2">
                        <span className="block text-[11px] text-white/40">{cmd.label}</span>
                        <code className="block truncate font-mono text-[12px] text-emerald-300/90">
                          {cmd.value}
                        </code>
                      </div>
                    ))}
                  </div>
                )}

                {guide.docsUrl && (
                  <a
                    href={guide.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-[12px] text-sky-400 hover:underline"
                  >
                    {t('apiSettings.officialDocs', '查看官方文档')} ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div className="absolute bottom-6 left-1/2 z-[62] -translate-x-1/2 rounded-lg bg-white/90 px-3 py-1.5 text-[13px] font-medium text-black shadow-lg">
              {toast}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type ImageDetailProps = {
  provider: ProviderConnection;
  connState: ConnState;
  connMessage: string;
  pullState: PullState;
  showKey: boolean;
  onToggleKey: () => void;
  onBlurKey: () => void;
  onApiKey: (value: string) => void;
  onBaseUrl: (value: string) => void;
  onEndpoint: (value: string) => void;
  onAuthType: (value: ProviderConnection['authType']) => void;
  onModel: (value: string) => void;
  onAddModel: (model: string) => void;
  onRemoveModel: (model: string) => void;
  onTest: () => void;
  onPull: () => void;
  onDelete: () => void;
  onGuide: () => void;
};

/** Inline "add model" input — replaces blocking window.prompt with in-panel UX. */
function InlineAddModel({
  onAdd,
  placeholder,
}: {
  onAdd: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-white/40 hover:text-white/70"
        aria-label={t('apiSettings.addModel', '添加模型')}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    );
  }
  const commit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue('');
    setOpen(false);
  };
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') {
            setValue('');
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-36 rounded-md border border-white/[0.1] bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-white outline-none placeholder:text-white/25 focus:border-white/[0.2]"
      />
      <button
        type="button"
        onClick={commit}
        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-white/70 hover:bg-white/15"
        aria-label={t('apiSettings.confirmAdd', '确认添加')}
      >
        <Plus className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => {
          setValue('');
          setOpen(false);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-md text-white/30 hover:text-white/60"
        aria-label={t('common.cancel', '取消')}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function UnavailableProviderDetail({
  provider,
  onDelete,
  onGuide,
}: {
  provider: ProviderConnection;
  onDelete: () => void;
  onGuide: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-white/90">{provider.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {provider.region && (
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/55">
                {provider.region}
              </span>
            )}
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300/85">
              {provider.status || t('apiSettings.status.unavailable', '当前不可生成')}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />{' '}
          {provider.custom ? t('common.delete', '删除') : t('common.reset', '重置')}
        </button>
      </div>
      {provider.summary && (
        <p className="text-[13px] leading-relaxed text-white/60">{provider.summary}</p>
      )}
      <section className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <h3 className="text-[13px] font-semibold text-amber-100/90">
              {t('apiSettings.unavailableTitle', '不提供无效的连接与生成按钮')}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-white/55">
              {provider.note ||
                t('apiSettings.unavailableDescription', '该平台尚未完成可验证的官方 API 适配。')}
            </p>
          </div>
        </div>
      </section>
      <button
        type="button"
        onClick={onGuide}
        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[12px] text-white/65 hover:bg-white/[0.09]"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {t('apiSettings.viewOfficialInfo', '查看官方说明')}
      </button>
    </div>
  );
}

function ImageDetail(props: ImageDetailProps) {
  const { t } = useAppTranslation();
  const {
    provider,
    connState,
    connMessage,
    pullState,
    showKey,
    onToggleKey,
    onBlurKey,
    onApiKey,
    onBaseUrl,
    onEndpoint,
    onAuthType,
    onModel,
    onAddModel,
    onRemoveModel,
    onTest,
    onPull,
    onDelete,
    onGuide,
  } = props;
  const model = provider.models.image[0] ?? '';
  const authOptions: Array<ProviderConnection['authType']> = ['bearer', 'api-key', 'x-key'];

  if (provider.canGenerate === false) {
    return <UnavailableProviderDetail provider={provider} onDelete={onDelete} onGuide={onGuide} />;
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-start justify-between">
        <div>
          <div>
            <h2 className="text-[15px] font-semibold text-white/90">{provider.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {provider.region && (
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/55">
                  {provider.region}
                </span>
              )}
              {provider.status && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    provider.canGenerate
                      ? 'bg-emerald-500/10 text-emerald-300/80'
                      : 'bg-white/[0.06] text-white/45'
                  }`}
                >
                  {provider.status}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {provider.custom ? t('common.delete', '删除') : t('common.reset', '重置')}
        </button>
      </div>

      {provider.summary && (
        <p className="text-[13px] leading-relaxed text-white/55">{provider.summary}</p>
      )}

      {/* API Key */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-white/50">API Key</span>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1 text-[11px] ${
                connState === 'ok'
                  ? 'text-emerald-400'
                  : connState === 'stale'
                    ? 'text-amber-300'
                    : connState === 'error'
                      ? 'text-red-400'
                      : 'text-white/35'
              }`}
            >
              {connState === 'testing' && <RefreshCw className="h-3 w-3 animate-spin" />}
              {connState === 'ok' && <CheckCircle2 className="h-3 w-3" />}
              {(connState === 'stale' || connState === 'error') && (
                <AlertCircle className="h-3 w-3" />
              )}
              {connState === 'idle'
                ? t('apiSettings.status.notChecked', '未检测')
                : connState === 'testing'
                  ? t('apiSettings.status.checkingShort', '检测中')
                  : connState === 'ok'
                    ? provider.modelDiscovery === 'fixed'
                      ? t('apiSettings.status.valid', '配置有效')
                      : t('apiSettings.status.connected', '已连接')
                    : connState === 'stale'
                      ? provider.modelDiscovery === 'fixed'
                        ? t('apiSettings.status.validKeyPending', '配置有效 · 密钥待验证')
                        : t('apiSettings.status.historicalPending', '历史记录 · 待复核')
                      : t('apiSettings.status.failed', '失败')}
            </span>
            <button
              type="button"
              onClick={onTest}
              disabled={connState === 'testing'}
              className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-[12px] text-white/70 hover:bg-white/15 disabled:opacity-40"
            >
              <Plug className="h-3 w-3" />{' '}
              {provider.modelDiscovery === 'fixed'
                ? t('apiSettings.validateConfiguration', '校验配置')
                : t('apiSettings.testConnection', '检测连接')}
            </button>
          </div>
        </div>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={provider.apiKey}
            onChange={(e) => onApiKey(e.target.value)}
            onBlur={onBlurKey}
            placeholder={t('apiSettings.apiKeyPlaceholder', '粘贴真实 API Key')}
            autoComplete="off"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 pr-9 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
          />
          <button
            type="button"
            onClick={onToggleKey}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            aria-label={t('apiSettings.toggleKeyVisibility', '显示/隐藏密钥')}
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400/70">
          <Lock className="h-3 w-3" />
          {t(
            'apiSettings.encryptionNotice',
            '浏览器本地加密，避免项目配置明文；同源脚本/浏览器配置读取者仍可访问',
          )}
        </p>
        {showKey && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-300/80">
            <ShieldAlert className="h-3 w-3" />
            {t('apiSettings.keyVisibleWarning', '密钥已显示，注意防止截屏或他人窥视泄露。')}
          </p>
        )}
        {connMessage && (
          <p
            className={`mt-2 text-[12px] ${
              connState === 'error'
                ? 'text-red-400/80'
                : connState === 'ok'
                  ? 'text-emerald-400/80'
                  : connState === 'stale'
                    ? 'text-amber-300/80'
                    : 'text-white/40'
            }`}
          >
            {connMessage}
          </p>
        )}
      </div>

      {/* Endpoint config */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-white/50">Base URL</label>
          <input
            type="text"
            value={provider.baseUrl}
            onChange={(e) => onBaseUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-white/50">
            {t('apiSettings.authentication', '鉴权方式')}
          </label>
          <select
            value={provider.authType ?? 'bearer'}
            onChange={(e) => onAuthType(e.target.value as ProviderConnection['authType'])}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none focus:border-white/[0.16]"
          >
            {authOptions.map((opt) => (
              <option key={opt} value={opt} className="bg-[#1a1a1c]">
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium text-white/50">
          {t('apiSettings.endpoint', '生成接口路径')}
        </label>
        <input
          type="text"
          value={provider.endpoint ?? ''}
          onChange={(e) => onEndpoint(e.target.value)}
          placeholder="/v1/images/generations"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
        />
      </div>

      {/* Image model */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            IMAGE · {t('apiSettings.modelKind.image', '图片生成模型')}
          </span>
          <InlineAddModel
            onAdd={onAddModel}
            placeholder={t('apiSettings.imageModelIdPlaceholder', '模型 ID，例如 gpt-image-2')}
          />
        </div>
        <input
          type="text"
          value={model}
          onChange={(e) => onModel(e.target.value)}
          placeholder={t('apiSettings.imageModelIdPlaceholder', '模型 ID，例如 gpt-image-2')}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
        />
        {provider.models.image.length > 1 && (
          <div className="mt-2 space-y-1">
            {provider.models.image.slice(1).map((m) => (
              <div
                key={m}
                className="group flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5"
              >
                <ProviderBrandIcon
                  providerId={provider.id}
                  providerName={provider.name}
                  mark={provider.mark}
                  accent={provider.accent}
                  className="h-5 w-5"
                />
                <code className="min-w-0 flex-1 truncate text-[12px] text-white/70">{m}</code>
                <button
                  type="button"
                  onClick={() => onRemoveModel(m)}
                  className="text-white/25 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                  aria-label={t('apiSettings.deleteModel', '删除 {model}', { model: m })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* bestFor + pull + guide */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium text-white/50">
            {t('apiSettings.pullModels', '拉取模型')}
          </p>
          <p className="text-[11px] text-white/30">
            {provider.modelDiscovery === 'fixed'
              ? t('apiSettings.fixedModelsDescription', '官方无模型目录，保留管理员填写的固定模型')
              : t('apiSettings.dynamicModelsDescription', '从上游读取并分类')}
          </p>
        </div>
        <button
          type="button"
          onClick={onPull}
          disabled={pullState === 'pulling'}
          className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-[12px] text-white/70 hover:bg-white/15 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${pullState === 'pulling' ? 'animate-spin' : ''}`} />{' '}
          {provider.modelDiscovery === 'fixed'
            ? t('apiSettings.validateFixedModels', '校验固定模型')
            : t('apiSettings.pullModels', '拉取模型')}
        </button>
      </div>

      {provider.bestFor && provider.bestFor.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-white/50">
            {t('apiSettings.bestFor', '擅长场景')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {provider.bestFor.map((b) => (
              <span
                key={b}
                className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/55"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      )}

      {provider.note && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-[12px] leading-relaxed text-white/45">
          {provider.note}
        </div>
      )}

      <button
        type="button"
        onClick={onGuide}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-2 text-[13px] text-white/55 hover:bg-white/[0.05]"
      >
        <BookOpen className="h-3.5 w-3.5" />
        {t('apiSettings.setupHelp', '设置帮助')}
      </button>
    </div>
  );
}

type ComfyUiDetailProps = {
  provider: ProviderConnection;
  cliPhase: CliPhase;
  cliStatus: CliStatus;
  connMessage: string;
  onDetect: () => Promise<void> | void;
  showKey: boolean;
  onToggleKey: () => void;
  onBlurKey: () => void;
  onBaseUrl: (value: string) => void;
  onApiKey: (value: string) => void;
  onAuthType: (value: ProviderConnection['authType']) => void;
  onDefaultModel: (kind: 'image' | 'video' | 'audio' | '3d', model: string) => void;
  onDelete: () => void;
  onGuide: () => void;
};

function ComfyUiDetail({
  provider,
  cliPhase,
  cliStatus,
  connMessage,
  onDetect,
  showKey,
  onToggleKey,
  onBlurKey,
  onBaseUrl,
  onApiKey,
  onAuthType,
  onDefaultModel,
  onDelete,
  onGuide,
}: ComfyUiDetailProps) {
  const { t } = useAppTranslation();
  const [workflowName, setWorkflowName] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dependencyReport, setDependencyReport] = useState<{
    fileName: string;
    analysis: ComfyWorkflowDependencyAnalysis;
    script: string;
    apiWorkflowJson: string;
    canvasWorkflowJson: string;
    apiDownloadFileName: string;
    canvasDownloadFileName: string;
  } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const connected = isProviderConnectionUsable(provider) && cliStatusIsReady(cliStatus);
  const detecting = cliPhase === 'checking';
  const remote = isRemoteComfyUiProvider(provider);
  const cloud = isCloudComfyUiProvider(provider);
  const workflows = [
    ...provider.models.image.map((id) => ({
      id,
      name: provider.modelCapabilities?.[id]?.displayName ?? id,
      kind: 'image' as const,
      modes: [] as string[],
      compatibility: provider.modelCapabilities?.[id]?.comfyCompatibility,
      compatibilityMessage: provider.modelCapabilities?.[id]?.comfyCompatibilityMessage,
      sourceVersion: provider.modelCapabilities?.[id]?.comfySourceVersion,
      backendVersion: provider.modelCapabilities?.[id]?.comfyBackendVersion,
    })),
    ...provider.models.video.map((id) => ({
      id,
      name: provider.modelCapabilities?.[id]?.displayName ?? id,
      kind: 'video' as const,
      modes: provider.modelCapabilities?.[id]?.videoModes ?? [],
      compatibility: provider.modelCapabilities?.[id]?.comfyCompatibility,
      compatibilityMessage: provider.modelCapabilities?.[id]?.comfyCompatibilityMessage,
      sourceVersion: provider.modelCapabilities?.[id]?.comfySourceVersion,
      backendVersion: provider.modelCapabilities?.[id]?.comfyBackendVersion,
    })),
    ...(provider.models.audio ?? []).map((id) => ({
      id,
      name: provider.modelCapabilities?.[id]?.displayName ?? id,
      kind: 'audio' as const,
      modes: [] as string[],
      compatibility: provider.modelCapabilities?.[id]?.comfyCompatibility,
      compatibilityMessage: provider.modelCapabilities?.[id]?.comfyCompatibilityMessage,
      sourceVersion: provider.modelCapabilities?.[id]?.comfySourceVersion,
      backendVersion: provider.modelCapabilities?.[id]?.comfyBackendVersion,
    })),
    ...(provider.models['3d'] ?? []).map((id) => ({
      id,
      name: provider.modelCapabilities?.[id]?.displayName ?? id,
      kind: '3d' as const,
      modes: [] as string[],
      compatibility: provider.modelCapabilities?.[id]?.comfyCompatibility,
      compatibilityMessage: provider.modelCapabilities?.[id]?.comfyCompatibilityMessage,
      sourceVersion: provider.modelCapabilities?.[id]?.comfySourceVersion,
      backendVersion: provider.modelCapabilities?.[id]?.comfyBackendVersion,
    })),
  ];

  const importWorkflow = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setWorkflowBusy('import');
    setWorkflowMessage('');
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(
          t('apiSettings.comfy.error.workflowTooLarge', '工作流 JSON 不能超过 5 MB。'),
        );
      const parsedWorkflow = parseComfyWorkflowImportJson(await file.text());
      const workflow = parsedWorkflow.workflow;
      const analysis = analyzeComfyWorkflowDependencies(workflow);
      const inferredName =
        file.name.replace(/\.json$/i, '').trim() ||
        t('apiSettings.comfy.defaultWorkflowName', 'ComfyUI 工作流');
      const saved = await saveLocalComfyWorkflow(
        workflowName.trim() || inferredName,
        workflow,
        provider.id,
        parsedWorkflow,
      );
      const downloadBaseName =
        saved.name
          .replace(/[^\p{L}\p{N}._-]+/gu, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80) || 'comfyui-workflow';
      setDependencyReport({
        fileName: file.name,
        analysis,
        script: createComfyDependencyPowerShell(workflow, analysis),
        apiWorkflowJson: JSON.stringify(workflow, null, 2),
        canvasWorkflowJson: comfyProviderNodeWorkflowFileToString({
          kind: saved.kind,
          title: saved.name,
          providerId: provider.id,
          model: saved.id,
          modes: saved.modes,
          defaultPrompt: saved.defaultPrompt,
          supportsAudioReference: saved.supportsAudioReference,
          supportsImageReference: saved.supportsImageReference,
        }),
        apiDownloadFileName: `${downloadBaseName}-ComfyUI-API.json`,
        canvasDownloadFileName: `${downloadBaseName}-无限画布节点.json`,
      });
      setWorkflowName('');
      await onDetect();
      setWorkflowMessage(
        t(
          parsedWorkflow.sourceFormat === 'layout'
            ? 'apiSettings.comfy.notice.workflowConverted'
            : 'apiSettings.comfy.notice.workflowSaved',
          parsedWorkflow.sourceFormat === 'layout'
            ? '已将普通 ComfyUI 工作流转换为 API Format 并保存“{name}”；检测到 {nodeCount} 类节点、{modelCount} 个模型引用。'
            : '已保存“{name}”；检测到 {nodeCount} 类节点、{modelCount} 个模型引用。',
          {
            name: saved.name,
            nodeCount: analysis.nodeClasses.length,
            modelCount: analysis.models.length,
          },
        ),
      );
    } catch (error) {
      setWorkflowMessage(
        error instanceof Error
          ? error.message
          : t('apiSettings.comfy.error.importFailed', '导入工作流失败。'),
      );
    } finally {
      setWorkflowBusy(null);
    }
  };

  const copyInstallScript = async () => {
    if (!dependencyReport) return;
    try {
      await navigator.clipboard.writeText(dependencyReport.script);
      setWorkflowMessage(t('apiSettings.comfy.notice.scriptCopied', 'PowerShell 安装脚本已复制。'));
    } catch {
      setWorkflowMessage(
        t('apiSettings.comfy.error.copyDenied', '浏览器未允许复制，请使用“下载 PowerShell”按钮。'),
      );
    }
  };

  const downloadInstallScript = () => {
    if (!dependencyReport) return;
    const baseName =
      dependencyReport.fileName
        .replace(/\.json$/i, '')
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'comfyui-workflow';
    const url = URL.createObjectURL(
      new Blob([`\ufeff${dependencyReport.script}`], {
        type: 'text/plain;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}-安装依赖.ps1`;
    anchor.click();
    URL.revokeObjectURL(url);
    setWorkflowMessage(
      t(
        'apiSettings.comfy.notice.scriptDownloaded',
        'PowerShell 安装脚本已下载；执行前请检查内容并确认工作流来源可信。',
      ),
    );
  };

  const downloadJson = (content: string, fileName: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadCanvasWorkflowJson = () => {
    if (!dependencyReport) return;
    downloadJson(dependencyReport.canvasWorkflowJson, dependencyReport.canvasDownloadFileName);
  };

  const downloadApiWorkflowJson = () => {
    if (!dependencyReport) return;
    downloadJson(dependencyReport.apiWorkflowJson, dependencyReport.apiDownloadFileName);
  };

  const downloadListedCanvasWorkflow = async (workflow: (typeof workflows)[number]) => {
    const downloadBaseName =
      workflow.name
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'comfyui-workflow';
    let latestWorkflow = null;
    try {
      latestWorkflow = (await fetchComfyUiStatus(provider)).workflows.find(
        (candidate) => candidate.id === workflow.id,
      );
    } catch {
      // Export remains available while ComfyUI itself is temporarily unavailable.
    }
    downloadJson(
      comfyProviderNodeWorkflowFileToString({
        kind: workflow.kind,
        title: workflow.name,
        providerId: provider.id,
        model: workflow.id,
        modes: latestWorkflow?.modes ?? workflow.modes,
        defaultPrompt: latestWorkflow?.defaultPrompt,
        supportsAudioReference: latestWorkflow?.supportsAudioReference,
        supportsImageReference: latestWorkflow?.supportsImageReference,
      }),
      `${downloadBaseName}-无限画布节点.json`,
    );
  };

  const removeWorkflow = async (id: string, name: string) => {
    setWorkflowBusy(id);
    setWorkflowMessage('');
    try {
      await deleteLocalComfyWorkflow(id);
      await onDetect();
      setPendingDeleteId(null);
      setWorkflowMessage(
        t('apiSettings.comfy.notice.workflowDeleted', '已删除“{name}”。', { name }),
      );
    } catch (error) {
      setWorkflowMessage(
        error instanceof Error
          ? error.message
          : t('apiSettings.comfy.error.deleteFailed', '删除工作流失败。'),
      );
    } finally {
      setWorkflowBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-white/90">{provider.name}</h2>
          <p className="text-[12px] text-white/40">
            {remote
              ? t('apiSettings.comfy.remoteVideoProvider', '远程 GPU 图片与视频工作流 Provider')
              : t('apiSettings.comfy.localVideoProvider', '本地图片与视频工作流 Provider')}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />{' '}
          {provider.custom ? t('common.delete', '删除') : t('common.reset', '重置')}
        </button>
      </div>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        {remote && (
          <div className="mb-4 space-y-3 border-b border-white/[0.08] pb-4">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-white/55">
                ComfyUI Base URL
              </label>
              <input
                type="url"
                value={provider.baseUrl}
                onChange={(event) => onBaseUrl(event.target.value)}
                placeholder="https://gpu.example.com/comfyui"
                spellCheck={false}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/[0.18]"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                {t(
                  'apiSettings.comfy.remoteHttpsNotice',
                  '只允许 HTTPS 公网地址；请填写 API 根地址，不要包含 /prompt、查询参数或 #工作流片段。',
                )}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-white/55">
                  {cloud
                    ? t('apiSettings.comfy.cloudApiKey', 'Comfy Cloud API Key（必填）')
                    : t('apiSettings.apiKeyOptional', 'API Key（可选）')}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={provider.apiKey}
                    onChange={(event) => onApiKey(event.target.value)}
                    onBlur={onBlurKey}
                    placeholder={
                      cloud
                        ? t('apiSettings.comfy.cloudApiKeyPlaceholder', 'X-API-Key')
                        : t('apiSettings.apiKeyOptionalPlaceholder', '服务无需鉴权时留空')
                    }
                    autoComplete="off"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 pr-9 font-mono text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/[0.18]"
                  />
                  <button
                    type="button"
                    onClick={onToggleKey}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    aria-label={t('apiSettings.toggleKeyVisibility', '显示/隐藏密钥')}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-white/55">
                  {t('apiSettings.authentication', '鉴权方式')}
                </label>
                <select
                  value={provider.authType ?? 'bearer'}
                  disabled={cloud}
                  onChange={(event) =>
                    onAuthType(event.target.value as ProviderConnection['authType'])
                  }
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none focus:border-white/[0.18]"
                >
                  <option value="bearer" className="bg-[#1a1a1c]">
                    Bearer
                  </option>
                  <option value="api-key" className="bg-[#1a1a1c]">
                    API Key
                  </option>
                  <option value="x-key" className="bg-[#1a1a1c]">
                    X-Key
                  </option>
                </select>
              </div>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-emerald-400/70">
              <Lock className="h-3 w-3" />
              {t(
                'apiSettings.encryptionNotice',
                '浏览器本地加密，避免项目配置明文；同源脚本/浏览器配置读取者仍可访问',
              )}
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/55">
              <Server className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-white/85">
                {t('apiSettings.comfy.connection', 'ComfyUI 连接')}
              </h3>
              <p className="mt-0.5 break-words text-[11px] leading-relaxed text-white/45">
                {t(
                  'apiSettings.comfy.bridgeRouting',
                  '浏览器仅连接画布桥 {bridgeUrl}，由画布桥转发到 {providerUrl}。',
                  {
                    bridgeUrl: BRIDGE_BASE_URL,
                    providerUrl:
                      provider.baseUrl ||
                      t('apiSettings.comfy.remoteAddressPending', '待填写的远程地址'),
                  },
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDetect}
            disabled={detecting || (remote && !provider.baseUrl.trim())}
            className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/20 px-3 py-1.5 text-[12px] font-medium text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${detecting ? 'animate-spin' : ''}`} />
            {detecting
              ? t('apiSettings.status.checking', '检测中…')
              : t('apiSettings.testConnection', '检测连接')}
          </button>
        </div>
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${
            connected
              ? 'bg-emerald-500/10 text-emerald-200/80'
              : 'bg-amber-500/10 text-amber-200/80'
          }`}
          role="status"
        >
          {connMessage ||
            cliStatus.message ||
            (remote
              ? t(
                  'apiSettings.comfy.remoteStartHint',
                  '请填写远程 ComfyUI HTTPS 地址和可选密钥，再检测连接。',
                )
              : t(
                  'apiSettings.comfy.startServicesHint',
                  '请先启动 ComfyUI 和 Qiansi-Canvas 本地桥，再检测连接。',
                ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="mb-3">
          <h3 className="text-[13px] font-semibold text-white/80">
            {t('apiSettings.comfy.importWorkflow', '导入 ComfyUI 工作流')}
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
            {t(
              'apiSettings.comfy.workflowStorageDescription',
              '工作流会保存在本地桥中，并按输出类型作为图片、视频、音频或 3D 模型传给生成任务。',
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={workflowName}
            onChange={(event) => setWorkflowName(event.target.value)}
            placeholder={t(
              'apiSettings.comfy.workflowNamePlaceholder',
              '工作流名称（留空则使用文件名）',
            )}
            maxLength={120}
            className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={importWorkflow}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={workflowBusy !== null}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.13] disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5" />
            {workflowBusy === 'import'
              ? t('apiSettings.comfy.importing', '导入中…')
              : t('apiSettings.comfy.chooseJson', '选择 JSON')}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-white/30">
          {t(
            'apiSettings.comfy.trustedWorkflowHint',
            '支持 API Format 及含 nodes / links 的普通工作流；普通格式会在本地转换。输出支持图片、MP4/WebM/MOV 视频、常见音频和 GLB/glTF 等 3D 文件。',
          )}
        </p>
        {workflowMessage && (
          <p
            className="mt-2 rounded-lg bg-white/[0.05] px-3 py-2 text-[12px] text-white/60"
            role="status"
          >
            {workflowMessage}
          </p>
        )}
        {dependencyReport && (
          <div className="mt-3 space-y-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.035] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-sky-100/75">
                  {t('apiSettings.comfy.dependencyCheck', '工作流依赖检测')}
                </p>
                <p className="mt-0.5 text-[10px] text-white/35">
                  {t(
                    'apiSettings.comfy.dependencySummary',
                    '{nodeCount} 类节点 · {modelCount} 个模型引用 · {downloadCount} 个带可验证下载地址',
                    {
                      nodeCount: dependencyReport.analysis.nodeClasses.length,
                      modelCount: dependencyReport.analysis.models.length,
                      downloadCount: dependencyReport.analysis.downloadableModels,
                    },
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyInstallScript()}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.08]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t('apiSettings.comfy.copyScript', '复制脚本')}
                </button>
                <button
                  type="button"
                  onClick={downloadInstallScript}
                  className="flex items-center gap-1.5 rounded-md bg-sky-400/15 px-2.5 py-1.5 text-[11px] text-sky-200/75 hover:bg-sky-400/25"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('apiSettings.comfy.downloadPowerShell', '下载 PowerShell')}
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] text-white/35">
                {t('apiSettings.comfy.nodeClasses', '节点类（由官方 comfy CLI 映射所属模块）')}
              </p>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-auto">
                {dependencyReport.analysis.nodeClasses.map((nodeClass) => (
                  <code
                    key={nodeClass}
                    className="rounded bg-white/[0.05] px-2 py-1 text-[10px] text-white/50"
                  >
                    {nodeClass}
                  </code>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] text-white/35">
                {t('apiSettings.comfy.modelFiles', '模型文件')}
              </p>
              {dependencyReport.analysis.models.length ? (
                <div className="max-h-36 space-y-1 overflow-auto">
                  {dependencyReport.analysis.models.map((model) => (
                    <div
                      key={`${model.relativePath}:${model.name}`}
                      className="flex items-center justify-between gap-3 rounded-md bg-black/10 px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[10px] text-white/60">{model.name}</p>
                        <p className="truncate text-[9px] text-white/28">{model.relativePath}</p>
                      </div>
                      <span
                        className={`shrink-0 text-[9px] ${model.downloadUrl ? 'text-emerald-300/65' : 'text-amber-300/65'}`}
                      >
                        {model.downloadUrl
                          ? t('apiSettings.comfy.scriptCanDownload', '脚本可下载')
                          : t('apiSettings.comfy.manualSourceRequired', '需人工提供来源')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-white/30">
                  {t(
                    'apiSettings.comfy.noModelFilesDetected',
                    '没有从常见模型输入字段中检测到模型文件名。',
                  )}
                </p>
              )}
            </div>

            <p className="rounded-lg border border-amber-400/10 bg-amber-400/[0.035] px-3 py-2 text-[10px] leading-5 text-amber-100/50">
              {t(
                'apiSettings.comfy.installScriptSafety',
                '脚本使用官方命令 comfy node install-deps --workflow。模型只有在 JSON 同时提供可信 HTTP(S) 下载地址时才会自动下载；只有文件名的模型不会猜测来源。在 PowerShell 中运行脚本；如果 comfy CLI 没有记住工作区，可追加参数 -Workspace “D:\\ComfyUI”。',
              )}
            </p>

            <div className="rounded-lg border border-white/[0.07] bg-black/10 p-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-white/60">
                    {t('apiSettings.comfy.workflowJson', '无限画布节点 JSON')}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-4 text-white/35">
                    {t(
                      'apiSettings.comfy.workflowJsonDescription',
                      '下载后可从画布顶部直接导入，将创建已绑定当前 ComfyUI 工作流模型的图片或视频节点。',
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadCanvasWorkflowJson}
                    className="flex items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1.5 text-[11px] text-emerald-200/75 hover:bg-emerald-400/[0.14]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('apiSettings.comfy.downloadWorkflowJson', '下载画布 JSON')}
                  </button>
                  <button
                    type="button"
                    onClick={downloadApiWorkflowJson}
                    className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.08]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('apiSettings.comfy.downloadApiWorkflowJson', '下载 API JSON')}
                  </button>
                </div>
              </div>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/20 p-2 text-[10px] leading-4 text-white/45">
                {dependencyReport.canvasWorkflowJson.slice(0, 12_000)}
                {dependencyReport.canvasWorkflowJson.length > 12_000 &&
                  `\n… ${t('apiSettings.comfy.workflowJsonTruncated', '预览已截断；下载文件包含完整 JSON。')}`}
              </pre>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium text-white/55">
              COMFYUI ·{' '}
              {t('apiSettings.comfy.videoWorkflowModels', '图片、视频、音频与 3D 工作流模型')}
            </p>
            <p className="text-[11px] text-white/30">
              {t('apiSettings.comfy.firstIsDefault', '每类首项为对应节点的默认模型')}
            </p>
          </div>
          <span className="text-[11px] text-white/35">
            {t('apiSettings.comfy.workflowCount', '{count} 个', { count: workflows.length })}
          </span>
        </div>
        {workflows.length ? (
          <div className="space-y-1">
            {workflows.map((workflow) => {
              const isDefault = (provider.models[workflow.kind] ?? [])[0] === workflow.id;
              return (
                <div
                  key={workflow.id}
                  className="group flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => onDefaultModel(workflow.kind, workflow.id)}
                    disabled={workflow.compatibility === 'incompatible'}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      isDefault
                        ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                        : 'border-white/20 text-transparent hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-30'
                    }`}
                    title={
                      isDefault
                        ? t('apiSettings.comfy.defaultWorkflow', '默认工作流')
                        : t('apiSettings.setDefaultModel', '设为默认')
                    }
                  >
                    ★
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-white/70">
                      {workflow.name}
                    </span>
                    <code className="block truncate text-[10px] text-white/30">{workflow.id}</code>
                  </div>
                  <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/45">
                    {workflow.kind.toUpperCase()}
                  </span>
                  {workflow.sourceVersion && (
                    <span
                      className="shrink-0 text-[9px] text-white/30"
                      title={
                        workflow.backendVersion
                          ? `Workflow ${workflow.sourceVersion} · ComfyUI ${workflow.backendVersion}`
                          : `Workflow ${workflow.sourceVersion}`
                      }
                    >
                      WF {workflow.sourceVersion}
                      {workflow.backendVersion ? ` · ${workflow.backendVersion}` : ''}
                    </span>
                  )}
                  {workflow.compatibility === 'incompatible' && (
                    <span
                      className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200/80"
                      title={workflow.compatibilityMessage}
                    >
                      {t('apiSettings.comfy.needsMigration', '需要重新导入或迁移')}
                    </span>
                  )}
                  {workflow.compatibility === 'unchecked' && (
                    <span
                      className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/35"
                      title={workflow.compatibilityMessage}
                    >
                      {t('apiSettings.comfy.compatibilityUnchecked', '兼容性未验证')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadListedCanvasWorkflow(workflow)}
                    className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-emerald-300/70 hover:bg-emerald-400/10 hover:text-emerald-200"
                    aria-label={t(
                      'apiSettings.comfy.exportCanvasWorkflow',
                      '导出 {name} 的无限画布 JSON',
                      { name: workflow.name },
                    )}
                    title={t('apiSettings.comfy.exportCanvasJson', '导出无限画布 JSON')}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('common.export', '导出')}
                  </button>
                  {pendingDeleteId === workflow.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => removeWorkflow(workflow.id, workflow.name)}
                        disabled={workflowBusy !== null}
                        className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/25 disabled:opacity-40"
                      >
                        {t('common.confirm', '确认')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        disabled={workflowBusy !== null}
                        className="rounded px-1.5 py-0.5 text-[11px] text-white/40 hover:bg-white/[0.08] disabled:opacity-40"
                      >
                        {t('common.cancel', '取消')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(workflow.id)}
                      disabled={workflowBusy !== null}
                      className="text-white/25 opacity-0 transition-opacity hover:text-rose-400 disabled:opacity-20 group-hover:opacity-100"
                      aria-label={t('apiSettings.comfy.deleteWorkflow', '删除 {name}', {
                        name: workflow.name,
                      })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-2 text-[12px] text-white/30">
            {t(
              'apiSettings.comfy.emptyWorkflows',
              '尚未导入工作流。连接成功后导入 ComfyUI JSON，对应的图片或视频节点会显示 ComfyUI 模型。',
            )}
          </p>
        )}
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setGuideOpen((open) => !open)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/15 bg-sky-400/[0.035] py-2 text-[13px] text-sky-100/65 hover:bg-sky-400/[0.07]"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {guideOpen
            ? t('apiSettings.comfy.hideVideoGuide', '收起视频教程')
            : t('apiSettings.comfy.fullVideoGuide', '生成视频完整教程')}
        </button>
        <button
          type="button"
          onClick={onGuide}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-2 text-[13px] text-white/55 hover:bg-white/[0.05]"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {t('apiSettings.comfy.setupHelp', 'ComfyUI 设置帮助')}
        </button>
      </div>
      {guideOpen && <ComfyUiVideoGuide />}
    </div>
  );
}

// ──────────────────────────────────────────────
//  CliDetail — CLI provider settings
// ──────────────────────────────────────────────

type CliDetailProps = {
  provider: ProviderConnection;
  cliPhase: CliPhase;
  cliStatus: CliStatus;
  jimengAccount: {
    phase: string;
    running: boolean;
    loggedIn: boolean;
    credit?: string;
    installText?: string;
    text?: string;
    qrUrl?: string;
    verificationUri?: string;
    userCode?: string;
    expiresAt?: string;
    message?: string;
  };
  connMessage: string;
  onDetect: () => void;
  onJimengInstall: () => void;
  onJimengLogin: () => void;
  onJimengCredit: () => void;
  onJimengLogout: () => void;
  onBaseUrl: (value: string) => void;
  onCliConfig: (key: keyof NonNullable<ProviderConnection['cliConfig']>, value: string) => void;
  onModel: (kind: ProviderModelKind, model: string) => void;
  onAddModel: (kind: ProviderModelKind, model: string) => void;
  onRemoveModel: (kind: ProviderModelKind, model: string) => void;
  onReasoningEffort?: (model: string, effort: string) => void;
  onDelete: () => void;
  onGuide: () => void;
};

const DEFAULT_REASONING_EFFORTS: ProviderReasoningEffort[] = [
  'auto',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

const reasoningLabel = (e: ProviderReasoningEffort): string =>
  e === 'auto'
    ? '自动'
    : e === 'low'
      ? '低'
      : e === 'medium'
        ? '中'
        : e === 'high'
          ? '高'
          : e === 'xhigh'
            ? '极高'
            : e === 'max'
              ? '最大'
              : '超强';

function CliDetail(props: CliDetailProps) {
  const { t } = useAppTranslation();
  const {
    provider,
    cliPhase,
    cliStatus,
    jimengAccount,
    connMessage,
    onDetect,
    onJimengInstall,
    onJimengLogin,
    onJimengCredit,
    onJimengLogout,
    onBaseUrl,
    onCliConfig,
    onModel,
    onAddModel,
    onRemoveModel,
    onDelete,
    onGuide,
  } = props;

  const isJimeng = provider.protocol === 'jimeng';
  const isCodex = provider.protocol === 'codex';
  const isVolcengineCli = provider.protocol === 'volcengine-cli';
  const isWorkBuddy = provider.protocol === 'codebuddy';
  const isGemini = provider.protocol === 'gemini-cli';
  const isBailian = provider.protocol === 'bailian';
  const isLightX2V = provider.protocol === 'lightx2v';
  const detecting = cliPhase === 'checking';
  const installed = cliStatus.installed;
  const authed = isJimeng
    ? (cliStatus.authenticated ?? jimengAccount.loggedIn)
    : cliStatus.authenticated;
  const connectionState = apiSettingsCliConnectionState(provider, cliStatusIsReady(cliStatus));
  const connected = connectionState !== 'unavailable';
  const historical = connectionState === 'historical';
  const installingJimeng = isJimeng && jimengAccount.phase === 'installing';

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-start justify-between">
        <div>
          <div>
            <h2 className="text-[15px] font-semibold text-white/90">{provider.name}</h2>
            <p className="text-[12px] text-white/40">
              {t('apiSettings.providerId', '平台 ID')}: {provider.id}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t('common.reset', '重置')}
        </button>
      </div>

      {/* ── CLI Detection Card (core of old version) ── */}
      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-white/85">{provider.name}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">
              {isVolcengineCli
                ? t(
                    'apiSettings.cli.description.volcengine',
                    '检测火山方舟官方 Ark CLI（arkcli）的安装与登录状态；当前尚未接入画布生成适配器。',
                  )
                : isJimeng
                  ? t(
                      'apiSettings.cli.description.jimeng',
                      '安装并检测即梦官方 CLI；登录后可在图片、视频节点中直接使用官方生成模型。',
                    )
                  : isWorkBuddy
                    ? t(
                        'apiSettings.cli.description.workBuddy',
                        '检测 WorkBuddy 官方 CodeBuddy Code CLI；只有软件已打开并保持活动会话时，才可用于 AI 助手和文本节点。',
                      )
                    : isGemini
                      ? t(
                          'apiSettings.cli.description.antigravity',
                          '仅检测官方 Antigravity CLI（agy）；不会回退到 Gemini CLI，登录验证通过后才开放文本模型。',
                        )
                      : isBailian
                        ? t(
                            'apiSettings.cli.description.bailian',
                            '检测阿里云百炼官方 bl CLI；用于云端图片与视频生成。',
                          )
                        : isLightX2V
                          ? t(
                              'apiSettings.cli.description.lightX2V',
                              '检测本机 LightX2V Python 环境、模型目录与生成配置。',
                            )
                          : t(
                              'apiSettings.cli.description.default',
                              '进入设置后自动检测本机命令、版本与登录状态。',
                            )}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
              detecting
                ? 'bg-sky-500/15 text-sky-300 animate-pulse'
                : cliPhase === 'stale' && !connected
                  ? 'bg-amber-500/10 text-amber-300'
                  : cliPhase === 'bridge-error'
                    ? 'bg-red-500/10 text-red-300'
                    : connected
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : installed
                        ? 'bg-amber-500/10 text-amber-300'
                        : 'bg-white/[0.06] text-white/40'
            }`}
          >
            {detecting
              ? t('apiSettings.status.checking', '检测中…')
              : cliPhase === 'stale' && !connected
                ? t('apiSettings.status.historicalPending', '历史记录 · 待复核')
                : cliPhase === 'bridge-error'
                  ? t('apiSettings.cli.serviceNotRunning', '检测服务未启动')
                  : historical
                    ? t('apiSettings.cli.restoredPending', '已恢复 · 后台复核')
                    : connected
                      ? t('apiSettings.status.connected', '已连接')
                      : installed
                        ? t('apiSettings.cli.installedNotConnected', '已安装 · 未连接')
                        : t('apiSettings.cli.notInstalled', '未安装')}
          </span>
        </div>

        {/* Capability grid — 3 cards like old version */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <article className="min-w-0 rounded-lg bg-black/25 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-white/30">
              {t('apiSettings.cli.installationStatus', '安装状态')}
            </span>
            <b className="mt-1 block text-[12px] text-white/80">
              {installed
                ? cliStatus.version || t('apiSettings.cli.commandFound', '命令已找到')
                : t('apiSettings.cli.commandNotFound', '未找到命令')}
            </b>
            <span className="mt-0.5 block break-all text-[10px] text-white/35">
              {installed
                ? cliStatus.commandPath || t('apiSettings.cli.localCommandFound', '已找到本机命令')
                : isJimeng
                  ? t('apiSettings.cli.officialInstallerAvailable', '可在下方使用官方安装器')
                  : t('apiSettings.cli.rootInstallerHint', '使用平台安装器或查看帮助')}
            </span>
          </article>
          <article className="min-w-0 rounded-lg bg-black/25 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-white/30">
              {isJimeng
                ? t('apiSettings.cli.capability.accountTools', '账户工具')
                : isVolcengineCli
                  ? t('apiSettings.cli.capability.openapiIdentity', '方舟身份')
                  : isBailian
                    ? t('apiSettings.cli.capability.bailianAccount', '百炼账户')
                    : isLightX2V
                      ? t('apiSettings.cli.capability.localRuntime', '本地运行时')
                      : t('apiSettings.cli.capability.textTasks', '文本任务')}
            </span>
            <b className="mt-1 block text-[12px] text-white/80">
              {!installed
                ? t('apiSettings.cli.capability.unavailable', '不可用')
                : isWorkBuddy
                  ? connected
                    ? t('apiSettings.cli.capability.workBuddyRunning', '会话运行中 · 可用')
                    : t('apiSettings.cli.capability.openWorkBuddy', '请先打开 WorkBuddy')
                  : isBailian
                    ? authed
                      ? t('apiSettings.cli.capability.loggedInAvailable', '已登录 · 可用')
                      : t('apiSettings.cli.capability.loginRequired', '需要登录')
                    : isLightX2V
                      ? authed
                        ? t('apiSettings.cli.capability.pythonReady', 'Python 环境可用')
                        : t('apiSettings.cli.capability.incompleteConfiguration', '配置不完整')
                      : authed === false
                        ? t('apiSettings.cli.capability.loginRequired', '需要登录')
                        : authed === true
                          ? t('apiSettings.cli.capability.loggedInAvailable', '已登录 · 可用')
                          : t('apiSettings.cli.capability.loginUnverified', '登录状态未验证')}
            </b>
            <span className="mt-0.5 block text-[10px] text-white/35">
              {isJimeng
                ? t('apiSettings.cli.capability.jimengAccountActions', '扫码、积分与退出登录')
                : isVolcengineCli
                  ? t(
                      'apiSettings.cli.capability.volcengineIdentityDescription',
                      '通过 arkcli auth status 验证官方登录状态',
                    )
                  : isBailian
                    ? t('apiSettings.cli.capability.bailianManagedLogin', '登录态由 bl CLI 管理')
                    : isLightX2V
                      ? t(
                          'apiSettings.cli.capability.lightX2VRequirements',
                          'Python、包与路径均需通过检测',
                        )
                      : isWorkBuddy
                        ? t(
                            'apiSettings.cli.capability.workBuddySessionRequired',
                            '保持 codebuddy 会话运行；关闭后模型自动停用',
                          )
                        : t(
                            'apiSettings.cli.capability.textTaskDescription',
                            '用于 AI 对话和文本节点',
                          )}
            </span>
          </article>
          <article className="min-w-0 rounded-lg bg-black/25 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-white/30">
              {isVolcengineCli
                ? t('apiSettings.cli.capability.canvasAdapter', '画布适配')
                : t('apiSettings.cli.imageVideo', '图片 / 视频')}
            </span>
            <b className="mt-1 block text-[12px] text-white/80">
              {isVolcengineCli
                ? t('apiSettings.cli.capability.managementOnly', '尚未启用')
                : isJimeng
                  ? !installed
                    ? t('apiSettings.cli.capability.unavailable', '不可用')
                    : !authed
                      ? t('apiSettings.cli.capability.loginRequired', '需要登录')
                      : cliStatus.imageGeneration && cliStatus.videoGeneration
                        ? t('apiSettings.cli.capability.imageVideoAvailable', '图片、视频生成可用')
                        : cliStatus.imageGeneration
                          ? t('apiSettings.cli.capability.imageAvailable', '图片生成可用')
                          : cliStatus.videoGeneration
                            ? t('apiSettings.cli.capability.videoAvailable', '视频生成可用')
                            : t('apiSettings.cli.capability.generationDisabled', '生成能力未启用')
                  : isBailian || isLightX2V
                    ? cliStatus.imageGeneration && cliStatus.videoGeneration
                      ? t('apiSettings.cli.capability.imageVideoAvailable', '图片、视频生成可用')
                      : cliStatus.imageGeneration
                        ? t('apiSettings.cli.capability.imageAvailable', '图片生成可用')
                        : cliStatus.videoGeneration
                          ? t('apiSettings.cli.capability.videoAvailable', '视频生成可用')
                          : t('apiSettings.cli.capability.generationNotReady', '生成配置未就绪')
                    : isCodex
                      ? !installed
                        ? t('apiSettings.cli.capability.unavailable', '不可用')
                        : !authed
                          ? t('apiSettings.cli.capability.loginRequired', '需要登录')
                          : cliStatus.imageGeneration
                            ? t('apiSettings.cli.capability.imageAvailable', '图片生成可用')
                            : t('apiSettings.cli.capability.imageDisabled', '图片能力未启用')
                      : isWorkBuddy
                        ? t('apiSettings.cli.capability.textOnly', '仅支持文本')
                        : t('apiSettings.cli.capability.configureGenerationApi', '请配置生成 API')}
            </b>
            <span className="mt-0.5 block text-[10px] text-white/35">
              {historical
                ? t(
                    'apiSettings.cli.capability.restoredStillValidated',
                    '已恢复上次可用能力，实际调用仍由本地桥校验',
                  )
                : isVolcengineCli
                  ? t(
                      'apiSettings.cli.capability.volcengineNoGeneration',
                      '当前不发布画布模型；生成内容请使用火山方舟 API 服务商',
                    )
                  : (isJimeng || isBailian || isLightX2V) &&
                      (cliStatus.imageGeneration || cliStatus.videoGeneration)
                    ? t(
                        'apiSettings.cli.capability.modelsAppearInNodes',
                        '官方 CLI 模型会显示在对应节点的模型下拉框中',
                      )
                    : isJimeng
                      ? t(
                          'apiSettings.cli.capability.loginThenDetect',
                          '完成登录并重新检测后开放节点模型',
                        )
                      : isCodex && !authed
                        ? t(
                            'apiSettings.cli.capability.loginThenDetect',
                            '完成登录并重新检测后开放节点模型',
                          )
                        : isCodex && cliStatus.imageGeneration
                          ? t(
                              'apiSettings.cli.capability.codexImageFeatures',
                              '支持生成、扩图和参考图修改',
                            )
                          : isCodex && !cliStatus.imageGeneration
                            ? t(
                                'apiSettings.cli.capability.upgradeCodex',
                                '请升级 Codex CLI 并重新检测',
                              )
                            : t(
                                'apiSettings.cli.capability.textOrAccountOnly',
                                '当前 CLI 仅用于文本或账户功能',
                              )}
            </span>
          </article>
        </div>

        {installed && !connected && !detecting && cliPhase !== 'stale' && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-500/[0.07] p-3">
            <div className="min-w-0">
              <b className="block text-[12px] text-red-200/90">
                {t('apiSettings.cli.installedButDisconnected', '已安装，但尚未真实连通')}
              </b>
              <span className="mt-0.5 block break-words text-[11px] leading-relaxed text-white/45">
                {cliStatus.message ||
                  (isGemini
                    ? t(
                        'apiSettings.cli.login.antigravity',
                        '请启动 Antigravity CLI 完成登录，然后重新检测。',
                      )
                    : t(
                        'apiSettings.cli.login.completeThenDetect',
                        '请先完成 CLI 登录，再重新检测。',
                      ))}
              </span>
            </div>
          </div>
        )}

        {/* Install callout when not installed */}
        {!installed && !historical && cliPhase !== 'checking' && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-amber-500/5 p-3">
            <div>
              <b className="block text-[12px] text-amber-200/80">
                {cliStatus.message ||
                  t('apiSettings.cli.status.providerNotFound', '未找到 {name}。', {
                    name: provider.name,
                  })}
              </b>
              <span className="text-[11px] text-white/40">
                {isJimeng
                  ? t(
                      'apiSettings.cli.install.jimengOfficial',
                      '点击“安装 / 修复 CLI”将通过 jimeng.jianying.com 官方安装器进行安装。',
                    )
                  : t(
                      'apiSettings.cli.install.rootBatchHint',
                      'Windows 可运行 tools/launchers/安装CLI工具-Windows.bat；macOS 可运行 tools/launchers/安装CLI工具-macOS.command，或打开对应设置帮助。',
                    )}
              </span>
            </div>
          </div>
        )}

        {/* Diagnostic details (collapsible) */}
        {(installed || cliPhase === 'bridge-error') && (
          <details className="mb-3 group">
            <summary className="cursor-pointer text-[11px] text-white/40 hover:text-white/70">
              {t('apiSettings.cli.diagnosticDetails', '查看安装路径与诊断信息')}
            </summary>
            <div className="mt-2 space-y-1 rounded-md bg-black/30 p-2">
              {cliStatus.commandPath && (
                <code
                  className={`block break-all font-mono text-[11px] ${
                    historical ? 'text-amber-200/60' : 'text-emerald-300/80'
                  }`}
                >
                  {cliStatus.commandPath}
                </code>
              )}
              <p className="text-[11px] text-white/40">
                {historical
                  ? t(
                      'apiSettings.cli.status.historyBlocksCapabilities',
                      '仅保留上次检测记录；完成实时复核前不会开放模型或执行能力。',
                    )
                  : cliPhase === 'bridge-error'
                    ? connMessage
                    : cliStatus.message}
              </p>
            </div>
          </details>
        )}

        {/* Action buttons row — mirrors old version cli-account-actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDetect}
            disabled={detecting}
            className="flex items-center gap-1.5 rounded-md bg-amber-500/20 px-3 py-1.5 text-[12px] font-medium text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${detecting ? 'animate-spin' : ''}`} />
            {detecting
              ? t('apiSettings.cli.detecting', '正在检测…')
              : t('common.checkAgain', '重新检测')}
          </button>
          {isJimeng && (
            <button
              type="button"
              onClick={onJimengInstall}
              disabled={installingJimeng || jimengAccount.running}
              className="flex items-center gap-1.5 rounded-md bg-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-white/70 hover:bg-white/[0.13] disabled:opacity-40"
            >
              <Download className={`h-3 w-3 ${installingJimeng ? 'animate-pulse' : ''}`} />
              {installingJimeng
                ? t('apiSettings.cli.installing', '正在安装…')
                : installed
                  ? t('apiSettings.cli.repairOrUpdate', '修复 / 更新 CLI')
                  : t('apiSettings.cli.install', '安装 CLI')}
            </button>
          )}
          {isJimeng && (
            <button
              type="button"
              onClick={onJimengLogin}
              disabled={
                !installed ||
                installingJimeng ||
                jimengAccount.phase === 'checking' ||
                jimengAccount.running
              }
              title={
                !installed
                  ? t('apiSettings.cli.jimeng.installBeforeLogin', '请先安装并检测即梦 CLI')
                  : undefined
              }
              className="rounded-md bg-sky-500/20 px-3 py-1.5 text-[12px] font-medium text-sky-300 hover:bg-sky-500/30 disabled:opacity-40"
            >
              {jimengAccount.running
                ? t('apiSettings.cli.waitingForQr', '等待扫码')
                : t('apiSettings.cli.qrLogin', '扫码登录')}
            </button>
          )}
          {isJimeng && installed && (
            <button
              type="button"
              onClick={onJimengCredit}
              disabled={jimengAccount.phase === 'checking'}
              className="rounded-md bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/10 disabled:opacity-40"
            >
              {t('apiSettings.cli.queryCredits', '查询积分')}
            </button>
          )}
          {isJimeng && installed && (
            <button
              type="button"
              onClick={onJimengLogout}
              disabled={!jimengAccount.loggedIn && !jimengAccount.running}
              className="rounded-md px-3 py-1.5 text-[12px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
            >
              {t('apiSettings.cli.signOut', '退出登录')}
            </button>
          )}
        </div>

        {isJimeng && jimengAccount.message && !jimengAccount.running && (
          <p
            className={`mt-2 rounded-md px-3 py-2 text-[11px] ${
              connected && jimengAccount.phase !== 'error'
                ? 'bg-emerald-500/10 text-emerald-200/80'
                : historical
                  ? 'bg-amber-500/10 text-amber-200/80'
                  : jimengAccount.phase === 'error'
                    ? 'bg-red-500/10 text-red-200/80'
                    : 'bg-white/[0.05] text-white/55'
            }`}
            role="status"
          >
            {jimengAccount.message}
          </p>
        )}

        {isJimeng && (jimengAccount.installText || installingJimeng) && (
          <div className="mt-3 rounded-lg bg-black/30 p-3" aria-live="polite">
            <strong className="block text-[12px] text-white/70">
              {installingJimeng
                ? t('apiSettings.cli.jimeng.installingTitle', '即梦 CLI 安装中')
                : t('apiSettings.cli.jimeng.installResultTitle', '即梦 CLI 安装结果')}
            </strong>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-white/55">
              {jimengAccount.installText ||
                t('apiSettings.cli.jimeng.waitingInstallerOutput', '正在等待官方安装器输出…')}
            </pre>
          </div>
        )}

        {/* Jimeng credit output */}
        {isJimeng && jimengAccount.credit && (
          <pre
            className={`mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 font-mono text-[11px] ${
              connected ? 'text-emerald-300/90' : 'text-amber-200/60'
            }`}
          >
            {jimengAccount.credit}
          </pre>
        )}

        {/* Jimeng login output + official OAuth Device Flow entry */}
        {isJimeng &&
          (jimengAccount.text ||
            jimengAccount.qrUrl ||
            jimengAccount.verificationUri ||
            jimengAccount.running) && (
            <div className="mt-3 space-y-2 rounded-lg bg-black/30 p-3" aria-live="polite">
              {jimengAccount.qrUrl &&
                /^(?:https?:\/\/|data:image\/)/i.test(jimengAccount.qrUrl) && (
                  <img
                    src={jimengAccount.qrUrl}
                    alt={t('apiSettings.cli.jimeng.qrCodeAlt', '即梦扫码登录二维码')}
                    className="mx-auto h-44 w-44 rounded-lg border border-white/[0.08] object-contain"
                  />
                )}
              {jimengAccount.qrUrl &&
                !/^(?:https?:\/\/|data:image\/)/i.test(jimengAccount.qrUrl) && (
                  <code className="block break-all font-mono text-[11px] text-white/60">
                    {jimengAccount.qrUrl}
                  </code>
                )}
              {jimengAccount.verificationUri && (
                <a
                  href={jimengAccount.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center rounded-lg bg-sky-500/20 px-3 py-2 text-[12px] font-medium text-sky-200 transition-colors hover:bg-sky-500/30"
                >
                  {t('apiSettings.cli.jimeng.openQrPage', '打开即梦扫码登录页面')}
                </a>
              )}
              {jimengAccount.userCode && (
                <div className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-center">
                  <span className="block text-[10px] text-white/35">
                    {t('apiSettings.cli.jimeng.authorizationCode', '登录授权码')}
                  </span>
                  <code className="mt-1 block select-all break-all font-mono text-[12px] text-white/75">
                    {jimengAccount.userCode}
                  </code>
                </div>
              )}
              <div>
                <strong className="block text-[12px] text-white/70">
                  {t('apiSettings.cli.jimeng.completeAuthorization', '请在官方页面扫码并完成授权')}
                </strong>
                <p className="text-[11px] text-white/40">
                  {t(
                    'apiSettings.cli.jimeng.privacyNotice',
                    'Qiansi-Canvas 只展示本机 CLI 返回的官方授权地址和状态，不读取账号密码。',
                  )}
                </p>
                <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-white/55">
                  {jimengAccount.text ||
                    t('apiSettings.cli.jimeng.waitingCompatibleOutput', '正在等待兼容命令输出…')}
                </pre>
              </div>
            </div>
          )}
      </section>

      {isLightX2V && (
        <section className="space-y-3 rounded-xl border border-violet-400/15 bg-violet-400/[0.04] p-4">
          <div>
            <h3 className="text-[13px] font-semibold text-white/80">
              {t('apiSettings.cli.lightX2V.title', '本地推理配置')}
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
              {t(
                'apiSettings.cli.lightX2V.description',
                '路径仅保存在本机浏览器配置中，并以参数数组传给固定的 LightX2V 适配器。',
              )}
            </p>
          </div>
          {[
            [
              'executablePath',
              t('apiSettings.cli.lightX2V.pythonExecutable', 'Python 解释器'),
              t(
                'apiSettings.cli.lightX2V.pythonExecutablePlaceholder',
                '例如 C:\\miniconda3\\envs\\lightx2v\\python.exe',
              ),
            ],
            [
              'workingDirectory',
              t('apiSettings.cli.lightX2V.workingDirectory', 'LightX2V 工作目录'),
              t('apiSettings.cli.lightX2V.workingDirectoryPlaceholder', '例如 D:\\AI\\LightX2V'),
            ],
            [
              'imageModelPath',
              t('apiSettings.cli.lightX2V.imageModelPath', '图片模型目录'),
              t('apiSettings.cli.lightX2V.imageModelPathPlaceholder', 'Qwen-Image 等模型权重目录'),
            ],
            [
              'imageModelClass',
              t('apiSettings.cli.lightX2V.imageModelClass', '图片模型类型'),
              t('apiSettings.cli.lightX2V.imageModelClassPlaceholder', '例如 qwen-image-2512'),
            ],
            [
              'imageTask',
              t('apiSettings.cli.lightX2V.imageTask', '图片任务类型'),
              t('apiSettings.cli.lightX2V.imageTaskPlaceholder', 't2i 或 i2i'),
            ],
            [
              'imageConfigPath',
              t('apiSettings.cli.lightX2V.imageConfigPath', '图片 config_json'),
              t(
                'apiSettings.cli.lightX2V.imageConfigPathPlaceholder',
                '官方图片生成 JSON 配置文件',
              ),
            ],
            [
              'videoModelPath',
              t('apiSettings.cli.lightX2V.videoModelPath', '视频模型目录'),
              t(
                'apiSettings.cli.lightX2V.videoModelPathPlaceholder',
                'Wan / HunyuanVideo 等模型权重目录',
              ),
            ],
            [
              'videoModelClass',
              t('apiSettings.cli.lightX2V.videoModelClass', '视频模型类型'),
              t('apiSettings.cli.lightX2V.videoModelClassPlaceholder', '默认 wan2.2_moe'),
            ],
            [
              'videoTask',
              t('apiSettings.cli.lightX2V.videoTask', '视频任务类型'),
              t('apiSettings.cli.lightX2V.videoTaskPlaceholder', 't2v 或 i2v'),
            ],
            [
              'videoConfigPath',
              t('apiSettings.cli.lightX2V.videoConfigPath', '视频 config_json'),
              t(
                'apiSettings.cli.lightX2V.videoConfigPathPlaceholder',
                '官方视频生成 JSON 配置文件',
              ),
            ],
          ].map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[11px] font-medium text-white/50">{label}</span>
              <input
                type="text"
                value={
                  provider.cliConfig?.[key as keyof NonNullable<ProviderConnection['cliConfig']>] ??
                  ''
                }
                onChange={(event) =>
                  onCliConfig(
                    key as keyof NonNullable<ProviderConnection['cliConfig']>,
                    event.target.value,
                  )
                }
                placeholder={placeholder}
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 font-mono text-[12px] text-white/75 outline-none placeholder:text-white/25 focus:border-violet-300/25"
              />
            </label>
          ))}
        </section>
      )}

      {/* ── Base URL (labeled "本地桥地址") ── */}
      <div>
        <label className="mb-1 block text-[12px] font-medium text-white/50">
          {t('apiSettings.cli.bridgeUrl', '本地桥地址')}
        </label>
        <input
          type="text"
          value={provider.baseUrl}
          onChange={(e) => onBaseUrl(e.target.value)}
          placeholder={BRIDGE_V1_BASE_URL}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.16]"
        />
        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-white/35">
          <span>{t('apiSettings.protocol', '接入协议')}</span>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/60">
            {isGemini ? 'agy' : isVolcengineCli ? 'arkcli' : provider.protocol}
          </span>
          <span className="text-white/30">
            {t('apiSettings.cli.allowlistOnly', '仅调用白名单 CLI，不执行自定义命令')}
          </span>
        </div>
      </div>

      {/* ── Model list with codex reasoning effort ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium text-white/50">
              {t('apiSettings.modelList', '模型列表')}
            </p>
            <p className="text-[11px] text-white/30">
              {historical
                ? t(
                    'apiSettings.cli.models.historicalSnapshot',
                    '以下为上次验证保留的模型记录，正在等待后台复核；不代表本次会话已实时连接。',
                  )
                : connected
                  ? isVolcengineCli
                    ? t(
                        'apiSettings.cli.models.volcengineIdentityReady',
                        '官方 Ark CLI 已安装并通过身份验证；画布生成适配器尚未启用。',
                      )
                    : isJimeng || isBailian || isLightX2V
                      ? t(
                          'apiSettings.cli.models.generationModelsAvailable',
                          '已通过真实连接检测；以下官方模型已开放到图片和视频节点',
                        )
                      : isWorkBuddy
                        ? t(
                            'apiSettings.cli.models.workBuddyModelsLoaded',
                            '已读取当前 WorkBuddy CLI 版本支持的 {count} 个文本模型',
                            { count: provider.models.chat.length },
                          )
                        : isCodex
                          ? t(
                              'apiSettings.cli.models.codexReasoningAvailable',
                              '已通过真实连接检测；Codex 模型可设推理强度',
                            )
                          : t(
                              'apiSettings.cli.models.textModelsLoaded',
                              '已读取当前 CLI 的可用文本模型',
                            )
                  : isWorkBuddy
                    ? t(
                        'apiSettings.cli.models.workBuddyClosed',
                        '当前没有活动 WorkBuddy 会话；模型已隐藏，请打开 WorkBuddy 后重新检测。',
                      )
                    : isGemini
                      ? t(
                          'apiSettings.cli.models.antigravityUnavailable',
                          'Antigravity 尚未通过 agy 登录检测；模型已隐藏，完成登录后请重新检测。',
                        )
                      : t(
                          'apiSettings.cli.models.cachedOnly',
                          '以下仅为预设或缓存模型，连接成功前不会出现在节点模型选择中',
                        )}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onDetect()}
              disabled={detecting}
              className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-[12px] text-white/70 hover:bg-white/15 disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${detecting ? 'animate-spin' : ''}`} />
              {isVolcengineCli
                ? t('common.checkAgain', '重新检测')
                : t('apiSettings.pullModels', '拉取模型')}
            </button>
            {!isVolcengineCli &&
              !isJimeng &&
              !isWorkBuddy &&
              !isGemini &&
              !isBailian &&
              !isLightX2V && (
                <InlineAddModel
                  onAdd={(v) => onAddModel('chat', v)}
                  placeholder={t('apiSettings.chatModelPlaceholder', '输入对话模型…')}
                />
              )}
          </div>
        </div>

        {(['chat', 'image', 'video', 'audio'] as ProviderModelKind[]).map((kind) => {
          const meta = {
            chat: {
              zh: t('apiSettings.modelKind.chat', '对话 / 剧本模型'),
              code: 'CHAT',
            },
            image: {
              zh: t('apiSettings.modelKind.image', '图片生成模型'),
              code: 'IMAGE',
            },
            video: {
              zh: t('apiSettings.modelKind.video', '视频生成模型'),
              code: 'VIDEO',
            },
            audio: {
              zh: t('apiSettings.modelKind.audio', '音乐 / 音频生成模型'),
              code: 'AUDIO',
            },
            '3d': {
              zh: t('apiSettings.modelKind.3d', '3D 生成模型'),
              code: '3D',
            },
          }[kind];
          const models =
            (isCodex || isVolcengineCli || isWorkBuddy || isGemini) && !connected
              ? []
              : (provider.models[kind] ?? []);
          // Some CLIs don't support certain categories
          const unsupported =
            kind === 'audio' ||
            isVolcengineCli ||
            (isGemini && kind !== 'chat') ||
            (isWorkBuddy && kind === 'image' && !cliStatus.imageGeneration) ||
            (isWorkBuddy && kind === 'video') ||
            (isCodex && kind === 'video') ||
            ((isJimeng || isBailian || isLightX2V) && kind === 'chat');

          return (
            <div key={kind} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  {meta.code} · {meta.zh}
                </span>
                {!unsupported &&
                  !isVolcengineCli &&
                  !isJimeng &&
                  !isWorkBuddy &&
                  !isGemini &&
                  !isBailian &&
                  !isLightX2V && (
                    <InlineAddModel
                      onAdd={(v) => onAddModel(kind, v)}
                      placeholder={t('apiSettings.modelKindPlaceholder', '输入{kind}…', {
                        kind: meta.zh,
                      })}
                    />
                  )}
              </div>

              {unsupported ? (
                <p className="py-1 text-[12px] text-white/30">
                  {t(
                    'apiSettings.cli.models.unsupportedKind',
                    '当前 CLI 没有接入这类生成任务，请选择其它可用平台。',
                  )}
                </p>
              ) : models.length ? (
                <div className="space-y-1">
                  {models.map((model) => {
                    const showReasoning = isCodex && kind === 'chat';
                    const advertisedEfforts = provider.modelCapabilities?.[model]?.reasoningEfforts;
                    const reasoningEfforts: ProviderReasoningEffort[] = advertisedEfforts?.length
                      ? ['auto', ...advertisedEfforts]
                      : DEFAULT_REASONING_EFFORTS;
                    return (
                      <div
                        key={model}
                        className={`group flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 ${showReasoning ? 'flex-wrap' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => onModel(kind, model)}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                            models[0] === model
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-white/20 text-transparent hover:border-white/40'
                          }`}
                          title={
                            models[0] === model
                              ? t('apiSettings.defaultModel', '默认模型')
                              : t('apiSettings.setDefaultModel', '设为默认')
                          }
                        >
                          ★
                        </button>
                        <ProviderBrandIcon
                          providerId={provider.id}
                          providerName={provider.name}
                          mark={provider.mark}
                          accent={provider.accent}
                          className="h-5 w-5"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] text-white/70">
                            {provider.modelCapabilities?.[model]?.displayName ?? model}
                          </span>
                          {provider.modelCapabilities?.[model]?.displayName && (
                            <code className="block truncate text-[10px] text-white/30">
                              {model}
                            </code>
                          )}
                        </div>
                        {showReasoning && (
                          <label className="ml-auto flex items-center gap-1 text-[11px]">
                            <span className="text-white/40">
                              {t('apiSettings.reasoning', '推理')}
                            </span>
                            <select
                              className="rounded border border-white/[0.1] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-white outline-none"
                              value={provider.modelReasoningEfforts?.[model] ?? 'auto'}
                              onChange={(e) => props.onReasoningEffort?.(model, e.target.value)}
                            >
                              {reasoningEfforts.map((eff) => (
                                <option key={eff} value={eff} className="bg-[#1a1a1c]">
                                  {t(`apiSettings.reasoningEffort.${eff}`, reasoningLabel(eff))}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {!isVolcengineCli && !isJimeng && !isBailian && !isLightX2V && (
                          <button
                            type="button"
                            onClick={() => onRemoveModel(kind, model)}
                            className="text-white/25 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-1 text-[12px] text-white/25">
                  {isVolcengineCli
                    ? t(
                        'apiSettings.cli.models.volcengineManagementOnly',
                        '官方 Ark CLI 已接入安装与检测，当前尚不提供画布生成模型。',
                      )
                    : isJimeng || isBailian || isLightX2V
                      ? t(
                          'apiSettings.cli.models.noneAfterLogin',
                          '尚未检测到可用模型，请完成登录后点击「拉取模型」。',
                        )
                      : t(
                          'apiSettings.cli.models.noneConfigured',
                          '暂无模型，可手动添加或点击「拉取模型」。',
                        )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Setup guide */}
      <button
        type="button"
        onClick={onGuide}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-2 text-[13px] text-white/55 hover:bg-white/[0.05]"
      >
        <BookOpen className="h-3.5 w-3.5" />
        {t('apiSettings.setupHelp', '设置帮助')}
      </button>
    </div>
  );
}
