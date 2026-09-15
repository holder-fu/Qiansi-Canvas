import { describe, expect, it } from 'vitest';
import source from './TextNode.tsx?raw';

describe('text node character count layout', () => {
  it('keeps the read-only counter outside the scrollable text region', () => {
    const readOnlyBranch = source.slice(
      source.indexOf(') : content ? ('),
      source.indexOf(') : hasPendingTask ? ('),
    );
    const scrollRegionEnd = readOnlyBranch.indexOf(
      '</div>',
      readOnlyBranch.indexOf('data-text-node-scroll-region'),
    );
    const counterStart = readOnlyBranch.indexOf('data-text-node-character-count');

    expect(readOnlyBranch).toContain('className="relative h-full w-full"');
    expect(readOnlyBranch).toContain('data-text-node-scroll-region="true"');
    expect(readOnlyBranch).toContain('overflow-y-auto px-6 pb-12 pt-7');
    expect(scrollRegionEnd).toBeGreaterThan(-1);
    expect(counterStart).toBeGreaterThan(scrollRegionEnd);
  });

  it('anchors both editing and read-only counters to the lower right', () => {
    expect(source.match(/data-text-node-character-count="true"/g)).toHaveLength(2);
    expect(
      source.match(/pointer-events-none absolute bottom-3 right-4 text-\[10px\]/g),
    ).toHaveLength(2);
  });
});
