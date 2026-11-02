@echo off
chcp 65001 >nul
setlocal

rem Arena Code 与 Arena Bridge 都在本仓库内，按脚本位置定位，不再依赖外部终端工程。
set "ARENA_REPO_ROOT=%~dp0.."
if defined ARENA_CODE_BIN goto have_code_bin
if exist "%ARENA_REPO_ROOT%\arena-code\bin\arena-code.js" set "ARENA_CODE_BIN=%ARENA_REPO_ROOT%\arena-code\bin\arena-code.js"
if not defined ARENA_CODE_BIN if exist "F:\__AI__\work\arena-code\bin\arena-code.js" set "ARENA_CODE_BIN=F:\__AI__\work\arena-code\bin\arena-code.js"
if not defined ARENA_CODE_BIN if exist "F:\__AI__\work\arena-bridge\arena-code\bin\arena-code.js" set "ARENA_CODE_BIN=F:\__AI__\work\arena-bridge\arena-code\bin\arena-code.js"
:have_code_bin
if not defined ARENA_CODE_BIN (
  echo 找不到 Arena Code 入口。请设置 ARENA_CODE_BIN，或把 arena.cmd 放在仓库的 cli-windows 目录中运行。 1>&2
  exit /b 1
)

if not defined ARENA_API_KEY set "ARENA_API_KEY=sk-arena-local"
if not defined ARENA_BRIDGE_URL set "ARENA_BRIDGE_URL=http://127.0.0.1:17892"

curl.exe -s -m 2 "%ARENA_BRIDGE_URL%/health" >nul 2>&1
if not errorlevel 1 goto bridge_ready
if exist "%ARENA_REPO_ROOT%\arena_bridge.js" (
  start "" /min /D "%ARENA_REPO_ROOT%" cmd /c "node arena_bridge.js >> bridge.log 2>&1"
  timeout /t 4 /nobreak >nul
) else if exist "F:\__AI__\work\arena_bridge.js" (
  start "" /min /D "F:\__AI__\work" cmd /c "node arena_bridge.js >> bridge.log 2>&1"
  timeout /t 4 /nobreak >nul
)
:bridge_ready

node "%ARENA_CODE_BIN%" %*
exit /b %ERRORLEVEL%
