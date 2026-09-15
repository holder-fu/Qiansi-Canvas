import { useEffect, useRef, useState } from 'react';
import {
  AtSign,
  Image as ImageIcon,
  Film,
  LoaderCircle,
  LockKeyhole,
  Music,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import { useComposer } from './ComposerContext';
import type { ComposerReference } from './types';
import { useAppTranslation } from '../i18n/appI18n';
import { useCanvasStore } from '../store/canvasStore';
import { uploadAssetFile } from '../services/assetLibrary';
import { persistImageFile, persistVideoFile } from '../services/mediaPersistence';
import { classifyAssetUploadFile, withDetectedAssetUploadMime } from '../lib/assetUploadFile';

const ICONS: Record<ComposerReference['type'], typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  text: FileText,
};

function ReferenceMedia({ reference }: { reference: ComposerReference }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const mediaCandidates =
    reference.type !== 'image'
      ? [reference.url]
      : reference.role === 'effect'
        ? [reference.url, reference.previewUrl]
        : [reference.previewUrl, reference.url];
  const candidates = mediaCandidates.filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index,
  );
  const mediaUrl = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
  }, [reference.id, reference.previewUrl, reference.url]);

  if (reference.type !== 'image' && reference.type !== 'video') return null;
  if (!mediaUrl) return null;
  const tryNextCandidate = () => setCandidateIndex((index) => index + 1);
  const animatedEffect = reference.type === 'video' && reference.role === 'effect';
  const fillsCompactThumbnail =
    reference.role !== 'effect' && (reference.type === 'image' || reference.type === 'video');
  const mediaClassName = `pointer-events-none relative h-full w-full bg-black/20 ${
    fillsCompactThumbnail ? 'rounded-lg object-cover' : 'object-contain'
  }`;

  return reference.type === 'video' ? (
    <video
      src={mediaUrl}
      poster={reference.previewUrl}
      autoPlay={animatedEffect}
      loop={animatedEffect}
      muted
      playsInline
      preload={animatedEffect ? 'auto' : 'metadata'}
      aria-hidden="true"
      onError={tryNextCandidate}
      className={`pointer-events-none ${mediaClassName}`}
    />
  ) : (
    <img
      src={mediaUrl}
      alt=""
      aria-hidden="true"
      onError={tryNextCandidate}
      className={mediaClassName}
    />
  );
}

