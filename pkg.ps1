$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
$cli = Get-Content 'packages\cli\package.json' -Raw | ConvertFrom-Json
Write-Output ('cli.name=' + $cli.name)
Write-Output ('bin=' + ($cli.bin | ConvertTo-Json -Compress))
Write-Output ('version=' + $cli.version)
$root = Get-Content 'package.json' -Raw | ConvertFrom-Json
Write-Output ('root.name=' + $root.name)
Write-Output ('scripts=' + (($root.scripts.PSObject.Properties | Where-Object { $_.Name -match 'build|bundle' } | ForEach-Object { $_.Name }) -join ','))