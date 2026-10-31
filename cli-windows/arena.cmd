@echo off
setlocal
set QWEN_DIR=F:\__AI__\work\qwen-code
set QWEN_SYSTEM_MD=F:\__AI__\work\arena-system.md
set ARENA_API_KEY=sk-arena-local
if not exist C:\Users\zhang\arena-cwd mkdir C:\Users\zhang\arena-cwd
cd /d C:\Users\zhang\arena-cwd
curl.exe -s -m 2 http://127.0.0.1:17892/health >nul 2>&1
if errorlevel 1 (
  start "" /min cmd /c "cd /d F:\__AI__\work && node arena_bridge.js >> F:\__AI__\work\bridge.log 2>&1"
  timeout /t 3 /nobreak >nul
)
node "%QWEN_DIR%\packages\cli\dist\index.js" %*

