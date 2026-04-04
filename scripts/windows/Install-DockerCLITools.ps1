<#
.SYNOPSIS
    Install or verify the Docker-container CLI provider baseline for Cats.

.DESCRIPTION
    Rewrites the shared Docker-target provider-install surface from
    environment-bootstrap into a Cats-owned helper. This helper keeps Docker
    Desktop readiness separate by reusing the existing repo-owned Docker
    Desktop helper, then installs the same provider baseline into a running
    container.

.PARAMETER CheckOnly
    Report container provider readiness without mutating the host or container.

.PARAMETER Apply
    Install missing providers into the target container.

.PARAMETER Upgrade
    Upgrade installed providers and install missing ones.

.PARAMETER Force
    Reinstall every targeted provider in the container.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER Container
    Target running container name.

.PARAMETER Provider
    Target one or more providers. Defaults to all supported providers.

.PARAMETER DockerState
    Override Docker Desktop detection for deterministic tests.

.PARAMETER ContainerState
    Override container detection for deterministic tests.

.PARAMETER NodeState
    Override node/npm detection inside the container for deterministic tests.

.PARAMETER InstalledProvidersJson
    Override installed provider ids inside the container for deterministic tests.

.PARAMETER OutdatedProvidersJson
    Override outdated provider ids for deterministic tests.

.PARAMETER SkipDockerDesktopMutation
    Skip actual Docker Desktop mutation when the desktop helper is asked to apply.

.PARAMETER SkipProviderInstall
    Skip actual provider install commands. Intended for deterministic tests.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [Parameter(Mandatory = $true)]
  [string]$Container,
  [string[]]$Provider,
  [ValidateSet('auto', 'missing', 'installed_engine_stopped', 'ready')]
  [string]$DockerState = 'auto',
  [ValidateSet('auto', 'missing', 'running')]
  [string]$ContainerState = 'auto',
  [ValidateSet('auto', 'ready', 'missing')]
  [string]$NodeState = 'auto',
  [string]$InstalledProvidersJson = '',
  [string]$OutdatedProvidersJson = '',
  [switch]$SkipDockerDesktopMutation,
  [switch]$SkipProviderInstall
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
    Write-Host "Container: $($Result.container)"
    Write-Host "Node ready: $($Result.nodeReady)"
    foreach ($providerResult in $Result.providers) {
      Write-Host "$($providerResult.id): $($providerResult.status) ($($providerResult.plannedAction))"
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
    foreach ($interruption in $Result.interruptions) {
      Write-Host "Interruption: $($interruption.kind)"
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
    return @()
  }
}

function Resolve-ExitCode {
  param(
    [string]$Status
  )

  if ($Status -eq 'failed') {
    return 1
  }

  return 0
}

$providerCatalog = @(
  [pscustomobject]@{ id = 'claude'; kind = 'native'; binary = 'claude'; installCommand = 'curl -fsSL https://claude.ai/install.sh | bash'; packageName = ''; authStep = 'Run claude inside the container to complete sign-in.' },
  [pscustomobject]@{ id = 'cursor'; kind = 'native'; binary = 'cursor-agent'; installCommand = 'curl https://cursor.com/install -fsSL | bash'; packageName = ''; authStep = 'Run cursor-agent inside the container to complete sign-in.' },
  [pscustomobject]@{ id = 'goose'; kind = 'native'; binary = 'goose'; installCommand = 'curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash'; packageName = ''; authStep = '' },
  [pscustomobject]@{ id = 'junie'; kind = 'native'; binary = 'junie'; installCommand = 'curl -fsSL https://junie.jetbrains.com/install.sh | bash'; packageName = ''; authStep = 'Run junie inside the container to complete sign-in.' },
  [pscustomobject]@{ id = 'kiro'; kind = 'native'; binary = 'kiro-cli'; installCommand = 'rm -f ~/.local/bin/kiro-cli ~/.local/bin/kiro-cli-chat ~/.local/bin/kiro-cli-term && rm -rf ~/.local/share/kiro-cli && curl -fsSL https://cli.kiro.dev/install | bash'; packageName = ''; authStep = 'Run kiro-cli inside the container to complete sign-in.' },
  [pscustomobject]@{ id = 'codex'; kind = 'npm'; binary = 'codex'; installCommand = ''; packageName = '@openai/codex'; authStep = '' },
  [pscustomobject]@{ id = 'gemini'; kind = 'npm'; binary = 'gemini'; installCommand = ''; packageName = '@google/gemini-cli'; authStep = '' },
  [pscustomobject]@{ id = 'copilot'; kind = 'npm'; binary = 'copilot'; installCommand = ''; packageName = '@github/copilot'; authStep = '' },
  [pscustomobject]@{ id = 'opencode'; kind = 'npm'; binary = 'opencode'; installCommand = ''; packageName = 'opencode-ai'; authStep = '' },
  [pscustomobject]@{ id = 'kilo'; kind = 'npm'; binary = 'kilo'; installCommand = ''; packageName = '@kilocode/cli'; authStep = '' },
  [pscustomobject]@{ id = 'auggie'; kind = 'npm'; binary = 'auggie'; installCommand = ''; packageName = '@augmentcode/auggie'; authStep = '' },
  [pscustomobject]@{ id = 'pi'; kind = 'npm'; binary = 'pi'; installCommand = ''; packageName = '@mariozechner/pi-coding-agent'; authStep = '' }
)

