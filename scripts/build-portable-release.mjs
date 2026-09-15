import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PINNED_PORTABLE_NODE_VERSION,
  PORTABLE_RELEASE_KIND,
  PORTABLE_RELEASE_MANIFEST,
  PORTABLE_RELEASE_SCHEMA_VERSION,
  collectProductionRuntimeClosure,
  createIntegrityFileList,
  listFilesRecursively,
  targetConfiguration,
  verifyPortableRelease,
} from './portable-release-contract.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

function parseArguments(values) {
  const options = { projectRoot: DEFAULT_PROJECT_ROOT };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--project-root') options.projectRoot = values[++index];
    else if (value === '--output') options.output = values[++index];
    else if (value === '--target') options.target = values[++index];
    else if (value === '--runtime') options.runtime = values[++index];
    else if (value === '--no-media-tools') options.includeMediaTools = false;
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!options.output) throw new Error('--output is required.');
  if (!options.target) throw new Error('--target is required.');
  return options;
}

function assertSafeOutput(projectRoot, output) {
  const root = resolve(projectRoot);
  const target = resolve(output);
  if (target === root) throw new Error('Portable output cannot be the source project root.');
  const relativeToTarget = relative(target, root);
  if (
    relativeToTarget === '' ||
    (!relativeToTarget.startsWith('..') && !relativeToTarget.includes(`..${sep}`))
  ) {
    throw new Error('Portable output cannot contain the source project root.');
  }
  for (const protectedPath of ['data', 'src', 'dist', 'tools', 'node_modules']) {
    if (target === join(root, protectedPath)) {
      throw new Error(`Portable output cannot overwrite ${protectedPath}.`);
    }
  }
}

