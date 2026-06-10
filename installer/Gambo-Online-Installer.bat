@echo off
title Gambo Installer
echo.
echo   Gambo Installer - telechargement depuis GitHub...
echo.
set "PS=%TEMP%\GamboInstaller.ps1"
if exist "%PS%" del /f /q "%PS%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest 'https://github.com/gambioi/gambo/releases/latest/download/GamboInstaller.ps1' -OutFile $env:TEMP\GamboInstaller.ps1 -UseBasicParsing } catch { Write-Host ('Echec: ' + $_.Exception.Message) -ForegroundColor Red }"

if not exist "%PS%" (
  echo.
  echo [ERREUR] Impossible de telecharger l'installer.
  echo Verifie ta connexion internet, puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

rem Lance l'installer (il telecharge lui-meme les fichiers Gambo + OpenAsar)
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%PS%"