$allProviderIds = @($providerCatalog | ForEach-Object { $_.id })

function Resolve-TargetProviders {
  if ($Provider.Count -eq 0) {
    return $allProviderIds
  }

  $resolved = [System.Collections.Generic.List[string]]::new()
  foreach ($entry in $Provider) {
    $normalized = $entry.ToLowerInvariant()
    if ($allProviderIds -notcontains $normalized) {
      throw "Unknown provider '$entry'. Valid providers: $($allProviderIds -join ', ')"
    }
    if (-not $resolved.Contains($normalized)) {
      $resolved.Add($normalized)
    }
  }

  return $resolved.ToArray()
}

function Invoke-DockerDesktopHelper {
  param(
    [ValidateSet('check', 'apply')]
    [string]$Mode
  )

  $helperPath = Join-Path $PSScriptRoot 'Install-DockerDesktop.ps1'
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
    throw "Missing Docker Desktop helper at $helperPath"
  }

  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $helperPath,
    '-Json'
  )
  if ($Mode -eq 'check') {
    $arguments += '-CheckOnly'
  } else {
    $arguments += '-Apply'
  }
  if ($DockerState -ne 'auto') {
    $arguments += @('-DockerState', $DockerState)
  }
  if ($SkipDockerDesktopMutation) {
    $arguments += '-SkipInstaller'
  }

  $result = Invoke-HiddenCommand -FileName 'powershell.exe' -ArgumentList $arguments
  if ([string]::IsNullOrWhiteSpace($result.Output)) {
    throw 'Docker Desktop helper returned no JSON payload.'
  }
  return $result.Output | ConvertFrom-Json
}

function Invoke-DockerCommand {
  param(
    [string[]]$ArgumentList
  )

  $result = Invoke-HiddenCommand -FileName 'docker' -ArgumentList $ArgumentList
  return [pscustomobject]@{
    ExitCode = $result.ExitCode
    Output = $result.Output
    ErrorOutput = $result.ErrorOutput
  }
}

function Test-ContainerRunning {
  switch ($ContainerState) {
    'running' { return $true }
    'missing' { return $false }
  }

  $inspect = Invoke-DockerCommand -ArgumentList @('inspect', '--format={{.State.Running}}', $Container)
  return $inspect.ExitCode -eq 0 -and (($inspect.Output | Out-String).Trim() -eq 'true')
}

function Test-ContainerNodeReady {
  switch ($NodeState) {
    'ready' { return $true }
    'missing' { return $false }
  }

  $probe = Invoke-DockerCommand -ArgumentList @('exec', $Container, 'bash', '-lc', 'command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1')
  return ($probe.ExitCode -eq 0)
}

function Get-InstalledProviderSet {
  param(
    [string[]]$TargetProviders
  )

  if (-not [string]::IsNullOrWhiteSpace($InstalledProvidersJson)) {
    return Parse-JsonArray -Value $InstalledProvidersJson
  }

  $installed = [System.Collections.Generic.List[string]]::new()
  foreach ($providerId in $TargetProviders) {
    $providerEntry = $providerCatalog | Where-Object { $_.id -eq $providerId } | Select-Object -First 1
    $probe = Invoke-DockerCommand -ArgumentList @('exec', $Container, 'bash', '-lc', "PATH=~/.local/bin:~/.npm-global/bin:`$PATH; command -v $($providerEntry.binary) >/dev/null 2>&1")
    if ($probe.ExitCode -eq 0) {
      $installed.Add($providerId)
    }
  }

  return $installed.ToArray()
}

