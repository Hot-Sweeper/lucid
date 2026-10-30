@echo off
rem Starts Lucid from this folder.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "dist\index.html" call npm run build
start "" "%~dp0node_modules\electron\dist\electron.exe" .
