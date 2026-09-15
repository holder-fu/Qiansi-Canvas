import { Palette, Zap, Smile, MessageSquareText } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import type { ToolbarControlId, ToolbarModes } from '../store/canvasPreferences';
import { useAppTranslation } from '../i18n/appI18n';

const libraryButtons = [
  {
    key: 'style-library' as const,
    id: 'bottom-style-library' as ToolbarControlId,
    labelKey: 'toolbar.styleLibrary',
    label: '风格库',
    icon: Palette,
  },
  {
    key: 'effects-library' as const,
    id: 'bottom-effects-library' as ToolbarControlId,
    labelKey: 'toolbar.effectsLibrary',
    label: '特效库',
    icon: Zap,
  },
  {
    key: 'character-library' as const,
    id: 'bottom-character-library' as ToolbarControlId,
    labelKey: 'toolbar.characterLibrary',
    label: '角色库',
    icon: Smile,
  },
  {
    key: 'prompt-library' as const,
    id: 'bottom-prompt-library' as ToolbarControlId,
    labelKey: 'toolbar.promptLibrary',
    label: '提示词',
    icon: MessageSquareText,
  },
];

export function Toolbar({ toolbarModes }: { toolbarModes: ToolbarModes }) {
  const setOpenModal = useCanvasStore((s) => s.setOpenModal);
  const { t } = useAppTranslation();

  return (
    <div
      data-theme-role="library-toolbar"
      data-toolbar-cluster="library-actions"
      className="pointer-events-none flex items-center gap-1"
    >
      {libraryButtons.map((b) => {
        const label = t(b.labelKey, b.label);
        const mode = toolbarModes[b.id];
        if (mode === 'hidden') return null;
        return (
          <div
            key={b.key}
            className={`transition-transform duration-200 ease-out ${
              mode === 'auto-hide'
                ? 'translate-y-16 group-hover/bottom-toolbar:translate-y-0 group-focus-within/bottom-toolbar:translate-y-0 max-sm:translate-y-0'
                : 'translate-y-0'
            }`}
            data-toolbar-control={b.id}
            data-toolbar-mode={mode}
          >
            <button
              type="button"
              onClick={() => setOpenModal(b.key, null)}
              className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-[#131315]/90 px-2.5 text-xs text-white/[0.86] shadow-2xl backdrop-blur-xl transition-all hover:bg-white/10 hover:text-white"
              aria-label={label}
              title={label}
            >
              <b.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
