@echo off
setlocal
cd /d "%~dp0"
set "AURA_URL=http://localhost:4173/redesign-preview.html"

where py >nul 2>&1
if %errorlevel%==0 (
  start "" "%AURA_URL%"
  echo AURA PADDLE local review is running at:
  echo %AURA_URL%
  echo.
  echo Keep this window open. Press Control-C to stop the preview server.
  py -m http.server 4173
  exit /b
)

where python >nul 2>&1
if %errorlevel%==0 (
  start "" "%AURA_URL%"
  echo AURA PADDLE local review is running at:
  echo %AURA_URL%
  echo.
  echo Keep this window open. Press Control-C to stop the preview server.
  python -m http.server 4173
  exit /b
)

echo Python was not found. Opening the extracted offline homepage directly.
start "" "%~dp0START_HERE.html"
pause
