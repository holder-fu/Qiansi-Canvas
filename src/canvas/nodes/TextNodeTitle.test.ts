import { describe, expect, it } from 'vitest';
import source from './TextNode.tsx?raw';

describe('text node title editing', () => {
  it('keeps title editing out of the React Flow drag gesture', () => {
    expect(source).toContain('const [renamingTitle, setRenamingTitle] = useState(false)');
    expect(source).toContain('data-node-double-click="true"');
    expect(source).toContain('onClick={(event) => {');
    expect(source).toContain('beginTitleRename();');
    expect(source).toContain('className="nodrag nopan min-w-0 truncate');
    expect(source).toContain('className="nodrag nopan min-w-0 max-w-48 rounded border');
  });

  it('saves on blur or Enter and cancels with Escape', () => {
    expect(source).toContain('onBlur={commitTitleRename}');
    expect(source).toContain("if (event.key === 'Enter')");
    expect(source).toContain("else if (event.key === 'Escape')");
    expect(source).toContain('cancelTitleRenameRef.current = true');
    expect(source).toContain('updateNodeData(id, { title: nextTitle || undefined })');
  });
});
