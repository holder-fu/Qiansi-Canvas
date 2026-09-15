import { describe, expect, it } from 'vitest';
import source from './Header.tsx?raw';

describe('header canvas menu', () => {
  it('reuses the website favicon for the workspace brand icon', () => {
    expect(source).toContain('src="/favicon.svg"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).not.toContain('>K</span>');
  });

  it('keeps active-canvas workspace actions in the header while project management lives on Home', () => {
    expect(source).toContain('data-theme-role="workspace-switcher"');
    expect(source).toContain('data-theme-role="workspace-menu"');
    expect(source).toContain('<TopCanvasToolbarRegion mode="visible" label="workspace">');
    expect(source).toContain('{canvasName}');
    expect(source).toContain("t('header.import')");
    expect(source).toContain("t('header.export')");
    expect(source).toContain('data-current-project-name="true"');
    expect(source).toContain('const projectName = useCanvasStore((s) => s.projectName)');
    expect(source).toContain("t('header.currentProject', '当前项目')");
    expect(source).toContain("projectName.trim() || t('header.unnamedProject', '未命名项目')");
    expect(source).not.toContain('data-project-enter-button');
    expect(source).not.toContain('s.projects');
    expect(source).not.toContain("toolbarMode('top-project')");
  });

  it('detects import content before any canvas or library write and requires confirmation', () => {
    expect(source).toContain('data-smart-import-trigger="true"');
    expect(source).toContain('data-smart-import-input="true"');
    expect(source).toContain('detectSmartImport(files)');
    expect(source).toContain('setPendingSmartImport({ files, detection })');
    expect(source).toContain('data-smart-import-confirmation="true"');
    expect(source).toContain('点击“确认导入”后才会写入数据');
    expect(source).toContain('data-smart-import-confirm="true"');
    expect(source).toContain('onClick={() => void confirmSmartImport()}');
    expect(source).toContain("pending.detection.kind === 'library-package'");
    expect(source).toContain('importLibraryTransferFile(');
    expect(source).toContain('不会自动加入“我的素材库”');
  });

  it('surfaces persistence failures instead of silently dropping autosave', () => {
    expect(source).toContain('s.persistenceStatus');
    expect(source).toContain('data-canvas-persistence-error="true"');
    expect(source).toContain("persistenceStatus.state === 'conflict'");
    expect(source).toContain('persistenceStatus.message');
    expect(source).toContain("'header.persistenceError'");
    expect(source).toContain('exportCanvasPersistenceConflictCopy(activeProjectId)');
    expect(source).toContain("t('header.exportConflictCopy', '导出冲突副本')");
    expect(source).toContain('reloadCanvasFromBridgeAfterConflict');
    expect(source).toContain('data-canvas-conflict-reload-host="true"');
    expect(source).toContain("['bridge-remote', 'bridge-local-read'].includes");
    expect(source).toContain('if (!downloadPersistenceConflictCopy()) return');
    expect(source).toContain('disabled={persistenceRecoveryBusy}');
    expect(source).toContain('aria-busy={persistenceRecoveryBusy}');
    expect(source).toContain("t('header.backupAndReloadHost', '备份并载入主机版本')");
    expect(source).toContain("t('header.reloadingHost', '正在载入…')");
    expect(source).toContain('flushCanvasPersistence');
    expect(source).toContain('data-canvas-persistence-retry="true"');
    expect(source).toContain('disabled={persistenceRetryBusy}');
    expect(source).toContain('aria-busy={persistenceRetryBusy}');
    expect(source).toContain("persistenceStatus.state === 'error' && (");
    expect(source).toContain("t('header.retryPersistence', '重试保存')");
    expect(source).toContain("t('header.retryingPersistence', '正在重试…')");
    expect(source).toMatch(
      /const persistenceNoticeKey = \[\s*persistenceStatus\.projectId,\s*persistenceStatus\.state,\s*persistenceStatus\.lastAttemptAt \?\? 0,\s*\]\.join\(':'\)/,
    );
    expect(source).toContain('dismissedPersistenceNoticeKey !== persistenceNoticeKey');
    expect(source).toContain('persistenceStatus.projectId === activeProjectId');
    expect(source).toContain(
      'onClick={() => setDismissedPersistenceNoticeKey(persistenceNoticeKey)}',
    );
    expect(source).toContain('data-canvas-persistence-dismiss="true"');
    expect(source).toContain("t('header.dismissPersistence', '关闭画布保存提示')");
    expect(source).toContain("'qiansi:lan-collaboration-conflict'");
    expect(source).toContain('getLanCollaborationConflictCopy(activeProjectId)');
    expect(source).toContain('exportLanCollaborationConflictCopy(activeProjectId)');
    expect(source).toContain('data-lan-collaboration-conflict="true"');
    expect(source).toContain("activeLanConflict?.reason === 'remote-updated-while-local-dirty'");
    expect(source).toContain("'header.lanRemoteConflict'");
    expect(source).toContain("persistenceStatus.state !== 'error'");
    expect(source).toContain("persistenceStatus.state !== 'conflict'");
    expect(source).toContain('{!isHome && lanConflictNoticeVisible && (');
    expect(source).toContain("t('header.exportLanConflictCopy', '导出双方副本')");
    expect(source).toContain('dismissedLanConflictCopies.current.add(conflict)');
    expect(source).toContain('onClick={dismissLanConflict}');
    expect(source).toContain('data-lan-collaboration-conflict-dismiss="true"');
    expect(source).toContain("t('header.dismissLanConflict', '关闭局域网冲突提示')");
  });
});
