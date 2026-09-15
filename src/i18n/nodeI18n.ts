import { KIND_DEFAULTS } from '../canvas/placeholders';
import { NODE_KIND_META, type NodeKind } from '../canvas/nodeTypes';
import { getPortLabelKey } from '../graph/nodeSpecs';
import type { PortDef } from '../graph/types';

export type NodeTranslator = (
  key: string,
  fallback?: string,
  params?: Record<string, string | number>,
) => string;

const LEGACY_DEFAULT_TITLES: Partial<Record<NodeKind, readonly string[]>> = {
  image: ['图片节点'],
  views: ['三视图节点'],
  video: ['未命名视频'],
  director: ['导演台'],
  'director-2d': ['导演台', '2D导演台'],
  'director-3d': ['导演台', '3D导演台'],
  text: ['文本节点'],
  plugin: ['插件节点'],
};

/** Translate the built-in type label without changing the stable NodeKind id. */
export function getNodeKindDisplayLabel(kind: NodeKind, t: NodeTranslator): string {
  const meta = NODE_KIND_META[kind];
  return t(meta.labelKey, meta.label);
}

/** Translate the built-in type description without changing persisted node data. */
export function getNodeKindDisplayDescription(kind: NodeKind, t: NodeTranslator): string {
  const meta = NODE_KIND_META[kind];
  return t(meta.descriptionKey, meta.description);
}

/**
 * Translate only a known built-in default title. User-entered titles are returned byte-for-byte.
 * This is intentionally a render-layer helper: callers must never write its result to node.data.
 */
export function getNodeDisplayTitle(
  kind: NodeKind,
  storedTitle: string | null | undefined,
  t: NodeTranslator,
): string {
  const defaultTitle = KIND_DEFAULTS[kind].title;
  const isBuiltInDefault =
    !storedTitle ||
    storedTitle === defaultTitle ||
    (LEGACY_DEFAULT_TITLES[kind]?.includes(storedTitle) ?? false);
  if (!isBuiltInDefault) return storedTitle ?? defaultTitle;
  return t(`node.kind.${kind}.defaultTitle`, defaultTitle);
}

/** Translate only labels declared by the built-in port registry. */
export function getPortDisplayLabel(port: PortDef, t: NodeTranslator): string {
  const key = getPortLabelKey(port);
  return key ? t(key, port.label) : port.label;
}

export function getPortAriaLabel(
  port: PortDef,
  direction: 'target' | 'source',
  t: NodeTranslator,
): string {
  return t('node.port.aria', '{direction}端口：{label}', {
    direction: t(
      direction === 'target' ? 'node.port.direction.input' : 'node.port.direction.output',
      direction === 'target' ? '输入' : '输出',
    ),
    label: getPortDisplayLabel(port, t),
  });
}
