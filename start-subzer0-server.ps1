$ErrorActionPreference = 'Stop'

if (-not $env:SUBZER0_PORT) {
  $env:SUBZER0_PORT = '8787'
}

node "$PSScriptRoot\subzer0-server.js"
