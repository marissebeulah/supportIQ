. (Join-Path $PSScriptRoot '..\common.ps1')
$attachmentId = $env:SUPPORTIQ_ATTACHMENT_ID
if (-not $attachmentId) { $attachmentId = '1' }
Invoke-SupportIqApi -Method GET -Path "/api/attachments/$attachmentId"