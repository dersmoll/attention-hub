[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$corepack = Join-Path $env:ProgramFiles 'nodejs\corepack.cmd'
$cargoDirectory = Join-Path $env:USERPROFILE '.cargo\bin'

if (-not (Test-Path -LiteralPath $corepack)) {
    throw "Could not find Corepack at $corepack."
}

if (-not (Test-Path -LiteralPath (Join-Path $cargoDirectory 'cargo.exe'))) {
    throw "Could not find Cargo below $cargoDirectory."
}

$env:ATTENTION_HUB_DEV_IDENTITY = '1'
$env:Path = "$cargoDirectory;$env:Path"

Push-Location -LiteralPath $repoRoot
try {
    & $corepack pnpm tauri dev
    if ($LASTEXITCODE -ne 0) {
        throw "Identity-enabled Tauri development run failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
