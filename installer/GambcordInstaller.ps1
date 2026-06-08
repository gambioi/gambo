#Requires -Version 5.1
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$GAMBCORD_COLOR  = [System.Drawing.Color]::FromArgb(255, 88, 101, 242)
$GAMBCORD_DARK   = [System.Drawing.Color]::FromArgb(255, 32, 34, 37)
$GAMBCORD_PANEL  = [System.Drawing.Color]::FromArgb(255, 47, 49, 54)
$GAMBCORD_TEXT   = [System.Drawing.Color]::White
$GAMBCORD_GREEN  = [System.Drawing.Color]::FromArgb(255, 87, 242, 135)
$GAMBCORD_RED    = [System.Drawing.Color]::FromArgb(255, 237, 66, 69)
$GAMBCORD_GRAY   = [System.Drawing.Color]::FromArgb(255, 114, 118, 125)

$SCRIPT_DIR   = Split-Path -Parent $MyInvocation.MyCommand.Path
$DIST_DIR     = Join-Path (Split-Path -Parent $SCRIPT_DIR) "dist"
$PATCHER_PATH = Join-Path $DIST_DIR "patcher.js"

$DISCORD_VARIANTS = @(
    @{ Name = "Discord Stable"; Folder = "Discord";            Exe = "Discord.exe" },
    @{ Name = "Discord PTB";    Folder = "DiscordPTB";         Exe = "DiscordPTB.exe" },
    @{ Name = "Discord Canary"; Folder = "DiscordCanary";      Exe = "DiscordCanary.exe" },
    @{ Name = "Discord Dev";    Folder = "DiscordDevelopment"; Exe = "DiscordDevelopment.exe" }
)

function Get-DiscordInstalls {
    $found = @()
    $localApp = [Environment]::GetFolderPath("LocalApplicationData")
    foreach ($v in $DISCORD_VARIANTS) {
        $base = Join-Path $localApp $v.Folder
        if (-not (Test-Path $base)) { continue }
        $appDir = Get-ChildItem $base -Filter "app-*" -Directory |
                  Sort-Object Name -Descending | Select-Object -First 1
        if (-not $appDir) { continue }
        $resources = Join-Path $appDir.FullName "resources"
        if (-not (Test-Path $resources)) { continue }
        $found += @{
            Name      = $v.Name
            Exe       = $v.Exe
            Resources = $resources
            AppDir    = Join-Path $resources "app"
            AppJs     = Join-Path $resources "app\index.js"
        }
    }
    return $found
}

function Test-IsInstalled($install) {
    if (-not (Test-Path $install.AppJs)) { return $false }
    $content = Get-Content $install.AppJs -Raw -ErrorAction SilentlyContinue
    return $content -match [regex]::Escape($PATCHER_PATH)
}

function Install-Gambcord($install) {
    if (-not (Test-Path $PATCHER_PATH)) {
        return @{ Ok = $false; Msg = "dist/patcher.js introuvable. Lancez: pnpm buildStandalone" }
    }
    try {
        New-Item -ItemType Directory -Path $install.AppDir -Force | Out-Null
        $enc     = New-Object System.Text.UTF8Encoding($false)
        $pkgPath = Join-Path $install.AppDir "package.json"
        [System.IO.File]::WriteAllText($pkgPath, "{`"name`":`"discord`",`"main`":`"index.js`"}", $enc)
        $safePath = $PATCHER_PATH -replace "\\", "\\\\"
        [System.IO.File]::WriteAllText($install.AppJs, "require(`"$safePath`");", $enc)
        return @{ Ok = $true; Msg = "Gambcord installe dans $($install.Name)!" }
    } catch {
        return @{ Ok = $false; Msg = "Erreur: $_" }
    }
}

function Uninstall-Gambcord($install) {
    try {
        if (Test-Path $install.AppDir) {
            [System.IO.Directory]::Delete($install.AppDir, $true)
        }
        return @{ Ok = $true; Msg = "Gambcord desinstalle de $($install.Name)!" }
    } catch {
        return @{ Ok = $false; Msg = "Erreur: $_" }
    }
}

