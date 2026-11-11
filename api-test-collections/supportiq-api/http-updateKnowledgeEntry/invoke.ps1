. (Join-Path $PSScriptRoot '..\common.ps1')
$entryId = $env:SUPPORTIQ_KB_ID
if (-not $entryId) { $entryId = '1' }
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
Invoke-SupportIqApi -Method PATCH -Path "/api/admin/kb/$entryId" -Body $body