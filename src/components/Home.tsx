import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  AudioLines,
  Clock3,
  FileText,
  FolderKanban,
  HelpCircle,
  House,
  ImagePlay,
  ImageIcon,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  Palette,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Smile,
  User,
  WandSparkles,
  Zap,
} from 'lucide-react';
import bilibiliIcon from '../assets/creator-links/bilibili.ico';
import douyinIcon from '../assets/creator-links/douyin.ico';
import githubIcon from '../assets/creator-links/github.svg';
import youtubeIcon from '../assets/creator-links/youtube.ico';
import type { WorkspaceId } from '../canvas/nodeTypes';
import { WORKSPACES } from '../canvas/workspaces';
import {
  createBridgeWorkflowProject,
  openBridgeCanvasProject,
  useCanvasStore,
  type ModalKind,
} from '../store/canvasStore';
import { useAppTranslation } from '../i18n/appI18n';
import { ProjectHub } from './projects';
import { AppFooter } from './AppFooter';
import { useHomeNavigationStore } from '../store/homeNavigationStore';
import { enabledCompatiblePlugins } from '../services/pluginRegistry';
import { usePluginRegistryStore } from '../store/pluginRegistryStore';
import { usePluginUiStore } from '../store/pluginUiStore';
import { listProjects, type ProjectSummary } from '../services/projectHub';
import { selectRecentlyUsedCanvases } from './projects/projectPresentation';
import { splitHomeSidebarPlugins } from './homePluginPresentation';

type HomeCard = {
  id: Exclude<WorkspaceId, 'home'>;
  icon: ReactNode;
  accent: string;
  glow: string;
};

const cards: HomeCard[] = [
  {
    id: 'script',
    icon: <FileText className="h-5 w-5" />,
    accent: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
    glow: 'group-hover:shadow-violet-950/30',
  },
  {
    id: 'views',
    icon: <User className="h-5 w-5" />,
    accent: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    glow: 'group-hover:shadow-emerald-950/30',
  },
  {
    id: 'video',
    icon: <ImagePlay className="h-5 w-5" />,
    accent: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    glow: 'group-hover:shadow-rose-950/30',
  },
  {
    id: 'audio',
    icon: <AudioLines className="h-5 w-5" />,
    accent: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
    glow: 'group-hover:shadow-cyan-950/30',
  },
];

const creatorLinks = [
  {
    id: 'github',
    href: 'https://github.com/holder-fu/',
    labelKey: 'home.creator.github',
    label: 'GitHub 主页',
    iconSrc: githubIcon,
    iconClassName: 'rounded-full bg-white',
  },
  {
    id: 'youtube',
    href: 'https://www.youtube.com/@holder6522',
    labelKey: 'home.creator.youtube',
    label: 'YouTube 视频主页',
    iconSrc: youtubeIcon,
  },
  {
    id: 'bilibili',
    href: 'https://space.bilibili.com/410771067',
    labelKey: 'home.creator.bilibili',
    label: '哔哩哔哩视频主页',
    iconSrc: bilibiliIcon,
  },
  {
    id: 'douyin',
    href: 'https://www.douyin.com/user/MS4wLjABAAAA_h2K39mV-GSqRhsncB7G85OIKcNabnNSckQKOuH0sL4?from_tab_name=main&vid=7661509584624054885',
    labelKey: 'home.creator.douyin',
    label: '抖音视频主页',
    iconSrc: douyinIcon,
  },
] as const;

const libraryEntries: Array<{
  labelKey: string;
  descriptionKey: string;
  label: string;
  description: string;
  icon: ReactNode;
  modal: Exclude<ModalKind, null>;
}> = [
  {
    labelKey: 'home.library.prompt',
    descriptionKey: 'home.library.promptDescription',
    label: '提示词库',
    description: '查找并复用创作提示词',
    icon: <FileText className="h-4 w-4" />,
    modal: 'prompt-library',
  },
  {
    labelKey: 'home.library.style',
    descriptionKey: 'home.library.styleDescription',
    label: '风格库',
    description: '选择可复用的视觉风格',
    icon: <Palette className="h-4 w-4" />,
    modal: 'style-library',
  },
  {
    labelKey: 'home.library.effects',
    descriptionKey: 'home.library.effectsDescription',
    label: '特效库',
    description: '浏览动态 WebP 画面特效',
    icon: <Zap className="h-4 w-4" />,
    modal: 'effects-library',
  },
  {
    labelKey: 'home.library.character',
    descriptionKey: 'home.library.characterDescription',
    label: '角色库',
    description: '管理角色与人物参考',
    icon: <Smile className="h-4 w-4" />,
    modal: 'character-library',
  },
];

