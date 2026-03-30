<#
.SYNOPSIS
    Install or repair Kiro CLI inside the Cats WSL substrate.

.DESCRIPTION
    Rewrites the Kiro-specific WSL installer knowledge from
    environment-bootstrap into a Cats-owned packaged setup helper. The helper
    depends on the repo-owned WSL substrate helper for distro readiness, then
    handles:

    - Kiro CLI install / upgrade / reinstall inside the target distro
    - cleanup of hard-coded PATH lines emitted by the upstream installer
    - ensuring `~/.local/bin` remains on PATH
    - ensuring the `kc` alias exists
    - surfacing the required post-install sign-in step

.PARAMETER CheckOnly
    Report Kiro CLI readiness without mutating the machine.

.PARAMETER Apply
    Install Kiro CLI if it is missing and repair the shell profile if needed.

.PARAMETER Upgrade
    Re-run the Kiro installer inside WSL and re-apply profile repairs.

.PARAMETER Force
    Reinstall Kiro CLI and re-apply profile repairs.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER Distro
    WSL distro to target. Defaults to Ubuntu.

.PARAMETER WslState
    Override WSL substrate detection for deterministic tests.

.PARAMETER InstalledDistrosJson
    Override the detected distro list as a JSON array for deterministic tests.

.PARAMETER DependencyState
    Override curl/unzip detection for deterministic tests.

.PARAMETER InstallState
    Override Kiro install detection for deterministic tests.

.PARAMETER PathState
    Override bashrc PATH repair detection for deterministic tests.

.PARAMETER AliasState
    Override bashrc alias detection for deterministic tests.

.PARAMETER DetectedVersion
    Override the detected Kiro version for deterministic tests.

.PARAMETER SkipInstaller
    Skip the actual installer invocation. Intended for deterministic tests.

.PARAMETER SkipProfileRepair
    Skip editing `.bashrc`. Intended for deterministic tests.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [string]$Distro = 'Ubuntu',
  [ValidateSet('auto', 'missing', 'installed_no_distro', 'ready')]
  [string]$WslState = 'auto',
  [string]$InstalledDistrosJson = '',
  [ValidateSet('auto', 'ready', 'missing_curl', 'missing_unzip', 'missing_both')]
  [string]$DependencyState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$InstallState = 'auto',
  [ValidateSet('auto', 'configured', 'missing')]
  [string]$PathState = 'auto',
  [ValidateSet('auto', 'configured', 'missing')]
  [string]$AliasState = 'auto',
  [string]$DetectedVersion = '',
  [switch]$SkipInstaller,
  [switch]$SkipProfileRepair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    Write-Host "Distro: $($Result.distro)"
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

function Invoke-WslEnvironmentHelper {
  $helperPath = Join-Path $PSScriptRoot 'Install-WslUbuntuEnvironment.ps1'
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
    throw "Missing WSL environment helper at $helperPath"
  }

  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $helperPath,
    '-CheckOnly',
    '-Json',
    '-Distro', $Distro
  )
  if ($WslState -ne 'auto') {
    $arguments += @('-WslState', $WslState)
  }
  if (-not [string]::IsNullOrWhiteSpace($InstalledDistrosJson)) {
    $arguments += @('-InstalledDistrosJson', $InstalledDistrosJson)
  }

  $raw = (& powershell.exe @arguments) | Out-String
  return $raw | ConvertFrom-Json
}

function Invoke-WslBash {
  param(
    [string]$Command
  )

  $output = & wsl.exe -d $Distro bash -lc $Command 2>$null
  return [pscustomobject]@{
    Output = $output
    ExitCode = $LASTEXITCODE
  }
}

function Get-DependencyStatus {
  switch ($DependencyState) {
    'ready' {
      return [pscustomobject]@{
        curlInstalled = $true
        unzipInstalled = $true
      }
    }
    'missing_curl' {
      return [pscustomobject]@{
        curlInstalled = $false
        unzipInstalled = $true
      }
    }
    'missing_unzip' {
      return [pscustomobject]@{
        curlInstalled = $true
        unzipInstalled = $false
      }
    }
    'missing_both' {
      return [pscustomobject]@{
        curlInstalled = $false
        unzipInstalled = $false
      }
    }
  }

  $curlProbe = Invoke-WslBash -Command 'command -v curl >/dev/null 2>&1'
  $unzipProbe = Invoke-WslBash -Command 'command -v unzip >/dev/null 2>&1'
  return [pscustomobject]@{
    curlInstalled = ($curlProbe.ExitCode -eq 0)
    unzipInstalled = ($unzipProbe.ExitCode -eq 0)
  }
}

