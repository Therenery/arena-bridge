@echo off
setlocal
set "ARENA_HOME=%~dp0"
set "NODE_BIN="
where node >nul 2>&1 && set "NODE_BIN=node"
if not defined NODE_BIN if exist "E:\Programz\nodejs\node.exe" set "NODE_BIN=E:\Programz\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_BIN (
  echo node.exe not found
  exit /b 1
)
curl.exe -s -m 2 http://127.0.0.1:17892/health >nul 2>&1
if errorlevel 1 (
  start "arena-bridge" /min "%ARENA_HOME%bridge\launch.cmd"
  timeout /t 3 /nobreak >nul
)
"%NODE_BIN%" "%ARENA_HOME%scripts\arena-headless.js" %*
