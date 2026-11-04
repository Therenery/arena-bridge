$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git fetch --unshallow origin 2>&1 | Select-Object -Last 5
Write-Output '=== after ==='
Test-Path '.git\shallow'
git rev-list --count HEAD