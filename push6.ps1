$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git push private main:refs/heads/archive 2>&1 | Select-Object -Last 4
Write-Output ('exit=' + $LASTEXITCODE)