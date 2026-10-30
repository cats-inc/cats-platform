<#
.SYNOPSIS
    Install or upgrade Git for Windows for the packaged Cats Windows host.

.DESCRIPTION
    Adapts the environment-bootstrap Install-Git-Admin.ps1 flow into the
    packaged-helper contract used by Desktop setup. Cats Code runs git from
    PATH for worktrees, branches, commits and pushes, so a clean Windows
    machine needs it before those features work.

    Installs the full Git for Windows, not MinGit. Uses winget (Git.Git) when
    it can drive the install and falls back to the official installer from the
    Git for Windows GitHub Releases, chosen for the OS architecture (x64 or
    ARM64). A fresh Windows 11 can ship a winget that fails, so the fallback is
    part of the normal path rather than a rarity.

    Git for Windows installs into Program Files and therefore needs
    Administrator rights for the actual mutation. CheckOnly stays user-scoped
    so Desktop can probe state without prompting for UAC. When
    -Apply / -Upgrade / -Force is used, the helper self-elevates through
    Start-Process -Verb RunAs unless it is already running elevated.

    CheckOnly also reports a manual step when git is installed but its global
    user.name or user.email is empty, because commits need both. The status
    stays ready: setting an identity is the user's choice.

    -Uninstall is intentionally omitted: git is a machine-wide tool the user
    may rely on outside Cats.

.PARAMETER CheckOnly
    Report the current state without changing anything. Default mode.

.PARAMETER Apply
    Install Git for Windows when it is missing.

.PARAMETER Upgrade
    Upgrade an existing installation, or install it when missing.

.PARAMETER Force
    Reinstall even when Git for Windows is already installed.

.PARAMETER Json
    Emit the structured JSON result.

.PARAMETER DryRun
    Accepted for contract parity and relayed through elevation; not honored.
    Desktop requests dry runs only for uninstall previews.

.PARAMETER InstallState
    Override installation detection for deterministic tests.

.PARAMETER DetectedVersion
    Override the detected git version for deterministic tests.

.PARAMETER SkipGitProbe
    Never run git, winget or the installer download. Used by deterministic tests
    and the readiness audit's -SkipNodeCheck mode.

.PARAMETER SkipElevation
    Run the mutation path in the current process. Set on the elevated child.

.PARAMETER ResultRelayPath
    File the elevated child writes its JSON result to for the parent to re-emit.

.EXAMPLE
    .\Install-Git.ps1 -CheckOnly -Json
    Report whether git is installed and whether a commit identity is configured.

.EXAMPLE
    .\Install-Git.ps1 -Apply
    Install Git for Windows through UAC when it is missing.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [switch]$DryRun,
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$InstallState = 'auto',
  [string]$DetectedVersion = '',
  [switch]$SkipGitProbe,
  [switch]$SkipElevation,
  [string]$ResultRelayPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')

$HelperId = 'windows-git-installer'
$DisplayName = 'Git for Windows'
$WingetPackageId = 'Git.Git'
$GitReleasesApi = 'https://api.github.com/repos/git-for-windows/git/releases/latest'
$ManualInstallStep = 'Install Git for Windows manually from https://git-scm.com/download/win.'
$IdentityStep = 'Set your commit identity: git config --global user.name "Your Name" and git config --global user.email "you@example.com".'
# Inno Setup flags from environment-bootstrap: no wizard, no reboot, no cancel
# button and no message boxes a hidden install could wait on.
$InstallerArguments = @('/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-', '/SUPPRESSMSGBOXES')

function Write-StructuredResult {
  param(
    [pscustomobject]$Result,
    [int]$ExitCode
  )

  $payload = $Result | ConvertTo-Json -Depth 10

  if (-not [string]::IsNullOrEmpty($ResultRelayPath)) {
    [System.IO.File]::WriteAllText($ResultRelayPath, $payload)
  }

  if ($Json) {
    $payload
  } else {
    Write-Host "Helper: $($Result.helper)"
    Write-Host "Mode: $($Result.mode)"
    Write-Host "Status: $($Result.status)"
    Write-Host "Installed: $($Result.installed)"
    if ($Result.detectedVersion) {
      Write-Host "Detected version: $($Result.detectedVersion)"
    }
    foreach ($warning in $Result.warnings) {
      Write-Warning $warning
    }
    foreach ($change in $Result.plannedActions) {
      Write-Host "Planned action: $change"
    }
    foreach ($step in $Result.manualSteps) {
      Write-Host "Manual step: $step"
    }
  }

  exit $ExitCode
}

