$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
git config http.postBuffer 524288000
git config http.version HTTP/1.1
git config http.lowSpeedLimit 0
git config http.lowSpeedTime 999999
git push --force --no-thin private main 2>&1 | Select-Object -Last 6