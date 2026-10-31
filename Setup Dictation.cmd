@echo off
cd /d "%~dp0"
python scripts/setup-dictation.py
if errorlevel 1 pause
