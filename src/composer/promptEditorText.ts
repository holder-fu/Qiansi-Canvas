const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const LINE_CONTAINER_TAGS = new Set(['DIV', 'P', 'LI']);
const REFERENCE_TOKEN_SOURCE = '@(?:图片|视频|音频)\\d+';

type PromptEditorDomNode = {
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<PromptEditorDomNode>;
  tagName?: string;
  dataset?: { referenceToken?: string };
};

/**
 * Read a rich contenteditable prompt without letting browser layout rules insert
 * line breaks around non-editable inline mention chips.
 */
export function promptTextFromEditorDom(root: PromptEditorDomNode): string {
  let text = '';
  const appendLineBreak = () => {
    if (!text.endsWith('\n')) text += '\n';
  };

  const appendChildren = (parent: PromptEditorDomNode) => {
    const children = Array.from(parent.childNodes);
    children.forEach((child, index) => {
      if (child.nodeType === TEXT_NODE) {
        text += child.textContent ?? '';
        return;
      }
      if (child.nodeType !== ELEMENT_NODE) return;

      const referenceToken = child.dataset?.referenceToken;
      if (referenceToken) {
        text += referenceToken;
        return;
      }

      const tagName = child.tagName?.toUpperCase() ?? '';
      if (tagName === 'BR') {
        text += '\n';
        return;
      }

      const isLineContainer = LINE_CONTAINER_TAGS.has(tagName);
      if (isLineContainer && text && !text.endsWith('\n')) appendLineBreak();
      appendChildren(child);
      if (isLineContainer && index < children.length - 1) appendLineBreak();
    });
  };

  appendChildren(root);
  return text.replace(/\r\n/g, '\n');
}

/** Collapse line breaks previously injected immediately around mention chips. */
export function normalizeLegacyReferenceMentionSpacing(prompt: string): string {
  return prompt
    .replace(
      new RegExp(`([^\\n])[\\t ]*\\n+[\\t ]*(?=(${REFERENCE_TOKEN_SOURCE})(?:[\\t \\n]|$))`, 'g'),
      '$1 ',
    )
    .replace(new RegExp(`(${REFERENCE_TOKEN_SOURCE})[\\t ]*\\n+[\\t ]*(?=[^\\n])`, 'g'), '$1 ');
}
