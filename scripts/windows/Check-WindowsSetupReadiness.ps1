<#
.SYNOPSIS
    Inspect Windows packaged setup readiness for Cats.

.DESCRIPTION
    Composes the repo-owned packaged setup helpers into one structured host-side
    readiness audit. The helper is read-only and reports whether the npm prefix
    substrate, the per-CLI npm-global helpers, and the bundled native provider
    helpers are ready, missing, or still require changes before deeper provider
    installation flows can proceed.

    The audit talks only to helpers that ship in DESKTOP_SETUP_ASSETS. WSL and
    Docker substrates were removed from the packaged path in earlier phases and
    are no longer covered here.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER IncludeNativeProviders
    Include native Claude/Cursor/Goose/Junie/Kiro readiness checks plus
    authentication follow-through where the provider requires it. Enabled by
    default.

.PARAMETER IncludeLocalModels
    Include local-model runtime checks such as the repo-owned Ollama helper.
    Disabled by default because the first packaged baseline remains the API
    path, not a required local-model install.

.PARAMETER Parallel
    Run independent helper checks in parallel. Enabled by default. Pass
    `$false` to force serial collection for debugging or deterministic audit
    tracing.

.PARAMETER SkipNodeCheck
    Skip probing node/npm binaries for deterministic tests.

.PARAMETER InstalledPackagesJson
    Override the installed npm package set as a JSON array for deterministic
    tests. Mapped onto each per-CLI helper's `-InstallState`.

.PARAMETER OutdatedPackagesJson
    Override the outdated npm package set as a JSON array for deterministic
    tests. Mapped onto each per-CLI helper's `-OutdatedState`.

.PARAMETER DesiredPrefix
    Override the desired npm prefix passed to the sibling prefix helper.

.PARAMETER CurrentPrefix
    Override the current npm prefix passed to the sibling prefix helper.

.PARAMETER CurrentUserPath
    Override the current user PATH passed to the sibling prefix helper.

.PARAMETER OllamaInstallState
    Override Ollama installation detection for deterministic tests.

.PARAMETER OllamaApiState
    Override Ollama local API readiness for deterministic tests.

.PARAMETER ClaudeInstallState
    Override Claude Code installation detection for deterministic tests.

.PARAMETER ClaudeAuthState
    Override Claude Code authentication detection for deterministic tests.

.PARAMETER CursorInstallState
    Override Cursor Agent installation detection for deterministic tests.

.PARAMETER CursorAuthState
    Override Cursor Agent authentication detection for deterministic tests.

.PARAMETER GooseInstallState
    Override Goose installation detection for deterministic tests.

.PARAMETER GooseAuthState
    Override Goose authentication detection for deterministic tests.

.PARAMETER JunieInstallState
    Override Junie installation detection for deterministic tests.

.PARAMETER JunieAuthState
    Override Junie authentication detection for deterministic tests.

.PARAMETER KiroInstallState
    Override Kiro CLI installation detection for deterministic tests.
#>
param(
  [switch]$Json,
  [string]$IncludeNativeProviders = 'true',
  [string]$IncludeLocalModels = 'false',
  [string]$Parallel = 'true',
  [switch]$SkipNodeCheck,
  [string]$InstalledPackagesJson = '',
  [string]$OutdatedPackagesJson = '',
  [string]$DesiredPrefix = '',
  [string]$CurrentPrefix = '',
  [string]$CurrentUserPath = '',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$ClaudeInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$ClaudeAuthState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$CursorInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$CursorAuthState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$GooseInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$GooseAuthState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$JunieInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$JunieAuthState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$KiroInstallState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$NodeHostInstallState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$OllamaInstallState = 'auto',
  [ValidateSet('auto', 'reachable', 'unreachable')]
  [string]$OllamaApiState = 'auto'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')

function Resolve-BoolArgument {
  param(
    [string]$Name,
    [string]$Value
  )

  $normalized = $Value.Trim().ToLowerInvariant()
  switch ($normalized) {
    'true' { return $true }
    '$true' { return $true }
    '1' { return $true }
    'false' { return $false }
    '$false' { return $false }
    '0' { return $false }
    default {
      throw "Invalid boolean value for -${Name}: $Value"
    }
  }
}

$includeNativeProvidersEnabled = Resolve-BoolArgument -Name 'IncludeNativeProviders' -Value $IncludeNativeProviders
$includeLocalModelsEnabled = Resolve-BoolArgument -Name 'IncludeLocalModels' -Value $IncludeLocalModels
$parallelChecksEnabled = Resolve-BoolArgument -Name 'Parallel' -Value $Parallel

function Write-StructuredResult {
  param(
    [pscustomobject]$Result
  )

  if ($Json) {
    $Result | ConvertTo-Json -Depth 10
  } else {
    Write-Host "Status: $($Result.status)"
    Write-Host "Collection mode: $($Result.collectionMode)"
    Write-Host "Native CLI pack: $($Result.nativeCliPack.status)"
    foreach ($action in $Result.plannedActions) {
      Write-Host "Planned action: $action"
    }
  }
}

function Invoke-HelperJson {
  param(
    [string]$ScriptPath,
    [string[]]$Arguments
  )

  if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
    throw "Missing helper at $ScriptPath"
  }

  $allArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $ScriptPath) + $Arguments
  $result = Invoke-HiddenCommand -FileName 'powershell.exe' -ArgumentList $allArgs
  return $result.Output | ConvertFrom-Json
}

