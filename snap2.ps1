$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git commit -q -m 'Arena CLI snapshot: Qwen Code fork + arena bridge (no history)' 2>&1 | Select-Object -Last 2
Write-Output ('files=' + (git ls-files | Measure-Object).Count)
git log --oneline -1
git count-objects -vH | Select-String 'size-pack'