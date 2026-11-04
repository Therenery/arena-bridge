$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== before ==='
git log --oneline -2
Write-Output '=== reset ==='
git reset --hard HEAD~1 2>&1 | Select-Object -Last 2
Write-Output '=== subtree full ==='
git subtree add --prefix=bridge 'F:\__AI__\work\arena-bridge' master 2>&1 | Select-Object -Last 4
Write-Output '=== after ==='
git log --oneline -8