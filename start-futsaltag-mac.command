#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun belum terpasang. Install lewat: curl -fsSL https://bun.sh/install | bash"
  read -r -p "Tekan Enter untuk keluar..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Memasang dependensi frontend..."
  bun install
fi

echo "Menyiapkan aset biner macOS offline (jika tersedia)..."
bash scripts/prepare-offline-bundle-macos.sh || true

echo "Menjalankan FutsalTag Pro (macOS Dev Mode)..."
bun run tauri dev
