<#
.SYNOPSIS
    Inspect Windows packaged setup readiness for Cats.

.DESCRIPTION
    Composes the repo-owned packaged prerequisite helpers into one structured
    host-side readiness audit. The helper is read-only and reports whether the
    Node.js host, the GitHub CLI host, and the npm prefix substrate are ready,
    missing, or still require changes before deeper provider installation flows
    can proceed. The optional local-model runtime is included on request.

    Provider presence is deliberately NOT audited here. cats-runtime's setup
    scan already probes every provider CLI, reports a version and a probe-backed
    auth status for each, and is the source the desktop host's CLI inventory
    reads. Auditing them a second time meant spawning one powershell.exe per
    provider — eighteen processes and roughly a minute and a half on first
    launch — to produce answers the host then ignored. The audit now owns the
    prerequisites, and the scan owns the providers.

    The audit talks only to helpers that ship in DESKTOP_SETUP_ASSETS. WSL and
    Docker substrates were removed from the packaged path in earlier phases and
    are no longer covered here.

.PARAMETER Json
    Emit a structured JSON result.

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

.PARAMETER NodeHostInstallState
    Override Node.js host installation detection for deterministic tests.

.PARAMETER GitHubCliInstallState
    Override GitHub CLI host installation detection for deterministic tests.
#>
param(
  [switch]$Json,
  [string]$IncludeLocalModels = 'false',
  [string]$Parallel = 'true',
  [switch]$SkipNodeCheck,
  [string]$DesiredPrefix = '',
  [string]$CurrentPrefix = '',
  [string]$CurrentUserPath = '',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$NodeHostInstallState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$GitHubCliInstallState = 'auto',
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

$nodeHostHelperPath = Join-Path $PSScriptRoot 'Install-Node.ps1'
$githubCliHelperPath = Join-Path $PSScriptRoot 'Install-GitHubCli.ps1'
$prefixHelperPath = Join-Path $PSScriptRoot 'Setup-NodeGlobalPrefix.ps1'
$ollamaHelperPath = Join-Path $PSScriptRoot 'Install-Ollama.ps1'

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

$githubCliArguments = @('-CheckOnly', '-Json')
if ($SkipNodeCheck) {
  $githubCliArguments += '-SkipGhProbe'
}
if ($GitHubCliInstallState -ne 'auto') {
  $githubCliArguments += @('-InstallState', $GitHubCliInstallState)
}

$helperInvocations = [System.Collections.Generic.List[object]]::new()
$helperInvocations.Add([pscustomobject]@{
    Key = 'nodeHost'
    ScriptPath = $nodeHostHelperPath
    Arguments = $nodeHostArguments
  })
$helperInvocations.Add([pscustomobject]@{
    Key = 'githubCli'
    ScriptPath = $githubCliHelperPath
    Arguments = $githubCliArguments
  })
$helperInvocations.Add([pscustomobject]@{
    Key = 'prefixHelper'
    ScriptPath = $prefixHelperPath
    Arguments = $prefixHelperArguments
  })

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
$githubCliResult = $helperResults['githubCli']
$prefixHelper = $helperResults['prefixHelper']
$ollamaResult = if ($helperResults.ContainsKey('ollama')) { $helperResults['ollama'] } else { $null }

$warnings = [System.Collections.Generic.List[string]]::new()
$plannedActions = [System.Collections.Generic.List[string]]::new()
$interruptions = [System.Collections.Generic.List[object]]::new()
$statuses = @($nodeHostResult.status, $githubCliResult.status, $prefixHelper.status)
if ($null -ne $ollamaResult) {
  $statuses += $ollamaResult.status
}

$nodeMissing = ($nodeHostResult.status -ne 'ready') -or ($prefixHelper.status -eq 'not_installed')
if ($nodeMissing) {
  $plannedActions.Add('install_node_lts')
}

if ($githubCliResult.status -ne 'ready') {
  $plannedActions.Add('install_github_cli')
}

if (-not $nodeMissing -and $prefixHelper.status -ne 'ready') {
  $plannedActions.Add('repair_npm_prefix')
}

if ($null -ne $ollamaResult) {
  foreach ($action in $ollamaResult.plannedActions) {
    $plannedActions.Add("local_model:$action")
  }
}

foreach ($warning in $nodeHostResult.warnings) {
  $warnings.Add([string]$warning)
}
foreach ($warning in $githubCliResult.warnings) {
  $warnings.Add([string]$warning)
}
foreach ($warning in $prefixHelper.warnings) {
  $warnings.Add([string]$warning)
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
Add-InterruptionsFromResult -HelperResult $githubCliResult
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
  githubCli = $githubCliResult
  prefixHelper = $prefixHelper
  localModels = [pscustomobject]@{
    ollama = $ollamaResult
  }
}

Write-StructuredResult -Result $result
