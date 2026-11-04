$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== scripts with bundle ==='
Get-ChildItem 'scripts' -File | Where-Object { $_.Name -match 'bundle|pack|release|build' } | ForEach-Object { $_.Name }
Write-Output '=== pkg json scripts ==='
$root = Get-Content 'package.json' -Raw | ConvertFrom-Json
$root.scripts.PSObject.Properties | Where-Object { $_.Name -match 'bundle|pack|release' } | ForEach-Object { $_.Name + ' = ' + $_.Value }
Write-Output '=== cli deps ==='
$cli = Get-Content 'packages\cli\package.json' -Raw | ConvertFrom-Json
$cli.dependencies.PSObject.Properties | Where-Object { $_.Value -match 'workspace' } | ForEach-Object { $_.Name + ' -> ' + $_.Value }