#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "========================================="
echo "   Build ARF FutsalTag DMG (macOS)"
echo "========================================="
echo ""

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
    echo "[!] Bun belum terpasang. Pasang dengan: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "[1/3] Menyiapkan dependensi offline macOS..."
if command -v brew >/dev/null 2>&1; then
    brew install ffmpeg whisper-cpp 2>/dev/null || true
fi
bash scripts/prepare-offline-bundle-macos.sh

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$HOME/.tauri/futsaltag.key" ]; then
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/futsaltag.key")"
fi

echo "[2/3] Membangun bundle DMG..."
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    CI=true bun run tauri build --bundles app,dmg
else
    echo "[!] TAURI_SIGNING_PRIVATE_KEY tidak ditemukan; membuat DMG tanpa updater signature."
    CI=true bun run tauri build --bundles dmg --config '{"bundle":{"createUpdaterArtifacts":false}}'
fi

echo "[3/3] Selesai! Membuka folder DMG..."
open src-tauri/target/release/bundle/dmg/ 2>/dev/null || true
