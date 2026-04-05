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
  return Join-Path $env:USERPROFILE '.cats\desktop\state.json'
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
  @{ Path = (Join-Path $resourcesRoot 'app-sidecar\build\server\index.js'); Label = 'bundled cats server entry' },
  @{ Path = (Join-Path $resourcesRoot 'app-sidecar\build\renderer\index.html'); Label = 'bundled cats renderer build' },
  @{ Path = (Join-Path $resourcesRoot 'app-sidecar\package.json'); Label = 'bundled cats app package manifest' },
  @{ Path = (Join-Path $resourcesRoot 'cats-runtime\dist\index.js'); Label = 'bundled cats-runtime entry' },
  @{ Path = (Join-Path $resourcesRoot 'cats-runtime\package.json'); Label = 'bundled cats-runtime package manifest' },
  @{ Path = (Join-Path $resourcesRoot 'cats-runtime\public\provider-setup.html'); Label = 'bundled cats-runtime setup UI' },
  @{ Path = (Join-Path $resourcesRoot 'cats-runtime\skills\README.md'); Label = 'bundled cats-runtime skills catalog root' },
  @{ Path = (Join-Path $resourcesRoot 'cats-runtime\config\providers.yaml.example'); Label = 'bundled cats-runtime provider config example' },
  @{ Path = (Join-Path $resourcesRoot 'cats-runtime\node_modules\yaml\package.json'); Label = 'bundled cats-runtime runtime dependency marker' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Setup-NodeGlobalPrefix.ps1'); Label = 'bundled Windows npm prefix helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-NodeCliPack.ps1'); Label = 'bundled Windows native CLI pack helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-ClaudeCode.ps1'); Label = 'bundled Windows native Claude Code installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-CursorAgent.ps1'); Label = 'bundled Windows native Cursor installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-Goose.ps1'); Label = 'bundled Windows native Goose installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-Junie.ps1'); Label = 'bundled Windows native Junie installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Check-WslPrerequisites.ps1'); Label = 'bundled Windows WSL prerequisite preflight helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-WslUbuntuEnvironment.ps1'); Label = 'bundled Windows WSL substrate installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-KiroWslCli.ps1'); Label = 'bundled Windows WSL Kiro installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-DockerDesktop.ps1'); Label = 'bundled Windows Docker Desktop installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Install-Ollama.ps1'); Label = 'bundled Windows Ollama installer helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\windows\Check-WindowsSetupReadiness.ps1'); Label = 'bundled Windows setup readiness audit helper' },
  @{ Path = (Join-Path $resourcesRoot 'desktop\setup-assets\manifest.json'); Label = 'bundled setup-assets manifest' },
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
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'app-package-manifest' }).Count -ge 1) 'Windows target includes the bundled cats app package manifest artifact'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'runtime-package-manifest' }).Count -ge 1) 'Windows target includes the bundled cats-runtime package manifest artifact'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'runtime-setup-ui' }).Count -ge 1) 'Windows target includes the bundled cats-runtime setup UI artifact'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'runtime-skills' }).Count -ge 1) 'Windows target includes the bundled cats-runtime skills artifact'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'runtime-dependencies' }).Count -ge 1) 'Windows target includes the bundled cats-runtime dependency artifact'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-npm-prefix-helper-script' }).Count -ge 1) 'Windows target includes the bundled npm prefix setup asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-node-cli-pack-script' }).Count -ge 1) 'Windows target includes the bundled native CLI pack setup asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-claude-native-installer-script' }).Count -ge 1) 'Windows target includes the bundled native Claude installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-cursor-native-installer-script' }).Count -ge 1) 'Windows target includes the bundled native Cursor installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-goose-native-installer-script' }).Count -ge 1) 'Windows target includes the bundled native Goose installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-junie-native-installer-script' }).Count -ge 1) 'Windows target includes the bundled native Junie installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-wsl-prerequisite-preflight-script' }).Count -ge 1) 'Windows target includes the bundled WSL prerequisite preflight asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-wsl-environment-installer-script' }).Count -ge 1) 'Windows target includes the bundled WSL substrate installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-kiro-wsl-installer-script' }).Count -ge 1) 'Windows target includes the bundled WSL Kiro installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-docker-desktop-installer-script' }).Count -ge 1) 'Windows target includes the bundled Docker Desktop installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-ollama-local-model-installer-script' }).Count -ge 1) 'Windows target includes the bundled Ollama installer asset'
Assert-True (($windowsTarget.artifacts | Where-Object { $_.id -eq 'windows-setup-readiness-audit-script' }).Count -ge 1) 'Windows target includes the bundled setup readiness audit asset'
Assert-True (($packagingPlan.installer.providerSetup.localProviders | Where-Object { $_.id -eq 'opencode' -and $_.bundledInCurrentInstaller -eq $true }).Count -ge 1) 'installer contract keeps OpenCode in the bundled local-provider rollout'
Assert-True (($packagingPlan.installer.providerSetup.localProviders | Where-Object { $_.id -eq 'kilo' -and $_.bundledInCurrentInstaller -eq $true }).Count -ge 1) 'installer contract keeps Kilo in the bundled local-provider rollout'
Assert-True (($packagingPlan.installer.providerSetup.localProviders | Where-Object { $_.id -eq 'ollama' -and $_.bundledInCurrentInstaller -eq $true }).Count -ge 1) 'installer contract keeps Ollama in the bundled local-provider rollout'
Assert-True (($packagingPlan.installer.providerSetup.helperCatalog | Where-Object { $_.id -eq 'windows-docker-desktop-installer' }).Count -ge 1) 'installer contract includes the bundled Docker Desktop helper metadata'
Assert-True (($packagingPlan.installer.providerSetup.helperCatalog | Where-Object { $_.id -eq 'windows-ollama-local-model-installer' }).Count -ge 1) 'installer contract includes the bundled Ollama helper metadata'

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
