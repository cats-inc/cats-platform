<#
.SYNOPSIS
    Shared utility for running child processes without visible console windows.

.DESCRIPTION
    When a packaged Electron host spawns PowerShell with CREATE_NO_WINDOW, any
    grandchild console process (powershell.exe, wsl.exe, etc.) would normally
    allocate its own visible console. This helper wraps
    System.Diagnostics.Process with CreateNoWindow = $true and proper argument
    quoting so the entire audit chain stays invisible.
#>

function Invoke-HiddenCommand {
  param(
    [Parameter(Mandatory)]
    [string]$FileName,

    [string[]]$ArgumentList = @()
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FileName
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  if ($ArgumentList.Count -gt 0) {
    $psi.Arguments = ($ArgumentList | ForEach-Object {
      if ($_ -match '[\s"]') {
        '"{0}"' -f ($_ -replace '"', '\"')
      } else {
        $_
      }
    }) -join ' '
  }

  $proc = [System.Diagnostics.Process]::Start($psi)
  $output = $proc.StandardOutput.ReadToEnd()
  $errorOutput = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()

  return [pscustomobject]@{
    ExitCode    = $proc.ExitCode
    Output      = $output
    ErrorOutput = $errorOutput
  }
}

function Get-HiddenCommandText {
  param(
    [Parameter(Mandatory)]
    [string]$FileName,

    [string[]]$ArgumentList = @()
  )

  $result = Invoke-HiddenCommand -FileName $FileName -ArgumentList $ArgumentList
  $segments = [System.Collections.Generic.List[string]]::new()
  if (-not [string]::IsNullOrWhiteSpace($result.Output)) {
    $segments.Add($result.Output.Trim())
  }
  if (-not [string]::IsNullOrWhiteSpace($result.ErrorOutput)) {
    $segments.Add($result.ErrorOutput.Trim())
  }
  return ($segments -join [System.Environment]::NewLine).Trim()
}

function Resolve-HiddenVersionProbePath {
  param(
    [string]$PreferredPath = '',
    [string]$FallbackPath = ''
  )

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($candidate in @($PreferredPath, $FallbackPath)) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (-not $seen.Add($candidate)) {
      continue
    }
    $extension = [System.IO.Path]::GetExtension($candidate)
    if ($extension -in @('.cmd', '.bat')) {
      continue
    }
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return $null
}
