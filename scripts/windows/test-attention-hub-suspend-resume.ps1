[CmdletBinding()]
param(
    [string]$ExecutablePath = "$env:LOCALAPPDATA\Attention Hub\attention-hub.exe",

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [ValidateRange(1, 2)]
    [int]$Cycles = 2,

    [ValidateRange(1, 10)]
    [int]$WakeAfterMinutes = 2
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class AttentionHubPower
{
    [DllImport("powrprof.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetSuspendState(
        [MarshalAs(UnmanagedType.Bool)] bool hibernate,
        [MarshalAs(UnmanagedType.Bool)] bool forceCritical,
        [MarshalAs(UnmanagedType.Bool)] bool disableWakeEvent
    );
}
'@

function Wait-WidgetWindow {
    param(
        [int]$ProcessId,
        [int]$TimeoutSeconds = 45
    )

    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
        $ProcessId
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        $window = @(
            $root.FindAll(
                [System.Windows.Automation.TreeScope]::Children,
                $condition
            ) |
                Where-Object { $_.Current.Name -eq 'Attention Hub' }
        ) | Select-Object -First 1
        if ($null -ne $window) {
            return $window
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    return $null
}

function Get-Snapshot {
    param(
        [System.Diagnostics.Process]$Process,
        [string]$Label
    )

    $liveProcess = Get-Process -Id $Process.Id -ErrorAction SilentlyContinue
    if ($null -eq $liveProcess) {
        return [pscustomobject]@{
            Label = $Label
            Timestamp = (Get-Date).ToString('o')
            ProcessSurvived = $false
            WidgetAvailable = $false
            VisualCount = 0
            VisibleVisualCount = 0
        }
    }

    $window = Wait-WidgetWindow -ProcessId $Process.Id
    if ($null -eq $window) {
        return [pscustomobject]@{
            Label = $Label
            Timestamp = (Get-Date).ToString('o')
            ProcessSurvived = $true
            WidgetAvailable = $false
            VisualCount = 0
            VisibleVisualCount = 0
        }
    }

    $visuals = @(
        $window.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        ) |
            Where-Object { $_.Current.Name -like 'Attention Hub -* visual' }
    )

    return [pscustomobject]@{
        Label = $Label
        Timestamp = (Get-Date).ToString('o')
        ProcessSurvived = $true
        WidgetAvailable = $true
        WidgetBounds = $window.Current.BoundingRectangle.ToString()
        WidgetOffscreen = $window.Current.IsOffscreen
        VisualCount = $visuals.Count
        VisibleVisualCount = @($visuals | Where-Object { -not $_.Current.IsOffscreen }).Count
        VisualBounds = @($visuals | ForEach-Object { $_.Current.BoundingRectangle.ToString() })
    }
}

$resolvedExecutable = [IO.Path]::GetFullPath($ExecutablePath)
if (-not (Test-Path -LiteralPath $resolvedExecutable -PathType Leaf)) {
    throw "Installed executable does not exist: $resolvedExecutable"
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    throw "Output directory does not exist: $outputDirectory"
}

$process = @(
    Get-Process -Name 'attention-hub' -ErrorAction SilentlyContinue |
        Where-Object {
            try {
                [IO.Path]::GetFullPath($_.Path) -ieq $resolvedExecutable
            } catch {
                $false
            }
        }
) | Select-Object -First 1

if ($null -eq $process) {
    throw 'The installed Attention Hub must be running before suspend/resume validation.'
}

$taskPrefix = 'AttentionHub-M6-Wake'
$results = [System.Collections.Generic.List[object]]::new()
$checkpoint = [pscustomobject]@{
    Status = 'armed'
    ExecutablePath = $resolvedExecutable
    ProcessId = $process.Id
    RequestedCycles = $Cycles
    WakeAfterMinutes = $WakeAfterMinutes
    StartedAt = (Get-Date).ToString('o')
    Cycles = @()
}
$checkpoint | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8

for ($cycle = 1; $cycle -le $Cycles; $cycle++) {
    $taskName = "$taskPrefix-$($process.Id)-$cycle"
    $wakeAt = (Get-Date).AddMinutes($WakeAfterMinutes)
    $action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\cmd.exe" -Argument '/c exit 0'
    $trigger = New-ScheduledTaskTrigger -Once -At $wakeAt
    $settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

    try {
        $taskParameters = @{
            TaskName = $taskName
            Action = $action
            Trigger = $trigger
            Settings = $settings
            Principal = $principal
            Force = $true
        }
        Register-ScheduledTask @taskParameters | Out-Null

        $wakeTimerArmed = (powercfg.exe /waketimers 2>&1 | Out-String) -notmatch 'no active wake timers'
        $before = Get-Snapshot -Process $process -Label "before-$cycle"
        $suspendRequestedAt = Get-Date
        $suspendAccepted = [AttentionHubPower]::SetSuspendState($false, $false, $false)
        $resumedAt = Get-Date
        Start-Sleep -Seconds 10
        $after = Get-Snapshot -Process $process -Label "after-$cycle"

        $results.Add([pscustomobject]@{
            Cycle = $cycle
            WakeTaskName = $taskName
            WakeScheduledAt = $wakeAt.ToString('o')
            WakeTimerArmed = $wakeTimerArmed
            SuspendAccepted = $suspendAccepted
            SuspendRequestedAt = $suspendRequestedAt.ToString('o')
            ResumedAt = $resumedAt.ToString('o')
            WallClockGapSeconds = [Math]::Round(($resumedAt - $suspendRequestedAt).TotalSeconds, 1)
            Before = $before
            After = $after
        })
    } finally {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }

    $checkpoint.Cycles = $results
    $checkpoint | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
}

$final = [pscustomobject]@{
    Status = 'completed'
    ExecutablePath = $resolvedExecutable
    ProcessId = $process.Id
    RequestedCycles = $Cycles
    WakeAfterMinutes = $WakeAfterMinutes
    StartedAt = $checkpoint.StartedAt
    CompletedAt = (Get-Date).ToString('o')
    Cycles = $results
}
$final | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
$final
