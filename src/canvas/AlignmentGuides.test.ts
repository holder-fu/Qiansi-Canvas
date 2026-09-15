import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./AlignmentGuides.tsx', import.meta.url)),
  'utf8',
);

describe('alignment guide visibility contract', () => {
  it('uses the brighter dashed guide color for both axes', () => {
    expect(source.match(/border-white\/40/g)).toHaveLength(2);
    expect(source).not.toContain('border-white/20');
  });
});
