type Editor = HTMLDivElement | HTMLTextAreaElement;

/** Keep the editing position across OS/tab focus changes, without focusing the
 * editor or overriding a deliberate click into another control. DOM endpoints
 * (not live Ranges) ensure a replaced document cannot silently restore at zero.
 */
export function bindEditorWindowSelection(editor: Editor): () => void {
  const doc = editor.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};
  let suspended = false;
  let restoreSelection: (() => void) | undefined;
  const capture = () => {
    if (suspended || doc.activeElement !== editor) return;
    const { scrollTop, scrollLeft } = editor;
    if ('selectionStart' in editor) {
      const { selectionStart, selectionEnd, selectionDirection, value } = editor;
      restoreSelection = () => {
        if (editor.value !== value) return;
        editor.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
        editor.scrollTop = scrollTop;
        editor.scrollLeft = scrollLeft;
      };
    } else {
      const selection = win.getSelection();
      if (
        !selection?.anchorNode ||
        !selection.focusNode ||
        !editor.contains(selection.anchorNode) ||
        !editor.contains(selection.focusNode)
      )
        return;
      const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
      const content = editor.textContent;
      restoreSelection = () => {
        if (
          editor.textContent !== content ||
          !editor.contains(anchorNode) ||
          !editor.contains(focusNode)
        )
          return;
        selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
        editor.scrollTop = scrollTop;
        editor.scrollLeft = scrollLeft;
      };
    }
  };
  const suspend = () => {
    capture();
    suspended = doc.activeElement === editor;
  };
  const resume = () => {
    if (!suspended) return;
    suspended = false;
    if (editor.isConnected && doc.activeElement === editor) restoreSelection?.();
  };
  const visibility = () => {
    if (doc.visibilityState === 'hidden') suspend();
    else resume();
  };
  doc.addEventListener('selectionchange', capture);
  editor.addEventListener('input', capture);
  editor.addEventListener('scroll', capture);
  win.addEventListener('blur', suspend);
  win.addEventListener('focus', resume);
  doc.addEventListener('visibilitychange', visibility);
  return () => {
    doc.removeEventListener('selectionchange', capture);
    editor.removeEventListener('input', capture);
    editor.removeEventListener('scroll', capture);
    win.removeEventListener('blur', suspend);
    win.removeEventListener('focus', resume);
    doc.removeEventListener('visibilitychange', visibility);
  };
}