function New-Result {
  param(
    [string]$Mode,
    [string]$Status,
    [bool]$Installed,
    [string]$DetectedVersion = '',
    [string]$CommandPath = '',
    [string[]]$PlannedActions = @(),
    [string[]]$AppliedChanges = @(),
    [string[]]$Warnings = @(),
    [string[]]$ManualSteps = @(),
    [object[]]$Interruptions = @()
  )

  return [pscustomobject]@{
    helper = $HelperId
    displayName = $DisplayName
    mode = $Mode
    status = $Status
    installed = $Installed
    commandPath = $CommandPath
    detectedVersion = $DetectedVersion
    plannedActions = $PlannedActions
    appliedChanges = $AppliedChanges
    warnings = $Warnings
    manualSteps = $ManualSteps
    interruptions = $Interruptions
  }
}

function Resolve-GitCommandPath {
  $cmd = Get-Command git -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    return ''
  }
  return [string]$cmd.Source
}

function Get-GitDetectedVersion {
  param(
    [string]$Override
  )

  if (-not [string]::IsNullOrWhiteSpace($Override)) {
    return $Override
  }

  if ($SkipGitProbe) {
    return ''
  }

  try {
    # git version 2.47.1.windows.1
    $raw = (& git --version 2>$null | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($raw)) {
      return ''
    }
    if ($raw -match '(\d+\.\d+\.\d+)') {
      return $matches[1]
    }
    return $raw.Trim()
  } catch {
    return ''
  }
}

function Test-GitInstalled {
  if ($InstallState -eq 'installed') {
    return $true
  }
  if ($InstallState -eq 'missing') {
    return $false
  }

  if ($SkipGitProbe) {
    return $false
  }

  return [bool](Get-Command git -ErrorAction SilentlyContinue)
}

# True only when git ran and returned an empty user.name or user.email. A git
# that cannot run says nothing about the identity, so it adds no step.
function Test-GitIdentityMissing {
  if ($SkipGitProbe) {
    return $false
  }

  try {
    foreach ($key in @('user.name', 'user.email')) {
      $value = (& git config --global --get $key 2>$null | Select-Object -First 1)
      if ([string]::IsNullOrWhiteSpace([string]$value)) {
        return $true
      }
    }
    return $false
  } catch {
    return $false
  }
}

# The OS architecture, not this process's: ARCHITEW6432 names the native one
# when a 32-bit PowerShell runs under WOW64.
function Get-WindowsArchitecture {
  $arch = if (-not [string]::IsNullOrWhiteSpace($env:PROCESSOR_ARCHITEW6432)) {
    $env:PROCESSOR_ARCHITEW6432
  } else {
    $env:PROCESSOR_ARCHITECTURE
  }

  if ([string]::IsNullOrWhiteSpace($arch)) {
    return ''
  }

  return $arch.Trim().ToUpperInvariant()
}

