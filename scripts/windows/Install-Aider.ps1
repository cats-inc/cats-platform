<#
.SYNOPSIS
    Install or verify the native Windows Aider for Cats.

.DESCRIPTION
    Cats-owned packaged setup wrapper for Aider. The official installer is the
    uv installer plus `uv tool install --force --python python3.12 --with pip
    aider-chat@latest`, so the entry point at %USERPROFILE%\.local\bin\aider.exe
    is a uv tool shim rather than the tool itself. Uninstall therefore runs
    `uv tool uninstall aider-chat` before removing paths.

    Cats installs and detects Aider but cannot run sessions through it: 0.86.2
    has no machine-readable output, no ACP or server mode, and exits 0 even when
    the model call fails.
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

function Resolve-AiderInstallDir {
  return Join-Path $env:USERPROFILE '.local\bin'
}

function Resolve-AiderExecutablePath {
  return Join-Path (Resolve-AiderInstallDir) 'aider.exe'
}

function Refresh-UserPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}

function Detect-AiderInstall {
  $exePath = Resolve-AiderExecutablePath

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
  $command = Get-Command aider -ErrorAction SilentlyContinue
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

function Add-AiderToUserPath {
  $installDir = Resolve-AiderInstallDir
  $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if ([string]::IsNullOrWhiteSpace($userPath)) {
    [System.Environment]::SetEnvironmentVariable('Path', $installDir, 'User')
  } elseif ($userPath -notlike "*$installDir*") {
    [System.Environment]::SetEnvironmentVariable('Path', "$installDir;$userPath", 'User')
  }
  Refresh-UserPath
}

function Invoke-AiderInstaller {
  if ($SkipInstaller) {
    return [pscustomobject]@{ skipped = $true; success = $true; exitCode = 0; stderr = '' }
  }

  $tempScript = [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    "cats-aider-install-$([System.Guid]::NewGuid().ToString('N')).ps1"
  )
  $stdoutPath = "$tempScript.stdout"
  $stderrPath = "$tempScript.stderr"
  $bootstrap = @'
& {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    Invoke-RestMethod 'https://aider.chat/install.ps1' | Invoke-Expression
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}
'@

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
      stderr = "Failed to invoke Aider installer: $($_.Exception.Message)"
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
  throw 'Install-Aider.ps1 -Uninstall is mutually exclusive with other modes.'
}
if ($CheckOnly -and $mutationCount -gt 0) {
  throw 'Install-Aider.ps1 accepts either -CheckOnly or one mutation mode.'
}
if ($mutationCount -gt 1) {
  throw 'Install-Aider.ps1 accepts at most one of -Apply / -Upgrade / -Force.'
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
  # %USERPROFILE%\.local\bin\aider.exe is a uv tool shim, not the tool.
  # Removing only the shim leaves aider-chat installed in the uv tool
  # environment, so uv uninstalls it first and path removal mops up the rest.
  #
  # The uv binary itself is deliberately left alone: Aider's installer drops its
  # own uv next to the shim, users commonly have another, and the helper cannot
  # tell them apart (SPEC-112 PD4).
  if (-not $DryRun) {
    if (Get-Command uv -ErrorAction SilentlyContinue) {
      & uv tool uninstall aider-chat 2>$null | Out-Null
    }
  }

  Invoke-PackagedProviderUninstall `
    -HelperId 'windows-aider-native-installer' `
    -UserBinaryPath (Resolve-AiderExecutablePath) `
    -ExtraUserOwnedPaths @() `
    -RedetectCommand { Detect-AiderInstall } `
    -EmitJson:$Json `
    -DryRun:$DryRun
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin -and -not $AllowAdmin) {
  Write-StructuredResult -Result ([pscustomobject]@{
      helper = 'windows-aider-native-installer'
      mode = $executionMode
      status = 'failed'
      installed = $false
      detectedVersion = $null
      commandPath = Resolve-AiderExecutablePath
      restartRequired = $false
      plannedActions = @()
      warnings = @('Refusing to run under an elevated shell without -AllowAdmin because Aider is intended for user-scoped installation.')
      appliedChanges = @()
      manualSteps = @()
      interruptions = @()
    }) -ExitCode 1
}

$detected = Detect-AiderInstall
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()

if ($Force) {
  $plannedActions.Add('reinstall_aider_native')
} elseif ($Upgrade -and $detected.installed) {
  $plannedActions.Add('upgrade_aider_native')
} elseif (-not $detected.installed) {
  $plannedActions.Add('install_aider_native')
}

if ($CheckOnly) {
  Write-StructuredResult -Result ([pscustomobject]@{
      helper = 'windows-aider-native-installer'
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
    $warnings.Add('Dry-run requested; Aider installer invocation was skipped.')
    $installSkipped = $true
  } else {
    $installResult = Invoke-AiderInstaller
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
      $warnings.Add("Aider installer exited $($installResult.exitCode): $stderrSnippet")
    }

    Start-Sleep -Seconds 2
    Add-AiderToUserPath
    $detected = Detect-AiderInstall
    if (-not $detected.installed -and -not $installSkipped -and -not $installFailed) {
      $warnings.Add('Aider installation completed but aider.exe was not detected at the expected path.')
      $installFailed = $true
    }
  }

  if (-not $installFailed -and -not ($DryRun -and $shouldInstall)) {
    if ($Force) {
      $appliedChanges.Add('reinstall_aider_native')
    } elseif ($Upgrade) {
      $appliedChanges.Add('upgrade_aider_native')
    } else {
      $appliedChanges.Add('install_aider_native')
    }
  }
}

$manualSteps.Add('Run `aider login` or set XAI_API_KEY before first use.')
$interruptions = [System.Collections.Generic.List[object]]::new()
if ($shouldInstall -and -not $installFailed -and -not $DryRun) {
  $interruptions.Add([pscustomobject]@{
      kind = 'relaunch_required'
      summary = 'Relaunch Cats Desktop Host after the Aider install step, then rerun the packaged setup check.'
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
    helper = 'windows-aider-native-installer'
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
