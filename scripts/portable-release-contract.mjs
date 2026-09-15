import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PORTABLE_RELEASE_SCHEMA_VERSION = 1;
export const PORTABLE_RELEASE_KIND = 'qiansi-canvas-portable';
export const PORTABLE_RELEASE_MANIFEST = 'portable-release.json';
export const PINNED_PORTABLE_NODE_VERSION = '22.23.2';
export const MINIMUM_NODE_VERSION = '22.12.0';

export const PORTABLE_TARGETS = Object.freeze({
  'windows-x64': {
    platform: 'win32',
    architecture: 'x64',
    runtimeDirectory: 'tools/runtime/node/windows',
    runtimeExecutable: 'tools/runtime/node/windows/node.exe',
    runtimeLicense: 'tools/runtime/node/windows/LICENSE',
  },
  'windows-arm64': {
    platform: 'win32',
    architecture: 'arm64',
    runtimeDirectory: 'tools/runtime/node/windows',
    runtimeExecutable: 'tools/runtime/node/windows/node.exe',
    runtimeLicense: 'tools/runtime/node/windows/LICENSE',
  },
  'macos-x64': {
    platform: 'darwin',
    architecture: 'x64',
    runtimeDirectory: 'tools/runtime/node/macos',
    runtimeExecutable: 'tools/runtime/node/macos/bin/node',
    runtimeLicense: 'tools/runtime/node/macos/LICENSE',
  },
  'macos-arm64': {
    platform: 'darwin',
    architecture: 'arm64',
    runtimeDirectory: 'tools/runtime/node/macos',
    runtimeExecutable: 'tools/runtime/node/macos/bin/node',
    runtimeLicense: 'tools/runtime/node/macos/LICENSE',
  },
});

const STATIC_FROM_IMPORT = /\b(?:import|export)\s+[\s\S]*?\sfrom\s*(['"])([^'"\r\n]+)\1/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*(['"])([^'"\r\n]+)\1/g;
const FORBIDDEN_RUNTIME_PATTERNS = [
  { pattern: /\bimport\s*\(/, label: 'dynamic import()' },
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bnew\s+Worker\s*\(/, label: 'Node Worker' },
];

function slash(value) {
  return value.split(sep).join('/');
}

export function normalizeReleasePath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Release paths must be non-empty strings.');
  }
  const normalized = slash(value.trim()).replace(/^\.\//, '');
  if (
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    throw new Error(`Unsafe release path: ${value}`);
  }
  return normalized;
}

export function targetConfiguration(target) {
  const value = PORTABLE_TARGETS[target];
  if (!value) {
    throw new Error(
      `Unsupported portable target "${target}". Expected one of: ${Object.keys(PORTABLE_TARGETS).join(', ')}.`,
    );
  }
  return value;
}

function resolveRelativeModule(projectRoot, importer, specifier) {
  const absolute = resolve(dirname(join(projectRoot, importer)), specifier);
  const relativePath = normalizeReleasePath(relative(projectRoot, absolute));
  if (isAbsolute(relativePath) || relativePath.startsWith('../')) {
    throw new Error(`${importer} imports outside the application root: ${specifier}`);
  }
  return relativePath;
}

export async function collectProductionRuntimeClosure(projectRoot, entry = 'local-bridge.mjs') {
  const root = resolve(projectRoot);
  const queue = [normalizeReleasePath(entry)];
  const visited = new Set();
  const externalImports = new Set();

  while (queue.length > 0) {
    const modulePath = queue.shift();
    if (visited.has(modulePath)) continue;
    const absolute = join(root, modulePath);
    const source = await readFile(absolute, 'utf8');

    for (const { pattern, label } of FORBIDDEN_RUNTIME_PATTERNS) {
      if (pattern.test(source)) {
        throw new Error(`${modulePath} uses unsupported production runtime feature ${label}.`);
      }
    }

    const specifiers = new Set();
    for (const pattern of [STATIC_FROM_IMPORT, SIDE_EFFECT_IMPORT]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) specifiers.add(match[2]);
    }

    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) {
        externalImports.add(specifier);
        continue;
      }
      if (!specifier.startsWith('.')) {
        throw new Error(`${modulePath} has a production npm/bare import: ${specifier}`);
      }
      const dependency = resolveRelativeModule(root, modulePath, specifier);
      if (!dependency.endsWith('.mjs')) {
        throw new Error(`${modulePath} imports a non-MJS runtime file: ${specifier}`);
      }
      queue.push(dependency);
    }

    visited.add(modulePath);
  }

  return {
    files: [...visited].sort(),
    externalImports: [...externalImports].sort(),
  };
}

