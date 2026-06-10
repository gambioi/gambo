#Requires -Version 5.1

# Capture TOUTE erreur et l'affiche (console + popup) au lieu d'echouer en silence.
trap {
    $msg = "Gambo Installer - erreur au demarrage :`n`n" + ($_ | Out-String)
    Write-Host $msg -ForegroundColor Red
    try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue; [System.Windows.Forms.MessageBox]::Show($msg, "Gambo Installer") | Out-Null } catch {}
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

# ═══════════════════════════════════════════════════════════════════════════
#  Gambo Installer — UI moderne (WPF)
# ═══════════════════════════════════════════════════════════════════════════

# ── Paths ─────────────────────────────────────────────────────────────────────
# Résolution robuste du dossier : marche en script (.ps1) ET en compile (.exe ps2exe)
if ($PSScriptRoot) {
    $SCRIPT_DIR = $PSScriptRoot
} elseif ($MyInvocation.MyCommand.Path) {
    $SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    # Cas .exe compile : le chemin du process est l'exe lui-meme
    $SCRIPT_DIR = Split-Path -Parent ([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName)
}
# Recherche TRES robuste du dossier dist (gere extractions variees, dossiers deplaces)
function Test-DistAt($dir) {
    return ($dir -and (Test-Path (Join-Path $dir "patcher.js")))
}
function Resolve-DistDir($scriptDir) {
    # 1) Emplacements relatifs directs
    $p1 = Split-Path -Parent $scriptDir
    $p2 = if ($p1) { Split-Path -Parent $p1 } else { $null }
    foreach ($c in @(
        (Join-Path $p1 "dist"),            # ../dist (standard)
        (Join-Path $scriptDir "dist"),     # ./dist
        (Join-Path $p2 "dist")             # ../../dist
    )) { if (Test-DistAt $c) { return $c } }

    # 2) Recherche recursive en remontant jusqu'a 3 niveaux
    $p3 = if ($p2) { Split-Path -Parent $p2 } else { $null }
    $roots = @($p1, $p2, $p3) |
             Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
    foreach ($r in $roots) {
        $hit = Get-ChildItem $r -Recurse -Filter "patcher.js" -File -ErrorAction SilentlyContinue |
               Where-Object { $_.Directory.Name -eq "dist" } | Select-Object -First 1
        if ($hit) { return $hit.Directory.FullName }
    }

    # 3) Dernier recours : chercher un Gambo-Setup\dist\patcher.js dans les dossiers usuels
    $usual = @(
        (Join-Path $env:USERPROFILE "Downloads"),
        (Join-Path $env:USERPROFILE "Desktop"),
        (Join-Path $env:USERPROFILE "Documents")
    ) | Where-Object { Test-Path $_ }
    foreach ($u in $usual) {
        $hit = Get-ChildItem $u -Recurse -Filter "patcher.js" -File -ErrorAction SilentlyContinue -Depth 5 |
               Where-Object { $_.Directory.Name -eq "dist" } | Select-Object -First 1
        if ($hit) { return $hit.Directory.FullName }
    }

    return (Join-Path $p1 "dist")  # fallback (message d'erreur)
}

$DIST_DIR        = Resolve-DistDir $SCRIPT_DIR
$PATCHER_PATH    = Join-Path $DIST_DIR "patcher.js"
$PATCHER_UNIX    = $PATCHER_PATH -replace "\\", "/"
$OPENASAR_BUNDLE = Join-Path $SCRIPT_DIR "openasar.asar"

$DISCORD_VARIANTS = @(
    @{ Name = "Discord Stable"; Folder = "Discord";            Exe = "Discord.exe" },
    @{ Name = "Discord PTB";    Folder = "DiscordPTB";         Exe = "DiscordPTB.exe" },
    @{ Name = "Discord Canary"; Folder = "DiscordCanary";      Exe = "DiscordCanary.exe" },
    @{ Name = "Discord Dev";    Folder = "DiscordDevelopment"; Exe = "DiscordDevelopment.exe" }
)

# ── Logique backend ───────────────────────────────────────────────────────────
function Get-CoreDir($appDir) {
    $mod = Join-Path $appDir "modules"
    if (-not (Test-Path $mod)) { return $null }
    # Prendre la version de core la plus recente QUI a un index.js valide
    $cores = Get-ChildItem $mod -Filter "discord_desktop_core-*" -Directory -ErrorAction SilentlyContinue |
             Sort-Object Name -Descending
    foreach ($p in $cores) {
        $inner = Join-Path $p.FullName "discord_desktop_core"
        if (Test-Path (Join-Path $inner "index.js")) { return $inner }
    }
    return $null
}

function New-InstallObj($name, $exe, $appDir, $core) {
    [PSCustomObject]@{
        Name       = $name
        Exe        = $exe
        CoreDir    = $core
        IdxPath    = Join-Path $core "index.js"
        OrigIdx    = Join-Path $core "_index.js"
        AsarPath   = Join-Path $appDir "resources\app.asar"
        AsarBackup = Join-Path $appDir "resources\app.asar.backup"
        ExePath    = Join-Path $appDir $exe
        AppVer     = ((Split-Path $appDir -Leaf) -replace "app-","")
    }
}

function Get-DiscordInstalls {
    $found = @()
    $seenCores = @{}

    # Plusieurs emplacements possibles (LocalAppData standard + variantes)
    $bases = @(
        [Environment]::GetFolderPath("LocalApplicationData"),
        $env:LOCALAPPDATA,
        (Join-Path $env:USERPROFILE "AppData\Local")
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    foreach ($v in $DISCORD_VARIANTS) {
        foreach ($root in $bases) {
            $base = Join-Path $root $v.Folder
            if (-not (Test-Path $base)) { continue }

            # 1) Parcourir TOUTES les app-* (pas juste la 1ere) et prendre la
            #    plus recente qui a un core valide.
            $appDirs = Get-ChildItem $base -Filter "app-*" -Directory -ErrorAction SilentlyContinue |
                       Sort-Object Name -Descending
            $picked = $null; $pickedCore = $null
            foreach ($ad in $appDirs) {
                $c = Get-CoreDir $ad.FullName
                if ($c) { $picked = $ad.FullName; $pickedCore = $c; break }
            }

            # 2) Secours : recherche recursive de discord_desktop_core avec index.js
            if (-not $pickedCore) {
                $hit = Get-ChildItem $base -Recurse -Directory -Filter "discord_desktop_core" -ErrorAction SilentlyContinue |
                       Where-Object { Test-Path (Join-Path $_.FullName "index.js") } |
                       Sort-Object FullName -Descending | Select-Object -First 1
                if ($hit) {
                    $pickedCore = $hit.FullName
                    # appDir = .../app-X/modules/discord_desktop_core-N/discord_desktop_core -> remonter de 3
                    $picked = Split-Path (Split-Path (Split-Path $hit.FullName))
                }
            }

            if (-not $pickedCore) { continue }
            if ($seenCores.ContainsKey($pickedCore)) { continue }
            $seenCores[$pickedCore] = $true
            $found += New-InstallObj $v.Name $v.Exe $picked $pickedCore
            break  # variante trouvee pour ce root, passer a la variante suivante
        }
    }
    return $found
}

# Construit un objet "install" depuis un dossier choisi manuellement (emplacement custom).
# Accepte soit un dossier racine Discord (contenant des app-*), soit un dossier app-* directement.
function New-InstallFromPath($path) {
    if (-not (Test-Path $path)) { return $null }
    $appDir = $null
    $leaf = Split-Path $path -Leaf
    if ($leaf -like "app-*") {
        $appDir = Get-Item $path
    } else {
        $appDir = Get-ChildItem $path -Filter "app-*" -Directory -ErrorAction SilentlyContinue |
                  Sort-Object Name -Descending | Select-Object -First 1
    }
    if (-not $appDir) { return $null }
    $core = Get-CoreDir $appDir.FullName
    if (-not $core) { return $null }
    # Deviner l'exe present dans le dossier app
    $exe = Get-ChildItem $appDir.FullName -Filter "*.exe" -File -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -match "Discord" } | Select-Object -First 1
    return [PSCustomObject]@{
        Name       = "Custom - $($appDir.Name)"
        Exe        = $(if ($exe) { $exe.Name } else { "Discord.exe" })
        CoreDir    = $core
        IdxPath    = Join-Path $core "index.js"
        OrigIdx    = Join-Path $core "_index.js"
        AsarPath   = Join-Path $appDir.FullName "resources\app.asar"
        AsarBackup = Join-Path $appDir.FullName "resources\app.asar.backup"
        ExePath    = $(if ($exe) { $exe.FullName } else { "" })
        AppVer     = ($appDir.Name -replace "app-","")
    }
}

# Extrait le logo (icone) d'un exe Discord -> ImageSource WPF (ou $null)
function Get-ExeIcon($exePath) {
    try {
        if (-not $exePath -or -not (Test-Path $exePath)) { return $null }
        $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
        if (-not $ico) { return $null }
        $src = [System.Windows.Interop.Imaging]::CreateBitmapSourceFromHIcon(
            $ico.Handle, [System.Windows.Int32Rect]::Empty,
            [System.Windows.Media.Imaging.BitmapSizeOptions]::FromWidthAndHeight(32, 32))
        return $src
    } catch { return $null }
}

function Test-IsInstalled($i) { Test-Path $i.OrigIdx }
function Test-OpenAsar($i)    { Test-Path $i.AsarBackup }

function Install-Gambo($i) {
    if (-not (Test-Path $PATCHER_PATH)) {
        return @{ Ok=$false; Msg="Fichiers Gambo introuvables. EXTRAIS le ZIP en entier (clic droit -> Extraire tout) puis lance l'installer depuis le dossier extrait - ne le lance PAS depuis l'interieur du zip." }
    }
    try {
        $enc = New-Object System.Text.UTF8Encoding($false)
        if (-not (Test-Path $i.OrigIdx)) {
            [IO.File]::WriteAllText($i.OrigIdx, [IO.File]::ReadAllText($i.IdxPath), $enc)
        }
        $idxContent = "require(`"$PATCHER_UNIX`");`nmodule.exports = require('./core.asar');`n"
        [IO.File]::WriteAllText($i.IdxPath, $idxContent, $enc)
        return @{ Ok=$true; Msg="Gambo installed - $($i.Name) v$($i.AppVer)" }
    } catch { return @{ Ok=$false; Msg="Error: $_" } }
}

function Uninstall-Gambo($i) {
    try {
        if (-not (Test-Path $i.OrigIdx)) { return @{ Ok=$false; Msg="Not installed - $($i.Name)" } }
        $enc = New-Object System.Text.UTF8Encoding($false)
        [IO.File]::WriteAllText($i.IdxPath, [IO.File]::ReadAllText($i.OrigIdx), $enc)
        Remove-Item $i.OrigIdx -Force -ErrorAction SilentlyContinue
        return @{ Ok=$true; Msg="Gambo uninstalled - $($i.Name)" }
    } catch { return @{ Ok=$false; Msg="Error: $_" } }
}

function Install-OpenAsar($i) {
    try {
        if (-not (Test-Path $OPENASAR_BUNDLE)) { return @{ Ok=$false; Msg="openasar.asar missing" } }
        if (-not (Test-Path $i.AsarPath))      { return @{ Ok=$false; Msg="app.asar not found" } }
        if (-not (Test-Path $i.AsarBackup)) { Copy-Item $i.AsarPath $i.AsarBackup -Force }
        try { Set-ItemProperty -Path $i.AsarPath -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue } catch {}
        Copy-Item $OPENASAR_BUNDLE $i.AsarPath -Force
        return @{ Ok=$true; Msg="OpenAsar enabled (fast startup) - $($i.Name)" }
    } catch { return @{ Ok=$false; Msg="OpenAsar error: $_" } }
}

function Uninstall-OpenAsar($i) {
    try {
        if (-not (Test-Path $i.AsarBackup)) { return @{ Ok=$true; Msg="" } }
        try { Set-ItemProperty -Path $i.AsarPath -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue } catch {}
        Copy-Item $i.AsarBackup $i.AsarPath -Force
        Remove-Item $i.AsarBackup -Force -ErrorAction SilentlyContinue
        return @{ Ok=$true; Msg="Normal startup restored - $($i.Name)" }
    } catch { return @{ Ok=$false; Msg="Restore error: $_" } }
}

function Stop-Discord($i) {
    $n = $i.Exe -replace "\.exe$",""
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

$installs = @(Get-DiscordInstalls)

# ── XAML (UI moderne) ─────────────────────────────────────────────────────────
[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Gambo Installer" Height="640" Width="600"
        WindowStartupLocation="CenterScreen" WindowStyle="None"
        AllowsTransparency="True" Background="Transparent" ResizeMode="NoResize">
  <Window.Resources>
    <!-- Bouton principal -->
    <Style x:Key="PrimaryBtn" TargetType="Button">
      <Setter Property="Background" Value="#5865F2"/>
      <Setter Property="Foreground" Value="#FFFFFF"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="FontSize" Value="13"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="BorderThickness" Value="0"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="b" Background="{TemplateBinding Background}" CornerRadius="8">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="b" Property="Background" Value="#4752C4"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <!-- Bouton danger -->
    <Style x:Key="DangerBtn" TargetType="Button" BasedOn="{StaticResource PrimaryBtn}">
      <Setter Property="Background" Value="#3A2222"/>
      <Setter Property="Foreground" Value="#F2555A"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="b" Background="{TemplateBinding Background}" CornerRadius="8"
                    BorderBrush="#7A2E2E" BorderThickness="1">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="b" Property="Background" Value="#4A2828"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <!-- Toggle switch moderne (remplace les checkboxes) -->
    <Style x:Key="ToggleSwitch" TargetType="CheckBox">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="CheckBox">
            <Border x:Name="track" Width="44" Height="24" CornerRadius="12">
              <Border.Background>
                <SolidColorBrush Color="#3A3C43"/>
              </Border.Background>
              <Border x:Name="knob" Width="18" Height="18" CornerRadius="9" Background="White"
                      HorizontalAlignment="Left" Margin="3,0,0,0">
                <Border.RenderTransform>
                  <TranslateTransform x:Name="knobT" X="0"/>
                </Border.RenderTransform>
              </Border>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsChecked" Value="True">
                <Trigger.EnterActions>
                  <BeginStoryboard>
                    <Storyboard>
                      <DoubleAnimation Storyboard.TargetName="knobT" Storyboard.TargetProperty="X"
                                       To="20" Duration="0:0:0.18">
                        <DoubleAnimation.EasingFunction><CubicEase EasingMode="EaseOut"/></DoubleAnimation.EasingFunction>
                      </DoubleAnimation>
                      <ColorAnimation Storyboard.TargetName="track" Storyboard.TargetProperty="Background.Color"
                                      To="#5865F2" Duration="0:0:0.18"/>
                    </Storyboard>
                  </BeginStoryboard>
                </Trigger.EnterActions>
                <Trigger.ExitActions>
                  <BeginStoryboard>
                    <Storyboard>
                      <DoubleAnimation Storyboard.TargetName="knobT" Storyboard.TargetProperty="X"
                                       To="0" Duration="0:0:0.18">
                        <DoubleAnimation.EasingFunction><CubicEase EasingMode="EaseOut"/></DoubleAnimation.EasingFunction>
                      </DoubleAnimation>
                      <ColorAnimation Storyboard.TargetName="track" Storyboard.TargetProperty="Background.Color"
                                      To="#3A3C43" Duration="0:0:0.18"/>
                    </Storyboard>
                  </BeginStoryboard>
                </Trigger.ExitActions>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Border CornerRadius="14" Background="#16171B" BorderBrush="#2B2D31" BorderThickness="1">
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
      </Grid.RowDefinitions>

      <!-- Titlebar -->
      <Grid x:Name="TitleBar" Grid.Row="0" Height="48" Background="Transparent">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <StackPanel Grid.Column="0" Orientation="Horizontal" VerticalAlignment="Center" Margin="18,0,0,0">
          <Border Width="30" Height="30" CornerRadius="8" Background="#5865F2" VerticalAlignment="Center">
            <TextBlock Text="G" Foreground="White" FontSize="17" FontWeight="Bold"
                       HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <StackPanel Margin="12,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="Gambo Installer" Foreground="#F2F3F5" FontSize="15" FontWeight="Bold"/>
            <TextBlock Text="Discord client mod - by _o0" Foreground="#949BA4" FontSize="10"/>
          </StackPanel>
        </StackPanel>
        <Button x:Name="BtnClose" Grid.Column="1" Width="46" Height="48" Background="Transparent"
                Foreground="#949BA4" BorderThickness="0" Cursor="Hand" FontSize="15" Content="X">
          <Button.Template>
            <ControlTemplate TargetType="Button">
              <Border x:Name="cb" Background="{TemplateBinding Background}">
                <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
              </Border>
              <ControlTemplate.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                  <Setter TargetName="cb" Property="Background" Value="#DA373C"/>
                  <Setter Property="Foreground" Value="White"/>
                </Trigger>
              </ControlTemplate.Triggers>
            </ControlTemplate>
          </Button.Template>
        </Button>
      </Grid>

      <Border Grid.Row="1" Height="1" Background="#2B2D31"/>

      <!-- Contenu -->
      <ScrollViewer Grid.Row="2" VerticalScrollBarVisibility="Auto" Padding="18,16,18,8">
        <StackPanel>
          <TextBlock Text="DETECTED INSTALLATIONS" Foreground="#5C6069" FontSize="10" FontWeight="Bold" Margin="2,0,0,8"/>
          <StackPanel x:Name="InstallList"/>

          <Button x:Name="BtnCustom" HorizontalAlignment="Left" Margin="2,2,0,0" Cursor="Hand"
                  Background="Transparent" Foreground="#7B83EB" BorderThickness="0" FontSize="12"
                  Content="+ Add custom location">
            <Button.Template>
              <ControlTemplate TargetType="Button">
                <TextBlock x:Name="tb" Text="{TemplateBinding Content}" Foreground="{TemplateBinding Foreground}"/>
                <ControlTemplate.Triggers>
                  <Trigger Property="IsMouseOver" Value="True">
                    <Setter TargetName="tb" Property="TextDecorations" Value="Underline"/>
                    <Setter TargetName="tb" Property="Foreground" Value="#A5ABF0"/>
                  </Trigger>
                </ControlTemplate.Triggers>
              </ControlTemplate>
            </Button.Template>
          </Button>

          <TextBlock Text="STARTUP MODE" Foreground="#5C6069" FontSize="10" FontWeight="Bold" Margin="2,14,0,8"/>
          <Border Background="#1E1F25" CornerRadius="10" Padding="14,12">
            <Grid>
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="Auto"/>
              </Grid.ColumnDefinitions>
              <StackPanel Grid.Column="0" VerticalAlignment="Center">
                <TextBlock Text="Fast startup (OpenAsar)" Foreground="#F2F3F5" FontSize="13" FontWeight="SemiBold"/>
                <TextBlock Text="Removes the 'Checking for updates' screen and speeds up launch." Foreground="#949BA4" FontSize="11" Margin="0,3,0,0" TextWrapping="Wrap"/>
              </StackPanel>
              <CheckBox x:Name="ChkOpenAsar" Grid.Column="1" VerticalAlignment="Center" Margin="12,0,0,0" Style="{StaticResource ToggleSwitch}"/>
            </Grid>
          </Border>
        </StackPanel>
      </ScrollViewer>

      <!-- Boutons -->
      <Grid Grid.Row="3" Margin="18,8,18,12">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="12"/>
          <ColumnDefinition Width="*"/>
        </Grid.ColumnDefinitions>
        <Button x:Name="BtnInstall" Grid.Column="0" Height="42" Content="INSTALL" Style="{StaticResource PrimaryBtn}"/>
        <Button x:Name="BtnUninstall" Grid.Column="2" Height="42" Content="UNINSTALL" Style="{StaticResource DangerBtn}"/>
      </Grid>

      <!-- Log -->
      <Border Grid.Row="4" Background="#0E0F12" CornerRadius="0,0,14,14" Padding="18,10">
        <ScrollViewer x:Name="LogScroll" Height="96" VerticalScrollBarVisibility="Auto">
          <TextBlock x:Name="LogText" Foreground="#B5BAC1" FontFamily="Consolas" FontSize="11" TextWrapping="Wrap"/>
        </ScrollViewer>
      </Border>
    </Grid>
  </Border>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

# ── Références éléments ────────────────────────────────────────────────────────
$TitleBar     = $window.FindName("TitleBar")
$BtnClose     = $window.FindName("BtnClose")
$InstallList  = $window.FindName("InstallList")
$BtnCustom    = $window.FindName("BtnCustom")
$ChkOpenAsar  = $window.FindName("ChkOpenAsar")
$BtnInstall   = $window.FindName("BtnInstall")
$BtnUninstall = $window.FindName("BtnUninstall")
$LogText      = $window.FindName("LogText")
$LogScroll    = $window.FindName("LogScroll")

# ── Helpers UI ─────────────────────────────────────────────────────────────────
$script:BrushConv = New-Object Windows.Media.BrushConverter
function Write-Log($msg, $color = "#B5BAC1") {
    $run = New-Object Windows.Documents.Run
    $run.Text = "$msg`n"
    $run.Foreground = $script:BrushConv.ConvertFromString($color)
    $LogText.Inlines.Add($run)
    $LogScroll.ScrollToBottom()
    # Force le rendu immediat du log pendant les boucles
    $window.Dispatcher.Invoke([action]{}, [Windows.Threading.DispatcherPriority]::Render)
}

$script:cardRefs = @{}

function Add-InstallCard($inst) {
    $ok  = Test-IsInstalled $inst
    $oa  = Test-OpenAsar $inst

    $card = New-Object Windows.Controls.Border
    $card.Background = (New-Object Windows.Media.SolidColorBrush ([Windows.Media.ColorConverter]::ConvertFromString("#1E1F25")))
    $card.CornerRadius = 10
    $card.Padding = "12,10"
    $card.Margin = "0,0,0,8"
    $card.Cursor = "Hand"
    # Transform propre à chaque card pour l'animation de survol
    $card.RenderTransformOrigin = New-Object Windows.Point(0.5, 0.5)
    $scale = New-Object Windows.Media.ScaleTransform
    $scale.ScaleX = 1; $scale.ScaleY = 1
    $card.RenderTransform = $scale

    $grid = New-Object Windows.Controls.Grid
    $c0 = New-Object Windows.Controls.ColumnDefinition; $c0.Width = "Auto"
    $cL = New-Object Windows.Controls.ColumnDefinition; $cL.Width = "Auto"
    $c1 = New-Object Windows.Controls.ColumnDefinition; $c1.Width = "*"
    $c2 = New-Object Windows.Controls.ColumnDefinition; $c2.Width = "Auto"
    $grid.ColumnDefinitions.Add($c0); $grid.ColumnDefinitions.Add($cL)
    $grid.ColumnDefinitions.Add($c1); $grid.ColumnDefinitions.Add($c2)

    $cb = New-Object Windows.Controls.CheckBox
    $cb.IsChecked = $true
    $cb.VerticalAlignment = "Center"
    $cb.Style = $window.Resources["ToggleSwitch"]
    [Windows.Controls.Grid]::SetColumn($cb, 0)
    $grid.Children.Add($cb) | Out-Null

    # Logo Discord (icone extraite de l'exe)
    $logoSrc = Get-ExeIcon $inst.ExePath
    if ($logoSrc) {
        $img = New-Object Windows.Controls.Image
        $img.Source = $logoSrc
        $img.Width = 26; $img.Height = 26
        $img.Margin = "12,0,0,0"; $img.VerticalAlignment = "Center"
        [Windows.Controls.Grid]::SetColumn($img, 1)
        $grid.Children.Add($img) | Out-Null
    }

    $info = New-Object Windows.Controls.StackPanel
    $info.Margin = "12,0,0,0"; $info.VerticalAlignment = "Center"
    [Windows.Controls.Grid]::SetColumn($info, 2)
    $t1 = New-Object Windows.Controls.TextBlock
    $t1.Text = $inst.Name; $t1.Foreground = "#F2F3F5"; $t1.FontSize = 13; $t1.FontWeight = "SemiBold"
    $t2 = New-Object Windows.Controls.TextBlock
    $t2.Text = "v$($inst.AppVer)"; $t2.Foreground = "#5C6069"; $t2.FontSize = 10
    $info.Children.Add($t1) | Out-Null; $info.Children.Add($t2) | Out-Null
    $grid.Children.Add($info) | Out-Null

    $pill = New-Object Windows.Controls.Border
    $pill.CornerRadius = 6; $pill.Padding = "8,3"; $pill.VerticalAlignment = "Center"
    $pillTxt = New-Object Windows.Controls.TextBlock
    $pillTxt.FontSize = 10; $pillTxt.FontWeight = "Bold"
    if ($ok) {
        $pill.Background = "#1E3A28"; $pillTxt.Foreground = "#5ED98A"
        $pillTxt.Text = $(if ($oa) { "INSTALLED + OPENASAR" } else { "INSTALLED" })
    } else {
        $pill.Background = "#26272D"; $pillTxt.Foreground = "#949BA4"; $pillTxt.Text = "NOT INSTALLED"
    }
    $pill.Child = $pillTxt
    [Windows.Controls.Grid]::SetColumn($pill, 3)
    $grid.Children.Add($pill) | Out-Null

    $card.Child = $grid
    $InstallList.Children.Add($card) | Out-Null

    # ── Animation de survol : la card grossit doucement + fond plus clair ─────
    $ease = New-Object Windows.Media.Animation.CubicEase
    $ease.EasingMode = "EaseOut"
    $dur = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(140))
    $colHover  = [Windows.Media.ColorConverter]::ConvertFromString("#26272D")
    $colNormal = [Windows.Media.ColorConverter]::ConvertFromString("#1E1F25")

    $card.Add_MouseEnter({
        $a = New-Object Windows.Media.Animation.DoubleAnimation(1.0, 1.03, $dur)
        $a.EasingFunction = $ease
        $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $a)
        $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $a)
        $ca = New-Object Windows.Media.Animation.ColorAnimation($colHover, $dur)
        $card.Background.BeginAnimation([Windows.Media.SolidColorBrush]::ColorProperty, $ca)
    }.GetNewClosure())

    $card.Add_MouseLeave({
        $a = New-Object Windows.Media.Animation.DoubleAnimation(1.0, $dur)
        $a.EasingFunction = $ease
        $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $a)
        $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $a)
        $ca = New-Object Windows.Media.Animation.ColorAnimation($colNormal, $dur)
        $card.Background.BeginAnimation([Windows.Media.SolidColorBrush]::ColorProperty, $ca)
    }.GetNewClosure())

    $script:cardRefs[$inst.Name] = @{ Inst = $inst; Cb = $cb; Pill = $pill; PillTxt = $pillTxt }
}

