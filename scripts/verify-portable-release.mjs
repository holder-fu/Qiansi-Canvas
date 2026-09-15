import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPortableRelease } from './portable-release-contract.mjs';

function parseArguments(values) {
  const options = { root: process.cwd(), quick: false, checkHost: true };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--root') options.root = values[++index];
    else if (value === '--target') options.target = values[++index];
    else if (value === '--quick') options.quick = true;
    else if (value === '--no-host-check') options.checkHost = false;
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!options.root) throw new Error('--root requires a directory.');
  return options;
}

export async function verifyPortableReleaseCommand(values = process.argv.slice(2)) {
  const options = parseArguments(values);
  const manifest = await verifyPortableRelease(resolve(options.root), options);
  const mode = options.quick ? '快速检查' : '完整 SHA-256 检查';
  console.log(`Qiansi-Canvas ${manifest.appVersion} ${manifest.target}：${mode}通过。`);
  return manifest;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  verifyPortableReleaseCommand().catch((error) => {
    console.error(`绿色运行包检查失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
