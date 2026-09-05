# Opens a collection artifact in Explorer. Bound to the cgl: protocol by cgl.ps1 -RegisterProtocol.
param([Parameter(Mandatory = $true)][string]$Uri)
$ErrorActionPreference = "SilentlyContinue"
$raw = $Uri -replace '^cgl:', ''
try { $path = [uri]::UnescapeDataString($raw) } catch { $path = $raw }
$path = $path -replace '/', '\'
if (Test-Path -LiteralPath $path) {
  Start-Process explorer.exe -ArgumentList @('/select,', $path)
  exit 0
}
$dir = Split-Path -Parent $path
if ($dir -and (Test-Path -LiteralPath $dir)) {
  Start-Process explorer.exe -ArgumentList $dir
  exit 0
}
Write-Host "CGL: path not on this VM yet — $path"
exit 1
