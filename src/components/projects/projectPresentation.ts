import type { ProjectSummary } from '../../services/projectHub';

export type ProjectFolderFilter = 'all' | 'unfiled' | string;

export function sortProjectsByUpdatedAt(projects: readonly ProjectSummary[]) {
  return [...projects].sort((left, right) => {
    const updatedDifference = Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
    if (updatedDifference !== 0) return updatedDifference;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function selectRecentlyUsedCanvases(projects: readonly ProjectSummary[], limit = 4) {
  return sortProjectsByUpdatedAt(projects).slice(0, Math.max(0, limit));
}

export function filterProjectsByFolder(
  projects: readonly ProjectSummary[],
  folder: ProjectFolderFilter,
) {
  if (folder === 'all') return [...projects];
  if (folder === 'unfiled') return projects.filter((project) => !project.folderId);
  return projects.filter((project) => project.folderId === folder);
}

export function formatProjectDate(value: number) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
