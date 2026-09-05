# CGL mill — Windows lab VM
#   powershell -File cgl.ps1
#   powershell -File cgl.ps1 -RegisterTask
#   powershell -File cgl.ps1 -RegisterProtocol
param(
  [string]$Config = (Join-Path $PSScriptRoot "ftp50.json"),
  [switch]$RegisterTask,
  [switch]$RegisterProtocol
)
$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "ftp_5_0.py"
$opener = Join-Path $PSScriptRoot "cgl-open.ps1"
function Invoke-Cgl {
  param([string[]]$ArgList)
  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $script @ArgList
    return $LASTEXITCODE
  }
  if (Get-Command python -ErrorAction SilentlyContinue) {
    & python $script @ArgList
    return $LASTEXITCODE
  }
  Write-Error "CGL: Python 3 not found. Install from python.org (py launcher) or add python.exe to PATH."
}
$cfgArgs = @("--non-interactive")
if (Test-Path $Config) { $cfgArgs = @("--config", $Config, "--non-interactive") }
if ($RegisterProtocol) {
  $cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$opener`" `"%1`""
  New-Item -Path "HKCU:\Software\Classes\cgl" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\Software\Classes\cgl" -Name "(default)" -Value "URL:CGL Protocol"
  New-ItemProperty -Path "HKCU:\Software\Classes\cgl" -Name "URL Protocol" -Value "" -Force | Out-Null
  New-Item -Path "HKCU:\Software\Classes\cgl\shell\open\command" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\Software\Classes\cgl\shell\open\command" -Name "(default)" -Value $cmd
  Write-Host "Registered cgl: links to open artifacts in Explorer via $opener"
  exit 0
}
if ($RegisterTask) {
  $py = if (Get-Command py -ErrorAction SilentlyContinue) { "py -3" } else { "python" }
  $tr = "cmd /c $py `"$script`" --config `"$Config`" --non-interactive"
  schtasks /Create /TN "CGL Mill" /SC MINUTE /MO 30 /TR $tr /F
  Write-Host "Registered Task Scheduler job 'CGL Mill' every 30 minutes (IgnoreNew is inside the mill)."
  exit 0
}
exit (Invoke-Cgl -ArgList $cfgArgs)
