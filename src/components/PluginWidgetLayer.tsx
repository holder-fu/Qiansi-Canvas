import { useEffect, useRef, useState } from 'react';
import { AudioLines, Languages, Puzzle, X } from 'lucide-react';
import {
  pluginAssetUrl,
  type InstalledPlugin,
  type PluginWidgetContribution,
} from '../services/pluginRegistry';
import { usePluginRegistryStore } from '../store/pluginRegistryStore';
import { usePluginUiStore } from '../store/pluginUiStore';
import { useAppTranslation } from '../i18n/appI18n';
import { readPluginPreference, writePluginPreference } from '../services/pluginPreferences';
import { PLUGIN_NOTICE_EVENT, PluginSandboxFrame } from './PluginSandboxFrame';

const CENTER_ZONE_WIDTH = 200;
const CENTER_ZONE_HEIGHT = 300;
const CENTER_ZONE_BOTTOM_GAP = 86;
const HIGH_FIVE_TARGET = 10;
const HEARTS_PER_HIGH_FIVE = 12;
const HIGH_FIVE_SCALE = 2.15;
const VIEWPORT_MARGIN = 12;
const REMINDER_MIN_DELAY = 90_000;
const REMINDER_MAX_DELAY = 210_000;
const REMINDER_VISIBLE_DURATION = 7_000;
const PLUGIN_PANEL_LANGUAGE_KEY = 'panel.language';

type PluginPanelLanguage = 'zh-CN' | 'en-US';

