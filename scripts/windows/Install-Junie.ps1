<#
.SYNOPSIS
    Install or verify the native Windows Junie CLI for Cats.

.DESCRIPTION
    Rewrites the stable native Windows Junie installer knowledge from
    environment-bootstrap into a Cats-owned packaged setup helper. The helper
    supports check-only mode for packaged-host orchestration and emits a
    structured JSON result.

.PARAMETER CheckOnly
    Report native Junie CLI readiness without mutating the local machine.

.PARAMETER Apply
    Install Junie CLI if it is missing.

.PARAMETER Upgrade
    Re-run the official installer when Junie CLI is already present.

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

.PARAMETER AuthState
    Override post-install authentication detection for deterministic tests.

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
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$AuthState = 'auto',
  [switch]$SkipInstaller
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
    foreach ($step in $Result.manualSteps) {
      Write-Host "Manual step: $step"
    }
  }

  exit $ExitCode
}

function Resolve-JunieExecutablePath {
  return Join-Path $env:USERPROFILE '.local\bin\junie.exe'
}

function Refresh-UserPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}

function Detect-JunieInstall {
  $junieExecutablePath = Resolve-JunieExecutablePath

  if ($InstallState -eq 'installed') {
    return [pscustomobject]@{
      installed = $true
      commandPath = $junieExecutablePath
      detectedVersion = $DetectedVersion
    }
  }

  if ($InstallState -eq 'missing') {
    return [pscustomobject]@{
      installed = $false
      commandPath = $junieExecutablePath
      detectedVersion = $DetectedVersion
    }
  }

  Refresh-UserPath
  $command = Get-Command junie -ErrorAction SilentlyContinue
  $installed = $null -ne $command -or (Test-Path -LiteralPath $junieExecutablePath -PathType Leaf)
  $version = $DetectedVersion
  $commandPath = if ($null -ne $command) { $command.Source } else { $junieExecutablePath }
  $commandSource = if ($null -ne $command) { $command.Source } else { '' }
  $versionProbePath = Resolve-HiddenVersionProbePath `
    -PreferredPath $commandSource `
    -FallbackPath $junieExecutablePath

  if ($installed -and [string]::IsNullOrWhiteSpace($version) -and $versionProbePath) {
    try {
      $version = Get-HiddenCommandText -FileName $versionProbePath -ArgumentList @('--version')
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

function Test-JunieAuthSatisfied {
  switch ($AuthState) {
    'authenticated' {
      return $true
    }
    'auth_required' {
      return $false
    }
  }

  return -not [string]::IsNullOrWhiteSpace($env:JUNIE_API_KEY) -or
    -not [string]::IsNullOrWhiteSpace($env:ANTHROPIC_API_KEY) -or
    -not [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)
}

function Invoke-JunieInstaller {
  if ($SkipInstaller) {
    return [pscustomobject]@{
      skipped = $true
    }
  }

  $installScript = Invoke-RestMethod 'https://junie.jetbrains.com/install.ps1'
  Invoke-Expression $installScript
  return [pscustomobject]@{
    skipped = $false
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-Junie.ps1 accepts either -CheckOnly or one mutation mode.'
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
    helper = 'windows-junie-native-installer'
    mode = $executionMode
    status = 'failed'
    installed = $false
    detectedVersion = $null
    commandPath = Resolve-JunieExecutablePath
    restartRequired = $false
    plannedActions = @()
    warnings = @(
      'Refusing to run under an elevated shell without -AllowAdmin because Junie CLI is intended for user-scoped installation.'
    )
    appliedChanges = @()
    manualSteps = @()
    interruptions = @()
  }
  Write-StructuredResult -Result $result -ExitCode 1
}

$detected = Detect-JunieInstall
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()
$authSatisfied = [bool]$detected.installed -and (Test-JunieAuthSatisfied)

if (-not $detected.installed) {
  $plannedActions.Add('install_junie_native')
}

if ($CheckOnly) {
  $status = if ($detected.installed) {
    if ($authSatisfied) { 'ready' } else { 'auth_required' }
  } else {
    'not_installed'
  }

  $result = [pscustomobject]@{
    helper = 'windows-junie-native-installer'
    mode = 'check'
    status = $status
    installed = [bool]$detected.installed
    detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
    commandPath = $detected.commandPath
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = @()
    appliedChanges = @()
    manualSteps = if ($status -eq 'auth_required') {
      @('Sign in with a JetBrains account, or set JUNIE_API_KEY before first use.')
    } else {
      @()
    }
    interruptions = if ($status -eq 'auth_required') {
      @([pscustomobject]@{
          kind = 'auth_required'
          summary = 'Complete the Junie sign-in flow or set JUNIE_API_KEY, then rerun the packaged setup check.'
          resumable = $true
          requiresRestart = $false
          requiresElevation = $false
        })
    } else {
      @()
    }
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

$shouldInstall = $Force -or $Upgrade -or -not $detected.installed
if ($shouldInstall) {
  $installResult = Invoke-JunieInstaller
  if ($installResult.skipped) {
    $warnings.Add('Installer invocation was skipped by request.')
  }

  Start-Sleep -Seconds 2
  $detected = Detect-JunieInstall
  if (-not $detected.installed -and -not $SkipInstaller) {
    throw 'Junie installation completed but junie was still not detected.'
  }

  if ($Force) {
    $appliedChanges.Add('reinstall_junie_native')
  } elseif ($Upgrade) {
    $appliedChanges.Add('upgrade_junie_native')
  } else {
    $appliedChanges.Add('install_junie_native')
  }
}

$manualSteps.Add('Sign in with a JetBrains account, or set JUNIE_API_KEY before first use.')
$authSatisfied = [bool]$detected.installed -and (Test-JunieAuthSatisfied)
$interruptions = [System.Collections.Generic.List[object]]::new()
if ($shouldInstall) {
  $interruptions.Add([pscustomobject]@{
      kind = 'relaunch_required'
      summary = 'Relaunch Cats Desktop Host after the Junie install step, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}
if (-not $authSatisfied) {
  $interruptions.Add([pscustomobject]@{
      kind = 'auth_required'
      summary = 'Complete the Junie sign-in flow or set JUNIE_API_KEY, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}

$result = [pscustomobject]@{
  helper = 'windows-junie-native-installer'
  mode = $executionMode
  status = if ($interruptions.Count -gt 0) { [string]$interruptions[0].kind } else { 'ready' }
  installed = [bool]$detected.installed
  detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
  commandPath = $detected.commandPath
  restartRequired = $false
  plannedActions = @()
  warnings = $warnings.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  manualSteps = $manualSteps.ToArray()
  interruptions = $interruptions.ToArray()
}
Write-StructuredResult -Result $result -ExitCode 0
