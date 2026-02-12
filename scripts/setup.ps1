[CmdletBinding()]
param(
  [ValidateSet('all', 'cli', 'web')]
  [string]$Target = 'all',
  [switch]$InstallCli,
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  if (-not $SkipInstall) {
    Write-Host '[setup] Installing workspace dependencies...'
    npm install
  }

  if (-not $SkipBuild) {
    Write-Host "[setup] Building target: $Target"
    switch ($Target) {
      'all' { npm run build }
      'cli' { npm run build --workspace @ordernet/cli }
      'web' { npm run build --workspace @ordernet/web }
    }
  }

  if ($InstallCli) {
    Write-Host '[setup] Linking ordernet CLI globally...'
    npm run build --workspace @ordernet/cli
    npm link --workspace @ordernet/cli
  }

  Write-Host '[setup] Done.'
  Write-Host '[setup] Start web:  npm run start --workspace @ordernet/web -- --http-port 3000'
  Write-Host '[setup] Start cli:  npm run start --workspace @ordernet/cli'
}
finally {
  Pop-Location
}
