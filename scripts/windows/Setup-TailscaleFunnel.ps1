<#
.SYNOPSIS
    Configure cats + Tailscale Funnel auto-start on Windows.

.DESCRIPTION
    Builds cats, creates a user-level runner script, and registers a Windows
    Startup shortcut so login will start the built cats server and ensure a
    Tailscale Funnel is available. Webhook registration remains owned by the
    Cats UI/API.

.PARAMETER Install
    Build cats, create the runner script, register Windows Startup, and run
    the runner once immediately.

.PARAMETER Remove
    Remove Windows Startup registration and stop the managed cats/Tailscale
    processes tracked by this helper.

.PARAMETER Verify
    Show runner, Startup, local server, and Funnel status.

.PARAMETER Force
    Recreate the runner and Startup shortcut even if they already exist.
#>

[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Remove,
  [switch]$Verify,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Get-ProjectRoot {
  return Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $line = Get-Content $Path | Select-String -Pattern ("^\s*{0}\s*=" -f [regex]::Escape($Name)) | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return ($line.Line -split '=', 2)[1].Trim()
}

function Resolve-EnvFile {
  param([string]$ProjectRoot)

  $envFile = Join-Path $ProjectRoot '.env'
  if (Test-Path $envFile) {
    return $envFile
  }

  $envExample = Join-Path $ProjectRoot '.env.example'
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    return $envFile
  }

  throw 'Neither .env nor .env.example was found.'
}

function Get-CatsPort {
  param([string]$EnvFile)

  $port = Read-EnvValue -Path $EnvFile -Name 'CATS_PORT'
  if ([string]::IsNullOrWhiteSpace($port)) {
    $port = Read-EnvValue -Path $EnvFile -Name 'CATS_INC_PORT'
  }
  if ([string]::IsNullOrWhiteSpace($port)) {
    return '8181'
  }
  return $port
}

function Get-HttpsPort {
  param([string]$EnvFile)

  $httpsPort = Read-EnvValue -Path $EnvFile -Name 'TAILSCALE_HTTPS_PORT'
  if ([string]::IsNullOrWhiteSpace($httpsPort)) {
    return $null
  }
  return $httpsPort
}

function Get-HelperPaths {
  $userScriptsDir = Join-Path $env:USERPROFILE 'Scripts'
  $startupFolder = [Environment]::GetFolderPath('Startup')
  return @{
    UserScriptsDir = $userScriptsDir
    RunnerScript = Join-Path $userScriptsDir 'Start-CatsTailscaleFunnel.ps1'
    RunnerLog = Join-Path $userScriptsDir 'cats-tailscale-funnel.log'
    ServerOutLog = Join-Path $userScriptsDir 'cats-server.out.log'
    ServerErrLog = Join-Path $userScriptsDir 'cats-server.err.log'
    ServerPidFile = Join-Path $userScriptsDir 'cats-server.pid'
    StartupShortcut = Join-Path $startupFolder 'Start-CatsTailscaleFunnel.lnk'
  }
}

function Assert-TailscaleReady {
  $command = Get-Command tailscale -ErrorAction SilentlyContinue
  if (-not $command) {
    throw 'tailscale command not found. Install Tailscale first: https://tailscale.com/download'
  }

  tailscale status *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Tailscale is not connected. Run "tailscale up" first.'
  }
}

function Assert-NodeReady {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node command not found. Install Node.js first.'
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm command not found.'
  }
}

function Ensure-Build {
  param([string]$ProjectRoot)

  Push-Location $ProjectRoot
  try {
    if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
      npm install
    }
    npm run build
  } finally {
    Pop-Location
  }
}

function Get-FunnelStatusText {
  return (tailscale funnel status 2>$null | Out-String)
}

function Test-FunnelTarget {
  param(
    [string]$StatusText,
    [string]$Port
  )

  return $StatusText -match ("(127\.0\.0\.1|localhost):{0}\b" -f [regex]::Escape($Port))
}

function Get-FunnelPublicUrl {
  param([string]$StatusText)

  $match = [regex]::Match($StatusText, 'https://\S+?\.ts\.net(?::\d+)?')
  if (-not $match.Success) {
    return $null
  }
  return $match.Value
}