function Invoke-HelperJsonSequence {
  param(
    [object[]]$Helpers
  )

  $results = @{}
  if ($null -eq $Helpers -or $Helpers.Count -eq 0) {
    return $results
  }

  foreach ($helper in $Helpers) {
    $results[[string]$helper.Key] = Invoke-HelperJson -ScriptPath ([string]$helper.ScriptPath) -Arguments @(
      $helper.Arguments | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ }
    )
  }

  return $results
}

function Invoke-HelperJsonBatch {
  param(
    [object[]]$Helpers
  )

  $results = @{}
  if ($null -eq $Helpers -or $Helpers.Count -eq 0) {
    return $results
  }

  $processes = [System.Collections.Generic.List[object]]::new()
  try {
    foreach ($helper in $Helpers) {
      $key = [string]$helper.Key
      $scriptPath = [string]$helper.ScriptPath
      $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath) + @(
        $helper.Arguments | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ }
      )

      if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
        throw "Missing helper at $scriptPath"
      }

      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = 'powershell.exe'
      $psi.UseShellExecute = $false
      $psi.CreateNoWindow = $true
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      if ($arguments.Count -gt 0) {
        $psi.Arguments = ($arguments | ForEach-Object {
          if ($_ -match '[\s"]') {
            '"{0}"' -f ($_ -replace '"', '\"')
          } else {
            $_
          }
        }) -join ' '
      }

      $process = [System.Diagnostics.Process]::Start($psi)
      if ($null -eq $process) {
        throw "Failed to start helper process for $key."
      }

      $processes.Add([pscustomobject]@{
          Key = $key
          Process = $process
          OutputTask = $process.StandardOutput.ReadToEndAsync()
          ErrorTask = $process.StandardError.ReadToEndAsync()
        })
    }

    foreach ($entry in $processes) {
      $entry.Process.WaitForExit()
      $output = $entry.OutputTask.GetAwaiter().GetResult().Trim()
      $errorOutput = $entry.ErrorTask.GetAwaiter().GetResult().Trim()
      if ($entry.Process.ExitCode -ne 0) {
        $segments = [System.Collections.Generic.List[string]]::new()
        if (-not [string]::IsNullOrWhiteSpace($output)) {
          $segments.Add($output)
        }
        if (-not [string]::IsNullOrWhiteSpace($errorOutput)) {
          $segments.Add($errorOutput)
        }
        throw "Helper $($entry.Key) failed with exit code $($entry.Process.ExitCode). Output: $($segments -join [System.Environment]::NewLine)"
      }
      if ([string]::IsNullOrWhiteSpace($output)) {
        throw "Helper $($entry.Key) did not emit structured output."
      }
      $results[[string]$entry.Key] = $output | ConvertFrom-Json
    }
  } finally {
    foreach ($entry in $processes) {
      if ($null -ne $entry.Process) {
        $entry.Process.Dispose()
      }
    }
  }

  return $results
}

