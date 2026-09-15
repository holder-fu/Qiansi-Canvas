import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Clapperboard, MapPin, Users } from 'lucide-react';
import { useStore, type NodeProps } from '@xyflow/react';
import type { DirectorNodeKind, FlowNode } from '../nodeTypes';
import { NODE_H, NODE_W } from '../constants';
import { useCanvasStore } from '../../store/canvasStore';
import { normalizeDirectorScene } from '../../lib/directorConstraints';
import { NodePorts } from './NodePorts';
import { AiSkillNodeDragHandle } from './AiSkillNodeDragHandle';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import { mediaPreviewUrl } from '../../lib/mediaPreview';
import { useAppTranslation } from '../../i18n/appI18n';
import { getNodeDisplayTitle } from '../../i18n/nodeI18n';
import { useSingleNodeControls } from './nodeSelectionState';
import { directorSubjectFrameStyle } from '../../lib/directorSubjectFrame';
import { loadDirectorScene } from '../../lib/libraryMedia';

const DirectorThreeNodePreview = lazy(() =>
  import('./DirectorThreeNodePreview').then((module) => ({
    default: module.DirectorThreeNodePreview,
  })),
);

function DirectorThreeSceneBackdrop({
  sceneUrl,
  sceneAssetId,
  alt,
  className,
  loading,
  decoding,
}: {
  sceneUrl?: string;
  sceneAssetId?: string;
  alt: string;
  className: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'auto' | 'sync';
}) {
  const [restoredUrl, setRestoredUrl] = useState(() =>
    sceneUrl ? mediaPreviewUrl(sceneUrl, 'image') : '',
  );

  useEffect(() => {
    if (sceneUrl) {
      setRestoredUrl(mediaPreviewUrl(sceneUrl, 'image'));
      return;
    }
    if (!sceneAssetId) {
      setRestoredUrl('');
      return;
    }
    let disposed = false;
    let runtimeUrl = '';
    setRestoredUrl('');
    void loadDirectorScene(sceneAssetId)
      .then((blob) => {
        if (!blob || disposed) return;
        runtimeUrl = URL.createObjectURL(blob);
        setRestoredUrl(runtimeUrl);
      })
      .catch(() => {
        if (!disposed) setRestoredUrl('');
      });
    return () => {
      disposed = true;
      if (runtimeUrl) URL.revokeObjectURL(runtimeUrl);
    };
  }, [sceneAssetId, sceneUrl]);

  return restoredUrl ? (
    <img src={restoredUrl} alt={alt} className={className} loading={loading} decoding={decoding} />
  ) : null;
}