function Get-HttpsPortFromUrl {
  param([string]$PublicUrl)

  if ([string]::IsNullOrWhiteSpace($PublicUrl)) {
    return '443'
  }

  $uri = [Uri]$PublicUrl
  if ($uri.IsDefaultPort) {
    return '443'
  }
  return [string]$uri.Port
}

function New-RunnerScript {
  param(
    [string]$ProjectRoot,
    [string]$EnvFile,
    [hashtable]$Paths
  )

  if (-not (Test-Path $Paths.UserScriptsDir)) {
    New-Item -ItemType Directory -Path $Paths.UserScriptsDir -Force | Out-Null
  }

  $content = @"
`$ErrorActionPreference = 'Stop'
`$projectRoot = '$($ProjectRoot -replace "'", "''")'
`$envFile = '$($EnvFile -replace "'", "''")'
`$runnerLog = '$($Paths.RunnerLog -replace "'", "''")'
`$serverOutLog = '$($Paths.ServerOutLog -replace "'", "''")'
`$serverErrLog = '$($Paths.ServerErrLog -replace "'", "''")'
`$serverPidFile = '$($Paths.ServerPidFile -replace "'", "''")'

function Import-EnvFile {
  param([string]`$Path)

  if (-not (Test-Path `$Path)) {
    return
  }

  foreach (`$line in Get-Content `$Path) {
    if ([string]::IsNullOrWhiteSpace(`$line) -or `$line.TrimStart().StartsWith('#')) {
      continue
    }
    `$parts = `$line -split '=', 2
    if (`$parts.Count -ne 2) {
      continue
    }
    `$name = `$parts[0].Trim()
    `$value = `$parts[1].Trim()
    if (`$name) {
      [Environment]::SetEnvironmentVariable(`$name, `$value, 'Process')
    }
  }
}

Import-EnvFile `$envFile

`$port = `$env:CATS_PORT
if ([string]::IsNullOrWhiteSpace(`$port)) {
  `$port = `$env:CATS_INC_PORT
}
if ([string]::IsNullOrWhiteSpace(`$port)) {
  `$port = '8181'
}

`$httpsPort = `$env:TAILSCALE_HTTPS_PORT
`$healthUrl = "http://127.0.0.1:`$port/health"
Add-Content -Path `$runnerLog -Value ""
`$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Content -Path `$runnerLog -Value "=== [`$timestamp] Starting cats + Tailscale Funnel ==="

`$serverHealthy = `$false
try {
  `$response = Invoke-WebRequest -Uri `$healthUrl -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
  `$serverHealthy = `$response.StatusCode -eq 200
} catch {
  `$serverHealthy = `$false
}

if (-not `$serverHealthy) {
  `$serverProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm start' -WorkingDirectory `$projectRoot -WindowStyle Hidden -RedirectStandardOutput `$serverOutLog -RedirectStandardError `$serverErrLog -PassThru
  Set-Content -Path `$serverPidFile -Value `$serverProcess.Id
  Start-Sleep -Seconds 5
}

if (Get-Command tailscale -ErrorAction SilentlyContinue) {
  tailscale status *> `$null
  if (`$LASTEXITCODE -eq 0) {
    `$statusText = tailscale funnel status 2>`$null | Out-String
    `$portPattern = [regex]::Escape(`$port)
    `$alreadyConfigured = `$statusText -match "(127\.0\.0\.1|localhost):`$portPattern\b"
    if (-not `$alreadyConfigured) {
      if ([string]::IsNullOrWhiteSpace(`$httpsPort)) {
        tailscale funnel --bg "http://127.0.0.1:`$port" *> `$null
      } else {
        tailscale funnel --bg "--https=`$httpsPort" "http://127.0.0.1:`$port" *> `$null
      }
    }
  }
}
"@

  Set-Content -Path $Paths.RunnerScript -Value $content -Encoding UTF8
}

