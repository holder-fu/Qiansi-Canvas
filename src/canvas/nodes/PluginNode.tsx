import { memo, useRef } from 'react';
import { Puzzle, X } from 'lucide-react';
import { useStore, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../nodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import { NodePorts } from './NodePorts';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import { usePluginRegistryStore } from '../../store/pluginRegistryStore';
import { PluginSandboxFrame } from '../../components/PluginSandboxFrame';
import { isAssetType, type AssetType } from '../../graph/types';
import { useAppTranslation } from '../../i18n/appI18n';
import { resolvePluginNodeIdentity } from '../../services/pluginRegistry';
import { useSingleNodeControls } from './nodeSelectionState';

function safeAccent(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#22d3ee';
}

function safeAssetType(value: unknown): AssetType {
  return isAssetType(value) ? value : 'any';
}

function PluginNodeBase({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useAppTranslation();
  const showSingleNodeControls = useSingleNodeControls(selected);
  const nodeRef = useRef<HTMLDivElement>(null);
  const zoom = useStore((state) => state.transform[2]);
  const requestDeleteNode = useCanvasStore((state) => state.requestDeleteNode);
  const pluginCatalog = usePluginRegistryStore((state) => state.catalog);
  const accent = safeAccent(data.pluginAccent);
  const identity = resolvePluginNodeIdentity(data.pluginId, data.pluginNodeId);
  const plugin = pluginCatalog?.plugins.find((item) => item.manifest.id === identity.pluginId);
  const contribution = plugin?.manifest.contributes.nodes.find(
    (item) => item.id === identity.pluginNodeId,
  );
  const hasSandboxView = Boolean(
    plugin?.enabled &&
    plugin.compatible &&
    plugin.manifest.runtime &&
    contribution?.renderer === 'sandbox' &&
    contribution.view,
  );
  const width = contribution?.width ?? 320;
  const height = contribution?.height ?? 150;
  const immersive = contribution?.presentation === 'immersive';

  return (
    <div ref={nodeRef} className="relative" style={{ width }}>
      {showSingleNodeControls && (
        <div className="pointer-events-auto absolute -top-8 left-0 right-0 flex h-7 items-center justify-between text-[12px] text-white/55">
          <span className="truncate">
            {plugin?.manifest.name ||
              data.pluginName ||
              t('pluginHost.node.fallbackPluginName', '第三方插件')}
          </span>
          <button
            type="button"
            onClick={() => requestDeleteNode(id)}
            className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-md hover:bg-rose-500/15 hover:text-rose-300"
            aria-label={t('pluginHost.node.moveToTrash', '移到回收站')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        data-theme-role="node-surface"
        className={`relative overflow-hidden rounded-xl border bg-[#202024] transition-[border-color,box-shadow] ${
          selected
            ? SELECTED_NODE_FRAME_CLASS
            : 'border-white/18 shadow-[0_8px_28px_rgba(0,0,0,0.34)]'
        }`}
        style={immersive ? { height } : undefined}
      >
        {immersive ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1"
              style={{ backgroundColor: accent }}
            />
            {hasSandboxView && plugin && contribution?.view ? (
              <div
                className={`h-full w-full overflow-hidden ${showSingleNodeControls ? 'nodrag nopan nowheel' : ''}`}
              >
                <PluginSandboxFrame
                  plugin={plugin}
                  view={contribution.view}
                  nodeId={id}
                  title={`${plugin.manifest.name} · ${contribution.label}`}
                  interactive={showSingleNodeControls}
                  allowFullscreen
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-5">
                <p className="max-w-sm rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-center text-[11px] leading-4 text-amber-100/55">
                  {t(
                    'pluginHost.node.runtimeUnavailable',
                    '插件运行时未启用、版本不兼容或已被卸载。节点数据仍保留。',
                  )}
                </p>
              </div>
            )}
            {!showSingleNodeControls && hasSandboxView && (
              <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[10px] text-white/55 backdrop-blur-md">
                {t('pluginHost.node.selectToInteract', '单击选择节点后操作场景')}
              </span>
            )}
          </>
        ) : (
          <>
            <div className="h-1" style={{ backgroundColor: accent }} />
            <div className="flex flex-col px-5 py-4" style={{ minHeight: height }}>
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ color: accent, backgroundColor: `${accent}18` }}
                >
                  <Puzzle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-white/88">{data.title}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-white/42">
                    {data.description ||
                      t('pluginHost.node.fallbackDescription', '第三方沙箱插件节点')}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-white/[0.07] pt-3 text-[10px] text-white/32">
                <span>
                  {t('pluginHost.node.input', '输入 · {type}', {
                    type: String(data.pluginInputType || 'any'),
                  })}
                </span>
                <span>
                  {t('pluginHost.node.output', '输出 · {type}', {
                    type: String(data.pluginOutputType || 'any'),
                  })}
                </span>
              </div>
              {hasSandboxView && plugin && contribution?.view && (
                <div
                  className="nodrag nopan mt-3 overflow-hidden rounded-lg border border-white/[0.08] bg-black/20"
                  style={{ height: Math.max(120, height - 94) }}
                >
                  <PluginSandboxFrame
                    plugin={plugin}
                    view={contribution.view}
                    nodeId={id}
                    title={`${plugin.manifest.name} · ${contribution.label}`}
                  />
                </div>
              )}
              {contribution?.renderer === 'sandbox' && !hasSandboxView && (
                <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] leading-4 text-amber-100/55">
                  {t(
                    'pluginHost.node.runtimeUnavailable',
                    '插件运行时未启用、版本不兼容或已被卸载。节点数据仍保留。',
                  )}
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <NodePorts
        kind="plugin"
        nodeRef={nodeRef}
        selected={showSingleNodeControls}
        zoom={zoom}
        pluginInputType={safeAssetType(data.pluginInputType)}
        pluginOutputType={safeAssetType(data.pluginOutputType)}
      />
    </div>
  );
}

export const PluginNode = memo(PluginNodeBase);