# Map InstalledPackagesJson / OutdatedPackagesJson onto per-CLI -InstallState /
# -OutdatedState so the test fixtures stay deterministic without bulk-pack
# arguments.
$installedPackagesSet = @{}
if (-not [string]::IsNullOrWhiteSpace($InstalledPackagesJson)) {
  try {
    $parsedInstalled = $InstalledPackagesJson | ConvertFrom-Json
    foreach ($entry in $parsedInstalled) {
      $installedPackagesSet[[string]$entry] = $true
    }
  } catch {
    throw "Invalid -InstalledPackagesJson payload: $($_.Exception.Message)"
  }
}
$outdatedPackagesSet = @{}
if (-not [string]::IsNullOrWhiteSpace($OutdatedPackagesJson)) {
  try {
    $parsedOutdated = $OutdatedPackagesJson | ConvertFrom-Json
    foreach ($entry in $parsedOutdated) {
      $outdatedPackagesSet[[string]$entry] = $true
    }
  } catch {
    throw "Invalid -OutdatedPackagesJson payload: $($_.Exception.Message)"
  }
}

function Resolve-NpmCliInstallState {
  param([string]$PackageName)
  if ($installedPackagesSet.Count -eq 0) {
    return 'auto'
  }
  if ($installedPackagesSet.ContainsKey($PackageName)) {
    return 'installed'
  }
  return 'missing'
}

function Resolve-NpmCliOutdatedState {
  param([string]$PackageName)
  if ($outdatedPackagesSet.Count -eq 0) {
    return 'auto'
  }
  if ($outdatedPackagesSet.ContainsKey($PackageName)) {
    return 'outdated'
  }
  return 'current'
}

$nodeHostHelperPath = Join-Path $PSScriptRoot 'Install-Node.ps1'
$prefixHelperPath = Join-Path $PSScriptRoot 'Setup-NodeGlobalPrefix.ps1'
$claudeHelperPath = Join-Path $PSScriptRoot 'Install-ClaudeCode.ps1'
$cursorHelperPath = Join-Path $PSScriptRoot 'Install-CursorAgent.ps1'
$gooseHelperPath = Join-Path $PSScriptRoot 'Install-Goose.ps1'
$junieHelperPath = Join-Path $PSScriptRoot 'Install-Junie.ps1'
$kiroHelperPath = Join-Path $PSScriptRoot 'Install-KiroCli.ps1'
$ollamaHelperPath = Join-Path $PSScriptRoot 'Install-Ollama.ps1'

$NpmCliCatalog = @(
  [pscustomobject]@{ Key = 'codex'; ScriptName = 'Install-Codex.ps1'; PackageName = '@openai/codex' },
  [pscustomobject]@{ Key = 'gemini'; ScriptName = 'Install-Gemini.ps1'; PackageName = '@google/gemini-cli' },
  [pscustomobject]@{ Key = 'copilot'; ScriptName = 'Install-Copilot.ps1'; PackageName = '@github/copilot' },
  [pscustomobject]@{ Key = 'opencode'; ScriptName = 'Install-OpenCode.ps1'; PackageName = 'opencode-ai' },
  [pscustomobject]@{ Key = 'kilo'; ScriptName = 'Install-KiloCli.ps1'; PackageName = '@kilocode/cli' },
  [pscustomobject]@{ Key = 'auggie'; ScriptName = 'Install-Auggie.ps1'; PackageName = '@augmentcode/auggie' },
  [pscustomobject]@{ Key = 'pi'; ScriptName = 'Install-Pi.ps1'; PackageName = '@mariozechner/pi-coding-agent' }
)

$prefixHelperArguments = @('-CheckOnly', '-Json')
if ($SkipNodeCheck) {
  $prefixHelperArguments += '-SkipNodeCheck'
}
if (-not [string]::IsNullOrWhiteSpace($DesiredPrefix)) {
  $prefixHelperArguments += @('-DesiredPrefix', $DesiredPrefix)
}
if (-not [string]::IsNullOrWhiteSpace($CurrentPrefix)) {
  $prefixHelperArguments += @('-CurrentPrefix', $CurrentPrefix)
}
if (-not [string]::IsNullOrWhiteSpace($CurrentUserPath)) {
  $prefixHelperArguments += @('-CurrentUserPath', $CurrentUserPath)
}

$nodeHostArguments = @('-CheckOnly', '-Json')
if ($SkipNodeCheck) {
  $nodeHostArguments += '-SkipNodeProbe'
}
if ($NodeHostInstallState -ne 'auto') {
  $nodeHostArguments += @('-InstallState', $NodeHostInstallState)
}

$helperInvocations = [System.Collections.Generic.List[object]]::new()
$helperInvocations.Add([pscustomobject]@{
    Key = 'nodeHost'
    ScriptPath = $nodeHostHelperPath
    Arguments = $nodeHostArguments
  })
$helperInvocations.Add([pscustomobject]@{
    Key = 'prefixHelper'
    ScriptPath = $prefixHelperPath
    Arguments = $prefixHelperArguments
  })

