$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $repoRoot "src-tauri\resources\bin"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

foreach ($tool in @("ffmpeg", "ffprobe")) {
    $dest = Join-Path $binDir "$tool.exe"
    if (-not (Test-Path $dest)) {
        $cmd = Get-Command $tool -ErrorAction SilentlyContinue
        if (-not $cmd) {
            throw "Tidak menemukan '$tool.exe' di PATH sistem untuk dibundel ke installer offline."
        }
        Write-Host "Menyalin $($cmd.Source) -> $dest"
        Copy-Item $cmd.Source -Destination $dest -Force
    } else {
        Write-Host "Sudah ada: $dest"
    }
}

$requiredAssets = @(
    "src-tauri\resources\models\yolox_s.onnx",
    "src-tauri\resources\models\u2netp.onnx",
    "src-tauri\resources\models\ggml-base-q5_1.bin",
    "src-tauri\resources\whisper\whisper-cli.exe",
    "src-tauri\resources\bin\ffmpeg.exe",
    "src-tauri\resources\bin\ffprobe.exe"
)

foreach ($rel in $requiredAssets) {
    $full = Join-Path $repoRoot $rel
    if (-not (Test-Path $full)) {
        throw "Aset offline wajib tidak ditemukan: $full"
    }
    $item = Get-Item $full
    Write-Host ("OK  {0,-52} {1,10:N0} bytes" -f $rel, $item.Length)
}
