import { describe, expect, it } from 'vitest';
import source from './ImageNodeActionBar.tsx?raw';

describe('ImageNodeActionBar compact layout', () => {
  it('matches the compact video-toolbar surface and primary action rhythm', () => {
    expect(source).toContain(
      "const INITIAL_PRIMARY: ActionToolId[] = ['preview', 'crop', 'label', 'download']",
    );
    expect(source).toContain('const INITIAL_QUICK_PRIMARY: QuickMenuId[] = []');
    expect(source).toContain("const LABELED_PRIMARY_TOOLS = new Set<ActionToolId>(['crop'])");
    expect(source).toContain('const primaryBeforeMore =');
    expect(source).toContain('data-action-bar-drop-zone="primary"');
    expect(source).toContain('flex h-11 items-center gap-1 rounded-xl');
    expect(source).toContain("showLabel ? 'px-2.5 text-[12px]' : 'w-8'");
    expect(source).toContain("{primaryBeforeMore.map((id) => renderTool(id, 'primary'))}");
    expect(source).toContain("{primaryAfterMore.map((id) => renderTool(id, 'primary'))}");
  });

  it('prevents overflow quick-menu controls and icons from being deformed by flex compression', () => {
    expect(source).toContain('<div key={menu.id} className="relative shrink-0">');
    expect(source).toContain('h-8 shrink-0 cursor-grab');
    expect(source).toContain('gap-1.5 whitespace-nowrap rounded-lg px-2.5');
    expect(source).toContain('w-max max-w-[calc(100vw-24px)]');
    expect(source).toContain('flex-wrap items-center justify-center');
    expect(source).toContain('<MenuIcon className="h-3.5 w-3.5 shrink-0" />');
    expect(source).toContain('h-3 w-3 shrink-0 transition-transform');
    expect(source).toContain('<span className="whitespace-nowrap">{menuLabel}</span>');
  });

  it('keeps dropdown action icons and labels on a stable single line', () => {
    expect(source).toContain('h-3.5 w-3.5 shrink-0 text-white/55');
    expect(source).toContain('<span className="whitespace-nowrap">{actionLabel}</span>');
  });
});