foreach ($entry in $NpmCliCatalog) {
  $cliArguments = @('-CheckOnly', '-Json', '-SkipNpmInvocation')
  $installState = Resolve-NpmCliInstallState -PackageName $entry.PackageName
  if ($installState -ne 'auto') {
    $cliArguments += @('-InstallState', $installState)
  }
  $outdatedState = Resolve-NpmCliOutdatedState -PackageName $entry.PackageName
  if ($outdatedState -ne 'auto') {
    $cliArguments += @('-OutdatedState', $outdatedState)
  }
  $helperInvocations.Add([pscustomobject]@{
      Key = "npm:$($entry.Key)"
      ScriptPath = (Join-Path $PSScriptRoot $entry.ScriptName)
      Arguments = $cliArguments
    })
}

if ($includeNativeProvidersEnabled) {
  $claudeArguments = @('-CheckOnly', '-Json')
  if ($ClaudeInstallState -ne 'auto') {
    $claudeArguments += @('-InstallState', $ClaudeInstallState)
  }
  if ($ClaudeAuthState -ne 'auto') {
    $claudeArguments += @('-AuthState', $ClaudeAuthState)
  }
  $helperInvocations.Add([pscustomobject]@{
      Key = 'claude'
      ScriptPath = $claudeHelperPath
      Arguments = $claudeArguments
    })

  $cursorArguments = @('-CheckOnly', '-Json')
  if ($CursorInstallState -ne 'auto') {
    $cursorArguments += @('-InstallState', $CursorInstallState)
  }
  if ($CursorAuthState -ne 'auto') {
    $cursorArguments += @('-AuthState', $CursorAuthState)
  }
  $helperInvocations.Add([pscustomobject]@{
      Key = 'cursor'
      ScriptPath = $cursorHelperPath
      Arguments = $cursorArguments
    })

  $gooseArguments = @('-CheckOnly', '-Json')
  if ($GooseInstallState -ne 'auto') {
    $gooseArguments += @('-InstallState', $GooseInstallState)
  }
  if ($GooseAuthState -ne 'auto') {
    $gooseArguments += @('-AuthState', $GooseAuthState)
  }
  $helperInvocations.Add([pscustomobject]@{
      Key = 'goose'
      ScriptPath = $gooseHelperPath
      Arguments = $gooseArguments
    })

  $junieArguments = @('-CheckOnly', '-Json')
  if ($JunieInstallState -ne 'auto') {
    $junieArguments += @('-InstallState', $JunieInstallState)
  }
  if ($JunieAuthState -ne 'auto') {
    $junieArguments += @('-AuthState', $JunieAuthState)
  }
  $helperInvocations.Add([pscustomobject]@{
      Key = 'junie'
      ScriptPath = $junieHelperPath
      Arguments = $junieArguments
    })

  $kiroArguments = @('-CheckOnly', '-Json')
  if ($KiroInstallState -ne 'auto') {
    $kiroArguments += @('-InstallState', $KiroInstallState)
  }
  $helperInvocations.Add([pscustomobject]@{
      Key = 'kiro'
      ScriptPath = $kiroHelperPath
      Arguments = $kiroArguments
    })
}
if ($includeLocalModelsEnabled) {
  $ollamaArguments = @('-CheckOnly', '-Json')
  if ($OllamaInstallState -ne 'auto') {
    $ollamaArguments += @('-InstallState', $OllamaInstallState)
  }
  if ($OllamaApiState -ne 'auto') {
    $ollamaArguments += @('-ApiState', $OllamaApiState)
  }
  $helperInvocations.Add([pscustomobject]@{
      Key = 'ollama'
      ScriptPath = $ollamaHelperPath
      Arguments = $ollamaArguments
    })
}

$helperResults = if ($parallelChecksEnabled) {
  Invoke-HelperJsonBatch -Helpers $helperInvocations.ToArray()
} else {
  Invoke-HelperJsonSequence -Helpers $helperInvocations.ToArray()
}
$nodeHostResult = $helperResults['nodeHost']
$prefixHelper = $helperResults['prefixHelper']
$claudeResult = if ($helperResults.ContainsKey('claude')) { $helperResults['claude'] } else { $null }
$cursorResult = if ($helperResults.ContainsKey('cursor')) { $helperResults['cursor'] } else { $null }
$gooseResult = if ($helperResults.ContainsKey('goose')) { $helperResults['goose'] } else { $null }
$junieResult = if ($helperResults.ContainsKey('junie')) { $helperResults['junie'] } else { $null }
$kiroResult = if ($helperResults.ContainsKey('kiro')) { $helperResults['kiro'] } else { $null }
$ollamaResult = if ($helperResults.ContainsKey('ollama')) { $helperResults['ollama'] } else { $null }

