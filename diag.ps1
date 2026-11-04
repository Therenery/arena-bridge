$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git count-objects -vH
Write-Output '--- top objects ---'
$objs = git rev-list --objects --all | ForEach-Object { $p = $_ -split ' ', 2; if ($p.Count -eq 2) { $p[1] } }
git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' --batch-all-objects | Where-Object { $_ -like 'blob*' } | ForEach-Object { $f = $_ -split ' '; [pscustomobject]@{ Size = [int64]$f[2]; Rest = ($f[3..($f.Count-1)] -join ' ') } } | Sort-Object Size -Descending | Select-Object -First 6 | ForEach-Object { Write-Output ('{0,10} KB  {1}' -f [int]($_.Size/1024), $_.Rest) }