import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const STYLE_ID_RE = /^[a-z0-9][a-z0-9-]{1,71}$/;
const MAX_STYLE_COVER_BYTES = 768 * 1024;
const STYLE_COVER_SCHEMA = 'qiansi-plugin-shared-style-cover/v1';

export class PluginSharedStyleCoverConflictError extends Error {
  constructor(currentRevision) {
    super(`共享风格封面已被其他页面更新（当前 v${currentRevision}）。`);
    this.name = 'PluginSharedStyleCoverConflictError';
    this.code = 'PLUGIN_SHARED_STYLE_COVER_CONFLICT';
    this.currentRevision = currentRevision;
  }
}

function validatedId(value, expression, message) {
  const id = String(value || '')
    .trim()
    .toLowerCase();
  if (!expression.test(id)) throw new Error(message);
  return id;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function acquireFileLock(pathname) {
  await mkdir(resolve(pathname, '..'), { recursive: true });
  const token = randomUUID();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(pathname, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: Date.now() }));
      } finally {
        await handle.close();
      }
      return async () => {
        try {
          const owner = JSON.parse(await readFile(pathname, 'utf8'));
          if (owner?.token === token) await rm(pathname, { force: true });
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const [ownerText, info] = await Promise.all([readFile(pathname, 'utf8'), stat(pathname)]);
        let owner;
        try {
          owner = JSON.parse(ownerText);
        } catch {
          owner = null;
        }
        if (Date.now() - info.mtimeMs > 30_000 && !processIsRunning(Number(owner?.pid))) {
          await rm(pathname, { force: true });
          continue;
        }
      } catch (inspectionError) {
        if (inspectionError?.code !== 'ENOENT') throw inspectionError;
      }
      await delay(25);
    }
  }
  throw new Error('共享风格封面正被另一进程写入，请稍后重试。');
}

function decodedCover(value) {
  const dataUrl = String(value || '');
  const prefix = 'data:image/webp;base64,';
  const encoded = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : '';
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('共享风格封面必须是有效的 WebP data URL。');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 1 || bytes.length > MAX_STYLE_COVER_BYTES) {
    throw new Error('共享风格封面必须小于 768 KiB。');
  }
  if (
    bytes.slice(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.slice(8, 12).toString('ascii') !== 'WEBP'
  ) {
    throw new Error('共享风格封面内容不是有效的 WebP 文件。');
  }
  if (bytes.length < 30 || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw new Error('共享风格封面 WebP 容器长度无效。');
  }
  let dimensions = null;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.subarray(offset, offset + 4).toString('ascii');
    const size = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const end = dataOffset + size;
    if (end > bytes.length) throw new Error('共享风格封面 WebP 数据块越界。');
    if (kind === 'VP8X' && size >= 10) {
      dimensions = {
        width: bytes.readUIntLE(dataOffset + 4, 3) + 1,
        height: bytes.readUIntLE(dataOffset + 7, 3) + 1,
      };
    } else if (
      kind === 'VP8 ' &&
      size >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      dimensions = {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    } else if (kind === 'VP8L' && size >= 5 && bytes[dataOffset] === 0x2f) {
      const bits = bytes.readUInt32LE(dataOffset + 1);
      dimensions = {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    if (dimensions) break;
    offset = end + (size % 2);
  }
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error('共享风格封面缺少有效的 WebP 画布尺寸。');
  }
  return { bytes, dataUrl, ...dimensions };
}

function validatedDimension(value) {
  const dimension = Number(value);
  if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > 1600) {
    throw new Error('共享风格封面尺寸无效。');
  }
  return dimension;
}

function validatedFileName(value) {
  const fileName = String(value || 'cover.webp')
    .trim()
    .slice(0, 180);
  const unsafe = [...fileName].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === '/' || character === '\\' || codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!fileName || unsafe) {
    throw new Error('共享风格封面文件名无效。');
  }
  return fileName;
}

export class PluginSharedStyleCoverFileStore {
  constructor({ pluginsRoot }) {
    this.pluginsRoot = resolve(pluginsRoot);
    this.pluginDirectories = new Map();
    this.locks = new Map();
  }

