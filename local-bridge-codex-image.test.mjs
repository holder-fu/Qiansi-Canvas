import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');

test('Codex image requests isolate generated files before importing a result', () => {
  assert.match(source, /const requestOutputRoot = join\(/);
  assert.match(source, /`request_\$\{requestToken\}_\$\{randomUUID\(\)\.replace\(\/-\/g, ''\)\}`/);
  assert.match(source, /'--cd',\s*requestOutputRoot/);
  assert.match(source, /cwd: requestOutputRoot/);
  assert.match(source, /collectFreshCodexImageFiles\(requestOutputRoot, startedAt\)/);
  assert.match(source, /rm\(requestOutputRoot, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(
    source,
    /for \(const name of await readdir\(CLI_IMAGE_OUTPUT_ROOT\)[\s\S]{0,300}newFiles\.push/,
  );
});

test('Codex image results accept structured relative paths and nested output directories', () => {
  assert.match(source, /extractCodexImageCandidates\(result\.stdout\)/);
  assert.match(source, /readdir\(directory, \{ withFileTypes: true \}\)/);
  assert.match(source, /if \(entry\.isSymbolicLink\(\)\) continue/);
  assert.match(source, /resolve\(allowedOutputRoot, path\)/);
  assert.match(source, /summarizeCodexImageFailure\(result\.stderr, result\.stdout\)/);
});

test('Codex image references accept the browser-facing development proxy path', () => {
  assert.match(
    source,
    /const localMediaPath = parsed \? localPersistedMediaPathname\(parsed, LOCAL_BRIDGE_HOSTS\) : ''/,
  );
  assert.match(
    source,
    /const localAssetMatch = \/\^\\\/asset-library\\\/files\\\/\(\[A-Za-z0-9_-\]\{6,80\}\)\$\//,
  );
  assert.match(source, /const generatedOutputMatch = \/\^\\\/output\\\/\(\[A-Za-z0-9_.-\]\+\)\$\//);
});
