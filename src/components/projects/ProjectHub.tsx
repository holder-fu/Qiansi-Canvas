import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder, FolderPlus, ImagePlus, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  flushCanvasPersistence,
  openBridgeCanvasProject,
  useCanvasStore,
} from '../../store/canvasStore';
import {
  archiveProject,
  createProject,
  createProjectFolder,
  deleteProjectFolder,
  duplicateProject,
  listProjects,
  moveProjectToFolder,
  renameProject,
  uploadProjectCover,
  type ProjectFolder,
  type ProjectSummary,
} from '../../services/projectHub';
import { ProjectCard } from './ProjectCard';
import { ProjectConfirmDialog, ProjectTextDialog } from './ProjectDialogs';
import {
  filterProjectsByFolder,
  sortProjectsByUpdatedAt,
  type ProjectFolderFilter,
} from './projectPresentation';
import { useAppTranslation } from '../../i18n/appI18n';

type ProjectDialogState =
  | { kind: 'create' }
  | { kind: 'create-folder' }
  | { kind: 'rename'; project: ProjectSummary }
  | { kind: 'delete'; project: ProjectSummary }
  | { kind: 'delete-folder'; folder: ProjectFolder }
  | null;

interface ProjectHubProps {
  createDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function ProjectHub({ createDialogOpen, onCreateDialogOpenChange }: ProjectHubProps) {
  const { t } = useAppTranslation();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [primaryProjectId, setPrimaryProjectId] = useState('');
  const [catalogRevision, setCatalogRevision] = useState<number>();
  const [filter, setFilter] = useState<ProjectFolderFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ProjectDialogState>(null);
  const [nameDraft, setNameDraft] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverProjectRef = useRef<ProjectSummary | null>(null);
  const activeProjectId = useCanvasStore((state) => state.activeProjectId);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await listProjects();
      setProjects(result.projects);
      setFolders(result.folders);
      setPrimaryProjectId(result.primaryProjectId);
      setCatalogRevision(result.catalogRevision);
      setFilter((current) =>
        current === 'all' ||
        current === 'unfiled' ||
        result.folders.some((folder) => folder.id === current)
          ? current
          : 'all',
      );
    } catch (error) {
      setLoadError(errorText(error, t('projects.error.catalog', '项目目录读取失败。')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!createDialogOpen) return;
    setNameDraft('');
    setOperationError(null);
    setDialog({ kind: 'create' });
  }, [createDialogOpen]);

  const visibleProjects = useMemo(
    () => sortProjectsByUpdatedAt(filterProjectsByFolder(projects, filter)),
    [filter, projects],
  );

  const closeDialog = () => {
    if (busyKey) return;
    setDialog(null);
    setOperationError(null);
    onCreateDialogOpenChange(false);
  };

