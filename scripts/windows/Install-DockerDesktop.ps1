<#
.SYNOPSIS
    Install, repair, or verify Docker Desktop for Cats.

.DESCRIPTION
    Rewrites the stable Windows Docker Desktop packaged setup knowledge into a
    repo-owned helper with a structured host contract. The helper supports:

    - check-only readiness detection for install and warm-state truth
    - install, upgrade, and force-reinstall flows
    - explicit elevation-required reporting before mutation
    - Docker Desktop warm-up follow-through after install or restart

.PARAMETER CheckOnly
    Report Docker Desktop readiness without mutating the local machine.

.PARAMETER Apply
    Install Docker Desktop if it is missing.

.PARAMETER Upgrade
    Upgrade Docker Desktop when it is already installed.

.PARAMETER Force
    Force a reinstall of Docker Desktop.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER DockerState
    Override Docker Desktop detection for deterministic tests.

.PARAMETER DetectedVersion
    Override the detected Docker version for deterministic tests.

.PARAMETER AdminState
    Override elevation detection for deterministic tests.

.PARAMETER SkipInstaller
    Skip the actual installer invocation. Intended for deterministic tests.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [ValidateSet('auto', 'missing', 'installed_engine_stopped', 'ready')]
  [string]$DockerState = 'auto',
  [string]$DetectedVersion = '',
  [ValidateSet('auto', 'elevated', 'unelevated')]
  [string]$AdminState = 'auto',
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
    Write-Host "Engine ready: $($Result.engineReady)"
    if ($Result.detectedVersion) {
      Write-Host "Version: $($Result.detectedVersion)"
    }
    foreach ($action in $Result.plannedActions) {
      Write-Host "Planned action: $action"
    }
    foreach ($change in $Result.appliedChanges) {
      Write-Host "Applied change: $change"
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

function Refresh-Path {
  $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $env:Path = "$userPath;$machinePath"
}

function Resolve-DockerDesktopPath {
  return 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
}

function Get-DockerInstallerDownloadUrl {
  $arch = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
  } else {
    $env:PROCESSOR_ARCHITECTURE
  }

  if ($arch -eq 'ARM64') {
    return 'https://desktop.docker.com/win/main/arm64/Docker%20Desktop%20Installer.exe'
  }

  return 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
}

function Test-IsAdmin {
  switch ($AdminState) {
    'elevated' {
      return $true
    }
    'unelevated' {
      return $false
    }
  }

  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-DockerReadiness {
  $desktopPath = Resolve-DockerDesktopPath

  switch ($DockerState) {
    'missing' {
      return [pscustomobject]@{
        installed = $false
        engineReady = $false
        detectedVersion = if ($DetectedVersion) { $DetectedVersion } else { $null }
        dockerCliPath = $null
        desktopPath = $desktopPath
      }
    }
    'installed_engine_stopped' {
      return [pscustomobject]@{
        installed = $true
        engineReady = $false
        detectedVersion = if ($DetectedVersion) { $DetectedVersion } else { 'Docker Desktop' }
        dockerCliPath = 'docker'
        desktopPath = $desktopPath
      }
    }
    'ready' {
      return [pscustomobject]@{
        installed = $true
        engineReady = $true
        detectedVersion = if ($DetectedVersion) { $DetectedVersion } else { 'Docker Desktop' }
        dockerCliPath = 'docker'
        desktopPath = $desktopPath
      }
    }
  }

  Refresh-Path
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  $dockerCliPath = if ($null -ne $dockerCommand) { $dockerCommand.Source } else { $null }
  $installed = $null -ne $dockerCommand -or (Test-Path -LiteralPath $desktopPath -PathType Leaf)
  $version = if ($DetectedVersion) { $DetectedVersion } else { $null }
  $engineReady = $false

  if ($installed -and -not $version) {
    try {
      if ($null -ne $dockerCommand) {
        $version = (& docker --version 2>&1 | Out-String).Trim()
      }
    } catch {
      $version = $null
    }
  }

  if ($installed -and $null -ne $dockerCommand) {
    try {
      $null = (& docker info 2>&1 | Out-String)
      $engineReady = ($LASTEXITCODE -eq 0)
    } catch {
      $engineReady = $false
    }
  }

  return [pscustomobject]@{
    installed = $installed
    engineReady = $engineReady
    detectedVersion = $version
    dockerCliPath = $dockerCliPath
    desktopPath = $desktopPath
  }
}

function Try-StartDockerDesktop {
  param(
    [pscustomobject]$Detected
  )

  if ($DockerState -ne 'auto') {
    return $false
  }

  try {
    if ($Detected.dockerCliPath) {
      & docker desktop start 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        return $true
      }
    }
  } catch {
  }

  if (Test-Path -LiteralPath $Detected.desktopPath -PathType Leaf) {
    Start-Process -FilePath $Detected.desktopPath | Out-Null
    return $true
  }

  return $false
}