export async function sha256File(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

export async function listFilesRecursively(root) {
  const base = resolve(root);
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(normalizeReleasePath(relative(base, absolute)));
      } else {
        throw new Error(`Portable releases cannot contain links or special files: ${absolute}`);
      }
    }
  }

  await visit(base);
  return files;
}

export async function createIntegrityFileList(root, excluded = [PORTABLE_RELEASE_MANIFEST]) {
  const excludedPaths = new Set(excluded.map(normalizeReleasePath));
  const files = await listFilesRecursively(root);
  const records = [];
  for (const file of files) {
    if (excludedPaths.has(file)) continue;
    const absolute = join(root, file);
    const details = await stat(absolute);
    records.push({ path: file, size: details.size, sha256: await sha256File(absolute) });
  }
  return records;
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value || '').replace(/^v/, ''));
  if (!match) throw new Error(`Invalid Node.js version: ${value}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function assertPortableManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Portable release manifest must be a JSON object.');
  }
  if (manifest.schemaVersion !== PORTABLE_RELEASE_SCHEMA_VERSION) {
    throw new Error(`Unsupported portable release schema: ${manifest.schemaVersion}`);
  }
  if (manifest.kind !== PORTABLE_RELEASE_KIND) {
    throw new Error(`Unexpected portable release kind: ${manifest.kind}`);
  }
  const target = targetConfiguration(manifest.target);
  if (manifest.platform !== target.platform || manifest.architecture !== target.architecture) {
    throw new Error('Portable release target metadata is internally inconsistent.');
  }
  if (compareVersions(manifest.nodeVersion, MINIMUM_NODE_VERSION) < 0) {
    throw new Error(`Portable Node.js ${manifest.nodeVersion} is below ${MINIMUM_NODE_VERSION}.`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Portable release manifest has no integrity file list.');
  }
  const seen = new Set();
  for (const record of manifest.files) {
    const path = normalizeReleasePath(record?.path);
    if (seen.has(path)) throw new Error(`Duplicate manifest file: ${path}`);
    if (!Number.isSafeInteger(record?.size) || record.size < 0) {
      throw new Error(`Invalid file size in manifest: ${path}`);
    }
    if (!/^[a-f0-9]{64}$/.test(record?.sha256 || '')) {
      throw new Error(`Invalid SHA-256 in manifest: ${path}`);
    }
    seen.add(path);
  }
  return target;
}

export async function readPortableManifest(root) {
  const path = join(resolve(root), PORTABLE_RELEASE_MANIFEST);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  assertPortableManifestShape(manifest);
  return manifest;
}

async function assertReadableFile(path, label) {
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    throw new Error(`${label} is missing or unreadable: ${path}`);
  }
  const details = await stat(path);
  if (!details.isFile()) throw new Error(`${label} is not a file: ${path}`);
}

export async function verifyPortableRelease(root, options = {}) {
  const base = resolve(root);
  const manifest = await readPortableManifest(base);
  const target = targetConfiguration(manifest.target);
  const quick = options.quick === true;

  if (options.target && options.target !== manifest.target) {
    throw new Error(`Package target is ${manifest.target}, not ${options.target}.`);
  }
  if (options.checkHost !== false) {
    if (process.platform !== target.platform || process.arch !== target.architecture) {
      throw new Error(
        `This package is for ${manifest.target}; current host is ${process.platform}-${process.arch}.`,
      );
    }
  }

  const corePaths = new Set([
    'package.json',
    'dist/index.html',
    'local-bridge.mjs',
    'update-sources.default.json',
    target.runtimeExecutable,
    target.runtimeLicense,
    ...(manifest.bridgeFiles || []),
  ]);
  const records = new Map(manifest.files.map((record) => [record.path, record]));
  for (const path of corePaths) {
    const normalized = normalizeReleasePath(path);
    if (!records.has(normalized))
      throw new Error(`Required file is absent from manifest: ${normalized}`);
    await assertReadableFile(join(base, normalized), 'Required portable file');
  }

  const recordsToVerify = manifest.files;
  for (const record of recordsToVerify) {
    const absolute = join(base, normalizeReleasePath(record.path));
    await assertReadableFile(absolute, 'Portable file');
    const details = await stat(absolute);
    if (details.size !== record.size)
      throw new Error(`Portable file size mismatch: ${record.path}`);
    if (!quick) {
      const digest = await sha256File(absolute);
      if (digest !== record.sha256) throw new Error(`Portable file hash mismatch: ${record.path}`);
    }
  }

  return manifest;
}