  async registerPluginDirectory(pluginIdValue, directory) {
    const pluginId = validatedId(pluginIdValue, PLUGIN_ID_RE, '插件 ID 无效。');
    const normalized = resolve(directory);
    const child = relative(this.pluginsRoot, normalized);
    if (!child || child.startsWith('..') || child.includes('/') || child.includes('\\')) {
      throw new Error('插件目录超出受管插件根目录。');
    }
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(normalized, 'plugin.json'), 'utf8'));
    } catch {
      throw new Error('插件目录缺少有效清单。');
    }
    if (manifest?.id !== pluginId) throw new Error('插件目录与插件 ID 不匹配。');
    this.pluginDirectories.set(pluginId, normalized);
  }

  #paths(pluginIdValue, styleIdValue) {
    const pluginId = validatedId(pluginIdValue, PLUGIN_ID_RE, '插件 ID 无效。');
    const styleId = validatedId(styleIdValue, STYLE_ID_RE, '风格标识无效。');
    const pluginDirectory =
      this.pluginDirectories.get(pluginId) ?? resolve(this.pluginsRoot, pluginId);
    const directory = resolve(pluginDirectory, 'project-data', 'shared-style-covers', styleId);
    if (!directory.startsWith(`${pluginDirectory}${sep}`))
      throw new Error('共享风格封面目录无效。');
    return {
      pluginId,
      styleId,
      directory,
      cover: join(directory, 'cover.webp'),
      metadata: join(directory, 'metadata.json'),
      lock: join(
        resolve(pluginDirectory, 'project-data', 'shared-style-covers'),
        '.style-covers.lock',
      ),
    };
  }

  async #withLock(pluginId, lockPath, operation) {
    const previous = this.locks.get(pluginId) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
        const release = await acquireFileLock(lockPath);
        try {
          return await operation();
        } finally {
          await release();
        }
      });
    this.locks.set(pluginId, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(pluginId) === current) this.locks.delete(pluginId);
    }
  }

  async #metadata(paths) {
    let metadata;
    try {
      metadata = JSON.parse(await readFile(paths.metadata, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new Error('共享风格封面元数据已损坏；原文件已保留。');
    }
    if (
      metadata?.schema !== STYLE_COVER_SCHEMA ||
      metadata.pluginId !== paths.pluginId ||
      metadata.styleId !== paths.styleId ||
      metadata.mimeType !== 'image/webp' ||
      !Number.isSafeInteger(metadata.byteSize) ||
      metadata.byteSize < 1 ||
      metadata.byteSize > MAX_STYLE_COVER_BYTES ||
      !Number.isSafeInteger(metadata.width) ||
      metadata.width < 1 ||
      metadata.width > 1600 ||
      !Number.isSafeInteger(metadata.height) ||
      metadata.height < 1 ||
      metadata.height > 1600 ||
      !/^[a-f0-9]{64}$/.test(String(metadata.sha256 || '')) ||
      !Number.isSafeInteger(metadata.revision) ||
      metadata.revision < 1 ||
      !Number.isSafeInteger(metadata.updatedAt) ||
      metadata.updatedAt < 1
    )
      throw new Error('共享风格封面元数据无效；原文件已保留。');
    return metadata;
  }

  async read(pluginId, styleId) {
    const paths = this.#paths(pluginId, styleId);
    return this.#withLock(paths.pluginId, paths.lock, async () => {
      const metadata = await this.#metadata(paths);
      if (!metadata) return null;
      let bytes;
      try {
        bytes = await readFile(paths.cover);
      } catch (error) {
        if (error?.code === 'ENOENT') throw new Error('共享风格封面文件缺失；元数据已保留。');
        throw error;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== metadata.byteSize || sha256 !== metadata.sha256) {
        throw new Error('共享风格封面完整性校验失败；原文件已保留。');
      }
      const { pluginId: _pluginId, schema: _schema, ...snapshot } = metadata;
      return { ...snapshot, dataUrl: `data:image/webp;base64,${bytes.toString('base64')}` };
    });
  }

  async write(pluginId, styleId, cover, expectedRevision) {
    const paths = this.#paths(pluginId, styleId);
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    ) {
      throw new Error('共享风格封面预期修订号无效。');
    }
    const {
      bytes,
      dataUrl,
      width: actualWidth,
      height: actualHeight,
    } = decodedCover(cover?.dataUrl);
    const width = validatedDimension(cover?.width);
    const height = validatedDimension(cover?.height);
    if (width !== actualWidth || height !== actualHeight) {
      throw new Error('共享风格封面声明尺寸与 WebP 内容不一致。');
    }
    const fileName = validatedFileName(cover?.fileName);
    return this.#withLock(paths.pluginId, paths.lock, async () => {
      const current = await this.#metadata(paths);
      const currentRevision = current?.revision ?? 0;
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
        throw new PluginSharedStyleCoverConflictError(currentRevision);
      }
      const metadata = {
        schema: STYLE_COVER_SCHEMA,
        pluginId: paths.pluginId,
        styleId: paths.styleId,
        fileName,
        mimeType: 'image/webp',
        byteSize: bytes.length,
        width,
        height,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        revision: currentRevision + 1,
        updatedAt: Date.now(),
      };
      await mkdir(paths.directory, { recursive: true });
      const coverTemporary = `${paths.cover}.${process.pid}.${randomUUID()}.tmp`;
      const metadataTemporary = `${paths.metadata}.${process.pid}.${randomUUID()}.tmp`;
      const previousCover = current ? await readFile(paths.cover).catch(() => null) : null;
      try {
        await writeFile(coverTemporary, bytes, { flag: 'wx' });
        await writeFile(metadataTemporary, JSON.stringify(metadata), {
          encoding: 'utf8',
          flag: 'wx',
        });
        await rename(coverTemporary, paths.cover);
        await rename(metadataTemporary, paths.metadata);
      } catch (error) {
        await Promise.all([
          rm(coverTemporary, { force: true }).catch(() => {}),
          rm(metadataTemporary, { force: true }).catch(() => {}),
        ]);
        if (previousCover) {
          const rollback = `${paths.cover}.${process.pid}.${randomUUID()}.rollback`;
          await writeFile(rollback, previousCover, { flag: 'wx' });
          await rename(rollback, paths.cover);
        } else if (!current) {
          await rm(paths.cover, { force: true });
        }
        throw error;
      }
      const { pluginId: _pluginId, schema: _schema, ...snapshot } = metadata;
      return { ...snapshot, dataUrl };
    });
  }

  async delete(pluginId, styleId, expectedRevision) {
    const paths = this.#paths(pluginId, styleId);
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    ) {
      throw new Error('共享风格封面预期修订号无效。');
    }
    return this.#withLock(paths.pluginId, paths.lock, async () => {
      const current = await this.#metadata(paths);
      if (!current) return { deleted: false };
      if (expectedRevision !== undefined && expectedRevision !== current.revision) {
        throw new PluginSharedStyleCoverConflictError(current.revision);
      }
      await rm(paths.metadata);
      await rm(paths.cover, { force: true });
      return { deleted: true };
    });
  }
}
