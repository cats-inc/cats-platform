<#
.SYNOPSIS
    Install or verify the Windows npm-global AI CLI pack for Cats.

.DESCRIPTION
    Rewrites the stable npm-global AI CLI pack knowledge from
    environment-bootstrap into a Cats-owned helper. The script can run in
    check-only mode for packaged-host orchestration and emits structured JSON
    results when requested.

.PARAMETER CheckOnly
    Report package readiness without mutating the local environment.

.PARAMETER Apply
    Install missing packages.

.PARAMETER Upgrade
    Install missing packages and upgrade outdated ones.

.PARAMETER Force
    Reinstall every package in the pack.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER AllowAdmin
    Allow execution under an elevated shell.

.PARAMETER SkipNodeCheck
    Skip probing node/npm binaries. Useful for deterministic tests.

.PARAMETER SkipPrefixHelper
    Skip invoking the sibling npm prefix helper.

.PARAMETER PrefixHelperPath
    Override the path to the npm prefix prerequisite helper.

.PARAMETER InstalledPackagesJson
    Override the installed package set as a JSON array for deterministic tests.

.PARAMETER OutdatedPackagesJson
    Override the outdated package set as a JSON array for deterministic tests.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Uninstall,
  [switch]$DryRun,
  [switch]$Json,
  [switch]$AllowAdmin,
  [switch]$SkipNodeCheck,
  [switch]$SkipPrefixHelper,
  [string]$PrefixHelperPath = '',
  [string]$InstalledPackagesJson = '',
  [string]$OutdatedPackagesJson = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')

function Write-StructuredResult {
  param(
    [pscustomobject]$Result,
    [int]$ExitCode
  )

  if ($Json) {
    $Result | ConvertTo-Json -Depth 10
  } else {
    Write-Host "Mode: $($Result.mode)"
    Write-Host "Status: $($Result.status)"
    Write-Host "Prefix helper status: $($Result.prefixHelper.status)"
    Write-Host "Restart required: $($Result.restartRequired)"
    foreach ($package in $Result.packages) {
      Write-Host "$($package.packageName): $($package.plannedAction)"
    }
  }

  exit $ExitCode
}

function Parse-JsonArray {
  param(
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return @()
  }

  try {
    $parsed = $Value | ConvertFrom-Json
    if ($parsed -is [System.Array]) {
      return @($parsed)
    }
    return @($parsed)
  } catch {
    $trimmed = $Value.Trim()
    if ($trimmed.StartsWith('[') -and $trimmed.EndsWith(']')) {
      $trimmed = $trimmed.Substring(1, $trimmed.Length - 2)
    }
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      return @()
    }

    $segments = $trimmed.Split(',', [System.StringSplitOptions]::RemoveEmptyEntries)
    $normalizedSegments = $segments | ForEach-Object { $_.Trim().Trim('"') }
    return @($normalizedSegments | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  }
}

function Get-InstalledPackages {
  if (-not [string]::IsNullOrWhiteSpace($InstalledPackagesJson)) {
    return Parse-JsonArray -Value $InstalledPackagesJson
  }

  $listRaw = (& npm list -g --depth=0 --json 2>$null) | Out-String
  if ([string]::IsNullOrWhiteSpace($listRaw)) {
    return @()
  }

  $listData = $listRaw | ConvertFrom-Json
  if ($null -eq $listData.dependencies) {
    return @()
  }

  return @($listData.dependencies.PSObject.Properties.Name)
}

function Get-OutdatedPackages {
  if (-not [string]::IsNullOrWhiteSpace($OutdatedPackagesJson)) {
    return Parse-JsonArray -Value $OutdatedPackagesJson
  }

  if (-not $Upgrade) {
    return @()
  }

  $outdatedRaw = (& npm outdated -g --json 2>$null) | Out-String
  if ([string]::IsNullOrWhiteSpace($outdatedRaw)) {
    return @()
  }

  $outdatedData = $outdatedRaw | ConvertFrom-Json
  return @($outdatedData.PSObject.Properties.Name)
}

