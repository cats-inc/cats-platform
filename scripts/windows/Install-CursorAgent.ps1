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
  [switch]$Uninstall,
  [switch]$DryRun,
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
. (Join-Path $PSScriptRoot '_NativeInstallerSupport.ps1')
. (Join-Path $PSScriptRoot '_PackagedUninstall.ps1')

function Write-StructuredResult {
  param(
    [pscustomobject]$Result,
    [int]$ExitCode
  )

  if (Get-Variable -Name catsInitialObservation -Scope Script -ErrorAction SilentlyContinue) {
    Add-CatsNativeObservation -Result $Result -Before $script:catsInitialObservation -Attempted ([bool]$script:shouldInstall) -Skipped ([bool]$SkipInstaller)
  }

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
  foreach ($name in @('cursor-agent.exe', 'cursor-agent.cmd', 'agent.exe', 'agent.cmd')) {
    $candidate = Join-Path $env:LOCALAPPDATA "cursor-agent\$name"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  $legacy = Join-Path $env:USERPROFILE '.local\bin\cursor-agent.exe'
  if (Test-Path -LiteralPath $legacy -PathType Leaf) { return $legacy }
  return Join-Path $env:LOCALAPPDATA 'cursor-agent\cursor-agent.cmd'
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
  $commandSource = if ($null -ne $command) { $command.Source } else { '' }
  $versionProbePath = Resolve-HiddenVersionProbePath `
    -PreferredPath $commandSource `
    -FallbackPath $cursorExecutablePath

  if ($installed -and [string]::IsNullOrWhiteSpace($version) -and $versionProbePath) {
    try {
      $version = Get-HiddenCommandText -FileName $versionProbePath -ArgumentList @('--version')
    } catch {
      $version = ''
    }
  }

  if ($installed -and -not $version -and $commandPath -match '\.(cmd|bat)$') {
    $version = Get-CatsShimVersionText -Path $commandPath
  }

  return [pscustomobject]@{
    installed = $installed
    commandPath = $commandPath
    detectedVersion = $version
  }
}

function Test-CursorAuthSatisfied {
  switch ($AuthState) {
    'authenticated' {
      return $true
    }
    'auth_required' {
      return $false
    }
  }

  return -not [string]::IsNullOrWhiteSpace($env:CURSOR_API_KEY)
}

function Invoke-CursorInstaller {
  if ($SkipInstaller) {
    return [pscustomobject]@{
      usedPowerShell51Fallback = $false
      skipped = $true
    }
  }

  $installScript = Invoke-RestMethod 'https://cursor.com/install?win32=true' -TimeoutSec 30 -UseBasicParsing
  $result = Invoke-CatsRemoteInstaller -ScriptText $installScript
  $result | Add-Member -NotePropertyName usedPowerShell51Fallback -NotePropertyValue $true
  return $result

}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force -and -not $Uninstall) {
  $CheckOnly = $true
}

if ($Uninstall -and ($CheckOnly -or $Apply -or $Upgrade -or $Force)) {
  throw 'Install-CursorAgent.ps1 -Uninstall is mutually exclusive with other modes.'
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-CursorAgent.ps1 accepts either -CheckOnly or one mutation mode.'
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

if ($Uninstall) {
  Invoke-PackagedProviderUninstall `
    -HelperId 'windows-cursor-native-installer' `
    -UserBinaryPath (Resolve-CursorExecutablePath) `
    -ExtraUserOwnedPaths @((Join-Path $env:LOCALAPPDATA 'cursor-agent')) `
    -RedetectCommand { Detect-CursorInstall } `
    -EmitJson:$Json `
    -DryRun:$DryRun
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
    interruptions = @()
    usedPowerShell51Fallback = $false
  }
  Write-StructuredResult -Result $result -ExitCode 1
}

$detected = Detect-CursorInstall
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$usedPowerShell51Fallback = $false
$authSatisfied = [bool]$detected.installed -and (Test-CursorAuthSatisfied)

