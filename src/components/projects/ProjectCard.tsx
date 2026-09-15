import { useState } from 'react';
import { ImageIcon, LoaderCircle } from 'lucide-react';
import type { ProjectFolder, ProjectSummary } from '../../services/projectHub';
import { mediaPreviewUrl } from '../../lib/mediaPreview';
import { formatProjectDate } from './projectPresentation';
import { ProjectCardMenu } from './ProjectCardMenu';
import { useAppTranslation } from '../../i18n/appI18n';

interface ProjectCardProps {
  project: ProjectSummary;
  folders: readonly ProjectFolder[];
  canDelete: boolean;
  menuOpen: boolean;
  busy?: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpen: () => void;
  onRename: () => void;
  onChangeCover: () => void;
  onDuplicate: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDelete: () => void;
}

export function ProjectCard({
  project,
  folders,
  canDelete,
  menuOpen,
  busy = false,
  onMenuOpenChange,
  onOpen,
  onRename,
  onChangeCover,
  onDuplicate,
  onMoveToFolder,
  onDelete,
}: ProjectCardProps) {
  const { t } = useAppTranslation();
  const coverSource = project.coverUrl || project.autoCoverUrl;
  const coverUrl = coverSource ? mediaPreviewUrl(coverSource, 'image') : '';
  const [failedCoverUrl, setFailedCoverUrl] = useState('');

  return (
    <article
      data-theme-role="project-card"
      className="group min-w-0 rounded-xl outline-none transition"
      aria-busy={busy}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="relative block aspect-video w-full overflow-hidden rounded-xl border border-white/[0.075] bg-[#202023] text-left outline-none transition hover:border-white/[0.16] focus:border-emerald-400/45 focus:ring-2 focus:ring-emerald-400/10 disabled:cursor-wait"
        aria-label={t('projects.card.openLabel', '打开项目“{name}”', { name: project.name })}
      >
        {coverUrl && failedCoverUrl !== coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]"
            draggable={false}
            onError={() => setFailedCoverUrl(coverUrl)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-white/14">
            <ImageIcon className="h-11 w-11" />
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white/80">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </span>
        )}
      </button>

      <div className="mt-2 flex min-w-0 items-start gap-2 px-0.5">
        <button
          type="button"
          onClick={onOpen}
          disabled={busy}
          className="min-w-0 flex-1 text-left outline-none"
        >
          <span className="block truncate text-sm font-medium text-white/88 group-hover:text-white">
            {project.name}
          </span>
          <span className="mt-1 block text-xs text-white/36">
            {formatProjectDate(project.updatedAt || project.createdAt)}
          </span>
        </button>
        <ProjectCardMenu
          project={project}
          folders={folders}
          canDelete={canDelete}
          open={menuOpen}
          disabled={busy}
          onOpenChange={onMenuOpenChange}
          onOpenProject={onOpen}
          onRename={onRename}
          onChangeCover={onChangeCover}
          onDuplicate={onDuplicate}
          onMoveToFolder={onMoveToFolder}
          onDelete={onDelete}
        />
      </div>
    </article>
  );
}
