@echo off
setlocal
cd /d "%~dp0"
REM CGL mill — Windows lab VM. Prefers the Python launcher, then python.exe.
if exist "%~dp0ftp50.json" (
  set CFG=--config "%~dp0ftp50.json"
) else (
  set CFG=
)
where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 "%~dp0ftp_5_0.py" %CFG% --non-interactive %*
  exit /b %ERRORLEVEL%
)
where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python "%~dp0ftp_5_0.py" %CFG% --non-interactive %*
  exit /b %ERRORLEVEL%
)
echo CGL: install Python 3 from python.org and check "Add python.exe to PATH", or the py launcher.
exit /b 1
