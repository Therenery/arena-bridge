$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git commit -q -n -m 'Arena CLI snapshot: Qwen Code fork + arena bridge (no history)' 2>&1 | Select-Object -Last 2
Write-Output ('files=' + (git ls-files | Measure-Object).Count)
git log --oneline -1
Write-Output ('treeMB=' + [math]::Round((git cat-file -s (git rev-parse 'HEAD^{tree}'))/1MB,2))