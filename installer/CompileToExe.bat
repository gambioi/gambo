@echo off
echo Installation de ps2exe pour compiler l'installeur en .exe...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-Module -ListAvailable ps2exe)) { Install-Module ps2exe -Scope CurrentUser -Force }"
echo.
echo Compilation en cours...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-ps2exe '%~dp0GamboInstaller.ps1' '%~dp0GamboInstaller.exe' -NoConsole -Title 'Gambo Installer' -Description 'Gambo Discord Mod Installer' -Company 'Gambo'"
echo.
if exist "%~dp0GamboInstaller.exe" (
    echo [OK] GamboInstaller.exe cree avec succes !
) else (
    echo [ERREUR] La compilation a echoue.
    echo Si Invoke-ps2exe est introuvable, relance ce .bat (le module s'installe au 1er lancement).
)
pause
