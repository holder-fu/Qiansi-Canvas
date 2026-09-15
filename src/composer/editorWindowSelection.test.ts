import { describe, expect, it, vi } from 'vitest';
import { bindEditorWindowSelection } from './editorWindowSelection';

function fixture() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    defaultView: win,
    activeElement: null as unknown,
    visibilityState: 'visible',
  });
  const editor = Object.assign(new EventTarget(), {
    ownerDocument: doc,
    isConnected: true,
    value: '第一行\n第二行继续输入',
    selectionStart: 6,
    selectionEnd: 10,
    selectionDirection: 'backward',
    scrollTop: 80,
    scrollLeft: 0,
    setSelectionRange: vi.fn(),
  });
  doc.activeElement = editor;
  const dispose = bindEditorWindowSelection(editor as unknown as HTMLTextAreaElement);
  return { win, doc, editor, dispose };
}

describe('editor window selection', () => {
  it('restores the full selection, direction and scroll after leaving the window', () => {
    const { win, editor, dispose } = fixture();
    win.dispatchEvent(new Event('blur'));
    editor.selectionStart = editor.selectionEnd = 0;
    editor.scrollTop = 0;
    win.dispatchEvent(new Event('focus'));
    expect(editor.setSelectionRange).toHaveBeenCalledWith(6, 10, 'backward');
    expect(editor.scrollTop).toBe(80);
    dispose();
  });

  it('does not overwrite the bookmark with background selection/visibility events', () => {
    const { win, doc, editor, dispose } = fixture();
    win.dispatchEvent(new Event('blur'));
    editor.selectionStart = editor.selectionEnd = 0;
    doc.dispatchEvent(new Event('selectionchange'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('focus'));
    expect(editor.setSelectionRange).toHaveBeenCalledExactlyOnceWith(6, 10, 'backward');
    dispose();
  });

  it('does not steal focus or selection from another control', () => {
    const { win, doc, editor, dispose } = fixture();
    win.dispatchEvent(new Event('blur'));
    doc.activeElement = new EventTarget();
    win.dispatchEvent(new Event('focus'));
    expect(editor.setSelectionRange).not.toHaveBeenCalled();
    dispose();
  });

  it('does not restore a stale selection after a real content change or disposal', () => {
    const { win, editor, dispose } = fixture();
    win.dispatchEvent(new Event('blur'));
    editor.value = 'remote update';
    win.dispatchEvent(new Event('focus'));
    expect(editor.setSelectionRange).not.toHaveBeenCalled();
    dispose();
    win.dispatchEvent(new Event('blur'));
    win.dispatchEvent(new Event('focus'));
    expect(editor.setSelectionRange).not.toHaveBeenCalled();
  });

  it('keeps contenteditable DOM endpoints instead of a Range that collapses on replacement', () => {
    const win = Object.assign(new EventTarget(), { getSelection: () => selection });
    const anchor = {};
    const focus = {};
    const selection = {
      anchorNode: anchor,
      anchorOffset: 4,
      focusNode: focus,
      focusOffset: 8,
      setBaseAndExtent: vi.fn(),
    };
    const doc = Object.assign(new EventTarget(), {
      defaultView: win,
      activeElement: null as unknown,
    });
    const editor = Object.assign(new EventTarget(), {
      ownerDocument: doc,
      isConnected: true,
      scrollTop: 72,
      scrollLeft: 0,
      contains: vi.fn(() => true),
    });
    doc.activeElement = editor;
    const dispose = bindEditorWindowSelection(editor as unknown as HTMLDivElement);
    win.dispatchEvent(new Event('blur'));
    selection.anchorOffset = selection.focusOffset = 0;
    win.dispatchEvent(new Event('focus'));
    expect(selection.setBaseAndExtent).toHaveBeenCalledWith(anchor, 4, focus, 8);
    selection.setBaseAndExtent.mockClear();
    win.dispatchEvent(new Event('blur'));
    editor.contains.mockReturnValue(false);
    win.dispatchEvent(new Event('focus'));
    expect(selection.setBaseAndExtent).not.toHaveBeenCalled();
    dispose();
  });
});
