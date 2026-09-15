import { describe, expect, it } from 'vitest';
import { NODE_SPECS } from '../graph/nodeSpecs';
import { ASSET_TYPES, isAssetType } from '../graph/types';
import { NODE_KIND_META } from './nodeTypes';
import { CANVAS_NODE_TYPES } from './nodeRendererRegistry';
import { WORKSPACES } from './workspaces';

describe('canvas node renderer registry', () => {
  it('registers exactly one stable renderer for every declared node kind', () => {
    const rendererKinds = Object.keys(CANVAS_NODE_TYPES).sort();
    const metaKinds = Object.keys(NODE_KIND_META).sort();
    const specKinds = Object.keys(NODE_SPECS).sort();

    expect(rendererKinds).toEqual(metaKinds);
    expect(rendererKinds).toEqual(specKinds);
    expect(Object.isFrozen(CANVAS_NODE_TYPES)).toBe(true);
    for (const renderer of Object.values(CANVAS_NODE_TYPES)) {
      expect(renderer).toBeTruthy();
    }
  });

  it('keeps legacy rh nodes renderable without exposing a new-node entry', () => {
    expect(CANVAS_NODE_TYPES.rh).toBeTruthy();
    expect(NODE_KIND_META.rh.label).toBe('RunningHub');
    for (const workspace of Object.values(WORKSPACES)) {
      expect(workspace.nodeKinds).not.toContain('rh');
    }
  });
});

describe('asset type registry', () => {
  it('provides one shared runtime guard for declared asset types', () => {
    for (const assetType of ASSET_TYPES) expect(isAssetType(assetType)).toBe(true);
    expect(isAssetType('speech')).toBe(false);
    expect(isAssetType(null)).toBe(false);
  });
});