async function assertDirectoryAbsent(path) {
  try {
    await stat(path);
    throw new Error(`Portable output already exists; choose a new empty path: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function copyRequiredFile(
  sourceRoot,
  releaseRoot,
  relativePath,
  destinationPath = relativePath,
) {
  const source = join(sourceRoot, relativePath);
  const details = await stat(source);
  if (!details.isFile()) throw new Error(`Required release file is not a file: ${relativePath}`);
  const destination = join(releaseRoot, destinationPath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { force: false, errorOnExist: true });
}

async function copyDirectory(sourceRoot, releaseRoot, relativePath) {
  const source = join(sourceRoot, relativePath);
  const details = await stat(source);
  if (!details.isDirectory())
    throw new Error(`Required release directory is missing: ${relativePath}`);
  const destination = join(releaseRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
}

function runtimeSourceExecutable(runtimeRoot, target) {
  return target.platform === 'win32'
    ? join(runtimeRoot, 'node.exe')
    : join(runtimeRoot, 'bin', 'node');
}

async function readRuntimeMetadata(runtimeRoot) {
  try {
    return JSON.parse(await readFile(join(runtimeRoot, 'qiansi-runtime.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function inspectRuntime(runtimeRoot, targetLabel) {
  const target = targetConfiguration(targetLabel);
  const executable = runtimeSourceExecutable(runtimeRoot, target);
  const details = await stat(executable);
  if (!details.isFile()) throw new Error(`Portable Node executable is missing: ${executable}`);

  let nodeVersion;
  if (process.platform === target.platform && process.arch === target.architecture) {
    nodeVersion = execFileSync(executable, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } else {
    const metadata = await readRuntimeMetadata(runtimeRoot);
    if (
      !metadata ||
      metadata.platform !== target.platform ||
      metadata.architecture !== target.architecture
    ) {
      throw new Error(
        `Cross-platform runtime ${targetLabel} requires matching qiansi-runtime.json metadata.`,
      );
    }
    nodeVersion = String(metadata.nodeVersion || '');
  }
  if (nodeVersion !== PINNED_PORTABLE_NODE_VERSION) {
    throw new Error(
      `Expected pinned Node.js ${PINNED_PORTABLE_NODE_VERSION}, received ${nodeVersion || 'unknown'}.`,
    );
  }
  return { executable, nodeVersion };
}

async function copyMinimalRuntime(runtimeRoot, releaseRoot, targetLabel) {
  const target = targetConfiguration(targetLabel);
  const runtime = await inspectRuntime(runtimeRoot, targetLabel);
  await copyRequiredFile(
    runtimeRoot,
    releaseRoot,
    target.platform === 'win32' ? 'node.exe' : 'bin/node',
  );
  await copyRequiredFile(runtimeRoot, releaseRoot, 'LICENSE');
  const metadata = await readRuntimeMetadata(runtimeRoot);
  if (metadata) {
    await writeFile(
      join(releaseRoot, 'qiansi-runtime.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    );
  }
  if (target.platform !== 'win32')
    await import('node:fs/promises').then(({ chmod }) =>
      chmod(join(releaseRoot, 'bin/node'), 0o755),
    );
  return runtime.nodeVersion;
}

async function writeRuntimePackageJson(projectRoot, releaseRoot) {
  const source = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  const runtimePackage = {
    name: source.name,
    private: true,
    version: source.version,
    author: source.author,
    license: source.license,
    type: 'module',
    engines: source.engines,
    qiansiPortable: true,
  };
  await writeFile(
    join(releaseRoot, 'package.json'),
    `${JSON.stringify(runtimePackage, null, 2)}\n`,
    'utf8',
  );
  return runtimePackage;
}

async function copyOptionalFile(projectRoot, releaseRoot, relativePath) {
  try {
    await copyRequiredFile(projectRoot, releaseRoot, relativePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function finalizePortableDirectory(staging, output, targetLabel) {
  try {
    await rename(staging, output);
    return 'atomic-rename';
  } catch (renameError) {
    let createdOutput = false;
    try {
      await mkdir(output, { recursive: false });
      createdOutput = true;
      const files = await listFilesRecursively(staging);
      for (const file of files) {
        if (file === PORTABLE_RELEASE_MANIFEST) continue;
        await copyRequiredFile(staging, output, file);
      }
      await copyRequiredFile(staging, output, PORTABLE_RELEASE_MANIFEST);
      await verifyPortableRelease(output, {
        target: targetLabel,
        checkHost:
          process.platform === targetConfiguration(targetLabel).platform &&
          process.arch === targetConfiguration(targetLabel).architecture,
      });
      await rm(staging, { recursive: true, force: true });
      return `verified-copy (${renameError.code || 'rename-failed'})`;
    } catch (copyError) {
      if (createdOutput) await rm(output, { recursive: true, force: true });
      throw new AggregateError(
        [renameError, copyError],
        'Could not finalize the portable release by rename or verified copy.',
      );
    }
  }
}

export async function buildPortableRelease(options) {
  const projectRoot = resolve(options.projectRoot || DEFAULT_PROJECT_ROOT);
  const output = resolve(options.output);
  const targetLabel = options.target;
  const target = targetConfiguration(targetLabel);
  const runtimeRoot = resolve(options.runtime || join(projectRoot, target.runtimeDirectory));
  assertSafeOutput(projectRoot, output);
  await assertDirectoryAbsent(output);
  await stat(join(projectRoot, 'dist', 'index.html'));

  await mkdir(dirname(output), { recursive: true });
  const staging = join(dirname(output), `.${basename(output)}.staging-${randomUUID()}`);
  await assertDirectoryAbsent(staging);
  await mkdir(staging, { recursive: false });
  try {
    const closure = await collectProductionRuntimeClosure(projectRoot);
    for (const file of closure.files) await copyRequiredFile(projectRoot, staging, file);
    await copyDirectory(projectRoot, staging, 'dist');
    await copyRequiredFile(projectRoot, staging, 'qiansi-launcher.mjs');
    await copyRequiredFile(projectRoot, staging, 'update-sources.default.json');
    await copyRequiredFile(projectRoot, staging, 'scripts/portable-release-contract.mjs');
    await copyRequiredFile(projectRoot, staging, 'scripts/verify-portable-release.mjs');
    await copyOptionalFile(projectRoot, staging, 'lightx2v-adapter.py');

    const documentation = [
      'README.md',
      '安装与启动指南.md',
      'LICENSE',
      'LICENSING.md',
      'THIRD_PARTY_NOTICES.md',
    ];
    for (const file of documentation) await copyRequiredFile(projectRoot, staging, file);

    if (target.platform === 'win32') {
      await copyRequiredFile(projectRoot, staging, 'Qiansi-Canvas-windows.bat');
    } else {
      await copyRequiredFile(projectRoot, staging, 'Qiansi-Canvas-macOS.command');
      const { chmod } = await import('node:fs/promises');
      await chmod(join(staging, 'Qiansi-Canvas-macOS.command'), 0o755);
    }

    const runtimeDestination = join(staging, target.runtimeDirectory);
    await mkdir(runtimeDestination, { recursive: true });
    const nodeVersion = await copyMinimalRuntime(runtimeRoot, runtimeDestination, targetLabel);

    const capabilities = { ffmpeg: false, ffprobe: false, lightx2vAdapter: true };
    if (options.includeMediaTools !== false) {
      const suffix = target.platform === 'win32' ? '.exe' : '';
      if (!(target.platform === 'win32' && target.architecture !== 'x64')) {
        capabilities.ffmpeg = await copyOptionalFile(projectRoot, staging, `tools/ffmpeg${suffix}`);
        capabilities.ffprobe = await copyOptionalFile(
          projectRoot,
          staging,
          `tools/ffprobe${suffix}`,
        );
        if (capabilities.ffmpeg || capabilities.ffprobe) {
          await copyOptionalFile(projectRoot, staging, 'tools/FFmpeg-README.txt');
        }
      }
    }

    const seedThemes = [
      'data/canvas-themes/README.md',
      'data/canvas-themes/Qiansi-Dream-Pink.theme.json',
      'data/canvas-themes/Qiansi-Dream-Pink.zip',
      'data/canvas-themes/Qiansi-macOS-Dark.zip',
    ];
    for (const file of seedThemes) await copyRequiredFile(projectRoot, staging, file);

    const runtimePackage = await writeRuntimePackageJson(projectRoot, staging);
    const files = await createIntegrityFileList(staging);
    const manifest = {
      schemaVersion: PORTABLE_RELEASE_SCHEMA_VERSION,
      kind: PORTABLE_RELEASE_KIND,
      appVersion: runtimePackage.version,
      target: targetLabel,
      platform: target.platform,
      architecture: target.architecture,
      nodeVersion,
      bridgeEntry: 'local-bridge.mjs',
      bridgeFiles: closure.files,
      externalRuntimeImports: closure.externalImports,
      capabilities,
      files,
    };
    await writeFile(
      join(staging, PORTABLE_RELEASE_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    await verifyPortableRelease(staging, {
      target: targetLabel,
      checkHost: process.platform === target.platform && process.arch === target.architecture,
    });
    const commitMethod = await finalizePortableDirectory(staging, output, targetLabel);
    return { output, manifest, commitMethod };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function buildPortableReleaseCommand(values = process.argv.slice(2)) {
  const options = parseArguments(values);
  const result = await buildPortableRelease(options);
  console.log(`绿色运行包已生成：${result.output}`);
  console.log(
    `${result.manifest.target} · Node.js ${result.manifest.nodeVersion} · ${result.manifest.files.length} 个校验文件`,
  );
  console.log(`目录提交方式：${result.commitMethod}`);
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH);
if (invokedDirectly) {
  buildPortableReleaseCommand().catch((error) => {
    console.error(`绿色运行包生成失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
