$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== command names ==='
$hits = Select-String -Path 'packages\cli\src\ui\commands\*.ts' -Pattern "name: '(auth|login|logout)'" -ErrorAction SilentlyContinue
$hits | ForEach-Object { $_.Filename + ' :: ' + $_.Line.Trim() }
Write-Output '=== login word ==='
(Select-String -Path 'packages\cli\src\ui\commands\*.ts' -Pattern 'login' -ErrorAction SilentlyContinue | Measure-Object).Count