function Invoke-PrefixHelper {
  param(
    [ValidateSet('check', 'apply')]
    [string]$Mode
  )

  if ($SkipPrefixHelper) {
    return [pscustomobject]@{
      helper = 'windows-npm-prefix-helper'
      mode = $Mode
      status = 'skipped'
      restartRequired = $false
      plannedChanges = @()
      appliedChanges = @()
      warnings = @()
    }
  }

  $resolvedPrefixHelperPath = if ([string]::IsNullOrWhiteSpace($PrefixHelperPath)) {
    Join-Path $PSScriptRoot 'Setup-NodeGlobalPrefix.ps1'
  } else {
    $PrefixHelperPath
  }

  if (-not (Test-Path -LiteralPath $resolvedPrefixHelperPath -PathType Leaf)) {
    throw "Missing npm prefix helper at $resolvedPrefixHelperPath"
  }

  $arguments = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $resolvedPrefixHelperPath,
    '-Json'
  )
  if ($Mode -eq 'check') {
    $arguments += '-CheckOnly'
  } else {
    $arguments += '-Apply'
  }
  if ($AllowAdmin) {
    $arguments += '-AllowAdmin'
  }
  if ($SkipNodeCheck) {
    $arguments += '-SkipNodeCheck'
  }

  $allArgs = @('-NoProfile') + $arguments
  $result = Invoke-HiddenCommand -FileName 'powershell.exe' -ArgumentList $allArgs
  $helperResult = $result.Output | ConvertFrom-Json
  if ($result.ExitCode -ne 0 -and $helperResult.status -eq 'failed') {
    throw "npm prefix helper failed with status $($helperResult.status)"
  }

  return $helperResult
}

$packageCatalog = @(
  @{ id = 'codex'; packageName = '@openai/codex'; label = 'Codex' },
  @{ id = 'gemini'; packageName = '@google/gemini-cli'; label = 'Gemini CLI' },
  @{ id = 'copilot'; packageName = '@github/copilot'; label = 'GitHub Copilot' },
  @{ id = 'opencode'; packageName = 'opencode-ai'; label = 'OpenCode' },
  @{ id = 'kilo'; packageName = '@kilocode/cli'; label = 'Kilo' },
  @{ id = 'auggie'; packageName = '@augmentcode/auggie'; label = 'Auggie' },
  @{ id = 'pi'; packageName = '@mariozechner/pi-coding-agent'; label = 'Pi' }
)

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force -and -not $Uninstall) {
  $CheckOnly = $true
}

if ($Uninstall -and ($CheckOnly -or $Apply -or $Upgrade -or $Force)) {
  throw 'Install-NodeCliPack.ps1 -Uninstall is mutually exclusive with other modes.'
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-NodeCliPack.ps1 accepts either -CheckOnly or one mutation mode.'
}

if ($Force -and $Upgrade) {
  $Upgrade = $false
}

$executionMode = if ($Uninstall) {
  'uninstall'
} elseif ($CheckOnly) {
  'check'
} elseif ($Force) {
  'force'
} elseif ($Upgrade) {
  'upgrade'
} else {
  'apply'
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin -and -not $AllowAdmin) {
  $result = [pscustomobject]@{
    helper = 'windows-node-cli-pack'
    mode = $executionMode
    status = 'failed'
    restartRequired = $false
    prefixHelper = $null
    nodeVersion = $null
    npmVersion = $null
    packages = @()
    warnings = @(
      'Refusing to run under an elevated shell without -AllowAdmin because the native CLI pack is intended for user-scoped setup.'
    )
    appliedChanges = @()
  }
  Write-StructuredResult -Result $result -ExitCode 1
}

$nodeVersion = $null
$npmVersion = $null
if (-not $SkipNodeCheck) {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'Machine')

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
  if ($null -eq $nodeCommand -or $null -eq $npmCommand) {
    $result = [pscustomobject]@{
      helper = 'windows-node-cli-pack'
      mode = $executionMode
      status = 'not_installed'
      restartRequired = $false
      prefixHelper = $null
      nodeVersion = $null
      npmVersion = $null
      packages = @()
      warnings = @('Node.js and npm must be installed before the native CLI pack can be installed.')
      appliedChanges = @()
    }
    Write-StructuredResult -Result $result -ExitCode $(if ($CheckOnly -or $Uninstall) { 0 } else { 1 })
  }

  $nodeVersion = (& node -v).Trim()
  $npmVersion = (& npm -v).Trim()
}

$prefixHelperResult = Invoke-PrefixHelper -Mode 'check'
if (-not $CheckOnly -and -not $Uninstall -and $prefixHelperResult.status -eq 'changes_required') {
  $prefixHelperResult = Invoke-PrefixHelper -Mode 'apply'
}

$installedPackages = Get-InstalledPackages
$outdatedPackages = Get-OutdatedPackages

