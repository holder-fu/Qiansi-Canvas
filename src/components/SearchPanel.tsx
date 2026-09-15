import { Search, X, ChevronRight } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { useReactFlow } from '@xyflow/react';
import { NODE_W, NODE_H } from '../canvas/constants';
import { useAppTranslation } from '../i18n/appI18n';
import { getNodeDisplayTitle, getNodeKindDisplayLabel } from '../i18n/nodeI18n';
import { selectNodeFromPanel } from './nodePanelSelection';
import { imagePreviewSource, mediaPreviewUrl } from '../lib/mediaPreview';

export function SearchPanel() {
  const { t } = useAppTranslation();
  const nodes = useCanvasStore((s) => s.nodes);
  const searchQuery = useCanvasStore((s) => s.searchQuery);
  const setSearchQuery = useCanvasStore((s) => s.setSearchQuery);
  const setPanelOpen = useCanvasStore((s) => s.setPanelOpen);
  const { setCenter, getNode } = useReactFlow();

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filtered = normalizedQuery
    ? nodes.filter(
        (n) =>
          n.data.title.toLocaleLowerCase().includes(normalizedQuery) ||
          getNodeDisplayTitle(n.data.kind, n.data.title, t)
            .toLocaleLowerCase()
            .includes(normalizedQuery) ||
          getNodeKindDisplayLabel(n.data.kind, t).toLocaleLowerCase().includes(normalizedQuery) ||
          n.data.kind.toLocaleLowerCase().includes(normalizedQuery) ||
          (n.data.prompt?.toLocaleLowerCase().includes(normalizedQuery) ?? false),
      )
    : nodes;

  const handleSelect = (nodeId: string) => {
    const node = getNode(nodeId);
    if (node) {
      setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
        zoom: 1,
        duration: 400,
      });
    }
    const selection = selectNodeFromPanel(useCanvasStore.getState().nodes, nodeId);
    if (selection) useCanvasStore.setState(selection);
    setPanelOpen(null);
  };

  return (
    <div
      className="pointer-events-auto flex h-[clamp(160px,calc(100vh-180px),420px)] w-[min(18rem,calc(100vw-1rem))] flex-col rounded-2xl border border-edge bg-panel/95 shadow-2xl backdrop-blur-xl"
      role="search"
      aria-label={t('searchPanel.title', '搜索节点')}
    >
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h3 className="text-sm font-medium text-white/90">{t('searchPanel.title', '搜索节点')}</h3>
        <button
          type="button"
          onClick={() => setPanelOpen(null)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
          aria-label={t('searchPanel.close', '关闭搜索面板')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-edge p-3">
        <div className="flex items-center gap-2 rounded-lg border border-edge bg-[#1a1a1c] px-3 py-2">
          <Search className="h-4 w-4 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPanel.placeholder', '搜索标题、类型、提示词…')}
            aria-label={t('searchPanel.placeholder', '搜索标题、类型、提示词…')}
            className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/30 focus:outline-none"
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-white/30">
            {searchQuery
              ? t('searchPanel.noMatches', '未找到匹配节点')
              : t('searchPanel.empty', '暂无节点')}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((node) => {
              const thumbnailUrl = mediaPreviewUrl(imagePreviewSource(node.data), 'image');
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => handleSelect(node.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.08]"
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-edge bg-[#1a1a1c]">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] text-white/30">
                        {getNodeKindDisplayLabel(node.data.kind, t)[0] ?? '?'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-white/80">
                      {getNodeDisplayTitle(node.data.kind, node.data.title, t)}
                    </p>
                    <p className="text-[9px] text-white/30">
                      {getNodeKindDisplayLabel(node.data.kind, t)}
                      {node.data.generating ? t('searchPanel.generatingSuffix', ' · 生成中…') : ''}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