function HomeDashboard() {
  const { t, formatDate } = useAppTranslation();
  const setHomeSection = useHomeNavigationStore((state) => state.setSection);
  const setWorkspace = useCanvasStore((state) => state.setWorkspace);
  const setOpenModal = useCanvasStore((state) => state.setOpenModal);
  const tabs = useCanvasStore((state) => state.tabs);
  const activeTabId = useCanvasStore((state) => state.activeTabId);
  const [launchingWorkspace, setLaunchingWorkspace] = useState<Exclude<WorkspaceId, 'home'> | null>(
    null,
  );
  const [launchError, setLaunchError] = useState('');
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(true);
  const [recentProjectsError, setRecentProjectsError] = useState('');
  const [recentProjectsReload, setRecentProjectsReload] = useState(0);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const fallbackResumeWorkspace =
    activeTab?.workspace === 'home' ? 'views' : (activeTab?.workspace ?? 'views');
  const primaryRecentProject = recentProjects[0];
  const resumeWorkspace = primaryRecentProject?.activeWorkspace ?? fallbackResumeWorkspace;
  const activeCanvasName =
    primaryRecentProject?.name ?? activeTab?.name ?? WORKSPACES[resumeWorkspace].title;
  const openingPrimaryProject = openingProjectId === primaryRecentProject?.id;
  const interactionBusy = launchingWorkspace !== null || openingProjectId !== null;

  useEffect(() => {
    const controller = new AbortController();
    setRecentProjectsLoading(true);
    setRecentProjectsError('');
    void listProjects({ signal: controller.signal })
      .then((catalog) => {
        setRecentProjects(selectRecentlyUsedCanvases(catalog.projects));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRecentProjectsError(
          error instanceof Error && error.message.trim()
            ? error.message
            : t('home.recentProjectsLoadFailed', '最近项目读取失败。'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecentProjectsLoading(false);
      });
    return () => controller.abort();
  }, [recentProjectsReload, t]);

  const createWorkflowProject = async (workspace: Exclude<WorkspaceId, 'home'>) => {
    if (interactionBusy) return;
    setLaunchError('');
    setLaunchingWorkspace(workspace);
    const created = await createBridgeWorkflowProject(workspace, WORKSPACES[workspace].title);
    if (!created) {
      setLaunchError(
        t(
          'home.workflowLaunchFailed',
          '新项目未能完整创建并保存，已保留原项目，请重试或前往“所有项目”检查。',
        ),
      );
      setLaunchingWorkspace(null);
    }
  };

  const openRecentProject = async (project: ProjectSummary) => {
    if (interactionBusy) return;
    setLaunchError('');
    setOpeningProjectId(project.id);
    const opened = await openBridgeCanvasProject(project.id, { initialZoom: 0.3 });
    if (!opened) {
      setOpeningProjectId(null);
      setLaunchError(t('home.recentProjectOpenFailed', '项目未能安全打开，请前往“所有项目”检查。'));
    }
  };

  const enterCurrentCanvas = () => {
    if (primaryRecentProject) {
      void openRecentProject(primaryRecentProject);
      return;
    }
    setWorkspace(resumeWorkspace);
  };

  const openResource = (entry: (typeof libraryEntries)[number]) => {
    setOpenModal(entry.modal);
  };

  return (
    <section className="relative min-h-full w-full overflow-hidden px-5 py-6 sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-18rem] left-1/2 h-[42rem] w-[58rem] -translate-x-1/2 rounded-full bg-violet-500/[0.055] blur-3xl" />
        <div className="absolute top-[22rem] left-[12%] h-72 w-72 rounded-full bg-emerald-500/[0.025] blur-3xl" />
        <div className="absolute top-[18rem] right-[8%] h-80 w-80 rounded-full bg-cyan-500/[0.025] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[1240px] flex-col">
        <section className="grid items-end gap-6 border-b border-white/[0.07] pb-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-2 text-xs font-medium text-emerald-300/80">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10">
                <WandSparkles className="h-3.5 w-3.5" />
              </span>
              {t('home.eyebrow')}
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-[42px] sm:leading-[1.12]">
              {t('home.title')}
              <span className="mt-2 block text-white/45">{t('home.subtitle')}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/48 sm:text-[15px]">
              {t('home.description')}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                data-theme-role="primary-action"
                type="button"
                onClick={enterCurrentCanvas}
                disabled={interactionBusy || recentProjectsLoading}
                aria-busy={recentProjectsLoading || openingPrimaryProject}
                className="group flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#151517] shadow-[0_10px_34px_rgba(0,0,0,0.3)] transition hover:-translate-y-0.5 hover:bg-white/90"
              >
                {recentProjectsLoading || openingPrimaryProject ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                {recentProjectsLoading
                  ? t('home.canvasLoading', '项目加载中…')
                  : openingPrimaryProject
                    ? t('home.openingProject', '正在打开…')
                    : t('home.continueCanvas')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            {launchError && (
              <p className="mt-3 max-w-xl text-xs leading-5 text-amber-300/85" role="alert">
                {launchError}
              </p>
            )}
          </div>

          <button
            data-theme-role="home-card"
            type="button"
            onClick={enterCurrentCanvas}
            disabled={interactionBusy || recentProjectsLoading}
            aria-busy={recentProjectsLoading || openingPrimaryProject}
            className="group rounded-2xl border border-white/[0.08] bg-[#19191c]/80 p-4 text-left shadow-[0_18px_50px_rgba(0,0,0,0.24)] transition hover:border-white/[0.15] hover:bg-[#1d1d20]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-100">
                  <Layers3 className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-medium tracking-wide text-white/35">
                    {t('home.currentCanvas', '当前画布')}
                  </span>
                  <span className="mt-1 block truncate text-sm font-medium text-white/88">
                    {activeCanvasName}
                  </span>
                </span>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-3 text-xs">
              <span className="flex items-center gap-1.5 text-white/42">
                <Layers3 className="h-3.5 w-3.5" />
                {t(`workspace.${resumeWorkspace}.title`, WORKSPACES[resumeWorkspace].title)}
              </span>
              <span className="flex items-center justify-end gap-1.5 text-white/42">
                <Clock3 className="h-3.5 w-3.5" />
                {t('home.autosave')}
              </span>
            </div>
          </button>
        </section>

        <section className="pt-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white/88">{t('home.selectWorkflow')}</h2>
              <p className="mt-1 text-xs text-white/38">{t('home.workflowHint')}</p>
            </div>
            <span className="hidden text-[10px] text-white/28 sm:block">
              {t('home.commonWorkspaces')}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const config = WORKSPACES[card.id];
              return (
                <button
                  data-theme-role="home-card"
                  key={card.id}
                  type="button"
                  onClick={() => void createWorkflowProject(card.id)}
                  disabled={interactionBusy}
                  aria-busy={launchingWorkspace === card.id}
                  className={`group relative flex min-h-40 flex-col overflow-hidden rounded-2xl border border-white/[0.075] bg-[#18181b]/76 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-[#1d1d20] hover:shadow-2xl ${card.glow}`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border ${card.accent}`}
                  >
                    {card.icon}
                  </div>
                  <h3 className="mt-5 text-[15px] font-medium text-white/90">
                    {t(`workspace.${card.id}.title`, config.title)}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/42">
                    {t(`workspace.${card.id}.tagline`, config.tagline)}
                  </p>
                  <span className="mt-auto flex items-center gap-1 pt-4 text-xs font-medium text-white/50 transition-colors group-hover:text-white/82">
                    {launchingWorkspace === card.id
                      ? t('home.creatingProject', '正在创建项目…')
                      : t('home.openWorkspace')}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="pt-6" aria-labelledby="home-recent-projects-title">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 id="home-recent-projects-title" className="text-sm font-medium text-white/72">
                {t('home.recentProjects', '最近使用的画布')}
              </h2>
              <p className="mt-1 text-[10px] text-white/32">
                {t('home.recentProjectsHint', '快速进入最近使用的 4 个画布')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHomeSection('projects')}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-white/42 transition hover:bg-white/[0.05] hover:text-white/75"
            >
              {t('home.viewAllProjects', '查看全部项目')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentProjectsLoading ? (
            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
              aria-hidden="true"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  data-theme-role="home-compact-card"
                  key={index}
                  className="h-[76px] animate-pulse rounded-xl border border-white/[0.055] bg-white/[0.025]"
                />
              ))}
            </div>
          ) : recentProjectsError ? (
            <div className="flex min-h-[70px] items-center justify-between gap-3 rounded-xl border border-amber-400/10 bg-amber-400/[0.035] px-3.5 py-3 text-xs text-amber-100/55">
              <span className="line-clamp-2">{recentProjectsError}</span>
              <button
                type="button"
                onClick={() => setRecentProjectsReload((value) => value + 1)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-white/60 hover:bg-white/[0.08] hover:text-white/85"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('common.retry', '重试')}
              </button>
            </div>
          ) : recentProjects.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {recentProjects.map((project) => {
                const coverUrl = project.coverUrl || project.autoCoverUrl;
                const opening = openingProjectId === project.id;
                return (
                  <button
                    data-theme-role="home-compact-card"
                    key={project.id}
                    type="button"
                    onClick={() => void openRecentProject(project)}
                    disabled={interactionBusy}
                    aria-busy={opening}
                    aria-label={t('home.openRecentProject', '打开项目“{name}”', {
                      name: project.name,
                    })}
                    className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-2 text-left transition hover:border-white/[0.14] hover:bg-white/[0.055] disabled:cursor-wait disabled:opacity-55"
                  >
                    <span className="relative flex aspect-video h-[58px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.045] text-white/20">
                      <ImageIcon className="h-5 w-5" />
                      {coverUrl && (
                        <img
                          src={coverUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-white/78 group-hover:text-white/92">
                        {project.name}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-[10px] text-white/30">
                        {opening && <LoaderCircle className="h-3 w-3 animate-spin" />}
                        {opening
                          ? t('home.openingProject', '正在打开…')
                          : formatDate(project.updatedAt, {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/18 transition group-hover:translate-x-0.5 group-hover:text-white/55" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[70px] items-center justify-center rounded-xl border border-dashed border-white/[0.07] text-xs text-white/28">
              {t('home.noRecentProjects', '暂无可打开的项目')}
            </div>
          )}
        </section>

        <section className="pt-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-white/72">{t('home.resources')}</h2>
              <span className="text-[10px] text-white/28">
                {t('home.openFromCanvas', '从当前画布打开')}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {libraryEntries.map((entry) => (
                <button
                  data-theme-role="home-compact-card"
                  key={entry.modal}
                  type="button"
                  onClick={() => openResource(entry)}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3 text-left transition hover:border-white/[0.14] hover:bg-white/[0.055]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.055] text-white/58 transition group-hover:bg-white/[0.09] group-hover:text-white/85">
                    {entry.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-white/75">
                      {t(entry.labelKey, entry.label)}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-white/34">
                      {t(entry.descriptionKey, entry.description)}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-white/22 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
                </button>
              ))}
            </div>
          </div>
        </section>

        <AppFooter />
      </div>
    </section>
  );
}

export function Home() {
  const { t } = useAppTranslation();
  const workspaceTransition = useCanvasStore((state) => state.workspaceTransition);
  const section = useHomeNavigationStore((state) => state.section);
  const setSection = useHomeNavigationStore((state) => state.setSection);
  const pluginCatalog = usePluginRegistryStore((state) => state.catalog);
  const openPluginPanel = usePluginUiStore((state) => state.openPanel);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [morePluginsOpen, setMorePluginsOpen] = useState(false);
  const morePluginsRootRef = useRef<HTMLDivElement>(null);
  const morePluginsButtonRef = useRef<HTMLButtonElement>(null);
  const availablePlugins = enabledCompatiblePlugins(pluginCatalog);
  const { visiblePlugins, overflowPlugins } = splitHomeSidebarPlugins(availablePlugins);

  useEffect(() => {
    if (!morePluginsOpen) return;
    if (overflowPlugins.length === 0) {
      setMorePluginsOpen(false);
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      morePluginsRootRef.current
        ?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')
        ?.focus();
    });
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!morePluginsRootRef.current?.contains(event.target as Node)) setMorePluginsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMorePluginsOpen(false);
      morePluginsButtonRef.current?.focus();
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [morePluginsOpen, overflowPlugins.length]);

  const navigationClass = (active: boolean) =>
    `flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition ${
      active
        ? 'bg-white/[0.085] font-medium text-white/92'
        : 'text-white/48 hover:bg-white/[0.05] hover:text-white/78'
    }`;

  const renderPluginEntry = (plugin: (typeof availablePlugins)[number], inOverflowMenu = false) => {
    const panels = plugin.manifest.runtime ? plugin.manifest.contributes.panels : [];
    const panel = panels.find((entry) => entry.position === 'fullscreen') ?? panels[0];
    const content = (
      <>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-400/12 bg-emerald-400/[0.06] text-emerald-300/70">
          <Puzzle className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">{plugin.manifest.name}</span>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/75" aria-hidden="true" />
      </>
    );
    const rowClass = `flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition ${
      inOverflowMenu
        ? 'text-white/68 outline-none hover:bg-white/[0.07] hover:text-white focus:bg-white/[0.08] focus:text-white'
        : 'text-white/55 hover:bg-white/[0.05] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45'
    }`;

    return panel ? (
      <button
        key={plugin.manifest.id}
        type="button"
        role={inOverflowMenu ? 'menuitem' : undefined}
        onClick={() => {
          if (inOverflowMenu) setMorePluginsOpen(false);
          openPluginPanel(plugin.manifest.id, panel.id);
        }}
        className={rowClass}
        aria-label={t('home.openPlugin', '打开 {name}', {
          name: plugin.manifest.name,
        })}
        title={panel.label}
      >
        {content}
      </button>
    ) : (
      <div
        key={plugin.manifest.id}
        role={inOverflowMenu ? 'menuitem' : undefined}
        aria-disabled={inOverflowMenu || undefined}
        className={`${rowClass} text-white/42`}
        title={t('home.pluginEnabled', '{name} 已启用', {
          name: plugin.manifest.name,
        })}
      >
        {content}
      </div>
    );
  };

  return (
    <main
      data-theme-role="home-page"
      className="relative flex h-full w-full overflow-hidden bg-canvas pt-14"
    >
      <aside
        data-theme-role="home-sidebar"
        className="hidden h-full w-56 shrink-0 flex-col border-r border-white/[0.07] bg-[#151517]/92 p-3 md:flex"
      >
        <button
          data-theme-role="primary-action"
          type="button"
          onClick={() => {
            setSection('projects');
            setCreateDialogOpen(true);
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-[#07120a] transition hover:bg-emerald-400"
        >
          <Plus className="h-4 w-4" />
          {t('home.newProject', '新建项目')}
        </button>

        <nav className="mt-4 space-y-1" aria-label={t('home.navigationLabel', '首页导航')}>
          <button
            type="button"
            className={navigationClass(section === 'home')}
            aria-current={section === 'home' ? 'page' : undefined}
            onClick={() => setSection('home')}
          >
            <House className="h-4 w-4" />
            {t('home.nav.home', '首页')}
          </button>
          <button
            type="button"
            className={navigationClass(section === 'projects')}
            aria-current={section === 'projects' ? 'page' : undefined}
            onClick={() => setSection('projects')}
          >
            <FolderKanban className="h-4 w-4" />
            {t('home.nav.projects', '项目')}
          </button>

          {availablePlugins.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <p className="mb-1.5 flex items-center justify-between px-3 text-[11px] text-white/32">
                <span>{t('home.availablePlugins', '可用插件')}</span>
                <span
                  aria-label={t('home.availablePluginCount', '{count} 个可用插件', {
                    count: availablePlugins.length,
                  })}
                >
                  {availablePlugins.length}
                </span>
              </p>
              <div className="space-y-1">
                {visiblePlugins.map((plugin) => renderPluginEntry(plugin))}
                {overflowPlugins.length > 0 && (
                  <div ref={morePluginsRootRef} className="relative">
                    <button
                      ref={morePluginsButtonRef}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={morePluginsOpen}
                      aria-label={t('home.morePluginsCount', '还有 {count} 个插件', {
                        count: overflowPlugins.length,
                      })}
                      onClick={() => setMorePluginsOpen((open) => !open)}
                      className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-white/55 transition hover:bg-white/[0.05] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-white/46">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">{t('home.morePlugins', '更多')}</span>
                      <span className="text-[10px] text-white/32">+{overflowPlugins.length}</span>
                    </button>

                    {morePluginsOpen && (
                      <div
                        data-theme-role="popover-surface"
                        role="menu"
                        aria-label={t('home.morePluginsMenu', '更多可用插件')}
                        className="absolute bottom-0 left-full z-50 ml-2 max-h-[min(28rem,calc(100vh-7rem))] w-56 space-y-1 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#232326] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
                      >
                        {overflowPlugins.map((plugin) => renderPluginEntry(plugin, true))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>

        <div className="mt-auto border-t border-white/[0.07] pt-3">
          <a
            href="https://holder2895.feishu.cn/wiki/PDHkwkKDMiF3ymkLuYScgDesnwe?from=from_copylink"
            target="_blank"
            rel="noopener noreferrer"
            className={navigationClass(false)}
          >
            <HelpCircle className="h-4 w-4" />
            {t('home.help', '帮助')}
          </a>
          <div
            className="mt-2 flex items-center gap-1 px-2"
            aria-label={t('home.creatorLinks', '个人主页')}
          >
            {creatorLinks.map((link) => {
              const label = t(link.labelKey, link.label);
              return (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-white/42 transition hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/55"
                >
                  <img
                    src={link.iconSrc}
                    alt=""
                    aria-hidden="true"
                    className={`h-4 w-4 object-contain ${'iconClassName' in link ? link.iconClassName : ''}`}
                  />
                </a>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="border-b border-white/[0.07] px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSection('home')}
              className={navigationClass(section === 'home')}
            >
              <House className="h-4 w-4" />
              {t('home.nav.home', '首页')}
            </button>
            <button
              type="button"
              onClick={() => setSection('projects')}
              className={navigationClass(section === 'projects')}
            >
              <FolderKanban className="h-4 w-4" />
              {t('home.nav.projects', '项目')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('projects');
                setCreateDialogOpen(true);
              }}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-[#07120a]"
            >
              <Plus className="h-4 w-4" />
              {t('home.new', '新建')}
            </button>
          </div>
        </div>

        {section === 'home' ? (
          <HomeDashboard />
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-5 py-6 sm:px-8 lg:px-10">
            <ProjectHub
              createDialogOpen={createDialogOpen}
              onCreateDialogOpenChange={setCreateDialogOpen}
            />
            <AppFooter />
          </div>
        )}
      </div>

      {workspaceTransition && workspaceTransition !== 'home' && (
        <div
          data-theme-role="home-loading-backdrop"
          className="fixed inset-0 z-[115] flex items-center justify-center bg-[#141414]/[0.97] backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            data-theme-role="home-loading-surface"
            className="flex min-w-52 flex-col items-center rounded-2xl border border-white/[0.06] bg-[#18181a]/85 px-8 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <LoaderCircle className="h-9 w-9 animate-spin text-white/65" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium text-white/88">
              {t('home.canvasLoading', '项目加载中…')}
            </p>
            <p className="mt-1 text-xs text-white/35">
              {t(`workspace.${workspaceTransition}.title`, WORKSPACES[workspaceTransition].title)}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
