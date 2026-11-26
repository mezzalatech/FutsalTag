@echo off
cd /d "%~dp0"
echo Menyiapkan ARF FutsalTag...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":1420 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
taskkill /F /IM tauri-app.exe >nul 2>&1

echo Menjalankan ARF FutsalTag...
bun run tauri dev
if errorlevel 1 (
    echo.
    echo [ERROR] ARF FutsalTag gagal dijalankan. Periksa pesan di atas.
    pause
)
