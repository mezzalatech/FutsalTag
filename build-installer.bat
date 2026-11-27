@echo off
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.bun\bin;%USERPROFILE%\.cargo\bin;%PATH%"
echo ====================================================
echo   Membangun Installer & Executable ARF FutsalTag
echo ====================================================
echo.

echo 1. Membersihkan port lama jika ada...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":1420 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo 2. Memverifikasi aset offline bundle...
powershell -ExecutionPolicy Bypass -File scripts\prepare-offline-bundle.ps1
if errorlevel 1 (
    echo.
    echo [ERROR] Aset offline bundle belum lengkap!
    pause
    exit /b 1
)

echo 3. Menjalankan proses kompilasi rilis (Tauri Build)...
if defined TAURI_SIGNING_PRIVATE_KEY (
    bun run tauri build
) else (
    echo [INFO] TAURI_SIGNING_PRIVATE_KEY tidak diatur; membangun installer lokal tanpa updater signature.
    bun run tauri build --config "{\"bundle\":{\"createUpdaterArtifacts\":false}}"
)

if errorlevel 1 (
    echo.
    echo [ERROR] Proses build installer gagal! Periksa pesan error di atas.
    pause
    exit /b 1
)

echo.
echo ====================================================
echo   BUILD BERHASIL! File installer tersedia di:
echo ====================================================
echo NSIS Setup (.exe): src-tauri\target\release\bundle\nsis\
echo WiX Installer (.msi): src-tauri\target\release\bundle\msi\
echo.
explorer.exe "src-tauri\target\release\bundle\nsis"
pause
