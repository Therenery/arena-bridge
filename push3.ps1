$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== fsck ==='
git fsck --full 2>&1 | Select-Object -First 10
Write-Output '=== push ==='
git push --force private main 2>&1 | Out-String -Width 200