function Get-OutdatedProviderSet {
  if (-not [string]::IsNullOrWhiteSpace($OutdatedProvidersJson)) {
    return Parse-JsonArray -Value $OutdatedProvidersJson
  }

  return @()
}

function Ensure-ContainerShellSetup {
  if ($SkipProviderInstall) {
    return
  }

  $repairScript = @'
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
touch ~/.bashrc
grep -Fqx 'export PATH="$HOME/.local/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
grep -Fqx 'export PATH="$HOME/.npm-global/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
'@
  $repair = Invoke-DockerCommand -ArgumentList @('exec', $Container, 'bash', '-lc', $repairScript)
  if ($repair.ExitCode -ne 0) {
    throw 'Failed to repair PATH and npm prefix inside the target container.'
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-DockerCLITools.ps1 accepts either -CheckOnly or one mutation mode.'
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

$targetProviders = Resolve-TargetProviders
$targetProviderSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($providerId in $targetProviders) {
  $null = $targetProviderSet.Add($providerId)
}

$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()
$interruptions = [System.Collections.Generic.List[object]]::new()

$desktopResult = Invoke-DockerDesktopHelper -Mode 'check'
if (-not $CheckOnly -and $desktopResult.status -in @('not_installed', 'changes_required')) {
  $desktopResult = Invoke-DockerDesktopHelper -Mode 'apply'
}

foreach ($action in @($desktopResult.plannedActions)) {
  if (-not [string]::IsNullOrWhiteSpace($action)) {
    $plannedActions.Add("docker-desktop:$action")
  }
}
foreach ($change in @($desktopResult.appliedChanges)) {
  if (-not [string]::IsNullOrWhiteSpace($change)) {
    $appliedChanges.Add("docker-desktop:$change")
  }
}
foreach ($warning in @($desktopResult.warnings)) {
  if (-not [string]::IsNullOrWhiteSpace($warning)) {
    $warnings.Add($warning)
  }
}
foreach ($step in @($desktopResult.manualSteps)) {
  if (-not [string]::IsNullOrWhiteSpace($step)) {
    $manualSteps.Add($step)
  }
}
foreach ($interruption in @($desktopResult.interruptions)) {
  $interruptions.Add($interruption)
}

if ($desktopResult.status -ne 'ready') {
  $aggregateStatus = if ($desktopResult.status -in @('not_installed', 'changes_required')) {
    'changes_required'
  } else {
    $desktopResult.status
  }
  $result = [pscustomobject]@{
    helper = 'windows-docker-cli-tools'
    mode = $executionMode
    status = $aggregateStatus
    container = $Container
    dockerDesktop = $desktopResult
    containerRunning = $false
    nodeReady = $false
    providers = @()
    plannedActions = $plannedActions.ToArray()
    appliedChanges = $appliedChanges.ToArray()
    warnings = $warnings.ToArray()
    manualSteps = $manualSteps.ToArray()
    interruptions = $interruptions.ToArray()
  }
  Write-StructuredResult -Result $result -ExitCode (Resolve-ExitCode -Status $result.status)
}

$containerRunning = Test-ContainerRunning
if (-not $containerRunning) {
  $warnings.Add("Container '$Container' is not running.")
  $result = [pscustomobject]@{
    helper = 'windows-docker-cli-tools'
    mode = $executionMode
    status = if ($CheckOnly) { 'changes_required' } else { 'failed' }
    container = $Container
    dockerDesktop = $desktopResult
    containerRunning = $false
    nodeReady = $false
    providers = @()
    plannedActions = $plannedActions.ToArray()
    appliedChanges = $appliedChanges.ToArray()
    warnings = $warnings.ToArray()
    manualSteps = $manualSteps.ToArray()
    interruptions = $interruptions.ToArray()
  }
  Write-StructuredResult -Result $result -ExitCode (Resolve-ExitCode -Status $result.status)
}

$nodeReady = Test-ContainerNodeReady
$npmTargets = @($providerCatalog | Where-Object { $_.kind -eq 'npm' -and $targetProviderSet.Contains($_.id) })
if ($npmTargets.Count -gt 0 -and -not $nodeReady) {
  $warnings.Add('Node.js and npm are required inside the target container before npm-based providers can be installed.')
}

$installedProviders = Get-InstalledProviderSet -TargetProviders $targetProviders
$installedProviderSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($providerId in $installedProviders) {
  $null = $installedProviderSet.Add($providerId)
}
$outdatedProviders = Get-OutdatedProviderSet
$outdatedProviderSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($providerId in $outdatedProviders) {
  $null = $outdatedProviderSet.Add($providerId)
}

$providerResults = [System.Collections.Generic.List[object]]::new()
$anyFailures = $false
$changesRequired = $false

foreach ($providerEntry in $providerCatalog) {
  if (-not $targetProviderSet.Contains($providerEntry.id)) {
    continue
  }

  $installed = $installedProviderSet.Contains($providerEntry.id)
  $plannedAction = if ($Force) {
    'reinstall'
  } elseif ($Upgrade -and ($installed -or $outdatedProviderSet.Contains($providerEntry.id))) {
    'upgrade'
  } elseif ($installed) {
    'skip'
  } else {
    'install'
  }

  if ($providerEntry.kind -eq 'npm' -and -not $nodeReady) {
    $plannedAction = 'blocked'
    $changesRequired = $true
    $providerResults.Add([pscustomobject]@{
      id = $providerEntry.id
      installKind = $providerEntry.kind
      installed = $installed
      plannedAction = $plannedAction
      status = 'prerequisite_missing'
      manualSteps = @('Install Node.js and npm inside the target container before installing npm-based providers.')
    })
    continue
  }

  if ($plannedAction -ne 'skip') {
    $changesRequired = $true
    $plannedActions.Add("provider:$($providerEntry.id):$plannedAction")
  }

  if (-not $CheckOnly -and $plannedAction -ne 'skip') {
    if ($providerEntry.kind -eq 'native') {
      $commandResult = Invoke-DockerCommand -ArgumentList @('exec', $Container, 'bash', '-lc', "$($providerEntry.installCommand) 2>&1")
    } else {
      Ensure-ContainerShellSetup
      $packageSpec = if ($plannedAction -eq 'upgrade') {
        "$($providerEntry.packageName)@latest"
      } else {
        $providerEntry.packageName
      }
      $commandResult = Invoke-DockerCommand -ArgumentList @('exec', $Container, 'bash', '-lc', "npm install -g $packageSpec 2>&1")
    }

    if ($commandResult.ExitCode -eq 0) {
      $appliedChanges.Add("provider:$($providerEntry.id):$plannedAction")
      Ensure-ContainerShellSetup
      $installed = $true
    } else {
      $warnings.Add("Failed to $plannedAction provider '$($providerEntry.id)' inside container '$Container'.")
      $anyFailures = $true
    }
  }

  if (-not $CheckOnly) {
    $installed = $installed -or ((Get-InstalledProviderSet -TargetProviders @($providerEntry.id)).Count -gt 0)
  }

  $providerStatus = if ($anyFailures -and -not $installed) {
    'failed'
  } elseif ($plannedAction -eq 'skip') {
    'ready'
  } elseif ($CheckOnly) {
    'changes_required'
  } elseif ($installed) {
    'ready'
  } else {
    'failed'
  }

  $providerManualSteps = if ([string]::IsNullOrWhiteSpace($providerEntry.authStep)) {
    @()
  } else {
    @($providerEntry.authStep)
  }
  foreach ($step in $providerManualSteps) {
    $manualSteps.Add($step)
  }

  $providerResults.Add([pscustomobject]@{
    id = $providerEntry.id
    installKind = $providerEntry.kind
    installed = $installed
    plannedAction = $plannedAction
    status = $providerStatus
    manualSteps = $providerManualSteps
  })
}

$status = if ($anyFailures) {
  'failed'
} elseif ($changesRequired) {
  if ($CheckOnly) { 'changes_required' } else { 'ready' }
} else {
  'ready'
}

$result = [pscustomobject]@{
  helper = 'windows-docker-cli-tools'
  mode = $executionMode
  status = $status
  container = $Container
  dockerDesktop = $desktopResult
  containerRunning = $containerRunning
  nodeReady = $nodeReady
  providers = $providerResults.ToArray()
  plannedActions = $plannedActions.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  warnings = $warnings.ToArray()
  manualSteps = $manualSteps.ToArray()
  interruptions = $interruptions.ToArray()
}

Write-StructuredResult -Result $result -ExitCode (Resolve-ExitCode -Status $result.status)
