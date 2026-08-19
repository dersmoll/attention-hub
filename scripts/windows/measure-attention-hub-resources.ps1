[CmdletBinding()]
param(
    [ValidateRange(1, 60)]
    [int]$DurationMinutes = 30,

    [ValidateRange(1, 60)]
    [int]$SampleSeconds = 5,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

function Get-AttentionHubProcessIds {
    $allProcesses = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
    $rootIds = @(
        $allProcesses |
            Where-Object { $_.Name -ieq 'attention-hub.exe' } |
            ForEach-Object { [int]$_.ProcessId }
    )

    if ($rootIds.Count -eq 0) {
        return @()
    }

    $selected = [System.Collections.Generic.HashSet[int]]::new()
    $pending = [System.Collections.Generic.Queue[int]]::new()
    foreach ($rootId in $rootIds) {
        $pending.Enqueue($rootId)
    }

    while ($pending.Count -gt 0) {
        $current = $pending.Dequeue()
        if (-not $selected.Add($current)) {
            continue
        }
        foreach ($child in $allProcesses | Where-Object { [int]$_.ParentProcessId -eq $current }) {
            $pending.Enqueue([int]$child.ProcessId)
        }
    }

    return @($selected)
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    throw "Output directory does not exist: $outputDirectory"
}

$logicalProcessors = [Math]::Max(1, [Environment]::ProcessorCount)
$sampleCount = [Math]::Max(1, [int][Math]::Ceiling(($DurationMinutes * 60) / $SampleSeconds))
$startedAt = Get-Date
$previousCpuSeconds = $null
$previousSampleAt = $null
$samples = [System.Collections.Generic.List[object]]::new()

for ($index = 0; $index -lt $sampleCount; $index++) {
    $sampleAt = Get-Date
    $processIds = @(Get-AttentionHubProcessIds)
    if ($processIds.Count -eq 0) {
        throw 'Attention Hub is not running. Start the approved beta before measuring resources.'
    }

    $processes = @(
        foreach ($processId in $processIds) {
            Get-Process -Id $processId -ErrorAction SilentlyContinue
        }
    )
    if ($processes.Count -eq 0) {
        throw 'Attention Hub stopped while resource data was being collected.'
    }

    $cpuSeconds = [double](($processes | Measure-Object -Property CPU -Sum).Sum)
    $cpuPercent = $null
    if ($null -ne $previousCpuSeconds -and $null -ne $previousSampleAt) {
        $wallSeconds = [Math]::Max(0.001, ($sampleAt - $previousSampleAt).TotalSeconds)
        $cpuDelta = [Math]::Max(0, $cpuSeconds - $previousCpuSeconds)
        $cpuPercent = [Math]::Round(($cpuDelta / $wallSeconds / $logicalProcessors) * 100, 3)
    }

    $samples.Add([pscustomobject]@{
        Timestamp = $sampleAt.ToString('o')
        ElapsedSeconds = [Math]::Round(($sampleAt - $startedAt).TotalSeconds, 1)
        ProcessCount = $processes.Count
        CpuPercentMachine = $cpuPercent
        WorkingSetBytes = [int64](($processes | Measure-Object -Property WorkingSet64 -Sum).Sum)
        PrivateBytes = [int64](($processes | Measure-Object -Property PrivateMemorySize64 -Sum).Sum)
        HandleCount = [int64](($processes | Measure-Object -Property HandleCount -Sum).Sum)
    })

    $previousCpuSeconds = $cpuSeconds
    $previousSampleAt = $sampleAt
    if ($index + 1 -lt $sampleCount) {
        Start-Sleep -Seconds $SampleSeconds
    }
}

$samples | Export-Csv -LiteralPath $resolvedOutput -NoTypeInformation -Encoding utf8

$measuredCpu = @($samples | Where-Object { $null -ne $_.CpuPercentMachine })
[pscustomobject]@{
    OutputPath = $resolvedOutput
    Samples = $samples.Count
    DurationSeconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
    AverageCpuPercentMachine = if ($measuredCpu.Count -gt 0) {
        [Math]::Round([double](($measuredCpu | Measure-Object -Property CpuPercentMachine -Average).Average), 3)
    } else {
        $null
    }
    PeakWorkingSetBytes = [int64](($samples | Measure-Object -Property WorkingSetBytes -Maximum).Maximum)
    PeakPrivateBytes = [int64](($samples | Measure-Object -Property PrivateBytes -Maximum).Maximum)
    PeakHandleCount = [int64](($samples | Measure-Object -Property HandleCount -Maximum).Maximum)
} | Format-List
