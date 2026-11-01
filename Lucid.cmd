@echo off
rem Open the installed version. Use Check updates in Lucid to install source changes.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
node "%~dp0scripts\launch.cjs"
