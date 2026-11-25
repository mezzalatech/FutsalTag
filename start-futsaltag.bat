@echo off
cd /d "%~dp0"
echo Menyiapkan FutsalTag Pro...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":1420 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
taskkill /F /IM tauri-app.exe >nul 2>&1

echo Menjalankan FutsalTag Pro...
bun run tauri dev
if errorlevel 1 (
    echo.
    echo [ERROR] FutsalTag Pro gagal dijalankan. Periksa pesan di atas.
    pause
)
