import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function filesUnder(root, relative = '') {
  const files = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Build output must not contain symlinks: ${name}`);
    if (entry.isDirectory()) files.push(...(await filesUnder(root, name)));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}

/** Publish complete assets before atomically changing the HTML entry. Never erase
 * old hashed chunks: already-open pages still need them for deferred imports.
 */
export async function publishWebBuild(staging, destination) {
  const files = await filesUnder(staging);
  if (!files.includes('index.html')) throw new Error('Build is missing index.html');
  const html = await readFile(join(staging, 'index.html'), 'utf8');
  if (!/<script\b[^>]*\bsrc=["'][^"']+\.js["']/u.test(html)) {
    throw new Error('Build HTML has no JavaScript entry');
  }
  for (const match of html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/gu)) {
    if (!files.includes(match[1])) throw new Error(`Missing entry resource: ${match[1]}`);
  }
  await mkdir(destination, { recursive: true });
  const lockPath = join(destination, '.web-publish.lock');
  const lock = await open(lockPath, 'wx');
  try {
    for (const name of [...files.filter((name) => name !== 'index.html'), 'index.html']) {
      const bytes = await readFile(join(staging, name));
      const target = join(destination, name);
      const existing = await readFile(target).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (existing?.equals(bytes)) continue;
      // Content-addressed files must never change under the same URL.
      if (existing && name.startsWith('assets/')) throw new Error(`Asset collision: ${name}`);
      await mkdir(dirname(target), { recursive: true });
      const pending = `${target}.${randomUUID()}.pending`;
      try {
        await writeFile(pending, bytes, { flag: 'wx' });
        await rename(pending, target);
      } finally {
        await rm(pending, { force: true });
      }
    }
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export async function buildWeb({ check = false } = {}) {
  const staging = await mkdtemp(join(tmpdir(), 'qiansi-web-build-'));
  try {
    const { build } = await import('vite');
    await build({ root: projectRoot, build: { outDir: staging, emptyOutDir: true } });
    if (!check) await publishWebBuild(staging, join(projectRoot, 'dist'));
    process.stdout.write(
      check
        ? 'Build verified in isolation; running dist was not changed.\n'
        : 'Web entry updated; previous hashed assets remain available to open pages.\n',
    );
  } finally {
    // Only the directory created by this invocation, never the serving directory.
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) throw new Error('Only --check is supported');
  buildWeb({ check: args.includes('--check') }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
