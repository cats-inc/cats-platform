<#
.SYNOPSIS
    Install or verify the WSL CLI provider baseline for Cats.

.DESCRIPTION
    Rewrites the shared WSL provider-install surface from environment-bootstrap
    into a Cats-owned helper. This script intentionally stays outside the
    packaged bootstrap/setup wizard flow, but exposes the same provider family
    as a repo-owned operational helper:

    - native-in-WSL installers for Claude Code, Cursor Agent, Goose, Junie,
      and Kiro
    - npm CLI pack installation in the target distro for Codex, Gemini,
      Copilot, OpenCode, Kilo, Auggie, and Pi

.PARAMETER CheckOnly
    Report WSL provider readiness without mutating the machine.

.PARAMETER Apply
    Install missing providers in the target distro.

.PARAMETER Upgrade
    Upgrade installed providers and install missing ones.

.PARAMETER Force
    Reinstall every targeted provider.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER Distro
    Target WSL distro. Defaults to Ubuntu.

.PARAMETER Provider
    Target one or more providers. Defaults to all supported providers.

.PARAMETER WslState
    Override WSL substrate detection for deterministic tests.

.PARAMETER InstalledDistrosJson
    Override the installed distro set for deterministic tests.

.PARAMETER WslUserBootstrapState
    Override first-user bootstrap state for deterministic tests.

.PARAMETER NodeState
    Override node/npm detection inside WSL for deterministic tests.

.PARAMETER InstalledProvidersJson
    Override installed provider ids inside WSL for deterministic tests.

.PARAMETER OutdatedProvidersJson
    Override outdated provider ids for deterministic tests.

.PARAMETER SkipEnvironmentMutation
    Skip actual WSL substrate mutation when the environment helper is asked to apply.

.PARAMETER SkipProviderInstall
    Skip actual provider install commands. Intended for deterministic tests.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [string]$Distro = 'Ubuntu',
  [string[]]$Provider,
  [ValidateSet('auto', 'missing', 'installed_no_distro', 'ready')]
  [string]$WslState = 'auto',
  [string]$InstalledDistrosJson = '',
  [ValidateSet('auto', 'pending', 'completed')]
  [string]$WslUserBootstrapState = 'auto',
  [ValidateSet('auto', 'ready', 'missing')]
  [string]$NodeState = 'auto',
  [string]$InstalledProvidersJson = '',
  [string]$OutdatedProvidersJson = '',
  [switch]$SkipEnvironmentMutation,
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
    Write-Host "Distro: $($Result.distro)"
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
  [pscustomobject]@{
    id = 'claude'
    kind = 'native'
    binary = 'claude'
    installCommand = 'curl -fsSL https://claude.ai/install.sh | bash'
    authStep = 'Run claude inside WSL to complete sign-in.'
  },
  [pscustomobject]@{
    id = 'cursor'
    kind = 'native'
    binary = 'cursor-agent'
    installCommand = 'curl https://cursor.com/install -fsSL | bash'
    authStep = 'Run cursor-agent inside WSL to complete sign-in.'
  },
  [pscustomobject]@{
    id = 'goose'
    kind = 'native'
    binary = 'goose'
    installCommand = 'curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash'
    authStep = ''
  },
  [pscustomobject]@{
    id = 'junie'
    kind = 'native'
    binary = 'junie'
    installCommand = 'curl -fsSL https://junie.jetbrains.com/install.sh | bash'
    authStep = 'Run junie inside WSL to complete sign-in.'
  },
  [pscustomobject]@{
    id = 'kiro'
    kind = 'native'
    binary = 'kiro-cli'
    installCommand = 'rm -f ~/.local/bin/kiro-cli ~/.local/bin/kiro-cli-chat ~/.local/bin/kiro-cli-term && rm -rf ~/.local/share/kiro-cli && curl -fsSL https://cli.kiro.dev/install | bash'
    authStep = 'Run kiro-cli inside WSL to complete sign-in.'
  },
  [pscustomobject]@{
    id = 'codex'
    kind = 'npm'
    binary = 'codex'
    packageName = '@openai/codex'
    installCommand = ''
    authStep = ''
  },
  [pscustomobject]@{
    id = 'gemini'
    kind = 'npm'
    binary = 'gemini'
    packageName = '@google/gemini-cli'
    installCommand = ''
    authStep = ''
  },
  [pscustomobject]@{
    id = 'copilot'
    kind = 'npm'
    binary = 'copilot'
    packageName = '@github/copilot'
    installCommand = ''
    authStep = ''
  },
  [pscustomobject]@{
    id = 'opencode'
    kind = 'npm'
    binary = 'opencode'
    packageName = 'opencode-ai'
    installCommand = ''
    authStep = ''
  },
  [pscustomobject]@{
    id = 'kilo'
    kind = 'npm'
    binary = 'kilo'
    packageName = '@kilocode/cli'
    installCommand = ''
    authStep = ''
  },
  [pscustomobject]@{
    id = 'auggie'
    kind = 'npm'
    binary = 'auggie'
    packageName = '@augmentcode/auggie'
    installCommand = ''
    authStep = ''
  },
  [pscustomobject]@{
    id = 'pi'
    kind = 'npm'
    binary = 'pi'
    packageName = '@mariozechner/pi-coding-agent'
    installCommand = ''
    authStep = ''
  }
)

