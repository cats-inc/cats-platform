<#
.SYNOPSIS
    Install or verify Ollama for Cats.

.DESCRIPTION
    Rewrites the stable Windows Ollama packaged setup knowledge into a
    repo-owned helper with a structured host contract. The helper supports:

    - check-only install and API readiness detection
    - install, upgrade, and force-reinstall flows through the official
      Ollama Windows installer script
    - post-install API verification at http://127.0.0.1:11434
    - explicit manual follow-through when Ollama is installed but not yet
      running in the background

.PARAMETER CheckOnly
    Report Ollama readiness without mutating the local machine.

.PARAMETER Apply
    Install Ollama if it is missing.

.PARAMETER Upgrade
    Re-run the official installer when Ollama is already present.

.PARAMETER Force
    Force a reinstall by re-running the official installer.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER AllowAdmin
    Allow execution under an elevated shell.

.PARAMETER InstallState
    Override installation detection for deterministic tests.

.PARAMETER ApiState
    Override local Ollama API readiness for deterministic tests.

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
  [switch]$Uninstall,
  [switch]$DryRun,
  [switch]$Json,
  [switch]$AllowAdmin,
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$InstallState = 'auto',
  [ValidateSet('auto', 'reachable', 'unreachable')]
  [string]$ApiState = 'auto',
  [string]$DetectedVersion = '',
  [switch]$SkipInstaller
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')
. (Join-Path $PSScriptRoot '_PackagedUninstall.ps1')

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
    Write-Host "API ready: $($Result.apiReady)"
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

function Resolve-OllamaInstallDir {
  return Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
}

function Resolve-OllamaExecutablePath {
  return Join-Path (Resolve-OllamaInstallDir) 'ollama.exe'
}

function Resolve-OllamaAppPath {
  return Join-Path (Resolve-OllamaInstallDir) 'ollama app.exe'
}

function Refresh-UserPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}

function Detect-OllamaInstall {
  $ollamaExecutablePath = Resolve-OllamaExecutablePath

  if ($InstallState -eq 'installed') {
    return [pscustomobject]@{
      installed = $true
      commandPath = $ollamaExecutablePath
      detectedVersion = $DetectedVersion
      appPath = Resolve-OllamaAppPath
    }
  }

  if ($InstallState -eq 'missing') {
    return [pscustomobject]@{
      installed = $false
      commandPath = $ollamaExecutablePath
      detectedVersion = $DetectedVersion
      appPath = Resolve-OllamaAppPath
    }
  }

  Refresh-UserPath
  $command = Get-Command ollama -ErrorAction SilentlyContinue
  $installed = $null -ne $command -or (Test-Path -LiteralPath $ollamaExecutablePath -PathType Leaf)
  $version = $DetectedVersion
  $commandPath = if ($null -ne $command) { $command.Source } else { $ollamaExecutablePath }
  $commandSource = if ($null -ne $command) { $command.Source } else { '' }
  $versionProbePath = Resolve-HiddenVersionProbePath `
    -PreferredPath $commandSource `
    -FallbackPath $ollamaExecutablePath

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
    appPath = Resolve-OllamaAppPath
  }
}

