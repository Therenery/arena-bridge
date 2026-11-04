$ErrorActionPreference = 'Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git checkout --orphan snapshot-archive 2>&1 | Out-Null
git rm -r --cached . -q 2>&1 | Out-Null
git add -A 2>&1 | Out-Null
git rm -r --cached -q .github/workflows 2>&1 | Out-Null
$n = (git ls-files | Measure-Object).Count
Write-Output ('tracked=' + $n)
git commit -q -m 'Arena CLI snapshot (Qwen Code fork, workflows excluded)' 2>&1 | Select-Object -Last 2
git push private snapshot-archive:main 2>&1 | Select-Object -Last 4
git checkout main 2>&1 | Out-Null
git status -sb | Select-Object -First 1