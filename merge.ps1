$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== subtree ==='
git subtree add --prefix=bridge 'F:\__AI__\work\arena-bridge' master --squash 2>&1 | Out-String -Width 200
Write-Output ('exit=' + $LASTEXITCODE)
Write-Output '=== tree ==='
if (Test-Path 'bridge') { Get-ChildItem 'bridge' -Force | ForEach-Object { $_.Name } }