# Aggregate the per-CLI npm helper results into a single nativeCliPack-shaped
# object for downstream consumers (renderer, bridge tests) that still expect
# a single status for the npm-global CLI substrate.
$npmCliResults = [ordered]@{}
$npmCliWarnings = [System.Collections.Generic.List[string]]::new()
$npmCliPlanned = [System.Collections.Generic.List[string]]::new()
$npmCliApplied = [System.Collections.Generic.List[string]]::new()
$npmCliInterruptions = [System.Collections.Generic.List[object]]::new()
$npmCliStatuses = [System.Collections.Generic.List[string]]::new()
$npmCliInstalledCount = 0
foreach ($entry in $NpmCliCatalog) {
  $key = "npm:$($entry.Key)"
  if (-not $helperResults.ContainsKey($key)) {
    continue
  }
  $perCliResult = $helperResults[$key]
  $npmCliResults[$entry.Key] = $perCliResult
  $npmCliStatuses.Add([string]$perCliResult.status)
  if ($perCliResult.installed) {
    $npmCliInstalledCount++
  }
  foreach ($warning in @($perCliResult.warnings)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$warning)) {
      $npmCliWarnings.Add([string]$warning)
    }
  }
  foreach ($planned in @($perCliResult.plannedActions)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$planned)) {
      $npmCliPlanned.Add([string]$planned)
    }
  }
  foreach ($applied in @($perCliResult.appliedChanges)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$applied)) {
      $npmCliApplied.Add([string]$applied)
    }
  }
  if (@($perCliResult.PSObject.Properties.Match('interruptions')).Count -gt 0) {
    foreach ($interruption in @($perCliResult.interruptions)) {
      if ($null -ne $interruption) {
        $npmCliInterruptions.Add($interruption)
      }
    }
  }
}
$nativeCliPackStatus = if ($npmCliStatuses -contains 'failed') {
  'failed'
} elseif ($npmCliStatuses -contains 'changes_required') {
  'changes_required'
} elseif ($npmCliStatuses -contains 'not_installed') {
  'not_installed'
} elseif ($npmCliStatuses.Count -eq 0) {
  'ready'
} else {
  'ready'
}
$nativeCliPack = [pscustomobject]@{
  helper = 'windows-native-cli-pack-aggregate'
  mode = 'check'
  status = $nativeCliPackStatus
  installed = ($npmCliInstalledCount -eq $NpmCliCatalog.Count)
  packages = $npmCliResults
  warnings = $npmCliWarnings.ToArray()
  plannedActions = $npmCliPlanned.ToArray()
  appliedChanges = $npmCliApplied.ToArray()
  interruptions = $npmCliInterruptions.ToArray()
}

$warnings = [System.Collections.Generic.List[string]]::new()
$plannedActions = [System.Collections.Generic.List[string]]::new()
$interruptions = [System.Collections.Generic.List[object]]::new()
$statuses = @($nodeHostResult.status, $prefixHelper.status, $nativeCliPack.status)
if ($null -ne $claudeResult) {
  $statuses += $claudeResult.status
}
if ($null -ne $cursorResult) {
  $statuses += $cursorResult.status
}
if ($null -ne $gooseResult) {
  $statuses += $gooseResult.status
}
if ($null -ne $junieResult) {
  $statuses += $junieResult.status
}
if ($null -ne $kiroResult) {
  $statuses += $kiroResult.status
}
if ($null -ne $ollamaResult) {
  $statuses += $ollamaResult.status
}

$nodeMissing = ($nodeHostResult.status -ne 'ready') -or ($prefixHelper.status -eq 'not_installed')
if ($nodeMissing) {
  $plannedActions.Add('install_node_lts')
}

if (-not $nodeMissing -and $prefixHelper.status -ne 'ready') {
  $plannedActions.Add('repair_npm_prefix')
}

if (-not $nodeMissing -and $nativeCliPack.status -ne 'ready') {
  # Skip the per-CLI repair signal when Node itself is missing — the npm-global
  # CLI helpers cannot run until the host installer finishes.
  $plannedActions.Add('repair_native_cli_pack')
}

