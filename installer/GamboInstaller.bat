@echo off
cd /d "%~dp0"
rem Debloque les fichiers (au cas ou le zip n'a pas ete "Unblock") + lance l'installer.
rem Si une erreur survient, la fenetre reste ouverte pour la lire.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0..' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0GamboInstaller.ps1"
if %errorlevel% neq 0 (
  echo.
  echo [ERREUR] L'installer n'a pas pu demarrer ^(code %errorlevel%^).
  echo Verifie que tu as bien fait clic droit sur le ZIP -^> Proprietes -^> Debloquer AVANT d'extraire.
  echo.
  pause
)
