@echo off
echo Installation de ps2exe pour compiler l'installeur en .exe...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-Module -ListAvailable ps2exe)) { Install-Module ps2exe -Scope CurrentUser -Force }"
echo.
echo Compilation en cours...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-ps2exe '%~dp0GambcordInstaller.ps1' '%~dp0GambcordInstaller.exe' -NoConsole -Title 'Gambcord Installer' -Description 'Gambcord Discord Mod Installer' -Company 'Gambcord'"
echo.
if exist "%~dp0GambcordInstaller.exe" (
    echo [OK] GambcordInstaller.exe cree avec succes !
) else (
    echo [ERREUR] La compilation a echoue.
)
pause
