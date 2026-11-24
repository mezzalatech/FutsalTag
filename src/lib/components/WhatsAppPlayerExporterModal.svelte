<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { VideoTagEvent } from '$lib/types';
  import {
    Share2,
    MessageCircle,
    X,
    Users,
    CheckCircle2,
    Film,
    Download,
    Clock,
    HardDrive,
  } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  const ROSTER = [
    '#1 Kiper',
    '#4 Anchor',
    '#7 Flank Kiri',
    '#11 Flank Kanan',
    '#9 Pivot',
    'Tim Lawan',
  ];

  let selectedPlayer = $state('#7 Flank Kiri');
  let isExporting = $state(false);
  let progress = $state(0);
  let statusMessage = $state('');
  let successFilePath = $state<string | null>(null);

  // Clips involving selected player
  let playerClips = $derived(
    projectStore.tags.filter((t) => t.playerLabel === selectedPlayer)
  );

  let totalDurationSec = $derived(
    playerClips.reduce((acc, c) => acc + (c.endTime - c.startTime), 0)
  );

  // Approximate file size at 720p 2Mbps: ~0.25MB per second
  let estimatedMb = $derived((totalDurationSec * 0.22).toFixed(1));

  async function exportWhatsAppPackage() {
    if (playerClips.length === 0) {
      statusMessage = `Tidak ada momen klip yang tercatat untuk ${selectedPlayer}.`;
      return;
    }

    if (!projectStore.videoFilePath) {
      statusMessage = 'File video tidak ditemukan. Silakan buka proyek dari file video.';
      return;
    }

    isExporting = true;
    progress = 10;
    statusMessage = `Memotong ${playerClips.length} klip khusus untuk ${selectedPlayer}...`;
    successFilePath = null;

    try {
      const renderedClips: string[] = [];

      for (let i = 0; i < playerClips.length; i++) {
        const clip = playerClips[i];
        const tempPath = `futsaltag_wa_clip_${i}_${Date.now()}.mp4`;

        await invoke<string>('export_whatsapp_clip_ffmpeg', {
          inputPath: projectStore.videoFilePath,
          outputPath: tempPath,
          startSec: clip.startTime,
          durationSec: clip.endTime - clip.startTime,
        });

        renderedClips.push(tempPath);
        progress = 10 + Math.floor(((i + 1) / playerClips.length) * 70);
      }

      statusMessage = 'Menggabungkan kompilasi video ringkas WhatsApp...';
      const cleanPlayer = selectedPlayer.replace(/[^a-zA-Z0-9]/g, '_');
      const finalFileName = `WhatsApp_Evaluasi_${cleanPlayer}_${Date.now()}.mp4`;

      await invoke<string>('concat_playlist_ffmpeg', {
        clipPaths: renderedClips,
        outputPath: finalFileName,
      });

      progress = 100;
      statusMessage = `Berhasil! Paket video WhatsApp tersimpan: ${finalFileName}`;
      successFilePath = finalFileName;
    } catch (err: any) {
      statusMessage = `Gagal ekspor: ${err?.message || err}`;
    } finally {
      isExporting = false;
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={onClose} role="button" tabindex="0">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog">
      <!-- HEADER -->
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-wrap">
            <MessageCircle size={20} class="wa-icon" />
          </div>
          <div>
            <h2 class="title">PAKET EKSPOR WHATSAPP PER PEMAIN</h2>
            <p class="subtitle">Kompilasi klip terkompresi 720p ringan (&lt; 16MB) siap kirim ke WhatsApp pemain</p>
          </div>
        </div>

        <button class="btn-close" onclick={onClose}>
          <X size={18} />
        </button>
      </div>

      <!-- BODY -->
      <div class="modal-body">
        <!-- PLAYER SELECTOR -->
        <div class="player-select-section">
          <span class="section-label">Pilih Pemain Futsal:</span>
          <div class="roster-grid">
            {#each ROSTER as r}
              <button
                class="roster-chip"
                class:selected={selectedPlayer === r}
                onclick={() => { selectedPlayer = r; successFilePath = null; statusMessage = ''; }}
              >
                <Users size={13} />
                <span>{r}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- TELEMETRY STATS -->
        <div class="telemetry-box">
          <div class="telem-item">
            <Film size={15} class="telem-icon" />
            <div class="telem-data">
              <span class="t-val">{playerClips.length} Momen</span>
              <span class="t-lbl">Total Klip Aksi</span>
            </div>
          </div>

          <div class="telem-item">
            <Clock size={15} class="telem-icon" />
            <div class="telem-data">
              <span class="t-val">{totalDurationSec.toFixed(1)} Detik</span>
              <span class="t-lbl">Durasi Kompilasi</span>
            </div>
          </div>

          <div class="telem-item">
            <HardDrive size={15} class="telem-icon" />
            <div class="telem-data">
              <span class="t-val">~{estimatedMb} MB</span>
              <span class="t-lbl">Estimasi Ukuran File</span>
            </div>
          </div>
        </div>

        <!-- CLIPS LIST PREVIEW -->
        <div class="clips-preview-wrap">
          <span class="preview-title">Daftar Klip yang Akan Digabungkan:</span>
          <div class="clips-list">
            {#each playerClips as clip}
              <div class="clip-row">
                <span class="clip-cat" style="background-color: {clip.color}">{clip.category}</span>
                <span class="clip-name">{clip.title}</span>
                <span class="clip-dur">{(clip.endTime - clip.startTime).toFixed(1)}s</span>
              </div>
            {/each}

            {#if playerClips.length === 0}
              <div class="empty-notice">
                Belum ada klip yang ditandai untuk {selectedPlayer}. Berikan tag pemain pada video terlebih dahulu.
              </div>
            {/if}
          </div>
        </div>

        <!-- PROGRESS BAR -->
        {#if isExporting}
          <div class="progress-wrap">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: {progress}%"></div>
            </div>
            <span class="status-msg">{statusMessage}</span>
          </div>
        {:else if statusMessage}
          <div class="status-box" class:success={successFilePath !== null}>
            {#if successFilePath}
              <CheckCircle2 size={16} />
            {/if}
            <span>{statusMessage}</span>
          </div>
        {/if}
      </div>

      <!-- FOOTER -->
      <div class="modal-footer">
        <button class="btn-cancel" onclick={onClose}>Tutup</button>
        <button
          class="btn-export-wa"
          onclick={exportWhatsAppPackage}
          disabled={isExporting || playerClips.length === 0}
        >
          <MessageCircle size={15} />
          <span>{isExporting ? 'Memproses Video...' : `Ekspor Video WhatsApp untuk ${selectedPlayer}`}</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
    background: rgba(2, 6, 23, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-card {
    background: #081224;
    border: 1px solid #1a355d;
    box-shadow: 0 0 32px rgba(16, 185, 129, 0.25);
    border-radius: 14px;
    width: 640px;
    max-width: 95vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    padding: 14px 20px;
    background: linear-gradient(180deg, #0d1e38 0%, #081224 100%);
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon-wrap {
    width: 36px;
    height: 36px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10b981;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.wa-icon) {
    color: #10b981;
  }

  .title {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: 0.05em;
  }

  .subtitle {
    margin: 2px 0 0 0;
    font-size: 11px;
    color: #94a3b8;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
  }

  .btn-close:hover {
    color: #ef4444;
  }

  /* BODY */
  .modal-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    max-height: 70vh;
  }

  .section-label {
    font-size: 11px;
    font-weight: 700;
    color: #93c5fd;
    margin-bottom: 6px;
    display: block;
  }

  .roster-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .roster-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0c1a33;
    border: 1px solid #1b365f;
    color: #cbd5e1;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .roster-chip:hover {
    border-color: #10b981;
    color: #ffffff;
  }

  .roster-chip.selected {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.35));
    border-color: #10b981;
    color: #34d399;
    font-weight: 700;
  }

  .telemetry-box {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    background: #050b14;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 10px;
  }

  .telem-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.telem-icon) {
    color: #38bdf8;
  }

  .telem-data {
    display: flex;
    flex-direction: column;
  }

  .t-val {
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
  }

  .t-lbl {
    font-size: 10px;
    color: #64748b;
  }

  .clips-preview-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preview-title {
    font-size: 10px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
  }

  .clips-list {
    background: #050b14;
    border: 1px solid #1a355d;
    border-radius: 6px;
    max-height: 140px;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .clip-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    background: #0c1a33;
    border-radius: 4px;
    font-size: 11px;
  }

  .clip-cat {
    font-size: 9px;
    font-weight: 800;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .clip-name {
    flex: 1;
    margin: 0 8px;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clip-dur {
    font-family: monospace;
    font-size: 10px;
    color: #64748b;
  }

  .empty-notice {
    font-size: 11px;
    color: #64748b;
    text-align: center;
    padding: 16px;
  }

  .progress-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .progress-bar-bg {
    height: 6px;
    background: #0f2444;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: #10b981;
    transition: width 0.2s ease;
  }

  .status-msg {
    font-size: 11px;
    color: #38bdf8;
    text-align: center;
  }

  .status-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #0c1a33;
    border: 1px solid #1b365f;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 11px;
    color: #94a3b8;
  }

  .status-box.success {
    background: rgba(16, 185, 129, 0.15);
    border-color: #10b981;
    color: #34d399;
    font-weight: 700;
  }

  /* FOOTER */
  .modal-footer {
    padding: 12px 20px;
    background: #081224;
    border-top: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid #1e3b68;
    color: #94a3b8;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-cancel:hover {
    color: #ffffff;
    background: #142a4d;
  }

  .btn-export-wa {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #059669, #047857);
    color: #ffffff;
    border: none;
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
    transition: all 0.2s;
  }

  .btn-export-wa:hover:not(:disabled) {
    background: linear-gradient(135deg, #047857, #065f46);
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.55);
  }

  .btn-export-wa:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
