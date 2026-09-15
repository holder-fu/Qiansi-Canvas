import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Qiansi Audio Studio is published from its own repository. These local
// integration suites remain useful when that optional package is installed,
// but do not belong to a clean Qiansi-Canvas source checkout.
const optionalLocalIntegrationSuites = new Set([
  'managed-audio-worker.test.mjs',
  'qiansi-audio-controller.test.mjs',
  'qiansi-audio-install-ui.test.mjs',
  'qiansi-audio-standalone.test.mjs',
  'qiansi-audio-workbench.test.mjs',
]);

const entries = await readdir(projectRoot, { withFileTypes: true });
const contractTests = entries
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith('.test.mjs') &&
      !optionalLocalIntegrationSuites.has(entry.name),
  )
  .map((entry) => entry.name)
  .sort();

if (contractTests.length === 0) {
  throw new Error('No public-source Node contract tests were found.');
}

process.stdout.write(
  `Running ${contractTests.length} public-source Node contract suites ` +
    `(skipping ${optionalLocalIntegrationSuites.size} optional local integration suites).\n`,
);

const child = spawn(process.execPath, ['--test', ...contractTests], {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`Node contract tests ended from signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
