[CmdletBinding()]
param(
  [switch]$AutoUpdate,
  [int]$HttpPort = 3000,
  [int]$P2pPort = 0,
  [string]$Nickname,
  [string]$DbPath,
  [string[]]$BootstrapPeers = @(),
  [switch]$Mdns
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  if ($AutoUpdate) {
    Write-Host '[run-web] Pulling latest changes...'
    git pull --ff-only
    Write-Host '[run-web] Syncing dependencies...'
    npm install
  }

  $args = @('run', 'start', '--workspace', '@ordernet/web', '--')
  $args += @('--http-port', "$HttpPort")
  $args += @('--port', "$P2pPort")

  if ($Nickname) { $args += @('--nick', $Nickname) }
  if ($DbPath) { $args += @('--db', $DbPath) }
  if ($Mdns) { $args += '--mdns' }

  foreach ($peer in $BootstrapPeers) {
    $args += @('--bootstrap', $peer)
  }

  Write-Host '[run-web] Starting web node...'
  npm @args
}
finally {
  Pop-Location
}
