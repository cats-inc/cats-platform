<#
.SYNOPSIS
    Validate a test-installed Cats Windows package.

.DESCRIPTION
    Checks that the installed Electron host, bundled Cats sidecar, bundled
    cats-runtime sidecar, and packaged installer manifest are all present. By
    default it then launches the installed app, waits for the desktop-host
    state file to be refreshed, and validates the persisted readiness snapshot.

.PARAMETER InstallRoot
    The installed Cats directory. Defaults to the NSIS per-user install path.

.PARAMETER HostStatePath
    The persisted desktop-host state file written by the installed app.

.PARAMETER TimeoutSeconds
    Maximum time to wait for the installed app to refresh the host-state file.

.PARAMETER SkipLaunch
    Only validate installed files and manifests without launching the app.

.PARAMETER KeepRunning
    Leave the launched app running after the smoke check finishes.

.EXAMPLE
    .\scripts\windows\Test-WindowsInstallerSmoke.ps1
    Validate the default per-user install and launch it long enough to confirm
    the persisted host-state contract.

.EXAMPLE
    .\scripts\windows\Test-WindowsInstallerSmoke.ps1 -InstallRoot 'C:\Program Files\Cats' -KeepRunning
    Validate a custom install path and keep the app running after the smoke
    check completes.
#>
param(
  [string]$InstallRoot = '',
  [string]$HostStatePath = '',
  [ValidateRange(5, 300)]
  [int]$TimeoutSeconds = 60,
  [switch]$SkipLaunch,
  [switch]$KeepRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[smoke] $Message" -ForegroundColor Cyan
}

function Write-Pass([string]$Message) {
  Write-Host "[pass] $Message" -ForegroundColor Green
}

function Resolve-DefaultInstallRoot {
  return Join-Path $env:LOCALAPPDATA 'Programs\Cats'
}

function Resolve-DefaultHostStatePath {
  return Join-Path $env:APPDATA 'Cats\desktop-host\state.json'
}

function Assert-FileExists([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing $Label at $Path"
  }
  Write-Pass "$Label found at $Path"
}

function Read-JsonFile([string]$Path) {
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -Depth 100
}

function Test-StableBootstrapPhase([string]$Phase) {
  return @('ready_for_setup', 'ready_for_chat', 'needs_prerequisites') -contains $Phase
}

function Wait-ForRefreshedHostState {
  param(
    [string]$StatePath,
    [Nullable[DateTime]]$BaselineWriteUtc,
    [DateTime]$Deadline
  )

  $lastPhase = $null
  while ((Get-Date) -lt $Deadline) {
    if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
      $stateItem = Get-Item -LiteralPath $StatePath
      $wasRefreshed = $null -eq $BaselineWriteUtc -or $stateItem.LastWriteTimeUtc -gt $BaselineWriteUtc
      if ($wasRefreshed) {
        $persisted = Read-JsonFile -Path $StatePath
        $phase = $persisted.snapshot.phase
        $lastPhase = $phase
        if ($phase -eq 'failed') {
          $detail = $persisted.snapshot.lastError
          if (-not $detail) {
            $detail = $persisted.snapshot.summary
          }
          throw "Installed app reported bootstrap failure: $detail"
        }
        if (Test-StableBootstrapPhase -Phase $phase) {
          return $persisted
        }
      }
    }

    Start-Sleep -Seconds 1
  }

  $phaseDetail = if ($lastPhase) { "last seen phase: $lastPhase" } else { 'no host state yet' }
  throw "Timed out waiting for the installed app to refresh $StatePath ($phaseDetail)."
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
  Write-Pass $Message
}

$resolvedInstallRoot = if ($InstallRoot) { $InstallRoot } else { Resolve-DefaultInstallRoot }
$resolvedHostStatePath = if ($HostStatePath) { $HostStatePath } else { Resolve-DefaultHostStatePath }
$exePath = Join-Path $resolvedInstallRoot 'Cats.exe'
$resourcesRoot = Join-Path $resolvedInstallRoot 'resources'
$packagingPlanPath = Join-Path $resourcesRoot 'desktop-package-plan.json'
$requiredFiles = @(
  @{ Path = $exePath; Label = 'installed Cats.exe' },
  @{ Path = (Join-Path $resourcesRoot 'app-sidecar\dist-server\index.js'); Label = 'bundled cats server entry' },
  @{ Path = (Join-Path $resourcesRoot 'app-sidecar\dist\index.html'); Label = 'bundled cats renderer build' },
  @{ Path = (Join-Path $resourcesRoot 'cats-runtime\dist\index.js'); Label = 'bundled cats-runtime entry' },
  @{ Path = $packagingPlanPath; Label = 'bundled desktop packaging plan' }
)

