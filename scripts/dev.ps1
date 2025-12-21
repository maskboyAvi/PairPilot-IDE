Param(
  [int]$CollabPort = 1234,
  [int]$EnginePort = 8080,
  [int]$FrontendPort = 3000
)

$ErrorActionPreference = 'Stop'

function Start-DevTerminal {
  param(
    [string]$Title,
    [string]$WorkingDir,
    [string]$Command
  )

  $wd = Resolve-Path -Path $WorkingDir

  $args = @(
    '-NoExit',
    '-Command',
    "Set-Location -Path `"$wd`"; $Command"
  )

  Start-Process -FilePath 'pwsh.exe' -WorkingDirectory $wd -ArgumentList $args -WindowStyle Normal
}

Write-Host "Starting PairPilot dev services..." -ForegroundColor Cyan
Write-Host "- Collab:   ws://localhost:$CollabPort" -ForegroundColor DarkGray
Write-Host "- Engine:   http://localhost:$EnginePort" -ForegroundColor DarkGray
Write-Host "- Frontend: http://localhost:$FrontendPort" -ForegroundColor DarkGray

# These ports are controlled by per-service .env files.
# This script just starts processes in the right folders.
Start-DevTerminal -Title 'pairpilot-collab'   -WorkingDir "$PSScriptRoot\..\collab"   -Command 'npm run dev'
Start-DevTerminal -Title 'pairpilot-engine'  -WorkingDir "$PSScriptRoot\..\engine"  -Command 'go run ./cmd/engine'
Start-DevTerminal -Title 'pairpilot-frontend' -WorkingDir "$PSScriptRoot\..\frontend" -Command 'npm run dev'

Write-Host "Done. Close terminals to stop services." -ForegroundColor Green
