param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$NodeVersion = '22.23.2'
$MinimumVersion = [Version]'22.12.0'
$RuntimeRoot = Join-Path ([IO.Path]::GetFullPath($ProjectRoot)) 'tools\runtime\node\windows'
$RuntimeParent = Split-Path -Parent $RuntimeRoot
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("qiansi-canvas-node-" + [Guid]::NewGuid().ToString('N'))

function Test-PortableNodeRuntime([string]$Root) {
  $NodeExecutable = Join-Path $Root 'node.exe'
  $NpmCommand = Join-Path $Root 'npm.cmd'
  if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) { return $false }
  if (-not (Test-Path -LiteralPath $NpmCommand -PathType Leaf)) { return $false }

  try {
    $DetectedVersion = (& $NodeExecutable -p "process.versions.node" 2>$null).Trim()
    return ([Version]$DetectedVersion -ge $MinimumVersion)
  } catch {
    return $false
  }
}

try {
  if (Test-PortableNodeRuntime $RuntimeRoot) {
    Write-Output $RuntimeRoot
    exit 0
  }

  if (Test-Path -LiteralPath $RuntimeRoot) {
    throw "The managed Node.js directory already exists but is incomplete: $RuntimeRoot. Remove only this runtime directory, then run the installer again."
  }

  $Architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  switch ($Architecture) {
    'X64' { $NodeArchitecture = 'x64' }
    'Arm64' { $NodeArchitecture = 'arm64' }
    default { throw "Unsupported Windows architecture: $Architecture. Qiansi-Canvas supports x64 and ARM64." }
  }

  $ArchiveBaseName = "node-v$NodeVersion-win-$NodeArchitecture"
  $ArchiveName = "$ArchiveBaseName.zip"
  $ReleaseRoot = "https://nodejs.org/download/release/v$NodeVersion"
  $ArchiveUrl = "$ReleaseRoot/$ArchiveName"
  $ChecksumsUrl = "$ReleaseRoot/SHASUMS256.txt"
  $ArchivePath = Join-Path $TempRoot $ArchiveName
  $ChecksumsPath = Join-Path $TempRoot 'SHASUMS256.txt'

  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  Write-Host "Downloading the official Node.js $NodeVersion portable runtime..."
  Invoke-WebRequest -UseBasicParsing -Uri $ChecksumsUrl -OutFile $ChecksumsPath
  Invoke-WebRequest -UseBasicParsing -Uri $ArchiveUrl -OutFile $ArchivePath

  $EscapedArchiveName = [Regex]::Escape($ArchiveName)
  $ChecksumLine = Get-Content -LiteralPath $ChecksumsPath | Where-Object {
    $_ -match "^([0-9a-fA-F]{64})\s+$EscapedArchiveName$"
  } | Select-Object -First 1
  if (-not $ChecksumLine) {
    throw "The official checksum list does not contain $ArchiveName."
  }

  $ExpectedHash = ($ChecksumLine -split '\s+')[0].ToLowerInvariant()
  $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ActualHash -ne $ExpectedHash) {
    throw "Node.js archive checksum verification failed. Expected $ExpectedHash but received $ActualHash."
  }

  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $TempRoot -Force
  $ExpandedRoot = Join-Path $TempRoot $ArchiveBaseName
  if (-not (Test-PortableNodeRuntime $ExpandedRoot)) {
    throw 'The downloaded Node.js runtime is incomplete or below the required version.'
  }

  New-Item -ItemType Directory -Path $RuntimeParent -Force | Out-Null
  Move-Item -LiteralPath $ExpandedRoot -Destination $RuntimeRoot
  if (-not (Test-PortableNodeRuntime $RuntimeRoot)) {
    throw 'The installed project-local Node.js runtime failed its final verification.'
  }

  Write-Output $RuntimeRoot
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
