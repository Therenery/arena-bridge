$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
$s = (Get-ChildItem 'packages\cli\dist' -Recurse -File | Measure-Object Length -Sum).Sum
Write-Output ('distMB=' + [math]::Round($s/1MB,1))
Write-Output ('index=' + (Test-Path 'packages\cli\dist\index.js'))