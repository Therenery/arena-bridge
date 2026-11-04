$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== push archive ==='
git push private main:refs/heads/archive 2>&1 | Out-String -Width 200