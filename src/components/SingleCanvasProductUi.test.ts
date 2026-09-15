import { describe, expect, it } from 'vitest';
import homeSource from './Home.tsx?raw';
import projectHubSource from './projects/ProjectHub.tsx?raw';
import projectMenuSource from './projects/ProjectCardMenu.tsx?raw';
import settingsSource from './SettingsPanel.tsx?raw';
import trashSource from './TrashModal.tsx?raw';

describe('Bridge project product UI', () => {
  it('keeps workspace entry points and adds the Bridge-authoritative project hub', () => {
    expect(homeSource).toContain('cards.map((card) =>');
    expect(homeSource).toContain('libraryEntries.map((entry) =>');
    expect(homeSource).toContain("t('home.currentCanvas', '当前画布')");
    expect(homeSource).toContain('<ProjectHub');
    expect(homeSource).toContain('新建项目');
    expect(homeSource).toContain('项目');
    expect(projectHubSource).toContain('openBridgeCanvasProject');
    expect(projectHubSource).toContain('createProject');
    expect(projectHubSource).toContain('createProjectFolder');
    expect(projectHubSource).toContain('primaryProjectId');
    expect(projectMenuSource).toContain('修改封面');
    expect(projectMenuSource).toContain('创建副本');
    expect(projectMenuSource).toContain('移动至文件夹');
    expect(projectMenuSource).toContain('删除项目');
  });

  it('keeps canvas naming and autosave settings separate from project-card commands', () => {
    expect(settingsSource).toContain("title={t('settings.canvasSave', '画布与自动保存')}");
    expect(settingsSource).toContain("t('settingsPage.project.canvasName', '当前画布名称')");
    expect(settingsSource).toContain("t('settingsPage.appearance.scope.project', '当前画布')");
    expect(settingsSource).not.toContain('commitProjectName');
    expect(settingsSource).not.toContain('state.renameProject');
    expect(settingsSource).not.toContain("t('settingsPage.project.projectName'");
    expect(settingsSource).not.toContain("id: 'top-project'");
  });

  it('does not expose canvas import or export tools inside Settings', () => {
    expect(settingsSource).not.toContain("id: 'import-export'");
    expect(settingsSource).not.toContain('ImportExportSettings');
    expect(settingsSource).not.toContain('settingsPage.importExport');
  });

  it('offers a persistent move-to-trash confirmation toggle in General settings', () => {
    expect(settingsSource).toContain('state.confirmMoveToTrash');
    expect(settingsSource).toContain("setPreference('confirmMoveToTrash', !confirmMoveToTrash)");
    expect(settingsSource).toContain('移到回收站前确认');
  });

  it('labels the retained trash as canvas-scoped without displaying a project name', () => {
    expect(trashSource).toContain("t('trash.canvasTitle', '当前画布回收站')");
    expect(trashSource).not.toContain('state.projectName');
    expect(trashSource).not.toContain("t('trash.projectTitle'");
  });
});