function Refresh-Cards {
    foreach ($k in $script:cardRefs.Keys) {
        $r = $script:cardRefs[$k]
        $ok = Test-IsInstalled $r.Inst
        $oa = Test-OpenAsar $r.Inst
        if ($ok) {
            $r.Pill.Background = "#1E3A28"; $r.PillTxt.Foreground = "#5ED98A"
            $r.PillTxt.Text = $(if ($oa) { "INSTALLED + OPENASAR" } else { "INSTALLED" })
        } else {
            $r.Pill.Background = "#26272D"; $r.PillTxt.Foreground = "#949BA4"; $r.PillTxt.Text = "NOT INSTALLED"
        }
    }
}

function Get-Selected {
    $sel = @()
    foreach ($k in $script:cardRefs.Keys) {
        if ($script:cardRefs[$k].Cb.IsChecked) { $sel += $script:cardRefs[$k].Inst }
    }
    return $sel
}

# ── Remplir la liste ───────────────────────────────────────────────────────────
if ($installs.Count -eq 0) {
    $warn = New-Object Windows.Controls.TextBlock
    $warn.Text = "No Discord installation found on this PC."
    $warn.Foreground = "#F2555A"; $warn.FontSize = 12; $warn.Margin = "2,4,0,4"
    $InstallList.Children.Add($warn) | Out-Null
} else {
    $anyOA = $false
    foreach ($inst in $installs) {
        Add-InstallCard $inst
        if (Test-OpenAsar $inst) { $anyOA = $true }
    }
    $ChkOpenAsar.IsChecked = $anyOA
}

