#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$REPO_ROOT/src-tauri/resources/bin-macos"
WHISPER_DIR="$REPO_ROOT/src-tauri/resources/whisper-macos"

mkdir -p "$BIN_DIR" "$WHISPER_DIR"

resolve_real() {
  python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

for tool in ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: '$tool' tidak ditemukan di PATH. Jalankan: brew install ffmpeg" >&2
    exit 1
  fi
  src="$(resolve_real "$(command -v "$tool")")"
  cp -f "$src" "$BIN_DIR/$tool"
  chmod +x "$BIN_DIR/$tool"
done

WHISPER_BIN=""
for cand in whisper-cli whisper-cpp; do
  if command -v "$cand" >/dev/null 2>&1; then
    WHISPER_BIN="$(command -v "$cand")"
    break
  fi
done

if [ -z "$WHISPER_BIN" ]; then
  echo "Error: 'whisper-cli' tidak ditemukan. Jalankan: brew install whisper-cpp" >&2
  exit 1
fi

WHISPER_REAL="$(resolve_real "$WHISPER_BIN")"
cp -f "$WHISPER_REAL" "$WHISPER_DIR/whisper-cli"
chmod +x "$WHISPER_DIR/whisper-cli"

# Salin dylib whisper/ggml pendamping jika tersedia di prefix Homebrew / build whisper-cpp
WHISPER_PREFIX="$(cd "$(dirname "$WHISPER_REAL")/.." && pwd)"
for search_dir in "$WHISPER_PREFIX/lib" "$WHISPER_PREFIX/libexec/lib" "$(dirname "$WHISPER_REAL")"; do
  if [ -d "$search_dir" ]; then
    find "$search_dir" -maxdepth 2 \( -name 'libwhisper*.dylib' -o -name 'libggml*.dylib' \) -print0 | while IFS= read -r -d '' dylib; do
      cp -fL "$dylib" "$WHISPER_DIR/"
    done
  fi
done

REQUIRED=(
  "src-tauri/resources/models/yolox_s.onnx"
  "src-tauri/resources/models/u2netp.onnx"
  "src-tauri/resources/models/ggml-base-q5_1.bin"
  "src-tauri/resources/whisper-macos/whisper-cli"
  "src-tauri/resources/bin-macos/ffmpeg"
  "src-tauri/resources/bin-macos/ffprobe"
)

for rel in "${REQUIRED[@]}"; do
  full="$REPO_ROOT/$rel"
  if [ ! -f "$full" ]; then
    echo "Error: Aset offline macOS wajib tidak ditemukan: $full" >&2
    exit 1
  fi
  size="$(wc -c < "$full" | tr -d ' ')"
  printf "OK  %-54s %12s bytes\n" "$rel" "$size"
done
