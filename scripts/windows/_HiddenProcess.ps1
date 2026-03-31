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
  $proc.WaitForExit()

  return [pscustomobject]@{
    ExitCode = $proc.ExitCode
    Output   = $output
  }
}