$allProviderIds = @($providerCatalog | ForEach-Object { $_.id })

function Resolve-TargetProviders {
  if ($null -eq $Provider -or $Provider.Count -eq 0) {
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

function Invoke-WslEnvironmentHelper {
  param(
    [ValidateSet('check', 'apply')]
    [string]$Mode
  )

  $helperPath = Join-Path $PSScriptRoot 'Install-WslUbuntuEnvironment.ps1'
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
    throw "Missing WSL environment helper at $helperPath"
  }

  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $helperPath,
    '-Json',
    '-Distro', $Distro
  )
  if ($Mode -eq 'check') {
    $arguments += '-CheckOnly'
  } else {
    $arguments += '-Apply'
  }
  if ($WslState -ne 'auto') {
    $arguments += @('-WslState', $WslState)
  }
  if (-not [string]::IsNullOrWhiteSpace($InstalledDistrosJson)) {
    $arguments += @('-InstalledDistrosJson', $InstalledDistrosJson)
  }
  if ($WslUserBootstrapState -ne 'auto') {
    $arguments += @('-WslUserBootstrapState', $WslUserBootstrapState)
  }
  if ($SkipEnvironmentMutation) {
    $arguments += '-SkipFeatureMutation'
    $arguments += '-SkipDistroInstall'
  }

  $result = Invoke-HiddenCommand -FileName 'powershell.exe' -ArgumentList $arguments
  if ([string]::IsNullOrWhiteSpace($result.Output)) {
    throw 'WSL environment helper returned no JSON payload.'
  }
  return $result.Output | ConvertFrom-Json
}

function Invoke-WslCommand {
  param(
    [string]$Command
  )

  $result = Invoke-HiddenCommand -FileName 'wsl.exe' -ArgumentList @('-d', $Distro, 'bash', '-lc', $Command)
  return [pscustomobject]@{
    ExitCode = $result.ExitCode
    Output = $result.Output
    ErrorOutput = $result.ErrorOutput
  }
}

