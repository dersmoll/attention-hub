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

$outlook = Get-Process olk -ErrorAction SilentlyContinue |
    Where-Object MainWindowHandle -ne ([IntPtr]::Zero) |
    Select-Object -First 1

if ($outlook) {
    $outlookRoot = Get-ApplicationRoot -Process $outlook
    $inboxLabels = [System.Collections.Generic.List[string]]::new()

    if ($outlookRoot) {
        $elements = $outlookRoot.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

        for ($index = 0; $index -lt $elements.Count; $index++) {
            $name = $elements.Item($index).Current.Name.Trim()
            if ($name -match '(?i)^Inbox(?:[ ,-]|$)') {
                $inboxLabels.Add($name)
            }
        }
    }

    $uniqueInboxLabels = @($inboxLabels | Sort-Object -Unique)
    if ($uniqueInboxLabels.Count -gt 0) {
        $outlookCount = 0
        $explicitCountLabels = 0

        foreach ($label in $uniqueInboxLabels) {
            $unreadMatch = [regex]::Match($label, '(?i)(?<count>\d+)\s+unread')
            if ($unreadMatch.Success) {
                $outlookCount += [int]$unreadMatch.Groups['count'].Value
                $explicitCountLabels++
            }
        }

        Add-Signal `
            -SourceKey 'outlook' `
            -DisplayName 'Microsoft Outlook' `
            -Kind 'inboxUnread' `
            -Count $outlookCount `
            -NeedsAttention ($outlookCount -gt 0) `
            -Origin 'applicationUiAutomation' `
            -RawLabel "$($uniqueInboxLabels.Count) accessible Inbox label(s); $explicitCountLabels with an explicit unread count" `
            -Confidence 'medium' `
            -Meaning 'Sum of explicit unread counts in unique English Inbox accessibility labels; account names and message content are not exposed.'
    } else {
        $diagnostics.Add('New Outlook is running, but no English Inbox accessibility label was found.')
    }
} else {
    $diagnostics.Add('New Outlook is not running with an accessible top-level window.')
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
    for ($index = 0; $index -lt $taskbarElements.Count; $index++) {
        $element = $taskbarElements.Item($index)
        if ($element.Current.AutomationId -ne 'NotifyItemIcon') {
            continue
        }

        $name = $element.Current.Name.Trim()
        if ($name -match '^Microsoft Teams\b') {
            $teamsLabel = $name
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
