$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
$tmp = 'F:\__AI__\work\objs.txt'
git rev-list --objects --all > $tmp
$lines = [System.IO.File]::ReadAllLines($tmp)
Write-Output ('objects=' + $lines.Count)
$top = $lines | ForEach-Object {
  $sp = $_.IndexOf(' ')
  if ($sp -gt 0) { [pscustomobject]@{ Sha = $_.Substring(0,$sp); Path = $_.Substring($sp+1) } }
} | ForEach-Object {
  $s = (git cat-file -s $_.Sha 2>$null)
  if ($s) { [pscustomobject]@{ Size = [int64]$s; Path = $_.Path } }
} | Sort-Object Size -Descending | Select-Object -First 8
$top | ForEach-Object { Write-Output ('{0,8:N1} MB  {1}' -f ($_.Size/1MB), $_.Path) }