import {
  MAX_CANVAS_MATERIAL_BYTES,
  MAX_CANVAS_MATERIAL_ENTRIES,
  type MaterialKind,
} from '../serialization/materialBundle';
import { parseWorkflowFileString } from '../serialization/workflow';

export type SmartImportLibraryKind = 'style' | 'effect' | 'character' | 'prompt';

interface SmartImportBaseDetection {
  itemCount: number;
}

export type SmartImportDetection =
  | (SmartImportBaseDetection & {
      kind: 'canvas-workflow';
      edgeCount: number;
      workflowVersion: 1 | 2;
    })
  | (SmartImportBaseDetection & {
      kind: 'canvas-material-bundle';
      materialCounts: Record<MaterialKind, number>;
    })
  | (SmartImportBaseDetection & {
      kind: 'library-package';
      libraryKind: SmartImportLibraryKind;
      packageVersion: 1 | 2;
    })
  | (SmartImportBaseDetection & {
      kind: 'canvas-material-files';
      materialCounts: Record<MaterialKind, number>;
    });

const MAX_SMART_JSON_BYTES = 512 * 1024 * 1024;
const MAX_SMART_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_SMART_ARCHIVE_ENTRIES = 20_000;
const MAX_SMART_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_LIBRARY_ITEMS = 2_000;
const LIBRARY_KINDS = new Set<SmartImportLibraryKind>(['style', 'effect', 'character', 'prompt']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emptyMaterialCounts(): Record<MaterialKind, number> {
  return { image: 0, video: 0, text: 0 };
}

export function materialKindForSmartImport(file: File): MaterialKind | null {
  if (file.type.startsWith('image/') || /\.(?:png|jpe?g|webp|gif|svg)$/iu.test(file.name)) {
    return 'image';
  }
  if (file.type.startsWith('video/') || /\.(?:mp4|webm|mov|m4v)$/iu.test(file.name)) {
    return 'video';
  }
  if (file.type.startsWith('text/') || /\.(?:txt|md|csv|srt|vtt)$/iu.test(file.name)) {
    return 'text';
  }
  return null;
}

function inspectMaterialManifest(root: Record<string, unknown>): SmartImportDetection {
  if (root.version !== 1 || !Array.isArray(root.entries)) {
    throw new Error('节点素材包清单版本或内容无效。');
  }
  if (root.entries.length > MAX_CANVAS_MATERIAL_ENTRIES) {
    throw new Error(`素材数量不能超过 ${MAX_CANVAS_MATERIAL_ENTRIES}。`);
  }
  const materialCounts = emptyMaterialCounts();
  root.entries.forEach((entry, index) => {
    if (!isRecord(entry)) throw new Error(`素材清单第 ${index + 1} 项无效。`);
    const kind = entry.kind;
    if (kind !== 'image' && kind !== 'video' && kind !== 'text') {
      throw new Error(`素材清单第 ${index + 1} 项类型无效。`);
    }
    materialCounts[kind] += 1;
  });
  return {
    kind: 'canvas-material-bundle',
    itemCount: root.entries.length,
    materialCounts,
  };
}

function inspectLibraryManifest(
  root: Record<string, unknown>,
  source: 'json' | 'zip',
): SmartImportDetection {
  const libraryKind = root.library;
  if (
    (root.version !== 1 && root.version !== 2) ||
    typeof libraryKind !== 'string' ||
    !LIBRARY_KINDS.has(libraryKind as SmartImportLibraryKind) ||
    !Array.isArray(root.items)
  ) {
    throw new Error('资料库包的版本、资料库类型或资料清单无效。');
  }
  if (root.items.length > MAX_LIBRARY_ITEMS) {
    throw new Error(`资料库单次最多处理 ${MAX_LIBRARY_ITEMS} 条资料，请分批导入。`);
  }
  if (
    root.items.some((item) => !isRecord(item) || typeof item.id !== 'string' || !item.id.trim())
  ) {
    throw new Error('资料库包内存在缺少有效 ID 的资料。');
  }
  if (source === 'zip' && (root.version !== 2 || root.mediaLayout !== 'zip-v1')) {
    throw new Error('资料库 ZIP 版本不受支持。');
  }
  return {
    kind: 'library-package',
    itemCount: root.items.length,
    libraryKind: libraryKind as SmartImportLibraryKind,
    packageVersion: root.version,
  };
}

function parseJsonRecord(source: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${label}不是有效的 JSON。`);
  }
  if (!isRecord(parsed)) throw new Error(`${label}根内容必须是对象。`);
  return parsed;
}

function looksLikeComfyWorkflow(root: Record<string, unknown>) {
  if (Array.isArray(root.nodes) && Array.isArray(root.links)) return true;
  return Object.values(root).some((value) => {
    const node = isRecord(value) ? value : undefined;
    return typeof node?.class_type === 'string' && isRecord(node.inputs);
  });
}

async function inspectJsonFile(file: File): Promise<SmartImportDetection> {
  if (file.size <= 0) throw new Error('文件内容为空。');
  if (file.size > MAX_SMART_JSON_BYTES) {
    throw new Error('JSON 文件超过 512 MB；大型资料库请使用便携 ZIP。');
  }
  const source = await file.text();
  const root = parseJsonRecord(source, '所选文件');
  if (root.format === 'qiansi-library') return inspectLibraryManifest(root, 'json');
  if (root.format === 'qiansi-canvas-material-bundle') {
    throw new Error('节点素材包必须是 Qiansi-Canvas 导出的 ZIP，不能使用单独 JSON。');
  }
  if (root.kind === 'qiansi-canvas-theme' && root.schemaVersion === 1) {
    throw new Error('检测到画布主题清单；请使用完整主题 ZIP，并前往“设置 → 外观”导入。');
  }

  try {
    const workflow = parseWorkflowFileString(source);
    return {
      kind: 'canvas-workflow',
      itemCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      workflowVersion: workflow.version,
    };
  } catch (error) {
    if (
      looksLikeComfyWorkflow(root) ||
      root.format === 'qiansi-canvas-workflow' ||
      (Array.isArray(root.nodes) && Array.isArray(root.edges))
    ) {
      throw error;
    }
    if (typeof root.schemaVersion === 'number' && isRecord(root.contributes)) {
      throw new Error('检测到插件清单；请前往“设置 → 插件”导入。');
    }
    throw new Error('无法识别此 JSON；它不是画布文件或四类资料库包。');
  }
}

interface ZipMarkers {
  manifest?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  plugin?: Record<string, unknown>;
  hasSkill: boolean;
}

function isSafeZipPath(path: string) {
  return (
    Boolean(path) &&
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !path.split('/').includes('..')
  );
}

function isActiveSkillPath(path: string) {
  if (!/(?:^|\/)SKILL\.md$/u.test(path)) return false;
  return !path.split('/').some((segment) => /^(?:archive|archived)$/iu.test(segment));
}

async function readZipMarkers(file: File): Promise<ZipMarkers> {
  if (file.size <= 0 || file.size > MAX_SMART_ARCHIVE_BYTES) {
    throw new Error('ZIP 文件大小超出允许范围。');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { strFromU8, unzip } = await import('fflate');
  let entryCount = 0;
  let hasSkill = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(
        bytes,
        {
          filter: (entry) => {
            entryCount += 1;
            if (entryCount > MAX_SMART_ARCHIVE_ENTRIES) {
              throw new Error('ZIP 文件条目过多，无法安全识别。');
            }
            if (!isSafeZipPath(entry.name)) throw new Error('ZIP 包含不安全路径。');
            if (isActiveSkillPath(entry.name)) hasSkill = true;
            if (!['manifest.json', 'theme.json', 'plugin.json'].includes(entry.name)) return false;
            if (entry.originalSize > MAX_SMART_MANIFEST_BYTES) {
              throw new Error('ZIP 识别清单超过 4 MB，无法安全识别。');
            }
            return true;
          },
        },
        (error, data) => {
          if (error) reject(error);
          else resolve(data);
        },
      );
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'ZIP 文件无法读取。');
  }
  const parseMarker = (name: 'manifest.json' | 'theme.json' | 'plugin.json') => {
    const bytes = entries[name];
    return bytes ? parseJsonRecord(strFromU8(bytes), `ZIP 中的 ${name}`) : undefined;
  };
  return {
    manifest: parseMarker('manifest.json'),
    theme: parseMarker('theme.json'),
    plugin: parseMarker('plugin.json'),
    hasSkill,
  };
}

async function inspectZipFile(file: File): Promise<SmartImportDetection> {
  const markers = await readZipMarkers(file);
  const manifestKind =
    markers.manifest?.format === 'qiansi-canvas-material-bundle'
      ? '节点素材包'
      : markers.manifest?.format === 'qiansi-library'
        ? '资料库包'
        : undefined;
  const themeKind =
    markers.theme?.kind === 'qiansi-canvas-theme' && markers.theme.schemaVersion === 1
      ? '画布主题包'
      : undefined;
  const pluginKind =
    (markers.plugin?.schemaVersion === 1 || markers.plugin?.schemaVersion === 2) &&
    typeof markers.plugin.id === 'string' &&
    typeof markers.plugin.name === 'string'
      ? '插件包'
      : undefined;
  const candidates = [
    manifestKind,
    themeKind,
    pluginKind,
    markers.hasSkill ? '本地 Skill 包' : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  if (candidates.length > 1) {
    throw new Error(`ZIP 同时包含多个包标记（${candidates.join('、')}），已拒绝自动导入。`);
  }
  if (markers.manifest?.format === 'qiansi-canvas-material-bundle') {
    return inspectMaterialManifest(markers.manifest);
  }
  if (markers.manifest?.format === 'qiansi-library') {
    return inspectLibraryManifest(markers.manifest, 'zip');
  }
  if (themeKind) throw new Error('检测到画布主题包；请前往“设置 → 外观”导入。');
  if (pluginKind) {
    throw new Error('检测到插件包；请解压后前往“设置 → 插件”选择完整插件文件。');
  }
  if (markers.hasSkill) throw new Error('检测到本地 Skill 包；请前往“AI SKILL → 导入本地 Skill”。');
  throw new Error('无法识别此 ZIP；它不是节点素材包或四类资料库包。');
}

async function hasZipSignature(file: File) {
  if (file.size < 4) return false;
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return signature[0] === 0x50 && signature[1] === 0x4b;
}

function inspectMaterialFiles(files: readonly File[]): SmartImportDetection {
  if (files.length > MAX_CANVAS_MATERIAL_ENTRIES) {
    throw new Error(`一次最多导入 ${MAX_CANVAS_MATERIAL_ENTRIES} 个素材，请分批导入。`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_CANVAS_MATERIAL_BYTES) throw new Error('素材总大小不能超过 512 MB。');
  const materialCounts = emptyMaterialCounts();
  for (const file of files) {
    const kind = materialKindForSmartImport(file);
    if (!kind) throw new Error(`无法识别“${file.name}”的文件类型。`);
    materialCounts[kind] += 1;
  }
  return {
    kind: 'canvas-material-files',
    itemCount: files.length,
    materialCounts,
  };
}

/** Inspect user-selected files without writing canvas, library or Bridge state. */
export async function detectSmartImport(files: readonly File[]): Promise<SmartImportDetection> {
  if (files.length === 0) throw new Error('没有选择需要导入的文件。');
  if (files.length > 1) return inspectMaterialFiles(files);

  const file = files[0];
  if (!file) throw new Error('没有选择需要导入的文件。');
  const zipSignature = await hasZipSignature(file);
  const zipName = /\.zip$/iu.test(file.name) || file.type === 'application/zip';
  if (zipSignature) return inspectZipFile(file);
  if (zipName) throw new Error('所选 ZIP 的文件头无效，文件可能已损坏。');

  const jsonName = /(?:\.json|\.qiansi-library\.json)$/iu.test(file.name);
  if (jsonName || file.type === 'application/json') return inspectJsonFile(file);
  if (/^SKILL\.md$/iu.test(file.name)) {
    throw new Error('检测到本地 SKILL.md；请前往“AI SKILL → 导入本地 Skill”。');
  }
  return inspectMaterialFiles(files);
}
