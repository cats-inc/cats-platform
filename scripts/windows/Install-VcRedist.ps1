<#
.SYNOPSIS
    Install or update the Microsoft Visual C++ 2015-2022 Redistributable (x64).

.DESCRIPTION
    Rust binaries built with the MSVC toolchain (codex, native Claude/Cursor/
    Kiro/Goose backends, future Rust-based CLIs) link against the modern VC++
    runtime, including vcruntime140_1.dll which Microsoft only began shipping
    with Visual Studio 2019 16.7. Older Windows machines that have an older
    redist (vcruntime140.dll + msvcp140.dll, but no _1) launch those binaries
    successfully but exit with 0xC0000135 (STATUS_DLL_NOT_FOUND) before any
    output reaches the shell — looking like "the CLI did nothing".

    The helper installs the latest 2015-2022 redist via winget when available
    and falls back to Microsoft's permanent aka.ms download otherwise. It
    requires Administrator rights for the actual mutation; CheckOnly stays
    user-scoped so the Settings>Runtime UI can probe state without UAC.

    -Uninstall is intentionally omitted: removing the redist mid-flight would
    break every Rust-based CLI on the host, so uninstalling must remain a
    manual step.
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
  [switch]$SkipProbe,
  [switch]$SkipElevation,
  [string]$ResultRelayPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')

$HelperId = 'windows-vcredist-installer'
$DisplayName = 'Microsoft Visual C++ 2015-2022 Redistributable (x64)'
$WingetPackageId = 'Microsoft.VCRedist.2015+.x64'
$RedistDownloadUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
$VcRuntimeProbeDll = Join-Path $env:SystemRoot 'System32\vcruntime140_1.dll'
$VcRedistRegistrySubKey = 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64'

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
  }

  exit $ExitCode
}

function New-Result {
  param(
    [string]$Mode,
    [string]$Status,
    [bool]$Installed,
    [string]$DetectedVersion = '',
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
    detectedVersion = $DetectedVersion
    plannedActions = $PlannedActions
    appliedChanges = $AppliedChanges
    warnings = $Warnings
    manualSteps = $ManualSteps
    interruptions = $Interruptions
  }
}

function Test-VcRedistInstalled {
  if ($InstallState -eq 'installed') {
    return $true
  }
  if ($InstallState -eq 'missing') {
    return $false
  }
  if ($SkipProbe) {
    return $false
  }
  return Test-Path -LiteralPath $VcRuntimeProbeDll -PathType Leaf
}

function Get-VcRedistDetectedVersion {
  param([string]$Override)

  if (-not [string]::IsNullOrWhiteSpace($Override)) {
    return $Override
  }
  if ($SkipProbe) {
    return ''
  }

  # Read the redist version directly via [Microsoft.Win32.Registry] so the
  # helper does not depend on Microsoft.PowerShell.Management autoloading
  # under bridge-style spawns (see Setup-CliReadiness for the same pattern).
  try {
    $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($VcRedistRegistrySubKey)
    if ($null -eq $key) {
      return ''
    }
    try {
      $value = $key.GetValue('Version')
    } finally {
      $key.Dispose()
    }
    if ($null -eq $value) {
      return ''
    }
    return [string]$value
  } catch {
    return ''
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

$mutationCount = @($Apply, $Upgrade, $Force | Where-Object { $_ }).Count
if ($CheckOnly -and $mutationCount -gt 0) {
  throw 'Install-VcRedist.ps1 accepts either -CheckOnly or one mutation mode.'
}
if ($mutationCount -gt 1) {
  throw 'Install-VcRedist.ps1 accepts at most one of -Apply / -Upgrade / -Force.'
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

$installed = Test-VcRedistInstalled
$detected = Get-VcRedistDetectedVersion -Override $DetectedVersion

if ($mode -eq 'check') {
  $status = if ($installed) { 'ready' } else { 'changes_required' }
  $planned = if ($installed) { @() } else { @('install_vcredist') }
  Write-StructuredResult -Result (New-Result `
    -Mode $mode `
    -Status $status `
    -Installed $installed `
    -DetectedVersion $detected `
    -PlannedActions $planned `
  ) -ExitCode 0
}

if ($mode -eq 'apply' -and $installed) {
  Write-StructuredResult -Result (New-Result `
    -Mode $mode `
    -Status 'ready' `
    -Installed $true `
    -DetectedVersion $detected `
  ) -ExitCode 0
}

# Self-elevate for mutation operations
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $SkipElevation) {
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
  if ($SkipProbe) { $relayArgs += '-SkipProbe' }
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
          # Child crashed before writing; fall through to synthesized failure.
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

if ($wingetExists -and -not $SkipProbe) {
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

    # Winget exit codes: 0 = success; -1978335189 (0x8A15002B) = already up-to-date; 1 = no upgrade available
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

if (-not $installSuccess -and -not $SkipProbe) {
  try {
    $installerPath = Join-Path $env:TEMP 'vc_redist.x64.exe'
    Invoke-WebRequest -Uri $RedistDownloadUrl -OutFile $installerPath -UseBasicParsing
    $applied.Add('downloaded_vc_redist_x64')

    $redistArgs = @('/install', '/quiet', '/norestart')
    $redistResult = Invoke-HiddenCommand -FileName $installerPath -ArgumentList $redistArgs
    # 0 = success, 1638 = newer version already installed, 3010 = success + reboot required
    if ($redistResult.ExitCode -in @(0, 1638, 3010)) {
      $installSuccess = $true
      $applied.Add("vc_redist_install_exit_$($redistResult.ExitCode)")
    } else {
      $warnings.Add("vc_redist installer exited $($redistResult.ExitCode).")
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
    -AppliedChanges $applied.ToArray() `
    -Warnings $warnings.ToArray() `
    -ManualSteps @("Install $DisplayName manually from $RedistDownloadUrl.") `
  ) -ExitCode 1
}

$postInstalled = Test-VcRedistInstalled
$postVersion = Get-VcRedistDetectedVersion -Override ''

Write-StructuredResult -Result (New-Result `
  -Mode $mode `
  -Status 'ready' `
  -Installed $postInstalled `
  -DetectedVersion $postVersion `
  -AppliedChanges $applied.ToArray() `
  -Warnings $warnings.ToArray() `
) -ExitCode 0
