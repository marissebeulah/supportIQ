. (Join-Path $PSScriptRoot '..\common.ps1')
$replyId = $env:SUPPORTIQ_CANNED_REPLY_ID
if (-not $replyId) { $replyId = '1' }
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
Invoke-SupportIqApi -Method PATCH -Path "/api/admin/canned-replies/$replyId" -Body $body