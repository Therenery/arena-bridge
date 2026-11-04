$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
$root = Get-Content 'package.json' -Raw | ConvertFrom-Json
Write-Output ('bundle=' + $root.scripts.bundle)
Write-Output ('build:packages=' + $root.scripts.'build:packages')
Get-ChildItem 'scripts' -File | Select-Object -ExpandProperty Name