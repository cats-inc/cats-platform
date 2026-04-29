<#
.SYNOPSIS
    Install or upgrade GitHub CLI (gh) for the packaged Cats Windows host.

.DESCRIPTION
    Adapts the environment-bootstrap Install-GitHubCLI-Admin.ps1 flow into
    the packaged-helper contract used by Settings>Runtime. Uses winget when
    available and falls back to the GitHub Releases MSI when winget cannot
    drive the install.

    GitHub CLI installs into Program Files and therefore needs Administrator
    rights for the actual mutation. CheckOnly stays user-scoped so the
    Settings>Runtime UI can probe state without prompting for UAC. When
    -Apply / -Upgrade / -Force is used, the helper self-elevates through
    Start-Process -Verb RunAs unless it is already running elevated.

    -Uninstall is intentionally omitted: gh is generally safe to remove,
    but this helper keeps the surface symmetric with Install-Node.ps1 so
    that Settings>Runtime never offers an uninstall path that nukes a
    machine-wide tool the user may rely on outside Cats.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$InstallState = 'auto',
  [string]$DetectedVersion = '',
  [switch]$SkipGhProbe,
  [switch]$SkipElevation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')

$HelperId = 'windows-github-cli-installer'
$DisplayName = 'GitHub CLI'
$WingetPackageId = 'GitHub.cli'
$GhReleasesApi = 'https://api.github.com/repos/cli/cli/releases/latest'

function Write-StructuredResult {
  param(
    [pscustomobject]$Result,
    [int]$ExitCode
  )

  if ($Json) {
    $Result | ConvertTo-Json -Depth 10
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

function Resolve-GhCommandPath {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    return ''
  }
  return [string]$cmd.Source
}

function Get-GhDetectedVersion {
  param(
    [string]$Override
  )

  if (-not [string]::IsNullOrWhiteSpace($Override)) {
    return $Override
  }

  if ($SkipGhProbe) {
    return ''
  }

  try {
    $raw = (& gh --version 2>$null | Select-Object -First 1)
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

function Test-GhInstalled {
  if ($InstallState -eq 'installed') {
    return $true
  }
  if ($InstallState -eq 'missing') {
    return $false
  }

  if ($SkipGhProbe) {
    return $false
  }

  return [bool](Get-Command gh -ErrorAction SilentlyContinue)
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

$mutationCount = @($Apply, $Upgrade, $Force | Where-Object { $_ }).Count
if ($CheckOnly -and $mutationCount -gt 0) {
  throw 'Install-GitHubCli.ps1 accepts either -CheckOnly or one mutation mode.'
}
if ($mutationCount -gt 1) {
  throw 'Install-GitHubCli.ps1 accepts at most one of -Apply / -Upgrade / -Force.'
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

$installed = Test-GhInstalled
$detected = Get-GhDetectedVersion -Override $DetectedVersion
$commandPath = if ($SkipGhProbe) { '' } else { Resolve-GhCommandPath }

if ($mode -eq 'check') {
  $status = if ($installed) { 'ready' } else { 'changes_required' }
  $planned = if ($installed) { @() } else { @('install_github_cli') }
  Write-StructuredResult -Result (New-Result `
    -Mode $mode `
    -Status $status `
    -Installed $installed `
    -DetectedVersion $detected `
    -CommandPath $commandPath `
    -PlannedActions $planned `
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
  $relayArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
  if ($CheckOnly) { $relayArgs += '-CheckOnly' }
  if ($Apply) { $relayArgs += '-Apply' }
  if ($Upgrade) { $relayArgs += '-Upgrade' }
  if ($Force) { $relayArgs += '-Force' }
  if ($Json) { $relayArgs += '-Json' }
  if ($PSBoundParameters.ContainsKey('InstallState')) { $relayArgs += @('-InstallState', $InstallState) }
  if ($PSBoundParameters.ContainsKey('DetectedVersion')) { $relayArgs += @('-DetectedVersion', $DetectedVersion) }
  if ($SkipGhProbe) { $relayArgs += '-SkipGhProbe' }
  $relayArgs += '-SkipElevation'

  try {
    $process = Start-Process -FilePath 'powershell.exe' `
      -ArgumentList $relayArgs `
      -Verb RunAs `
      -Wait `
      -PassThru
    exit $process.ExitCode
  } catch {
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

if ($wingetExists -and -not $SkipGhProbe) {
  try {
    $wingetArgs = if ($mode -eq 'upgrade' -and $installed) {
      @('upgrade', '--id', $WingetPackageId, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements')
    } else {
      $args = @('install', '--id', $WingetPackageId, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements')
      if ($mode -eq 'force') {
        $args += '--force'
      }
      $args
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
      $warnings.Add("winget exited $wingetExit; falling back to direct download.")
    }
  } catch {
    $warnings.Add("winget invocation failed: $($_.Exception.Message); falling back to direct download.")
  }
}

if (-not $installSuccess -and -not $SkipGhProbe) {
  try {
    $headers = @{ 'User-Agent' = 'Cats-Setup-Helper'; 'Accept' = 'application/vnd.github+json' }
    $latest = Invoke-RestMethod -Uri $GhReleasesApi -Headers $headers -UseBasicParsing -TimeoutSec 30
    if ($null -eq $latest -or [string]::IsNullOrWhiteSpace($latest.tag_name)) {
      throw 'GitHub Releases API returned an empty payload.'
    }
    $latestVersion = $latest.tag_name -replace '^v', ''
    $msiAsset = $latest.assets | Where-Object { $_.name -match 'windows_amd64\.msi$' } | Select-Object -First 1
    if ($null -eq $msiAsset) {
      throw 'No windows_amd64.msi asset found in latest GitHub CLI release.'
    }

    $msiPath = Join-Path $env:TEMP $msiAsset.name
    Invoke-WebRequest -Uri $msiAsset.browser_download_url -OutFile $msiPath -UseBasicParsing
    $applied.Add("downloaded_msi_v$latestVersion")

    $msiArgs = @('/i', $msiPath, '/qn', '/norestart')
    if ($mode -eq 'force') {
      $msiArgs += @('REINSTALLMODE=vamus', 'REINSTALL=ALL')
    }

    $msiResult = Invoke-HiddenCommand -FileName 'msiexec.exe' -ArgumentList $msiArgs
    if ($msiResult.ExitCode -eq 0) {
      $installSuccess = $true
      $applied.Add("msi_install_v$latestVersion")
    } else {
      $warnings.Add("msiexec exited $($msiResult.ExitCode).")
    }
  } catch {
    $warnings.Add("Direct download failed: $($_.Exception.Message)")
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
    -ManualSteps @('Install GitHub CLI manually from https://cli.github.com/.') `
  ) -ExitCode 1
}

# Refresh PATH so subsequent helpers can find the new gh binary
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
  [System.Environment]::GetEnvironmentVariable('Path', 'User')

$postCommandPath = Resolve-GhCommandPath
$postVersion = Get-GhDetectedVersion -Override ''

Write-StructuredResult -Result (New-Result `
  -Mode $mode `
  -Status 'ready' `
  -Installed $true `
  -DetectedVersion $postVersion `
  -CommandPath $postCommandPath `
  -AppliedChanges $applied.ToArray() `
  -Warnings $warnings.ToArray() `
  -Interruptions @([pscustomobject]@{ kind = 'relaunch_required'; reason = 'PATH was extended; relaunch downstream tools.' }) `
) -ExitCode 0