function Stop-Discord($install) {
    $name = $install.Exe -replace "\.exe$", ""
    Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

$installs = Get-DiscordInstalls

$form = New-Object System.Windows.Forms.Form
$form.Text            = "Gambcord Installer"
$form.Size            = New-Object System.Drawing.Size(520, 580)
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox     = $false
$form.StartPosition   = "CenterScreen"
$form.BackColor       = $GAMBCORD_DARK
$form.Font            = New-Object System.Drawing.Font("Segoe UI", 9)

$header = New-Object System.Windows.Forms.Panel
$header.Size      = New-Object System.Drawing.Size(520, 90)
$header.Location  = New-Object System.Drawing.Point(0, 0)
$header.BackColor = $GAMBCORD_COLOR
$form.Controls.Add($header)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text      = "Gambcord Installer"
$lblTitle.Font      = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = $GAMBCORD_TEXT
$lblTitle.AutoSize  = $true
$lblTitle.Location  = New-Object System.Drawing.Point(20, 15)
$header.Controls.Add($lblTitle)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text      = "Ton client mod Discord personnalise"
$lblSub.Font      = New-Object System.Drawing.Font("Segoe UI", 9)
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(255, 220, 221, 222)
$lblSub.AutoSize  = $true
$lblSub.Location  = New-Object System.Drawing.Point(22, 58)
$header.Controls.Add($lblSub)

$lblSection = New-Object System.Windows.Forms.Label
$lblSection.Text      = "INSTALLATIONS DISCORD DETECTEES"
$lblSection.Font      = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$lblSection.ForeColor = $GAMBCORD_GRAY
$lblSection.AutoSize  = $true
$lblSection.Location  = New-Object System.Drawing.Point(20, 108)
$form.Controls.Add($lblSection)

$checkboxes = @()
$y = 130

if ($installs.Count -eq 0) {
    $lblNone = New-Object System.Windows.Forms.Label
    $lblNone.Text      = "Aucune installation Discord trouvee."
    $lblNone.ForeColor = $GAMBCORD_RED
    $lblNone.AutoSize  = $true
    $lblNone.Location  = New-Object System.Drawing.Point(20, $y)
    $form.Controls.Add($lblNone)
    $y += 30
} else {
    foreach ($inst in $installs) {
        $card = New-Object System.Windows.Forms.Panel
        $card.Size      = New-Object System.Drawing.Size(472, 52)
        $card.Location  = New-Object System.Drawing.Point(20, $y)
        $card.BackColor = $GAMBCORD_PANEL
        $form.Controls.Add($card)

        $cb = New-Object System.Windows.Forms.CheckBox
        $cb.Text    = ""
        $cb.Checked = $true
        $cb.Location = New-Object System.Drawing.Point(10, 16)
        $cb.ForeColor = $GAMBCORD_TEXT
        $cb.Tag     = $inst
        $card.Controls.Add($cb)
        $checkboxes += $cb

        $lName = New-Object System.Windows.Forms.Label
        $lName.Text      = $inst.Name
        $lName.Font      = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
        $lName.ForeColor = $GAMBCORD_TEXT
        $lName.AutoSize  = $true
        $lName.Location  = New-Object System.Drawing.Point(38, 8)
        $card.Controls.Add($lName)

        $installed   = Test-IsInstalled $inst
        $statusText  = if ($installed) { "Gambcord installe" } else { "Non installe" }
        $statusColor = if ($installed) { $GAMBCORD_GREEN } else { $GAMBCORD_GRAY }

        $lStatus = New-Object System.Windows.Forms.Label
        $lStatus.Text      = $statusText
        $lStatus.Font      = New-Object System.Drawing.Font("Segoe UI", 8)
        $lStatus.ForeColor = $statusColor
        $lStatus.AutoSize  = $true
        $lStatus.Location  = New-Object System.Drawing.Point(40, 30)
        $lStatus.Name      = "status_$($inst.Name)"
        $card.Controls.Add($lStatus)

        $lPath = New-Object System.Windows.Forms.Label
        $lPath.Text      = $inst.Resources
        $lPath.Font      = New-Object System.Drawing.Font("Segoe UI", 7)
        $lPath.ForeColor = $GAMBCORD_GRAY
        $lPath.AutoSize  = $false
        $lPath.Size      = New-Object System.Drawing.Size(200, 14)
        $lPath.Location  = New-Object System.Drawing.Point(220, 19)
        $card.Controls.Add($lPath)

        $y += 62
    }
}

$btnInstall = New-Object System.Windows.Forms.Button
$btnInstall.Text      = "Installer"
$btnInstall.Font      = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$btnInstall.Size      = New-Object System.Drawing.Size(220, 44)
$btnInstall.Location  = New-Object System.Drawing.Point(20, ($y + 14))
$btnInstall.BackColor = $GAMBCORD_COLOR
$btnInstall.ForeColor = $GAMBCORD_TEXT
$btnInstall.FlatStyle = "Flat"
$btnInstall.FlatAppearance.BorderSize = 0
$btnInstall.Cursor    = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnInstall)

