$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git push private snap:refs/heads/code 2>&1 | Select-Object -Last 5
Write-Output ('exit=' + $LASTEXITCODE)