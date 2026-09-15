import { describe, expect, it } from 'vitest';
import source from '../vite.config.ts?raw';

describe('development server security defaults', () => {
  it('binds to loopback unless LAN access is explicitly requested', () => {
    expect(source).toContain("process.env.QIANSI_CANVAS_DEV_HOST || '127.0.0.1'");
    expect(source).not.toContain("host: '0.0.0.0'");
  });

  it('does not watch any Bridge-managed runtime data', () => {
    expect(source).toContain("ignored: ['**/data/**']");
    expect(source).not.toContain("'**/data/plugins/**/runtime/**'");
  });
});
