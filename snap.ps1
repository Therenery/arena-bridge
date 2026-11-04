$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git log --format='%h %ad %s' --date=short -12 | Out-File -Encoding utf8 'F:\__AI__\work\arena-cli-commits.txt'
Write-Output '=== tree size ==='
$s = (Get-ChildItem -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\\.git\\' } | Measure-Object Length -Sum).Sum
Write-Output ('worktreeMB=' + [math]::Round($s/1MB,1))
Write-Output '=== orphan ==='
git checkout --orphan snap 2>&1 | Select-Object -Last 2
git add -A 2>&1 | Select-Object -Last 2
git commit -q -m 'Arena CLI snapshot: Qwen Code fork + arena bridge (no history)' 2>&1 | Select-Object -Last 2
Write-Output ('files=' + (git ls-files | Measure-Object).Count)
git log --oneline -1