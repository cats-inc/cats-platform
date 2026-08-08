<#
.SYNOPSIS
    Install or verify the native Windows Devin CLI for Cats.

.DESCRIPTION
    Cats-owned packaged setup wrapper for Cognition's Devin CLI. The official
    installer places devin.exe in %LOCALAPPDATA%\devin\cli\bin and keeps
    versions under %LOCALAPPDATA%\devin\cli, both of which uninstall removes.

    The installer's final line launches the interactive devin setup wizard,
    which packaged setup strips because it runs with no console a prompt can
    reach. Authentication is therefore still owed after a successful install:
    run devin auth login once and check with devin auth status.
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
    if ($Result.detectedVersion) { Write-Host "Version: $($Result.detectedVersion)" }
    foreach ($action in $Result.plannedActions) { Write-Host "Planned action: $action" }
    foreach ($warning in $Result.warnings) { Write-Host "Warning: $warning" }
    foreach ($step in $Result.manualSteps) { Write-Host "Manual step: $step" }
  }

  exit $ExitCode
}

function Resolve-DevinInstallDir {
  return Join-Path $env:LOCALAPPDATA 'devin\cli\bin'
}

function Resolve-DevinExecutablePath {
  return Join-Path (Resolve-DevinInstallDir) 'devin.exe'
}

function Refresh-UserPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}

function Detect-DevinInstall {
  $exePath = Resolve-DevinExecutablePath

  if ($InstallState -eq 'installed') {
    return [pscustomobject]@{
      installed = $true
      commandPath = $exePath
      detectedVersion = $DetectedVersion
    }
  }
  if ($InstallState -eq 'missing') {
    return [pscustomobject]@{
      installed = $false
      commandPath = $exePath
      detectedVersion = $DetectedVersion
    }
  }

  Refresh-UserPath
  $command = Get-Command devin -ErrorAction SilentlyContinue
  $installed = $null -ne $command -or (Test-Path -LiteralPath $exePath -PathType Leaf)
  $commandPath = if ($null -ne $command) { $command.Source } else { $exePath }
  $commandSource = if ($null -ne $command) { $command.Source } else { '' }
  $version = $DetectedVersion
  $versionProbePath = Resolve-HiddenVersionProbePath `
    -PreferredPath $commandSource `
    -FallbackPath $exePath

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
  }
}

function Add-DevinToUserPath {
  $installDir = Resolve-DevinInstallDir
  $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if ([string]::IsNullOrWhiteSpace($userPath)) {
    [System.Environment]::SetEnvironmentVariable('Path', $installDir, 'User')
  } elseif ($userPath -notlike "*$installDir*") {
    [System.Environment]::SetEnvironmentVariable('Path', "$installDir;$userPath", 'User')
  }
  Refresh-UserPath
}

function Invoke-DevinInstaller {
  if ($SkipInstaller) {
    return [pscustomobject]@{ skipped = $true; success = $true; exitCode = 0; stderr = '' }
  }

  $tempScript = [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    "cats-devin-install-$([System.Guid]::NewGuid().ToString('N')).ps1"
  )
  $stdoutPath = "$tempScript.stdout"
  $stderrPath = "$tempScript.stderr"
  # Devin's setup.ps1 ends by launching the interactive `devin setup` wizard.
  # Packaged setup runs with no console a prompt can reach, so an unstripped
  # installer would stall the step rather than fail.
  #
  # Verified against https://static.devin.ai/cli/setup.ps1 on 2026-08-09: the
  # file is 234 lines and its final line is `& $EntryExe setup`, which is also
  # the only line in the file that invokes setup. The helper refuses to run the
  # script when that shape does not hold rather than executing an unrecognised
  # installer on a guess.
  $installerSource = ''
  try {
    $installerSource = Invoke-RestMethod 'https://static.devin.ai/cli/setup.ps1'
  } catch {
    return [pscustomobject]@{
      skipped = $false
      success = $false
      exitCode = -1
      stderr = "Failed to download the Devin installer: $($_.Exception.Message)"
    }
  }

  $installerLines = [regex]::Split([string]$installerSource, '\r?\n')
  $setupMatches = @($installerLines | Where-Object { $_ -match '^\s*&\s+\$EntryExe\s+setup\s*$' })
  if ($setupMatches.Count -ne 1) {
    return [pscustomobject]@{
      skipped = $false
      success = $false
      exitCode = -1
      stderr = ("Refusing to run the Devin installer: expected exactly one interactive setup " +
        "invocation, found $($setupMatches.Count). Install Devin with the upstream installer and report this.")
    }
  }

  $patchedLines = $installerLines | ForEach-Object {
    if ($_ -match '^\s*&\s+\$EntryExe\s+setup\s*$') {
      '# skipped interactive devin setup (packaged setup runs non-interactively)'
    } else {
      $_
    }
  }
  $bootstrap = ($patchedLines -join [Environment]::NewLine)

  try {
    [System.IO.File]::WriteAllText(
      $tempScript,
      $bootstrap,
      [System.Text.UTF8Encoding]::new($false)
    )
    $powerShellExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) {
      'pwsh.exe'
    } else {
      'powershell.exe'
    }
    $process = Start-Process -FilePath $powerShellExe `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tempScript) `
      -Wait -PassThru -NoNewWindow `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath
    $stderrRaw = if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
      Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
    } else { $null }

    return [pscustomobject]@{
      skipped = $false
      success = ($process.ExitCode -eq 0)
      exitCode = $process.ExitCode
      stderr = if ($null -eq $stderrRaw) { '' } else { [string]$stderrRaw }
    }
  } catch {
    return [pscustomobject]@{
      skipped = $false
      success = $false
      exitCode = -1
      stderr = "Failed to invoke Devin installer: $($_.Exception.Message)"
    }
  } finally {
    foreach ($path in @($tempScript, $stdoutPath, $stderrPath)) {
      if (Test-Path -LiteralPath $path -PathType Leaf) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force -and -not $Uninstall) {
  $CheckOnly = $true
}

$mutationCount = @($Apply, $Upgrade, $Force | Where-Object { $_ }).Count
if ($Uninstall -and ($CheckOnly -or $mutationCount -gt 0)) {
  throw 'Install-Devin.ps1 -Uninstall is mutually exclusive with other modes.'
}
if ($CheckOnly -and $mutationCount -gt 0) {
  throw 'Install-Devin.ps1 accepts either -CheckOnly or one mutation mode.'
}
if ($mutationCount -gt 1) {
  throw 'Install-Devin.ps1 accepts at most one of -Apply / -Upgrade / -Force.'
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
    -HelperId 'windows-devin-native-installer' `
    -UserBinaryPath (Resolve-DevinExecutablePath) `
    -ExtraUserOwnedPaths @((Join-Path $env:LOCALAPPDATA 'devin\cli')) `
    -RedetectCommand { Detect-DevinInstall } `
    -EmitJson:$Json `
    -DryRun:$DryRun
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin -and -not $AllowAdmin) {
  Write-StructuredResult -Result ([pscustomobject]@{
      helper = 'windows-devin-native-installer'
      mode = $executionMode
      status = 'failed'
      installed = $false
      detectedVersion = $null
      commandPath = Resolve-DevinExecutablePath
      restartRequired = $false
      plannedActions = @()
      warnings = @('Refusing to run under an elevated shell without -AllowAdmin because Devin CLI is intended for user-scoped installation.')
      appliedChanges = @()
      manualSteps = @()
      interruptions = @()
    }) -ExitCode 1
}

