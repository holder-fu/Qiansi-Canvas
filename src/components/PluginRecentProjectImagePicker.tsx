import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Image as ImageIcon, LoaderCircle, X } from 'lucide-react';
import { useAppTranslation } from '../i18n/appI18n';
import {
  loadMostRecentPluginProjectImages,
  type PluginRecentProjectImageOption,
  type PluginRecentProjectImages,
} from '../services/pluginRecentProjectImages';

type Props = {
  onCancel: () => void;
  onSelect: (option: PluginRecentProjectImageOption, projectName: string) => void;
};

export function PluginRecentProjectImagePicker({ onCancel, onSelect }: Props) {
  const { t } = useAppTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<PluginRecentProjectImages>({
    project: null,
    images: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadMostRecentPluginProjectImages()
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '最近项目图片读取失败。');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return (
    <div
      ref={dialogRef}
      data-theme-role="modal-backdrop"
      className="fixed inset-0 z-[420] flex items-center justify-center bg-black/75 p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('pluginHost.recentProjectImagePicker.title', '从最近项目选择图片')}
      tabIndex={-1}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div
        data-theme-role="modal-surface"
        className="flex max-h-[76vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#1d1d20] p-4 shadow-2xl"
      >
        <div
          data-theme-role="modal-titlebar"
          className="mb-3 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <h4 className="truncate text-sm font-medium text-white/90">
              {t('pluginHost.recentProjectImagePicker.title', '从最近项目选择图片')}
            </h4>
            <p className="mt-0.5 truncate text-[11px] text-white/40">
              {result.project
                ? t(
                    'pluginHost.recentProjectImagePicker.source',
                    '只读取最近使用的第一个项目：{name}',
                    { name: result.project.name },
                  )
                : t(
                    'pluginHost.recentProjectImagePicker.hint',
                    '只读取首页最近使用列表中的第一个项目',
                  )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white"
            aria-label={t('common.close', '关闭')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-44 items-center justify-center gap-2 text-xs text-white/45">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {t('pluginHost.recentProjectImagePicker.loading', '正在读取最近项目图片…')}
          </div>
        ) : error ? (
          <div className="flex h-44 flex-col items-center justify-center gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.04] px-6 text-center text-xs text-rose-100/70">
            <span>{error}</span>
            <button
              type="button"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-white/65 hover:bg-white/10"
              onClick={() => setReload((value) => value + 1)}
            >
              {t('common.retry', '重试')}
            </button>
          </div>
        ) : !result.project ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-xs text-white/35">
            <FolderOpen className="h-6 w-6" />
            {t('pluginHost.recentProjectImagePicker.noProject', '还没有可读取的最近项目')}
          </div>
        ) : result.images.length ? (
          <div className="grid min-h-0 auto-rows-max grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
            {result.images.map((option) => (
              <button
                key={option.id}
                type="button"
                data-plugin-recent-project-image={option.id}
                onClick={() => onSelect(option, result.project?.name ?? '')}
                className="group self-start overflow-hidden rounded-xl border border-white/10 bg-black/25 text-left hover:border-emerald-400/40"
              >
                <img
                  src={option.url}
                  alt={option.title}
                  className="block aspect-video w-full bg-black/30 object-contain"
                />
                <span className="block truncate px-2 py-1.5 text-[11px] text-white/65 group-hover:text-white/90">
                  {option.title}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-xs text-white/35">
            <ImageIcon className="h-6 w-6" />
            {t('pluginHost.recentProjectImagePicker.noImages', '最近项目中没有可用的真实图片')}
          </div>
        )}
      </div>
    </div>
  );
}
