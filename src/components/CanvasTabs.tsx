import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useCanvasStore, type CanvasTab } from '../store/canvasStore';
import { useAppTranslation } from '../i18n/appI18n';

export function CanvasTabs() {
  const { t } = useAppTranslation();
  const tabs = useCanvasStore((s) => s.tabs);
  const activeTabId = useCanvasStore((s) => s.activeTabId);
  const setActiveTab = useCanvasStore((s) => s.setActiveTab);
  const addTab = useCanvasStore((s) => s.addTab);
  const removeTab = useCanvasStore((s) => s.removeTab);
  const renameTab = useCanvasStore((s) => s.renameTab);
  const workspace = useCanvasStore((s) => s.workspace);

  return (
    <div className="pointer-events-auto flex items-center gap-1">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          onClick={() => setActiveTab(tab.id)}
          onClose={(e) => {
            e.stopPropagation();
            removeTab(tab.id);
          }}
          onRename={(name) => renameTab(tab.id, name)}
        />
      ))}
      <button
        type="button"
        onClick={() => addTab(workspace)}
        className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        title={t('canvasShell.tabs.new', '新建画板')}
        aria-label={t('canvasShell.tabs.new', '新建画板')}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TabItem({
  tab,
  active,
  onClick,
  onClose,
  onRename,
}: {
  tab: CanvasTab;
  active: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onRename: (name: string) => void;
}) {
  const { t } = useAppTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tab.name);

  useEffect(() => {
    setName(tab.name);
  }, [tab.name]);

  return (
    <div
      onClick={onClick}
      className={`group relative flex h-7 min-w-[80px] max-w-[140px] cursor-pointer items-center justify-between rounded-md px-2.5 text-xs transition-colors ${
        active ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {editing ? (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            onRename(name.trim() || tab.name);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onRename(name.trim() || tab.name);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="h-5 w-20 rounded border border-white/10 bg-transparent px-1 text-xs text-white outline-none"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          className="truncate"
          title={t('canvasShell.tabs.renameHint', '双击重命名')}
        >
          {tab.name}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-1 flex h-4 w-4 items-center justify-center rounded text-white/30 opacity-0 transition-colors hover:bg-white/10 hover:text-white group-hover:opacity-100"
        aria-label={t('canvasShell.tabs.close', '关闭画板：{name}', { name: tab.name })}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