# ── Events ──────────────────────────────────────────────────────────────────────
$TitleBar.Add_MouseLeftButtonDown({ $window.DragMove() })
$BtnClose.Add_Click({ $window.Close() })

$BtnCustom.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = "Pick your Discord install folder (root or app-... folder)"
    $dlg.ShowNewFolderButton = $false
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }

    $inst = New-InstallFromPath $dlg.SelectedPath
    if (-not $inst) {
        Write-Log "[!] No valid Discord install found in that folder." "#F2555A"
        return
    }
    if ($script:cardRefs.ContainsKey($inst.Name)) {
        Write-Log "[i] This location is already in the list." "#949BA4"
        return
    }
    Add-InstallCard $inst
    Write-Log "[OK] Location added: $($inst.Name)" "#5ED98A"
})

$BtnInstall.Add_Click({
    $sel = Get-Selected
    if ($sel.Count -eq 0) { Write-Log "[!] Select at least one installation." "#F2555A"; return }
    $useOA = $ChkOpenAsar.IsChecked
    Write-Log ">> Installing..." "#5865F2"
    Write-Log ("   Mode: " + $(if ($useOA) { "OpenAsar (fast)" } else { "Normal" })) "#949BA4"
    foreach ($i in $sel) {
        Stop-Discord $i
        Start-Sleep -Milliseconds 400
        $r = Install-Gambo $i
        Write-Log ("   " + $(if ($r.Ok) { "[OK] " } else { "[ERR] " }) + $r.Msg) $(if ($r.Ok) { "#5ED98A" } else { "#F2555A" })
        if ($useOA) { $ro = Install-OpenAsar $i } else { $ro = Uninstall-OpenAsar $i }
        if ($ro.Msg) {
            Write-Log ("   " + $(if ($ro.Ok) { "[OK] " } else { "[ERR] " }) + $ro.Msg) $(if ($ro.Ok) { "#5ED98A" } else { "#F2555A" })
        }
    }
    Write-Log "   Restart Discord to apply." "#949BA4"
    Refresh-Cards
})

