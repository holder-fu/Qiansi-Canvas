import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  Check,
  Coffee,
  Copy,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  Grid3X3,
  HardDrive,
  Info,
  Keyboard,
  Languages,
  Palette,
  PanelTopOpen,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { BRIDGE_BASE_URL } from '../lib/bridgeUrl';
import kofiSupportCode from '../assets/about/kofi-support.png';
import wechatSupportCode from '../assets/about/wechat-support.jpg';
import { fetchLocalComfyUiStatus, type LocalComfyUiStatus } from '../lib/comfyWorkflow';
import { readModelFavorite } from '../lib/modelFavorites';
import {
  buildSafeDiagnosticReport,
  fetchBridgeHealth,
  formatBytes,
  probeBrowserStorage,
  type BridgeHealth,
  type BrowserStorageProbe,
  type CliToolKey,
  type SafeDiagnosticReport,
} from '../lib/runtimeDiagnostics';
import {
  loadCanvasThemeFile,
  loadCanvasThemeLibrary,
  type CanvasThemeLibrary,
} from '../services/canvasThemeLibrary';
import { VIDEO_GENERATION_DURATION_OPTIONS } from '../lib/videoGenerationMode';
import {
  checkSystemUpdate,
  downloadSystemUpdate,
  loadSystemUpdateStatus,
  prepareSystemRollback,
  summarizeSystemUpdateConnectivity,
  testSystemUpdateNetwork,
  type CheckedUpdateSource,
  type SystemUpdateCheck,
  type SystemUpdateStatus,
} from '../services/systemUpdate';
import {
  loadCommunityStatus,
  probeCommunityConnection,
  type CommunityConnectivity,
} from '../services/communityClient';
import { flushCanvasPersistence, useCanvasStore, type GenParams } from '../store/canvasStore';
import { usePluginRegistryStore } from '../store/pluginRegistryStore';
import { usePluginUiStore } from '../store/pluginUiStore';
import {
  useCanvasPreferences,
  normalizeUserName,
  type AutosaveDelay,
  type GenerationSoundKind,
  type GenerationLimitKey,
  MAX_DEFAULT_ZOOM,
  MIN_DEFAULT_ZOOM,
  type MiniMapPosition,
  type StartupTarget,
  type ToolbarControlId,
  type ToolbarMode,
  type ToolbarModes,
  type WheelMode,
} from '../store/canvasPreferences';
import { markConfiguredUserNameEdited, persistConfiguredUserName } from '../lib/userProfileSync';
import { persistGenerationLimits } from '../lib/generationLimitsSync';
import {
  GENERATION_LIMIT_RANGES,
  normalizeGenerationLimit,
} from '../lib/generationLimitsContract.mjs';
import {
  loadGenerationSoundCatalog,
  playGenerationCompleteSound,
  soundEnabledPreferenceKey,
  soundPreferenceKey,
  type GenerationSoundCatalog,
} from '../services/generationSound';
import {
  resolveCanvasTheme,
  useCanvasThemeStore,
  type ThemeScope,
} from '../store/canvasThemeStore';
import {
  DEFAULT_CANVAS_THEME,
  type CanvasTheme,
  type CanvasThemeTokens,
} from '../theme/canvasTheme';
import { createThemeZip, parseThemeZip } from '../theme/themeZip';
import { ApiSettingsPanel } from './ApiSettingsPanel';
import { PluginDeveloperHelp } from './PluginDeveloperHelp';
import { SHORTCUT_GROUPS } from './shortcutGroups';
import {
  englishTranslationTemplate,
  useAppTranslation,
  useAvailableAppLanguages,
} from '../i18n/appI18n';

type SettingsSectionId =
  | 'general'
  | 'language'
  | 'canvas'
  | 'appearance'
  | 'shortcuts'
  | 'sound'
  | 'community'
  | 'ai-api'
  | 'comfyui'
  | 'generation'
  | 'local-tools'
  | 'canvas-save'
  | 'storage'
  | 'diagnostics'
  | 'plugins'
  | 'about'
  | 'system-update';

type SettingsItem = {
  id: SettingsSectionId;
  label: string;
  labelKey: string;
  icon: LucideIcon;
  keywords: string;
};

const SETTINGS_GROUPS: { label: string; labelKey: string; items: SettingsItem[] }[] = [
  {
    label: '基础',
    labelKey: 'settings.group.basic',
    items: [
      {
        id: 'general',
        label: '常规',
        labelKey: 'settings.general',
        icon: Settings,
        keywords: '启动 自动保存 删除 恢复',
      },
      {
        id: 'language',
        label: '语言',
        labelKey: 'settings.language',
        icon: Languages,
        keywords: '语言 Language English 日本語 한국어 Español Français Deutsch Русский',
      },
      {
        id: 'canvas',
        label: '画布与交互',
        labelKey: 'settings.canvas',
        icon: Grid3X3,
        keywords: '网格 吸附 缩放 鼠标 连接线 节点',
      },
      {
        id: 'appearance',
        label: '外观',
        labelKey: 'settings.appearance',
        icon: Palette,
        keywords: '主题 深色 画布 背景 显示',
      },
      {
        id: 'shortcuts',
        label: '快捷键',
        labelKey: 'settings.shortcuts',
        icon: Keyboard,
        keywords: '键盘 撤销 重做 复制 粘贴',
      },
      {
        id: 'sound',
        label: '声音与通知',
        labelKey: 'settings.sound',
        icon: Volume2,
        keywords: '声音 提示音 生成完成 素材 图片 视频',
      },
    ],
  },
  {
    label: 'AI 与生成',
    labelKey: 'settings.group.ai',
    items: [
      {
        id: 'ai-api',
        label: 'AI 模型',
        labelKey: 'settings.models',
        icon: Bot,
        keywords: '模型 API 密钥 CLI 图片 视频 文本',
      },
      {
        id: 'comfyui',
        label: 'ComfyUI',
        labelKey: 'settings.comfyui',
        icon: Server,
        keywords: 'ComfyUI 本地 工作流 API 8188',
      },
      {
        id: 'generation',
        label: '生成默认值',
        labelKey: 'settings.generation',
        icon: Sparkles,
        keywords: '比例 分辨率 时长 张数 画质 喜欢',
      },
      {
        id: 'local-tools',
        label: '本地工具',
        labelKey: 'settings.localTools',
        icon: Wrench,
        keywords: 'CLI ComfyUI 本地桥 工具',
      },
    ],
  },
  {
    label: '扩展',
    labelKey: 'settings.group.extensions',
    items: [
      {
        id: 'plugins',
        label: '插件',
        labelKey: 'settings.plugins',
        icon: Puzzle,
        keywords: '插件 节点 扩展 导入 启用 第三方',
      },
    ],
  },
  {
    label: '画布与数据',
    labelKey: 'settings.group.data',
    items: [
      {
        id: 'canvas-save',
        label: '画布与自动保存',
        labelKey: 'settings.canvasSave',
        icon: FolderOpen,
        keywords: '画布 标签 自动保存',
      },
      {
        id: 'storage',
        label: '存储与清理',
        labelKey: 'settings.storage',
        icon: Database,
        keywords: '缓存 素材 回收站 清理 占用',
      },
    ],
  },
  {
    label: '系统',
    labelKey: 'settings.group.system',
    items: [
      {
        id: 'diagnostics',
        label: '运行与诊断',
        labelKey: 'settings.diagnostics',
        icon: Gauge,
        keywords: '状态 诊断 服务 本地桥',
      },
      {
        id: 'system-update',
        label: '系统更新',
        labelKey: 'settings.systemUpdate',
        icon: RefreshCw,
        keywords: '更新 升级 检查版本',
      },
      {
        id: 'about',
        label: '关于',
        labelKey: 'settings.about',
        icon: Info,
        keywords: '版本 信息 Qiansi Canvas',
      },
    ],
  },
];

const RATIOS: GenParams['aspectRatio'][] = ['16:9', '9:16', '1:1', '3:4', '4:3'];
const RESOLUTIONS: NonNullable<GenParams['resolution']>[] = ['480P', '720P', '1080P', '2K', '4K'];
const DURATIONS = VIDEO_GENERATION_DURATION_OPTIONS;
const COUNTS: GenParams['count'][] = [1, 2, 4];
const QUALITIES: GenParams['quality'][] = ['standard', '2K', '4K'];