function DirectorNodeBase({
  id,
  data,
  selected,
  directorKind,
}: NodeProps<FlowNode> & { directorKind: DirectorNodeKind }) {
  const zoom = useStore((state) => state.transform[2]);
  const showSingleNodeControls = useSingleNodeControls(selected);
  const nodeRef = useRef<HTMLDivElement>(null);
  const setOpenModal = useCanvasStore((state) => state.setOpenModal);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const { t } = useAppTranslation();
  const scene = useMemo(() => normalizeDirectorScene(data.directorScene), [data.directorScene]);
  const isThreeDimensional = directorKind === 'director-3d';
  const nodeTitle = getNodeDisplayTitle(directorKind, data.title, t);
  const panoramaPreviewKey = JSON.stringify([
    scene.sceneAssetId || scene.sceneUrl || '',
    scene.sceneHorizonPitch ?? 0,
    scene.scenePanoramaLift ?? 0,
  ]);
  const hasPanorama = Boolean(scene.sceneAssetId || scene.sceneUrl);
  const thumbnailMatchesScene =
    !hasPanorama || data.directorThumbnailSceneKey === panoramaPreviewKey;
  const thumbnailUrl = thumbnailMatchesScene
    ? data.directorThumbnailUrl || data.directorLayoutUrl || data.imageUrl || ''
    : '';
  const saveThumbnail = useCallback(
    (nextThumbnailUrl: string) => {
      if (
        !nextThumbnailUrl ||
        (nextThumbnailUrl === data.directorThumbnailUrl &&
          data.directorThumbnailSceneKey === panoramaPreviewKey)
      )
        return;
      updateNodeData(id, {
        directorThumbnailUrl: nextThumbnailUrl,
        directorThumbnailSceneKey: panoramaPreviewKey,
      });
    },
    [
      data.directorThumbnailSceneKey,
      data.directorThumbnailUrl,
      id,
      panoramaPreviewKey,
      updateNodeData,
    ],
  );
  const openStudio = () =>
    setOpenModal(isThreeDimensional ? 'director-studio' : 'director-studio-2d', id);

  return (
    <div
      ref={nodeRef}
      data-node-double-click="true"
      data-director-node={directorKind}
      className="group relative"
      style={{ width: NODE_W }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openStudio();
      }}
    >
      <div className="pointer-events-none absolute -top-8 left-0 flex h-7 items-center gap-1.5 text-[13px] font-medium text-white/70">
        <Clapperboard className="h-3.5 w-3.5" />
        {nodeTitle}
      </div>

      <div
        data-theme-role="node-surface"
        className={`relative overflow-hidden rounded-xl border bg-[#111316] transition-[border-color,box-shadow] ${
          selected ? SELECTED_NODE_FRAME_CLASS : 'border-white/25 hover:border-white/40'
        }`}
        style={{ height: NODE_H }}
      >
        {isThreeDimensional ? (
          showSingleNodeControls ? (
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.16),transparent_48%),linear-gradient(#0c1118,#080b10)]">
              {thumbnailUrl ? (
                <img
                  src={mediaPreviewUrl(thumbnailUrl, 'image')}
                  alt={t('node.director.3dThumbnailAlt', '3D导演台预演缩略图')}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : hasPanorama ? (
                <DirectorThreeSceneBackdrop
                  sceneUrl={scene.sceneUrl}
                  sceneAssetId={scene.sceneAssetId}
                  alt={t('node.director.3dSceneAlt', '3D导演台静态场景')}
                  className="absolute inset-0 h-full w-full object-cover opacity-55"
                />
              ) : null}
              <Suspense fallback={null}>
                <DirectorThreeNodePreview scene={scene} onThumbnail={saveThumbnail} />
              </Suspense>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.16),transparent_48%),linear-gradient(#0c1118,#080b10)]">
              {thumbnailUrl ? (
                <img
                  src={mediaPreviewUrl(thumbnailUrl, 'image')}
                  alt={t('node.director.3dThumbnailAlt', '3D导演台预演缩略图')}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : hasPanorama ? (
                <DirectorThreeSceneBackdrop
                  sceneUrl={scene.sceneUrl}
                  sceneAssetId={scene.sceneAssetId}
                  alt={t('node.director.3dSceneAlt', '3D导演台静态场景')}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover opacity-35"
                />
              ) : null}
              {thumbnailUrl ? (
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/35" />
              ) : (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-[62%] origin-bottom bg-[linear-gradient(rgba(56,189,248,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.18)_1px,transparent_1px)] bg-[size:36px_28px] opacity-65 [transform:perspective(420px)_rotateX(58deg)_scale(1.2)]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full border border-sky-300/20 bg-black/45 px-3 py-1.5 text-[11px] text-sky-100/65">
                      {t('node.director.load3dWhenSelected', '选中后加载 3D 预演')}
                    </span>
                  </div>
                </>
              )}
            </div>
          )
        ) : (
          <>
            {scene.sceneUrl && (
              <img
                src={mediaPreviewUrl(scene.sceneUrl, 'image')}
                alt={t('node.director.2dSceneAlt', '2D导演台场景')}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/55" />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[74%] origin-bottom opacity-60"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(56,189,248,0.22) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,0.22) 1px,transparent 1px)',
                backgroundSize: '44px 32px',
                transform: 'perspective(420px) rotateX(58deg) scale(1.18)',
              }}
            />
            {scene.sceneObjects.map((object) => (
              <div
                key={object.id}
                className="pointer-events-none absolute flex min-h-7 min-w-14 items-center justify-center gap-1 rounded-md border border-amber-300/45 bg-black/65 px-2 py-1 text-[11px] text-amber-100/75"
                style={{
                  left: `${object.x}%`,
                  top: `${object.y}%`,
                  transform: `translate(-50%, -50%) scale(${object.scale / 100})`,
                  zIndex: Math.max(2, Math.round(object.y) - 12),
                }}
              >
                <MapPin className="h-3 w-3" />
                <span className="max-w-20 truncate">{object.label}</span>
              </div>
            ))}
            {scene.subjects.map((subject, index) => (
              <div
                key={subject.id}
                className="pointer-events-none absolute flex flex-col items-center"
                style={{
                  left: `${subject.x}%`,
                  top: `${subject.y}%`,
                  transform: `translate(-50%, -72%) scale(${subject.scale / 100})`,
                  zIndex: Math.round(subject.y),
                }}
              >
                <div
                  className="h-20 w-14 bg-sky-200/70 p-px shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                  style={directorSubjectFrameStyle(subject.frameShape)}
                >
                  <div
                    className="flex h-full w-full overflow-hidden bg-sky-400/20"
                    style={directorSubjectFrameStyle(subject.frameShape)}
                  >
                    {subject.imageUrl ? (
                      <img
                        src={mediaPreviewUrl(subject.imageUrl, 'image')}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Users className="m-auto h-full w-7 text-sky-200/70" />
                    )}
                  </div>
                </div>
                <span className="mt-1 max-w-28 truncate rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white/85">
                  {index + 1}. {subject.label}
                </span>
              </div>
            ))}
            {(scene.backgroundActors ?? []).map((actor, index) => (
              <div
                key={actor.id}
                className="pointer-events-none absolute flex flex-col items-center"
                style={{
                  left: `${actor.x}%`,
                  top: `${actor.y}%`,
                  transform: `translate(-50%, -68%) scale(${actor.scale / 100})`,
                  zIndex: Math.max(1, Math.round(actor.y) - 12),
                }}
              >
                <div className="flex h-12 w-16 items-center justify-center rounded-xl border-2 border-slate-200/70 bg-slate-300/20 shadow-[0_8px_20px_rgba(0,0,0,0.38)]">
                  <Users className="h-7 w-7 text-slate-100" />
                </div>
                <span className="mt-1 max-w-28 truncate rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-slate-100">
                  {t('node.director.backgroundActor', '群演{index}', { index: index + 1 })} ·{' '}
                  {actor.label}
                </span>
              </div>
            ))}
          </>
        )}

        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 text-xs text-white/80 backdrop-blur-sm">
          <Camera className="h-3.5 w-3.5 text-sky-300" />
          {nodeTitle}
        </div>

        {scene.subjects.length === 0 && (scene.backgroundActors?.length ?? 0) === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/35">
            <Clapperboard className="h-10 w-10" strokeWidth={1.2} />
            <span className="text-sm">
              {isThreeDimensional
                ? t('node.director.empty3d', '双击打开3D导演台，添加真实关节角色')
                : t('node.director.empty2d', '双击打开2D导演台，连接图片安排站位')}
            </span>
          </div>
        )}

        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[11px] text-white/65 backdrop-blur-sm">
            {scene.lockSubjectCount
              ? t('node.director.lockedSubjects', '锁定 {count} 人', {
                  count: scene.subjects.length,
                })
              : t('node.director.subjects', '{count} 人', { count: scene.subjects.length })}
          </span>
          {scene.forbidExtraSubjects && (
            <span className="rounded-md border border-emerald-300/15 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-200/80">
              {t('node.director.forbidExtraSubjects', '禁止额外人物')}
            </span>
          )}
          {!isThreeDimensional && data.directorOutputDirty === true && (
            <span className="rounded-md border border-amber-300/25 bg-amber-300/15 px-2 py-1 text-[11px] text-amber-100">
              {t('node.director.draftPending', '草稿待应用')}
            </span>
          )}
        </div>

        {showSingleNodeControls && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openStudio();
            }}
            className="nodrag nopan absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#202328]/90 px-3 py-2 text-xs text-white/80 shadow-lg transition-colors hover:border-sky-300/40 hover:text-white"
          >
            <Clapperboard className="h-3.5 w-3.5" />
            {t('node.director.open', '打开{title}', { title: nodeTitle })}
          </button>
        )}
      </div>

      {showSingleNodeControls && (
        <div className="pointer-events-auto absolute -top-8 left-[92px] flex h-7 items-center">
          <AiSkillNodeDragHandle nodeId={id} label={nodeTitle} />
        </div>
      )}

      <NodePorts
        kind={directorKind}
        nodeRef={nodeRef}
        selected={showSingleNodeControls}
        zoom={zoom}
      />
    </div>
  );
}

export const DirectorTwoNode = memo((props: NodeProps<FlowNode>) => (
  <DirectorNodeBase {...props} directorKind="director-2d" />
));
export const DirectorThreeNode = memo((props: NodeProps<FlowNode>) => (
  <DirectorNodeBase {...props} directorKind="director-3d" />
));
/** Legacy runtime fallback for canvases restored before migration completes. */
export const DirectorNode = memo((props: NodeProps<FlowNode>) => (
  <DirectorNodeBase
    {...props}
    directorKind={props.data.directorMode === '2d' ? 'director-2d' : 'director-3d'}
  />
));
