<#
.SYNOPSIS
    Build a Windows NSIS installer for Cats.

.DESCRIPTION
    Builds cats-runtime, builds Cats, stages bundled sidecar assets, and runs
    electron-builder with the NSIS target so the result can be installed and
    tested on Windows.

.EXAMPLE
    .\scripts\windows\Build-WindowsInstaller.ps1
    Build the Windows NSIS installer into cats/release/.
#>
param()

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

Push-Location $projectRoot
try {
  node .\scripts\build-desktop-installer.mjs --target windows
} finally {
  Pop-Location
}
