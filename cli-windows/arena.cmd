@echo off
rem arena -- start the arena-lite terminal client (client lives in ArenaCodeCLILite)
rem Do NOT chcp here: the input code page must stay at the system default (936),
rem otherwise the Chinese IME stops working.
title Arena
setlocal

rem start the bridge if it is not up yet
curl.exe -s -m 2 http://127.0.0.1:17892/health >nul 2>&1
if errorlevel 1 (
  start "" /min cmd /c "cd /d F:\__AI__\work\arena-bridge && node arena_bridge.js >> F:\__AI__\work\bridge.log 2>&1"
  timeout /t 4 /nobreak >nul
)

where arena-lite.exe >nul 2>&1
if errorlevel 1 (
  echo arena-lite.exe not found. Build or download it from ArenaCodeCLILite and put it on PATH.
  exit /b 1
)

arena-lite.exe %*
