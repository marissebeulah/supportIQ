$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root '.certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$pfxPath = Join-Path $certDir 'dev.pfx'
$cerPath = Join-Path $certDir 'dev.cer'
$password = ConvertTo-SecureString -String 'supportiq-dev' -Force -AsPlainText

# Include localhost plus every LAN IPv4 address so other devices on the network
# can open https://<this-computer-ip>:5174 without a name mismatch.
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress -Unique

$sanEntries = @('DNS=localhost', 'DNS=supportiq.local', 'IPAddress=127.0.0.1', 'IPAddress=::1')
foreach ($ip in $ips) {
  $sanEntries += "IPAddress=$ip"
}
$san = '2.5.29.17={text}' + ($sanEntries -join '&')

$cert = New-SelfSignedCertificate `
  -Type Custom `
  -Subject 'CN=SupportIQ Dev' `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -NotAfter (Get-Date).AddYears(3) `
  -TextExtension @($san)

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

"created PFX: $pfxPath"
"created CER: $cerPath"
"covered addresses: $($sanEntries -join ', ')"
"thumbprint: $($cert.Thumbprint)"
