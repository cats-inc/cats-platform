<#
.SYNOPSIS
    Install or verify the native Windows Goose CLI for Cats.

.DESCRIPTION
    Rewrites the stable native Windows Goose installer knowledge from
    environment-bootstrap into a Cats-owned packaged setup helper. The helper
    supports check-only mode for packaged-host orchestration and emits a
    structured JSON result.

.PARAMETER CheckOnly
    Report native Goose CLI readiness without mutating the local machine.

.PARAMETER Apply
    Install Goose CLI if it is missing.

.PARAMETER Upgrade
    Re-run the official installer when Goose CLI is already present.

.PARAMETER Force
    Force a reinstall by re-running the official installer.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER AllowAdmin
    Allow execution under an elevated shell.

.PARAMETER InstallState
    Override installation detection for deterministic tests.

.PARAMETER DetectedVersion
    Override the detected version for deterministic tests.

.PARAMETER AuthState
    Override post-install authentication detection for deterministic tests.

.PARAMETER SkipInstaller
    Skip the actual installer invocation. Intended for deterministic tests.
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
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$AuthState = 'auto',
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
    if ($Result.detectedVersion) {
      Write-Host "Version: $($Result.detectedVersion)"
    }
    foreach ($action in $Result.plannedActions) {
      Write-Host "Planned action: $action"
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

function Resolve-GooseExecutablePath {
  return Join-Path $env:USERPROFILE '.local\bin\goose.exe'
}

function Resolve-GooseConfigPath {
  if (-not [string]::IsNullOrWhiteSpace($env:GOOSE_CONFIG_PATH)) {
    return $env:GOOSE_CONFIG_PATH
  }
  return Join-Path $env:USERPROFILE '.config\goose\config.yaml'
}

function Refresh-UserPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}

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

function Detect-GooseInstall {
  $gooseExecutablePath = Resolve-GooseExecutablePath

  if ($InstallState -eq 'installed') {
    return [pscustomobject]@{
      installed = $true
      commandPath = $gooseExecutablePath
      detectedVersion = $DetectedVersion
    }
  }

  if ($InstallState -eq 'missing') {
    return [pscustomobject]@{
      installed = $false
      commandPath = $gooseExecutablePath
      detectedVersion = $DetectedVersion
    }
  }

  Refresh-UserPath
  $command = Get-Command goose -ErrorAction SilentlyContinue
  $installed = $null -ne $command -or (Test-Path -LiteralPath $gooseExecutablePath -PathType Leaf)
  $version = $DetectedVersion
  $commandPath = if ($null -ne $command) { $command.Source } else { $gooseExecutablePath }
  $commandSource = if ($null -ne $command) { $command.Source } else { '' }
  $versionProbePath = Resolve-HiddenVersionProbePath `
    -PreferredPath $commandSource `
    -FallbackPath $gooseExecutablePath

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

function Test-GooseAuthSatisfied {
  switch ($AuthState) {
    'authenticated' {
      return $true
    }
    'auth_required' {
      return $false
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY) -or
      -not [string]::IsNullOrWhiteSpace($env:ANTHROPIC_API_KEY)) {
    return $true
  }

  $configPath = Resolve-GooseConfigPath
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    return $false
  }

  try {
    $configContents = Get-Content -LiteralPath $configPath -Raw
    return -not [string]::IsNullOrWhiteSpace($configContents)
  } catch {
    return $false
  }
}

