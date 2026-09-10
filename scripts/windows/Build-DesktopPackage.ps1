<#
.SYNOPSIS
    Build staged desktop packaging outputs for Cats.

.DESCRIPTION
    Runs the cross-platform desktop packaging script for the requested target
    platform and writes staged artifacts plus installer manifests under the
    configured packaging output directory.

.PARAMETER Platform
    Target platform filter: all, windows, macos, or linux.

.PARAMETER OutputDir
    Optional override for the packaging output directory.

.PARAMETER AppsLock
    App selection lock with exact IDs, versions and SHA-256 hashes.

.EXAMPLE
    .\scripts\windows\Build-DesktopPackage.ps1 -Platform windows
    Build the staged Windows packaging outputs.
#>
param(
  [ValidateSet('all', 'windows', 'macos', 'linux')]
  [string]$Platform = 'all',
  [string]$OutputDir = '',
  [string]$AppsLock = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

Push-Location $projectRoot
try {
  npm run build | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE"
  }
  $packageArguments = @('.\scripts\package-desktop.mjs', '--platform', $Platform)
  if ($OutputDir) { $packageArguments += @('--output-dir', $OutputDir) }
  if ($AppsLock) { $packageArguments += @('--apps-lock', $AppsLock) }
  node @packageArguments
  if ($LASTEXITCODE -ne 0) {
    throw "desktop packaging failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
