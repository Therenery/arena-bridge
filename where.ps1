$ErrorActionPreference='Continue'
Write-Output '=== which qwen ==='
Get-Command qwen -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }
Write-Output '=== global npm list ==='
npm ls -g --depth=0 2>$null | Select-String 'qwen|arena'
Write-Output '=== registry ==='
npm view @qwen-code/qwen-code version 2>&1 | Select-Object -Last 2