  const runProjectOperation = async (
    key: string,
    operation: () => Promise<unknown>,
    options: { closeDialog?: boolean; refresh?: boolean } = { refresh: true },
  ) => {
    if (busyKey) return false;
    setBusyKey(key);
    setOperationError(null);
    try {
      await operation();
      if (options.refresh !== false) await refresh();
      if (options.closeDialog) {
        setDialog(null);
        setOperationError(null);
        onCreateDialogOpenChange(false);
      }
      return true;
    } catch (error) {
      setOperationError(errorText(error, t('projects.error.operation', '项目操作失败。')));
      // A failed CAS means another terminal may already have changed the
      // directory. Refresh before the user retries so we never keep issuing
      // mutations against a known-stale catalog revision.
      await refresh();
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const openProject = async (project: ProjectSummary) => {
    setOpenMenuProjectId(null);
    await runProjectOperation(
      `open:${project.id}`,
      async () => {
        const opened = await openBridgeCanvasProject(project.id);
        if (!opened) {
          throw new Error(t('projects.error.open', '项目未能安全打开，请检查主机存储后重试。'));
        }
      },
      { refresh: false },
    );
  };

  const create = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    let created: ProjectSummary | undefined;
    const succeeded = await runProjectOperation(
      'create',
      async () => {
        created = await createProject(name, { expectedCatalogRevision: catalogRevision });
      },
      { closeDialog: false, refresh: true },
    );
    if (!succeeded || !created) return;
    setDialog(null);
    onCreateDialogOpenChange(false);
    await openProject(created);
  };

  const rename = async (project: ProjectSummary) => {
    const name = nameDraft.trim();
    if (!name) return;
    const succeeded = await runProjectOperation(
      `rename:${project.id}`,
      () =>
        renameProject(project.id, name, {
          expectedRevision: project.revision,
          expectedCatalogRevision: catalogRevision,
        }),
      { closeDialog: false, refresh: true },
    );
    if (succeeded) closeDialog();
  };

  const requestCover = (project: ProjectSummary) => {
    coverProjectRef.current = project;
    setOperationError(null);
    coverInputRef.current?.click();
  };

  const changeCover = async (file: File) => {
    const project = coverProjectRef.current;
    coverProjectRef.current = null;
    if (!project) return;
    if (!file.type.startsWith('image/')) {
      setOperationError(t('projects.error.coverType', '项目封面必须是图片文件。'));
      return;
    }
    await runProjectOperation(`cover:${project.id}`, async () => {
      await uploadProjectCover(project.id, file, {
        expectedRevision: project.revision,
        expectedCatalogRevision: catalogRevision,
      });
    });
  };

  const createFolder = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    const succeeded = await runProjectOperation(
      'create-folder',
      () => createProjectFolder(name, { expectedCatalogRevision: catalogRevision }),
      {
        closeDialog: false,
        refresh: true,
      },
    );
    if (succeeded) closeDialog();
  };

