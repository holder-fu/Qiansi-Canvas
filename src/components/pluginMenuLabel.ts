export function pluginCanvasMenuDisplayLabel(label: string): string {
  return label.replace(/^(?:添加|打开)\s+/u, '').replace(/^(?:Add|Open)\s+/i, '');
}