if ($null -ne $claudeResult) {
  if ($claudeResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_claude_code_native')
  } elseif ($claudeResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_claude_code')
  }
}
if ($null -ne $cursorResult) {
  if ($cursorResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_cursor_agent_native')
  } elseif ($cursorResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_cursor_agent')
  }
}
if ($null -ne $gooseResult) {
  if ($gooseResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_goose_native')
  } elseif ($gooseResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_goose')
  }
}
if ($null -ne $junieResult) {
  if ($junieResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_junie_native')
  } elseif ($junieResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_junie')
  }
}
if ($null -ne $kiroResult -and $kiroResult.status -eq 'not_installed') {
  $plannedActions.Add('provider:install_kiro_native')
}
if ($null -ne $ollamaResult) {
  foreach ($action in $ollamaResult.plannedActions) {
    $plannedActions.Add("local_model:$action")
  }
}

foreach ($warning in $nodeHostResult.warnings) {
  $warnings.Add([string]$warning)
}
foreach ($warning in $prefixHelper.warnings) {
  $warnings.Add([string]$warning)
}
foreach ($warning in $nativeCliPack.warnings) {
  $warnings.Add([string]$warning)
}
if ($null -ne $claudeResult) {
  foreach ($warning in $claudeResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $cursorResult) {
  foreach ($warning in $cursorResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $gooseResult) {
  foreach ($warning in $gooseResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $junieResult) {
  foreach ($warning in $junieResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $kiroResult) {
  foreach ($warning in $kiroResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $ollamaResult) {
  foreach ($warning in $ollamaResult.warnings) {
    $warnings.Add([string]$warning)
  }
}

function Add-InterruptionsFromResult {
  param(
    [object]$HelperResult
  )

  if ($null -eq $HelperResult) {
    return
  }

  if (@($HelperResult.PSObject.Properties.Match('interruptions')).Count -eq 0) {
    return
  }

  foreach ($interruption in @($HelperResult.interruptions)) {
    if ($null -eq $interruption) {
      continue
    }
    if (@($interruption.PSObject.Properties.Match('kind')).Count -eq 0) {
      continue
    }
    $interruptions.Add($interruption)
  }
}

Add-InterruptionsFromResult -HelperResult $nodeHostResult
Add-InterruptionsFromResult -HelperResult $nativeCliPack
Add-InterruptionsFromResult -HelperResult $claudeResult
Add-InterruptionsFromResult -HelperResult $cursorResult
Add-InterruptionsFromResult -HelperResult $gooseResult
Add-InterruptionsFromResult -HelperResult $junieResult
Add-InterruptionsFromResult -HelperResult $kiroResult
Add-InterruptionsFromResult -HelperResult $ollamaResult

function Test-InterruptionPresent {
  param(
    [string]$Kind
  )

  return @($interruptions) | Where-Object {
    $null -ne $_ -and @($_.PSObject.Properties.Match('kind')).Count -gt 0 -and $_.kind -eq $Kind
  } | Select-Object -First 1
}

$overallStatus = if ($statuses -contains 'failed') {
  'failed'
} elseif (Test-InterruptionPresent -Kind 'restart_required') {
  'restart_required'
} elseif (Test-InterruptionPresent -Kind 'relaunch_required') {
  'relaunch_required'
} elseif (Test-InterruptionPresent -Kind 'elevation_required') {
  'elevation_required'
} elseif (Test-InterruptionPresent -Kind 'auth_required') {
  'auth_required'
} elseif ($statuses -contains 'not_installed') {
  'not_installed'
} elseif ($statuses -contains 'changes_required') {
  'changes_required'
} else {
  'ready'
}

$result = [pscustomobject]@{
  helper = 'windows-setup-readiness-audit'
  collectionMode = if ($parallelChecksEnabled) { 'parallel' } else { 'serial' }
  status = $overallStatus
  plannedActions = $plannedActions.ToArray()
  warnings = $warnings.ToArray()
  interruptions = $interruptions.ToArray()
  nodeHost = $nodeHostResult
  prefixHelper = $prefixHelper
  nativeCliPack = $nativeCliPack
  nativeProviders = [pscustomobject]@{
    claude = $claudeResult
    cursor = $cursorResult
    goose = $gooseResult
    junie = $junieResult
    kiro = $kiroResult
  }
  localModels = [pscustomobject]@{
    ollama = $ollamaResult
  }
}

Write-StructuredResult -Result $result