export function SettingsPanel({
  onClose,
  initialSection = 'general',
  initialProviderId,
}: {
  onClose: () => void;
  initialSection?: SettingsSectionId;
  initialProviderId?: string;
}) {
  const { t } = useAppTranslation();
  const [section, setSection] = useState<SettingsSectionId>(initialSection);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      SETTINGS_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.label} ${t(item.labelKey, item.label)} ${item.keywords}`
            .toLowerCase()
            .includes(normalizedQuery),
        ),
      })).filter((group) => group.items.length > 0),
    [normalizedQuery, t],
  );

  return (
    <div
      data-theme-role="modal-backdrop"
      className="fixed inset-0 z-[59] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onPointerDown={onClose}
      role="presentation"
    >
      <section
        data-theme-role="modal-surface"
        className="flex h-full w-full max-w-[1180px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#171719] shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
      >
        <aside
          data-theme-role="library-sidebar"
          className="flex w-64 shrink-0 flex-col border-r border-white/[0.08] bg-[#131315] p-3"
        >
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('settings.search')}
              className="h-9 w-full rounded-xl border border-white/[0.12] bg-white/[0.06] pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-white/25"
            />
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto" aria-label={t('settings.navigation')}>
            {filteredGroups.map((group) => (
              <div key={group.labelKey} className="mb-4">
                <p className="mb-1 px-2 text-[9px] font-medium text-white/30">
                  {t(group.labelKey, group.label)}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = section === item.id;
                    return (
                      <button
                        key={item.id}
                        data-theme-role="settings-nav-item"
                        data-active={active ? 'true' : 'false'}
                        type="button"
                        onClick={() => setSection(item.id)}
                        aria-label={t(item.labelKey, item.label)}
                        className={`flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-amber-400/50 ${
                          active
                            ? 'bg-white/[0.1] font-medium text-white'
                            : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{t(item.labelKey, item.label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredGroups.length === 0 && (
              <p className="px-2 py-8 text-center text-[12px] text-white/30">
                {t('settings.empty')}
              </p>
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-theme-role="modal-titlebar"
            className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-5"
          >
            <div className="flex items-center gap-2">
              <Settings data-theme-role="settings-brand-icon" className="h-4 w-4 text-amber-400" />
              <span className="text-[15px] font-medium text-white/90">{t('settings.title')}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t('settings.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {section === 'ai-api' || section === 'comfyui' ? (
            <ApiSettingsPanel
              embedded
              onClose={onClose}
              initialProviderId={section === 'comfyui' ? 'comfyui-local' : initialProviderId}
            />
          ) : (
            <SettingsContent section={section} onNavigate={setSection} onClose={onClose} />
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsContent({
  section,
  onNavigate,
  onClose,
}: {
  section: Exclude<SettingsSectionId, 'ai-api' | 'comfyui'>;
  onNavigate: (section: SettingsSectionId) => void;
  onClose: () => void;
}) {
  if (section === 'general') return <GeneralSettings />;
  if (section === 'language') return <LanguageSettings />;
  if (section === 'canvas') return <CanvasSettings />;
  if (section === 'generation') return <GenerationSettings onNavigate={onNavigate} />;
  if (section === 'appearance') return <AppearanceSettings />;
  if (section === 'sound') return <SoundSettings />;
  if (section === 'community') return <CommunitySettings />;
  if (section === 'local-tools') return <LocalToolsSettings onNavigate={onNavigate} />;
  if (section === 'canvas-save') return <CanvasSaveSettings />;
  if (section === 'storage') return <StorageSettings onClose={onClose} />;
  if (section === 'diagnostics') return <DiagnosticsSettings />;
  if (section === 'plugins') return <PluginSettings />;
  if (section === 'about') return <AboutSettings />;
  if (section === 'system-update') return <SystemUpdateSettings />;
  return <ShortcutSettings />;
}

function SoundSettings() {
  const { t } = useAppTranslation();
  const enabled = useCanvasPreferences((state) => state.generationSoundEnabled);
  const volume = useCanvasPreferences((state) => state.generationSoundVolume);
  const imageSound = useCanvasPreferences((state) => state.imageGenerationSound);
  const videoSound = useCanvasPreferences((state) => state.videoGenerationSound);
  const audioSound = useCanvasPreferences((state) => state.audioGenerationSound);
  const textSound = useCanvasPreferences((state) => state.textGenerationSound);
  const imageSoundEnabled = useCanvasPreferences((state) => state.imageGenerationSoundEnabled);
  const videoSoundEnabled = useCanvasPreferences((state) => state.videoGenerationSoundEnabled);
  const audioSoundEnabled = useCanvasPreferences((state) => state.audioGenerationSoundEnabled);
  const textSoundEnabled = useCanvasPreferences((state) => state.textGenerationSoundEnabled);
  const setPreference = useCanvasPreferences((state) => state.setPreference);
  const [catalog, setCatalog] = useState<GenerationSoundCatalog>();
  const [catalogError, setCatalogError] = useState<string>();
  const [testing, setTesting] = useState<GenerationSoundKind>();

  const refreshCatalog = () => {
    setCatalogError(undefined);
    void loadGenerationSoundCatalog()
      .then(setCatalog)
      .catch((error) =>
        setCatalogError(
          error instanceof Error
            ? error.message
            : t('settingsPage.sound.error.catalogRead', '提示音目录读取失败。'),
        ),
      );
  };

  useEffect(refreshCatalog, [t]);

  const enableSound = () => {
    const next = !enabled;
    setPreference('generationSoundEnabled', next);
  };

  const selectedSound = (kind: GenerationSoundKind) =>
    kind === 'video'
      ? videoSound
      : kind === 'audio'
        ? audioSound
        : kind === 'text'
          ? textSound
          : imageSound;

  const isSoundEnabled = (kind: GenerationSoundKind) =>
    kind === 'video'
      ? videoSoundEnabled
      : kind === 'audio'
        ? audioSoundEnabled
        : kind === 'text'
          ? textSoundEnabled
          : imageSoundEnabled;

  const testSound = (kind: GenerationSoundKind) => {
    setTesting(kind);
    void playGenerationCompleteSound(selectedSound(kind), volume).then((played) => {
      if (!played)
        setCatalogError(
          t(
            'settingsPage.sound.error.playback',
            '提示音无法播放。请确认本地桥已启动，且所选文件仍在提示音目录中。',
          ),
        );
      setTesting(undefined);
    });
  };

  return (
    <Page
      title={t('settings.sound', '声音与通知')}
      description={t(
        'settingsPage.sound.description',
        '为真正生成出新素材的 AI 节点提供完成提示。',
      )}
    >
      <Section title={t('settingsPage.sound.section.notifications', '生成完成提示')}>
        <SettingRow
          title={t('settingsPage.sound.completionSound', '生成完成提示音')}
          description={t(
            'settingsPage.sound.completionSoundDescription',
            '各类 AI 节点成功写入新素材或文本结果后播放一次；默认关闭。',
          )}
        >
          <Toggle
            checked={enabled}
            onChange={enableSound}
            label={t('settingsPage.sound.completionSound', '生成完成提示音')}
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.sound.volume', '提示音音量')}
          description={t('settingsPage.sound.volumeDescription', '调整完成提示的响度。')}
        >
          <label className="flex w-36 items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(volume * 100)}
              onChange={(event) =>
                setPreference('generationSoundVolume', Number(event.target.value) / 100)
              }
              aria-label={t('settingsPage.sound.volume', '提示音音量')}
              className="w-24 accent-amber-400"
            />
            <span className="w-8 text-right text-[12px] text-white/55">
              {Math.round(volume * 100)}%
            </span>
          </label>
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.sound.section.localFiles', '本地提示音文件')}>
        <SettingRow
          title={t('settingsPage.sound.directory', '声音存放目录')}
          description={
            catalog?.directory ??
            t('settingsPage.sound.loadingDirectory', '正在读取本地提示音目录…')
          }
        >
          <ActionButton onClick={refreshCatalog}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('common.refresh', '刷新')}
          </ActionButton>
        </SettingRow>
        <div className="px-4 py-3 text-[12px] leading-relaxed text-white/40">
          {t(
            'settingsPage.sound.supportedFiles',
            '支持 .wav、.mp3、.ogg、.m4a。可将多个文件直接放入此目录，刷新后分别为图片、视频、音频或文本完成提示选择。',
          )}
        </div>
        {(['image', 'video', 'audio', 'text'] as const).map((kind) => {
          const label =
            kind === 'image'
              ? t('settingsPage.sound.kind.image', '图片生成完成')
              : kind === 'video'
                ? t('settingsPage.sound.kind.video', '视频生成完成')
                : kind === 'audio'
                  ? t('settingsPage.sound.kind.audio', '音频生成完成')
                  : t('settingsPage.sound.kind.text', '文本生成完成');
          const value = selectedSound(kind);
          return (
            <SettingRow
              key={kind}
              title={label}
              description={t(
                'settingsPage.sound.kindDescription',
                '选择该类型节点成功生成素材后实际播放的文件。',
              )}
            >
              <div className="flex items-center gap-2">
                <Toggle
                  checked={isSoundEnabled(kind)}
                  onChange={() =>
                    setPreference(soundEnabledPreferenceKey(kind), !isSoundEnabled(kind))
                  }
                  label={t('settingsPage.sound.kindToggleAria', '{label}提示音开关', { label })}
                />
                <select
                  value={value}
                  onChange={(event) => setPreference(soundPreferenceKey(kind), event.target.value)}
                  disabled={!catalog?.items.length}
                  aria-label={t('settingsPage.sound.kindSelectAria', '{label}提示音', { label })}
                  style={{ colorScheme: 'dark' }}
                  className="max-w-40 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-[12px] text-white/75 outline-none disabled:opacity-45"
                >
                  {!catalog?.items.some((item) => item.name === value) && (
                    <option value={value} className="bg-[#202022] text-white">
                      {value}
                    </option>
                  )}
                  {catalog?.items.map((item) => (
                    <option key={item.name} value={item.name} className="bg-[#202022] text-white">
                      {item.name}
                    </option>
                  ))}
                </select>
                <ActionButton onClick={() => testSound(kind)} disabled={testing === kind || !value}>
                  <Volume2 className="h-3.5 w-3.5" />
                  {testing === kind
                    ? t('settingsPage.sound.playing', '播放中…')
                    : t('settingsPage.sound.preview', '试听')}
                </ActionButton>
              </div>
            </SettingRow>
          );
        })}
      </Section>
      <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-sky-100/60">
        {t(
          'settingsPage.sound.behaviorNotice',
          '总开关和对应类型开关都开启时才会提示。只有本次 AI 请求成功写入新的图片、视频、音频素材，或文本节点成功写入文本结果时才会播放；生成失败、恢复旧画布和导入文件不会播放。',
        )}
      </div>
      {catalogError && <InlineNotice kind="error">{catalogError}</InlineNotice>}
    </Page>
  );
}

function Page({
  title,
  description,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main data-theme-role="modal-content" className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto w-full px-8 py-8 ${wide ? 'max-w-[900px]' : 'max-w-[760px]'}`}>
        <h1 className="text-2xl font-semibold tracking-tight text-white/95">{title}</h1>
        <p className="mt-1 text-[13px] text-white/40">{description}</p>
        <div className="mt-8 space-y-6">{children}</div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-theme-role="settings-section">
      <h2 className="mb-2 text-[13px] font-medium text-white/65">{title}</h2>
      <div
        data-theme-role="settings-section-surface"
        className="divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.035]"
      >
        {children}
      </div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
  stacked = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      data-theme-role="settings-row"
      className={`flex min-h-16 px-4 py-3 ${
        stacked ? 'flex-col items-stretch gap-3' : 'items-center justify-between gap-5'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white/85">{title}</p>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-white/35">{description}</p>
        )}
      </div>
      {children && <div className={stacked ? 'min-w-0 w-full' : 'shrink-0'}>{children}</div>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      data-theme-role="settings-toggle"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-6 w-11 rounded-full border transition-colors ${
        checked ? 'border-amber-400/50 bg-amber-400/80' : 'border-white/15 bg-white/10'
      } disabled:cursor-not-allowed disabled:opacity-45`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
  format = String,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  format?: (value: T) => string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          data-theme-role="settings-choice"
          data-active={value === option}
          onClick={() => onChange(option)}
          className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
            value === option
              ? 'border-amber-400/35 bg-amber-400/15 text-amber-200'
              : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/75'
          }`}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}

function BoundedNumberInput({
  value,
  min,
  max,
  ariaLabel,
  suffix,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  suffix: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : value;
    setDraft(String(next));
    onCommit(next);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(String(value));
            event.preventDefault();
          }
        }}
        className="h-9 w-24 rounded-lg border border-white/10 bg-white/5 px-3 text-right text-[13px] tabular-nums text-white/85 outline-none focus:border-emerald-400/35"
      />
      <span className="w-14 text-[11px] text-white/35">{suffix}</span>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        danger
          ? 'border-rose-400/15 bg-rose-400/[0.07] text-rose-200/75 hover:bg-rose-400/[0.12]'
          : 'border-white/[0.08] bg-white/[0.07] text-white/70 hover:bg-white/[0.12] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ResultBadge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] ${
        ok
          ? 'border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300/80'
          : 'border-amber-400/15 bg-amber-400/[0.08] text-amber-200/75'
      }`}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

function InlineNotice({ kind, children }: { kind: 'success' | 'error'; children: ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-[12px] leading-relaxed ${
        kind === 'success'
          ? 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-200/75'
          : 'border-rose-400/15 bg-rose-400/[0.06] text-rose-200/75'
      }`}
    >
      {kind === 'success' ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

type AppTranslator = ReturnType<typeof useAppTranslation>['t'];

function toolbarModeLabel(mode: ToolbarMode, t: AppTranslator): string {
  if (mode === 'auto-hide') return t('settingsPage.canvas.toolbar.mode.autoHide', '靠边收起');
  if (mode === 'hidden') return t('settingsPage.canvas.toolbar.mode.hidden', '隐藏');
  return t('settingsPage.canvas.toolbar.mode.visible', '显示');
}

type ToolbarControlDefinition = {
  id: ToolbarControlId;
  label: string;
  description: string;
  previewLabel?: string;
};
type ToolbarSettingTarget = ToolbarControlId | 'system-settings';

const TOP_LEFT_TOOLBAR_CONTROLS: ToolbarControlDefinition[] = [
  { id: 'top-undo', label: '撤销', description: '画布左上角的撤销按钮。' },
  { id: 'top-redo', label: '重做', description: '画布左上角的重做按钮。' },
  {
    id: 'top-group',
    label: '节点分组',
    previewLabel: '分组',
    description: '画布左上角的节点分组按钮。',
  },
];
const TOP_RIGHT_TOOLBAR_CONTROLS: ToolbarControlDefinition[] = [
  { id: 'top-ai-skill', label: 'AI SKILL', description: '画布右上角的 AI SKILL 入口。' },
];
const BOTTOM_LEFT_TOOLBAR_CONTROLS: ToolbarControlDefinition[] = [
  {
    id: 'bottom-assets',
    label: '资产管理',
    previewLabel: '资产',
    description: '画布左下角的资产库入口。',
  },
  {
    id: 'bottom-snap',
    label: '节点吸附',
    previewLabel: '吸附',
    description: '画布左下角的节点对齐吸附开关。',
  },
  {
    id: 'bottom-edges',
    label: '节点连线',
    previewLabel: '连线',
    description: '画布左下角的节点连线显示开关。',
  },
  {
    id: 'bottom-search',
    label: '节点搜索',
    previewLabel: '搜索',
    description: '画布左下角的节点搜索入口。',
  },
  {
    id: 'bottom-layers',
    label: '图层管理',
    previewLabel: '图层',
    description: '画布左下角的图层管理入口。',
  },
  { id: 'bottom-fullscreen', label: '全屏', description: '画布左下角的全屏切换按钮。' },
  {
    id: 'bottom-zoom-menu',
    label: '缩放比例',
    previewLabel: '100%',
    description: '画布左下角的当前缩放比例菜单。',
  },
];
const BOTTOM_CENTER_TOOLBAR_CONTROLS: ToolbarControlDefinition[] = [
  { id: 'bottom-style-library', label: '风格库', description: '画布底部中央的风格库入口。' },
  { id: 'bottom-effects-library', label: '特效库', description: '画布底部中央的特效库入口。' },
  { id: 'bottom-character-library', label: '角色库', description: '画布底部中央的角色库入口。' },
  { id: 'bottom-prompt-library', label: '提示词', description: '画布底部中央的提示词入口。' },
];
const BOTTOM_RIGHT_TOOLBAR_CONTROLS: ToolbarControlDefinition[] = [
  { id: 'bottom-zoom-out', label: '缩小', description: '画布右下角的缩小按钮。' },
  { id: 'bottom-zoom-in', label: '放大', description: '画布右下角的放大按钮。' },
  {
    id: 'bottom-fit-view',
    label: '适应画布',
    previewLabel: '适应',
    description: '画布右下角的适应全部节点按钮。',
  },
  {
    id: 'bottom-reset-view',
    label: '重置视图',
    previewLabel: '复位',
    description: '画布右下角的视图复位按钮。',
  },
  { id: 'bottom-shortcuts', label: '快捷键', description: '画布右下角的快捷键说明入口。' },
  { id: 'bottom-trash', label: '回收站', description: '画布右下角的回收站入口。' },
];

function ToolbarPreviewItem({
  control,
  mode,
  edge,
  onJump,
}: {
  control: ToolbarControlDefinition;
  mode: ToolbarMode;
  edge: 'top' | 'bottom';
  onJump: (id: ToolbarControlId) => void;
}) {
  const { t } = useAppTranslation();
  const label = t(`settingsPage.canvas.toolbar.${control.id}.label`, control.label);
  const previewLabel = t(
    `settingsPage.canvas.toolbar.${control.id}.preview`,
    control.previewLabel ?? control.label,
  );
  const modeClass =
    mode === 'hidden'
      ? 'border-dashed opacity-20'
      : mode === 'auto-hide'
        ? edge === 'top'
          ? '-translate-y-4 opacity-35'
          : 'translate-y-4 opacity-35'
        : 'translate-y-0 opacity-100';
  return (
    <button
      type="button"
      onClick={() => onJump(control.id)}
      className={`rounded-md border border-white/15 bg-[#202125] px-2 py-1.5 text-[10px] whitespace-nowrap text-white/70 transition-all hover:border-amber-300/45 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/70 ${modeClass}`}
      title={t('settingsPage.canvas.toolbar.previewItemTitle', '{label}：{mode}；点击定位设置', {
        label,
        mode: toolbarModeLabel(mode, t),
      })}
      aria-label={t('settingsPage.canvas.toolbar.jumpToNamed', '定位到{label}设置', { label })}
    >
      {previewLabel}
    </button>
  );
}

function ToolbarVisibilityPreview({
  toolbarModes,
  onJump,
}: {
  toolbarModes: ToolbarModes;
  onJump: (id: ToolbarSettingTarget) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div
      className="relative h-80 overflow-hidden rounded-xl border border-white/[0.1] bg-[#111214] shadow-inner"
      style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 0.7px, transparent 0.7px)',
        backgroundSize: '14px 14px',
      }}
      aria-label={t('settingsPage.canvas.toolbar.previewAria', '画布工具栏位置预览')}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="absolute left-4 top-4 flex items-center gap-1.5">
        {TOP_LEFT_TOOLBAR_CONTROLS.map((control) => (
          <ToolbarPreviewItem
            key={control.id}
            control={control}
            mode={toolbarModes[control.id]}
            edge="top"
            onJump={onJump}
          />
        ))}
      </div>
      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onJump('system-settings')}
          className="relative flex h-7 w-7 items-center justify-center rounded-md border border-amber-300/25 bg-[#24252a] text-amber-200 transition-colors hover:border-amber-300/60 hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/70"
          title={t(
            'settingsPage.canvas.toolbar.systemSettingsTitle',
            '系统设置始终显示；点击定位说明',
          )}
          aria-label={t('settingsPage.canvas.toolbar.systemSettingsAria', '定位到系统设置说明')}
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-3 text-black">
            {t('settingsPage.canvas.toolbar.fixed', '固定')}
          </span>
        </button>
        {TOP_RIGHT_TOOLBAR_CONTROLS.map((control) => (
          <ToolbarPreviewItem
            key={control.id}
            control={control}
            mode={toolbarModes[control.id]}
            edge="top"
            onJump={onJump}
          />
        ))}
      </div>
      <div className="absolute inset-x-4 bottom-4 grid grid-cols-[1.25fr_auto_1.15fr] items-end gap-3">
        <div className="flex items-end gap-1.5">
          {BOTTOM_LEFT_TOOLBAR_CONTROLS.map((control) => (
            <ToolbarPreviewItem
              key={control.id}
              control={control}
              mode={toolbarModes[control.id]}
              edge="bottom"
              onJump={onJump}
            />
          ))}
        </div>
        <div className="flex items-end justify-center gap-1.5">
          {BOTTOM_CENTER_TOOLBAR_CONTROLS.map((control) => (
            <ToolbarPreviewItem
              key={control.id}
              control={control}
              mode={toolbarModes[control.id]}
              edge="bottom"
              onJump={onJump}
            />
          ))}
        </div>
        <div className="flex items-end justify-end gap-1.5">
          {BOTTOM_RIGHT_TOOLBAR_CONTROLS.map((control) => (
            <ToolbarPreviewItem
              key={control.id}
              control={control}
              mode={toolbarModes[control.id]}
              edge="bottom"
              onJump={onJump}
            />
          ))}
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-[10px] font-medium text-white/40">
          {t('settingsPage.canvas.toolbar.previewTitle', '无限画布位置预览')}
        </p>
        <p className="mt-1 text-[9px] text-white/20">
          {t('settingsPage.canvas.toolbar.previewDescription', '每个按钮独立控制 · 系统设置固定')}
        </p>
      </div>
    </div>
  );
}

function ToolbarControlRows({
  title,
  controls,
  toolbarModes,
  onChange,
  highlightedTarget,
}: {
  title: string;
  controls: ToolbarControlDefinition[];
  toolbarModes: ToolbarModes;
  onChange: (id: ToolbarControlId, mode: ToolbarMode) => void;
  highlightedTarget: ToolbarSettingTarget | null;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="border-t border-white/[0.06]">
      <div className="bg-white/[0.015] px-4 py-2 text-[10px] font-medium tracking-wide text-white/40">
        {title}
      </div>
      {controls.map((control) => (
        <div
          key={control.id}
          id={`toolbar-setting-${control.id}`}
          data-toolbar-setting={control.id}
          className={`scroll-m-8 transition-colors duration-300 ${
            highlightedTarget === control.id ? 'bg-amber-400/[0.1]' : ''
          }`}
        >
          <SettingRow
            title={t(`settingsPage.canvas.toolbar.${control.id}.label`, control.label)}
            description={t(
              `settingsPage.canvas.toolbar.${control.id}.description`,
              control.description,
            )}
          >
            <Choice<ToolbarMode>
              value={toolbarModes[control.id]}
              options={['visible', 'auto-hide', 'hidden']}
              onChange={(mode) => onChange(control.id, mode)}
              format={(mode) => toolbarModeLabel(mode, t)}
            />
          </SettingRow>
        </div>
      ))}
    </div>
  );
}

function GeneralSettings() {
  const userName = useCanvasPreferences((state) => state.userName);
  const startupTarget = useCanvasPreferences((state) => state.startupTarget);
  const confirmMoveToTrash = useCanvasPreferences((state) => state.confirmMoveToTrash);
  const requestRateLimit = useCanvasPreferences((state) => state.requestRateLimit);
  const generationConcurrency = useCanvasPreferences((state) => state.generationConcurrency);
  const uploadConcurrency = useCanvasPreferences((state) => state.uploadConcurrency);
  const updateConcurrency = useCanvasPreferences((state) => state.updateConcurrency);
  const imageBatchSize = useCanvasPreferences((state) => state.imageBatchSize);
  const imageGenerationConcurrency = useCanvasPreferences(
    (state) => state.imageGenerationConcurrency,
  );
  const videoGenerationConcurrency = useCanvasPreferences(
    (state) => state.videoGenerationConcurrency,
  );
  const setPreference = useCanvasPreferences((state) => state.setPreference);
  const [generationLimitNotice, setGenerationLimitNotice] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const { t } = useAppTranslation();
  const commitGenerationLimit = (key: GenerationLimitKey, value: number) => {
    setPreference(key, normalizeGenerationLimit(key, value));
    setGenerationLimitNotice(null);
    void persistGenerationLimits().then((saved) => {
      setGenerationLimitNotice({
        kind: saved ? 'success' : 'error',
        message: saved
          ? t('general.generationLimitsSaved', '设置已保存到本机 Bridge，并立即生效。')
          : t(
              'general.generationLimitsSaveFailed',
              'Bridge 暂时不可用；当前浏览器已保留这些值，重新连接后请再次确认。',
            ),
      });
    });
  };
  const numberControl = (key: GenerationLimitKey, value: number, suffix: string, label: string) => (
    <BoundedNumberInput
      value={value}
      min={GENERATION_LIMIT_RANGES[key].min}
      max={GENERATION_LIMIT_RANGES[key].max}
      ariaLabel={label}
      suffix={suffix}
      onCommit={(next) => commitGenerationLimit(key, next)}
    />
  );
  return (
    <Page title={t('general.title')} description={t('general.description')}>
      <Section title={t('general.profile', '资料作者')}>
        <SettingRow
          title={t('general.userName', '用户名')}
          description={t(
            'general.userNameDescription',
            '之后新建的风格、特效、角色和提示词会显示这个作者名；已有资料和导入资料的原作者不会被覆盖。',
          )}
        >
          <input
            type="text"
            value={userName}
            maxLength={60}
            onChange={(event) => {
              markConfiguredUserNameEdited();
              setPreference('userName', normalizeUserName(event.target.value));
            }}
            onBlur={(event) => void persistConfiguredUserName(event.target.value)}
            placeholder={t('general.userNamePlaceholder', '输入显示名称')}
            aria-label={t('general.userName', '用户名')}
            className="h-9 w-56 rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] text-white/85 outline-none placeholder:text-white/25 focus:border-emerald-400/35"
          />
        </SettingRow>
      </Section>
      <Section title={t('general.startup')}>
        <SettingRow
          title={t('general.startupTarget')}
          description={t('general.startupTargetDescription')}
        >
          <Choice<StartupTarget>
            value={startupTarget}
            options={['last-session', 'home']}
            onChange={(value) => setPreference('startupTarget', value)}
            format={(value) =>
              value === 'last-session' ? t('general.lastSession') : t('general.home')
            }
          />
        </SettingRow>
      </Section>
      <Section title={t('general.deleteBehavior', '删除行为')}>
        <SettingRow
          title={t('general.confirmMoveToTrash', '移到回收站前确认')}
          description={t(
            'general.confirmMoveToTrashDescription',
            '开启时会先显示确认提示；关闭后节点会直接进入当前画布回收站。',
          )}
        >
          <Toggle
            checked={confirmMoveToTrash}
            onChange={() => setPreference('confirmMoveToTrash', !confirmMoveToTrash)}
            label={t('general.confirmMoveToTrash', '移到回收站前确认')}
          />
        </SettingRow>
      </Section>
      <Section title={t('general.requestCapacity', '请求与并发容量')}>
        <SettingRow
          title={t('general.requestRateLimit', 'Bridge 每分钟请求额度')}
          description={t(
            'general.requestRateLimitDescription',
            '同一客户端 60 秒内可访问 Bridge API 与受管媒体的总次数；刷新素材较多的画布也会计入。',
          )}
        >
          {numberControl(
            'requestRateLimit',
            requestRateLimit,
            t('general.perMinute', '次/分钟'),
            t('general.requestRateLimit', 'Bridge 每分钟请求额度'),
          )}
        </SettingRow>
        <SettingRow
          title={t('general.generationConcurrency', '全局生成并发')}
          description={t(
            'general.generationConcurrencyDescription',
            '图片、视频、音频和文本生成共享的 Bridge 上限；提高后会增加供应商请求、费用和本机负载。',
          )}
        >
          {numberControl(
            'generationConcurrency',
            generationConcurrency,
            t('general.jobs', '个任务'),
            t('general.generationConcurrency', '全局生成并发'),
          )}
        </SettingRow>
        <SettingRow
          title={t('general.uploadConcurrency', '上传并发')}
          description={t(
            'general.uploadConcurrencyDescription',
            '素材库、预览和生成前参考素材可同时上传的任务数。',
          )}
        >
          {numberControl(
            'uploadConcurrency',
            uploadConcurrency,
            t('general.jobs', '个任务'),
            t('general.uploadConcurrency', '上传并发'),
          )}
        </SettingRow>
        <SettingRow
          title={t('general.updateConcurrency', '更新并发')}
          description={t(
            'general.updateConcurrencyDescription',
            '系统更新检查、下载或回滚可同时占用的任务数。',
          )}
        >
          {numberControl(
            'updateConcurrency',
            updateConcurrency,
            t('general.jobs', '个任务'),
            t('general.updateConcurrency', '更新并发'),
          )}
        </SettingRow>
      </Section>
      <Section title={t('general.batchGeneration', '批量生成')}>
        <SettingRow
          title={t('general.imageBatchSize', '图片单批节点数')}
          description={t(
            'general.imageBatchSizeDescription',
            '批量生成图片时，本批最多处理的已选图片生成节点；菜单会显示实际进入本批的数量。',
          )}
        >
          {numberControl(
            'imageBatchSize',
            imageBatchSize,
            t('general.nodes', '个节点'),
            t('general.imageBatchSize', '图片单批节点数'),
          )}
        </SettingRow>
        <SettingRow
          title={t('general.imageGenerationConcurrency', '图片生成并发')}
          description={t(
            'general.imageGenerationConcurrencyDescription',
            '一批图片中可同时执行的节点数；实际不会超过上面的全局生成并发。',
          )}
        >
          {numberControl(
            'imageGenerationConcurrency',
            imageGenerationConcurrency,
            t('general.jobs', '个任务'),
            t('general.imageGenerationConcurrency', '图片生成并发'),
          )}
        </SettingRow>
        <SettingRow
          title={t('general.videoGenerationConcurrency', '视频生成并发')}
          description={t(
            'general.videoGenerationConcurrencyDescription',
            '批量视频中可同时执行的节点数；更多视频会排队，且实际不会超过全局生成并发。',
          )}
        >
          {numberControl(
            'videoGenerationConcurrency',
            videoGenerationConcurrency,
            t('general.jobs', '个任务'),
            t('general.videoGenerationConcurrency', '视频生成并发'),
          )}
        </SettingRow>
      </Section>
      <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-sky-100/60">
        {t(
          'general.generationLimitsNotice',
          '数值会在离开输入框时保存并立即应用；供应商、本机 GPU 或 ComfyUI 仍可能使用更低的并发或排队限制。',
        )}
      </div>
      {generationLimitNotice && (
        <InlineNotice kind={generationLimitNotice.kind}>
          {generationLimitNotice.message}
        </InlineNotice>
      )}
    </Page>
  );
}

