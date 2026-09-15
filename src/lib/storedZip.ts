export interface StoredZipEntry {
  name: string;
  bytes: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function assertSafeEntryName(name: string) {
  if (!name || name.includes('..') || name.includes('\\') || name.startsWith('/')) {
    throw new Error('ZIP 包含不安全路径。');
  }
}

export function createStoredZip(entries: StoredZipEntry[]): Blob {
  if (!entries.length) throw new Error('ZIP 至少需要一个文件。');
  if (entries.length > 2000) throw new Error('ZIP 文件数量不能超过 2000。');
  const seen = new Set<string>();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    assertSafeEntryName(entry.name);
    if (seen.has(entry.name)) throw new Error(`ZIP 文件名重复：${entry.name}`);
    seen.add(entry.name);
    const name = encoder.encode(entry.name);
    if (name.length > 0xffff) throw new Error('ZIP 文件名过长。');
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write32(localView, 14, checksum);
    write32(localView, 18, entry.bytes.length);
    write32(localView, 22, entry.bytes.length);
    write16(localView, 26, name.length);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write32(centralView, 16, checksum);
    write32(centralView, 20, entry.bytes.length);
    write32(centralView, 24, entry.bytes.length);
    write16(centralView, 28, name.length);
    write32(centralView, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  const parts = [...localParts, ...centralParts, end];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let outputOffset = 0;
  for (const part of parts) {
    output.set(part, outputOffset);
    outputOffset += part.length;
  }
  return new Blob([output.buffer], { type: 'application/zip' });
}

export async function parseStoredZip(
  file: Blob,
  options: { maxBytes?: number; maxEntries?: number } = {},
): Promise<Map<string, Uint8Array>> {
  const maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 1000;
  if (file.size <= 0 || file.size > maxBytes) throw new Error('ZIP 文件大小超出允许范围。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();

  for (let offset = 0; offset + 30 <= bytes.length;) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    if (entries.size >= maxEntries) throw new Error(`ZIP 文件数量不能超过 ${maxEntries}。`);
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (flags & 0x0008) throw new Error('ZIP 使用了不受支持的数据描述符。');
    if (method !== 0) throw new Error('该压缩方式暂不支持，请导入 Qiansi-Canvas 导出的素材包。');
    if (compressedSize !== uncompressedSize || uncompressedSize > maxBytes) {
      throw new Error('ZIP 文件长度不正确。');
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error('ZIP 结构损坏。');
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    assertSafeEntryName(name);
    if (entries.has(name)) throw new Error(`ZIP 文件名重复：${name}`);
    const content = bytes.slice(dataStart, dataEnd);
    if (crc32(content) !== view.getUint32(offset + 14, true)) {
      throw new Error(`ZIP 文件校验失败：${name}`);
    }
    entries.set(name, content);
    offset = dataEnd;
  }

  if (!entries.size) throw new Error('ZIP 中没有可读取的文件。');
  return entries;
}