function Invoke-GooseInstaller {
  if ($SkipInstaller) {
    return [pscustomobject]@{
      skipped = $true
      success = $true
      exitCode = 0
      stderr = ''
    }
  }

  $tempScript = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(),
    "cats-goose-install-$([System.Guid]::NewGuid().ToString('N')).ps1")
  $stdoutPath = "$tempScript.stdout"
  $stderrPath = "$tempScript.stderr"

  try {
    # Persist the upstream installer to disk and run it in a child PowerShell.
    # Using a child process instead of Invoke-Expression decouples our outer
    # Set-StrictMode + $ErrorActionPreference='Stop' contract from the upstream
    # script, so its `Write-Error` / `exit 1` paths terminate the child only
    # and let this wrapper continue to emit a structured result with the
    # captured stderr — instead of dying silently and producing no JSON for
    # the bridge to surface.
    $installScript = Invoke-RestMethod 'https://raw.githubusercontent.com/block/goose/main/download_cli.ps1'
    [System.IO.File]::WriteAllText($tempScript, [string]$installScript, [System.Text.UTF8Encoding]::new($false))

    $env:CONFIGURE = 'false'
    $process = Start-Process -FilePath 'powershell.exe' `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tempScript) `
      -Wait -PassThru -NoNewWindow `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    $stderrRaw = if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
      Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
    } else { $null }
    $stderr = if ($null -eq $stderrRaw) { '' } else { [string]$stderrRaw }

    return [pscustomobject]@{
      skipped = $false
      success = ($process.ExitCode -eq 0)
      exitCode = $process.ExitCode
      stderr = [string]$stderr
    }
  } catch {
    return [pscustomobject]@{
      skipped = $false
      success = $false
      exitCode = -1
      stderr = "Failed to invoke Goose installer: $($_.Exception.Message)"
    }
  } finally {
    Remove-Item Env:\CONFIGURE -ErrorAction SilentlyContinue
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

if ($Uninstall -and ($CheckOnly -or $Apply -or $Upgrade -or $Force)) {
  throw 'Install-Goose.ps1 -Uninstall is mutually exclusive with other modes.'
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-Goose.ps1 accepts either -CheckOnly or one mutation mode.'
}

if ($Force -and $Upgrade) {
  $Upgrade = $false
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
    -HelperId 'windows-goose-native-installer' `
    -UserBinaryPath (Resolve-GooseExecutablePath) `
    -RedetectCommand { Detect-GooseInstall } `
    -EmitJson:$Json `
    -DryRun:$DryRun
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin -and -not $AllowAdmin) {
  $result = [pscustomobject]@{
    helper = 'windows-goose-native-installer'
    mode = $executionMode
    status = 'failed'
    installed = $false
    detectedVersion = $null
    commandPath = Resolve-GooseExecutablePath
    restartRequired = $false
    plannedActions = @()
    warnings = @(
      'Refusing to run under an elevated shell without -AllowAdmin because Goose CLI is intended for user-scoped installation.'
    )
    appliedChanges = @()
    manualSteps = @()
    interruptions = @()
  }
  Write-StructuredResult -Result $result -ExitCode 1
}

$detected = Detect-GooseInstall
$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()
$authSatisfied = [bool]$detected.installed -and (Test-GooseAuthSatisfied)

$windowsArchitecture = Get-WindowsArchitecture
if ($windowsArchitecture -eq 'ARM64') {
  $warnings.Add('Goose CLI does not ship a native ARM64 Windows binary. It will run under x64 emulation with reduced performance.')
}

if (-not $detected.installed) {
  $plannedActions.Add('install_goose_native')
}

if ($CheckOnly) {
  $status = if ($detected.installed) {
    if ($authSatisfied) { 'ready' } else { 'auth_required' }
  } else {
    'not_installed'
  }
  $checkManualSteps = [System.Collections.Generic.List[object]]::new()
  $checkInterruptions = [System.Collections.Generic.List[object]]::new()
  if ($status -eq 'auth_required') {
    $checkManualSteps.Add('Run goose configure, or set OPENAI_API_KEY / ANTHROPIC_API_KEY before first use.')
    $checkInterruptions.Add([pscustomobject]@{
        kind = 'auth_required'
        summary = 'Complete goose configure or set OPENAI_API_KEY / ANTHROPIC_API_KEY, then rerun the packaged setup check.'
        resumable = $true
        requiresRestart = $false
        requiresElevation = $false
      })
  }

  $result = [pscustomobject]@{
    helper = 'windows-goose-native-installer'
    mode = 'check'
    status = $status
    installed = [bool]$detected.installed
    detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
    commandPath = $detected.commandPath
    restartRequired = $false
    plannedActions = $plannedActions.ToArray()
    warnings = $warnings.ToArray()
    appliedChanges = @()
    manualSteps = $checkManualSteps.ToArray()
    interruptions = $checkInterruptions.ToArray()
  }
  Write-StructuredResult -Result $result -ExitCode 0
}

$shouldInstall = $Force -or $Upgrade -or -not $detected.installed
$installFailed = $false
$installSkipped = $false
if ($shouldInstall) {
  $installResult = Invoke-GooseInstaller
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
    $warnings.Add("Goose installer exited $($installResult.exitCode): $stderrSnippet")
  }
  $warnings.Add('Goose may require Windows Defender approval before the binary becomes available.')

  Start-Sleep -Seconds 2
  $detected = Detect-GooseInstall
  if (-not $detected.installed -and -not $installSkipped -and -not $installFailed) {
    $warnings.Add('Goose installation completed but goose.exe was not detected at the expected path.')
    $installFailed = $true
  }

  if ($installFailed) {
    # No applied change to record when the install did not produce a binary.
  } elseif ($Force) {
    $appliedChanges.Add('reinstall_goose_native')
  } elseif ($Upgrade) {
    $appliedChanges.Add('upgrade_goose_native')
  } else {
    $appliedChanges.Add('install_goose_native')
  }
}

$manualSteps.Add('Run `goose configure`, or set OPENAI_API_KEY / ANTHROPIC_API_KEY before first use.')
$authSatisfied = [bool]$detected.installed -and (Test-GooseAuthSatisfied)
$interruptions = [System.Collections.Generic.List[object]]::new()
if ($shouldInstall -and -not $installFailed) {
  $interruptions.Add([pscustomobject]@{
      kind = 'relaunch_required'
      summary = 'Relaunch Cats Desktop Host after the Goose install step, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}
if (-not $installFailed -and -not $authSatisfied) {
  $interruptions.Add([pscustomobject]@{
      kind = 'auth_required'
      summary = 'Complete goose configure or set OPENAI_API_KEY / ANTHROPIC_API_KEY, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $false
    })
}

$status = if ($installFailed) {
  'failed'
} elseif ($interruptions.Count -gt 0) {
  [string]$interruptions[0].kind
} else {
  'ready'
}

$result = [pscustomobject]@{
  helper = 'windows-goose-native-installer'
  mode = $executionMode
  status = $status
  installed = [bool]$detected.installed
  detectedVersion = if ($detected.detectedVersion) { $detected.detectedVersion } else { $null }
  commandPath = $detected.commandPath
  restartRequired = $false
  plannedActions = @()
  warnings = $warnings.ToArray()
  appliedChanges = $appliedChanges.ToArray()
  manualSteps = $manualSteps.ToArray()
  interruptions = $interruptions.ToArray()
}
$exitCode = if ($installFailed) { 1 } else { 0 }
Write-StructuredResult -Result $result -ExitCode $exitCode
