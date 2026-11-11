. (Join-Path $PSScriptRoot '..\common.ps1')
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
$body.question = "Local test question $([guid]::NewGuid().ToString('N'))"
Invoke-SupportIqApi -Method POST -Path '/api/admin/kb' -Body $body