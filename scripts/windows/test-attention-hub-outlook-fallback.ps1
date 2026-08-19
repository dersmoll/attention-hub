[CmdletBinding()]
param(
    [string]$ExecutablePath = "$env:LOCALAPPDATA\Attention Hub\attention-hub.exe",

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [ValidateRange(1, 3)]
    [int]$Cycles = 3
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class AttentionHubOutlookFallback
{
    public delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr window, int command);

    public static object[] Enumerate()
    {
        var result = new List<object>();
        EnumWindows((window, parameter) =>
        {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            Rect rect;
            GetWindowRect(window, out rect);
            result.Add(new
            {
                Handle = window.ToInt64(),
                ProcessId = processId,
                Visible = IsWindowVisible(window),
                Iconic = IsIconic(window),
                Area = Math.Max(0, rect.Right - rect.Left) * Math.Max(0, rect.Bottom - rect.Top)
            });
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }
}
'@

function Get-InstalledProcess {
    param([string]$ResolvedExecutable)

    return @(
        Get-Process -Name 'attention-hub' -ErrorAction SilentlyContinue |
            Where-Object {
                try {
                    [IO.Path]::GetFullPath($_.Path) -ieq $ResolvedExecutable
                } catch {
                    $false
                }
            }
    ) | Select-Object -First 1
}

function Wait-Window {
    param(
        [int]$ProcessId,
        [string]$Name,
        [int]$TimeoutSeconds = 15
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
            ) | Where-Object { $_.Current.Name -eq $Name }
        ) | Select-Object -First 1
        if ($null -ne $window) {
            return $window
        }
        Start-Sleep -Milliseconds 100
    } while ((Get-Date) -lt $deadline)
    return $null
}

function Get-OutlookWindow {
    $processIds = @(
        Get-Process -Name 'olk' -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty Id
    )
    return @(
        [AttentionHubOutlookFallback]::Enumerate() |
            Where-Object {
                $_.ProcessId -in $processIds -and
                $_.Visible -and
                $_.Area -gt 0
            } |
            Sort-Object Area -Descending
    ) | Select-Object -First 1
}

function Get-OutlookClassification {
    param([System.Windows.Automation.AutomationElement]$Widget)

    $button = @(
        $Widget.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        ) | Where-Object {
            $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
            $_.Current.Name.StartsWith('Open Microsoft Outlook.', [StringComparison]::Ordinal)
        }
    ) | Select-Object -First 1
    if ($null -eq $button) {
        return 'unavailable'
    }
    $name = $button.Current.Name
    if ($name -match '(?i)last observed') {
        return 'lastObserved'
    }
    if ($name -match '(?i)attention state observed') {
        return 'observed'
    }
    if ($name -match '(?i)application is not running') {
        return 'notRunning'
    }
    if ($name -match '(?i)attention state is not exposed') {
        return 'notExposed'
    }
    if ($name -match '(?i)attention read failed') {
        return 'error'
    }
    return 'other'
}

