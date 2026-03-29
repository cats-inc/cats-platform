<#
.SYNOPSIS
    Install or verify the native Windows Cursor Agent CLI for Cats.

.DESCRIPTION
    Rewrites the stable native Windows Cursor Agent installer knowledge from
    environment-bootstrap into a Cats-owned packaged setup helper. The helper
    supports check-only mode for packaged-host orchestration and can emit
    structured JSON results.

.PARAMETER CheckOnly
    Report native Cursor Agent readiness without mutating the local machine.

.PARAMETER Apply
    Install Cursor Agent if it is missing.

.PARAMETER Upgrade
    Re-run the official installer when Cursor Agent is already present.

.PARAMETER Force
    Force a reinstall by re-running the official installer.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER AllowAdmin
    Allow execution under an elevated shell.

.PARAMETER InstallState
    Override installation detection for deterministic tests.

.PARAMETER DetectedVersion
    Override the detected version for deterministic tests.

.PARAMETER SkipInstaller
    Skip the actual installer invocation. Intended for deterministic tests.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [switch]$AllowAdmin,
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$InstallState = 'auto',
  [string]$DetectedVersion = '',
  [switch]$SkipInstaller
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    Write-Host "Installed: $($Result.installed)"
    if ($Result.detectedVersion) {
      Write-Host "Version: $($Result.detectedVersion)"
    }
    foreach ($action in $Result.plannedActions) {
      Write-Host "Planned action: $action"
    }
    foreach ($warning in $Result.warnings) {
      Write-Host "Warning: $warning"
    }
  }

  exit $ExitCode
}

function Resolve-CursorExecutablePath {
  return Join-Path $env:USERPROFILE '.local\bin\cursor-agent.exe'
}

function Refresh-UserPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}

function Detect-CursorInstall {
  $cursorExecutablePath = Resolve-CursorExecutablePath

  if ($InstallState -eq 'installed') {
    return [pscustomobject]@{
      installed = $true
      commandPath = $cursorExecutablePath
      detectedVersion = $DetectedVersion
    }
  }

  if ($InstallState -eq 'missing') {
    return [pscustomobject]@{
      installed = $false
      commandPath = $cursorExecutablePath
      detectedVersion = $DetectedVersion
    }
  }

  Refresh-UserPath
  $command = Get-Command cursor-agent -ErrorAction SilentlyContinue
  $installed = $null -ne $command -or (Test-Path -LiteralPath $cursorExecutablePath -PathType Leaf)
  $version = $DetectedVersion
  $commandPath = if ($null -ne $command) { $command.Source } else { $cursorExecutablePath }

  if ($installed -and [string]::IsNullOrWhiteSpace($version)) {
    try {
      if ($null -ne $command) {
        $version = (& cursor-agent --version 2>&1 | Out-String).Trim()
      } elseif (Test-Path -LiteralPath $cursorExecutablePath -PathType Leaf) {
        $version = (& $cursorExecutablePath --version 2>&1 | Out-String).Trim()
      }
    } catch {
      $version = ''
    }
  }

  return [pscustomobject]@{
    installed = $installed
    commandPath = $commandPath
    detectedVersion = $version
  }
}

function Invoke-CursorInstaller {
  if ($SkipInstaller) {
    return [pscustomobject]@{
      usedPowerShell51Fallback = $false
      skipped = $true
    }
  }

  try {
    $installScript = Invoke-RestMethod 'https://cursor.com/install?win32=true'
    Invoke-Expression $installScript
    return [pscustomobject]@{
      usedPowerShell51Fallback = $false
      skipped = $false
    }
  } catch {
    $isPowerShell7 = $PSVersionTable.PSVersion.Major -ge 7
    $ps51Path = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (-not $isPowerShell7 -or -not (Test-Path -LiteralPath $ps51Path -PathType Leaf)) {
      throw
    }

    & $ps51Path -NoProfile -ExecutionPolicy Bypass -Command "irm 'https://cursor.com/install?win32=true' | iex"
    if ($LASTEXITCODE -ne 0) {
      throw 'Cursor Agent installer fallback via Windows PowerShell 5.1 failed.'
    }

    return [pscustomobject]@{
      usedPowerShell51Fallback = $true
      skipped = $false
    }
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-CursorAgent.ps1 accepts either -CheckOnly or one mutation mode.'
}

if ($Force -and $Upgrade) {
  $Upgrade = $false
}

$executionMode = if ($CheckOnly) {
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
    helper = 'windows-cursor-native-installer'
    mode = $executionMode
    status = 'failed'
    installed = $false
    detectedVersion = $null
    commandPath = Resolve-CursorExecutablePath
    restartRequired = $false
    plannedActions = @()
    warnings = @(
      'Refusing to run under an elevated shell without -AllowAdmin because Cursor Agent is intended for user-scoped installation.'
    )
    appliedChanges = @()
    usedPowerShell51Fallback = $false
  }
  Write-StructuredResult -Result $result -ExitCode 1
}

$detected = Detect-CursorInstall
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$usedPowerShell51Fallback = $false

if ($CheckOnly) {
  if (-not $detected.installed) {
    $plannedActions.Add('install_cursor_agent_native')
  }

  $result = [pscustomobject]@{
    helper = 'windows-cursor-native-installer'
    mode = 'check'
    status = if ($detected.installed) { 'ready' } else { 'not_installed' }
    installed = [bool]$detected.installed
    detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
    commandPath = $detected.commandPath
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = @()
    appliedChanges = @()
    usedPowerShell51Fallback = $false
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

$shouldInstall = $Force -or $Upgrade -or -not $detected.installed
if ($shouldInstall) {
  $installResult = Invoke-CursorInstaller
  $usedPowerShell51Fallback = [bool]$installResult.usedPowerShell51Fallback
  if ($usedPowerShell51Fallback) {
    $warnings.Add('Cursor installer required the Windows PowerShell 5.1 fallback.')
  }
  if ($installResult.skipped) {
    $warnings.Add('Installer invocation was skipped by request.')
  }

  Start-Sleep -Seconds 2
  $detected = Detect-CursorInstall
  if (-not $detected.installed -and -not $SkipInstaller) {
    throw 'Cursor Agent installation completed but cursor-agent was still not detected.'
  }

  if ($Force) {
    $appliedChanges.Add('reinstall_cursor_agent_native')
  } elseif ($Upgrade) {
    $appliedChanges.Add('upgrade_cursor_agent_native')
  } else {
    $appliedChanges.Add('install_cursor_agent_native')
  }
}

$result = [pscustomobject]@{
  helper = 'windows-cursor-native-installer'
  mode = $executionMode
  status = if ($shouldInstall) { 'restart_required' } else { 'ready' }
  installed = [bool]$detected.installed
  detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
  commandPath = $detected.commandPath
  restartRequired = [bool]$shouldInstall
  plannedActions = @()
  warnings = $warnings.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  usedPowerShell51Fallback = $usedPowerShell51Fallback
}
Write-StructuredResult -Result $result -ExitCode 0