function LanguageSettings() {
  const language = useCanvasPreferences((state) => state.language);
  const setPreference = useCanvasPreferences((state) => state.setPreference);
  const { t } = useAppTranslation();
  const languages = useAvailableAppLanguages();
  const current = languages.find((option) => option.locale === language) ?? languages[0];

  return (
    <Page title={t('language.title')} description={t('language.description')}>
      <Section title={t('language.interface')}>
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
          {languages.map((item) => {
            const selected = language === item.locale;
            return (
              <button
                key={item.locale}
                type="button"
                onClick={() => setPreference('language', item.locale)}
                aria-pressed={selected}
                className={`flex min-h-16 items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  selected
                    ? 'border-amber-400/45 bg-amber-400/[0.12] text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.1)]'
                    : 'border-white/[0.09] bg-white/[0.035] text-white/75 hover:border-white/20 hover:bg-white/[0.075]'
                }`}
              >
                <span>
                  <span className="block text-[14px] font-medium">{item.nativeName}</span>
                  <span className="mt-0.5 block text-[10px] text-white/40">
                    {item.builtIn
                      ? t(`language.locale.${item.locale}`)
                      : t('language.pluginProvidedBy', '语言插件 · {name}', {
                          name: item.pluginName,
                        })}
                  </span>
                </span>
                <span className={`text-[9px] ${selected ? 'text-amber-200/85' : 'text-white/30'}`}>
                  {item.locale}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-sky-100/65">
        {t('language.notice')}
      </div>
      <div className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 text-[12px] text-white/55">
        {t('language.current')}{' '}
        <span className="font-medium text-white/85">{current?.nativeName ?? language}</span>
        <span className="ml-2 text-white/35">{language}</span>
      </div>
    </Page>
  );
}

function CommunitySettings() {
  const { t } = useAppTranslation();
  const [serverUrl, setServerUrl] = useState('');
  const [configured, setConfigured] = useState(false);
  const [connectivity, setConnectivity] = useState<CommunityConnectivity>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string }>();

  useEffect(() => {
    const controller = new AbortController();
    void loadCommunityStatus(controller.signal)
      .then((status) => {
        const value = status.serverUrl ?? '';
        setServerUrl(value);
        setConfigured(status.configured);
      })
      .catch((error) =>
        setNotice({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : t('settingsPage.account.error.statusRead', '无法读取素材后台配置。'),
        }),
      )
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [t]);

  const run = async () => {
    if (!configured) {
      setNotice({
        kind: 'error',
        message: t(
          'settingsPage.account.error.notConfigured',
          '素材后台地址尚未由应用部署方配置。',
        ),
      });
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await probeCommunityConnection();
      setServerUrl(result.serverUrl);
      setConnectivity(result.connectivity);
      setNotice({
        kind: 'success',
        message: t('settingsPage.account.notice.connected', '素材服务连接正常。'),
      });
    } catch (error) {
      setConnectivity(undefined);
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('settingsPage.account.error.connection', '素材后台连接失败。'),
      });
    } finally {
      setBusy(false);
    }
  };

  const providerText = connectivity
    ? [
        connectivity.authentication.providers.google && 'Google',
        connectivity.authentication.providers.wechat &&
          t('settingsPage.account.provider.wechat', '微信'),
      ]
        .filter(Boolean)
        .join(t('settingsPage.account.listSeparator', '、')) ||
      t('settingsPage.account.notConfigured', '尚未配置')
    : t('settingsPage.account.readAfterConnection', '连接后读取');
  const libraryText = connectivity?.library.kinds.length
    ? connectivity.library.kinds
        .map(
          (kind) =>
            ({
              style: t('library.target.style', '风格库'),
              effect: t('library.target.effect', '特效库'),
              character: t('library.target.character', '角色库'),
              prompt: t('library.target.prompt', '提示词库'),
            })[kind] ?? kind,
        )
        .join(t('settingsPage.account.listSeparator', '、'))
    : t('settingsPage.account.readAfterConnection', '连接后读取');

  return (
    <Page
      title={t('settings.canvasAccount', '画布账号')}
      description={t(
        'settingsPage.account.description',
        '查看画布账号服务状态，以及可用的登录和共享素材能力。',
      )}
    >
      <Section title={t('settingsPage.account.section.connection', '后台连接')}>
        <SettingRow
          title={t('settingsPage.account.serverUrl', '素材后台地址')}
          description={t(
            'settingsPage.account.serverUrlDescription',
            '该地址由应用部署方统一配置，画布用户只能查看，不能修改。',
          )}
        >
          <input
            value={serverUrl}
            readOnly
            placeholder={t('settingsPage.account.notConfiguredByDeploy', '尚未由应用部署方配置')}
            aria-label={t('settingsPage.account.serverUrl', '素材后台地址')}
            className="w-[330px] cursor-default rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2 text-[12px] text-white/55 outline-none placeholder:text-white/25"
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.account.connectionStatus', '连接状态')}
          description={
            configured
              ? t('settingsPage.account.urlLocked', '地址由应用部署配置锁定。')
              : t('settingsPage.account.serverNotConfigured', '当前安装包尚未配置素材后台地址。')
          }
        >
          <ResultBadge ok={Boolean(connectivity)}>
            {connectivity
              ? t('settingsPage.account.connectedVersion', '已连接 · v{version}', {
                  version: connectivity.serverVersion,
                })
              : configured
                ? t('settingsPage.account.pendingTest', '待检测')
                : t('settingsPage.account.notConfigured', '未配置')}
          </ResultBadge>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.account.connectionTest', '连接检测')}
          description={t(
            'settingsPage.account.connectionTestDescription',
            '只读取服务版本与能力，不会修改后台地址或账号数据。',
          )}
        >
          <ActionButton onClick={() => void run()} disabled={loading || busy || !configured}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {t('apiSettings.testConnection', '检测连接')}
          </ActionButton>
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.account.section.capabilities', '后台能力')}>
        <SettingRow
          title={t('settingsPage.account.userLogin', '用户登录')}
          description={t(
            'settingsPage.account.userLoginDescription',
            '画布只使用受限的 Bearer 会话，不接收管理员 Cookie 或第三方密钥。',
          )}
        >
          <span className="text-[12px] text-white/55">{providerText}</span>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.account.sharedLibrary', '共享素材库')}
          description={t(
            'settingsPage.account.sharedLibraryDescription',
            '仅同步管理员审核通过的内容。',
          )}
        >
          <span className="text-[12px] text-white/55">{libraryText}</span>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.account.imageUploadLimit', '图片上传上限')}
          description={t(
            'settingsPage.account.imageUploadLimitDescription',
            '最终上传仍需登录、权利确认和后台安全转码。',
          )}
        >
          <span className="text-[12px] text-white/55">
            {connectivity?.library.maxImageBytes
              ? formatBytes(connectivity.library.maxImageBytes)
              : t('settingsPage.account.readAfterConnection', '连接后读取')}
          </span>
        </SettingRow>
      </Section>
      <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-sky-100/60">
        {t(
          'settingsPage.account.securityNotice',
          '浏览器只访问本机画布桥，由本机桥连接应用部署方指定的素材服务，因此画布端口变化不会影响连接，普通用户也无法替换目标后台地址。本阶段不保存用户登录令牌；账号登录与素材上传将在安全凭据存储接入后开放。',
        )}
      </div>
      {notice && <InlineNotice kind={notice.kind}>{notice.message}</InlineNotice>}
    </Page>
  );
}

function CanvasSettings() {
  const { t } = useAppTranslation();
  const snapEnabled = useCanvasStore((state) => state.snapEnabled);
  const toggleSnapEnabled = useCanvasStore((state) => state.toggleSnapEnabled);
  const edgesVisible = useCanvasPreferences((state) => state.edgesVisible);
  const wheelMode = useCanvasPreferences((state) => state.wheelMode);
  const defaultZoom = useCanvasPreferences((state) => state.defaultZoom);
  const miniMapPosition = useCanvasPreferences((state) => state.miniMapPosition);
  const toolbarModes = useCanvasPreferences((state) => state.toolbarModes);
  const setToolbarMode = useCanvasPreferences((state) => state.setToolbarMode);
  const setPreference = useCanvasPreferences((state) => state.setPreference);
  const [highlightedToolbarTarget, setHighlightedToolbarTarget] =
    useState<ToolbarSettingTarget | null>(null);
  const [defaultZoomPercent, setDefaultZoomPercent] = useState(() =>
    String(Math.round(defaultZoom * 1000) / 10),
  );
  const toolbarHighlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setDefaultZoomPercent(String(Math.round(defaultZoom * 1000) / 10));
  }, [defaultZoom]);

  useEffect(
    () => () => {
      if (toolbarHighlightTimerRef.current !== null) {
        window.clearTimeout(toolbarHighlightTimerRef.current);
      }
    },
    [],
  );

  const jumpToToolbarSetting = (target: ToolbarSettingTarget) => {
    setHighlightedToolbarTarget(target);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`toolbar-setting-${target}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (toolbarHighlightTimerRef.current !== null) {
      window.clearTimeout(toolbarHighlightTimerRef.current);
    }
    toolbarHighlightTimerRef.current = window.setTimeout(
      () => setHighlightedToolbarTarget(null),
      1400,
    );
  };

  const commitDefaultZoom = () => {
    const parsed = Number(defaultZoomPercent);
    if (!Number.isFinite(parsed)) {
      setDefaultZoomPercent(String(Math.round(defaultZoom * 1000) / 10));
      return;
    }
    const percent =
      Math.round(Math.min(MAX_DEFAULT_ZOOM * 100, Math.max(MIN_DEFAULT_ZOOM * 100, parsed)) * 10) /
      10;
    setDefaultZoomPercent(String(percent));
    setPreference('defaultZoom', percent / 100);
  };

  return (
    <Page
      title={t('settings.canvas', '画布与交互')}
      description={t('settingsPage.canvas.description', '调整节点编辑、缩放和画布操作方式。')}
      wide
    >
      <Section title={t('settingsPage.canvas.section.nodes', '节点与连线')}>
        <SettingRow
          title={t('settingsPage.canvas.snap', '节点对齐吸附')}
          description={t(
            'settingsPage.canvas.snapDescription',
            '拖动节点时，自动吸附到其他节点的边缘和中心参考线。',
          )}
        >
          <Toggle
            checked={snapEnabled}
            onChange={toggleSnapEnabled}
            label={t('settingsPage.canvas.snap', '节点对齐吸附')}
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.canvas.edges', '显示节点连线')}
          description={t(
            'settingsPage.canvas.edgesDescription',
            '控制画布上全部节点连线的可见性。',
          )}
        >
          <Toggle
            checked={edgesVisible}
            onChange={() => setPreference('edgesVisible', !edgesVisible)}
            label={t('settingsPage.canvas.edges', '显示节点连线')}
          />
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.canvas.section.pointer', '鼠标与视图')}>
        <SettingRow
          title={t('settingsPage.canvas.wheel', '滚轮操作')}
          description={t(
            'settingsPage.canvas.wheelDescription',
            '选择滚轮直接缩放画布，或沿画布平移。',
          )}
        >
          <Choice<WheelMode>
            value={wheelMode}
            options={['zoom', 'pan']}
            onChange={(value) => setPreference('wheelMode', value)}
            format={(value) =>
              value === 'zoom'
                ? t('settingsPage.canvas.zoom', '缩放')
                : t('settingsPage.canvas.pan', '平移')
            }
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.canvas.defaultZoom', '进入画布时的缩放')}
          description={t(
            'settingsPage.canvas.defaultZoomDescription',
            '切换到另一个画布工作区时应用该缩放比例。',
          )}
        >
          <label className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 focus-within:border-amber-400/40 focus-within:bg-amber-400/[0.05]">
            <input
              type="number"
              min={MIN_DEFAULT_ZOOM * 100}
              max={MAX_DEFAULT_ZOOM * 100}
              step="0.1"
              value={defaultZoomPercent}
              onChange={(event) => setDefaultZoomPercent(event.target.value)}
              onBlur={commitDefaultZoom}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              aria-label={t('settingsPage.canvas.defaultZoom', '进入画布时的缩放')}
              className="w-20 bg-transparent text-right text-[13px] font-medium text-white/80 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[12px] text-white/38">%</span>
          </label>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.canvas.minimapPosition', '画布小地图位置')}
          description={t(
            'settingsPage.canvas.minimapPositionDescription',
            '设置开启小地图后，它固定显示在画布底部的左侧、中央或右侧。',
          )}
        >
          <Choice<MiniMapPosition>
            value={miniMapPosition}
            options={['bottom-left', 'bottom-center', 'bottom-right']}
            onChange={(value) => setPreference('miniMapPosition', value)}
            format={(value) =>
              ({
                'bottom-left': t('settingsPage.canvas.minimap.bottomLeft', '下左'),
                'bottom-center': t('settingsPage.canvas.minimap.bottomCenter', '下中'),
                'bottom-right': t('settingsPage.canvas.minimap.bottomRight', '下右'),
              })[value]
            }
          />
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.canvas.section.toolbar', '画布功能栏')}>
        <div className="p-4">
          <ToolbarVisibilityPreview toolbarModes={toolbarModes} onJump={jumpToToolbarSetting} />
        </div>
        <div
          id="toolbar-setting-system-settings"
          data-toolbar-setting="system-settings"
          className={`scroll-m-8 transition-colors duration-300 ${
            highlightedToolbarTarget === 'system-settings' ? 'bg-amber-400/[0.1]' : ''
          }`}
        >
          <SettingRow
            title={t('settings.title', '系统设置')}
            description={t(
              'settingsPage.canvas.systemSettingsDescription',
              '系统设置齿轮始终固定在画布右上角，不能隐藏或靠边收起。',
            )}
          >
            <span className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200">
              {t('settingsPage.canvas.alwaysVisible', '固定显示')}
            </span>
          </SettingRow>
        </div>
        <ToolbarControlRows
          title={t('settingsPage.canvas.toolbar.section.topLeft', '顶部左侧')}
          controls={TOP_LEFT_TOOLBAR_CONTROLS}
          toolbarModes={toolbarModes}
          onChange={setToolbarMode}
          highlightedTarget={highlightedToolbarTarget}
        />
        <ToolbarControlRows
          title={t('settingsPage.canvas.toolbar.section.topRight', '顶部右侧')}
          controls={TOP_RIGHT_TOOLBAR_CONTROLS}
          toolbarModes={toolbarModes}
          onChange={setToolbarMode}
          highlightedTarget={highlightedToolbarTarget}
        />
        <ToolbarControlRows
          title={t('settingsPage.canvas.toolbar.section.bottomLeft', '底部左侧')}
          controls={BOTTOM_LEFT_TOOLBAR_CONTROLS}
          toolbarModes={toolbarModes}
          onChange={setToolbarMode}
          highlightedTarget={highlightedToolbarTarget}
        />
        <ToolbarControlRows
          title={t('settingsPage.canvas.toolbar.section.bottomCenter', '底部中央')}
          controls={BOTTOM_CENTER_TOOLBAR_CONTROLS}
          toolbarModes={toolbarModes}
          onChange={setToolbarMode}
          highlightedTarget={highlightedToolbarTarget}
        />
        <ToolbarControlRows
          title={t('settingsPage.canvas.toolbar.section.bottomRight', '底部右侧')}
          controls={BOTTOM_RIGHT_TOOLBAR_CONTROLS}
          toolbarModes={toolbarModes}
          onChange={setToolbarMode}
          highlightedTarget={highlightedToolbarTarget}
        />
      </Section>
    </Page>
  );
}

const THEME_COLOR_FIELDS: {
  key: keyof CanvasThemeTokens;
  label: string;
  labelKey: string;
}[] = [
  { key: 'canvas', label: '画布背景', labelKey: 'settingsPage.appearance.color.canvas' },
  { key: 'card', label: '节点表面', labelKey: 'settingsPage.appearance.color.card' },
  { key: 'panel', label: '浮动面板', labelKey: 'settingsPage.appearance.color.panel' },
  { key: 'edge', label: '普通边框', labelKey: 'settingsPage.appearance.color.edge' },
  {
    key: 'edgeStrong',
    label: '强调边框',
    labelKey: 'settingsPage.appearance.color.edgeStrong',
  },
  { key: 'accent', label: '强调颜色', labelKey: 'settingsPage.appearance.color.accent' },
  { key: 'grid', label: '网格点', labelKey: 'settingsPage.appearance.color.grid' },
];

async function createThemePreviewPng(theme: CanvasTheme) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = theme.tokens.canvas;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (theme.tokens.gridVisible) {
    context.fillStyle = theme.tokens.grid;
    for (let x = 12; x < canvas.width; x += theme.tokens.gridGap) {
      for (let y = 12; y < canvas.height; y += theme.tokens.gridGap) {
        context.beginPath();
        context.arc(x, y, theme.tokens.gridSize, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  context.fillStyle = theme.tokens.panel;
  context.strokeStyle = theme.tokens.edgeStrong;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(54, 48, 532, 48, 12);
  context.fill();
  context.stroke();
  context.fillStyle = theme.tokens.card;
  context.beginPath();
  context.roundRect(108, 130, 190, 150, 16);
  context.fill();
  context.stroke();
  context.beginPath();
  context.roundRect(350, 160, 180, 120, 16);
  context.fill();
  context.stroke();
  context.strokeStyle = theme.tokens.accent;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(298, 205);
  context.bezierCurveTo(320, 205, 328, 220, 350, 220);
  context.stroke();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
}

function ThemeColorInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2">
      <span className="text-[12px] text-white/65">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-white/35">{value}</span>
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={label}
        />
      </span>
    </label>
  );
}

function AppearanceSettings() {
  const { t } = useAppTranslation();
  const projectId = useCanvasStore((state) => state.activeProjectId);
  const customThemes = useCanvasThemeStore((state) => state.customThemes);
  const globalThemeId = useCanvasThemeStore((state) => state.globalThemeId);
  const projectThemeIds = useCanvasThemeStore((state) => state.projectThemeIds);
  const addTheme = useCanvasThemeStore((state) => state.addTheme);
  const createThemeCopy = useCanvasThemeStore((state) => state.createThemeCopy);
  const updateTheme = useCanvasThemeStore((state) => state.updateTheme);
  const deleteTheme = useCanvasThemeStore((state) => state.deleteTheme);
  const setActiveTheme = useCanvasThemeStore((state) => state.setActiveTheme);
  const [scope, setScope] = useState<ThemeScope>(projectThemeIds[projectId] ? 'project' : 'global');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string }>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [themeLibrary, setThemeLibrary] = useState<CanvasThemeLibrary>();
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [importingName, setImportingName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const themes = [DEFAULT_CANVAS_THEME, ...customThemes];
  const selectedId =
    scope === 'project' ? (projectThemeIds[projectId] ?? globalThemeId) : globalThemeId;
  const selectedTheme = themes.find((theme) => theme.id === selectedId) ?? DEFAULT_CANVAS_THEME;
  const effectiveTheme = resolveCanvasTheme(
    { customThemes, globalThemeId, projectThemeIds },
    projectId,
  );
  const editable = !selectedTheme.builtIn;

  const refreshThemeLibrary = async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      setThemeLibrary(await loadCanvasThemeLibrary());
    } catch (error) {
      setLibraryError(
        error instanceof Error
          ? error.message
          : t('settingsPage.appearance.error.libraryRead', '风格目录读取失败。'),
      );
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLibraryLoading(true);
    void loadCanvasThemeLibrary()
      .then((library) => {
        if (active) setThemeLibrary(library);
      })
      .catch((error: unknown) => {
        if (active)
          setLibraryError(
            error instanceof Error
              ? error.message
              : t('settingsPage.appearance.error.libraryRead', '风格目录读取失败。'),
          );
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const applySelected = (id: string) => {
    setDeleteConfirmId(null);
    setActiveTheme(id, scope, projectId);
    setNotice({
      kind: 'success',
      text:
        scope === 'project'
          ? t('settingsPage.appearance.notice.appliedProject', '已应用到当前画布。')
          : t('settingsPage.appearance.notice.appliedGlobal', '已设为全局风格。'),
    });
  };

  const importThemeFile = async (file: File) => {
    try {
      const theme = await parseThemeZip(file);
      const id = addTheme(theme);
      setActiveTheme(id, scope, projectId);
      setNotice({
        kind: 'success',
        text: t('settingsPage.appearance.notice.importedNamed', '已安全导入并应用“{name}”。', {
          name: theme.name,
        }),
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.appearance.error.import', '风格包导入失败。'),
      });
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    for (const file of files) await importThemeFile(file);
  };

  const importFromThemeDirectory = async (name: string) => {
    setImportingName(name);
    try {
      await importThemeFile(await loadCanvasThemeFile(name));
    } finally {
      setImportingName(null);
    }
  };

  const handleExport = async () => {
    const preview = await createThemePreviewPng(selectedTheme);
    const blob = preview ? createThemeZip(selectedTheme, preview) : createThemeZip(selectedTheme);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedTheme.name.replace(/[\\/:*?"<>|]/g, '-') || 'qiansi-theme'}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice({
      kind: 'success',
      text: t('settingsPage.appearance.notice.exported', '风格 ZIP 已导出，包含清单和预览图。'),
    });
  };

  return (
    <Page
      title={t('settings.appearance', '外观')}
      description={t('settingsPage.appearance.description', '编辑、应用和分享整套无限画布风格。')}
      wide
    >
      <Section title={t('settingsPage.appearance.section.currentTheme', '当前画布风格')}>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedTheme.id}
                onChange={(event) => applySelected(event.target.value)}
                className="min-w-56 rounded-lg border border-white/[0.1] bg-[#202023] px-3 py-2 text-[13px] text-white/85 outline-none focus:border-amber-400/40"
                aria-label={t('settingsPage.appearance.selectTheme', '选择画布风格')}
              >
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                    {theme.builtIn ? t('settingsPage.appearance.builtInSuffix', '（内置）') : ''}
                  </option>
                ))}
              </select>
              <Choice<ThemeScope>
                value={scope}
                options={['project', 'global']}
                onChange={(value) => {
                  setScope(value);
                  const id =
                    value === 'project'
                      ? (projectThemeIds[projectId] ?? globalThemeId)
                      : globalThemeId;
                  setActiveTheme(id, value, projectId);
                }}
                format={(value) =>
                  value === 'project'
                    ? t('settingsPage.appearance.scope.project', '当前画布')
                    : t('settingsPage.appearance.scope.global', '全局默认')
                }
              />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-white/38">
              {t('settingsPage.appearance.effectiveTheme', '当前实际生效：{name} · {scope}', {
                name: effectiveTheme.name,
                scope:
                  scope === 'project'
                    ? t('settingsPage.appearance.scope.currentCanvas', '当前画布')
                    : t(
                        'settingsPage.appearance.scope.allUnspecifiedProjects',
                        '其它未单独指定风格的画布',
                      ),
              })}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                onClick={() => {
                  const id = createThemeCopy(selectedTheme);
                  setActiveTheme(id, scope, projectId);
                  setNotice({
                    kind: 'success',
                    text: t('settingsPage.appearance.notice.copyCreated', '已创建可编辑副本。'),
                  });
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {t('settingsPage.appearance.createCopy', '新建副本')}
              </ActionButton>
              <ActionButton onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                {t('settingsPage.appearance.exportZip', '导出 ZIP')}
              </ActionButton>
              <ActionButton onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                {t('settingsPage.appearance.chooseOtherLocation', '选择其它位置')}
              </ActionButton>
              {!selectedTheme.builtIn && (
                <ActionButton
                  danger
                  onClick={() => {
                    if (deleteConfirmId !== selectedTheme.id) {
                      setDeleteConfirmId(selectedTheme.id);
                      setNotice({
                        kind: 'error',
                        text: t(
                          'settingsPage.appearance.notice.confirmDeleteNamed',
                          '再次点击“确认删除”将删除“{name}”。',
                          { name: selectedTheme.name },
                        ),
                      });
                      return;
                    }
                    deleteTheme(selectedTheme.id);
                    setDeleteConfirmId(null);
                    setNotice({
                      kind: 'success',
                      text: t(
                        'settingsPage.appearance.notice.deleted',
                        '自定义风格已删除，已恢复默认风格。',
                      ),
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteConfirmId === selectedTheme.id
                    ? t('settingsPage.appearance.confirmDelete', '确认删除')
                    : t('settingsPage.appearance.deleteTheme', '删除风格')}
                </ActionButton>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                multiple
                hidden
                onChange={handleImport}
              />
            </div>
          </div>
          <div
            className="relative h-40 overflow-hidden rounded-xl border"
            style={{
              background: selectedTheme.tokens.canvas,
              borderColor: selectedTheme.tokens.edgeStrong,
            }}
            aria-label={t('settingsPage.appearance.previewAria', '画布风格预览')}
          >
            <div
              className="absolute inset-0 opacity-80"
              style={{
                backgroundImage: selectedTheme.tokens.gridVisible
                  ? `radial-gradient(${selectedTheme.tokens.grid} ${selectedTheme.tokens.gridSize}px, transparent ${selectedTheme.tokens.gridSize}px)`
                  : 'none',
                backgroundSize: `${selectedTheme.tokens.gridGap}px ${selectedTheme.tokens.gridGap}px`,
              }}
            />
            <div
              className="absolute left-4 right-4 top-4 h-7 rounded-lg border"
              style={{
                background: selectedTheme.tokens.panel,
                borderColor: selectedTheme.tokens.edge,
              }}
            />
            <div
              className="absolute bottom-5 left-8 h-20 w-24 rounded-xl border"
              style={{
                background: selectedTheme.tokens.card,
                borderColor: selectedTheme.tokens.edgeStrong,
              }}
            />
            <div
              className="absolute bottom-7 right-8 h-16 w-20 rounded-xl border"
              style={{
                background: selectedTheme.tokens.card,
                borderColor: selectedTheme.tokens.edgeStrong,
              }}
            />
            <div
              className="absolute bottom-[57px] left-[128px] h-0.5 w-[72px]"
              style={{ background: selectedTheme.tokens.accent }}
            />
          </div>
        </div>
      </Section>

      {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}

      <div
        data-theme-role="status-note"
        className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-4 py-3 text-[12px] leading-relaxed text-emerald-100/60"
      >
        {t(
          'settingsPage.appearance.safetyNotice',
          '风格包只保存画布颜色、网格和组件令牌，不会覆盖程序源码或启动文件。删除自定义风格会立即回到内置默认风格；本地目录中的原始 ZIP 不会被删除。',
        )}
      </div>

      <Section title={t('settingsPage.appearance.section.localThemes', '本地风格目录')}>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[12px] text-white/45">
                {t('settingsPage.appearance.importDirectory', '导入目录')}
              </p>
              <p className="mt-1 break-all font-mono text-[12px] text-white/78">
                {themeLibrary?.directory ??
                  t(
                    'settingsPage.appearance.defaultThemeDirectory',
                    '本机程序目录\\data\\canvas-themes',
                  )}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <ActionButton
                disabled={!themeLibrary?.directory}
                onClick={() => {
                  if (!themeLibrary?.directory) return;
                  void navigator.clipboard
                    .writeText(themeLibrary.directory)
                    .then(() =>
                      setNotice({
                        kind: 'success',
                        text: t(
                          'settingsPage.appearance.notice.pathCopied',
                          '风格目录路径已复制。',
                        ),
                      }),
                    )
                    .catch(() =>
                      setNotice({
                        kind: 'error',
                        text: t(
                          'settingsPage.appearance.error.copyPath',
                          '路径复制失败，请手动复制。',
                        ),
                      }),
                    );
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {t('settingsPage.appearance.copyPath', '复制路径')}
              </ActionButton>
              <ActionButton onClick={() => void refreshThemeLibrary()} disabled={libraryLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${libraryLoading ? 'animate-spin' : ''}`} />
                {t('settingsPage.appearance.refreshDirectory', '刷新目录')}
              </ActionButton>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-white/38">
            {t(
              'settingsPage.appearance.directoryHint',
              '把一个或多个 Qiansi-Canvas 风格 ZIP 放入此目录，然后点击“刷新目录”。点击下面任意文件即可导入并应用；原文件会保留在目录中。',
            )}
          </p>
          {libraryError && <InlineNotice kind="error">{libraryError}</InlineNotice>}
          {!libraryError && !libraryLoading && themeLibrary?.items.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/[0.1] px-4 py-6 text-center text-[12px] text-white/35">
              {t(
                'settingsPage.appearance.directoryEmpty',
                '目录中还没有风格 ZIP，可以先导出一个风格或复制其他用户分享的风格包到这里。',
              )}
            </div>
          )}
          {Boolean(themeLibrary?.items.length) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {themeLibrary?.items.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  disabled={Boolean(importingName)}
                  onClick={() => void importFromThemeDirectory(item.name)}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-left transition-colors hover:border-amber-400/25 hover:bg-amber-400/[0.06] disabled:opacity-45"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-amber-300/80">
                    <Palette className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-white/78">{item.name}</span>
                    <span className="mt-0.5 block text-[10px] text-white/32">
                      {formatBytes(item.size)}
                    </span>
                  </span>
                  <span className="text-[10px] text-white/38">
                    {importingName === item.name
                      ? t('settingsPage.appearance.importing', '导入中…')
                      : t('common.select', '选择')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title={t('settingsPage.appearance.section.themeInfo', '风格信息')}>
        <SettingRow
          title={t('settingsPage.appearance.name', '名称')}
          description={
            editable
              ? t('settingsPage.appearance.nameDescription', '用于风格列表和导出文件。')
              : t('settingsPage.appearance.builtInReadOnly', '内置风格不可直接修改，请先新建副本。')
          }
        >
          <input
            value={selectedTheme.name}
            disabled={!editable}
            onChange={(event) => updateTheme(selectedTheme.id, { name: event.target.value })}
            className="w-56 rounded-lg border border-white/[0.09] bg-white/[0.05] px-3 py-1.5 text-[12px] text-white/75 outline-none disabled:opacity-45"
          />
        </SettingRow>
        <SettingRow title={t('settingsPage.appearance.author', '作者')}>
          <input
            value={selectedTheme.author}
            disabled={!editable}
            onChange={(event) => updateTheme(selectedTheme.id, { author: event.target.value })}
            className="w-56 rounded-lg border border-white/[0.09] bg-white/[0.05] px-3 py-1.5 text-[12px] text-white/75 outline-none disabled:opacity-45"
          />
        </SettingRow>
        <SettingRow title={t('settingsPage.appearance.themeDescription', '说明')}>
          <input
            value={selectedTheme.description}
            disabled={!editable}
            onChange={(event) => updateTheme(selectedTheme.id, { description: event.target.value })}
            className="w-72 rounded-lg border border-white/[0.09] bg-white/[0.05] px-3 py-1.5 text-[12px] text-white/75 outline-none disabled:opacity-45"
          />
        </SettingRow>
      </Section>

      <Section title={t('settingsPage.appearance.section.colors', '颜色令牌')}>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {THEME_COLOR_FIELDS.map(({ key, label, labelKey }) => (
            <ThemeColorInput
              key={key}
              label={t(labelKey, label)}
              value={String(selectedTheme.tokens[key])}
              disabled={!editable}
              onChange={(value) => updateTheme(selectedTheme.id, { tokens: { [key]: value } })}
            />
          ))}
        </div>
      </Section>

      <Section title={t('settingsPage.appearance.section.grid', '画布网格')}>
        <SettingRow
          title={t('settingsPage.appearance.gridVisible', '显示点阵网格')}
          description={t(
            'settingsPage.appearance.gridVisibleDescription',
            '此设置会随风格包一起导入和导出。',
          )}
        >
          <Toggle
            checked={selectedTheme.tokens.gridVisible}
            disabled={!editable}
            onChange={() =>
              updateTheme(selectedTheme.id, {
                tokens: { gridVisible: !selectedTheme.tokens.gridVisible },
              })
            }
            label={t('settingsPage.appearance.gridVisible', '显示点阵网格')}
          />
        </SettingRow>
        <SettingRow title={t('settingsPage.appearance.gridGap', '网格间距')}>
          <Choice<CanvasThemeTokens['gridGap']>
            value={selectedTheme.tokens.gridGap}
            options={[16, 24, 32]}
            onChange={(gridGap) =>
              editable && updateTheme(selectedTheme.id, { tokens: { gridGap } })
            }
            format={(value) => `${value}px`}
          />
        </SettingRow>
        <SettingRow title={t('settingsPage.appearance.gridSize', '网格点大小')}>
          <Choice<CanvasThemeTokens['gridSize']>
            value={selectedTheme.tokens.gridSize}
            options={[1, 1.5, 2]}
            onChange={(gridSize) =>
              editable && updateTheme(selectedTheme.id, { tokens: { gridSize } })
            }
            format={(value) => `${value}px`}
          />
        </SettingRow>
      </Section>

      <Section title={t('settingsPage.appearance.section.surface', '界面质感')}>
        <SettingRow
          title={t('settingsPage.appearance.controlsAndBorders', '控件与边框')}
          description={t(
            'settingsPage.appearance.controlsAndBordersDescription',
            '调整圆角、描边、层级阴影、半透明面板和滚动条的整体质感。',
          )}
        >
          <Choice<CanvasThemeTokens['interfaceStyle']>
            value={selectedTheme.tokens.interfaceStyle}
            options={['studio', 'qiansi', 'macos', 'dream-pink']}
            onChange={(interfaceStyle) =>
              editable && updateTheme(selectedTheme.id, { tokens: { interfaceStyle } })
            }
            format={(value) =>
              value === 'studio'
                ? t('settingsPage.appearance.interface.studio', 'Studio 工作台')
                : value === 'macos'
                  ? 'macOS'
                  : value === 'dream-pink'
                    ? t('settingsPage.appearance.interface.dreamPink', '绯梦紫粉')
                    : t('settingsPage.appearance.interface.qiansi', '千丝经典')
            }
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.appearance.cursor', '鼠标指针')}
          description={t(
            'settingsPage.appearance.cursorDescription',
            'macOS 指针使用内置安全矢量外观，不从风格包加载可执行内容。',
          )}
        >
          <Choice<CanvasThemeTokens['cursorStyle']>
            value={selectedTheme.tokens.cursorStyle}
            options={['system', 'macos']}
            onChange={(cursorStyle) =>
              editable && updateTheme(selectedTheme.id, { tokens: { cursorStyle } })
            }
            format={(value) =>
              value === 'macos' ? 'macOS' : t('settingsPage.appearance.systemDefault', '系统默认')
            }
          />
        </SettingRow>
      </Section>

      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-emerald-100/60">
        {t(
          'settingsPage.appearance.validationNotice',
          '风格包只接受经过校验的颜色、网格、界面质感和指针预设，不会载入 JavaScript、HTML 或任意 CSS。',
        )}
      </div>
    </Page>
  );
}

function GenerationSettings({ onNavigate }: { onNavigate: (section: SettingsSectionId) => void }) {
  const { t } = useAppTranslation();
  const params = useCanvasStore((state) => state.genParams);
  const setGenParams = useCanvasStore((state) => state.setGenParams);
  const favorites = [
    [t('node.kind.text', '文本'), readModelFavorite('chat')],
    [t('node.kind.image', '图片'), readModelFavorite('image')],
    [t('node.kind.video', '视频'), readModelFavorite('video')],
  ] as const;
  return (
    <Page
      title={t('settings.generation', '生成默认值')}
      description={t('settingsPage.generation.description', '这些参数会作为新建生成节点的初始值。')}
    >
      <Section title={t('settingsPage.generation.section.output', '画面与输出')}>
        <SettingRow
          title={t('settingsPage.generation.aspectRatio', '默认画面比例')}
          description={t(
            'settingsPage.generation.aspectRatioDescription',
            '新建图片与视频生成节点的初始比例。',
          )}
        >
          <Choice
            value={params.aspectRatio}
            options={RATIOS}
            onChange={(aspectRatio) => setGenParams({ aspectRatio })}
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.generation.resolution', '默认分辨率')}
          description={t(
            'settingsPage.generation.resolutionDescription',
            '视频生成节点的初始输出分辨率。',
          )}
        >
          <Choice
            value={params.resolution ?? '720P'}
            options={RESOLUTIONS}
            onChange={(resolution) => setGenParams({ resolution })}
          />
        </SettingRow>
        <SettingRow title={t('settingsPage.generation.quality', '默认画质')}>
          <Choice
            value={params.quality}
            options={QUALITIES}
            onChange={(quality) => setGenParams({ quality })}
            format={(quality) =>
              quality === 'standard' ? t('settingsPage.generation.standard', '标准') : quality
            }
          />
        </SettingRow>
        <SettingRow title={t('settingsPage.generation.count', '默认生成张数')}>
          <Choice
            value={params.count}
            options={COUNTS}
            onChange={(count) => setGenParams({ count })}
            format={(count) => t('settingsPage.generation.countValue', '{count} 张', { count })}
          />
        </SettingRow>
        <SettingRow title={t('settingsPage.generation.duration', '默认视频时长')}>
          <Choice
            value={params.duration ?? 5}
            options={DURATIONS}
            onChange={(duration) => setGenParams({ duration })}
            format={(duration) =>
              t('settingsPage.generation.durationValue', '{duration} 秒', { duration })
            }
          />
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.generation.section.favoriteModels', '喜欢的模型')}>
        {favorites.map(([label, favorite]) => (
          <SettingRow
            key={label}
            title={t('settingsPage.generation.modelForType', '{type}模型', { type: label })}
            description={
              favorite
                ? favorite.model
                : t('settingsPage.generation.noFavoriteModel', '尚未选择喜欢的模型')
            }
          >
            <span className="max-w-56 truncate text-[12px] text-white/55">
              {favorite?.providerId ?? t('common.notSet', '未设置')}
            </span>
          </SettingRow>
        ))}
        <SettingRow
          title={t('settingsPage.generation.manageModels', '管理模型')}
          description={t(
            'settingsPage.generation.manageModelsDescription',
            '在模型菜单中点击心形，或在 API 页面管理平台模型。',
          )}
        >
          <button
            type="button"
            onClick={() => onNavigate('ai-api')}
            className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.13] hover:text-white"
          >
            {t('settingsPage.generation.openModels', '打开 AI 模型与 API')}
          </button>
        </SettingRow>
      </Section>
    </Page>
  );
}

