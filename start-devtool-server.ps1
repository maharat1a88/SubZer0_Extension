$ErrorActionPreference = 'Stop'

if (-not $env:DEVTOOL_PORT) {
  $env:DEVTOOL_PORT = '8787'
}

node "$PSScriptRoot\devtool-server.js"