  return (
    <section className="min-w-0 flex-1" aria-labelledby="project-hub-title">
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void changeCover(file);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <h1 id="project-hub-title" className="text-xl font-semibold tracking-tight text-white/92">
            {t('projects.title', '全部项目')}
          </h1>
          <p className="mt-1 text-xs text-white/38">
            {t('projects.description', '管理本机 Bridge 中保存的创作项目')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || Boolean(busyKey)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-white/52 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
            aria-label={t('projects.refresh', '刷新项目列表')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            data-theme-role="primary-action"
            type="button"
            onClick={() => {
              setNameDraft('');
              setOperationError(null);
              setDialog({ kind: 'create' });
              onCreateDialogOpenChange(true);
            }}
            disabled={Boolean(busyKey)}
            className="flex h-9 items-center gap-2 rounded-lg bg-emerald-500 px-3.5 text-sm font-semibold text-[#07120a] hover:bg-emerald-400 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            {t('projects.newProject', '新建项目')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-active={filter === 'all'}
          onClick={() => setFilter('all')}
          className={`rounded-lg border px-3 py-1.5 text-xs transition ${
            filter === 'all'
              ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
              : 'border-white/[0.08] bg-white/[0.025] text-white/48 hover:bg-white/[0.06] hover:text-white/76'
          }`}
        >
          {t('projects.allCount', '全部 {count}', { count: projects.length })}
        </button>
        <button
          type="button"
          data-active={filter === 'unfiled'}
          onClick={() => setFilter('unfiled')}
          className={`rounded-lg border px-3 py-1.5 text-xs transition ${
            filter === 'unfiled'
              ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
              : 'border-white/[0.08] bg-white/[0.025] text-white/48 hover:bg-white/[0.06] hover:text-white/76'
          }`}
        >
          {t('projects.uncategorized', '未分类')}
        </button>
        {folders.map((folder) => (
          <span key={folder.id} className="group/folder flex items-center">
            <button
              type="button"
              data-active={filter === folder.id}
              onClick={() => setFilter(folder.id)}
              className={`flex items-center gap-1.5 rounded-l-lg border border-r-0 px-3 py-1.5 text-xs transition ${
                filter === folder.id
                  ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
                  : 'border-white/[0.08] bg-white/[0.025] text-white/48 hover:bg-white/[0.06] hover:text-white/76'
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
              {folder.name}
            </button>
            <button
              type="button"
              onClick={() => {
                setOperationError(null);
                setDialog({ kind: 'delete-folder', folder });
              }}
              className={`flex h-[30px] w-7 items-center justify-center rounded-r-lg border text-white/28 transition hover:bg-rose-400/10 hover:text-rose-300 ${
                filter === folder.id
                  ? 'border-emerald-400/35 bg-emerald-400/10'
                  : 'border-white/[0.08] bg-white/[0.025]'
              }`}
              aria-label={t('projects.deleteFolderLabel', '删除文件夹“{name}”', {
                name: folder.name,
              })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => {
            setNameDraft('');
            setOperationError(null);
            setDialog({ kind: 'create-folder' });
          }}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.1] px-3 py-1.5 text-xs text-white/42 hover:border-white/[0.18] hover:bg-white/[0.04] hover:text-white/70"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {t('projects.newFolder', '新建文件夹')}
        </button>
      </div>

      {operationError && !dialog && (
        <div
          role="alert"
          className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3.5 py-3 text-xs leading-5 text-rose-200"
        >
          <span>{operationError}</span>
          <button
            type="button"
            onClick={() => setOperationError(null)}
            className="shrink-0 text-rose-200/60 hover:text-rose-100"
          >
            {t('common.close', '关闭')}
          </button>
        </div>
      )}

      {loading && projects.length === 0 ? (
        <div className="flex min-h-72 items-center justify-center text-sm text-white/42">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          {t('projects.loading', '正在读取项目…')}
        </div>
      ) : loadError ? (
        <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-5">
          <p role="alert" className="text-sm text-rose-200">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 h-9 rounded-lg border border-rose-300/20 px-3 text-sm text-rose-100 hover:bg-rose-300/10"
          >
            {t('projects.reload', '重新加载')}
          </button>
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.018] px-5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.045] text-white/28">
            <ImagePlus className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-sm font-medium text-white/70">
            {projects.length === 0
              ? t('projects.empty.all', '还没有项目')
              : t('projects.empty.folder', '这个文件夹暂无项目')}
          </h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-white/35">
            {projects.length === 0
              ? t(
                  'projects.empty.allDescription',
                  '创建一个空白项目，开始整理角色、分镜、视频和声音。',
                )
              : t('projects.empty.folderDescription', '可以从项目卡片菜单把项目移动到这里。')}
          </p>
          {projects.length === 0 && (
            <button
              data-theme-role="primary-action"
              type="button"
              onClick={() => {
                setNameDraft('');
                setDialog({ kind: 'create' });
                onCreateDialogOpenChange(true);
              }}
              className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-emerald-500 px-3.5 text-sm font-medium text-[#07120a] hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              {t('projects.createFirst', '创建第一个项目')}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              folders={folders}
              canDelete={project.id !== primaryProjectId}
              menuOpen={openMenuProjectId === project.id}
              busy={busyKey?.endsWith(`:${project.id}`) || busyKey === `open:${project.id}`}
              onMenuOpenChange={(open) => setOpenMenuProjectId(open ? project.id : null)}
              onOpen={() => void openProject(project)}
              onRename={() => {
                setNameDraft(project.name);
                setOperationError(null);
                setDialog({ kind: 'rename', project });
              }}
              onChangeCover={() => requestCover(project)}
              onDuplicate={() =>
                void runProjectOperation(`duplicate:${project.id}`, () =>
                  duplicateProject(project.id, { expectedCatalogRevision: catalogRevision }),
                )
              }
              onMoveToFolder={(folderId) =>
                void runProjectOperation(`move:${project.id}`, () =>
                  moveProjectToFolder(project.id, folderId, {
                    expectedRevision: project.revision,
                    expectedCatalogRevision: catalogRevision,
                  }),
                )
              }
              onDelete={() => {
                setOperationError(null);
                setDialog({ kind: 'delete', project });
              }}
            />
          ))}
        </div>
      )}

      {dialog?.kind === 'create' && (
        <ProjectTextDialog
          title={t('projects.dialog.new.title', '新建项目')}
          description={t(
            'projects.dialog.new.description',
            '项目会保存到本机 Bridge，并使用独立的画布修订。',
          )}
          value={nameDraft}
          placeholder={t('projects.dialog.projectNamePlaceholder', '输入项目名称')}
          confirmLabel={t('projects.dialog.createAndOpen', '创建并打开')}
          busy={busyKey === 'create'}
          error={operationError}
          onChange={setNameDraft}
          onCancel={closeDialog}
          onConfirm={() => void create()}
        />
      )}
      {dialog?.kind === 'rename' && (
        <ProjectTextDialog
          title={t('projects.dialog.rename.title', '重命名项目')}
          value={nameDraft}
          placeholder={t('projects.dialog.projectNamePlaceholder', '输入项目名称')}
          confirmLabel={t('projects.dialog.save', '保存')}
          busy={busyKey === `rename:${dialog.project.id}`}
          error={operationError}
          onChange={setNameDraft}
          onCancel={closeDialog}
          onConfirm={() => void rename(dialog.project)}
        />
      )}
      {dialog?.kind === 'create-folder' && (
        <ProjectTextDialog
          title={t('projects.dialog.folder.title', '新建文件夹')}
          value={nameDraft}
          placeholder={t('projects.dialog.folderNamePlaceholder', '输入文件夹名称')}
          confirmLabel={t('projects.dialog.create', '创建')}
          busy={busyKey === 'create-folder'}
          error={operationError}
          onChange={setNameDraft}
          onCancel={closeDialog}
          onConfirm={() => void createFolder()}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ProjectConfirmDialog
          title={t('projects.dialog.deleteProject.title', '删除“{name}”？', {
            name: dialog.project.name,
          })}
          description={t(
            'projects.dialog.deleteProject.description',
            '项目将移入可恢复的主机归档，不会立即删除素材库原文件。',
          )}
          confirmLabel={t('projects.dialog.deleteProject.confirm', '删除项目')}
          busy={busyKey === `delete:${dialog.project.id}`}
          error={operationError}
          onCancel={closeDialog}
          onConfirm={() =>
            void runProjectOperation(
              `delete:${dialog.project.id}`,
              async () => {
                const deletingActiveProject = dialog.project.id === activeProjectId;
                if (deletingActiveProject && !(await flushCanvasPersistence())) {
                  throw new Error(
                    t('projects.error.activeSave', '当前项目尚未安全保存，已取消删除。'),
                  );
                }
                const catalog = await archiveProject(dialog.project.id, {
                  expectedRevision: dialog.project.revision,
                  expectedCatalogRevision: catalogRevision,
                });
                if (!deletingActiveProject) return;
                const fallback =
                  catalog.projects.find((project) => project.id === catalog.primaryProjectId) ??
                  catalog.projects[0];
                if (
                  !fallback ||
                  !(await openBridgeCanvasProject(fallback.id, { stayOnHome: true }))
                ) {
                  throw new Error(
                    t(
                      'projects.error.fallbackOpen',
                      '项目已删除，但默认项目读取失败；请刷新项目列表后重试。',
                    ),
                  );
                }
              },
              { closeDialog: true, refresh: true },
            )
          }
        />
      )}
      {dialog?.kind === 'delete-folder' && (
        <ProjectConfirmDialog
          title={t('projects.dialog.deleteFolder.title', '删除文件夹“{name}”？', {
            name: dialog.folder.name,
          })}
          description={t(
            'projects.dialog.deleteFolder.description',
            '文件夹中的项目不会被删除，而是移动到“未分类”。',
          )}
          confirmLabel={t('projects.dialog.deleteFolder.confirm', '删除文件夹')}
          busy={busyKey === `delete-folder:${dialog.folder.id}`}
          error={operationError}
          onCancel={closeDialog}
          onConfirm={() =>
            void runProjectOperation(
              `delete-folder:${dialog.folder.id}`,
              () =>
                deleteProjectFolder(dialog.folder.id, {
                  expectedCatalogRevision: catalogRevision,
                }),
              { closeDialog: true, refresh: true },
            )
          }
        />
      )}
    </section>
  );
}