function New-StartupShortcut {
  param([string]$RunnerScript, [string]$WorkingDirectory, [string]$ShortcutPath)

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $targetPath = if (Test-Path 'C:\Program Files\PowerShell\7\pwsh.exe') { 'C:\Program Files\PowerShell\7\pwsh.exe' } else { 'powershell.exe' }
  $shortcut.TargetPath = $targetPath
  $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$RunnerScript`""
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Start cats and ensure Tailscale Funnel is available'
  $shortcut.Save()
}

function Stop-ManagedServer {
  param([string]$PidFile)

  if (-not (Test-Path $PidFile)) {
    return
  }

  $pidValue = Get-Content $PidFile -Raw
  if ($pidValue -match '^\d+$') {
    Stop-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
  }
  Remove-Item $PidFile -ErrorAction SilentlyContinue
}

function Show-VerifySummary {
  param(
    [string]$Port,
    [hashtable]$Paths
  )

  Write-Host '--- cats Tailscale auto-start helper ---' -ForegroundColor Cyan
  Write-Host "Runner script: $($Paths.RunnerScript)" -ForegroundColor Gray
  Write-Host "Startup shortcut: $($Paths.StartupShortcut)" -ForegroundColor Gray

  if (Test-Path $Paths.RunnerScript) {
    Write-Host 'Runner script exists.' -ForegroundColor Green
  } else {
    Write-Host 'Runner script is missing.' -ForegroundColor Yellow
  }

  if (Test-Path $Paths.StartupShortcut) {
    Write-Host 'Startup shortcut exists.' -ForegroundColor Green
  } else {
    Write-Host 'Startup shortcut is missing.' -ForegroundColor Yellow
  }

  $statusText = Get-FunnelStatusText
  if (Test-FunnelTarget -StatusText $statusText -Port $Port) {
    $publicUrl = Get-FunnelPublicUrl -StatusText $statusText
    Write-Host "Funnel is configured for cats on port $Port." -ForegroundColor Green
    if ($publicUrl) {
      Write-Host "Public URL: $publicUrl" -ForegroundColor Green
    }
  } else {
    Write-Host "No Funnel is currently configured for cats on port $Port." -ForegroundColor Yellow
  }

  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "Local cats server health responded with HTTP $($response.StatusCode)." -ForegroundColor Green
  } catch {
    Write-Host "Local cats server is not responding on http://127.0.0.1:$Port/health yet." -ForegroundColor DarkYellow
  }
}

$operationCount = @($Install, $Remove, $Verify).Where({ $_ }).Count
if ($operationCount -ne 1) {
  throw 'Choose exactly one operation: -Install, -Verify, or -Remove.'
}

$projectRoot = Get-ProjectRoot
$envFile = Resolve-EnvFile -ProjectRoot $projectRoot
$port = Get-CatsPort -EnvFile $envFile
$httpsPort = Get-HttpsPort -EnvFile $envFile
$paths = Get-HelperPaths

if ($Verify) {
  Assert-TailscaleReady
  Show-VerifySummary -Port $port -Paths $paths
  exit 0
}

if ($Remove) {
  $statusText = Get-FunnelStatusText
  if (Test-FunnelTarget -StatusText $statusText -Port $port) {
    $publicUrl = Get-FunnelPublicUrl -StatusText $statusText
    $effectiveHttpsPort = if ($httpsPort) { $httpsPort } else { Get-HttpsPortFromUrl -PublicUrl $publicUrl }
    & tailscale funnel "--https=$effectiveHttpsPort" --set-path=/ off | Out-Null
  }

  Stop-ManagedServer -PidFile $paths.ServerPidFile
  Remove-Item $paths.RunnerScript, $paths.RunnerLog, $paths.ServerOutLog, $paths.ServerErrLog, $paths.StartupShortcut -ErrorAction SilentlyContinue
  Write-Host 'Removed cats Tailscale auto-start configuration.' -ForegroundColor Green
  exit 0
}

Assert-TailscaleReady
Assert-NodeReady
Ensure-Build -ProjectRoot $projectRoot

if (((Test-Path $paths.RunnerScript) -or (Test-Path $paths.StartupShortcut)) -and -not $Force) {
  Write-Host 'Auto-start configuration already exists. Use -Force to recreate it.' -ForegroundColor Yellow
  exit 0
}

New-RunnerScript -ProjectRoot $projectRoot -EnvFile $envFile -Paths $paths
New-StartupShortcut -RunnerScript $paths.RunnerScript -WorkingDirectory $projectRoot -ShortcutPath $paths.StartupShortcut
& $paths.RunnerScript

Write-Host 'Installed cats Tailscale auto-start configuration.' -ForegroundColor Green
Write-Host "Runner script: $($paths.RunnerScript)" -ForegroundColor Gray
Write-Host "Startup shortcut: $($paths.StartupShortcut)" -ForegroundColor Gray