function Get-KiroInstallStatus {
  if ($InstallState -eq 'installed') {
    return [pscustomobject]@{
      installed = $true
      detectedVersion = $DetectedVersion
    }
  }
  if ($InstallState -eq 'missing') {
    return [pscustomobject]@{
      installed = $false
      detectedVersion = $DetectedVersion
    }
  }

  $installProbe = Invoke-WslBash -Command 'test -x ~/.local/bin/kiro-cli'
  $installed = ($installProbe.ExitCode -eq 0)
  $version = $DetectedVersion
  if ($installed -and [string]::IsNullOrWhiteSpace($version)) {
    $versionProbe = Invoke-WslBash -Command '~/.local/bin/kiro-cli --version 2>/dev/null'
    if ($versionProbe.ExitCode -eq 0) {
      $version = (($versionProbe.Output | Out-String).Trim())
    }
  }

  return [pscustomobject]@{
    installed = $installed
    detectedVersion = $version
  }
}

function Get-BashrcConfigStatus {
  param(
    [ValidateSet('path', 'alias')]
    [string]$Kind
  )

  $override = if ($Kind -eq 'path') { $PathState } else { $AliasState }
  if ($override -eq 'configured') {
    return $true
  }
  if ($override -eq 'missing') {
    return $false
  }

  $command = if ($Kind -eq 'path') {
    "test -f ~/.bashrc && grep -Fqx 'export PATH=""\$HOME/.local/bin:\$PATH""' ~/.bashrc"
  } else {
    "test -f ~/.bashrc && grep -Fqx ""alias kc='kiro-cli'"" ~/.bashrc"
  }
  $probe = Invoke-WslBash -Command $command
  return ($probe.ExitCode -eq 0)
}

function Repair-Bashrc {
  if ($SkipProfileRepair) {
    return
  }

  $cleanupCommand = @'
touch ~/.bashrc
sed -i '/^export PATH=.*\/mnt\/c\//d' ~/.bashrc
grep -Fqx 'export PATH="$HOME/.local/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
grep -Fqx "alias kc='kiro-cli'" ~/.bashrc || echo "alias kc='kiro-cli'" >> ~/.bashrc
'@
  $result = Invoke-WslBash -Command $cleanupCommand
  if ($result.ExitCode -ne 0) {
    throw 'Failed to repair ~/.bashrc for Kiro CLI usage.'
  }
}

function Remove-KiroInstallation {
  if ($SkipInstaller) {
    return
  }

  $cleanup = Invoke-WslBash -Command 'rm -f ~/.local/bin/kiro-cli ~/.local/bin/kiro-cli-chat'
  if ($cleanup.ExitCode -ne 0) {
    throw 'Failed to remove the existing Kiro CLI binaries.'
  }
}

function Invoke-KiroInstaller {
  if ($SkipInstaller) {
    return
  }

  $forceFlag = if ($Force -or $Upgrade) { '--force' } else { '' }
  $command = "curl -fsSL https://cli.kiro.dev/install -o /tmp/kiro-install.sh && chmod +x /tmp/kiro-install.sh && bash /tmp/kiro-install.sh $forceFlag < /dev/null 2>&1; status=`$?; rm -f /tmp/kiro-install.sh; exit `$status"
  $result = Invoke-WslBash -Command $command
  if ($result.ExitCode -ne 0) {
    throw 'Kiro CLI installer failed inside WSL.'
  }
}

