[CmdletBinding()]
param(
    [string]$ExternalLocation,
    [switch]$TrustMachineCertificate
)

$ErrorActionPreference = 'Stop'

$packageName = 'AttentionHub.Dev'
$publisher = 'CN=Attention Hub Development'
$friendlyName = 'Attention Hub Development Identity'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$packageSource = Join-Path $repoRoot 'src-tauri\windows\identity\package'
$outputDirectory = Join-Path $repoRoot 'src-tauri\target\dev-identity'
$packagePath = Join-Path $outputDirectory 'AttentionHub.Dev.msix'
$certificatePath = Join-Path $outputDirectory 'AttentionHub.Dev.cer'
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'

if (-not (Test-Path -LiteralPath $cargo)) {
    throw "Could not find Cargo at $cargo."
}

if (-not $ExternalLocation) {
    $ExternalLocation = Join-Path $repoRoot 'src-tauri\target\debug'
}

$ExternalLocation = [System.IO.Path]::GetFullPath($ExternalLocation)
$expectedExternalRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'src-tauri\target'))

if (-not $ExternalLocation.StartsWith($expectedExternalRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ExternalLocation must be inside $expectedExternalRoot. Received: $ExternalLocation"
}

$env:ATTENTION_HUB_DEV_IDENTITY = '1'
& $cargo build --manifest-path (Join-Path $repoRoot 'src-tauri\Cargo.toml')
if ($LASTEXITCODE -ne 0) {
    throw "Identity-enabled Cargo build failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $ExternalLocation -PathType Container)) {
    throw "ExternalLocation does not exist after the identity build: $ExternalLocation"
}

$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$sdkTools = Get-ChildItem -LiteralPath $sdkRoot -Directory |
    Sort-Object -Property Name -Descending |
    ForEach-Object {
        $makeAppx = Join-Path $_.FullName 'x64\MakeAppx.exe'
        $signTool = Join-Path $_.FullName 'x64\SignTool.exe'
        if ((Test-Path -LiteralPath $makeAppx) -and (Test-Path -LiteralPath $signTool)) {
            [pscustomobject]@{ MakeAppx = $makeAppx; SignTool = $signTool }
        }
    } |
    Select-Object -First 1

if (-not $sdkTools) {
    throw "Could not find x64 MakeAppx.exe and SignTool.exe below $sdkRoot."
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $publisher -and $_.FriendlyName -eq $friendlyName } |
    Sort-Object -Property NotAfter -Descending |
    Select-Object -First 1

if (-not $certificate -or $certificate.NotAfter -le (Get-Date).AddDays(30)) {
    $certificate = New-SelfSignedCertificate `
        -Type Custom `
        -Subject $publisher `
        -FriendlyName $friendlyName `
        -CertStoreLocation Cert:\CurrentUser\My `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -KeyUsage DigitalSignature `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3') `
        -NotAfter (Get-Date).AddYears(2)
}

Export-Certificate -Cert $certificate -FilePath $certificatePath -Force | Out-Null

$trustedCertificate = Get-ChildItem Cert:\CurrentUser\TrustedPeople |
    Where-Object { $_.Thumbprint -eq $certificate.Thumbprint } |
    Select-Object -First 1

if (-not $trustedCertificate) {
    Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null
}

if ($TrustMachineCertificate) {
    $machineTrustedCertificate = Get-ChildItem Cert:\LocalMachine\TrustedPeople |
        Where-Object { $_.Thumbprint -eq $certificate.Thumbprint } |
        Select-Object -First 1

    if (-not $machineTrustedCertificate) {
        Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
    }
}

& $sdkTools.MakeAppx pack /o /d $packageSource /nv /p $packagePath
if ($LASTEXITCODE -ne 0) {
    throw "MakeAppx failed with exit code $LASTEXITCODE."
}

& $sdkTools.SignTool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $packagePath
if ($LASTEXITCODE -ne 0) {
    throw "SignTool failed with exit code $LASTEXITCODE."
}

Get-AppxPackage -Name $packageName | Remove-AppxPackage
Add-AppxPackage -Path $packagePath -ExternalLocation $ExternalLocation

$registered = Get-AppxPackage -Name $packageName
if (-not $registered) {
    throw "The development identity package was not found after registration."
}

$registered | Select-Object Name, PackageFullName, PackageFamilyName, InstallLocation
Write-Host "External location: $ExternalLocation"
Write-Host "Development certificate thumbprint: $($certificate.Thumbprint)"
Write-Host 'Run scripts\windows\run-dev-with-identity.ps1 to launch the registered identity build.'
