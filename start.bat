@echo off
setlocal
cd /d "%~dp0"
set "LW_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "LW_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%LW_NODE%" scripts\launch.js
if errorlevel 1 pause
