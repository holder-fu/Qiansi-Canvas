import { createHash } from 'node:crypto';
import {
  mkdir,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';

export const MAX_REFERENCE_AUDIO_BYTES = 16 * 1024 * 1024;
export const MAX_REFERENCE_AUDIO_TRANSCRIPT_LENGTH = 16_000;
export const MAX_REFERENCE_AUDIO_AVATAR_BYTES = 512 * 1024;
export const UNCATEGORIZED_REFERENCE_AUDIO = '未分类';

const MIME_BY_EXTENSION = new Map([
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.flac', 'audio/flac'],
  ['.webm', 'audio/webm'],
]);
const MIME_TYPES_BY_EXTENSION = new Map([
  ['.wav', new Set(['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'])],
  ['.mp3', new Set(['audio/mpeg', 'audio/mp3'])],
  ['.m4a', new Set(['audio/mp4', 'audio/x-m4a'])],
  ['.aac', new Set(['audio/aac'])],
  ['.ogg', new Set(['audio/ogg', 'application/ogg'])],
  ['.flac', new Set(['audio/flac', 'audio/x-flac'])],
  ['.webm', new Set(['audio/webm'])],
]);
const AVATAR_MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);
const MAX_REFERENCE_AUDIO_AVATAR_TOTAL_BYTES = 8 * 1024 * 1024;
const SAFE_NAME = /^[^<>:"/\\|?*]+$/u;
const importQueues = new Map();

export class ReferenceAudioLibraryError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ReferenceAudioLibraryError';
    this.statusCode = statusCode;
  }
}

function entryId(relativePath) {
  return createHash('sha256').update(relativePath.normalize('NFC')).digest('hex').slice(0, 32);
}

function safeSegment(value, label, maximum = 80) {
  const text = String(value ?? '')
    .trim()
    .normalize('NFC');
  if (
    !text ||
    text.length > maximum ||
    text === '.' ||
    text === '..' ||
    !SAFE_NAME.test(text) ||
    [...text].some((character) => character.codePointAt(0) < 32)
  ) {
    throw new ReferenceAudioLibraryError(`${label}无效。`);
  }
  return text;
}

function inside(root, target) {
  const value = relative(root, target);
  return value === '' || (!value.startsWith('..') && !resolve(value).startsWith('..'));
}

function withImportQueue(root, task) {
  const previous = importQueues.get(root) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  importQueues.set(root, current);
  return current.finally(() => {
    if (importQueues.get(root) === current) importQueues.delete(root);
  });
}

function sameBytes(left, right) {
  return left.byteLength === right.byteLength && left.equals(right);
}

async function safeRegularFile(root, target) {
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) return null;
  const actual = await realpath(target);
  if (!inside(root, actual)) return null;
  return { info, actual };
}

