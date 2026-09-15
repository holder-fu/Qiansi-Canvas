import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gateFile = fileURLToPath(import.meta.url);
const sourceExtensions = new Set(['.css', '.html', '.js', '.jsx', '.ts', '.tsx']);
const skippedDirectories = new Set([
  '.git',
  '__pycache__',
  'dist',
  'model',
  'models',
  'node_modules',
  'python',
  'site-packages',
  'source',
  'worker-runtime',
]);

const bannedPatterns = [
  { label: 'Tailwind arbitrary 8px text', expression: /text-\[\s*8px\s*\]/g },
  { label: 'CSS 8px font-size', expression: /font-size\s*:\s*8px\b/gi },
  {
    label: 'inline 8px fontSize',
    expression: /fontSize\s*:\s*(?:8\b|['"`]\s*8px\s*['"`])/g,
  },
];

function collectFiles(target, files) {
  const stats = statSync(target);
  if (stats.isFile()) {
    if (sourceExtensions.has(extname(target)) && target !== gateFile) files.push(target);
    return;
  }

  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    collectFiles(join(target, entry.name), files);
  }
}

const files = [];
collectFiles(join(projectRoot, 'src'), files);
const installedPluginRoot = join(projectRoot, 'data', 'plugins');
if (existsSync(installedPluginRoot)) collectFiles(installedPluginRoot, files);

const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const { label, expression } of bannedPatterns) {
    expression.lastIndex = 0;
    for (const match of source.matchAll(expression)) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      failures.push(`${relative(projectRoot, file)}:${line} — ${label}`);
    }
  }
}

if (failures.length > 0) {
  console.error('8px 字体门禁失败：无限画布及内置插件不允许新增 8px 字号。');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.warn(`8px 字体门禁通过（检查 ${files.length} 个一方界面文件）。`);
}