const CLI_TOOL_LABELS: { key: CliToolKey; label: string }[] = [
  { key: 'arkcli', label: '山火 CLI' },
  { key: 'codex', label: 'Codex CLI' },
  { key: 'codebuddy', label: 'WorkBuddy CLI' },
  { key: 'gemini', label: 'Gemini CLI' },
  { key: 'jimeng', label: '即梦 CLI' },
  { key: 'bailian', label: '百炼 CLI' },
];

function LocalToolsSettings({ onNavigate }: { onNavigate: (section: SettingsSectionId) => void }) {
  const { t } = useAppTranslation();
  const [health, setHealth] = useState<BridgeHealth>();
  const [comfyStatus, setComfyStatus] = useState<LocalComfyUiStatus>();
  const [bridgeError, setBridgeError] = useState<string>();
  const [comfyError, setComfyError] = useState<string>();
  const [checking, setChecking] = useState(false);

  const runCheck = async (force: boolean) => {
    setChecking(true);
    setBridgeError(undefined);
    setComfyError(undefined);
    const [bridgeResult, comfyResult] = await Promise.allSettled([
      fetchBridgeHealth(force),
      fetchLocalComfyUiStatus(),
    ]);
    if (bridgeResult.status === 'fulfilled') setHealth(bridgeResult.value);
    else {
      setHealth(undefined);
      setBridgeError(
        bridgeResult.reason instanceof Error
          ? bridgeResult.reason.message
          : t('settingsPage.localTools.error.bridgeCheck', '本地桥检测失败。'),
      );
    }
    if (comfyResult.status === 'fulfilled') setComfyStatus(comfyResult.value);
    else {
      setComfyStatus(undefined);
      setComfyError(
        comfyResult.reason instanceof Error
          ? comfyResult.reason.message
          : t('settingsPage.localTools.error.comfyCheck', 'ComfyUI 检测失败。'),
      );
    }
    setChecking(false);
  };

  return (
    <Page
      title={t('settings.localTools', '本地工具')}
      description={t(
        'settingsPage.localTools.description',
        '检测当前本地桥、CLI 与 ComfyUI 的真实运行状态。',
      )}
    >
      <Section title={t('settingsPage.localTools.section.bridge', '本地桥')}>
        <SettingRow
          title={t('settingsPage.localTools.serviceUrl', '服务地址')}
          description={BRIDGE_BASE_URL}
        >
          <ActionButton onClick={() => void runCheck(true)} disabled={checking}>
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking
              ? t('common.checking', '检测中')
              : health || bridgeError
                ? t('common.checkAgain', '重新检测')
                : t('settingsPage.localTools.checkTools', '检测本地工具')}
          </ActionButton>
        </SettingRow>
        {(health || bridgeError) && (
          <SettingRow
            title={t('settingsPage.localTools.connectionStatus', '连接状态')}
            description={
              health?.buildId
                ? t('settingsPage.localTools.buildId', '构建标识：{id}', { id: health.buildId })
                : bridgeError
            }
          >
            <ResultBadge ok={Boolean(health)}>
              {health
                ? t('apiSettings.status.connected', '已连接')
                : t('settingsPage.localTools.notConnected', '未连接')}
            </ResultBadge>
          </SettingRow>
        )}
      </Section>

      {health && (
        <Section title={t('settingsPage.localTools.section.cli', 'CLI 工具')}>
          {CLI_TOOL_LABELS.map(({ key, label }) => {
            const installed = health.tools[key] === true;
            const session = health.sessions[key];
            const ready = session?.ready === true;
            const detail = session?.version
              ? t('settingsPage.localTools.version', '版本 {version}', {
                  version: session.version,
                })
              : installed
                ? t('settingsPage.localTools.installedNotReady', '已安装，但当前未就绪')
                : t('settingsPage.localTools.notDetected', '本机未检测到该工具');
            return (
              <SettingRow key={key} title={label} description={detail}>
                <ResultBadge ok={ready}>
                  {ready
                    ? t('settingsPage.localTools.available', '可用')
                    : installed
                      ? t('settingsPage.localTools.notReady', '未就绪')
                      : t('settingsPage.localTools.notInstalled', '未安装')}
                </ResultBadge>
              </SettingRow>
            );
          })}
        </Section>
      )}

      {(comfyStatus || comfyError) && (
        <Section title={t('settingsPage.localTools.section.comfyui', 'ComfyUI')}>
          <SettingRow
            title={t('settingsPage.localTools.localService', '本地服务')}
            description={
              comfyStatus?.ready
                ? t('settingsPage.localTools.workflowsImported', '已导入 {count} 个工作流', {
                    count: comfyStatus.workflows.length,
                  })
                : (comfyStatus?.error ??
                  comfyError ??
                  t('settingsPage.localTools.serviceNotReady', '服务未就绪'))
            }
          >
            <ResultBadge ok={comfyStatus?.ready === true}>
              {comfyStatus?.ready
                ? t('apiSettings.status.connected', '已连接')
                : t('settingsPage.localTools.notConnected', '未连接')}
            </ResultBadge>
          </SettingRow>
        </Section>
      )}

      <Section title={t('settingsPage.localTools.section.models', '模型配置')}>
        <SettingRow
          title={t('settingsPage.localTools.platformsAndModels', '平台与模型')}
          description={t(
            'settingsPage.localTools.platformsAndModelsDescription',
            '打开现有模型配置，不改变该页面的配置流程。',
          )}
        >
          <ActionButton onClick={() => onNavigate('ai-api')}>
            <Bot className="h-3.5 w-3.5" />
            {t('settingsPage.localTools.aiModelsAndApi', 'AI 模型与 API')}
          </ActionButton>
        </SettingRow>
      </Section>
    </Page>
  );
}

