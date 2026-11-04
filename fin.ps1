$ErrorActionPreference='Continue'
$r = gh api repos/Therenery/arena-cli | ConvertFrom-Json
Write-Output ('visibility=' + $r.visibility)
Write-Output ('default=' + $r.default_branch)
Write-Output ('sizeMB=' + [math]::Round($r.size/1024,1))
$c = gh api 'repos/Therenery/arena-cli/commits?per_page=1' | ConvertFrom-Json
Write-Output ('head=' + $c[0].sha.Substring(0,8))