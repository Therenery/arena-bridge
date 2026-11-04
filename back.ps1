$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git checkout -q main 2>&1 | Select-Object -Last 2
git branch --show-current
git log --oneline -1
git branch -v | Select-Object -First 4