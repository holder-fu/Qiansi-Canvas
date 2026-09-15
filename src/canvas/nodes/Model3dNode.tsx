import { memo, useRef, useState } from 'react';
import { useStore, type NodeProps } from '@xyflow/react';
import { Box, Download, Loader2, Search, X } from 'lucide-react';
import type { FlowNode } from '../nodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import { NodePorts } from './NodePorts';
import { AiSkillNodeDragHandle } from './AiSkillNodeDragHandle';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import { useSingleNodeControls } from './nodeSelectionState';

function modelFileName(url: string) {
  try {
    return decodeURIComponent(
      new URL(url, 'http://127.0.0.1').pathname.split('/').pop() || '3D 模型',
    );
  } catch {
    return '3D 模型';
  }
}

function Model3dNodeBase({ id, data, selected }: NodeProps<FlowNode>) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const zoom = useStore((state) => state.transform[2]);
  const showControls = useSingleNodeControls(selected);
  const requestDeleteNode = useCanvasStore((state) => state.requestDeleteNode);
  const recoverNodeGenerationResult = useCanvasStore((state) => state.recoverNodeGenerationResult);
  const [checking, setChecking] = useState(false);
  const modelUrl =
    (typeof data.model3dUrl === 'string' && data.model3dUrl) ||
    (Array.isArray(data.models3d) && typeof data.models3d[0] === 'string' ? data.models3d[0] : '');
  const requestId =
    typeof data.generationRequestId === 'string' && data.generationRequestId
      ? data.generationRequestId
      : '';

  return (
    <div ref={nodeRef} className="group relative h-[220px] w-[360px]">
      <div className="pointer-events-none absolute -top-8 left-0 right-0 flex h-7 items-center justify-between gap-2 text-[13px] text-white/55">
        <div className="flex min-w-0 items-center gap-1.5">
          <Box className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{data.title || '3D 模型'}</span>
        </div>
        {showControls && (
          <div className="pointer-events-auto flex items-center gap-1">
            <AiSkillNodeDragHandle nodeId={id} label={String(data.title || '3D 模型')} />
            {modelUrl && (
              <a
                className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-white/[0.08] hover:text-white"
                href={modelUrl}
                download={modelFileName(modelUrl)}
                aria-label="下载 3D 模型"
                title="下载 3D 模型"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                requestDeleteNode(id);
              }}
              className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-rose-500/15 hover:text-rose-300"
              aria-label="移到回收站"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div
        data-theme-role="node-surface"
        className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border bg-[#242425] p-5 transition-[border-color,box-shadow] ${
          selected
            ? SELECTED_NODE_FRAME_CLASS
            : 'border-white/20 shadow-[0_3px_14px_rgba(0,0,0,0.28)]'
        }`}
      >
        <NodePorts kind="model-3d" nodeRef={nodeRef} selected={showControls} zoom={zoom} />
        {data.generating ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-cyan-300/80" />
            <p className="mt-3 text-sm text-white/70">
              正在生成 3D 模型 · {Math.round(Number(data.progress) || 0)}%
            </p>
          </>
        ) : modelUrl ? (
          <>
            <Box className="h-16 w-16 text-cyan-300/75" />
            <p className="mt-4 max-w-full truncate text-sm font-medium text-white/80">
              {modelFileName(modelUrl)}
            </p>
            <p className="mt-1 text-[11px] text-white/35">已保存到本机，可下载后在 3D 软件中打开</p>
          </>
        ) : (
          <>
            <Box className="h-16 w-16 text-white/20" />
            <p className="mt-4 text-sm text-white/55">连接图片或输入提示词后生成 3D 模型</p>
          </>
        )}
        {data.generationError && (
          <p className="mt-3 line-clamp-2 text-center text-[11px] text-rose-300/80">
            {String(data.generationError)}
          </p>
        )}
        {requestId && !data.generating && (
          <button
            type="button"
            disabled={checking}
            onClick={async (event) => {
              event.stopPropagation();
              setChecking(true);
              try {
                await recoverNodeGenerationResult(id);
              } finally {
                setChecking(false);
              }
            }}
            className="nodrag nopan mt-3 flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/70 disabled:opacity-50"
          >
            {checking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            {checking ? '正在检查…' : '检查生成结果'}
          </button>
        )}
      </div>
    </div>
  );
}

export const Model3dNode = memo(Model3dNodeBase);
