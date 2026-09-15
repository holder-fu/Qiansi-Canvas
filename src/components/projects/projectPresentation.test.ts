import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '../../services/projectHub';
import {
  filterProjectsByFolder,
  formatProjectDate,
  selectRecentlyUsedCanvases,
  sortProjectsByUpdatedAt,
} from './projectPresentation';

function project(id: string, name: string, updatedAt: number, folderId?: string): ProjectSummary {
  return { id, name, createdAt: updatedAt - 1, updatedAt, folderId };
}

describe('project hub presentation', () => {
  const projects = [
    project('alpha', '甲项目', 10, 'folder-a'),
    project('beta', '乙项目', 30),
    project('gamma', '丙项目', 20, 'folder-b'),
  ];

  it('orders cards by the latest update without mutating the catalog', () => {
    expect(sortProjectsByUpdatedAt(projects).map((item) => item.id)).toEqual([
      'beta',
      'gamma',
      'alpha',
    ]);
    expect(projects.map((item) => item.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('supports all, unfiled and exact-folder filters', () => {
    expect(filterProjectsByFolder(projects, 'all')).toHaveLength(3);
    expect(filterProjectsByFolder(projects, 'unfiled').map((item) => item.id)).toEqual(['beta']);
    expect(filterProjectsByFolder(projects, 'folder-b').map((item) => item.id)).toEqual(['gamma']);
  });

  it('renders stable local calendar dates and rejects invalid timestamps', () => {
    expect(formatProjectDate(new Date(2026, 7, 19).getTime())).toBe('2026-08-19');
    expect(formatProjectDate(Number.NaN)).toBe('—');
  });

  it('selects at most four recently used canvases without mutating the catalog', () => {
    const catalog = [
      { ...project('old', '旧项目', 100), createdAt: 10 },
      { ...project('newest', '最新项目', 70), createdAt: 50 },
      { ...project('middle', '中间项目', 80), createdAt: 30 },
      { ...project('newer', '较新项目', 90), createdAt: 40 },
      { ...project('older', '较旧项目', 60), createdAt: 20 },
    ];
    expect(selectRecentlyUsedCanvases(catalog).map((item) => item.id)).toEqual([
      'old',
      'newer',
      'middle',
      'newest',
    ]);
    expect(catalog.map((item) => item.id)).toEqual(['old', 'newest', 'middle', 'newer', 'older']);
  });
});