function validAvatarBytes(mimeType, bytes) {
  if (mimeType === 'image/jpeg') {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      bytes.byteLength >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  return (
    mimeType === 'image/webp' &&
    bytes.byteLength >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

async function readPairedAvatar(root, audioPath) {
  const stem = audioPath.slice(0, -extname(audioPath).length);
  for (const [extension, mimeType] of AVATAR_MIME_BY_EXTENSION) {
    const target = `${stem}${extension}`;
    let file;
    try {
      file = await safeRegularFile(root, target);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      continue;
    }
    if (!file || file.info.size < 1 || file.info.size > MAX_REFERENCE_AUDIO_AVATAR_BYTES) continue;
    const bytes = await readFile(file.actual).catch(() => null);
    if (!bytes || !validAvatarBytes(mimeType, bytes)) continue;
    return { actual: file.actual, extension, mimeType, bytes };
  }
  return null;
}

function transcriptPath(audioPath) {
  return `${audioPath}.transcript.txt`;
}

function safeTranscript(value) {
  const text = String(value ?? '').replaceAll('\r\n', '\n');
  if (text.length > MAX_REFERENCE_AUDIO_TRANSCRIPT_LENGTH) {
    throw new ReferenceAudioLibraryError('参考音频准确转写不能超过 16000 个字符。');
  }
  return text;
}

async function readTranscript(root, audioPath) {
  const target = transcriptPath(audioPath);
  let file;
  try {
    file = await safeRegularFile(root, target);
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    return '';
  }
  if (!file || file.info.size > MAX_REFERENCE_AUDIO_TRANSCRIPT_LENGTH * 4) return '';
  const text = await readFile(file.actual, 'utf8').catch(() => '');
  return text.length <= MAX_REFERENCE_AUDIO_TRANSCRIPT_LENGTH ? text : '';
}

async function writeTranscript(root, audioPath, value) {
  const text = safeTranscript(value);
  const target = transcriptPath(audioPath);
  const existing = await lstat(target).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
    throw new ReferenceAudioLibraryError('参考音频转写文件无效。', 403);
  }
  if (!text) {
    if (existing) await unlink(target);
    return;
  }
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
  try {
    if (existing) await unlink(target);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  const stored = await safeRegularFile(root, target).catch(() => null);
  if (!stored) throw new ReferenceAudioLibraryError('参考音频转写保存失败。', 500);
}

export class ReferenceAudioLibrary {
  constructor(root) {
    this.root = resolve(root);
  }

  async ensureRoot() {
    await mkdir(this.root, { recursive: true });
    const rootInfo = await lstat(this.root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw new ReferenceAudioLibraryError('参考音频库目录不能是符号链接。', 403);
    }
    const actual = await realpath(this.root);
    return actual;
  }

  async list() {
    const root = await this.ensureRoot();
    const entries = [];
    const categories = new Set([UNCATEGORIZED_REFERENCE_AUDIO]);
    const rootEntries = await readdir(root, { withFileTypes: true });
    let remainingAvatarBytes = MAX_REFERENCE_AUDIO_AVATAR_TOTAL_BYTES;

    const addFile = async (target, category) => {
      const extension = extname(target).toLowerCase();
      const mimeType = MIME_BY_EXTENSION.get(extension);
      if (!mimeType) return;
      let file;
      try {
        file = await safeRegularFile(root, target);
      } catch {
        return;
      }
      if (!file || file.info.size < 1 || file.info.size > MAX_REFERENCE_AUDIO_BYTES) return;
      const relativePath = relative(root, file.actual).replaceAll('\\', '/');
      const avatar = remainingAvatarBytes > 0 ? await readPairedAvatar(root, file.actual) : null;
      let avatarDataUrl = '';
      if (avatar && avatar.bytes.byteLength <= remainingAvatarBytes) {
        remainingAvatarBytes -= avatar.bytes.byteLength;
        avatarDataUrl = `data:${avatar.mimeType};base64,${avatar.bytes.toString('base64')}`;
      }
      entries.push({
        id: entryId(relativePath),
        name: basename(target, extension),
        fileName: basename(target),
        category,
        mimeType,
        size: file.info.size,
        transcript: await readTranscript(root, file.actual),
        ...(avatarDataUrl ? { avatarDataUrl } : {}),
      });
    };

    for (const item of rootEntries) {
      const target = join(root, item.name);
      if (item.isFile() && !item.isSymbolicLink()) {
        await addFile(target, UNCATEGORIZED_REFERENCE_AUDIO);
      } else if (item.isDirectory() && !item.isSymbolicLink()) {
        const category = item.name.normalize('NFC');
        if (!SAFE_NAME.test(category) || category === '.' || category === '..') continue;
        const actualDirectory = await realpath(target).catch(() => '');
        if (!actualDirectory || !inside(root, actualDirectory)) continue;
        categories.add(category);
        for (const child of await readdir(actualDirectory, { withFileTypes: true })) {
          if (child.isFile() && !child.isSymbolicLink()) {
            await addFile(join(actualDirectory, child.name), category);
          }
        }
      }
    }
    entries.sort(
      (left, right) =>
        left.category.localeCompare(right.category, 'zh-CN') ||
        left.name.localeCompare(right.name, 'zh-CN'),
    );
    return {
      categories: [
        UNCATEGORIZED_REFERENCE_AUDIO,
        ...[...categories]
          .filter((category) => category !== UNCATEGORIZED_REFERENCE_AUDIO)
          .sort((a, b) => a.localeCompare(b, 'zh-CN')),
      ],
      entries,
    };
  }

  async find(idValue) {
    const id = String(idValue ?? '')
      .trim()
      .toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(id)) {
      throw new ReferenceAudioLibraryError('参考音频 ID 无效。');
    }
    const root = await this.ensureRoot();
    const listing = await this.list();
    const publicEntry = listing.entries.find((entry) => entry.id === id);
    if (!publicEntry) throw new ReferenceAudioLibraryError('参考音频不存在。', 404);
    const directory =
      publicEntry.category === UNCATEGORIZED_REFERENCE_AUDIO
        ? root
        : join(root, publicEntry.category);
    const target = join(directory, publicEntry.fileName);
    const file = await safeRegularFile(root, target).catch(() => null);
    if (!file) throw new ReferenceAudioLibraryError('参考音频不存在。', 404);
    return { publicEntry, target: file.actual };
  }

  async read(id) {
    return this.find(id);
  }

  async createCategory(nameValue) {
    const category = safeSegment(nameValue, '参考音频分类', 80);
    if (category === UNCATEGORIZED_REFERENCE_AUDIO) {
      throw new ReferenceAudioLibraryError('“未分类”代表音频库根目录，不能作为分类名称。');
    }
    const root = await this.ensureRoot();
    const directory = join(root, category);
    try {
      await mkdir(directory);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const info = await lstat(directory).catch(() => null);
      const actualDirectory = await realpath(directory).catch(() => '');
      if (
        !info?.isDirectory() ||
        info.isSymbolicLink() ||
        !actualDirectory ||
        !inside(root, actualDirectory)
      ) {
        throw new ReferenceAudioLibraryError('参考音频分类目录无效。', 403);
      }
    }
    return category;
  }

  async add(fileNameValue, mimeTypeValue, bytesValue) {
    const fileName = safeSegment(fileNameValue, '参考音频文件名', 160);
    if (basename(fileName) !== fileName) {
      throw new ReferenceAudioLibraryError('参考音频文件名无效。');
    }
    const extension = extname(fileName).toLowerCase();
    const mimeType = String(mimeTypeValue ?? '')
      .trim()
      .toLowerCase();
    const acceptedMimeTypes = MIME_TYPES_BY_EXTENSION.get(extension);
    if (!acceptedMimeTypes || (mimeType && !acceptedMimeTypes.has(mimeType))) {
      throw new ReferenceAudioLibraryError('参考音频格式无效。', 415);
    }
    const name = safeSegment(basename(fileName, extname(fileName)), '参考音频名称', 120);
    const bytes = Buffer.isBuffer(bytesValue) ? bytesValue : Buffer.from(bytesValue ?? []);
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
      throw new ReferenceAudioLibraryError('参考音频必须大于 0 字节且不能超过 16 MB。', 413);
    }

    return withImportQueue(this.root, async () => {
      const root = await this.ensureRoot();
      const candidatePattern = new RegExp(
        `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\((\\d+)\\))?${extension.replace('.', '\\.')}$$`,
        'iu',
      );
      let nextIndex = 2;
      for (const item of await readdir(root, { withFileTypes: true })) {
        if (!item.isFile() || item.isSymbolicLink()) continue;
        const match = candidatePattern.exec(item.name);
        if (!match) continue;
        const target = join(root, item.name);
        const file = await safeRegularFile(root, target).catch(() => null);
        if (!file || file.info.size !== bytes.byteLength) continue;
        if (sameBytes(await readFile(file.actual), bytes)) {
          const listing = await this.list();
          const relativePath = relative(root, file.actual).replaceAll('\\', '/');
          const existing = listing.entries.find((entry) => entry.id === entryId(relativePath));
          if (existing) return existing;
        }
        if (match[1]) nextIndex = Math.max(nextIndex, Number(match[1]) + 1);
      }

      let target = join(root, `${name}${extension}`);
      while (true) {
        let handle;
        let created = false;
        try {
          handle = await open(target, 'wx');
          created = true;
          await handle.writeFile(bytes);
          await handle.sync();
          await handle.close();
          break;
        } catch (error) {
          await handle?.close().catch(() => {});
          if (error?.code === 'EEXIST') {
            target = join(root, `${name} (${nextIndex})${extension}`);
            nextIndex += 1;
            continue;
          }
          if (created) await unlink(target).catch(() => {});
          throw error;
        }
      }
      const listing = await this.list();
      const relativePath = relative(root, target).replaceAll('\\', '/');
      const added = listing.entries.find((entry) => entry.id === entryId(relativePath));
      if (!added) throw new ReferenceAudioLibraryError('参考音频加入库后无法读取。', 500);
      return added;
    });
  }

  async rename(id, nameValue, categoryValue, transcriptValue = undefined) {
    const current = await this.find(id);
    const root = await this.ensureRoot();
    const name = safeSegment(nameValue, '参考音频名称', 120);
    const categoryText = String(categoryValue ?? '')
      .trim()
      .normalize('NFC');
    const category =
      !categoryText || categoryText === UNCATEGORIZED_REFERENCE_AUDIO
        ? UNCATEGORIZED_REFERENCE_AUDIO
        : safeSegment(categoryText, '参考音频分类', 80);
    const extension = extname(current.publicEntry.fileName).toLowerCase();
    const directory = category === UNCATEGORIZED_REFERENCE_AUDIO ? root : join(root, category);
    await mkdir(directory, { recursive: true });
    const actualDirectory = await realpath(directory);
    if (!inside(root, actualDirectory)) {
      throw new ReferenceAudioLibraryError('参考音频分类目录无效。', 403);
    }
    const target = join(actualDirectory, `${name}${extension}`);
    const avatar = await readPairedAvatar(root, current.target);
    const avatarTarget = avatar ? join(actualDirectory, `${name}${avatar.extension}`) : '';
    const transcript =
      transcriptValue === undefined
        ? current.publicEntry.transcript
        : safeTranscript(transcriptValue);
    if (resolve(target) !== resolve(current.target)) {
      try {
        await lstat(target);
        throw new ReferenceAudioLibraryError('该分类中已存在同名音频。', 409);
      } catch (error) {
        if (error instanceof ReferenceAudioLibraryError) throw error;
        if (error?.code !== 'ENOENT') throw error;
      }
      if (avatar && resolve(avatarTarget) !== resolve(avatar.actual)) {
        try {
          await lstat(avatarTarget);
          throw new ReferenceAudioLibraryError('该分类中已存在同名头像。', 409);
        } catch (error) {
          if (error instanceof ReferenceAudioLibraryError) throw error;
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      await rename(current.target, target);
      if (avatar && resolve(avatarTarget) !== resolve(avatar.actual)) {
        try {
          await rename(avatar.actual, avatarTarget);
        } catch (error) {
          await rename(target, current.target).catch(() => {});
          throw error;
        }
      }
    }
    await writeTranscript(root, target, transcript);
    if (resolve(target) !== resolve(current.target)) {
      await unlink(transcriptPath(current.target)).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
    const listing = await this.list();
    const relativePath = relative(root, target).replaceAll('\\', '/');
    const updated = listing.entries.find((entry) => entry.id === entryId(relativePath));
    if (!updated) throw new ReferenceAudioLibraryError('参考音频更新后无法读取。', 500);
    return updated;
  }
}
