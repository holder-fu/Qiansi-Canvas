import { extname } from 'node:path';

const FORMATS = Object.freeze({
  '.png': { kind: 'image', mime: 'image/png' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.gif': { kind: 'image', mime: 'image/gif' },
  '.avif': { kind: 'image', mime: 'image/avif' },
  '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.webm': { kind: 'video', mime: 'video/webm' },
  '.mov': { kind: 'video', mime: 'video/quicktime' },
  '.m4v': { kind: 'video', mime: 'video/x-m4v' },
  '.mkv': { kind: 'video', mime: 'video/x-matroska' },
});

const MIME_EXTENSIONS = new Map(
  Object.entries(FORMATS).flatMap(([extension, format]) => {
    const entries = [[format.mime, extension]];
    if (extension === '.jpg') entries.push(['image/jpg', extension]);
    if (extension === '.mkv') entries.push(['video/mkv', extension]);
    if (extension === '.m4v') entries.push(['video/m4v', extension]);
    return entries;
  }),
);

function ascii(bytes, start, length) {
  return Buffer.from(bytes.subarray(start, start + length)).toString('ascii').toLowerCase();
}

function magicExtension(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) return '';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return '.png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  if (ascii(bytes, 0, 6) === 'gif87a' || ascii(bytes, 0, 6) === 'gif89a') return '.gif';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'riff' && ascii(bytes, 8, 4) === 'webp') {
    return '.webp';
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') return '.avif';
    if (brand === 'qt  ') return '.mov';
    if (brand === 'm4v ' || brand === 'm4vh' || brand === 'm4vp') return '.m4v';
    return '.mp4';
  }
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    const header = ascii(bytes, 0, Math.min(bytes.length, 4096));
    return header.includes('webm') ? '.webm' : '.mkv';
  }
  return '';
}

function format(extension) {
  return FORMATS[extension] ? { extension, ...FORMATS[extension] } : null;
}

/** File header wins, then response MIME, then the descriptor filename. */
export function detectComfyMediaFormat(kind, input = {}) {
  if (kind !== 'image' && kind !== 'video') throw new Error('ComfyUI 媒体类型无效。');
  const headerFormat = format(magicExtension(input.bytes));
  if (headerFormat) {
    if (headerFormat.kind !== kind) throw new Error(`ComfyUI 返回的文件头不是${kind === 'image' ? '图片' : '视频'}。`);
    return headerFormat;
  }
  const mime = String(input.mime || '').split(';')[0].trim().toLowerCase();
  const mimeFormat = format(MIME_EXTENSIONS.get(mime) || '');
  if (mimeFormat) {
    if (mimeFormat.kind !== kind) throw new Error(`ComfyUI 返回了非${kind === 'image' ? '图片' : '视频'}内容（${mime}）。`);
    return mimeFormat;
  }
  if (mime && mime !== 'application/octet-stream') {
    if ((kind === 'image' && !mime.startsWith('image/')) || (kind === 'video' && !mime.startsWith('video/'))) {
      throw new Error(`ComfyUI 返回了非${kind === 'image' ? '图片' : '视频'}内容（${mime}）。`);
    }
  }
  const filenameFormat = format(extname(String(input.filename || '')).toLowerCase());
  if (filenameFormat?.kind === kind) return filenameFormat;
  throw new Error(
    `ComfyUI ${kind === 'image' ? '图片' : '视频'}输出格式无法识别，请检查输出节点。`,
  );
}