function Test-WslNodeReady {
  switch ($NodeState) {
    'ready' { return $true }
    'missing' { return $false }
  }

  $probe = Invoke-WslCommand -Command 'command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1'
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
    $probe = Invoke-WslCommand -Command "PATH=~/.local/bin:~/.npm-global/bin:`$PATH; command -v $($providerEntry.binary) >/dev/null 2>&1"
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

function Ensure-WslShellPaths {
  if ($SkipProviderInstall) {
    return
  }

  $repairCommand = @'
touch ~/.bashrc
grep -Fqx 'export PATH="$HOME/.local/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
grep -Fqx 'export PATH="$HOME/.npm-global/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
'@
  $repairResult = Invoke-WslCommand -Command $repairCommand
  if ($repairResult.ExitCode -ne 0) {
    throw 'Failed to repair ~/.bashrc PATH entries inside WSL.'
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-WSLCLITools.ps1 accepts either -CheckOnly or one mutation mode.'
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

$environmentResult = Invoke-WslEnvironmentHelper -Mode 'check'
if (-not $CheckOnly -and $environmentResult.status -in @('not_installed', 'changes_required')) {
  $environmentResult = Invoke-WslEnvironmentHelper -Mode 'apply'
}

foreach ($action in @($environmentResult.plannedActions)) {
  if (-not [string]::IsNullOrWhiteSpace($action)) {
    $plannedActions.Add("wsl:$action")
  }
}
foreach ($change in @($environmentResult.appliedChanges)) {
  if (-not [string]::IsNullOrWhiteSpace($change)) {
    $appliedChanges.Add("wsl:$change")
  }
}
foreach ($warning in @($environmentResult.warnings)) {
  if (-not [string]::IsNullOrWhiteSpace($warning)) {
    $warnings.Add($warning)
  }
}
foreach ($step in @($environmentResult.manualSteps)) {
  if (-not [string]::IsNullOrWhiteSpace($step)) {
    $manualSteps.Add($step)
  }
}
foreach ($interruption in @($environmentResult.interruptions)) {
  $interruptions.Add($interruption)
}

if ($environmentResult.status -ne 'ready') {
  $aggregateStatus = if ($environmentResult.status -in @('not_installed', 'changes_required')) {
    'changes_required'
  } else {
    $environmentResult.status
  }
  $result = [pscustomobject]@{
    helper = 'windows-wsl-cli-tools'
    mode = $executionMode
    status = $aggregateStatus
    distro = $Distro
    restartRequired = [bool]$environmentResult.restartRequired
    wslEnvironment = $environmentResult
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

$nodeReady = Test-WslNodeReady
$npmTargets = @($providerCatalog | Where-Object { $_.kind -eq 'npm' -and $targetProviderSet.Contains($_.id) })
if ($npmTargets.Count -gt 0 -and -not $nodeReady) {
  $warnings.Add('Node.js and npm are required inside the target WSL distro before npm-based CLI providers can be installed.')
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
      manualSteps = @('Install Node.js and npm inside the target WSL distro before installing npm-based providers.')
    })
    continue
  }

  if ($plannedAction -ne 'skip') {
    $changesRequired = $true
    $plannedActions.Add("provider:$($providerEntry.id):$plannedAction")
  }

  if (-not $CheckOnly -and $plannedAction -ne 'skip') {
    if ($providerEntry.kind -eq 'native') {
      $commandResult = Invoke-WslCommand -Command "$($providerEntry.installCommand) 2>&1"
    } else {
      $packageSpec = if ($plannedAction -eq 'upgrade') {
        "$($providerEntry.packageName)@latest"
      } else {
        $providerEntry.packageName
      }
      $commandResult = Invoke-WslCommand -Command "npm install -g $packageSpec 2>&1"
    }

    if ($commandResult.ExitCode -eq 0) {
      $appliedChanges.Add("provider:$($providerEntry.id):$plannedAction")
      Ensure-WslShellPaths
      $installed = $true
    } else {
      $warnings.Add("Failed to $plannedAction provider '$($providerEntry.id)' inside WSL.")
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
  helper = 'windows-wsl-cli-tools'
  mode = $executionMode
  status = $status
  distro = $Distro
  restartRequired = [bool]$environmentResult.restartRequired
  wslEnvironment = $environmentResult
  nodeReady = $nodeReady
  providers = $providerResults.ToArray()
  plannedActions = $plannedActions.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  warnings = $warnings.ToArray()
  manualSteps = $manualSteps.ToArray()
  interruptions = $interruptions.ToArray()
}

Write-StructuredResult -Result $result -ExitCode (Resolve-ExitCode -Status $result.status)
