# Allows other devices on the local network to reach SupportIQ.
# Run this once from an elevated PowerShell window (Run as administrator):
#   powershell -ExecutionPolicy Bypass -File scripts/open-firewall.ps1
$ErrorActionPreference = 'Stop'

# 5173 = HTTPS web app (Vite dev server / voice + video calls + remote portal)
# 3001 = API, used by the native SupportIQ Agent
$ports = @(
  @{ Port = 5173; Name = 'SupportIQ web (HTTPS 5173)' },
  @{ Port = 3001; Name = 'SupportIQ API (3001)' }
)

foreach ($entry in $ports) {
  $existing = Get-NetFirewallRule -DisplayName $entry.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $entry.Name -Enabled True -Action Allow -Profile Private, Domain | Out-Null
    "updated rule: $($entry.Name)"
    continue
  }
  New-NetFirewallRule `
    -DisplayName $entry.Name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $entry.Port `
    -Profile Private, Domain `
    -Description 'SupportIQ local network access (web portal, calls, remote support agent).' | Out-Null
  "created rule: $($entry.Name)"
}

"Done. Devices on the same private network can now open https://<this-PC-IP>:5173"