function readPluginPanelLanguage(pluginId: string): PluginPanelLanguage {
  try {
    return readPluginPreference(pluginId, PLUGIN_PANEL_LANGUAGE_KEY) === 'en-US'
      ? 'en-US'
      : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

const GENTLE_REMINDER_KEYS = [
  'pluginHost.pet.reminder.focus',
  'pluginHost.pet.reminder.drink',
  'pluginHost.pet.reminder.stretch',
  'pluginHost.pet.reminder.rest',
  'pluginHost.pet.reminder.blink',
] as const;

function gentleReminderKeyForNow() {
  const hour = new Date().getHours();
  if (hour >= 7 && hour < 10) return 'pluginHost.pet.reminder.morning';
  if (hour >= 11 && hour < 14) return 'pluginHost.pet.reminder.lunch';
  if (hour >= 17 && hour < 20) return 'pluginHost.pet.reminder.dinner';
  return (
    GENTLE_REMINDER_KEYS[Math.floor(Math.random() * GENTLE_REMINDER_KEYS.length)] ??
    'pluginHost.pet.reminder.rest'
  );
}

type WidgetPosition = { x: number; y: number };
type HeartBurst = {
  id: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
  delay: number;
};

function clampPosition(position: WidgetPosition, width: number): WidgetPosition {
  if (typeof window === 'undefined') return position;
  return {
    x: Math.min(
      Math.max(VIEWPORT_MARGIN, position.x),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    ),
    y: Math.min(
      Math.max(VIEWPORT_MARGIN, position.y),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - width - VIEWPORT_MARGIN),
    ),
  };
}

function defaultPosition(width: number): WidgetPosition {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  return clampPosition(
    { x: window.innerWidth - width - 20, y: window.innerHeight - width - 56 },
    width,
  );
}

function isInCenterZone(position: WidgetPosition, width: number) {
  if (typeof window === 'undefined') return false;
  const centerX = position.x + width / 2;
  const centerY = position.y + width / 2;
  const zoneLeft = (window.innerWidth - CENTER_ZONE_WIDTH) / 2;
  const zoneTop = window.innerHeight - CENTER_ZONE_HEIGHT - CENTER_ZONE_BOTTOM_GAP;
  return (
    centerX >= zoneLeft &&
    centerX <= zoneLeft + CENTER_ZONE_WIDTH &&
    centerY >= zoneTop &&
    centerY <= zoneTop + CENTER_ZONE_HEIGHT
  );
}

function PetWidget({
  plugin,
  widget,
}: {
  plugin: InstalledPlugin;
  widget: PluginWidgetContribution;
}) {
  const { t } = useAppTranslation();
  const [messageOpen, setMessageOpen] = useState(false);
  const [reminderKey, setReminderKey] = useState<string | null>(null);
  const [position, setPosition] = useState<WidgetPosition>(() => defaultPosition(widget.width));
  const [dragging, setDragging] = useState(false);
  const [highFiveMode, setHighFiveMode] = useState(false);
  const [highFiveCount, setHighFiveCount] = useState(0);
  const [hearts, setHearts] = useState<HeartBurst[]>([]);
  const heartSequence = useRef(0);
  const preHighFivePosition = useRef<WidgetPosition | null>(null);
  const drag = useRef<{
    pointerId: number;
    startPointer: WidgetPosition;
    startPosition: WidgetPosition;
  } | null>(null);
  const wasDragged = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => clampPosition(current, widget.width));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [widget.width]);

  useEffect(() => {
    if (highFiveMode) return;
    let reminderTimer: number | undefined;
    let dismissTimer: number | undefined;
    const scheduleReminder = () => {
      const delay = REMINDER_MIN_DELAY + Math.random() * (REMINDER_MAX_DELAY - REMINDER_MIN_DELAY);
      reminderTimer = window.setTimeout(() => {
        setReminderKey(gentleReminderKeyForNow());
        setMessageOpen(true);
        dismissTimer = window.setTimeout(() => setMessageOpen(false), REMINDER_VISIBLE_DURATION);
        scheduleReminder();
      }, delay);
    };
    scheduleReminder();
    return () => {
      if (reminderTimer) window.clearTimeout(reminderTimer);
      if (dismissTimer) window.clearTimeout(dismissTimer);
    };
  }, [highFiveMode]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => {
      const activeDrag = drag.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      const next = clampPosition(
        {
          x: activeDrag.startPosition.x + event.clientX - activeDrag.startPointer.x,
          y: activeDrag.startPosition.y + event.clientY - activeDrag.startPointer.y,
        },
        widget.width,
      );
      if (
        Math.hypot(
          event.clientX - activeDrag.startPointer.x,
          event.clientY - activeDrag.startPointer.y,
        ) > 4
      ) {
        wasDragged.current = true;
      }
      setPosition(next);
      const inCenterZone = isInCenterZone(next, widget.width);
      if (inCenterZone && !highFiveMode) {
        preHighFivePosition.current = activeDrag.startPosition;
        setHighFiveMode(true);
        setHighFiveCount(0);
        setMessageOpen(false);
      } else if (!inCenterZone && highFiveMode) {
        setHighFiveMode(false);
        setHighFiveCount(0);
        setHearts([]);
        preHighFivePosition.current = null;
      }
    };
    const handleEnd = (event: PointerEvent) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [dragging, highFiveMode, widget.width]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = {
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition: position,
    };
    wasDragged.current = false;
    setDragging(true);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    if (!highFiveMode) {
      setReminderKey(null);
      setMessageOpen((open) => !open);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = (event.clientX - bounds.left) / bounds.width;
    const pointerY = (event.clientY - bounds.top) / bounds.height;
    const clickedRaisedPaw =
      pointerX >= 0.1 && pointerX <= 0.4 && pointerY >= 0.12 && pointerY <= 0.4;
    if (!clickedRaisedPaw) return;
    const nextCount = highFiveCount + 1;
    setHighFiveCount(nextCount);
    const burst = Array.from({ length: HEARTS_PER_HIGH_FIVE }, () => {
      heartSequence.current += 1;
      const angle = Math.random() * Math.PI * 2;
      const distance = 54 + Math.random() * 84;
      return {
        id: heartSequence.current,
        offsetX: Math.cos(angle) * distance,
        offsetY: Math.sin(angle) * distance - 22,
        rotation: -32 + Math.random() * 64,
        scale: 0.65 + Math.random() * 0.75,
        delay: Math.round(Math.random() * 100),
      };
    });
    setHearts((current) => [...current, ...burst]);
    if (nextCount >= HIGH_FIVE_TARGET) {
      const home = preHighFivePosition.current;
      if (home) setPosition(clampPosition(home, widget.width));
      setHighFiveMode(false);
      setHighFiveCount(0);
      preHighFivePosition.current = null;
    }
  };

  const asset = highFiveMode && widget.centerAsset ? widget.centerAsset : widget.asset;

  return (
    <>
      {dragging && !highFiveMode && (
        <div
          className="pointer-events-none fixed bottom-[86px] left-1/2 z-[37] -translate-x-1/2 rounded-[24px] border border-amber-200/20 bg-amber-100/[0.025] shadow-[inset_0_0_36px_rgba(251,191,36,0.05)]"
          style={{ width: CENTER_ZONE_WIDTH, height: CENTER_ZONE_HEIGHT }}
        />
      )}
      <div
        className="pointer-events-auto fixed z-[38]"
        style={{ left: position.x, top: position.y }}
      >
        {messageOpen && (
          <div className="absolute right-0 bottom-full mb-1.5 w-max max-w-[min(14rem,calc(100vw-24px))] whitespace-normal break-words rounded-xl border border-white/10 bg-[#18181b]/95 px-3 py-2 text-[12px] leading-5 text-white/80 shadow-xl backdrop-blur-md">
            {reminderKey ? t(reminderKey) : widget.message}
          </div>
        )}
        <button
          type="button"
          className={`qiansi-plugin-pet origin-bottom select-none outline-none transition-[filter,transform] hover:brightness-110 focus-visible:drop-shadow-[0_0_8px_rgba(252,211,77,0.55)] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          aria-label={
            highFiveMode
              ? t('pluginHost.pet.highFiveAria', '点击 {label} 举起的手掌击掌', {
                  label: widget.label,
                })
              : t('pluginHost.pet.draggableAria', '{label}，可拖动', {
                  label: widget.label,
                })
          }
        >
          <img
            src={pluginAssetUrl(plugin.manifest.id, asset, undefined, plugin.manifest.version)}
            alt={highFiveMode ? t('pluginHost.pet.highFiveAlt', '微笑举掌的橘猫') : widget.label}
            draggable={false}
            style={{ width: highFiveMode ? widget.width * HIGH_FIVE_SCALE : widget.width }}
            className="block h-auto select-none drop-shadow-[0_14px_18px_rgba(0,0,0,0.36)]"
          />
        </button>
        {hearts.map((heart) => (
          <span
            key={heart.id}
            className="qiansi-high-five-heart pointer-events-none absolute text-2xl"
            style={
              {
                '--heart-offset-x': `${heart.offsetX}px`,
                '--heart-offset-y': `${heart.offsetY}px`,
                '--heart-rotation': `${heart.rotation}deg`,
                '--heart-scale': heart.scale,
                animationDelay: `${heart.delay}ms`,
                left: highFiveMode ? '25%' : '50%',
                top: highFiveMode ? '28%' : '50%',
              } as React.CSSProperties
            }
            onAnimationEnd={() =>
              setHearts((current) => current.filter((item) => item.id !== heart.id))
            }
          >
            ♥
          </span>
        ))}
      </div>
    </>
  );
}

export function PluginWidgetLayer() {
  const { t } = useAppTranslation();
  const catalog = usePluginRegistryStore((state) => state.catalog);
  const loaded = usePluginRegistryStore((state) => state.loaded);
  const loading = usePluginRegistryStore((state) => state.loading);
  const refresh = usePluginRegistryStore((state) => state.refresh);
  const panelOverrides = usePluginUiStore((state) => state.panelOverrides);
  const closePanel = usePluginUiStore((state) => state.closePanel);
  const [notice, setNotice] = useState<{ pluginName: string; message: string } | null>(null);
  const [pluginPanelLanguages, setPluginPanelLanguages] = useState<
    Record<string, PluginPanelLanguage>
  >({});

  useEffect(() => {
    if (!loaded && !loading) void refresh().catch(() => {});
  }, [loaded, loading, refresh]);

  useEffect(() => {
    let timer: number | undefined;
    const handleNotice = (event: Event) => {
      const detail = (event as CustomEvent<{ pluginName?: string; message?: string }>).detail;
      const message = String(detail?.message || '').trim();
      if (!message) return;
      setNotice({
        pluginName: String(detail?.pluginName || t('pluginHost.fallbackPluginName', '插件')),
        message,
      });
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), 3600);
    };
    window.addEventListener(PLUGIN_NOTICE_EVENT, handleNotice);
    return () => {
      window.removeEventListener(PLUGIN_NOTICE_EVENT, handleNotice);
      if (timer) window.clearTimeout(timer);
    };
  }, [t]);

  const pets =
    catalog?.plugins.flatMap((plugin) =>
      plugin.enabled && plugin.compatible
        ? plugin.manifest.contributes.widgets
            .filter((widget) => widget.type === 'pet')
            .map((widget) => ({ plugin, widget }))
        : [],
    ) ?? [];
  const panels =
    catalog?.plugins.flatMap((plugin) =>
      plugin.enabled && plugin.compatible && plugin.manifest.runtime
        ? plugin.manifest.contributes.panels
            .filter(
              (panel) => panelOverrides[`${plugin.manifest.id}:${panel.id}`] ?? panel.defaultOpen,
            )
            .map((panel) => ({ plugin, panel }))
        : [],
    ) ?? [];
  const activeFullscreenPanel = panels.findLast(({ panel }) => panel.position === 'fullscreen');
  const fullscreenPluginIds = Array.from(
    new Set(
      panels
        .filter(({ panel }) => panel.position === 'fullscreen')
        .map(({ plugin }) => plugin.manifest.id),
    ),
  ).join('|');

  useEffect(() => {
    if (!fullscreenPluginIds) return;
    setPluginPanelLanguages((current) => {
      const next = { ...current };
      let changed = false;
      for (const pluginId of fullscreenPluginIds.split('|')) {
        if (next[pluginId]) continue;
        next[pluginId] = readPluginPanelLanguage(pluginId);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [fullscreenPluginIds]);

  const setPluginPanelLanguage = (pluginId: string, locale: PluginPanelLanguage) => {
    setPluginPanelLanguages((current) => ({ ...current, [pluginId]: locale }));
    try {
      writePluginPreference(pluginId, PLUGIN_PANEL_LANGUAGE_KEY, locale);
    } catch {
      // The current panel can still use its isolated in-memory language when storage is unavailable.
    }
  };

  useEffect(() => {
    if (!activeFullscreenPanel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePanel(activeFullscreenPanel.plugin.manifest.id, activeFullscreenPanel.panel.id);
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [activeFullscreenPanel, closePanel]);

  if (pets.length === 0 && panels.length === 0 && !notice) return null;

  return (
    <>
      {pets.map(({ plugin, widget }) => (
        <PetWidget key={`${plugin.manifest.id}:${widget.id}`} plugin={plugin} widget={widget} />
      ))}
      {panels.map(({ plugin, panel }) => {
        if (panel.position === 'fullscreen') {
          const panelLanguage = pluginPanelLanguages[plugin.manifest.id] ?? 'zh-CN';
          const panelIsEnglish = panelLanguage === 'en-US';
          const integratedChrome = panel.hostChrome === 'integrated';
          const customChrome = panel.hostChrome === 'custom';
          const languageGroupClass = integratedChrome
            ? 'flex h-8 items-center rounded-full border border-[#dfe3ea] bg-white/95 p-0.5 shadow-[0_2px_8px_rgba(28,33,48,0.06)]'
            : 'flex h-8 items-center rounded-lg border border-white/[0.08] bg-white/[0.035] p-0.5';
          const languageIconClass = integratedChrome
            ? 'flex h-7 w-7 items-center justify-center text-[#8a909c]'
            : 'flex h-7 w-7 items-center justify-center text-white/35';
          const localStatusClass = integratedChrome
            ? 'hidden items-center gap-1.5 rounded-full border border-[#dfe3ea] bg-[#f7f8fa] px-2.5 py-1 text-[11px] text-[#656c78] sm:flex'
            : 'hidden items-center gap-1.5 rounded-full border border-[#57c957]/16 bg-[#223322]/70 px-2.5 py-1 text-[11px] text-[#8ade8f]/75 sm:flex';
          const localStatusDotClass = integratedChrome
            ? 'h-1.5 w-1.5 rounded-full bg-[#8a909c]'
            : 'h-1.5 w-1.5 rounded-full bg-[#57c957]';
          const closeButtonClass = integratedChrome
            ? 'flex h-8 items-center gap-2 rounded-full border border-[#dfe3ea] bg-white/95 px-2.5 text-[11px] text-[#777e8a] shadow-[0_2px_8px_rgba(28,33,48,0.06)] transition-colors hover:bg-[#f5f6f8] hover:text-[#252a33]'
            : 'flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white/80';
          const chromeControls = (
            <div className="flex items-center gap-2">
              <div
                className={languageGroupClass}
                role="group"
                aria-label={panelIsEnglish ? 'Switch audio plugin language' : '切换音频插件语言'}
              >
                <span className={languageIconClass} aria-hidden>
                  <Languages className="h-3.5 w-3.5" />
                </span>
                {(
                  [
                    ['zh-CN', '中'],
                    ['en-US', 'EN'],
                  ] as const
                ).map(([locale, label]) => {
                  const selected = panelLanguage === locale;
                  return (
                    <button
                      key={locale}
                      type="button"
                      onClick={() => setPluginPanelLanguage(plugin.manifest.id, locale)}
                      className={`flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors ${
                        selected
                          ? integratedChrome
                            ? 'bg-[#f1f2f4] text-[#30343d] shadow-sm'
                            : 'bg-[#223322] text-[#9be6a0] shadow-sm'
                          : integratedChrome
                            ? 'text-[#777e8a] hover:bg-[#f5f6f8] hover:text-[#252a33]'
                            : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'
                      }`}
                      aria-pressed={selected}
                      aria-label={
                        locale === 'zh-CN'
                          ? panelIsEnglish
                            ? 'Switch audio plugin to Chinese'
                            : '将音频插件切换为中文'
                          : panelIsEnglish
                            ? 'Switch audio plugin to English'
                            : '将音频插件切换为英文'
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className={localStatusClass}>
                <span className={localStatusDotClass} />
                LOCAL · OFFLINE
              </span>
              <button
                type="button"
                onClick={() => closePanel(plugin.manifest.id, panel.id)}
                className={closeButtonClass}
                aria-label={panelIsEnglish ? `Close ${panel.label}` : `关闭 ${panel.label}`}
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ESC</span>
              </button>
            </div>
          );
          return (
            <section
              key={`${plugin.manifest.id}:${panel.id}`}
              className={`pointer-events-auto fixed inset-0 z-[120] flex flex-col overflow-hidden bg-[#090a0a] ${customChrome ? 'rounded-none' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={`${plugin.manifest.name} · ${panel.label}`}
              data-theme-role={customChrome ? undefined : 'modal-surface'}
            >
              {customChrome ? null : integratedChrome ? (
                <div className="pointer-events-none absolute top-0 right-0 z-10 flex h-[52px] items-center px-4">
                  <div className="pointer-events-auto">{chromeControls}</div>
                </div>
              ) : (
                <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#111212]/96 px-5 shadow-[0_12px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#57c957]/20 bg-[#223322] text-[#72d779]">
                      <AudioLines className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] tracking-[0.18em] text-white/30 uppercase">
                        {panelIsEnglish ? 'LOCAL AI AUDIO STUDIO' : '本机 AI 音频工作台'}
                      </p>
                      <h2 className="truncate text-[13px] font-medium text-white/90">
                        {panel.label}
                      </h2>
                    </div>
                  </div>
                  {chromeControls}
                </header>
              )}
              <div className="min-h-0 flex-1">
                <PluginSandboxFrame
                  plugin={plugin}
                  view={panel.view}
                  title={`${plugin.manifest.name} · ${panel.label}`}
                  locale={panelLanguage}
                  allowFullscreen
                  onRequestClose={() => closePanel(plugin.manifest.id, panel.id)}
                />
              </div>
            </section>
          );
        }
        const positionClass =
          panel.position === 'left'
            ? 'left-4 top-16'
            : panel.position === 'right'
              ? 'right-4 top-16'
              : panel.position === 'bottom'
                ? 'bottom-16 left-1/2 -translate-x-1/2'
                : 'left-1/2 top-24 -translate-x-1/2';
        return (
          <section
            key={`${plugin.manifest.id}:${panel.id}`}
            className={`pointer-events-auto fixed z-[36] overflow-hidden rounded-xl border border-white/10 bg-[#18181b]/96 shadow-2xl backdrop-blur-xl ${positionClass}`}
            style={{ width: panel.width, height: panel.height }}
            aria-label={`${plugin.manifest.name} · ${panel.label}`}
          >
            <header className="flex h-10 items-center justify-between border-b border-white/[0.08] px-3">
              <span className="flex min-w-0 items-center gap-2 text-[12px] text-white/75">
                <Puzzle className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                <span className="truncate">{panel.label}</span>
              </span>
              <button
                type="button"
                onClick={() => closePanel(plugin.manifest.id, panel.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.08] hover:text-white/75"
                aria-label={t('pluginHost.panel.close', '关闭 {label}', { label: panel.label })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>
            <div className="h-[calc(100%-2.5rem)]">
              <PluginSandboxFrame
                plugin={plugin}
                view={panel.view}
                title={`${plugin.manifest.name} · ${panel.label}`}
              />
            </div>
          </section>
        );
      })}
      {notice && (
        <div className="pointer-events-none fixed right-5 bottom-20 z-[70] max-w-sm rounded-xl border border-cyan-300/20 bg-[#16191d]/96 px-4 py-3 text-[12px] text-white/75 shadow-2xl">
          <p className="text-[11px] font-medium text-cyan-300/70">{notice.pluginName}</p>
          <p className="mt-1 leading-5">{notice.message}</p>
        </div>
      )}
    </>
  );
}
