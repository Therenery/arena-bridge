$ErrorActionPreference='Continue'
$r = gh api repos/Therenery/arena-cli | ConvertFrom-Json
Write-Output ('visibility=' + $r.visibility + ' default=' + $r.default_branch + ' sizeKB=' + $r.size)
$w = gh api 'repos/Therenery/arena-cli/contents/.github/workflows?ref=archive' | ConvertFrom-Json
Write-Output ('workflows=' + $w.Count)
$c = gh api 'repos/Therenery/arena-cli/commits?sha=archive&per_page=1' | ConvertFrom-Json
Write-Output ('head=' + $c[0].sha.Substring(0,8) + ' ' + $c[0].commit.message.Split("`n")[0])