#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "========================================="
echo "   Menjalankan ARF FutsalTag (macOS)"
echo "========================================="
echo ""

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
    echo "[!] Bun belum terpasang. Pasang dengan: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

if [ ! -f "src-tauri/resources/bin-macos/ffmpeg" ] || [ ! -f "src-tauri/resources/whisper-macos/whisper-cli" ]; then
    echo "[*] Menyiapkan dependensi offline macOS..."
    if command -v brew >/dev/null 2>&1; then
        brew install ffmpeg whisper-cpp 2>/dev/null || true
    fi
    bash scripts/prepare-offline-bundle-macos.sh || true
fi

lsof -ti:1420 | xargs kill -9 2>/dev/null || true

echo "[*] Menjalankan aplikasi desktop ARF FutsalTag..."
bun run tauri dev