function Wait-OutlookClassification {
    param(
        [System.Windows.Automation.AutomationElement]$Widget,
        [string]$Expected,
        [int]$TimeoutSeconds = 20
    )

    $startedAt = Get-Date
    $deadline = $startedAt.AddSeconds($TimeoutSeconds)
    do {
        $classification = Get-OutlookClassification -Widget $Widget
        if ($classification -eq $Expected) {
            return [pscustomobject]@{
                Classification = $classification
                ElapsedMilliseconds = [Math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
            }
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    return [pscustomobject]@{
        Classification = Get-OutlookClassification -Widget $Widget
        ElapsedMilliseconds = [Math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
    }
}

function Get-Button {
    param(
        [System.Windows.Automation.AutomationElement]$Window,
        [string]$Name
    )

    return @(
        $Window.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        ) | Where-Object {
            $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
            $_.Current.Name -eq $Name
        }
    ) | Select-Object -First 1
}

$resolvedExecutable = [IO.Path]::GetFullPath($ExecutablePath)
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
if (-not (Test-Path -LiteralPath $resolvedExecutable -PathType Leaf)) {
    throw "Installed executable does not exist: $resolvedExecutable"
}
if (-not (Test-Path -LiteralPath (Split-Path -Parent $resolvedOutput) -PathType Container)) {
    throw "Output directory does not exist: $(Split-Path -Parent $resolvedOutput)"
}

$process = Get-InstalledProcess -ResolvedExecutable $resolvedExecutable
if ($null -eq $process) {
    throw 'The installed Attention Hub must be running.'
}
$widget = Wait-Window -ProcessId $process.Id -Name 'Attention Hub'
if ($null -eq $widget) {
    throw 'The installed widget window is unavailable.'
}
$outlookWindow = Get-OutlookWindow
if ($null -eq $outlookWindow) {
    throw 'A running visible Outlook window is required.'
}

$outlookProcessCountBefore = @(Get-Process -Name 'olk' -ErrorAction SilentlyContinue).Count
[AttentionHubOutlookFallback]::ShowWindow([IntPtr]$outlookWindow.Handle, 9) | Out-Null
$initial = Wait-OutlookClassification -Widget $widget -Expected 'observed'

$fallbackResults = [System.Collections.Generic.List[object]]::new()
for ($cycle = 1; $cycle -le $Cycles; $cycle++) {
    [AttentionHubOutlookFallback]::ShowWindow([IntPtr]$outlookWindow.Handle, 6) | Out-Null
    $minimized = Wait-OutlookClassification -Widget $widget -Expected 'lastObserved'
    [AttentionHubOutlookFallback]::ShowWindow([IntPtr]$outlookWindow.Handle, 9) | Out-Null
    $restored = Wait-OutlookClassification -Widget $widget -Expected 'observed'
    $fallbackResults.Add([pscustomobject]@{
        Cycle = $cycle
        Status = if (
            $minimized.Classification -eq 'lastObserved' -and
            $restored.Classification -eq 'observed'
        ) { 'passed' } else { 'failed' }
        MinimizedClassification = $minimized.Classification
        MinimizedTransitionMilliseconds = $minimized.ElapsedMilliseconds
        RestoredClassification = $restored.Classification
        RestoredTransitionMilliseconds = $restored.ElapsedMilliseconds
    })
}

$advancedResults = [System.Collections.Generic.List[object]]::new()
for ($cycle = 1; $cycle -le 2; $cycle++) {
    $button = Get-Button -Window $widget -Name 'Open Advanced view'
    if ($null -eq $button) {
        throw 'The Advanced button is unavailable.'
    }
    $startedAt = Get-Date
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    $advanced = Wait-Window -ProcessId $process.Id -Name 'Attention Hub - Advanced'
    if ($null -eq $advanced) {
        throw "Advanced did not open in cycle $cycle."
    }
    $openedMilliseconds = [Math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
    $advanced.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 100
        $stillOpen = Wait-Window -ProcessId $process.Id -Name 'Attention Hub - Advanced' -TimeoutSeconds 1
    } while ($null -ne $stillOpen -and (Get-Date) -lt $deadline)
    $widget = Wait-Window -ProcessId $process.Id -Name 'Attention Hub' -TimeoutSeconds 2
    $advancedResults.Add([pscustomobject]@{
        Cycle = $cycle
        Status = if (
            $null -eq $stillOpen -and
            $null -ne $widget -and
            $null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)
        ) { 'passed' } else { 'failed' }
        OpenMilliseconds = $openedMilliseconds
        WidgetSurvived = $null -ne $widget
        ApplicationSurvived = $null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)
    })
}

$result = [pscustomobject]@{
    CapturedAt = (Get-Date).ToString('o')
    ExecutablePath = $resolvedExecutable
    Version = (Get-Item -LiteralPath $resolvedExecutable).VersionInfo.ProductVersion
    ProcessId = $process.Id
    Privacy = 'Only classifications, timings, and process continuity recorded; no counts, labels, account identifiers, content, or pixels.'
    InitialClassification = $initial.Classification
    OutlookCycles = $fallbackResults
    OutlookProcessCountBefore = $outlookProcessCountBefore
    OutlookProcessCountAfter = @(Get-Process -Name 'olk' -ErrorAction SilentlyContinue).Count
    AdvancedCycles = $advancedResults
    ApplicationStillRunning = $null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)
    WidgetStillAvailable = $null -ne (Wait-Window -ProcessId $process.Id -Name 'Attention Hub' -TimeoutSeconds 2)
}
$result | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
$result