export function ReferencesStrip() {
  const {
    state,
    runtime,
    addReference,
    removeReference,
    reorderReference,
    insertReferenceMention,
  } = useComposer();
  const { t } = useAppTranslation();
  const activeProjectId = useCanvasStore((store) => store.activeProjectId);
  const localMediaInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLocalMedia, setUploadingLocalMedia] = useState(false);
  const [localMediaUploadError, setLocalMediaUploadError] = useState<string | null>(null);
  const draggedReferenceId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    placement: 'before' | 'after';
  } | null>(null);
  const supportsMultimediaReferences = runtime.spec?.type === 'video';
  const acceptedMedia = supportsMultimediaReferences
    ? 'image/*,video/*,audio/*,.weba,.m4a,.mov'
    : 'image/*';

  const addLocalReferenceMedia = async (files: readonly File[]) => {
    const media = files.flatMap((file) => {
      const descriptor = classifyAssetUploadFile(file);
      if (!descriptor || (!supportsMultimediaReferences && descriptor.kind !== 'image')) return [];
      return [{ file: withDetectedAssetUploadMime(file, descriptor), descriptor }];
    });
    if (media.length === 0 || uploadingLocalMedia) return;

    setUploadingLocalMedia(true);
    setLocalMediaUploadError(null);
    const failures: string[] = [];
    try {
      for (const { file, descriptor } of media) {
        try {
          const label = file.name.replace(/\.[^.]+$/, '');
          if (descriptor.kind === 'image') {
            const persisted = await persistImageFile(file, 'storyboard', activeProjectId);
            addReference({
              id: `local-reference:${persisted.bridgeAssetId}`,
              type: 'image',
              url: persisted.originalUrl,
              previewUrl: persisted.previewUrl,
              label: label || t('composer.reference.localImage', '本地参考图片'),
            });
          } else if (descriptor.kind === 'video') {
            const persisted = await persistVideoFile(file, activeProjectId);
            addReference({
              id: `local-reference:${persisted.bridgeAssetId}`,
              type: 'video',
              url: persisted.originalUrl,
              previewUrl: persisted.previewUrl,
              label: label || t('composer.reference.localVideo', '本地参考视频'),
            });
          } else {
            const persisted = await uploadAssetFile(file, 'audio', { project: activeProjectId });
            addReference({
              id: `local-reference:${persisted.id}`,
              type: 'audio',
              url: persisted.url,
              label: label || t('composer.reference.localAudio', '本地参考音频'),
            });
          }
        } catch (error) {
          failures.push(
            error instanceof Error && error.message ? `${file.name}：${error.message}` : file.name,
          );
        }
      }
    } finally {
      setUploadingLocalMedia(false);
    }
    if (failures.length > 0) {
      setLocalMediaUploadError(
        t('composer.reference.localUploadFailed', '参考素材上传失败：{message}', {
          message: failures.join('；'),
        }),
      );
    }
  };

  const typeLabels: Record<ComposerReference['type'], string> = {
    image: t('composer.media.image', '图片'),
    video: t('composer.media.video', '视频'),
    audio: t('composer.media.audio', '音频'),
    text: t('composer.media.text', '文本'),
  };
  const reorderableImageCount = state.references.filter(
    (reference) => reference.type === 'image' && !reference.locked,
  ).length;

  return (
    <div className="px-2 pb-2 pt-[5px]">
      <div
        className="flex flex-wrap gap-1.5"
        role="list"
        aria-label={t('composer.references', '参考图')}
      >
        {state.references.map((ref, index) => {
          const Icon = ICONS[ref.type];
          const typeLabel = typeLabels[ref.type];
          const compactMediaThumbnail =
            ref.role !== 'effect' && (ref.type === 'image' || ref.type === 'video');
          const referenceLabel = t('composer.reference.indexed', '参考{type} {index}', {
            type: typeLabel,
            index: index + 1,
          });
          const canReorder = ref.type === 'image' && !ref.locked && reorderableImageCount > 1;
          const activeDropTarget = dropTarget?.id === ref.id ? dropTarget : null;
          return (
            <div
              key={ref.id}
              role="listitem"
              title={ref.label || referenceLabel}
              aria-label={referenceLabel}
              data-reference-role={ref.role ?? 'reference'}
              data-reference-reorderable={canReorder ? 'true' : undefined}
              aria-roledescription={
                canReorder ? t('composer.reference.reorderable', '可拖动排序') : undefined
              }
              draggable={canReorder}
              tabIndex={canReorder ? 0 : undefined}
              onDragStart={(event) => {
                if (!canReorder || (event.target as HTMLElement).closest('button')) {
                  event.preventDefault();
                  return;
                }
                draggedReferenceId.current = ref.id;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-qiansi-composer-reference', ref.id);
              }}
              onDragOver={(event) => {
                const draggedId = draggedReferenceId.current;
                if (!canReorder || !draggedId || draggedId === ref.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const bounds = event.currentTarget.getBoundingClientRect();
                const placement =
                  event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
                setDropTarget((current) =>
                  current?.id === ref.id && current.placement === placement
                    ? current
                    : { id: ref.id, placement },
                );
              }}
              onDrop={(event) => {
                const draggedId = draggedReferenceId.current;
                if (!activeDropTarget || !draggedId) return;
                event.preventDefault();
                reorderReference(draggedId, ref.id, activeDropTarget.placement);
                draggedReferenceId.current = null;
                setDropTarget(null);
              }}
              onDragEnd={() => {
                draggedReferenceId.current = null;
                setDropTarget(null);
              }}
              onKeyDown={(event) => {
                if (!canReorder || event.currentTarget !== event.target || !event.altKey) return;
                const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
                if (!offset) return;
                const target = state.references[index + offset];
                if (!target || target.type !== 'image' || target.locked) return;
                event.preventDefault();
                reorderReference(ref.id, target.id, offset < 0 ? 'before' : 'after');
              }}
              className={`group relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#171719] text-white/80 ${
                ref.role === 'effect'
                  ? 'h-14 w-16 border border-white/[0.1]'
                  : compactMediaThumbnail
                    ? 'h-[55px] w-[55px]'
                    : 'h-14 w-14 border border-white/[0.1]'
              } ${canReorder ? 'cursor-grab focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/80 active:cursor-grabbing' : ''}`}
            >
              {activeDropTarget && (
                <span
                  aria-hidden="true"
                  data-reference-drop-placement={activeDropTarget.placement}
                  className={`pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] ${
                    activeDropTarget.placement === 'before' ? 'left-0' : 'right-0'
                  }`}
                />
              )}
              <Icon className="absolute h-4 w-4 text-white/30" aria-hidden="true" />
              <ReferenceMedia reference={ref} />
              {ref.type === 'image' && ref.role !== 'effect' && (
                <span
                  aria-hidden="true"
                  data-reference-image-index={index + 1}
                  className="pointer-events-none absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold leading-none text-white shadow-sm"
                >
                  {index + 1}
                </span>
              )}
              {ref.role === 'style' && (
                <span className="pointer-events-none absolute bottom-0 left-0 rounded-tr bg-emerald-500/90 px-1 py-px text-[9px] font-medium text-black">
                  风格
                </span>
              )}
              {ref.role === 'effect' && (
                <>
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-violet-500/90 px-1 py-px text-[9px] font-medium text-white shadow-sm">
                    {t('composer.effects', '特效')}
                  </span>
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-3 pr-5 text-[9px] font-medium text-white/90">
                    {ref.label}
                  </span>
                </>
              )}
              {ref.locked ? (
                <span
                  className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-amber-100/85 shadow-sm"
                  aria-label={t('composer.reference.locked', '导演参考顺序已锁定')}
                  title={t('composer.reference.locked', '导演参考顺序已锁定')}
                >
                  <LockKeyhole className="h-2.5 w-2.5" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeReference(ref.id)}
                  className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white/70 shadow-sm transition-colors hover:bg-black hover:text-white"
                  aria-label={t('composer.reference.removeIndexed', '删除{type} {index}', {
                    type: typeLabel,
                    index: index + 1,
                  })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
              {ref.role !== 'style' &&
                ref.role !== 'effect' &&
                (ref.type === 'image' || ref.type === 'video' || ref.type === 'audio') && (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertReferenceMention(ref, index)}
                    className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white/80 shadow-sm transition-colors hover:bg-black hover:text-white"
                    aria-label={t(
                      'composer.reference.mentionIndexed',
                      '在指令中引用{type} {index}',
                      {
                        type: typeLabel,
                        index: index + 1,
                      },
                    )}
                    title={t('composer.reference.insertMention', '插入到指令')}
                  >
                    <AtSign className="h-2.5 w-2.5" />
                  </button>
                )}
            </div>
          );
        })}
        <input
          ref={localMediaInputRef}
          data-reference-upload-input="true"
          type="file"
          accept={acceptedMedia}
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void addLocalReferenceMedia(files);
          }}
        />
        <button
          type="button"
          data-reference-upload-trigger="true"
          disabled={uploadingLocalMedia}
          onClick={() => localMediaInputRef.current?.click()}
          className="flex h-[55px] w-[55px] shrink-0 items-center justify-center rounded-lg border border-dashed border-white/25 bg-white/[0.025] text-white/45 transition-colors hover:border-white/45 hover:bg-white/[0.055] hover:text-white/75 disabled:cursor-wait disabled:opacity-55"
          aria-label={
            supportsMultimediaReferences
              ? t('composer.reference.addLocalMedia', '添加本地图片、视频或音频参考')
              : t('composer.reference.addLocalImage', '添加本地参考图片')
          }
          title={
            supportsMultimediaReferences
              ? t('composer.reference.addLocalMedia', '添加本地图片、视频或音频参考')
              : t('composer.reference.addLocalImage', '添加本地参考图片')
          }
        >
          {uploadingLocalMedia ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
      {localMediaUploadError && (
        <p role="alert" className="mt-1.5 text-[10px] leading-4 text-rose-300/90">
          {localMediaUploadError}
        </p>
      )}
    </div>
  );
}