if ($CheckOnly) {
  if (-not $detected.installed) {
    $plannedActions.Add('install_cursor_agent_native')
  }
  $checkInterruptions = [System.Collections.Generic.List[object]]::new()
  if ($detected.installed -and -not $authSatisfied) {
    $checkInterruptions.Add([pscustomobject]@{
        kind = 'auth_required'
        summary = 'Complete the Cursor sign-in flow or configure CURSOR_API_KEY, then rerun the packaged setup check.'
        resumable = $true
        requiresRestart = $false
        requiresElevation = $false
      })
  }

  $result = [pscustomobject]@{
    helper = 'windows-cursor-native-installer'
    mode = 'check'
    status = if ($detected.installed) {
      if ($authSatisfied) { 'ready' } else { 'auth_required' }
    } else {
      'not_installed'
    }
    installed = [bool]$detected.installed
    detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
    commandPath = $detected.commandPath
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = @()
    appliedChanges = @()
    interruptions = $checkInterruptions.ToArray()
    usedPowerShell51Fallback = $false
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

if ($DryRun) {
  Write-CatsNativePreview -Helper 'windows-cursor-native-installer' -Mode $executionMode -Detected $detected -Actions $plannedActions.ToArray() -EmitJson ([bool]$Json)
}

$installFailed = $false
$catsInitialObservation = $detected.PSObject.Copy()
$shouldInstall = $Force -or $Upgrade -or -not $detected.installed
if ($Upgrade -and -not $Force -and $detected.installed -and -not $SkipInstaller -and -not $DryRun) {
  $versionGate = Test-CatsNativeUpgrade -Provider 'cursor' -InstalledVersion $detected.detectedVersion
  $shouldInstall = $versionGate.shouldInstall
  if (-not $versionGate.known) { $warnings.Add('Could not compare the published version; the official installer will verify the update.') }
  if (-not $shouldInstall) { $plannedActions.Clear() }
}
$installFailed = $false
if ($shouldInstall) {
  $installResult = try { Invoke-CursorInstaller } catch { [pscustomobject]@{ skipped = $false; success = $false; stderr = [string]$_.Exception.Message; usedPowerShell51Fallback = $false; usedWingetFallback = $false } }
  if ($installResult.PSObject.Properties['success'] -and -not $installResult.success) {
    $installFailed = $true
    $warnings.Add($installResult.stderr)
  }
  $usedPowerShell51Fallback = [bool]$installResult.usedPowerShell51Fallback
  if ($usedPowerShell51Fallback) {
    $warnings.Add('Cursor installer required the Windows PowerShell 5.1 fallback.')
  }
  if ($installResult.skipped) {
    $warnings.Add('Installer invocation was skipped by request.')
  }

  Start-Sleep -Seconds 2
  $detected = Detect-CursorInstall
  if (-not $detected.installed -and -not $SkipInstaller -and -not $installFailed) {
    $warnings.Add('Cursor Agent installation completed but cursor-agent was still not detected.')
    $installFailed = $true
  }

  if ($Force) {
    $appliedChanges.Add('reinstall_cursor_agent_native')
  } elseif ($Upgrade) {
    $appliedChanges.Add('upgrade_cursor_agent_native')
  } else {
    $appliedChanges.Add('install_cursor_agent_native')
  }
}

$authSatisfied = [bool]$detected.installed -and (Test-CursorAuthSatisfied)
$interruptions = [System.Collections.Generic.List[object]]::new()
if ($shouldInstall) {
  $interruptions.Add([pscustomobject]@{
      kind = 'relaunch_required'
      summary = 'Run Detect Again after the Cursor Agent install step if the command is not visible yet.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}
if (-not $authSatisfied) {
  $interruptions.Add([pscustomobject]@{
      kind = 'auth_required'
      summary = 'Complete the Cursor sign-in flow or configure CURSOR_API_KEY, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}

$result = [pscustomobject]@{
  helper = 'windows-cursor-native-installer'
  mode = $executionMode
  status = if ($installFailed) { 'failed' } elseif ($interruptions.Count -gt 0) { [string]$interruptions[0].kind } else { 'ready' }
  installed = [bool]$detected.installed
  detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
  commandPath = $detected.commandPath
  restartRequired = $false
  plannedActions = @()
  warnings = $warnings.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  interruptions = $interruptions.ToArray()
  usedPowerShell51Fallback = $usedPowerShell51Fallback
}
Write-StructuredResult -Result $result -ExitCode $(if ($installFailed) { 1 } else { 0 })
