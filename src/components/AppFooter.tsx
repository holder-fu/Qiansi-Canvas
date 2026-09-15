import { Keyboard } from 'lucide-react';
import type { WorkspaceId } from '../canvas/nodeTypes';
import { useAppTranslation } from '../i18n/appI18n';
import { useCanvasStore } from '../store/canvasStore';

interface AppFooterProps {
  className?: string;
}

/** Shared product footer used by the Home dashboard and project directory. */
export function AppFooter({ className = 'mt-6' }: AppFooterProps) {
  const { t } = useAppTranslation();
  const setWorkspace = useCanvasStore((state) => state.setWorkspace);
  const setOpenModal = useCanvasStore((state) => state.setOpenModal);
  const tabs = useCanvasStore((state) => state.tabs);
  const activeTabId = useCanvasStore((state) => state.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const resumeWorkspace: Exclude<WorkspaceId, 'home'> =
    activeTab?.workspace === 'home' ? 'views' : (activeTab?.workspace ?? 'views');
  const version = import.meta.env.VITE_APP_VERSION ?? 'unknown';

  return (
    <footer
      className={`${className} flex flex-col gap-2 border-t border-white/[0.07] pt-3 text-[10px] text-white/30 sm:flex-row sm:items-center sm:justify-between`}
    >
      <span>© 2026 holder（老树苗） · {t('home.license')}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setWorkspace(resumeWorkspace);
            setOpenModal('shortcuts');
          }}
          className="flex items-center gap-1.5 transition hover:text-white/65"
        >
          <Keyboard className="h-3.5 w-3.5" />
          {t('home.shortcuts')}
        </button>
        <span>
          {t('home.title')} · v{version}
        </span>
      </span>
    </footer>
  );
}
