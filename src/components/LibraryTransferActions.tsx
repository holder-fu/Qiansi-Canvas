import { Check, Download, LoaderCircle, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAppTranslation } from '../i18n/appI18n';
import {
  createLibraryTransferArchive,
  downloadLibraryTransferArchive,
  importLibraryTransferFile,
  type LibraryTransferKind,
  type LibraryTransferSourceItem,
  type LibraryTransferScope,
} from '../lib/libraryTransfer';

interface LibraryTransferActionsProps {
  kind: LibraryTransferKind;
  items: LibraryTransferSourceItem[];
  categories?: string[];
  modelCategories?: string[];
  projectId: string;
  onImported?: () => void | Promise<void>;
}

export function LibraryTransferActions({
  kind,
  items,
  categories,
  modelCategories,
  projectId,
  onImported,
}: LibraryTransferActionsProps) {
  const { t } = useAppTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const available = new Set(items.map((item) => item.id));
    setSelectedIds((current) => new Set([...current].filter((id) => available.has(id))));
  }, [items]);

  const toggleItem = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async (scope: LibraryTransferScope) => {
    const exportedItems =
      scope === 'all' ? items : items.filter((item) => selectedIds.has(item.id));
    if (exportedItems.length === 0) {
      setNotice({ tone: 'error', text: t('library.transfer.selectRequired', '请先选择资料。') });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const archive = await createLibraryTransferArchive({
        kind,
        scope,
        items: exportedItems,
        categories,
        modelCategories,
      });
      downloadLibraryTransferArchive(archive);
      setExportOpen(false);
      setNotice({
        tone: 'success',
        text: t('library.transfer.exportSuccess', '已导出 {count} 项资料。', {
          count: exportedItems.length,
        }),
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        text:
          error instanceof Error ? error.message : t('library.transfer.exportFailed', '导出失败。'),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const count = await importLibraryTransferFile(file, kind, projectId);
      await onImported?.();
      setNotice({
        tone: 'success',
        text: t('library.transfer.importSuccess', '已导入 {count} 项资料。', { count }),
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        text:
          error instanceof Error ? error.message : t('library.transfer.importFailed', '导入失败。'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1" data-library-transfer-kind={kind}>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.json,.qiansi-library.json,application/zip,application/json"
        className="hidden"
        onChange={handleImport}
        data-library-transfer-input={kind}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={t('library.transfer.import', '导入资料')}
        title={t('library.transfer.import', '导入资料')}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-40"
      >
        <Upload className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          setExportOpen((current) => !current);
          setNotice(null);
        }}
        disabled={busy}
        aria-label={t('library.transfer.export', '导出资料')}
        title={t('library.transfer.export', '导出资料')}
        aria-expanded={exportOpen}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-wait disabled:opacity-40 ${
          exportOpen ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/10 hover:text-white'
        }`}
      >
        {busy ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>

      {exportOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-[#242428] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-white/90">
                {t('library.transfer.exportTitle', '选择导出资料')}
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">
                {t('library.transfer.selectedCount', '已选 {selected} / {total} 项', {
                  selected: selectedIds.size,
                  total: items.length,
                })}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(items.map((item) => item.id)))}
                className="text-emerald-300/85 hover:text-emerald-200"
              >
                {t('library.transfer.selectAll', '全选')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-white/45 hover:text-white/75"
              >
                {t('library.transfer.clear', '清空')}
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5">
            {items.length ? (
              items.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-white/75 hover:bg-white/[0.07]"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-200'
                          : 'border-white/15 text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="truncate">{item.title}</span>
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-6 text-center text-xs text-white/35">
                {t('library.transfer.empty', '当前没有可导出的资料。')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] p-2.5">
            <button
              type="button"
              onClick={() => void handleExport('selected')}
              disabled={busy || selectedIds.size === 0}
              className="h-8 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-xs text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {t('library.transfer.exportSelected', '导出所选（{count}）', {
                count: selectedIds.size,
              })}
            </button>
            <button
              type="button"
              onClick={() => void handleExport('all')}
              disabled={busy || items.length === 0}
              className="h-8 rounded-lg bg-emerald-500/20 px-2 text-xs text-emerald-200 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {t('library.transfer.exportAll', '全部导出（{count}）', { count: items.length })}
            </button>
          </div>
        </div>
      )}

      {notice && !exportOpen && (
        <div
          role="status"
          className={`absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border px-3 py-2 text-xs shadow-xl ${
            notice.tone === 'success'
              ? 'border-emerald-400/20 bg-[#183128] text-emerald-100'
              : 'border-red-400/20 bg-[#351d20] text-red-100'
          }`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}