function Test-OllamaApiReady {
  switch ($ApiState) {
    'reachable' {
      return $true
    }
    'unreachable' {
      return $false
    }
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Invoke-OllamaInstaller {
  if ($SkipInstaller) {
    return [pscustomobject]@{
      skipped = $true
    }
  }

  $installScript = Invoke-RestMethod 'https://ollama.com/install.ps1'
  Invoke-Expression $installScript
  return [pscustomobject]@{
    skipped = $false
  }
}

function Try-StartOllamaBackground {
  param(
    [pscustomobject]$Detected
  )

  if ($ApiState -ne 'auto') {
    return $false
  }

  if (Test-Path -LiteralPath $Detected.appPath -PathType Leaf) {
    Start-Process -FilePath $Detected.appPath | Out-Null
    return $true
  }

  return $false
}

function Wait-ForOllamaApi {
  param(
    [int]$TimeoutSeconds = 20
  )

  if ($ApiState -ne 'auto') {
    return Test-OllamaApiReady
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Seconds 2
    if (Test-OllamaApiReady) {
      return $true
    }
  } while ((Get-Date) -lt $deadline)

  return $false
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force -and -not $Uninstall) {
  $CheckOnly = $true
}

if ($Uninstall -and ($CheckOnly -or $Apply -or $Upgrade -or $Force)) {
  throw 'Install-Ollama.ps1 -Uninstall is mutually exclusive with other modes.'
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-Ollama.ps1 accepts either -CheckOnly or one mutation mode.'
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
    -HelperId 'windows-ollama-local-model-installer' `
    -UserBinaryPath (Resolve-OllamaInstallDir) `
    -RedetectCommand { Detect-OllamaInstall } `
    -EmitJson:$Json `
    -DryRun:$DryRun
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin -and -not $AllowAdmin) {
  $result = [pscustomobject]@{
    helper = 'windows-ollama-local-model-installer'
    mode = $executionMode
    status = 'failed'
    installed = $false
    apiReady = $false
    detectedVersion = $null
    commandPath = Resolve-OllamaExecutablePath
    appPath = Resolve-OllamaAppPath
    restartRequired = $false
    plannedActions = @()
    warnings = @(
      'Refusing to run under an elevated shell without -AllowAdmin because Ollama is intended for user-scoped installation.'
    )
    appliedChanges = @()
    manualSteps = @()
    interruptions = @()
  }
  Write-StructuredResult -Result $result -ExitCode 1
}

$detected = Detect-OllamaInstall
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()
$apiReady = [bool]$detected.installed -and (Test-OllamaApiReady)

if (-not $detected.installed) {
  $plannedActions.Add('install_ollama_local_model')
} elseif (-not $apiReady) {
  $plannedActions.Add('start_ollama_local_model')
}

if ($CheckOnly) {
  $status = if (-not $detected.installed) {
    'not_installed'
  } elseif (-not $apiReady) {
    'changes_required'
  } else {
    'ready'
  }

  $result = [pscustomobject]@{
    helper = 'windows-ollama-local-model-installer'
    mode = 'check'
    status = $status
    installed = [bool]$detected.installed
    apiReady = [bool]$apiReady
    detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
    commandPath = $detected.commandPath
    appPath = $detected.appPath
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = @()
    appliedChanges = @()
    manualSteps = if ($status -eq 'changes_required') {
      @(
        'Launch Ollama from the Start menu, or run `ollama app.exe`, then wait for http://127.0.0.1:11434 to respond.',
        'Use `ollama run <model>` after the service is ready to download your first local model.'
      )
    } else {
      @()
    }
    interruptions = @()
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

$shouldInstall = $Force -or $Upgrade -or -not $detected.installed
if ($shouldInstall) {
  $installResult = Invoke-OllamaInstaller
  if ($installResult.skipped) {
    $warnings.Add('Installer invocation was skipped by request.')
  }

  Start-Sleep -Seconds 3
  $detected = Detect-OllamaInstall
  if (-not $detected.installed -and -not $SkipInstaller) {
    throw 'Ollama installation completed but ollama was still not detected.'
  }

  if ($Force) {
    $appliedChanges.Add('reinstall_ollama_local_model')
  } elseif ($Upgrade) {
    $appliedChanges.Add('upgrade_ollama_local_model')
  } else {
    $appliedChanges.Add('install_ollama_local_model')
  }
}

$apiReady = [bool]$detected.installed -and (Test-OllamaApiReady)
if (-not $apiReady -and $detected.installed) {
  $started = Try-StartOllamaBackground -Detected $detected
  if ($started) {
    $apiReady = Wait-ForOllamaApi
  }
}

if (-not $apiReady) {
  $manualSteps.Add('Launch Ollama from the Start menu, or run `ollama app.exe`, then wait for http://127.0.0.1:11434 to respond.')
  $manualSteps.Add('Use `ollama run <model>` after the service is ready to download your first local model.')
}

$result = [pscustomobject]@{
  helper = 'windows-ollama-local-model-installer'
  mode = $executionMode
  status = if ($apiReady) { 'ready' } else { 'changes_required' }
  installed = [bool]$detected.installed
  apiReady = [bool]$apiReady
  detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
  commandPath = $detected.commandPath
  appPath = $detected.appPath
  restartRequired = $false
  plannedActions = @()
  warnings = $warnings.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  manualSteps = $manualSteps.ToArray()
  interruptions = @()
}
Write-StructuredResult -Result $result -ExitCode 0