$btnUninstall = New-Object System.Windows.Forms.Button
$btnUninstall.Text      = "Desinstaller"
$btnUninstall.Font      = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$btnUninstall.Size      = New-Object System.Drawing.Size(220, 44)
$btnUninstall.Location  = New-Object System.Drawing.Point(252, ($y + 14))
$btnUninstall.BackColor = $GAMBCORD_RED
$btnUninstall.ForeColor = $GAMBCORD_TEXT
$btnUninstall.FlatStyle = "Flat"
$btnUninstall.FlatAppearance.BorderSize = 0
$btnUninstall.Cursor    = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnUninstall)

$y += 72

$lblLog = New-Object System.Windows.Forms.Label
$lblLog.Text      = "JOURNAL"
$lblLog.Font      = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$lblLog.ForeColor = $GAMBCORD_GRAY
$lblLog.AutoSize  = $true
$lblLog.Location  = New-Object System.Drawing.Point(20, $y)
$form.Controls.Add($lblLog)

$logBox = New-Object System.Windows.Forms.RichTextBox
$logBox.Size        = New-Object System.Drawing.Size(472, 130)
$logBox.Location    = New-Object System.Drawing.Point(20, ($y + 20))
$logBox.BackColor   = $GAMBCORD_PANEL
$logBox.ForeColor   = $GAMBCORD_TEXT
$logBox.Font        = New-Object System.Drawing.Font("Consolas", 9)
$logBox.ReadOnly    = $true
$logBox.BorderStyle = "None"
$logBox.ScrollBars  = "Vertical"
$form.Controls.Add($logBox)

function Write-Log($msg, $color = $null) {
    if ($null -eq $color) { $color = $GAMBCORD_TEXT }
    $logBox.SelectionStart  = $logBox.TextLength
    $logBox.SelectionLength = 0
    $logBox.SelectionColor  = $color
    $logBox.AppendText("$msg`n")
    $logBox.ScrollToCaret()
    $form.Refresh()
}

function Refresh-Status {
    foreach ($cb in $checkboxes) {
        $inst    = $cb.Tag
        $panel   = $cb.Parent
        $lStatus = $panel.Controls | Where-Object { $_.Name -eq "status_$($inst.Name)" }
        if ($lStatus) {
            $installed     = Test-IsInstalled $inst
            $lStatus.Text      = if ($installed) { "Gambcord installe" } else { "Non installe" }
            $lStatus.ForeColor = if ($installed) { $GAMBCORD_GREEN } else { $GAMBCORD_GRAY }
        }
    }
    $form.Refresh()
}

$btnInstall.Add_Click({
    $selected = $checkboxes | Where-Object { $_.Checked }
    if ($selected.Count -eq 0) {
        Write-Log "Aucune installation selectionnee." $GAMBCORD_RED
        return
    }
    Write-Log "=== Installation de Gambcord ===" $GAMBCORD_COLOR
    foreach ($cb in $selected) {
        $inst = $cb.Tag
        Write-Log "  > Arret de $($inst.Exe)..." $GAMBCORD_GRAY
        Stop-Discord $inst
        Start-Sleep -Milliseconds 500
        $result = Install-Gambcord $inst
        if ($result.Ok) {
            Write-Log "  [OK] $($result.Msg)" $GAMBCORD_GREEN
        } else {
            Write-Log "  [ERR] $($result.Msg)" $GAMBCORD_RED
        }
    }
    Write-Log "Relance Discord pour appliquer les changements." $GAMBCORD_TEXT
    Refresh-Status
})

$btnUninstall.Add_Click({
    $selected = $checkboxes | Where-Object { $_.Checked }
    if ($selected.Count -eq 0) {
        Write-Log "Aucune installation selectionnee." $GAMBCORD_RED
        return
    }
    Write-Log "=== Desinstallation de Gambcord ===" $GAMBCORD_RED
    foreach ($cb in $selected) {
        $inst = $cb.Tag
        Write-Log "  > Arret de $($inst.Exe)..." $GAMBCORD_GRAY
        Stop-Discord $inst
        Start-Sleep -Milliseconds 500
        $result = Uninstall-Gambcord $inst
        if ($result.Ok) {
            Write-Log "  [OK] $($result.Msg)" $GAMBCORD_GREEN
        } else {
            Write-Log "  [ERR] $($result.Msg)" $GAMBCORD_RED
        }
    }
    Write-Log "Relance Discord pour appliquer les changements." $GAMBCORD_TEXT
    Refresh-Status
})

Write-Log "Gambcord Installer pret." $GAMBCORD_COLOR
if (-not (Test-Path $PATCHER_PATH)) {
    Write-Log "ATTENTION: dist/patcher.js introuvable. Lancez: pnpm buildStandalone" $GAMBCORD_RED
}

[void]$form.ShowDialog()
