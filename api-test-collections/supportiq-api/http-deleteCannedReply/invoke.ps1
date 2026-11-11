. (Join-Path $PSScriptRoot '..\common.ps1')
$replyId = $env:SUPPORTIQ_CANNED_REPLY_ID
if (-not $replyId) { $replyId = '1' }
Invoke-SupportIqApi -Method DELETE -Path "/api/admin/canned-replies/$replyId"