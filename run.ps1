$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output ('dist=' + (Test-Path 'packages\cli\dist\index.js'))
$root = Get-Content 'package.json' -Raw | ConvertFrom-Json
Write-Output ('start=' + $root.scripts.start)
Write-Output ('build=' + $root.scripts.build)
Write-Output ('node_modules=' + (Test-Path 'node_modules'))