function New-Result {
  param(
    [string]$Mode,
    [string]$Status,
    [pscustomobject]$WslEnvironment,
    [pscustomobject]$Dependencies,
    [bool]$Installed,
    [string]$DetectedVersion,
    [bool]$PathConfigured,
    [bool]$AliasConfigured,
    [string[]]$PlannedActions,
    [string[]]$AppliedChanges,
    [string[]]$Warnings,
    [string[]]$ManualSteps,
    [object[]]$Interruptions
  )

  return [pscustomobject]@{
    helper = 'windows-kiro-wsl-installer'
    mode = $Mode
    status = $Status
    distro = $Distro
    wslEnvironment = $WslEnvironment
    dependencies = [pscustomobject]@{
      curlInstalled = [bool]$Dependencies.curlInstalled
      unzipInstalled = [bool]$Dependencies.unzipInstalled
    }
    installed = $Installed
    detectedVersion = if ([string]::IsNullOrWhiteSpace($DetectedVersion)) { $null } else { $DetectedVersion }
    pathConfigured = $PathConfigured
    aliasConfigured = $AliasConfigured
    plannedActions = $PlannedActions
    appliedChanges = $AppliedChanges
    warnings = $Warnings
    manualSteps = $ManualSteps
    interruptions = $Interruptions
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-KiroWslCli.ps1 accepts either -CheckOnly or one mutation mode.'
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

$wslEnvironment = Invoke-WslEnvironmentHelper
$dependencies = if ([string]$wslEnvironment.status -eq 'ready') {
  Get-DependencyStatus
} else {
  [pscustomobject]@{
    curlInstalled = $false
    unzipInstalled = $false
  }
}
$installStatus = if ([string]$wslEnvironment.status -eq 'ready') {
  Get-KiroInstallStatus
} else {
  [pscustomobject]@{
    installed = $false
    detectedVersion = ''
  }
}
$pathConfigured = if ([string]$wslEnvironment.status -eq 'ready') {
  Get-BashrcConfigStatus -Kind 'path'
} else {
  $false
}
$aliasConfigured = if ([string]$wslEnvironment.status -eq 'ready') {
  Get-BashrcConfigStatus -Kind 'alias'
} else {
  $false
}

$plannedActions = [System.Collections.Generic.List[string]]::new()
$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()

if ([string]$wslEnvironment.status -ne 'ready') {
  foreach ($action in @($wslEnvironment.plannedActions)) {
    $plannedActions.Add("wsl_environment:$action")
  }
}

if ([string]$wslEnvironment.status -eq 'ready' -and -not [bool]$dependencies.curlInstalled) {
  $plannedActions.Add('install_wsl_dependency:curl')
}
if ([string]$wslEnvironment.status -eq 'ready' -and -not [bool]$dependencies.unzipInstalled) {
  $plannedActions.Add('install_wsl_dependency:unzip')
}
if ([string]$wslEnvironment.status -eq 'ready' -and -not [bool]$installStatus.installed) {
  $plannedActions.Add('install_kiro_cli_wsl')
}
if ([string]$wslEnvironment.status -eq 'ready' -and [bool]$installStatus.installed -and -not $pathConfigured) {
  $plannedActions.Add('repair_wsl_local_bin_path')
}
if ([string]$wslEnvironment.status -eq 'ready' -and [bool]$installStatus.installed -and -not $aliasConfigured) {
  $plannedActions.Add('repair_kc_alias')
}

if ($CheckOnly) {
  $status = if ([string]$wslEnvironment.status -ne 'ready') {
    if ([string]$wslEnvironment.status -eq 'first_wsl_boot_required') {
      'first_wsl_boot_required'
    } else {
      'changes_required'
    }
  } elseif (-not [bool]$dependencies.curlInstalled -or -not [bool]$dependencies.unzipInstalled) {
    'changes_required'
  } elseif (-not [bool]$installStatus.installed) {
    'not_installed'
  } elseif (-not $pathConfigured -or -not $aliasConfigured) {
    'changes_required'
  } else {
    'ready'
  }

  $result = New-Result `
    -Mode 'check' `
    -Status $status `
    -WslEnvironment $wslEnvironment `
    -Dependencies $dependencies `
    -Installed ([bool]$installStatus.installed) `
    -DetectedVersion ([string]$installStatus.detectedVersion) `
    -PathConfigured $pathConfigured `
    -AliasConfigured $aliasConfigured `
    -PlannedActions $plannedActions.ToArray() `
    -AppliedChanges @() `
    -Warnings @() `
    -ManualSteps @() `
    -Interruptions @($wslEnvironment.interruptions)
  Write-StructuredResult -Result $result -ExitCode 0
}

try {
  if ([string]$wslEnvironment.status -ne 'ready') {
    $warnings.Add('Run the repo-owned WSL substrate helper before installing Kiro CLI.')
    $result = New-Result `
      -Mode $executionMode `
      -Status $(if ([string]$wslEnvironment.status -eq 'first_wsl_boot_required') {
          'first_wsl_boot_required'
        } else {
          'failed'
        }) `
      -WslEnvironment $wslEnvironment `
      -Dependencies $dependencies `
      -Installed ([bool]$installStatus.installed) `
      -DetectedVersion ([string]$installStatus.detectedVersion) `
      -PathConfigured $pathConfigured `
      -AliasConfigured $aliasConfigured `
      -PlannedActions $plannedActions.ToArray() `
      -AppliedChanges @() `
      -Warnings $warnings.ToArray() `
      -ManualSteps @() `
      -Interruptions @($wslEnvironment.interruptions)
    Write-StructuredResult -Result $result -ExitCode 1
  }

  if (-not [bool]$dependencies.curlInstalled -or -not [bool]$dependencies.unzipInstalled) {
    if (-not [bool]$dependencies.curlInstalled) {
      $warnings.Add('curl is missing inside the target WSL distro.')
    }
    if (-not [bool]$dependencies.unzipInstalled) {
      $warnings.Add('unzip is missing inside the target WSL distro.')
    }
    $manualSteps.Add("Install the missing packages inside WSL, for example: wsl -d $Distro -- sudo apt-get update && sudo apt-get install -y curl unzip")
    $result = New-Result `
      -Mode $executionMode `
      -Status 'failed' `
      -WslEnvironment $wslEnvironment `
      -Dependencies $dependencies `
      -Installed ([bool]$installStatus.installed) `
      -DetectedVersion ([string]$installStatus.detectedVersion) `
      -PathConfigured $pathConfigured `
      -AliasConfigured $aliasConfigured `
      -PlannedActions $plannedActions.ToArray() `
      -AppliedChanges @() `
      -Warnings $warnings.ToArray() `
      -ManualSteps $manualSteps.ToArray() `
      -Interruptions @()
    Write-StructuredResult -Result $result -ExitCode 1
  }

  if ($Force -and [bool]$installStatus.installed) {
    Remove-KiroInstallation
    $appliedChanges.Add('remove_existing_kiro_cli_wsl')
    $installStatus = [pscustomobject]@{
      installed = $false
      detectedVersion = ''
    }
  }

  if (-not [bool]$installStatus.installed -or $Upgrade -or $Force) {
    Invoke-KiroInstaller
    $appliedChanges.Add($(if ($Force) {
          'reinstall_kiro_cli_wsl'
        } elseif ($Upgrade) {
          'upgrade_kiro_cli_wsl'
        } else {
          'install_kiro_cli_wsl'
        }))
    $installStatus = [pscustomobject]@{
      installed = $true
      detectedVersion = if ([string]::IsNullOrWhiteSpace($DetectedVersion)) { 'unknown' } else { $DetectedVersion }
    }
  }

  if (-not $pathConfigured -or -not $aliasConfigured) {
    Repair-Bashrc
    if (-not $pathConfigured) {
      $appliedChanges.Add('ensure_wsl_local_bin_path')
      $pathConfigured = $true
    }
    if (-not $aliasConfigured) {
      $appliedChanges.Add('ensure_kc_alias')
      $aliasConfigured = $true
    }
  }

  $manualSteps.Add("Launch `wsl -d $Distro`, then run `kiro-cli` or `kc` to complete the Kiro sign-in flow.")

  $result = New-Result `
    -Mode $executionMode `
    -Status 'ready' `
    -WslEnvironment $wslEnvironment `
    -Dependencies $dependencies `
    -Installed ([bool]$installStatus.installed) `
    -DetectedVersion ([string]$installStatus.detectedVersion) `
    -PathConfigured $pathConfigured `
    -AliasConfigured $aliasConfigured `
    -PlannedActions @() `
    -AppliedChanges $appliedChanges.ToArray() `
    -Warnings $warnings.ToArray() `
    -ManualSteps $manualSteps.ToArray() `
    -Interruptions @()
  Write-StructuredResult -Result $result -ExitCode 0
} catch {
  $warnings.Add($_.Exception.Message)
  $result = New-Result `
    -Mode $executionMode `
    -Status 'failed' `
    -WslEnvironment $wslEnvironment `
    -Dependencies $dependencies `
    -Installed ([bool]$installStatus.installed) `
    -DetectedVersion ([string]$installStatus.detectedVersion) `
    -PathConfigured $pathConfigured `
    -AliasConfigured $aliasConfigured `
    -PlannedActions $plannedActions.ToArray() `
    -AppliedChanges $appliedChanges.ToArray() `
    -Warnings $warnings.ToArray() `
    -ManualSteps $manualSteps.ToArray() `
    -Interruptions @()
  Write-StructuredResult -Result $result -ExitCode 1
}
