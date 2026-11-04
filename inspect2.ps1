$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== cmds ==='
$n = Get-ChildItem 'packages\cli\src\ui\commands' -File -Filter '*.ts' | Where-Object { $_.Name -notmatch '\.test\.' } | ForEach-Object { $_.BaseName }
Write-Output ($n -join ',')
Write-Output '=== settings files ==='
Get-ChildItem "$env:USERPROFILE\.arena" -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
Get-ChildItem "$env:USERPROFILE\.qwen" -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }