$ErrorActionPreference='Continue'
Remove-Item 'F:\__AI__\work\gh2.out','F:\__AI__\work\gh2.err' -ErrorAction SilentlyContinue
Set-Content -Path 'F:\__AI__\work\enter.txt' -Value "`r`n" -Encoding ascii -NoNewline
$p = Start-Process -FilePath 'gh' -ArgumentList 'auth','refresh','-h','github.com','-s','workflow','-s','delete_repo' -RedirectStandardInput 'F:\__AI__\work\enter.txt' -RedirectStandardOutput 'F:\__AI__\work\gh2.out' -RedirectStandardError 'F:\__AI__\work\gh2.err' -PassThru -NoNewWindow
Start-Sleep -Seconds 3
Write-Output ('pid=' + $p.Id)
Get-Content 'F:\__AI__\work\gh2.out' -ErrorAction SilentlyContinue
Get-Content 'F:\__AI__\work\gh2.err' -ErrorAction SilentlyContinue