function Wait-ForDockerEngineReady {
  param(
    [int]$TimeoutSeconds = 45
  )

  if ($DockerState -ne 'auto') {
    return Get-DockerReadiness
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Seconds 3
    $detected = Get-DockerReadiness
    if ($detected.engineReady) {
      return $detected
    }
  } while ((Get-Date) -lt $deadline)

  return Get-DockerReadiness
}

function Invoke-DockerDesktopInstaller {
  param(
    [ValidateSet('install', 'upgrade', 'reinstall')]
    [string]$Mode
  )

  if ($SkipInstaller) {
    return [pscustomobject]@{
      skipped = $true
      usedWinget = $false
      usedDirectDownload = $false
    }
  }

  Refresh-Path
  $wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
  if ($null -ne $wingetCommand) {
    $wingetArgs = if ($Mode -eq 'upgrade') {
      @(
        'upgrade',
        '--id', 'Docker.DockerDesktop',
        '-e',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements'
      )
    } else {
      @(
        'install',
        '--id', 'Docker.DockerDesktop',
        '-e',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements'
      )
    }
    if ($Mode -eq 'reinstall') {
      $wingetArgs += '--force'
    }

    & winget @wingetArgs | Out-Null
    $wingetExitCode = $LASTEXITCODE
    if ($wingetExitCode -eq 0 -or $wingetExitCode -eq -1978335189) {
      return [pscustomobject]@{
        skipped = $false
        usedWinget = $true
        usedDirectDownload = $false
      }
    }
  }

  $downloadUrl = Get-DockerInstallerDownloadUrl
  $installerPath = Join-Path $env:TEMP 'CatsDockerDesktopInstaller.exe'
  Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
  try {
    $installArgs = @('install', '--quiet')
    if ($Mode -eq 'reinstall') {
      $installArgs += '--accept-license'
    }

    $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw "Docker Desktop installer failed with exit code $($process.ExitCode)."
    }
  } finally {
    Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
  }

  return [pscustomobject]@{
    skipped = $false
    usedWinget = $false
    usedDirectDownload = $true
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-DockerDesktop.ps1 accepts either -CheckOnly or one mutation mode.'
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

$detected = Get-DockerReadiness
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()

if (-not $detected.installed) {
  $plannedActions.Add('install_docker_desktop')
} elseif (-not $detected.engineReady) {
  $plannedActions.Add('start_docker_desktop')
}

if ($CheckOnly) {
  $interruptions = if ($detected.installed -and -not $detected.engineReady) {
    @([pscustomobject]@{
        kind = 'docker_warm_up_required'
        summary = 'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.'
        resumable = $true
        requiresRestart = $false
        requiresElevation = $false
      })
  } else {
    @()
  }

  $result = [pscustomobject]@{
    helper = 'windows-docker-desktop-installer'
    mode = 'check'
    status = if (-not $detected.installed) {
      'not_installed'
    } elseif (-not $detected.engineReady) {
      'docker_warm_up_required'
    } else {
      'ready'
    }
    installed = [bool]$detected.installed
    engineReady = [bool]$detected.engineReady
    detectedVersion = $detected.detectedVersion
    dockerCliPath = $detected.dockerCliPath
    desktopPath = $detected.desktopPath
    requiresElevation = $false
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = @()
    appliedChanges = @()
    manualSteps = if ($detected.installed -and -not $detected.engineReady) {
      @('Start Docker Desktop and wait for the engine to become ready.')
    } else {
      @()
    }
    interruptions = $interruptions
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

$shouldInstall = $Force -or $Upgrade -or -not $detected.installed
if ($shouldInstall -and -not (Test-IsAdmin)) {
  $requestedAction = if ($Force) {
    'reinstall Docker Desktop'
  } elseif ($Upgrade) {
    'upgrade Docker Desktop'
  } else {
    'install Docker Desktop'
  }

  $result = [pscustomobject]@{
    helper = 'windows-docker-desktop-installer'
    mode = $executionMode
    status = 'elevation_required'
    installed = [bool]$detected.installed
    engineReady = [bool]$detected.engineReady
    detectedVersion = $detected.detectedVersion
    dockerCliPath = $detected.dockerCliPath
    desktopPath = $detected.desktopPath
    requiresElevation = $true
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = @()
    appliedChanges = @()
    manualSteps = @("Resume packaged setup and accept the Windows UAC prompt to $requestedAction.")
    interruptions = @([pscustomobject]@{
        kind = 'elevation_required'
        summary = "Docker Desktop mutation requires elevation. Resume packaged setup and accept the Windows UAC prompt to $requestedAction."
        resumable = $true
        requiresRestart = $false
        requiresElevation = $true
      })
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

if ($shouldInstall) {
  $installMode = if ($Force) {
    'reinstall'
  } elseif ($Upgrade) {
    'upgrade'
  } else {
    'install'
  }
  $installResult = Invoke-DockerDesktopInstaller -Mode $installMode
  if ($installResult.skipped) {
    $warnings.Add('Installer invocation was skipped by request.')
  } elseif ($installResult.usedWinget) {
    $warnings.Add('Docker Desktop install used winget.')
  } elseif ($installResult.usedDirectDownload) {
    $warnings.Add('Docker Desktop install fell back to the direct Docker download URL.')
  }

  Start-Sleep -Seconds 3
  $detected = Get-DockerReadiness
  if (-not $detected.installed -and -not $SkipInstaller) {
    throw 'Docker Desktop installation completed but docker was still not detected.'
  }

  if ($Force) {
    $appliedChanges.Add('reinstall_docker_desktop')
  } elseif ($Upgrade) {
    $appliedChanges.Add('upgrade_docker_desktop')
  } else {
    $appliedChanges.Add('install_docker_desktop')
  }
}

if ($detected.installed -and -not $detected.engineReady) {
  $started = Try-StartDockerDesktop -Detected $detected
  if ($started) {
    $detected = Wait-ForDockerEngineReady
  }
}

$interruptions = [System.Collections.Generic.List[object]]::new()
if (-not $detected.engineReady) {
  $manualSteps.Add('Start Docker Desktop and wait for the engine to become ready.')
  $manualSteps.Add('Accept the Docker Desktop terms on first launch if Docker prompts for them.')
  $interruptions.Add([pscustomobject]@{
      kind = 'docker_warm_up_required'
      summary = 'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}

$result = [pscustomobject]@{
  helper = 'windows-docker-desktop-installer'
  mode = $executionMode
  status = if ($interruptions.Count -gt 0) { [string]$interruptions[0].kind } else { 'ready' }
  installed = [bool]$detected.installed
  engineReady = [bool]$detected.engineReady
  detectedVersion = $detected.detectedVersion
  dockerCliPath = $detected.dockerCliPath
  desktopPath = $detected.desktopPath
  requiresElevation = $shouldInstall
  restartRequired = $false
  plannedActions = @()
  warnings = $warnings.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  manualSteps = $manualSteps.ToArray()
  interruptions = $interruptions.ToArray()
}
Write-StructuredResult -Result $result -ExitCode 0