# Release assets are named from the release, not the tag: v2.47.1.windows.2
# ships Git-2.47.1.2-64-bit.exe. Match the name and leave out release
# candidates and the portable, MinGit and 32-bit builds.
function Select-GitInstallerAsset {
  param(
    [object[]]$Assets,
    [string]$Architecture
  )

  $suffix = if ($Architecture -eq 'ARM64') { 'arm64' } else { '64-bit' }
  $pattern = '^Git-\d+(\.\d+)+-' + [regex]::Escape($suffix) + '\.exe$'
  return @($Assets) | Where-Object { $null -ne $_ -and [string]$_.name -match $pattern } |
    Select-Object -First 1
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

$mutationCount = @($Apply, $Upgrade, $Force | Where-Object { $_ }).Count
if ($CheckOnly -and $mutationCount -gt 0) {
  throw 'Install-Git.ps1 accepts either -CheckOnly or one mutation mode.'
}
if ($mutationCount -gt 1) {
  throw 'Install-Git.ps1 accepts at most one of -Apply / -Upgrade / -Force.'
}

$mode = if ($CheckOnly) {
  'check'
} elseif ($Force) {
  'force'
} elseif ($Upgrade) {
  'upgrade'
} else {
  'apply'
}

# Desktop can outlive an installation. A fresh check must include the registry
# PATH, while retaining caller-provided command locations in this process.
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
  [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
$installed = Test-GitInstalled
$detected = Get-GitDetectedVersion -Override $DetectedVersion
$commandPath = if ($SkipGitProbe) { '' } else { Resolve-GitCommandPath }

if ($mode -eq 'check') {
  $status = if ($installed) { 'ready' } else { 'changes_required' }
  $planned = @(if (-not $installed) { 'install_git' })
  $manual = @(if ($installed -and (Test-GitIdentityMissing)) { $IdentityStep })
  Write-StructuredResult -Result (New-Result `
    -Mode $mode `
    -Status $status `
    -Installed $installed `
    -DetectedVersion $detected `
    -CommandPath $commandPath `
    -PlannedActions $planned `
    -ManualSteps $manual `
  ) -ExitCode 0
}

if ($mode -eq 'apply' -and $installed) {
  Write-StructuredResult -Result (New-Result `
    -Mode $mode `
    -Status 'ready' `
    -Installed $true `
    -DetectedVersion $detected `
    -CommandPath $commandPath `
  ) -ExitCode 0
}

# Self-elevate for mutation operations
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $SkipElevation) {
  # Relay the elevated child's structured result through a temp file so the
  # parent (which inherits the un-elevated stdout pipe) can re-emit the JSON
  # without losing it to the elevated console window.
  $relayPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(),
    "cats-helper-relay-$([System.Guid]::NewGuid().ToString('N')).json")

  $relayArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
  if ($CheckOnly) { $relayArgs += '-CheckOnly' }
  if ($Apply) { $relayArgs += '-Apply' }
  if ($Upgrade) { $relayArgs += '-Upgrade' }
  if ($Force) { $relayArgs += '-Force' }
  if ($DryRun) { $relayArgs += '-DryRun' }
  if ($Json) { $relayArgs += '-Json' }
  if ($PSBoundParameters.ContainsKey('InstallState')) { $relayArgs += @('-InstallState', $InstallState) }
  if ($PSBoundParameters.ContainsKey('DetectedVersion')) { $relayArgs += @('-DetectedVersion', $DetectedVersion) }
  if ($SkipGitProbe) { $relayArgs += '-SkipGitProbe' }
  $relayArgs += '-SkipElevation'
  $relayArgs += @('-ResultRelayPath', $relayPath)

  try {
    $process = Start-Process -FilePath 'powershell.exe' `
      -ArgumentList $relayArgs `
      -Verb RunAs `
      -Wait `
      -PassThru
    if ([System.IO.File]::Exists($relayPath)) {
      $relayed = [System.IO.File]::ReadAllText($relayPath)
      [System.IO.File]::Delete($relayPath)
      if ($Json -and -not [string]::IsNullOrWhiteSpace($relayed)) {
        Write-Output $relayed
      } elseif (-not $Json -and -not [string]::IsNullOrWhiteSpace($relayed)) {
        try {
          $relayedResult = $relayed | ConvertFrom-Json
          Write-Host "Helper: $($relayedResult.helper)"
          Write-Host "Mode: $($relayedResult.mode)"
          Write-Host "Status: $($relayedResult.status)"
        } catch {
          # If the child crashed before writing, fall through to the synthesized failure result below.
        }
      }
    }
    exit $process.ExitCode
  } catch {
    if ([System.IO.File]::Exists($relayPath)) {
      [System.IO.File]::Delete($relayPath)
    }
    Write-StructuredResult -Result (New-Result `
      -Mode $mode `
      -Status 'changes_required' `
      -Installed $installed `
      -DetectedVersion $detected `
      -CommandPath $commandPath `
      -Warnings @('Administrator elevation was cancelled or failed.') `
      -Interruptions @([pscustomobject]@{ kind = 'elevation_required'; reason = $_.Exception.Message }) `
    ) -ExitCode 1
  }
}

# === Elevated execution path ===
$applied = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$installSuccess = $false

$wingetExists = [bool](Get-Command winget -ErrorAction SilentlyContinue)

