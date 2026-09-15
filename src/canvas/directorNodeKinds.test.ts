import { describe, expect, it } from 'vitest';
import { KIND_DEFAULTS } from './placeholders';
import { getNodeSpec } from '../graph/nodeSpecs';
import {
  isDirectorNodeKind,
  migrateLegacyDirectorNode,
  resolveDirectorNodeKind,
  type FlowNode,
} from './nodeTypes';

describe('independent director node contracts', () => {
  it('uses distinct names and port registries for 2D and 3D directors', () => {
    expect(KIND_DEFAULTS['director-2d'].title).toBe('2D导演台');
    expect(KIND_DEFAULTS['director-3d'].title).toBe('3D导演台');
    expect(getNodeSpec('director-2d').kind).toBe('director-2d');
    expect(getNodeSpec('director-3d').kind).toBe('director-3d');
    expect(getNodeSpec('director-2d')).not.toBe(getNodeSpec('director-3d'));
  });

  it('recognizes current and legacy director kinds without mixing explicit variants', () => {
    expect(isDirectorNodeKind('director-2d')).toBe(true);
    expect(isDirectorNodeKind('director-3d')).toBe(true);
    expect(resolveDirectorNodeKind('director-2d', '3d')).toBe('director-2d');
    expect(resolveDirectorNodeKind('director-3d', '2d')).toBe('director-3d');
    expect(resolveDirectorNodeKind('director', '2d')).toBe('director-2d');
    expect(resolveDirectorNodeKind('director', '3d')).toBe('director-3d');
  });

  it('upgrades a legacy canvas node while preserving its scene data', () => {
    const legacy = {
      id: 'old-director',
      type: 'director',
      position: { x: 12, y: 34 },
      data: {
        kind: 'director',
        title: '导演台',
        description: '旧节点',
        directorMode: '3d',
        directorScene: { schemaVersion: 7, subjects: [{ id: 'actor-1' }] },
      },
    } as unknown as FlowNode;

    const migrated = migrateLegacyDirectorNode(legacy);

    expect(migrated).toMatchObject({
      type: 'director-3d',
      position: { x: 12, y: 34 },
      data: {
        kind: 'director-3d',
        title: '3D导演台',
        directorMode: '3d',
        directorScene: { subjects: [{ id: 'actor-1' }] },
      },
    });
  });
});
