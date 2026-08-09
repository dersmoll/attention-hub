[CmdletBinding()]
param(
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

if (-not ('AttentionHub.WindowLookup' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;

namespace AttentionHub
{
    public static class WindowLookup
    {
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern IntPtr FindWindow(string className, string windowName);
    }
}
'@
}

$signals = [System.Collections.Generic.List[object]]::new()
$diagnostics = [System.Collections.Generic.List[string]]::new()

function Add-Signal {
    param(
        [string]$SourceKey,
        [string]$DisplayName,
        [string]$Kind,
        [Nullable[int]]$Count,
        [Nullable[bool]]$NeedsAttention,
        [string]$Origin,
        [string]$RawLabel,
        [string]$Confidence,
        [string]$Meaning
    )

    $signals.Add([pscustomobject]@{
        sourceKey = $SourceKey
        displayName = $DisplayName
        kind = $Kind
        count = $Count
        needsAttention = $NeedsAttention
        origin = $Origin
        rawLabel = $RawLabel
        confidence = $Confidence
        meaning = $Meaning
    })
}

function Get-ApplicationRoot {
    param([System.Diagnostics.Process]$Process)

    $Process.Refresh()
    if ($Process.MainWindowHandle -eq [IntPtr]::Zero) {
        return $null
    }

    [System.Windows.Automation.AutomationElement]::FromHandle($Process.MainWindowHandle)
}

$telegram = Get-Process Telegram -ErrorAction SilentlyContinue |
    Where-Object MainWindowHandle -ne ([IntPtr]::Zero) |
    Select-Object -First 1

if ($telegram) {
    $telegram.Refresh()
    $title = $telegram.MainWindowTitle
    $titleMatch = [regex]::Match($title, '\((?<count>\d+)\)\s*$')

    if ($titleMatch.Success) {
        $count = [int]$titleMatch.Groups['count'].Value
        Add-Signal `
            -SourceKey 'telegram' `
            -DisplayName 'Telegram' `
            -Kind 'applicationCounter' `
            -Count $count `
            -NeedsAttention ($count -gt 0) `
            -Origin 'windowTitle' `
            -RawLabel "($count)" `
            -Confidence 'medium' `
            -Meaning 'Telegram-owned counter; exact semantics depend on Telegram badge settings.'
    } else {
        $diagnostics.Add('Telegram is running, but its top-level window title contains no trailing numeric counter.')
    }

    $telegramRoot = Get-ApplicationRoot -Process $telegram
    if ($telegramRoot) {
        $elements = $telegramRoot.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

        for ($index = 0; $index -lt $elements.Count; $index++) {
            $name = $elements.Item($index).Current.Name
            $allChatsMatch = [regex]::Match($name, '^All chats \((?<count>\d+) unread chats?\)$')
            if ($allChatsMatch.Success) {
                $count = [int]$allChatsMatch.Groups['count'].Value
                Add-Signal `
                    -SourceKey 'telegram' `
                    -DisplayName 'Telegram' `
                    -Kind 'unreadChats' `
                    -Count $count `
                    -NeedsAttention ($count -gt 0) `
                    -Origin 'applicationUiAutomation' `
                    -RawLabel $name `
                    -Confidence 'medium' `
                    -Meaning 'Telegram accessibility label; localized wording and app versions may change.'
                break
            }
        }
    }
} else {
    $diagnostics.Add('Telegram is not running with an accessible top-level window.')
}

$taskbarHandle = [AttentionHub.WindowLookup]::FindWindow('Shell_TrayWnd', $null)
if ($taskbarHandle -eq [IntPtr]::Zero) {
    $diagnostics.Add('The primary Windows taskbar window could not be found.')
} else {
    $taskbarRoot = [System.Windows.Automation.AutomationElement]::FromHandle($taskbarHandle)
    $taskbarElements = $taskbarRoot.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )

    $teamsLabel = $null
    $outlookLabel = $null

    for ($index = 0; $index -lt $taskbarElements.Count; $index++) {
        $element = $taskbarElements.Item($index)
        if ($element.Current.AutomationId -ne 'NotifyItemIcon') {
            continue
        }

        $name = $element.Current.Name.Trim()
        if ($name -match '^Microsoft Teams\b') {
            $teamsLabel = $name
        } elseif ($name -match '^(No |\d+ )?unread messages?$') {
            $outlookLabel = $name
        }
    }

    if ($teamsLabel) {
        $needsAttention = $teamsLabel -match '(?i)new activity|unread|notification'
        Add-Signal `
            -SourceKey 'teams' `
            -DisplayName 'Microsoft Teams' `
            -Kind 'activityStatus' `
            -NeedsAttention $needsAttention `
            -Origin 'notificationAreaUiAutomation' `
            -RawLabel $teamsLabel `
            -Confidence 'medium' `
            -Meaning 'Qualitative Teams-owned notification-area label; it does not expose an exact count.'
    } else {
        $diagnostics.Add('No Microsoft Teams notification-area accessibility label was found.')
    }

    if ($outlookLabel) {
        $outlookMatch = [regex]::Match($outlookLabel, '^(?<count>\d+) unread messages?$')
        $outlookCount = if ($outlookMatch.Success) {
            [int]$outlookMatch.Groups['count'].Value
        } elseif ($outlookLabel -eq 'No unread messages') {
            0
        } else {
            $null
        }

        Add-Signal `
            -SourceKey 'outlook' `
            -DisplayName 'Microsoft Outlook' `
            -Kind 'unreadStatus' `
            -Count $outlookCount `
            -NeedsAttention ($null -ne $outlookCount -and $outlookCount -gt 0) `
            -Origin 'notificationAreaUiAutomation' `
            -RawLabel $outlookLabel `
            -Confidence 'low' `
            -Meaning 'Mapped from an app-defined notification-area label; identity and localized wording need validation.'
    } else {
        $diagnostics.Add('No Outlook-like unread notification-area accessibility label was found.')
    }
}

$report = [pscustomobject]@{
    capturedAt = [DateTime]::UtcNow.ToString('o')
    signals = $signals
    diagnostics = $diagnostics
}

if ($AsJson) {
    $report | ConvertTo-Json -Depth 6
} else {
    $signals | Format-Table sourceKey, kind, count, needsAttention, origin, confidence, rawLabel -AutoSize
    if ($diagnostics.Count -gt 0) {
        Write-Host ''
        Write-Host 'Diagnostics:'
        $diagnostics | ForEach-Object { Write-Host "- $_" }
    }
}