Write-Step "Validating installed Cats package under $resolvedInstallRoot"
foreach ($requiredFile in $requiredFiles) {
  Assert-FileExists -Path $requiredFile.Path -Label $requiredFile.Label
}

$packagingPlan = Read-JsonFile -Path $packagingPlanPath
Assert-True ($packagingPlan.strategy -eq 'electron-sidecar-bundle') 'installer packaging strategy is electron-sidecar-bundle'
Assert-True ($packagingPlan.selfHostedNpmCompatible -eq $true) 'installer keeps self-hosted npm compatibility'
$windowsTarget = $packagingPlan.targets | Where-Object { $_.platform -eq 'windows' } | Select-Object -First 1
Assert-True ($null -ne $windowsTarget) 'installer packaging plan includes a Windows target'
Assert-True (($windowsTarget.installerFormats -contains 'nsis')) 'Windows target includes the NSIS installer format'

if ($SkipLaunch) {
  Write-Step 'Skipping installed-app launch as requested.'
  exit 0
}

$stateBaselineUtc = $null
if (Test-Path -LiteralPath $resolvedHostStatePath -PathType Leaf) {
  $stateBaselineUtc = (Get-Item -LiteralPath $resolvedHostStatePath).LastWriteTimeUtc
}

Write-Step "Launching installed Cats app and waiting for $resolvedHostStatePath"
$launchedProcess = Start-Process -FilePath $exePath -WorkingDirectory $resolvedInstallRoot -PassThru

try {
  $persisted = Wait-ForRefreshedHostState -StatePath $resolvedHostStatePath `
    -BaselineWriteUtc $stateBaselineUtc `
    -Deadline ((Get-Date).AddSeconds($TimeoutSeconds))

  Assert-True ($persisted.snapshot.service -eq 'cats-electron-host') 'host state service id matches cats-electron-host'
  Assert-True ($persisted.snapshot.hostStatePath -eq $resolvedHostStatePath) 'host state file path matches the expected path'
  Assert-True (Test-StableBootstrapPhase -Phase $persisted.snapshot.phase) 'host snapshot reached a stable bootstrap phase'
  Assert-True (($persisted.snapshot.services | Measure-Object).Count -ge 2) 'host snapshot includes managed service entries'

  $runtimeService = $persisted.snapshot.services | Where-Object { $_.name -eq 'cats-runtime' } | Select-Object -First 1
  $appService = $persisted.snapshot.services | Where-Object { $_.name -eq 'cats' } | Select-Object -First 1
  Assert-True ($null -ne $runtimeService -and $runtimeService.ready -eq $true) 'cats-runtime sidecar reached ready status'
  Assert-True ($null -ne $appService -and $appService.ready -eq $true) 'cats app sidecar reached ready status'
  Assert-True (($persisted.snapshot.progress.steps | Measure-Object).Count -ge 3) 'host snapshot includes bootstrap progress steps'
  Assert-True ($persisted.snapshot.background.trayEnabled -is [bool]) 'host snapshot includes background lifecycle state'
  Assert-True ($persisted.snapshot.packaging.strategy -eq 'electron-sidecar-bundle') 'host snapshot includes packaging metadata'
  Assert-True (($persisted.snapshot.packaging.targets | Where-Object { $_.platform -eq 'windows' }).Count -ge 1) 'host snapshot packaging metadata keeps the Windows target'

  Write-Step "Installer smoke-check completed successfully for phase $($persisted.snapshot.phase)"
} finally {
  if (-not $KeepRunning -and $launchedProcess) {
    try {
      if (-not $launchedProcess.HasExited) {
        Stop-Process -Id $launchedProcess.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {
      Write-Warning "Could not stop launched Cats process $($launchedProcess.Id): $_"
    }
  }
}
