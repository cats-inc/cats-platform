param()

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

Push-Location $projectRoot
try {
  npm run desktop:start
} finally {
  Pop-Location
}
