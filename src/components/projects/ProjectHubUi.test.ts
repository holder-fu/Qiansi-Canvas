import { describe, expect, it } from 'vitest';
import headerSource from '../Header.tsx?raw';
import homeSource from '../Home.tsx?raw';
import footerSource from '../AppFooter.tsx?raw';
import navigationSource from '../../store/homeNavigationStore.ts?raw';
import cardSource from './ProjectCard.tsx?raw';
import menuSource from './ProjectCardMenu.tsx?raw';
import hubSource from './ProjectHub.tsx?raw';

describe('project hub UI contract', () => {
  it('adds a coherent home/projects shell without changing the canvas route', () => {
    expect(navigationSource).toContain("export type HomeSection = 'home' | 'projects'");
    expect(navigationSource).toContain("section: 'home'");
    expect(homeSource).toContain('data-theme-role="home-sidebar"');
    expect(homeSource).toContain('useHomeNavigationStore');
    expect(homeSource).toContain('<ProjectHub');
    expect(homeSource).toContain("t('home.newProject', '新建项目')");
    expect(homeSource).toContain("t('home.nav.home', '首页')");
    expect(homeSource).toContain("t('home.nav.projects', '项目')");
    expect(homeSource).toContain('<HomeDashboard />');
    expect(homeSource).toContain('<AppFooter />');
    expect(footerSource).toContain("t('home.license')");
    expect(footerSource).toContain("t('home.shortcuts')");
    expect(footerSource).toContain("t('home.title')");
    expect(footerSource).toContain("setOpenModal('shortcuts')");
    expect(homeSource).toContain("t('home.canvasLoading', '项目加载中…')");
    expect(homeSource).toContain('state.workspaceTransition');
    expect(homeSource).toContain('role="status"');
    expect(homeSource).toContain('aria-busy="true"');
  });

  it('opens the newest recent canvas from both primary Home entries while workflows create projects', () => {
    expect(homeSource).toContain('createBridgeWorkflowProject');
    expect(homeSource).toContain('createWorkflowProject(card.id)');
    expect(homeSource).toContain('const primaryRecentProject = recentProjects[0]');
    expect(homeSource).toContain('void openRecentProject(primaryRecentProject)');
    expect(homeSource).toContain('setWorkspace(resumeWorkspace)');
    expect(homeSource.match(/onClick={enterCurrentCanvas}/g)).toHaveLength(2);
    expect(homeSource).not.toContain('createWorkflowProject(resumeWorkspace)');
    expect(homeSource).not.toContain('onClick={() => setWorkspace(card.id)}');
    expect(homeSource).toContain("t('home.creatingProject', '正在创建项目…')");
  });

  it('shows the four recently used canvases as shortcuts above Creative resources', () => {
    expect(homeSource).toContain('selectRecentlyUsedCanvases(catalog.projects)');
    expect(homeSource).toContain('openBridgeCanvasProject(project.id, { initialZoom: 0.3 })');
    expect(homeSource).toContain("t('home.recentProjects', '最近使用的画布')");
    expect(homeSource).toContain("t('home.viewAllProjects', '查看全部项目')");
    expect(homeSource).toContain("setHomeSection('projects')");
    expect(homeSource).toContain('project.coverUrl || project.autoCoverUrl');
    expect(homeSource.indexOf("t('home.recentProjects', '最近使用的画布')")).toBeLessThan(
      homeSource.indexOf("t('home.resources')"),
    );
  });

  it('places safe creator profile links below Help in the Home sidebar', () => {
    expect(homeSource).toContain("t('home.creatorLinks', '个人主页')");
    for (const asset of ['github.svg', 'youtube.ico', 'bilibili.ico', 'douyin.ico']) {
      expect(homeSource).toContain(`creator-links/${asset}`);
    }
    expect(homeSource).toContain('src={link.iconSrc}');
    expect(homeSource).toContain('aria-hidden="true"');
    expect(homeSource.indexOf("t('home.help', '帮助')")).toBeLessThan(
      homeSource.indexOf("t('home.creatorLinks', '个人主页')"),
    );
    for (const href of [
      'https://github.com/holder-fu/',
      'https://www.youtube.com/@holder6522',
      'https://space.bilibili.com/410771067',
      'https://www.douyin.com/user/MS4wLjABAAAA_h2K39mV-GSqRhsncB7G85OIKcNabnNSckQKOuH0sL4?from_tab_name=main&vid=7661509584624054885',
    ]) {
      expect(homeSource).toContain(href);
    }
    expect(homeSource).toContain('target="_blank"');
    expect(homeSource).toContain('rel="noopener noreferrer"');
  });

  it('opens the Home Help entry as the requested external Feishu guide', () => {
    const helpHref =
      'https://holder2895.feishu.cn/wiki/PDHkwkKDMiF3ymkLuYScgDesnwe?from=from_copylink';
    const hrefIndex = homeSource.indexOf(helpHref);
    const helpLinkSource = homeSource.slice(
      homeSource.lastIndexOf('<a', hrefIndex),
      homeSource.indexOf('</a>', hrefIndex) + '</a>'.length,
    );

    expect(hrefIndex).toBeGreaterThan(-1);
    expect(helpLinkSource).toContain('target="_blank"');
    expect(helpLinkSource).toContain('rel="noopener noreferrer"');
    expect(helpLinkSource).toContain("t('home.help', '帮助')");
    expect(helpLinkSource).not.toContain("setOpenModal('help')");
  });

  it('shows enabled compatible plugins below Projects and opens real contributed panels', () => {
    expect(homeSource).toContain('enabledCompatiblePlugins(pluginCatalog)');
    expect(homeSource).toContain('splitHomeSidebarPlugins(availablePlugins)');
    expect(homeSource).toContain("t('home.availablePlugins', '可用插件')");
    expect(homeSource).toContain("panels.find((entry) => entry.position === 'fullscreen')");
    expect(homeSource).toContain('openPluginPanel(plugin.manifest.id, panel.id)');
    expect(homeSource).toContain("t('home.pluginEnabled', '{name} 已启用'");
    expect(homeSource.indexOf('项目')).toBeLessThan(homeSource.indexOf('home.availablePlugins'));
  });

  it('shows twelve plugins directly and places every remaining plugin in an accessible More menu', () => {
    expect(homeSource).toContain('visiblePlugins.map((plugin) => renderPluginEntry(plugin))');
    expect(homeSource).toContain('overflowPlugins.length > 0');
    expect(homeSource).toContain("t('home.morePlugins', '更多')");
    expect(homeSource).toContain('aria-haspopup="menu"');
    expect(homeSource).toContain('role="menu"');
    expect(homeSource).toContain('renderPluginEntry(plugin, true)');
    expect(homeSource).toContain("window.addEventListener('pointerdown', closeOnOutsideClick)");
    expect(homeSource).toContain("event.key !== 'Escape'");
  });

  it('routes the canvas menu to Home or All Projects explicitly', () => {
    expect(headerSource).toContain("setHomeSection('home')");
    expect(headerSource).toContain("setHomeSection('projects')");
    expect(headerSource).toContain("t('header.allProjects', '所有项目')");
    expect(headerSource.match(/setWorkspace\('home'\)/g)).toHaveLength(2);
  });

  it('uses the Bridge project service for every catalog command', () => {
    for (const command of [
      'listProjects',
      'createProject',
      'renameProject',
      'duplicateProject',
      'moveProjectToFolder',
      'archiveProject',
      'createProjectFolder',
      'deleteProjectFolder',
      'uploadProjectCover',
      'openBridgeCanvasProject',
    ]) {
      expect(hubSource).toContain(command);
    }
    expect(hubSource).toContain("t('projects.title', '全部项目')");
    expect(hubSource).toContain("t('projects.loading', '正在读取项目…')");
    expect(hubSource).toContain("t('projects.reload', '重新加载')");
    expect(hubSource).toContain('busyKey');
    expect(hubSource).toContain('setPrimaryProjectId(result.primaryProjectId)');
    expect(hubSource).toContain('canDelete={project.id !== primaryProjectId}');
    expect(hubSource).toContain("t('projects.error.open', '项目未能安全打开");
    expect(hubSource).toContain('expectedRevision: project.revision');
    expect(hubSource.match(/expectedRevision:/g)).toHaveLength(4);
    expect(hubSource).toContain('expectedCatalogRevision: catalogRevision');
    expect(hubSource.match(/expectedCatalogRevision:/g)).toHaveLength(8);
  });

  it('keeps project covers at 16:9 and exposes the complete contextual menu', () => {
    expect(cardSource).toContain('aspect-video');
    expect(cardSource).toContain('object-cover');
    expect(cardSource).toContain('project.coverUrl || project.autoCoverUrl');
    expect(cardSource).toContain('onError={() => setFailedCoverUrl(coverUrl)}');
    expect(menuSource).toContain('aria-haspopup="menu"');
    expect(menuSource).toContain("window.addEventListener('pointerdown'");
    expect(menuSource).toContain("event.key !== 'Escape'");
    for (const label of [
      'projects.menu.open',
      'projects.menu.rename',
      'projects.menu.cover',
      'projects.menu.duplicate',
      'projects.menu.move',
      'projects.menu.delete',
      'projects.menu.defaultCannotDelete',
    ]) {
      expect(menuSource).toContain(label);
    }
  });

  it('requires a second confirmation before archiving a project', () => {
    expect(hubSource).toContain('<ProjectConfirmDialog');
    expect(hubSource).toContain('projects.dialog.deleteProject.description');
    expect(hubSource).toContain('archiveProject(dialog.project.id, {');
    expect(hubSource).toContain('await flushCanvasPersistence()');
    expect(hubSource).toContain('dialog.project.id === activeProjectId');
    expect(hubSource).toContain('openBridgeCanvasProject(fallback.id, { stayOnHome: true })');
  });
});
