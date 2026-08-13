[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [ValidateRange(0, 120)]
    [int]$WarmupMinutes = 10
)

$ErrorActionPreference = 'Stop'

function Convert-ToDouble {
    param([object]$Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }
    return [double]::Parse(
        [string]$Value,
        [Globalization.CultureInfo]::InvariantCulture
    )
}

function Test-MonotonicGrowth {
    param(
        [object[]]$Samples,
        [string]$Property
    )

    for ($index = 1; $index -lt $Samples.Count; $index++) {
        if ([double]$Samples[$index].$Property -le [double]$Samples[$index - 1].$Property) {
            return $false
        }
    }
    return $Samples.Count -gt 1
}

$resolvedInput = [IO.Path]::GetFullPath($InputPath)
if (-not (Test-Path -LiteralPath $resolvedInput -PathType Leaf)) {
    throw "Resource sample does not exist: $resolvedInput"
}

$samples = @(
    Import-Csv -LiteralPath $resolvedInput |
        ForEach-Object {
            [pscustomobject]@{
                Timestamp = [datetimeoffset]::Parse($_.Timestamp)
                ElapsedSeconds = Convert-ToDouble $_.ElapsedSeconds
                ProcessCount = [int]$_.ProcessCount
                CpuPercentMachine = Convert-ToDouble $_.CpuPercentMachine
                WorkingSetBytes = [int64]$_.WorkingSetBytes
                PrivateBytes = [int64]$_.PrivateBytes
                HandleCount = [int64]$_.HandleCount
            }
        }
)

if ($samples.Count -eq 0) {
    throw 'Resource sample is empty.'
}

$warmupSeconds = $WarmupMinutes * 60
$postWarmup = @($samples | Where-Object { $_.ElapsedSeconds -ge $warmupSeconds })
if ($postWarmup.Count -eq 0) {
    throw "No samples remain after the $WarmupMinutes-minute warm-up."
}

$cpuSamples = @($postWarmup | Where-Object { $null -ne $_.CpuPercentMachine })
$first = $postWarmup[0]
$last = $postWarmup[-1]

[pscustomobject]@{
    InputPath = $resolvedInput
    TotalSamples = $samples.Count
    TotalDurationSeconds = [Math]::Round($samples[-1].ElapsedSeconds, 1)
    WarmupMinutes = $WarmupMinutes
    PostWarmupSamples = $postWarmup.Count
    PostWarmupDurationSeconds = [Math]::Round(
        $last.ElapsedSeconds - $first.ElapsedSeconds,
        1
    )
    ProcessCountMinimum = [int](
        $postWarmup | Measure-Object -Property ProcessCount -Minimum
    ).Minimum
    ProcessCountMaximum = [int](
        $postWarmup | Measure-Object -Property ProcessCount -Maximum
    ).Maximum
    AverageCpuPercentMachine = if ($cpuSamples.Count -gt 0) {
        [Math]::Round([double](
            $cpuSamples | Measure-Object -Property CpuPercentMachine -Average
        ).Average, 3)
    } else {
        $null
    }
    PeakCpuPercentMachine = if ($cpuSamples.Count -gt 0) {
        [Math]::Round([double](
            $cpuSamples | Measure-Object -Property CpuPercentMachine -Maximum
        ).Maximum, 3)
    } else {
        $null
    }
    WorkingSetFirstBytes = $first.WorkingSetBytes
    WorkingSetLastBytes = $last.WorkingSetBytes
    WorkingSetPeakBytes = [int64](
        $postWarmup | Measure-Object -Property WorkingSetBytes -Maximum
    ).Maximum
    PrivateFirstBytes = $first.PrivateBytes
    PrivateLastBytes = $last.PrivateBytes
    PrivatePeakBytes = [int64](
        $postWarmup | Measure-Object -Property PrivateBytes -Maximum
    ).Maximum
    HandleFirst = $first.HandleCount
    HandleLast = $last.HandleCount
    HandlePeak = [int64](
        $postWarmup | Measure-Object -Property HandleCount -Maximum
    ).Maximum
    WorkingSetGrewEverySample = Test-MonotonicGrowth $postWarmup 'WorkingSetBytes'
    PrivateBytesGrewEverySample = Test-MonotonicGrowth $postWarmup 'PrivateBytes'
    HandlesGrewEverySample = Test-MonotonicGrowth $postWarmup 'HandleCount'
}
