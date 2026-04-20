<#
.SYNOPSIS
    Configure cats + ngrok auto-start on Windows.

.DESCRIPTION
    Builds cats, creates a user-level runner script, and registers a Windows
    Startup shortcut so login will start the built cats server and ensure an
    ngrok tunnel is available. Webhook registration remains owned by the Cats
    UI/API.

.PARAMETER Install
    Build cats, create the runner script, register Windows Startup, and run
    the runner once immediately.

.PARAMETER Remove
    Remove Windows Startup registration and stop the managed cats/ngrok
    processes tracked by this helper.

.PARAMETER Verify
    Show runner, Startup, local server, and ngrok status.

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

function Get-HelperPaths {
  $userScriptsDir = Join-Path $env:USERPROFILE 'Scripts'
  $startupFolder = [Environment]::GetFolderPath('Startup')
  return @{
    UserScriptsDir = $userScriptsDir
    RunnerScript = Join-Path $userScriptsDir 'Start-CatsNgrokTunnel.ps1'
    RunnerLog = Join-Path $userScriptsDir 'cats-ngrok-tunnel.log'
    ServerOutLog = Join-Path $userScriptsDir 'cats-server.out.log'
    ServerErrLog = Join-Path $userScriptsDir 'cats-server.err.log'
    ServerPidFile = Join-Path $userScriptsDir 'cats-server.pid'
    NgrokOutLog = Join-Path $userScriptsDir 'cats-ngrok.out.log'
    NgrokErrLog = Join-Path $userScriptsDir 'cats-ngrok.err.log'
    NgrokPidFile = Join-Path $userScriptsDir 'cats-ngrok.pid'
    StartupShortcut = Join-Path $startupFolder 'Start-CatsNgrokTunnel.lnk'
  }
}

function Assert-NgrokReady {
  if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    throw 'ngrok command not found. Install ngrok first.'
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

function Query-NgrokApi {
  try {
    return Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3 -ErrorAction Stop
  } catch {
    return $null
  }
}

function Show-IngressProbeHint {
  param([string]$BaseUrl)

  if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    return
  }

  Write-Host 'Probe same-origin runtime ingress with:' -ForegroundColor Gray
  Write-Host "  npm run ingress:smoke -- --base-url $BaseUrl" -ForegroundColor Gray
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
`$ngrokOutLog = '$($Paths.NgrokOutLog -replace "'", "''")'
`$ngrokErrLog = '$($Paths.NgrokErrLog -replace "'", "''")'
`$ngrokPidFile = '$($Paths.NgrokPidFile -replace "'", "''")'

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

`$authToken = if (-not [string]::IsNullOrWhiteSpace(`$env:CATS_NGROK_AUTHTOKEN)) { `$env:CATS_NGROK_AUTHTOKEN } else { `$env:NGROK_AUTHTOKEN }
`$domain = if (-not [string]::IsNullOrWhiteSpace(`$env:CATS_NGROK_DOMAIN)) { `$env:CATS_NGROK_DOMAIN } else { `$env:NGROK_DOMAIN }
`$healthUrl = "http://127.0.0.1:`$port/health"
Add-Content -Path `$runnerLog -Value ""
`$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Content -Path `$runnerLog -Value "=== [`$timestamp] Starting cats + ngrok ==="

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

if (Get-Command ngrok -ErrorAction SilentlyContinue) {
  `$existingTunnel = `$false
  try {
    `$tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3 -ErrorAction Stop
    foreach (`$tunnel in `$tunnels.tunnels) {
      if (`$tunnel.config.addr -match "127\.0\.0\.1:`$port|localhost:`$port|http://127\.0\.0\.1:`$port") {
        `$existingTunnel = `$true
      }
    }
  } catch {
    `$existingTunnel = `$false
  }

  if (-not `$existingTunnel) {
    `$args = @('http', "http://127.0.0.1:`$port", '--log=stdout', '--log-format=logfmt', '--log-level=info')
    if (-not [string]::IsNullOrWhiteSpace(`$authToken)) {
      `$args += "--authtoken=`$authToken"
    }
    if (-not [string]::IsNullOrWhiteSpace(`$domain)) {
      `$args += "--domain=`$domain"
    }
    `$ngrokProcess = Start-Process -FilePath 'ngrok' -ArgumentList `$args -WindowStyle Hidden -RedirectStandardOutput `$ngrokOutLog -RedirectStandardError `$ngrokErrLog -PassThru
    Set-Content -Path `$ngrokPidFile -Value `$ngrokProcess.Id
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
  $shortcut.Description = 'Start cats and ensure ngrok is available'
  $shortcut.Save()
}

function Stop-ManagedProcess {
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

  Write-Host '--- cats ngrok auto-start helper ---' -ForegroundColor Cyan
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

  $api = Query-NgrokApi
  if ($api) {
    Write-Host 'ngrok API is responding on http://127.0.0.1:4040/api/tunnels.' -ForegroundColor Green
    foreach ($tunnel in $api.tunnels) {
      Write-Host "Tunnel: $($tunnel.public_url) -> $($tunnel.config.addr)" -ForegroundColor Gray
      Show-IngressProbeHint -BaseUrl $tunnel.public_url
    }
  } else {
    Write-Host 'ngrok API is not responding.' -ForegroundColor Yellow
  }

  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "Local cats server health responded with HTTP $($response.StatusCode)." -ForegroundColor Green
    Show-IngressProbeHint -BaseUrl "http://127.0.0.1:$Port"
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
$paths = Get-HelperPaths

if ($Verify) {
  Assert-NgrokReady
  Show-VerifySummary -Port $port -Paths $paths
  exit 0
}

if ($Remove) {
  Stop-ManagedProcess -PidFile $paths.NgrokPidFile
  Stop-ManagedProcess -PidFile $paths.ServerPidFile
  Remove-Item $paths.RunnerScript, $paths.RunnerLog, $paths.ServerOutLog, $paths.ServerErrLog, $paths.NgrokOutLog, $paths.NgrokErrLog, $paths.StartupShortcut -ErrorAction SilentlyContinue
  Write-Host 'Removed cats ngrok auto-start configuration.' -ForegroundColor Green
  exit 0
}

Assert-NgrokReady
Assert-NodeReady
Ensure-Build -ProjectRoot $projectRoot

if (((Test-Path $paths.RunnerScript) -or (Test-Path $paths.StartupShortcut)) -and -not $Force) {
  Write-Host 'Auto-start configuration already exists. Use -Force to recreate it.' -ForegroundColor Yellow
  exit 0
}

New-RunnerScript -ProjectRoot $projectRoot -EnvFile $envFile -Paths $paths
New-StartupShortcut -RunnerScript $paths.RunnerScript -WorkingDirectory $projectRoot -ShortcutPath $paths.StartupShortcut
& $paths.RunnerScript

Write-Host 'Installed cats ngrok auto-start configuration.' -ForegroundColor Green
Write-Host "Runner script: $($paths.RunnerScript)" -ForegroundColor Gray
Write-Host "Startup shortcut: $($paths.StartupShortcut)" -ForegroundColor Gray