$BtnUninstall.Add_Click({
    $sel = Get-Selected
    if ($sel.Count -eq 0) { Write-Log "[!] Select at least one installation." "#F2555A"; return }
    Write-Log ">> Uninstalling..." "#DA373C"
    foreach ($i in $sel) {
        Stop-Discord $i
        Start-Sleep -Milliseconds 400
        $r = Uninstall-Gambo $i
        Write-Log ("   " + $(if ($r.Ok) { "[OK] " } else { "[ERR] " }) + $r.Msg) $(if ($r.Ok) { "#5ED98A" } else { "#F2555A" })
        $ro = Uninstall-OpenAsar $i
        if ($ro.Msg) { Write-Log ("   [OK] " + $ro.Msg) "#5ED98A" }
    }
    Write-Log "   Restart Discord to apply." "#949BA4"
    Refresh-Cards
})

# ── Init ────────────────────────────────────────────────────────────────────────
Write-Log "Gambo Installer ready." "#5865F2"
if (-not (Test-Path $PATCHER_PATH)) {
    Write-Log "[!] Fichiers Gambo (dist\patcher.js) introuvables." "#F2555A"
    Write-Log "    Installer lance depuis : $SCRIPT_DIR" "#949BA4"
    Write-Log "    Cherche dist a : $DIST_DIR" "#949BA4"
    $par = Split-Path -Parent $SCRIPT_DIR
    Write-Log "    Contenu du dossier parent ($par) :" "#949BA4"
    try {
        Get-ChildItem $par -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Log "      - $($_.Name)$(if($_.PSIsContainer){'\'})" "#949BA4"
        }
    } catch {}
    Write-Log "    -> Il faut un dossier 'dist' a cote de 'installer'." "#F2555A"
    Write-Log "    -> Clic droit sur le ZIP -> 'Extraire tout', puis lance" "#F2555A"
    Write-Log "       installer\GamboInstaller.bat depuis le dossier extrait." "#F2555A"
}

[void]$window.ShowDialog()