if ($Uninstall) {
  $uninstallPlanned = [System.Collections.Generic.List[string]]::new()
  $uninstallApplied = [System.Collections.Generic.List[string]]::new()
  $uninstallWarnings = [System.Collections.Generic.List[string]]::new()

  $uninstallPackages = foreach ($package in $packageCatalog) {
    $isInstalled = $installedPackages -contains $package.packageName
    $packageStatus = 'not_installed'
    $plannedAction = 'skip'
    if ($isInstalled) {
      $plannedAction = 'uninstall'
      $uninstallPlanned.Add("$($package.packageName): uninstall") | Out-Null
      if ($DryRun) {
        $packageStatus = 'preview'
      } else {
        try {
          & npm 'uninstall' '-g' $package.packageName | Out-Null
          if ($LASTEXITCODE -eq 0) {
            $uninstallApplied.Add("$($package.packageName): uninstalled") | Out-Null
            $packageStatus = 'uninstalled'
          } else {
            $uninstallWarnings.Add("$($package.packageName): uninstall_failed_exit_$LASTEXITCODE") | Out-Null
            $packageStatus = 'failed'
          }
        } catch {
          $uninstallWarnings.Add("$($package.packageName): uninstall_failed") | Out-Null
          $packageStatus = 'failed'
        }
      }
    }

    [pscustomobject]@{
      id = $package.id
      label = $package.label
      packageName = $package.packageName
      installed = $isInstalled
      outdated = $false
      plannedAction = $plannedAction
      status = $packageStatus
    }
  }

  $uninstallStatus = if ($DryRun) {
    'preview'
  } elseif ($uninstallPlanned.Count -eq 0) {
    'not_installed'
  } elseif ($uninstallWarnings.Count -gt 0) {
    'changes_required'
  } else {
    'uninstalled'
  }

  $result = [pscustomobject]@{
    helper = 'windows-node-cli-pack'
    mode = 'uninstall'
    status = $uninstallStatus
    restartRequired = $false
    prefixHelper = $null
    nodeVersion = $nodeVersion
    npmVersion = $npmVersion
    packages = $uninstallPackages
    plannedActions = $uninstallPlanned.ToArray()
    warnings = $uninstallWarnings.ToArray()
    appliedChanges = $uninstallApplied.ToArray()
    manualSteps = @()
    interruptions = @()
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

$plannedPackageChanges = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()

$packages = foreach ($package in $packageCatalog) {
  $isInstalled = $installedPackages -contains $package.packageName
  $isOutdated = $outdatedPackages -contains $package.packageName
  $plannedAction = if ($Force) {
    'reinstall'
  } elseif ($Upgrade -and $isInstalled -and $isOutdated) {
    'upgrade'
  } elseif ($isInstalled) {
    'skip'
  } else {
    'install'
  }

  if ($plannedAction -ne 'skip') {
    $plannedPackageChanges.Add("$($package.packageName): $plannedAction")
  }

  [pscustomobject]@{
    id = $package.id
    label = $package.label
    packageName = $package.packageName
    installed = $isInstalled
    outdated = $isOutdated
    plannedAction = $plannedAction
  }
}

if ($CheckOnly) {
  $status = if ($prefixHelperResult.status -eq 'failed') {
    'failed'
  } elseif ($plannedPackageChanges.Count -gt 0 -or $prefixHelperResult.status -eq 'changes_required') {
    'changes_required'
  } else {
    'ready'
  }

  $result = [pscustomobject]@{
    helper = 'windows-node-cli-pack'
    mode = 'check'
    status = $status
    restartRequired = [bool]$prefixHelperResult.restartRequired
    prefixHelper = $prefixHelperResult
    nodeVersion = $nodeVersion
    npmVersion = $npmVersion
    packages = $packages
    warnings = @()
    appliedChanges = @()
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

foreach ($package in $packages) {
  if ($package.plannedAction -eq 'skip') {
    continue
  }

  $arguments = @('install', '-g')
  if ($package.plannedAction -eq 'upgrade') {
    $arguments += "$($package.packageName)@latest"
  } else {
    $arguments += $package.packageName
  }
  if ($package.plannedAction -eq 'reinstall') {
    $arguments += '--force'
  }

  & npm @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to $($package.plannedAction) $($package.packageName)"
  }
  $appliedChanges.Add("$($package.packageName): $($package.plannedAction)")
}

$restartRequired = [bool]$prefixHelperResult.restartRequired
$result = [pscustomobject]@{
  helper = 'windows-node-cli-pack'
  mode = $executionMode
  status = if ($restartRequired) { 'restart_required' } else { 'ready' }
  restartRequired = $restartRequired
  prefixHelper = $prefixHelperResult
  nodeVersion = $nodeVersion
  npmVersion = $npmVersion
  packages = $packages
  warnings = @()
  appliedChanges = $appliedChanges.ToArray()
}
Write-StructuredResult -Result $result -ExitCode 0