function CanvasSaveSettings() {
  const { t } = useAppTranslation();
  const tabs = useCanvasStore((state) => state.tabs);
  const activeTabId = useCanvasStore((state) => state.activeTabId);
  const renameTab = useCanvasStore((state) => state.renameTab);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const autosaveDelay = useCanvasPreferences((state) => state.autosaveDelay);
  const setPreference = useCanvasPreferences((state) => state.setPreference);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const [canvasDraft, setCanvasDraft] = useState(activeTab?.name ?? '');
  const [saveNotice, setSaveNotice] = useState<{
    kind: 'success' | 'error';
    message: string;
  }>();

  useEffect(() => setCanvasDraft(activeTab?.name ?? ''), [activeTab?.name]);

  const saveNow = async (
    successMessage = t('settingsPage.project.notice.savedNow', '当前画布已立即保存。'),
  ) => {
    const saved = await flushCanvasPersistence();
    setSaveNotice({
      kind: saved ? 'success' : 'error',
      message: saved
        ? successMessage
        : t(
            'settingsPage.project.error.saveFailed',
            '保存失败：本机 Bridge 不可用或磁盘空间不足。',
          ),
    });
  };

  const commitCanvasName = () => {
    const name = canvasDraft.trim();
    if (!name || !activeTab) {
      setSaveNotice({
        kind: 'error',
        message: t('settingsPage.project.error.canvasNameEmpty', '画布名称不能为空。'),
      });
      return;
    }
    renameTab(activeTab.id, name);
    setCanvasDraft(name);
    void saveNow(t('settingsPage.project.notice.canvasNameSaved', '画布名称已更新并保存。'));
  };

  return (
    <Page
      title={t('settings.canvasSave', '画布与自动保存')}
      description={t('settingsPage.project.description', '管理当前画布名称与本地保存时机。')}
    >
      <Section title={t('settingsPage.project.section.current', '当前画布')}>
        <SettingRow title={t('settingsPage.project.canvasName', '当前画布名称')}>
          <div className="flex items-center gap-2">
            <input
              value={canvasDraft}
              onChange={(event) => setCanvasDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitCanvasName();
              }}
              className="h-8 w-48 rounded-lg border border-white/[0.1] bg-black/20 px-2.5 text-[12px] text-white/80 outline-none focus:border-amber-400/35"
              maxLength={120}
            />
            <ActionButton onClick={commitCanvasName} disabled={!activeTab}>
              {t('settingsPage.project.saveName', '保存名称')}
            </ActionButton>
          </div>
        </SettingRow>
        <SettingRow title={t('settingsPage.project.content', '画布内容')}>
          <span className="text-[12px] text-white/60">
            {t(
              'settingsPage.project.contentSummary',
              '{canvases} 个画布 · {nodes} 个节点 · {edges} 条连线',
              { canvases: tabs.length, nodes: nodes.length, edges: edges.length },
            )}
          </span>
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.project.section.savePolicy', '保存策略')}>
        <SettingRow
          title={t('settingsPage.project.autosaveDelay', '自动保存延迟')}
          description={t(
            'settingsPage.project.autosaveDelayDescription',
            '停止操作后等待指定时间，再保存最新画布状态。',
          )}
        >
          <Choice<AutosaveDelay>
            value={autosaveDelay}
            options={[400, 1000, 3000]}
            onChange={(value) => setPreference('autosaveDelay', value)}
            format={(value) =>
              value < 1000
                ? `${value}ms`
                : t('settingsPage.project.seconds', '{value}秒', { value: value / 1000 })
            }
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.project.saveNow', '立即保存')}
          description={t(
            'settingsPage.project.saveNowDescription',
            '不等待自动保存延迟，立即写入当前画布状态。',
          )}
        >
          <ActionButton onClick={() => void saveNow()}>
            <Save className="h-3.5 w-3.5" />
            {t('settingsPage.project.saveNow', '立即保存')}
          </ActionButton>
        </SettingRow>
      </Section>
      {saveNotice && <InlineNotice kind={saveNotice.kind}>{saveNotice.message}</InlineNotice>}
    </Page>
  );
}