if ($wingetExists -and -not $SkipGitProbe) {
  try {
    $wingetArgs = if ($mode -eq 'upgrade' -and $installed) {
      @('upgrade', '--id', $WingetPackageId, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements')
    } else {
      $installArgs = @('install', '--id', $WingetPackageId, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements')
      if ($mode -eq 'force') {
        $installArgs += '--force'
      }
      $installArgs
    }

    $wingetResult = Invoke-HiddenCommand -FileName 'winget' -ArgumentList $wingetArgs
    $wingetExit = $wingetResult.ExitCode

    if ($wingetExit -eq 0) {
      $installSuccess = $true
      $applied.Add("winget_${mode}_${WingetPackageId}")
    } elseif ($wingetExit -eq -1978335189 -or ($mode -eq 'upgrade' -and $wingetExit -eq 1)) {
      $installSuccess = $true
      $applied.Add("already_up_to_date_${WingetPackageId}")
    } else {
      $warnings.Add("winget exited $wingetExit; falling back to the Git for Windows installer.")
    }
  } catch {
    $warnings.Add("winget invocation failed: $($_.Exception.Message); falling back to the Git for Windows installer.")
  }
}

if (-not $installSuccess -and -not $SkipGitProbe) {
  $installerPath = ''
  try {
    $headers = @{ 'User-Agent' = 'Cats-Setup-Helper'; 'Accept' = 'application/vnd.github+json' }
    try {
      $latest = Invoke-RestMethod -Uri $GitReleasesApi -Headers $headers -UseBasicParsing -TimeoutSec 30
    } catch {
      # Anonymous API calls are rate-limited per IP; a 403 or 429 lands here.
      throw "GitHub Releases API request failed: $($_.Exception.Message)"
    }
    if ($null -eq $latest -or [string]::IsNullOrWhiteSpace($latest.tag_name)) {
      throw 'GitHub Releases API returned an empty payload.'
    }
    $latestVersion = $latest.tag_name -replace '^v', ''
    $architecture = Get-WindowsArchitecture
    $installerAsset = Select-GitInstallerAsset -Assets @($latest.assets) -Architecture $architecture
    if ($null -eq $installerAsset) {
      throw "No Git for Windows installer for $architecture in release $($latest.tag_name)."
    }

    $installerPath = Join-Path $env:TEMP $installerAsset.name
    # Windows PowerShell 5.1 downloads a large file far slower while it draws progress.
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $installerAsset.browser_download_url -OutFile $installerPath -UseBasicParsing
    $applied.Add("downloaded_installer_v$latestVersion")

    $installerResult = Invoke-HiddenCommand -FileName $installerPath -ArgumentList $InstallerArguments
    if ($installerResult.ExitCode -eq 0) {
      $installSuccess = $true
      $applied.Add("installer_${mode}_v$latestVersion")
    } else {
      $warnings.Add("Git for Windows installer exited $($installerResult.ExitCode).")
    }
  } catch {
    $warnings.Add("Direct download failed: $($_.Exception.Message)")
  } finally {
    if ($installerPath -and (Test-Path -LiteralPath $installerPath)) {
      Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
    }
  }
}

if (-not $installSuccess) {
  Write-StructuredResult -Result (New-Result `
    -Mode $mode `
    -Status 'failed' `
    -Installed $installed `
    -DetectedVersion $detected `
    -CommandPath $commandPath `
    -AppliedChanges $applied.ToArray() `
    -Warnings $warnings.ToArray() `
    -ManualSteps @($ManualInstallStep) `
  ) -ExitCode 1
}

# Refresh PATH so this check and later helpers find the new git
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
  [System.Environment]::GetEnvironmentVariable('Path', 'User')

$postCommandPath = Resolve-GitCommandPath
if ([string]::IsNullOrWhiteSpace($postCommandPath)) {
  $warnings.Add('git is still missing from PATH after the install.')
  Write-StructuredResult -Result (New-Result `
    -Mode $mode `
    -Status 'failed' `
    -Installed $false `
    -AppliedChanges $applied.ToArray() `
    -Warnings $warnings.ToArray() `
    -ManualSteps @($ManualInstallStep) `
  ) -ExitCode 1
}
$postVersion = Get-GitDetectedVersion -Override ''

Write-StructuredResult -Result (New-Result `
  -Mode $mode `
  -Status 'ready' `
  -Installed $true `
  -DetectedVersion $postVersion `
  -CommandPath $postCommandPath `
  -AppliedChanges $applied.ToArray() `
  -Warnings $warnings.ToArray() `
  -Interruptions @([pscustomobject]@{ kind = 'relaunch_required'; reason = 'PATH was extended and Runtime caches git availability; relaunch Cats.' }) `
) -ExitCode 0
