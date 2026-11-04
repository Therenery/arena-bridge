$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== slash commands ==='
(Get-ChildItem 'packages\cli\src\ui\commands' -File -Filter '*.ts' | Where-Object { $_.Name -notmatch '\.test\.' } | Select-Object -ExpandProperty BaseName) -join ','
Write-Output '=== login/auth refs in commands ==='
Select-String -Path 'packages\cli\src\ui\commands\*.ts' -Pattern 'login|/auth' -SimpleMatch | Select-Object -First 5 | ForEach-Object { $_.Filename + ':' + $_.LineNumber }
Write-Output '=== settings schema arena ==='
Select-String -Path 'packages\cli\src\config\settingsSchema.ts' -Pattern 'arena|baseUrl|apiKey' | Select-Object -First 15 | ForEach-Object { $_.LineNumber.ToString() + ': ' + $_.Line.Trim() }