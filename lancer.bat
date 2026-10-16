@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis. Installez une version LTS recente puis relancez.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto :failure
)
call npm run build
if errorlevel 1 goto :failure
start "" "http://127.0.0.1:4273"
call npm start
if errorlevel 1 goto :failure
exit /b 0
:failure
echo Le lancement a echoue. Consultez les messages ci-dessus.
pause
exit /b 1
