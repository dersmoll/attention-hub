[CmdletBinding()]
param(
    [switch]$RemoveCertificate,
    [switch]$RemoveMachineCertificate
)

$ErrorActionPreference = 'Stop'

$packageName = 'AttentionHub.Dev'
$publisher = 'CN=Attention Hub Development'
$friendlyName = 'Attention Hub Development Identity'

Get-AppxPackage -Name $packageName | Remove-AppxPackage

if ($RemoveCertificate) {
    Get-ChildItem Cert:\CurrentUser\TrustedPeople |
        Where-Object { $_.Subject -eq $publisher } |
        Remove-Item
    Get-ChildItem Cert:\CurrentUser\My |
        Where-Object { $_.Subject -eq $publisher -and $_.FriendlyName -eq $friendlyName } |
        Remove-Item
}


if ($RemoveMachineCertificate) {
    Get-ChildItem Cert:\LocalMachine\TrustedPeople |
        Where-Object { $_.Subject -eq $publisher } |
        Remove-Item
}

Write-Host "Removed the per-user $packageName identity package."
if ($RemoveCertificate) {
    Write-Host 'Removed the matching current-user development certificates.'
}
if ($RemoveMachineCertificate) {
    Write-Host 'Removed the matching local-machine Trusted People certificate.'
}
