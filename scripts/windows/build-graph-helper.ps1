[CmdletBinding()]
param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectPath = Join-Path $projectRoot "src-native\AttentionHub.GraphCalendarHelper\AttentionHub.GraphCalendarHelper.csproj"
$outputPath = Join-Path $projectRoot "src-tauri\target\graph-helper"
$nugetConfigPath = Join-Path $projectRoot "NuGet.Config"

& dotnet restore $projectPath `
  --runtime win-x64 `
  --configfile $nugetConfigPath

if ($LASTEXITCODE -ne 0) {
  throw "The Graph calendar helper restore failed with exit code $LASTEXITCODE."
}

& dotnet publish $projectPath `
  --configuration $Configuration `
  --runtime win-x64 `
  --self-contained false `
  --no-restore `
  --output $outputPath

if ($LASTEXITCODE -ne 0) {
  throw "The Graph calendar helper publish failed with exit code $LASTEXITCODE."
}

$executablePath = Join-Path $outputPath "attention-hub-graph-helper.exe"
if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
  throw "The Graph calendar helper executable was not produced at $executablePath."
}

Write-Output $executablePath
