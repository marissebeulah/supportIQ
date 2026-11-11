. (Join-Path $PSScriptRoot '..\common.ps1')
$entryId = $env:SUPPORTIQ_KB_ID
if (-not $entryId) { $entryId = '1' }
Invoke-SupportIqApi -Method DELETE -Path "/api/admin/kb/$entryId"