$detected = Detect-DevinInstall
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()

if ($Force) {
  $plannedActions.Add('reinstall_devin_native')
} elseif ($Upgrade -and $detected.installed) {
  $plannedActions.Add('upgrade_devin_native')
} elseif (-not $detected.installed) {
  $plannedActions.Add('install_devin_native')
}

if ($CheckOnly) {
  Write-StructuredResult -Result ([pscustomobject]@{
      helper = 'windows-devin-native-installer'
      mode = 'check'
      status = if ($detected.installed) { 'ready' } else { 'not_installed' }
      installed = [bool]$detected.installed
      detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
      commandPath = $detected.commandPath
      restartRequired = $false
      plannedActions = $plannedActions.ToArray()
      warnings = @()
      appliedChanges = @()
      manualSteps = @()
      interruptions = @()
    }) -ExitCode 0
}

$shouldInstall = $Force -or $Upgrade -or -not $detected.installed
$installFailed = $false
$installSkipped = $false
if ($shouldInstall) {
  if ($DryRun) {
    $warnings.Add('Dry-run requested; Devin installer invocation was skipped.')
    $installSkipped = $true
  } else {
    $installResult = Invoke-DevinInstaller
    $installSkipped = [bool]$installResult.skipped
    $installFailed = (-not $installSkipped) -and (-not $installResult.success)
    if ($installSkipped) {
      $warnings.Add('Installer invocation was skipped by request.')
    } elseif ($installFailed) {
      $stderrSnippet = if ([string]::IsNullOrWhiteSpace($installResult.stderr)) {
        'no stderr captured'
      } else {
        ($installResult.stderr.Trim() -split "`r?`n" |
          Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
          Select-Object -Last 8) -join ' | '
      }
      $warnings.Add("Devin installer exited $($installResult.exitCode): $stderrSnippet")
    }

    Start-Sleep -Seconds 2
    Add-DevinToUserPath
    $detected = Detect-DevinInstall
    if (-not $detected.installed -and -not $installSkipped -and -not $installFailed) {
      $warnings.Add('Devin installation completed but devin.exe was not detected at the expected path.')
      $installFailed = $true
    }
  }

  if (-not $installFailed -and -not ($DryRun -and $shouldInstall)) {
    if ($Force) {
      $appliedChanges.Add('reinstall_devin_native')
    } elseif ($Upgrade) {
      $appliedChanges.Add('upgrade_devin_native')
    } else {
      $appliedChanges.Add('install_devin_native')
    }
  }
}

$manualSteps.Add('Run `devin login` or set XAI_API_KEY before first use.')
$interruptions = [System.Collections.Generic.List[object]]::new()
if ($shouldInstall -and -not $installFailed -and -not $DryRun) {
  $interruptions.Add([pscustomobject]@{
      kind = 'relaunch_required'
      summary = 'Relaunch Cats Desktop Host after the Devin install step, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}

$status = if ($installFailed) {
  'failed'
} elseif ($DryRun -and $shouldInstall) {
  'preview'
} elseif ($interruptions.Count -gt 0) {
  [string]$interruptions[0].kind
} else {
  'ready'
}

Write-StructuredResult -Result ([pscustomobject]@{
    helper = 'windows-devin-native-installer'
    mode = $executionMode
    status = $status
    installed = [bool]$detected.installed
    detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
    commandPath = $detected.commandPath
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = $warnings.ToArray()
    appliedChanges = $appliedChanges.ToArray()
    manualSteps = $manualSteps.ToArray()
    interruptions = $interruptions.ToArray()
  }) -ExitCode $(if ($installFailed) { 1 } else { 0 })