function StorageSettings({ onClose }: { onClose: () => void }) {
  const { t } = useAppTranslation();
  const assets = useCanvasStore((state) => state.assets);
  const trash = useCanvasStore((state) => state.trash);
  const nodes = useCanvasStore((state) => state.nodes);
  const setOpenModal = useCanvasStore((state) => state.setOpenModal);
  const setPanelOpen = useCanvasStore((state) => state.setPanelOpen);
  const [storage, setStorage] = useState<BrowserStorageProbe>();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string }>();

  const refreshStorage = async () => {
    setLoading(true);
    setStorage(await probeBrowserStorage());
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void probeBrowserStorage().then((result) => {
      if (active) setStorage(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const requestPersistentStorage = async () => {
    try {
      if (!navigator.storage?.persist) {
        throw new Error(
          t('settingsPage.storage.error.persistUnsupported', '当前浏览器不支持持久存储申请。'),
        );
      }
      const granted = await navigator.storage.persist();
      setStorage(await probeBrowserStorage());
      setNotice({
        kind: granted ? 'success' : 'error',
        message: granted
          ? t(
              'settingsPage.storage.notice.persistGranted',
              '浏览器已授予持久存储，系统会尽量避免自动回收本地画布数据。',
            )
          : t(
              'settingsPage.storage.notice.persistDenied',
              '浏览器没有授予持久存储；请保留重要工作流的 JSON 导出文件。',
            ),
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('settingsPage.storage.error.persistRequest', '持久存储申请失败。'),
      });
    }
  };

  return (
    <Page
      title={t('settings.storage', '存储与清理')}
      description={t(
        'settingsPage.storage.description',
        '查看真实浏览器占用，并通过现有安全入口管理素材和回收站。',
      )}
    >
      <Section title={t('settingsPage.storage.section.projectData', '当前画布数据')}>
        <SettingRow title={t('settingsPage.storage.canvasNodes', '画布节点')}>
          <span className="text-[12px] text-white/60">
            {t('settingsPage.storage.count.nodes', '{count} 个', { count: nodes.length })}
          </span>
        </SettingRow>
        <SettingRow title={t('settingsPage.storage.assetLibrary', '素材库')}>
          <span className="text-[12px] text-white/60">
            {t('settingsPage.storage.count.items', '{count} 项', { count: assets.length })}
          </span>
        </SettingRow>
        <SettingRow title={t('settingsPage.storage.trash', '回收站')}>
          <span className="text-[12px] text-white/60">
            {t('settingsPage.storage.count.items', '{count} 项', { count: trash.length })}
          </span>
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.storage.section.browserStorage', '浏览器存储')}>
        <SettingRow
          title={t('settingsPage.storage.totalUsage', '当前站点总占用')}
          description={
            storage?.quota !== undefined
              ? t('settingsPage.storage.availableQuota', '可用配额 {quota}', {
                  quota: formatBytes(storage.quota),
                })
              : t(
                  'settingsPage.storage.quotaDescription',
                  '由当前浏览器决定，统计包含该站点的本地存储和 IndexedDB。',
                )
          }
        >
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-white/60">{formatBytes(storage?.usage)}</span>
            <ActionButton onClick={() => void refreshStorage()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh', '刷新')}
            </ActionButton>
          </div>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.storage.persistentStorage', '持久存储许可')}
          description={t(
            'settingsPage.storage.persistentStorageDescription',
            '申请后，浏览器会尽量避免因空间压力自动回收该站点数据。',
          )}
        >
          {storage?.persisted ? (
            <ResultBadge ok>{t('settingsPage.storage.granted', '已授予')}</ResultBadge>
          ) : (
            <ActionButton onClick={() => void requestPersistentStorage()}>
              <HardDrive className="h-3.5 w-3.5" />
              {t('settingsPage.storage.requestPermission', '申请许可')}
            </ActionButton>
          )}
        </SettingRow>
      </Section>
      <Section title={t('settingsPage.storage.section.dataManagement', '数据管理')}>
        <SettingRow
          title={t('settingsPage.storage.manageAssets', '管理素材库')}
          description={t(
            'settingsPage.storage.manageAssetsDescription',
            '打开当前画布素材面板，可逐项移除不再需要的素材。',
          )}
        >
          <ActionButton
            onClick={() => {
              setPanelOpen('assets');
              onClose();
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {t('settingsPage.storage.openAssets', '打开素材库')}
          </ActionButton>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.storage.manageTrash', '管理回收站')}
          description={t(
            'settingsPage.storage.manageTrashDescription',
            '恢复内容或逐项永久删除；永久删除前会再次确认。',
          )}
        >
          <ActionButton
            danger
            onClick={() => {
              onClose();
              window.setTimeout(() => setOpenModal('trash'), 0);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('settingsPage.storage.openTrash', '打开回收站')}
          </ActionButton>
        </SettingRow>
      </Section>
      {notice && <InlineNotice kind={notice.kind}>{notice.message}</InlineNotice>}
    </Page>
  );
}

function DiagnosticsSettings() {
  const { t } = useAppTranslation();
  const [report, setReport] = useState<SafeDiagnosticReport>();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string }>();

  const runDiagnostics = async () => {
    setRunning(true);
    setNotice(undefined);
    const storage = await probeBrowserStorage();
    let health: BridgeHealth | undefined;
    let bridgeError: string | undefined;
    try {
      health = await fetchBridgeHealth();
    } catch (error) {
      bridgeError =
        error instanceof Error
          ? error.message
          : t('settingsPage.diagnostics.error.bridgeCheck', '本地桥检测失败。');
    }
    setReport(buildSafeDiagnosticReport(storage, health, bridgeError));
    setRunning(false);
  };

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setNotice({
        kind: 'success',
        message: t(
          'settingsPage.diagnostics.notice.reportCopied',
          '诊断报告已复制，报告不包含 API 密钥和本机绝对目录。',
        ),
      });
    } catch {
      setNotice({
        kind: 'error',
        message: t(
          'settingsPage.diagnostics.error.copyFailed',
          '复制失败，请检查浏览器剪贴板权限。',
        ),
      });
    }
  };

  return (
    <Page
      title={t('settings.diagnostics', '运行与诊断')}
      description={t(
        'settingsPage.diagnostics.description',
        '执行浏览器、本地存储和本地桥的实时检测。',
      )}
    >
      <Section title={t('settingsPage.diagnostics.section.actions', '诊断操作')}>
        <SettingRow
          title={t('settingsPage.diagnostics.runFull', '运行完整诊断')}
          description={t(
            'settingsPage.diagnostics.runFullDescription',
            '本地桥会检查已安装的 CLI，检测过程可能需要几十秒。',
          )}
        >
          <ActionButton onClick={() => void runDiagnostics()} disabled={running}>
            <Gauge className={`h-3.5 w-3.5 ${running ? 'animate-pulse' : ''}`} />
            {running
              ? t('settingsPage.diagnostics.running', '诊断中')
              : t('settingsPage.diagnostics.start', '开始诊断')}
          </ActionButton>
        </SettingRow>
      </Section>

      {report && (
        <>
          <Section title={t('settingsPage.diagnostics.section.results', '诊断结果')}>
            <SettingRow
              title={t('settingsPage.diagnostics.browserNetwork', '浏览器网络')}
              description={report.app.origin}
            >
              <ResultBadge ok={report.app.online}>
                {report.app.online
                  ? t('settingsPage.diagnostics.status.online', '在线')
                  : t('settingsPage.diagnostics.status.offline', '离线')}
              </ResultBadge>
            </SettingRow>
            <SettingRow
              title={t('settingsPage.diagnostics.browserStorage', '浏览器本地存储')}
              description={t(
                'settingsPage.diagnostics.browserStorageUsage',
                '已用 {usage} / 配额 {quota}',
                {
                  usage: formatBytes(report.browser.usage),
                  quota: formatBytes(report.browser.quota),
                },
              )}
            >
              <ResultBadge ok={report.browser.localStorageWritable}>
                {report.browser.localStorageWritable
                  ? t('settingsPage.diagnostics.status.writable', '可写')
                  : t('settingsPage.diagnostics.status.notWritable', '不可写')}
              </ResultBadge>
            </SettingRow>
            <SettingRow
              title={t('settingsPage.diagnostics.encryption', '密钥加密能力')}
              description={t(
                'settingsPage.diagnostics.encryptionDescription',
                '检测当前浏览器是否提供 Web Crypto。',
              )}
            >
              <ResultBadge ok={report.browser.vaultSupported}>
                {report.browser.vaultSupported
                  ? t('settingsPage.diagnostics.status.available', '可用')
                  : t('settingsPage.diagnostics.status.unavailable', '不可用')}
              </ResultBadge>
            </SettingRow>
            <SettingRow
              title={t('settingsPage.diagnostics.bridge', '本地桥')}
              description={report.bridge.error ?? report.bridge.url}
            >
              <ResultBadge ok={report.bridge.connected}>
                {report.bridge.connected
                  ? t('apiSettings.status.connected', '已连接')
                  : t('settingsPage.localTools.notConnected', '未连接')}
              </ResultBadge>
            </SettingRow>
            <SettingRow
              title={t('settingsPage.diagnostics.readyCli', '已就绪 CLI')}
              description={t('settingsPage.diagnostics.readyCliDescription', '由本地桥实时检测。')}
            >
              <span className="text-[12px] text-white/60">
                {t('settingsPage.diagnostics.count.cli', '{count} 个', {
                  count: report.bridge.readyCliCount,
                })}
              </span>
            </SettingRow>
            <SettingRow
              title={t('settingsPage.diagnostics.localMp4', '本地 MP4 渲染')}
              description={t(
                'settingsPage.diagnostics.localMp4Description',
                '检测本地桥打包的 FFmpeg 能力。',
              )}
            >
              <ResultBadge ok={report.bridge.localFfmpeg}>
                {report.bridge.localFfmpeg
                  ? t('settingsPage.diagnostics.status.available', '可用')
                  : t('settingsPage.diagnostics.status.unavailable', '不可用')}
              </ResultBadge>
            </SettingRow>
          </Section>
          <Section title={t('settingsPage.diagnostics.section.report', '报告')}>
            <SettingRow
              title={t('settingsPage.diagnostics.copyReport', '复制安全诊断报告')}
              description={t(
                'settingsPage.diagnostics.copyReportDescription',
                '仅包含版本、状态和容量，不复制 API 密钥、命令路径或画布数据目录。',
              )}
            >
              <ActionButton onClick={() => void copyReport()}>
                <Copy className="h-3.5 w-3.5" />
                {t('settingsPage.diagnostics.copyReportAction', '复制报告')}
              </ActionButton>
            </SettingRow>
          </Section>
        </>
      )}
      {notice && <InlineNotice kind={notice.kind}>{notice.message}</InlineNotice>}
    </Page>
  );
}

function PluginSettings() {
  const { t, formatDate } = useAppTranslation();
  const availableLanguages = useAvailableAppLanguages();
  const fileRef = useRef<HTMLInputElement>(null);
  const catalog = usePluginRegistryStore((state) => state.catalog);
  const loading = usePluginRegistryStore((state) => state.loading);
  const loaded = usePluginRegistryStore((state) => state.loaded);
  const storeError = usePluginRegistryStore((state) => state.error);
  const refresh = usePluginRegistryStore((state) => state.refresh);
  const importManifest = usePluginRegistryStore((state) => state.importManifest);
  const importPackage = usePluginRegistryStore((state) => state.importPackage);
  const setEnabled = usePluginRegistryStore((state) => state.setEnabled);
  const uninstall = usePluginRegistryStore((state) => state.uninstall);
  const restore = usePluginRegistryStore((state) => state.restore);
  const openPluginPanel = usePluginUiStore((state) => state.openPanel);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [developerHelpOpen, setDeveloperHelpOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'uninstall' | 'restore';
    id: string;
  } | null>(null);

  const newestBackups = useMemo(() => {
    const result = new Map<string, NonNullable<typeof catalog>['backups'][number]>();
    for (const backup of catalog?.backups ?? []) {
      if (!result.has(backup.id)) result.set(backup.id, backup);
    }
    return result;
  }, [catalog]);
  const recoverablePlugins = useMemo(() => {
    const installed = new Set((catalog?.plugins ?? []).map((plugin) => plugin.manifest.id));
    return [...newestBackups.values()].filter((backup) => !installed.has(backup.id));
  }, [catalog, newestBackups]);

  useEffect(() => {
    if (!loaded && !loading) void refresh().catch(() => {});
  }, [loaded, loading, refresh]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setNotice(null);
    try {
      if (files.length === 1 && files[0]?.name.toLowerCase().endsWith('.json')) {
        await importManifest(files[0]);
        setNotice({
          kind: 'success',
          text: t(
            'settingsPage.plugins.notice.compatManifestImported',
            '兼容插件清单 {name} 已导入。',
            { name: files[0].name },
          ),
        });
      } else {
        await importPackage(files);
        setNotice({
          kind: 'success',
          text: t(
            'settingsPage.plugins.notice.packageImported',
            '插件文件已安全导入。包含权限的 v2 插件默认停用，请检查权限后手动启用。',
          ),
        });
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.plugins.error.import', '插件导入失败。'),
      });
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setNotice(null);
    try {
      await setEnabled(id, enabled);
      setNotice({
        kind: 'success',
        text: enabled
          ? t('settingsPage.plugins.notice.enabled', '插件已启用。')
          : t('settingsPage.plugins.notice.disabled', '插件已停用。'),
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.plugins.error.toggle', '插件状态更新失败。'),
      });
    }
  };

  const handlePluginAction = async (type: 'uninstall' | 'restore', id: string, label: string) => {
    if (confirmAction?.type !== type || confirmAction.id !== id) {
      setConfirmAction({ type, id });
      setNotice({
        kind: 'error',
        text:
          type === 'uninstall'
            ? t(
                'settingsPage.plugins.notice.confirmUninstallNamed',
                '再次点击“确认卸载”将移除“{name}”。卸载前会自动保存可恢复备份，画布中已有的插件节点不会被删除。',
                { name: label },
              )
            : t(
                'settingsPage.plugins.notice.confirmRestoreNamed',
                '再次点击“确认恢复”将用上一备份替换“{name}”当前版本。当前版本也会先备份。',
                { name: label },
              ),
      });
      return;
    }
    setNotice(null);
    try {
      if (type === 'uninstall') await uninstall(id);
      else await restore(id);
      setConfirmAction(null);
      setNotice({
        kind: 'success',
        text:
          type === 'uninstall'
            ? t('settingsPage.plugins.notice.uninstalled', '插件已卸载，可从下方备份恢复。')
            : t('settingsPage.plugins.notice.restored', '插件已恢复并启用。'),
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.plugins.error.action', '插件操作失败。'),
      });
    }
  };

  const downloadExample = () => {
    const manifest = {
      schemaVersion: 2,
      id: 'example-runtime-tools',
      name: '可编程插件示例',
      version: '1.0.0',
      author: '你的名字',
      description: '包含自定义节点、右键菜单和沙箱运行时。',
      engine: { qiansiCanvas: '>=0.0.0' },
      runtime: { entry: 'runtime.js', apiVersion: 1 },
      permissions: ['canvas:update-own-node', 'canvas:notify'],
      contributes: {
        nodes: [
          {
            id: 'runtime-note',
            label: '可编程节点',
            description: '在隔离沙箱中运行自定义界面。',
            accent: '#22d3ee',
            input: 'any',
            output: 'text',
            hostKind: 'plugin',
            renderer: 'sandbox',
            view: 'runtime-note',
            width: 380,
            height: 240,
          },
        ],
        menus: [
          {
            id: 'add-runtime-note',
            label: '添加可编程节点',
            location: 'canvas',
            action: { type: 'add-node', nodeId: 'runtime-note' },
          },
        ],
      },
    };
    const runtime = `const root = document.getElementById('root');
root.innerHTML = '<main style="padding:16px"><h3>可编程节点</h3><textarea id="text" style="width:100%;height:90px;background:#111;color:white"></textarea><button id="save">写入节点</button></main>';
document.getElementById('save').onclick = async () => {
  const text = document.getElementById('text').value;
  await qiansi.updateOwnNode({ outputText: text, output: text });
  await qiansi.notify('节点输出已更新');
};`;
    const download = (name: string, content: string, type: string) => {
      const url = URL.createObjectURL(new Blob([content], { type }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    };
    download('plugin.json', JSON.stringify(manifest, null, 2), 'application/json');
    window.setTimeout(() => download('runtime.js', runtime, 'text/javascript'), 120);
  };

  const downloadLanguageExample = () => {
    const manifest = {
      schemaVersion: 2,
      id: 'example-en-gb-language-pack',
      name: 'English (UK) Language Pack',
      version: '1.0.0',
      author: 'Your name',
      description: 'Complete language pack example with the same UI coverage as built-in English.',
      engine: { qiansiCanvas: '>=0.1.0' },
      permissions: [],
      contributes: {
        locales: [
          { locale: 'en-GB', nativeName: 'English (UK)', file: 'en-GB.json', direction: 'ltr' },
        ],
      },
    };
    const languageFile = {
      locale: 'en-GB',
      translations: englishTranslationTemplate(),
    };
    const download = (name: string, content: string) => {
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    };
    download('plugin.json', JSON.stringify(manifest, null, 2));
    window.setTimeout(() => download('en-GB.json', JSON.stringify(languageFile, null, 2)), 120);
  };

  return (
    <Page
      title={t('settings.plugins', '插件')}
      description={t('settingsPage.plugins.description', '安装和管理节点与画布挂件等第三方扩展。')}
      wide
    >
      <input
        ref={fileRef}
        type="file"
        accept=".json,.js,.mjs,.css,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.mp4,.webm,.glb,.gltf,.bin,.wasm,.txt"
        multiple
        className="hidden"
        onChange={(event) => void handleImport(event)}
      />

      <Section title={t('settingsPage.plugins.section.catalog', '插件目录')}>
        <SettingRow
          stacked
          title={t('settingsPage.plugins.localDirectory', '本机插件位置')}
          description={
            catalog?.directory ?? t('settingsPage.plugins.loadingDirectory', '正在读取插件目录…')
          }
        >
          <div className="flex w-full flex-wrap justify-start gap-2">
            <ActionButton onClick={downloadExample}>
              <Download className="h-3.5 w-3.5" />
              {t('settingsPage.plugins.downloadExample', '下载示例')}
            </ActionButton>
            <ActionButton onClick={downloadLanguageExample}>
              <Languages className="h-3.5 w-3.5" />
              {t('settingsPage.plugins.downloadLanguageExample', '下载语言包示例')}
            </ActionButton>
            <ActionButton onClick={() => setDeveloperHelpOpen((open) => !open)}>
              <BookOpen className="h-3.5 w-3.5" />
              {developerHelpOpen
                ? t('settingsPage.plugins.hideDeveloperHelp', '收起开发帮助')
                : t('settingsPage.plugins.developerHelp', '开发帮助')}
            </ActionButton>
            <ActionButton onClick={() => fileRef.current?.click()} disabled={loading}>
              <Upload className="h-3.5 w-3.5" />
              {t('settingsPage.plugins.importFiles', '导入插件文件')}
            </ActionButton>
            <ActionButton onClick={() => void refresh().catch(() => {})} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh', '刷新')}
            </ActionButton>
          </div>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.plugins.backupLocation', '自动备份位置')}
          description={catalog?.backupDirectory ?? 'data/extension-backups/plugins'}
        >
          <span className="text-[10px] text-white/40">
            {t('settingsPage.plugins.backupHint', '更新、卸载前自动备份')}
          </span>
        </SettingRow>
      </Section>

      {developerHelpOpen && (
        <PluginDeveloperHelp pluginDirectory={catalog?.directory ?? 'data/plugins'} />
      )}

      <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-sky-100/60">
        {t(
          'settingsPage.plugins.securityNotice',
          'v2 插件可在隔离沙箱中运行 JavaScript、WASM、Worker、WebGL/WebGPU 与浏览器媒体解码，可读取用户主动选择的文件并触发下载；也可复用图片、视频、音频、2D/3D 导演台宿主节点。沙箱仍禁止未授权网络、任意磁盘读取、密钥、主页面和系统命令访问；敏感能力只能调用用户启用时批准的宿主白名单。',
        )}
      </div>

      {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}
      {!notice && storeError && <InlineNotice kind="error">{storeError}</InlineNotice>}

      <Section
        title={t('settingsPage.plugins.installedCount', '已安装插件 {count}', {
          count: catalog?.plugins.length ?? 0,
        })}
      >
        {!loading && catalog?.plugins.length === 0 && (
          <div className="px-5 py-8 text-center text-[12px] text-white/35">
            {t(
              'settingsPage.plugins.emptyCatalog',
              '插件目录中还没有有效插件。可以导入清单，或把插件文件夹放入上方目录后刷新。',
            )}
          </div>
        )}
        {catalog?.plugins.map((plugin) => (
          <SettingRow
            key={plugin.manifest.id}
            title={plugin.manifest.name}
            description={
              plugin.manifest.description ||
              t('settingsPage.plugins.summary', '{author} · {nodes} 个节点 · {widgets} 个挂件', {
                author:
                  plugin.manifest.author || t('settingsPage.plugins.unknownAuthor', '未知作者'),
                nodes: plugin.manifest.contributes.nodes.length,
                widgets: plugin.manifest.contributes.widgets.length,
              })
            }
          >
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="text-right text-[10px] leading-relaxed text-white/35">
                <p>v{plugin.manifest.version}</p>
                <p>
                  {t(
                    'settingsPage.plugins.contributionCounts',
                    '{nodes} 节点 · {widgets} 挂件 · {panels} 面板 · {menus} 菜单',
                    {
                      nodes: plugin.manifest.contributes.nodes.length,
                      widgets: plugin.manifest.contributes.widgets.length,
                      panels: plugin.manifest.contributes.panels.length,
                      menus: plugin.manifest.contributes.menus.length,
                    },
                  )}
                </p>
                {(plugin.manifest.contributes.locales?.length ?? 0) > 0 && (
                  <p>
                    {t('settingsPage.plugins.languageCount', '{count} 个完整语言包', {
                      count: plugin.manifest.contributes.locales?.length ?? 0,
                    })}
                  </p>
                )}
              </div>
              {plugin.enabled &&
                plugin.manifest.contributes.panels
                  .filter((panel) => panel.position === 'fullscreen')
                  .map((panel) => (
                    <ActionButton
                      key={panel.id}
                      disabled={loading || !plugin.compatible}
                      onClick={() => openPluginPanel(plugin.manifest.id, panel.id)}
                    >
                      <PanelTopOpen className="h-3.5 w-3.5" />
                      {t('settingsPage.plugins.openPanel', '打开 {name}', {
                        name: panel.label,
                      })}
                    </ActionButton>
                  ))}
              <Toggle
                checked={plugin.enabled}
                disabled={loading || !plugin.compatible}
                onChange={() => void handleToggle(plugin.manifest.id, !plugin.enabled)}
                label={t(
                  plugin.enabled
                    ? 'settingsPage.plugins.disableNamed'
                    : 'settingsPage.plugins.enableNamed',
                  plugin.enabled ? '停用 {name}' : '启用 {name}',
                  { name: plugin.manifest.name },
                )}
              />
              {newestBackups.has(plugin.manifest.id) && (
                <ActionButton
                  disabled={loading}
                  onClick={() =>
                    void handlePluginAction('restore', plugin.manifest.id, plugin.manifest.name)
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {confirmAction?.type === 'restore' && confirmAction.id === plugin.manifest.id
                    ? t('settingsPage.plugins.confirmRestore', '确认恢复')
                    : t('settingsPage.plugins.restorePrevious', '恢复上一版')}
                </ActionButton>
              )}
              <ActionButton
                danger
                disabled={loading}
                onClick={() =>
                  void handlePluginAction('uninstall', plugin.manifest.id, plugin.manifest.name)
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmAction?.type === 'uninstall' && confirmAction.id === plugin.manifest.id
                  ? t('settingsPage.plugins.confirmUninstall', '确认卸载')
                  : t('settingsPage.plugins.uninstall', '卸载')}
              </ActionButton>
            </div>
          </SettingRow>
        ))}
      </Section>

      {recoverablePlugins.length > 0 && (
        <Section
          title={t('settingsPage.plugins.recoverableCount', '可恢复插件 {count}', {
            count: recoverablePlugins.length,
          })}
        >
          {recoverablePlugins.map((backup) => (
            <SettingRow
              key={backup.id}
              title={backup.id}
              description={t(
                'settingsPage.plugins.backupSummary',
                '备份版本 v{version} · {files} 个文件 · {date}',
                {
                  version: backup.version || t('common.unknown', '未知'),
                  files: backup.fileCount,
                  date: formatDate(new Date(backup.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                },
              )}
            >
              <ActionButton
                disabled={loading}
                onClick={() => void handlePluginAction('restore', backup.id, backup.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {confirmAction?.type === 'restore' && confirmAction.id === backup.id
                  ? t('settingsPage.plugins.confirmRestore', '确认恢复')
                  : t('settingsPage.plugins.restorePlugin', '恢复插件')}
              </ActionButton>
            </SettingRow>
          ))}
        </Section>
      )}

      {catalog?.plugins.map((plugin) => (
        <section
          key={`${plugin.manifest.id}-nodes`}
          className="rounded-xl border border-white/[0.09] bg-white/[0.025] p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-white/75">
                {t('settingsPage.plugins.featuresOf', '{name} · 功能', {
                  name: plugin.manifest.name,
                })}
              </p>
              <p className="mt-1 text-[10px] text-white/30">{plugin.directory}</p>
            </div>
            <ResultBadge ok={plugin.compatible}>
              {plugin.compatible
                ? t('settingsPage.plugins.compatible', '版本兼容')
                : t('settingsPage.plugins.incompatible', '版本不兼容')}
            </ResultBadge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {plugin.manifest.contributes.nodes.map((node) => (
              <div
                key={node.id}
                className="rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: node.accent }}
                  />
                  <span className="text-[12px] text-white/70">{node.label}</span>
                </div>
                <p className="mt-1 text-[10px] text-white/32">
                  {node.input} → {node.output}
                </p>
              </div>
            ))}
            {plugin.manifest.contributes.widgets.map((widget) => (
              <div
                key={widget.id}
                className="rounded-lg border border-amber-300/[0.12] bg-amber-300/[0.035] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px]" aria-hidden="true">
                    🐱
                  </span>
                  <span className="text-[12px] text-white/70">{widget.label}</span>
                </div>
                <p className="mt-1 text-[10px] text-white/32">
                  {t('settingsPage.plugins.widgetSummary', '宠物挂件 · 右下角 · {width}px', {
                    width: widget.width,
                  })}
                </p>
              </div>
            ))}
            {plugin.manifest.contributes.panels.map((panel) => (
              <div
                key={panel.id}
                className="rounded-lg border border-cyan-300/[0.12] bg-cyan-300/[0.035] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Puzzle className="h-3.5 w-3.5 text-cyan-300/70" />
                  <span className="text-[12px] text-white/70">{panel.label}</span>
                </div>
                <p className="mt-1 text-[10px] text-white/32">
                  {t(
                    'settingsPage.plugins.panelSummary',
                    '沙箱面板 · {position} · {width}×{height}',
                    {
                      position: panel.position,
                      width: panel.width,
                      height: panel.height,
                    },
                  )}
                </p>
              </div>
            ))}
            {plugin.manifest.contributes.audioGenerators.map((generator) => (
              <div
                key={generator.id}
                className="rounded-lg border border-violet-300/[0.12] bg-violet-300/[0.035] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5 text-violet-300/70" />
                  <span className="text-[12px] text-white/70">{generator.label}</span>
                </div>
                <p className="mt-1 text-[11px] text-white/32">
                  {generator.hostAdapter
                    ? t(
                        'settingsPage.plugins.managedAudioGeneratorSummary',
                        '随插件启停的宿主管理音频服务 · 上限 {size} MB',
                        { size: Math.ceil(generator.maxBytes / 1024 / 1024) },
                      )
                    : t(
                        'settingsPage.plugins.audioGeneratorSummary',
                        '宿主受控本机音频代理 · 上限 {size} MB',
                        { size: Math.ceil(generator.maxBytes / 1024 / 1024) },
                      )}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-white/28">
                  {generator.hostAdapter
                    ? t(
                        'settingsPage.plugins.managedAudioGeneratorLifecycle',
                        '开启插件时自动启动 · 关闭插件时自动停止 · 共用画布端口',
                      )
                    : generator.endpoint}
                </p>
              </div>
            ))}
            {(plugin.manifest.contributes.locales ?? []).map((locale) => (
              <div
                key={locale.locale}
                className="rounded-lg border border-emerald-300/[0.12] bg-emerald-300/[0.035] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Languages className="h-3.5 w-3.5 text-emerald-300/70" />
                  <span className="text-[12px] text-white/70">{locale.nativeName}</span>
                </div>
                <p className="mt-1 text-[11px] text-white/32">
                  {t('settingsPage.plugins.languageSummary', '完整界面语言包 · {locale}', {
                    locale: locale.locale,
                  })}
                </p>
                <p className="mt-1 text-[11px] text-white/40">
                  {availableLanguages.some(
                    (item) => item.locale === locale.locale && item.pluginId === plugin.manifest.id,
                  )
                    ? t('settingsPage.plugins.languageReady', '已通过英文等量覆盖校验')
                    : plugin.enabled && plugin.compatible
                      ? t(
                          'settingsPage.plugins.languageInvalid',
                          '语言代码冲突或未通过完整性校验，已阻止加载',
                        )
                      : t('settingsPage.plugins.languageInactive', '启用插件后校验语言文件')}
                </p>
              </div>
            ))}
          </div>
          {plugin.manifest.permissions.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] leading-5 text-amber-100/55">
              {t('settingsPage.plugins.permissionsOnEnable', '启用即授权：{permissions}', {
                permissions: plugin.manifest.permissions.join(' · '),
              })}
            </div>
          )}
          {plugin.security.hostProxyAccess === 'managed-audio' && (
            <div className="mt-3 flex gap-2.5 rounded-lg border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2.5 text-[11px] leading-5 text-amber-100/70">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
              <div>
                <p className="font-medium text-amber-100/85">
                  {t(
                    'settingsPage.plugins.managedAudioNativeProcessWarning',
                    '启用会启动插件目录内的本机 Python 进程；它拥有普通本机进程权限，不受 iframe 沙箱保护。只应启用来源可信的完整目录。',
                  )}
                </p>
                <p className="mt-1 text-amber-100/48">
                  {t(
                    'settingsPage.plugins.managedAudioHashBoundary',
                    '下方 SHA-256 仅校验 iframe 的 runtime.js；宿主会另外绑定插件身份、规范目录与 worker.py 固定摘要。',
                  )}
                </p>
              </div>
            </div>
          )}
          <div className="mt-2 text-[11px] leading-5 text-emerald-200/45">
            {plugin.manifest.runtime
              ? plugin.security.hostProxyAccess === 'managed-audio'
                ? t(
                    'settingsPage.plugins.runtimeSecurityWithManagedAudio',
                    'iframe 开放本地计算/媒体/下载 · 禁止任意网络/磁盘/密钥/宿主页访问 · runtime.js SHA-256 {hash}… · 本机 worker 使用独立信任门禁',
                    {
                      hash:
                        plugin.security.runtimeSha256?.slice(0, 12) ||
                        t('settingsPage.plugins.pendingVerification', '待校验'),
                    },
                  )
                : plugin.security.hostProxyAccess === 'loopback-audio'
                  ? t(
                      'settingsPage.plugins.runtimeSecurityWithAudioProxy',
                      '隔离运行时开放本地计算/媒体/下载 · 禁止任意磁盘/密钥/宿主页访问 · 宿主仅代理清单声明的本机音频端点 · SHA-256 {hash}…',
                      {
                        hash:
                          plugin.security.runtimeSha256?.slice(0, 12) ||
                          t('settingsPage.plugins.pendingVerification', '待校验'),
                      },
                    )
                  : t(
                      'settingsPage.plugins.runtimeSecurity',
                      '隔离运行时 · 开放本地计算/媒体/下载 · 禁止任意网络/磁盘/密钥/宿主页访问 · SHA-256 {hash}…',
                      {
                        hash:
                          plugin.security.runtimeSha256?.slice(0, 12) ||
                          t('settingsPage.plugins.pendingVerification', '待校验'),
                      },
                    )
              : t('settingsPage.plugins.declarativePlugin', '无运行时代码 · 声明式兼容插件')}
          </div>
        </section>
      ))}

      {catalog?.errors.map((error) => (
        <InlineNotice key={error.directory} kind="error">
          {error.directory}：{error.message}
        </InlineNotice>
      ))}
    </Page>
  );
}

function AboutSettings() {
  const { t } = useAppTranslation();
  const version = import.meta.env.VITE_APP_VERSION ?? 'unknown';
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string }>();
  const [supportOpen, setSupportOpen] = useState(false);

  const copyVersionInfo = async () => {
    const info = [
      'Qiansi-Canvas',
      t('settingsPage.about.copyLine.developer', '开发者：{name}', { name: '老树苗' }),
      t('settingsPage.about.copyLine.email', '联系邮箱：{email}', { email: '46168745@qq.com' }),
      t('settingsPage.about.copyLine.copyright', '版权：{copyright}', {
        copyright: 'Copyright (c) 2026 holder (老树苗)',
      }),
      t('settingsPage.about.copyLine.license', '许可：{license}', {
        license: 'GPL-3.0-or-later / Commercial License',
      }),
      t('settingsPage.about.copyLine.version', '版本：{version}', { version }),
      t('settingsPage.about.copyLine.mode', '运行模式：{mode}', { mode: import.meta.env.MODE }),
      t('settingsPage.about.copyLine.url', '页面地址：{url}', { url: window.location.origin }),
      t('settingsPage.about.copyLine.browser', '浏览器：{browser}', {
        browser: navigator.userAgent,
      }),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(info);
      setNotice({
        kind: 'success',
        message: t('settingsPage.about.notice.versionCopied', '应用与浏览器版本信息已复制。'),
      });
    } catch {
      setNotice({
        kind: 'error',
        message: t('settingsPage.about.error.copyFailed', '复制失败，请检查浏览器剪贴板权限。'),
      });
    }
  };

  return (
    <Page
      title={t('settings.about', '关于')}
      description={t('settingsPage.about.description', 'Qiansi-Canvas 本地无限画布创作工具。')}
    >
      <Section title={t('settingsPage.about.section.appInfo', '应用信息')}>
        <SettingRow title={t('settingsPage.about.developer', '开发者')}>
          <span className="text-[12px] text-white/60">holder（老树苗）</span>
        </SettingRow>
        <SettingRow title={t('settingsPage.about.email', '联系邮箱')}>
          <a
            href="mailto:46168745@qq.com"
            className="text-[12px] text-amber-200/80 transition-colors hover:text-amber-100"
          >
            46168745@qq.com
          </a>
        </SettingRow>
        <SettingRow title={t('settingsPage.about.copyright', '版权')}>
          <span className="text-[12px] text-white/60">© 2026 holder（老树苗）</span>
        </SettingRow>
        <SettingRow title={t('settingsPage.about.license', '许可')}>
          <span className="font-mono text-[12px] text-white/60">
            GPL-3.0-or-later / Commercial License
          </span>
        </SettingRow>
        <SettingRow title={t('settingsPage.about.version', '当前版本')}>
          <span className="font-mono text-[12px] text-white/60">{version}</span>
        </SettingRow>
        <SettingRow title={t('settingsPage.about.mode', '运行模式')}>
          <span className="font-mono text-[12px] text-white/60">{import.meta.env.MODE}</span>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.about.pageUrl', '页面地址')}
          description={window.location.origin}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={() => setSupportOpen((current) => !current)}>
              <Coffee className="h-3.5 w-3.5" />
              {t('settingsPage.about.supportAuthor', '请作者喝咖啡')}
            </ActionButton>
            <ActionButton onClick={() => void copyVersionInfo()}>
              <Copy className="h-3.5 w-3.5" />
              {t('settingsPage.about.copyVersion', '复制版本信息')}
            </ActionButton>
          </div>
        </SettingRow>
      </Section>
      {supportOpen && (
        <Section title={t('settingsPage.about.supportTitle', '请作者喝咖啡')}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <figure className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                <img
                  src={wechatSupportCode}
                  alt={t('settingsPage.about.wechatSupportAlt', '微信赞赏码')}
                  className="mx-auto aspect-square w-full max-w-[320px] rounded-lg object-contain"
                />
                <figcaption className="mt-2 text-center text-[12px] text-white/55">
                  {t('settingsPage.about.wechatSupportLabel', '微信赞赏')}
                </figcaption>
              </figure>
              <a
                href="https://ko-fi.com/holder2895"
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 transition-colors hover:border-amber-300/30 hover:bg-amber-300/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
                aria-label={t('settingsPage.about.kofiSupportAria', '打开 Ko-fi 赞赏页面')}
              >
                <img
                  src={kofiSupportCode}
                  alt={t('settingsPage.about.kofiSupportAlt', 'Ko-fi 赞赏二维码')}
                  className="mx-auto aspect-square w-full max-w-[320px] rounded-lg bg-white object-contain"
                />
                <span className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-white/55 transition-colors group-hover:text-amber-100">
                  {t('settingsPage.about.kofiSupportLabel', 'Ko-fi 赞赏')}
                  <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </a>
            </div>
            <p className="text-[12px] leading-6 text-white/60">
              {t(
                'settingsPage.about.supportDescription',
                '如果这个开源项目对你有帮助，欢迎请作者喝杯咖啡。你的支持会用于持续维护、修复问题和开发新功能。',
              )}
            </p>
          </div>
        </Section>
      )}
      {notice && <InlineNotice kind={notice.kind}>{notice.message}</InlineNotice>}
    </Page>
  );
}

function SystemUpdateSettings() {
  const { t } = useAppTranslation();
  const buildVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown';
  const [status, setStatus] = useState<SystemUpdateStatus | null>(null);
  const [result, setResult] = useState<SystemUpdateCheck | null>(null);
  const [sourceId, setSourceId] = useState('auto');
  const [busy, setBusy] = useState<'status' | 'network' | 'check' | 'download' | 'rollback' | null>(
    'status',
  );
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void loadSystemUpdateStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error: unknown) => {
        if (active)
          setNotice({
            kind: 'error',
            text:
              error instanceof Error
                ? error.message
                : t('settingsPage.systemUpdate.error.statusRead', '更新服务状态读取失败。'),
          });
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const runCheck = async () => {
    setBusy('check');
    setNotice(null);
    try {
      const next = await checkSystemUpdate(sourceId);
      setResult(next);
      if (!next.latest) {
        setNotice({
          kind: 'error',
          text: t(
            'settingsPage.systemUpdate.error.noManifest',
            '没有可读取的更新清单，请检查更新源配置。',
          ),
        });
      } else if (next.latest.updateAvailable) {
        setNotice({
          kind: 'success',
          text: t('settingsPage.systemUpdate.notice.newVersion', '发现新版本 {version}。', {
            version: next.latest.version,
          }),
        });
      } else {
        setNotice({
          kind: 'success',
          text: t('settingsPage.systemUpdate.notice.latest', '当前已是所选更新源提供的最新版本。'),
        });
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.systemUpdate.error.check', '更新检查失败。'),
      });
    } finally {
      setBusy(null);
    }
  };

  const runNetworkTest = async () => {
    setBusy('network');
    setNotice(null);
    try {
      const next = await testSystemUpdateNetwork(sourceId);
      const connectivity = summarizeSystemUpdateConnectivity(next);
      setResult(next);
      if (connectivity.configured === 0) {
        setNotice({
          kind: 'error',
          text: t(
            'settingsPage.systemUpdate.error.noConfiguredSource',
            '没有已配置的更新源，无法进行网络检测。',
          ),
        });
      } else if (connectivity.reachable === connectivity.configured) {
        setNotice({
          kind: 'success',
          text: t(
            'settingsPage.systemUpdate.notice.networkPassed',
            '网络检测通过：{count} 个更新源均可连接。',
            { count: connectivity.reachable },
          ),
        });
      } else {
        setNotice({
          kind: 'error',
          text: t(
            'settingsPage.systemUpdate.notice.networkPartial',
            '网络检测完成：{reachable}/{configured} 个更新源可连接，{failed} 个失败。',
            {
              reachable: connectivity.reachable,
              configured: connectivity.configured,
              failed: connectivity.failed,
            },
          ),
        });
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.systemUpdate.error.network', '网络检测失败。'),
      });
    } finally {
      setBusy(null);
    }
  };

  const runDownload = async () => {
    if (!result?.latest?.sourceId) return;
    setBusy('download');
    setNotice(null);
    try {
      const downloaded = await downloadSystemUpdate(result.latest.sourceId);
      setNotice({
        kind: 'success',
        text: t(
          'settingsPage.systemUpdate.notice.downloaded',
          '版本 {version} 已下载并通过 SHA-256 校验：{path}',
          { version: downloaded.version, path: downloaded.path },
        ),
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.systemUpdate.error.download', '更新包下载失败。'),
      });
    } finally {
      setBusy(null);
    }
  };

  const runRollback = async () => {
    if (!result?.previous?.sourceId) return;
    setBusy('rollback');
    setNotice(null);
    try {
      const downloaded = await prepareSystemRollback(result.previous.sourceId);
      setNotice({
        kind: 'success',
        text: t(
          'settingsPage.systemUpdate.notice.rollbackReady',
          '上一版本 {version} 已下载并通过 SHA-256 校验：{path}。请停止 Qiansi-Canvas，保留 data 目录，解压替换程序文件后重新运行安装脚本。',
          { version: downloaded.version, path: downloaded.path },
        ),
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settingsPage.systemUpdate.error.rollback', '上一版本准备失败。'),
      });
    } finally {
      setBusy(null);
    }
  };

  const displayedSources: CheckedUpdateSource[] =
    result?.sources ??
    status?.sources.map((source) => ({
      id: source.id,
      name: source.name,
      homepageUrl: source.homepageUrl,
      configured: source.configured,
      status: source.configured ? 'ready' : 'unconfigured',
      message: source.configured
        ? t('settingsPage.systemUpdate.status.waiting', '等待检测。')
        : t('settingsPage.systemUpdate.status.manifestUnconfigured', '尚未配置清单地址。'),
    })) ??
    [];

  return (
    <Page
      title={t('settings.systemUpdate', '系统更新')}
      description={t(
        'settingsPage.systemUpdate.description',
        '安全检查并下载千丝无限画布完整版本包。',
      )}
      wide
    >
      <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.035]">
        <div className="flex flex-wrap items-center justify-between gap-5 border-b border-white/[0.08] px-6 py-5">
          <div>
            <p className="text-[11px] font-medium text-emerald-300/80">
              {t('settingsPage.systemUpdate.safeSemiAutomatic', '安全半自动更新')}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white/90">
              {result?.latest?.updateAvailable
                ? t('settingsPage.systemUpdate.updateTo', '可更新到 {version}', {
                    version: result.latest.version,
                  })
                : t('settingsPage.systemUpdate.centerTitle', '千丝无限画布更新中心')}
            </h2>
            <p className="mt-2 text-[12px] text-white/38">
              {t('settingsPage.systemUpdate.currentVersion', '当前版本 {version}', {
                version: status?.currentVersion ?? buildVersion,
              })}
            </p>
            <p className="mt-1 text-[11px] text-white/32">
              {t(
                'settingsPage.systemUpdate.repositoryHint',
                '项目主页已连接；上传与发布仍需手动完成。',
              )}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={() => void runNetworkTest()} disabled={Boolean(busy)}>
              <Gauge className={`h-3.5 w-3.5 ${busy === 'network' ? 'animate-pulse' : ''}`} />
              {busy === 'network'
                ? t('settingsPage.systemUpdate.testing', '检测中…')
                : t('settingsPage.systemUpdate.testNetwork', '测试网络')}
            </ActionButton>
            <ActionButton onClick={() => void runCheck()} disabled={Boolean(busy)}>
              <RefreshCw className={`h-3.5 w-3.5 ${busy === 'check' ? 'animate-spin' : ''}`} />
              {busy === 'check'
                ? t('settingsPage.systemUpdate.checking', '检查中…')
                : t('settingsPage.systemUpdate.checkUpdates', '检查更新')}
            </ActionButton>
            <ActionButton
              onClick={() => void runDownload()}
              disabled={Boolean(busy) || !result?.latest?.updateAvailable}
            >
              <Download className="h-3.5 w-3.5" />
              {busy === 'download'
                ? t('settingsPage.systemUpdate.downloading', '下载并校验中…')
                : t('settingsPage.systemUpdate.downloadZip', '下载更新 ZIP')}
            </ActionButton>
            <ActionButton
              onClick={() => void runRollback()}
              disabled={Boolean(busy) || !result?.previous}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${busy === 'rollback' ? 'animate-spin' : ''}`} />
              {busy === 'rollback'
                ? t('settingsPage.systemUpdate.preparingRollback', '下载并校验上一版本…')
                : result?.previous
                  ? t('settingsPage.systemUpdate.rollbackTo', '准备退回 {version}', {
                      version: result.previous.version,
                    })
                  : t('settingsPage.systemUpdate.rollbackPrevious', '准备退回上一版本')}
            </ActionButton>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
            <p className="mb-2 text-[11px] font-medium text-white/45">
              {t('settingsPage.systemUpdate.downloadSource', '下载源')}
            </p>
            {['auto', ...(status?.sources.map((source) => source.id) ?? [])].map((id) => {
              const source = status?.sources.find((item) => item.id === id);
              const active = sourceId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSourceId(id);
                    setResult(null);
                  }}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${
                    active
                      ? 'border-emerald-400/25 bg-emerald-400/[0.1] text-emerald-100/85'
                      : 'border-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/75'
                  }`}
                >
                  <span>
                    {id === 'auto'
                      ? t('settingsPage.systemUpdate.autoSelect', '自动选择')
                      : (source?.name ?? id)}
                  </span>
                  {id !== 'auto' && (
                    <span
                      className={source?.configured ? 'text-emerald-300/65' : 'text-amber-200/45'}
                    >
                      {source?.configured
                        ? t('settingsPage.systemUpdate.configured', '已配置')
                        : t('settingsPage.systemUpdate.unconfigured', '未配置')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-white/45">
              {t('settingsPage.systemUpdate.sourceStatus', '更新源状态')}
            </p>
            {displayedSources.length === 0 && !busy && (
              <div className="rounded-xl border border-dashed border-white/[0.1] px-4 py-6 text-center text-[12px] text-white/35">
                {t('settingsPage.systemUpdate.noSources', '没有更新源配置。')}
              </div>
            )}
            {displayedSources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-black/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-white/78">{source.name}</p>
                    {source.homepageUrl && (
                      <a
                        href={source.homepageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-sky-200/70 transition-colors hover:bg-sky-300/[0.08] hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
                        aria-label={t('settingsPage.systemUpdate.openSource', '打开{source}', {
                          source: source.name,
                        })}
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>
                          {t('settingsPage.systemUpdate.openSource', '打开{source}', {
                            source: source.name,
                          })}
                        </span>
                      </a>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-white/35">
                    {source.status === 'ready' && source.manifest
                      ? t('settingsPage.systemUpdate.sourceVersion', '版本 {version} · {size}', {
                          version: source.manifest.version,
                          size: formatBytes(source.manifest.package.size),
                        })
                      : source.networkReachable === true
                        ? source.manifestAvailable
                          ? t(
                              'settingsPage.systemUpdate.status.networkManifestReady',
                              '网络可连接，更新清单地址可访问。',
                            )
                          : t(
                              'settingsPage.systemUpdate.status.networkManifestUnavailable',
                              '网络可连接，但更新清单暂不可用（HTTP {status}）。',
                              { status: source.httpStatus ?? '—' },
                            )
                        : source.message}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
                    source.status === 'ready'
                      ? 'bg-emerald-400/[0.1] text-emerald-300/75'
                      : source.status === 'error'
                        ? 'bg-rose-400/[0.1] text-rose-200/70'
                        : 'bg-amber-400/[0.08] text-amber-200/55'
                  }`}
                >
                  {source.status === 'ready'
                    ? source.latencyMs
                      ? `${source.latencyMs} ms`
                      : t('settingsPage.systemUpdate.waiting', '等待检测')
                    : source.status === 'error'
                      ? t('settingsPage.systemUpdate.failed', '检测失败')
                      : t('settingsPage.systemUpdate.unconfigured', '未配置')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}

      <Section title={t('settingsPage.systemUpdate.section.changelog', '本次更新内容')}>
        {result?.latest?.notes.length ? (
          <div className="space-y-2 px-4 py-4">
            {result.latest.notes.map((note) => (
              <p key={note} className="flex gap-2 text-[12px] leading-relaxed text-white/58">
                <span className="text-emerald-300/70">•</span>
                <span>{note}</span>
              </p>
            ))}
          </div>
        ) : (
          <div className="px-4 py-5 text-[12px] text-white/35">
            {t('settingsPage.systemUpdate.changelogEmpty', '检查到有效更新清单后显示版本说明。')}
          </div>
        )}
      </Section>

      <Section title={t('settingsPage.systemUpdate.section.rollback', '版本回退')}>
        <SettingRow
          title={
            result?.previous
              ? t('settingsPage.systemUpdate.rollbackAvailable', '可退回到 {version}', {
                  version: result.previous.version,
                })
              : t('settingsPage.systemUpdate.rollbackUnavailable', '尚未找到可退回版本')
          }
          description={
            result?.previous
              ? t('settingsPage.systemUpdate.rollbackSource', '来源：{source} · 完整版本包', {
                  source: result.previous.sourceName,
                })
              : t(
                  'settingsPage.systemUpdate.rollbackCheckHint',
                  '先检查更新；更新源需要在清单中提供低于当前版本的完整历史包。',
                )
          }
        >
          <span className="text-[11px] text-white/35">
            {t('settingsPage.systemUpdate.rollbackVerifiedOnly', '仅使用 SHA-256 校验包')}
          </span>
        </SettingRow>
      </Section>

      <Section title={t('settingsPage.systemUpdate.section.localDirectory', '本机更新目录')}>
        <SettingRow
          title={t('settingsPage.systemUpdate.sourceConfig', '更新源配置')}
          description={
            status?.sourceConfigPath ?? t('settingsPage.systemUpdate.loading', '正在读取…')
          }
        >
          <span className="text-[11px] text-white/35">
            {t('settingsPage.systemUpdate.manifestUrl', 'JSON 清单地址')}
          </span>
        </SettingRow>
        <SettingRow
          title={t('settingsPage.systemUpdate.verifiedPackages', '已校验版本包')}
          description={
            status?.downloadDirectory ?? t('settingsPage.systemUpdate.loading', '正在读取…')
          }
        >
          <span className="text-[11px] text-white/35">
            {t('settingsPage.systemUpdate.noAutoOverwrite', '不会自动覆盖')}
          </span>
        </SettingRow>
      </Section>

      <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-sky-100/60">
        {t(
          'settingsPage.systemUpdate.safetyNotice',
          '更新与版本回退只下载完整 ZIP 并校验清单中的 SHA-256，不会在线覆盖源码、自动解压或修改 data、画布素材和 API Key。',
        )}
      </div>
    </Page>
  );
}

function ShortcutSettings() {
  const { t } = useAppTranslation();
  const editingShortcutsEnabled = useCanvasPreferences((state) => state.editingShortcutsEnabled);
  const deleteShortcutEnabled = useCanvasPreferences((state) => state.deleteShortcutEnabled);
  const setPreference = useCanvasPreferences((state) => state.setPreference);
  return (
    <Page
      title={t('settings.shortcuts', '快捷键')}
      description={t(
        'settingsPage.shortcuts.description',
        '启用或停用画布编辑快捷键，并查看当前按键。',
      )}
    >
      <Section title={t('settingsPage.shortcuts.section.toggle', '快捷键开关')}>
        <SettingRow
          title={t('settingsPage.shortcuts.editingCommands', '编辑命令快捷键')}
          description={t(
            'settingsPage.shortcuts.editingCommandsDescription',
            '控制撤销、重做、成组、复制、粘贴、复制节点、指令框收起/展开和快捷键面板。',
          )}
        >
          <Toggle
            checked={editingShortcutsEnabled}
            onChange={() => setPreference('editingShortcutsEnabled', !editingShortcutsEnabled)}
            label={t('settingsPage.shortcuts.editingCommands', '编辑命令快捷键')}
          />
        </SettingRow>
        <SettingRow
          title={t('settingsPage.shortcuts.deleteKeys', 'Delete / Backspace 删除')}
          description={t(
            'settingsPage.shortcuts.deleteKeysDescription',
            '关闭后，按删除键不会删除画布节点或连线。',
          )}
        >
          <Toggle
            checked={deleteShortcutEnabled}
            onChange={() => setPreference('deleteShortcutEnabled', !deleteShortcutEnabled)}
            label={t('settingsPage.shortcuts.deleteKeyAction', '删除键快捷操作')}
          />
        </SettingRow>
      </Section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section
            key={group.title}
            className="rounded-xl border border-white/[0.09] bg-white/[0.035] p-4"
          >
            <h2 className="mb-4 flex items-center gap-2 text-[13px] font-medium text-cyan-300/80">
              <SlidersHorizontal className="h-4 w-4" />
              {t(`settingsPage.shortcuts.group.${group.id}`, group.title)}
            </h2>
            <div className="space-y-3">
              {group.items.map((shortcut) => (
                <div key={shortcut.action} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-white/45">
                    {t(`settingsPage.shortcuts.action.${shortcut.id}`, shortcut.action)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key, index) => (
                      <span key={`${shortcut.action}-${key}`} className="flex items-center gap-1">
                        {index > 0 && <span className="text-[11px] text-white/20">+</span>}
                        <kbd className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 text-[11px] text-white/70">
                          {key === '拖拽节点'
                            ? t('settingsPage.shortcuts.key.dragNode', key)
                            : key === '滚轮向上'
                              ? t('settingsPage.shortcuts.key.wheelUp', key)
                              : key === '滚轮向下'
                                ? t('settingsPage.shortcuts.key.wheelDown', key)
                                : key === '滚轮'
                                  ? t('settingsPage.shortcuts.key.wheel', key)
                                  : key === '拖拽空白处'
                                    ? t('settingsPage.shortcuts.key.dragCanvas', key)
                                    : key === '鼠标中键'
                                      ? t('settingsPage.shortcuts.key.middleMouse', key)
                                      : key === '拖拽'
                                        ? t('settingsPage.shortcuts.key.drag', key)
                                        : key === '点击'
                                          ? t('settingsPage.shortcuts.key.click', key)
                                          : key}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
