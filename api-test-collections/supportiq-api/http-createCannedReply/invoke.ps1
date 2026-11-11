. (Join-Path $PSScriptRoot '..\common.ps1')
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
$body.title = "Local API test $([guid]::NewGuid().ToString('N'))"
Invoke-SupportIqApi -Method POST -Path '/api/admin/canned-replies' -Body $body