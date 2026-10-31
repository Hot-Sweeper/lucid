@echo off
cd /d "%~dp0"
node scripts/start-dictation-test.mjs %*
if errorlevel 1 pause
