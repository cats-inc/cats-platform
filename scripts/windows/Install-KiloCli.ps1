param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Uninstall,
  [switch]$DryRun,
  [switch]$Json,
  [switch]$AllowAdmin,
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$InstallState = 'auto',
  [ValidateSet('auto', 'outdated', 'current')]
  [string]$OutdatedState = 'auto',
  [string]$DetectedVersion = '',
  [switch]$SkipNpmInvocation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_NpmCliInstaller.ps1')

# Note: Kilo Code (npm package @kilocode/cli, command "kilo") is distinct
# from Kiro CLI (separate native MSI helper, see Install-KiroCli.ps1).
Invoke-PackagedNpmCliInstall `
  -HelperId 'windows-kilo-native-installer' `
  -PackageName '@kilocode/cli' `
  -CommandName 'kilo' `
  -DisplayName 'Kilo Code CLI' `
  -CheckOnly:$CheckOnly `
  -Apply:$Apply `
  -Upgrade:$Upgrade `
  -Force:$Force `
  -Uninstall:$Uninstall `
  -DryRun:$DryRun `
  -Json:$Json `
  -AllowAdmin:$AllowAdmin `
  -InstallState $InstallState `
  -OutdatedState $OutdatedState `
  -DetectedVersion $DetectedVersion `
  -SkipNpmInvocation:$SkipNpmInvocation
