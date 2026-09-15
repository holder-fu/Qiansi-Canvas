import { useEffect, useState } from 'react';
import { flushCanvasPersistence, useCanvasStore } from '../store/canvasStore';
import {
  commitPageUpdateDrafts,
  pageUpdateBlocked,
  saveBeforePageUpdate,
} from '../lib/pageUpdateDrafts';
import { checkWebBuildUpdate, useWebBuildUpdate } from '../lib/webBuildUpdate';
import { useAppTranslation } from '../i18n/appI18n';

export function WebBuildUpdateNotice() {
  const { t } = useAppTranslation();
  const available = useWebBuildUpdate((state) => state.available);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!busy) return;
    const block = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', block, true);
    return () => window.removeEventListener('keydown', block, true);
  }, [busy]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void checkWebBuildUpdate();
    };
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);
  if (!available) return null;
  const update = async () => {
    if (busy) return;
    const canUpdate = () =>
      !pageUpdateBlocked() &&
      !useCanvasStore.getState().openModal &&
      !document.querySelector('[role="dialog"]') &&
      !useCanvasStore.getState().nodes.some((node) => node.data.generating);
    if (!canUpdate()) {
      setMessage(
        t('runtimeUpdate.finishEditing', '请先完成运行中的任务，并关闭编辑弹窗，再更新页面。'),
      );
      return;
    }
    setBusy(true);
    setMessage(t('runtimeUpdate.checkingSave', '正在确认当前内容已保存…'));
    // While saving, block further edits so a late keystroke cannot be lost at reload.
    try {
      const saved = await saveBeforePageUpdate({
        canUpdate,
        commit: commitPageUpdateDrafts,
        save: flushCanvasPersistence,
        capture: () => {
          const state = useCanvasStore.getState();
          return [
            state.activeProjectId,
            state.workspace,
            state.nodes,
            state.edges,
            state.assets,
            state.tabs,
            state.activeTabId,
            state.trash,
            state.genParams,
            state.activeTags,
            state.projectName,
          ];
        },
      });
      if (!saved) throw new Error('save-blocked');
      window.location.reload();
    } catch {
      setMessage(t('runtimeUpdate.saveBlocked', '暂时无法确认保存，未刷新页面。请稍后重试。'));
      setBusy(false);
    }
  };
  return (
    <>
      {busy && (
        <div
          className="fixed inset-0 z-[299] cursor-wait"
          aria-label={t('runtimeUpdate.saving', '正在保存…')}
        />
      )}
      <section
        data-theme-role="panel"
        role="status"
        aria-live="polite"
        className="fixed right-6 top-20 z-[300] max-w-sm rounded-xl border border-edge bg-panel p-4 text-sm text-white/85 shadow-xl"
      >
        <p className="font-medium">{t('runtimeUpdate.ready', '新版本已准备好')}</p>
        <p className="mt-1 text-xs leading-5 text-white/60">
          {message || t('runtimeUpdate.continue', '可以继续创作，完成当前编辑后再更新页面。')}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void update()}
          className="mt-3 rounded-lg border border-edge px-3 py-1.5 disabled:opacity-50"
        >
          {busy
            ? t('runtimeUpdate.saving', '正在保存…')
            : t('runtimeUpdate.saveAndUpdate', '保存并更新')}
        </button>
      </section>
    </>
  );
}
