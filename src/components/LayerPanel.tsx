import { Eye, EyeOff, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { useReactFlow } from '@xyflow/react';
import { NODE_W, NODE_H } from '../canvas/constants';
import { useAppTranslation } from '../i18n/appI18n';
import { getNodeDisplayTitle, getNodeKindDisplayLabel } from '../i18n/nodeI18n';
import { moveLayerNode, toggleLayerNodeVisibility } from './layerPanelState';
import { selectNodeFromPanel } from './nodePanelSelection';
import { imagePreviewSource, mediaPreviewUrl } from '../lib/mediaPreview';

export function LayerPanel() {
  const { t } = useAppTranslation();
  const nodes = useCanvasStore((s) => s.nodes);
  const setPanelOpen = useCanvasStore((s) => s.setPanelOpen);
  const { setCenter, getNode } = useReactFlow();

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
  };

  const toggleHidden = (nodeId: string) => {
    const state = useCanvasStore.getState();
    const nextNodes = toggleLayerNodeVisibility(state.nodes, nodeId);
    if (!nextNodes) return;
    state.takeSnapshot();
    useCanvasStore.setState({ nodes: nextNodes });
  };

  const moveLayer = (nodeId: string, dir: 'up' | 'down') => {
    const state = useCanvasStore.getState();
    const newNodes = moveLayerNode(state.nodes, nodeId, dir);
    if (!newNodes) return;
    state.takeSnapshot();
    useCanvasStore.setState({ nodes: newNodes });
  };

  // Reverse order so top layers appear first
  const layerList = [...nodes].reverse();

  return (
    <div
      className="pointer-events-auto flex h-[clamp(160px,calc(100vh-180px),420px)] w-[min(18rem,calc(100vw-1rem))] flex-col rounded-2xl border border-edge bg-panel/95 shadow-2xl backdrop-blur-xl"
      role="region"
      aria-label={t('layerPanel.title', '图层')}
    >
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h3 className="text-sm font-medium text-white/90">{t('layerPanel.title', '图层')}</h3>
        <button
          type="button"
          onClick={() => setPanelOpen(null)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
          aria-label={t('layerPanel.close', '关闭图层面板')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {layerList.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-white/30">
            {t('layerPanel.empty', '暂无图层')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {layerList.map((node, i) => {
              const thumbnailUrl = mediaPreviewUrl(imagePreviewSource(node.data), 'image');
              return (
                <div
                  key={node.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    node.selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleHidden(node.id)}
                    className="flex h-5 w-5 items-center justify-center rounded text-white/40 hover:text-white"
                    title={
                      node.hidden ? t('layerPanel.show', '显示') : t('layerPanel.hide', '隐藏')
                    }
                    aria-label={
                      node.hidden
                        ? t('layerPanel.showNode', '显示节点：{title}', {
                            title: getNodeDisplayTitle(node.data.kind, node.data.title, t),
                          })
                        : t('layerPanel.hideNode', '隐藏节点：{title}', {
                            title: getNodeDisplayTitle(node.data.kind, node.data.title, t),
                          })
                    }
                  >
                    {node.hidden ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelect(node.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md border border-edge bg-[#1a1a1c]">
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[9px] text-white/30">
                          {getNodeKindDisplayLabel(node.data.kind, t)[0] ?? '?'}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[12px] ${node.hidden ? 'text-white/30' : 'text-white/70'}`}
                      >
                        {getNodeDisplayTitle(node.data.kind, node.data.title, t)}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => moveLayer(node.id, 'up')}
                      disabled={i === 0}
                      className="flex h-5 w-5 items-center justify-center rounded text-white/40 hover:text-white disabled:opacity-20"
                      title={t('layerPanel.moveUp', '上移')}
                      aria-label={t('layerPanel.moveNodeUp', '上移节点：{title}', {
                        title: getNodeDisplayTitle(node.data.kind, node.data.title, t),
                      })}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLayer(node.id, 'down')}
                      disabled={i === layerList.length - 1}
                      className="flex h-5 w-5 items-center justify-center rounded text-white/40 hover:text-white disabled:opacity-20"
                      title={t('layerPanel.moveDown', '下移')}
                      aria-label={t('layerPanel.moveNodeDown', '下移节点：{title}', {
                        title: getNodeDisplayTitle(node.data.kind, node.data.title, t),
                      })}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
