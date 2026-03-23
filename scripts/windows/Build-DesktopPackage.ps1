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

.EXAMPLE
    .\scripts\windows\Build-DesktopPackage.ps1 -Platform windows
    Build the staged Windows packaging outputs.
#>
param(
  [ValidateSet('all', 'windows', 'macos', 'linux')]
  [string]$Platform = 'all',
  [string]$OutputDir = ''
)

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

Push-Location $projectRoot
try {
  npm run build | Out-Host
  if ($OutputDir) {
    node .\scripts\package-desktop.mjs --platform $Platform --output-dir $OutputDir
  } else {
    node .\scripts\package-desktop.mjs --platform $Platform
  }
} finally {
  Pop-Location
}
