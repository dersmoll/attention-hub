[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ExecutablePath = "$env:LOCALAPPDATA\Attention Hub\attention-hub.exe",

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [ValidateRange(0, 2)]
    [int]$ExplorerRestartCycles = 0,

    [switch]$LeaveRunning
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

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

function Wait-WidgetWindow {
    param(
        [int]$ProcessId,
        [int]$TimeoutSeconds = 20
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
        Start-Sleep -Milliseconds 100
    } while ((Get-Date) -lt $deadline)

    throw "Attention Hub did not expose its widget window within $TimeoutSeconds seconds."
}

function Get-TaskbarWindows {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    return @(
        $root.FindAll(
            [System.Windows.Automation.TreeScope]::Children,
            [System.Windows.Automation.Condition]::TrueCondition
        ) |
            Where-Object {
                $_.Current.ClassName -in @('Shell_TrayWnd', 'Shell_SecondaryTrayWnd')
            } |
            ForEach-Object {
                [pscustomobject]@{
                    ClassName = $_.Current.ClassName
                    Bounds = $_.Current.BoundingRectangle.ToString()
                    Offscreen = $_.Current.IsOffscreen
                }
            }
    )
}

function Get-LifecycleSnapshot {
    param(
        [System.Diagnostics.Process]$Process,
        [string]$Label
    )

    $window = Wait-WidgetWindow -ProcessId $Process.Id
    $visuals = @(
        $window.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        ) |
            Where-Object { $_.Current.Name -like 'Attention Hub -* visual' } |
            ForEach-Object {
                [pscustomobject]@{
                    Name = $_.Current.Name
                    Bounds = $_.Current.BoundingRectangle.ToString()
                    Offscreen = $_.Current.IsOffscreen
                }
            }
    )

    return [pscustomobject]@{
        Label = $Label
        Timestamp = (Get-Date).ToString('o')
        ProcessId = $Process.Id
        Version = (Get-Item -LiteralPath $Process.Path).VersionInfo.ProductVersion
        WidgetBounds = $window.Current.BoundingRectangle.ToString()
        WidgetOffscreen = $window.Current.IsOffscreen
        Visuals = $visuals
        Taskbars = @(Get-TaskbarWindows)
        ExplorerProcessIds = @(
            Get-Process -Name explorer -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty Id
        )
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

$process = Get-InstalledProcess -ResolvedExecutable $resolvedExecutable
$launchedByScript = $null -eq $process
$startupMilliseconds = $null
if ($launchedByScript) {
    $startedAt = Get-Date
    $process = Start-Process -FilePath $resolvedExecutable -PassThru
    $null = Wait-WidgetWindow -ProcessId $process.Id
    $startupMilliseconds = [Math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
}

$snapshots = [System.Collections.Generic.List[object]]::new()
$snapshots.Add((Get-LifecycleSnapshot -Process $process -Label 'initial'))
$recoveries = [System.Collections.Generic.List[object]]::new()
$expectedTaskbarCount = [System.Windows.Forms.Screen]::AllScreens.Count
$expectedVisibleVisuals = @(
    $snapshots[0].Visuals | Where-Object { -not $_.Offscreen }
).Count

for ($cycle = 1; $cycle -le $ExplorerRestartCycles; $cycle++) {
    if (-not $PSCmdlet.ShouldProcess('Windows Explorer shell', "restart cycle $cycle")) {
        continue
    }

    $oldExplorerIds = @(
        Get-Process -Name explorer -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty Id
    )
    $startedAt = Get-Date
    if ($oldExplorerIds.Count -gt 0) {
        Stop-Process -Id $oldExplorerIds -Force
    }
    Start-Sleep -Seconds 2
    Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') | Out-Null

    $deadline = (Get-Date).AddSeconds(35)
    do {
        Start-Sleep -Milliseconds 500
        $taskbars = @(Get-TaskbarWindows)
        $snapshot = Get-LifecycleSnapshot -Process $process -Label "explorer-$cycle"
        $visibleVisualCount = @(
            $snapshot.Visuals | Where-Object { -not $_.Offscreen }
        ).Count
    } while (
        ($taskbars.Count -lt $expectedTaskbarCount -or
            $visibleVisualCount -lt $expectedVisibleVisuals) -and
        (Get-Date) -lt $deadline
    )

    $snapshots.Add($snapshot)
    $recoveries.Add([pscustomobject]@{
        Cycle = $cycle
        RecoveryMilliseconds = [Math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
        OldExplorerProcessIds = $oldExplorerIds
        NewExplorerProcessIds = @(
            Get-Process -Name explorer -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty Id
        )
        ExpectedTaskbars = $expectedTaskbarCount
        ObservedTaskbars = $taskbars.Count
        ExpectedVisibleVisuals = $expectedVisibleVisuals
        ObservedVisibleVisuals = $visibleVisualCount
        ApplicationStillRunning = $null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)
    })
}

$result = [pscustomobject]@{
    ExecutablePath = $resolvedExecutable
    LaunchedByScript = $launchedByScript
    StartupMilliseconds = $startupMilliseconds
    ExplorerRestartCyclesRequested = $ExplorerRestartCycles
    MonitorTopology = @(
        [System.Windows.Forms.Screen]::AllScreens |
            ForEach-Object {
                [pscustomobject]@{
                    DeviceName = $_.DeviceName
                    Primary = $_.Primary
                    Bounds = $_.Bounds.ToString()
                    WorkingArea = $_.WorkingArea.ToString()
                }
            }
    )
    Recoveries = $recoveries
    Snapshots = $snapshots
}

$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8

if ($launchedByScript -and -not $LeaveRunning) {
    if (-not $process.CloseMainWindow()) {
        throw 'Attention Hub did not accept a normal close request.'
    }
    if (-not $process.WaitForExit(10000)) {
        throw 'Attention Hub did not exit within 10 seconds after a normal close request.'
    }
}

$result
