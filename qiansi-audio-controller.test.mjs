import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const pluginRoot = 'data/plugins/qiansi-audio';
const launcherPath = `${pluginRoot}/启动 Qiansi Audio Studio.bat`;
const bootstrapPath = `${pluginRoot}/controller/bootstrap.ps1`;
const readmePath = `${pluginRoot}/controller/README.md`;

async function readOptionalPackageFile(fileName, encoding = null) {
  try {
    return await readFile(fileName, encoding ?? undefined);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

test('standalone launcher owns a model-independent, hash-pinned controller runtime', async (t) => {
  const [launcherBytes, bootstrap, readme] = await Promise.all([
    readOptionalPackageFile(launcherPath),
    readOptionalPackageFile(bootstrapPath, 'utf8'),
    readOptionalPackageFile(readmePath, 'utf8'),
  ]);
  if (!launcherBytes && !bootstrap && !readme) {
    t.skip('optional qiansi-audio package is not present in this source checkout');
    return;
  }
  assert.ok(launcherBytes, 'portable launcher must be present with the plugin package');
  assert.ok(bootstrap, 'controller bootstrap must be present with the plugin package');
  assert.ok(readme, 'controller trust and recovery documentation must be present');

  const launcher = launcherBytes.toString('ascii');
  assert.equal(launcherBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.equal(/[\u0080-\uffff]/u.test(launcherBytes.toString('latin1')), false);
  assert.equal(launcher.replace(/\r\n/g, '').includes('\n'), false, 'batch file must use CRLF');
  assert.match(launcher, /controller\\bootstrap\.ps1/i);
  assert.match(launcher, /controller\\runtime\\python\\python\.exe/i);
  assert.match(launcher, /WindowsPowerShell\\v1\.0\\powershell\.exe/i);
  assert.match(
    launcher,
    /-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%QIAS_BOOTSTRAP%" -EnsureOnly/i,
  );
  assert.doesNotMatch(launcher, /engines\\/i);

  const officialUrl =
    'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embeddable-amd64.zip';
  const officialSha256 =
    '33b448f95fecb7c6f802157dbd5e6b40a2ad9bfc8b95ca634a06ba4073ad1ac0';
  assert.match(bootstrap, new RegExp(officialUrl.replaceAll('.', '\\.')));
  assert.match(bootstrap, new RegExp(officialSha256));
  assert.match(bootstrap, /\[switch\]\$EnsureOnly/);
  assert.match(bootstrap, /QIAS_CONTROLLER_READY \$Payload/);
  assert.match(bootstrap, /python = \$FullExecutable/);
  assert.match(bootstrap, /Get-FileHash -LiteralPath \$ArchivePath -Algorithm SHA256/);
  assert.match(bootstrap, /Join-Path \$RuntimeParent \('\.python-staging-'/);
  assert.match(bootstrap, /Move-Item -LiteralPath \$ExpandedRoot -Destination \$RuntimeRoot/);
  assert.match(bootstrap, /LICENSE\.txt/);
  assert.match(bootstrap, /sqlite3, ssl, struct, sys/);
  assert.match(bootstrap, /\$MinimumFreeBytes = 128MB/);
  assert.ok(
    bootstrap.indexOf('Get-FileHash') < bootstrap.indexOf('Expand-Archive'),
    'archive hash must be verified before extraction',
  );
  assert.ok(
    bootstrap.indexOf('Test-ControllerPythonRuntime $ExpandedRoot') <
      bootstrap.indexOf('Move-Item -LiteralPath $ExpandedRoot'),
    'expanded runtime must be validated before its atomic rename',
  );
  assert.doesNotMatch(bootstrap, /\bpip(?:\.exe)?\b/i);
  assert.doesNotMatch(bootstrap, /Invoke-Expression|Start-Process/i);
  assert.doesNotMatch(bootstrap, /engines[\\/]|standalone[\\/]server\.py/i);

  assert.match(readme, /不属于 VoxCPM2、ChatTTS、Qwen3-TTS 或 CosyVoice 3/);
  assert.match(readme, new RegExp(officialSha256));
  assert.match(readme, /Python 许可证/);
  assert.match(readme, /同一磁盘/);
});

test('controller bootstrap parses in Windows PowerShell without downloading anything', async (t) => {
  const bootstrap = await readOptionalPackageFile(bootstrapPath, 'utf8');
  if (!bootstrap) {
    t.skip('optional qiansi-audio package is not present in this source checkout');
    return;
  }
  if (process.platform !== 'win32') {
    t.skip('Windows PowerShell parser contract only applies on Windows');
    return;
  }

  const parserScript = [
    '$tokens=$null',
    '$errors=$null',
    '[System.Management.Automation.Language.Parser]::ParseFile($env:QIAS_BOOTSTRAP_TO_PARSE,[ref]$tokens,[ref]$errors) | Out-Null',
    'if($errors.Count -gt 0){$errors | ForEach-Object { Write-Error $_.Message }; exit 1}',
  ].join(';');
  const result = spawnSync(
    `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', parserScript],
    {
      encoding: 'utf8',
      env: { ...process.env, QIAS_BOOTSTRAP_TO_PARSE: bootstrapPath },
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
