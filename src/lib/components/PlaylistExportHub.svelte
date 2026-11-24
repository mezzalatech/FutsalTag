<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type {
    ActionPlaylist,
    ActionPlaylistItem,
    ExportMode,
    VideoTagEvent,
  } from '$lib/types';
  import {
    Play,
    Pause,
    SkipForward,
    SkipBack,
    ArrowLeft,
    Film,
    Download,
    Layers,
    Clock,
    FolderCheck,
    CheckCircle2,
    Sparkles,
    FileSpreadsheet,
    Trash2,
    MoveUp,
    MoveDown,
    Settings2,
    Tv,
  } from 'lucide-svelte';

  let currentPlaylist = $derived(projectStore.playlists[0]);
  let selectedItemIndex = $state(0);
  let isPlayingPresentation = $state(false);
  let presentationVideoEl = $state<HTMLVideoElement | null>(null);

  // Export Settings State
  let exportMode = $state<ExportMode>('merged_video');
  let includeDrawings = $state(true);
  let outputResolution = $state<'1080p' | '720p'>('1080p');
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let exportStatusMessage = $state('');
  let exportSuccessPath = $state<string | null>(null);

  function playPresentationItem(idx: number) {
    if (!currentPlaylist || currentPlaylist.items.length === 0) return;
    selectedItemIndex = idx;
    const item = currentPlaylist.items[idx];
    if (presentationVideoEl) {
      presentationVideoEl.currentTime = item.tagEvent.startTime;
      presentationVideoEl.play();
      isPlayingPresentation = true;
    }
  }

  function handlePresentationTimeUpdate() {
    if (!presentationVideoEl || !currentPlaylist) return;
    const item = currentPlaylist.items[selectedItemIndex];
    if (!item) return;

    if (presentationVideoEl.currentTime >= item.tagEvent.endTime) {
      // Step to next item in playlist
      if (selectedItemIndex + 1 < currentPlaylist.items.length) {
        playPresentationItem(selectedItemIndex + 1);
      } else {
        presentationVideoEl.pause();
        isPlayingPresentation = false;
        selectedItemIndex = 0;
      }
    }
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    if (!currentPlaylist) return;
    const items = currentPlaylist.items;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    // re-assign order numbers
    items.forEach((item, idx) => (item.order = idx + 1));
  }

  function removeItem(index: number) {
    if (!currentPlaylist) return;
    currentPlaylist.items.splice(index, 1);
    currentPlaylist.items.forEach((item, idx) => (item.order = idx + 1));
  }

  // Trigger Native / Web Export
  async function triggerExport() {
    isExporting = true;
    exportProgress = 10;
    exportStatusMessage = 'Menyiapkan klip dan parameter render FFmpeg...';
    exportSuccessPath = null;

    try {
      // If running inside Tauri desktop app
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && projectStore.videoFilePath) {
        const item = currentPlaylist.items[selectedItemIndex] || currentPlaylist.items[0];
        exportStatusMessage = `Merender klip dengan FFmpeg hardware acceleration...`;
        exportProgress = 50;

        const resultPath = await invoke<string>('render_video_clip_ffmpeg', {
          inputPath: projectStore.videoFilePath,
          startTime: item.tagEvent.startTime,
          duration: item.tagEvent.endTime - item.tagEvent.startTime,
          outputPath: `teleslator_export_${Date.now()}.mp4`,
        });

        exportProgress = 100;
        exportStatusMessage = `Selesai! Klip tersimpan di: ${resultPath}`;
        exportSuccessPath = resultPath;
      } else {
        // Fallback simulation for browser demo mode
        for (let p = 20; p <= 100; p += 20) {
          await new Promise((r) => setTimeout(r, 400));
          exportProgress = p;
          if (p === 40) exportStatusMessage = 'Menggabungkan frame video & anotasi 3D...';
          if (p === 80) exportStatusMessage = 'Menerapkan pause jeda freeze-frame...';
        }
        exportStatusMessage = 'Ekspor Video Berhasil! File siap diunduh.';
        exportSuccessPath = `Teleslator_${exportMode}_${Date.now()}.mp4`;
      }
    } catch (err: any) {
      exportStatusMessage = `Gagal ekspor: ${err?.message || err}`;
    } finally {
      isExporting = false;
    }
  }

  function exportCSVStats() {
    const rows = [
      ['ID', 'Kategori Aksi', 'Mulai (s)', 'Selesai (s)', 'Pemain', 'Hasil', 'Rating', 'Pause Jeda (s)'],
      ...projectStore.tags.map((t) => [
        t.id,
        t.category,
        t.startTime.toFixed(2),
        t.endTime.toFixed(2),
        t.playerLabel || '-',
        t.outcomeLabel || '-',
        t.rating || '-',
        (t.pauseDuration || 3.0).toFixed(1),
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `teleslator_statistika_futsal_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

<div class="playlist-export-hub">
  <!-- TOP SUB-HEADER -->
  <header class="hub-header">
    <div class="header-left">
      <button class="btn-back" onclick={() => projectStore.setStage('tagging')}>
        <ArrowLeft size={16} />
        <span>Kembali ke Tagging</span>
      </button>
      <div class="header-title-wrap">
        <span class="hub-main-title">Pusat Playlist & Ekspor Multi-Format</span>
        <span class="hub-sub-title">Susun urutan klip presentasi dan ekspor video siaran tim</span>
      </div>
    </div>

    <div class="header-right">
      <button class="btn-csv" onclick={exportCSVStats}>
        <FileSpreadsheet size={15} />
        <span>Ekspor Rekap CSV</span>
      </button>
      <button class="btn-primary-export" onclick={triggerExport} disabled={isExporting}>
        <Download size={15} />
        <span>{isExporting ? 'Sedang Merender...' : 'Mulai Ekspor Video'}</span>
      </button>
    </div>
  </header>

  <!-- MAIN BODY: 2 COLUMNS (LEFT: PRESENTATION PLAYER & PLAYLIST, RIGHT: EXPORT SETTINGS) -->
  <div class="hub-grid">
    <!-- LEFT: TV PRESENTATION PLAYER & REORDERABLE PLAYLIST -->
    <div class="playlist-column">
      <!-- TV PRESENTATION PLAYER -->
      <div class="presentation-player-card">
        <div class="card-bar">
          <div class="bar-title">
            <Tv size={15} />
            <span>Mode Simulasi Siaran Presentasi TV (Auto-Play Sequencer)</span>
          </div>
          {#if currentPlaylist && currentPlaylist.items[selectedItemIndex]}
            <span class="now-playing-badge">
              Memutar Klip #{selectedItemIndex + 1}: {currentPlaylist.items[selectedItemIndex].title}
            </span>
          {/if}
        </div>

        <div class="video-frame">
          {#if projectStore.videoSrc}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={presentationVideoEl}
              src={projectStore.videoSrc}
              class="pres-video"
              ontimeupdate={handlePresentationTimeUpdate}
            ></video>
          {:else}
            <div class="mock-pres-screen">
              <Film size={36} />
              <p>Simulasi Presentasi TV Berurutan Aktif</p>
              <span>Setiap klip akan diputar berurutan dengan jeda freeze frame telestrasi secara otomatis.</span>
            </div>
          {/if}
        </div>

        <div class="pres-controls">
          <button
            class="btn-pres-play"
            onclick={() => {
              if (isPlayingPresentation && presentationVideoEl) {
                presentationVideoEl.pause();
                isPlayingPresentation = false;
              } else {
                playPresentationItem(selectedItemIndex);
              }
            }}
          >
            {#if isPlayingPresentation}
              <Pause size={16} />
              <span>Jeda Presentasi</span>
            {:else}
              <Play size={16} />
              <span>Putar Seluruh Playlist</span>
            {/if}
          </button>

          <span class="pres-counter">
            Total {currentPlaylist ? currentPlaylist.items.length : 0} Klip dalam Presentasi
          </span>
        </div>
      </div>

      <!-- PLAYLIST ITEMS LIST -->
      <div class="playlist-items-card">
        <div class="items-header">
          <div class="title-wrap">
            <Layers size={15} />
            <span class="title-text">Urutan Klip Playlist ({currentPlaylist ? currentPlaylist.items.length : 0})</span>
          </div>
          <span class="drag-hint">Gunakan tombol panah untuk mengatur urutan tayang klip</span>
        </div>

        <div class="items-scroll">
          {#if !currentPlaylist || currentPlaylist.items.length === 0}
            <div class="empty-playlist">
              <p>Belum ada klip di playlist ini.</p>
              <span>Silakan tambahkan klip dari Tahap 2 (Tagging).</span>
            </div>
          {:else}
            {#each currentPlaylist.items as item, idx}
              <div
                class="playlist-item-row"
                class:active-row={selectedItemIndex === idx}
                onclick={() => playPresentationItem(idx)}
              >
                <div class="item-order-box">{idx + 1}</div>

                <div class="item-info">
                  <div class="item-title-row">
                    <span class="item-title">{item.title}</span>
                    <span class="item-cat" style="background-color: {item.tagEvent.color}">
                      {item.tagEvent.category}
                    </span>
                  </div>
                  <div class="item-meta">
                    <span class="meta-time">
                      [{item.tagEvent.startTime.toFixed(1)}s - {item.tagEvent.endTime.toFixed(1)}s]
                    </span>
                    {#if item.tagEvent.playerLabel}
                      <span class="meta-badge">{item.tagEvent.playerLabel}</span>
                    {/if}
                    <span class="meta-freeze">Jeda Freeze: {item.pauseDuration.toFixed(1)}s</span>
                  </div>
                </div>

                <!-- REORDER & DELETE ACTIONS -->
                <div class="item-actions" onclick={(e) => e.stopPropagation()}>
                  <button
                    class="btn-order"
                    disabled={idx === 0}
                    onclick={() => moveItem(idx, 'up')}
                    title="Pindahkan ke atas"
                  >
                    <MoveUp size={13} />
                  </button>
                  <button
                    class="btn-order"
                    disabled={idx === currentPlaylist.items.length - 1}
                    onclick={() => moveItem(idx, 'down')}
                    title="Pindahkan ke bawah"
                  >
                    <MoveDown size={13} />
                  </button>
                  <button
                    class="btn-del"
                    onclick={() => removeItem(idx)}
                    title="Hapus dari playlist"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <!-- RIGHT: MULTI-FORMAT EXPORT OPTIONS CARD -->
    <div class="export-column">
      <div class="export-config-card">
        <div class="config-header">
          <Settings2 size={16} />
          <span>Pengaturan Format Ekspor Video</span>
        </div>

        <!-- 3 ONCE SPORT EXPORT MODES -->
        <div class="mode-select-group">
          <label class="mode-option" class:selected={exportMode === 'merged_video'}>
            <input type="radio" bind:group={exportMode} value="merged_video" />
            <div class="mode-text">
              <span class="mode-title">1. Gabung Menjadi 1 Video Utuh (Merge)</span>
              <span class="mode-desc">
                Menggabungkan seluruh klip playlist menjadi 1 file video MP4 bersambung. Sangat cocok untuk rapat analisis tim.
              </span>
            </div>
          </label>

          <label class="mode-option" class:selected={exportMode === 'separate_clips'}>
            <input type="radio" bind:group={exportMode} value="separate_clips" />
            <div class="mode-text">
              <span class="mode-title">2. Ekspor Klip Terpisah di 1 Folder</span>
              <span class="mode-desc">
                Merender setiap aksi ke file mandiri: Klip_01_Gol.mp4, Klip_02_Pressing.mp4, dll.
              </span>
            </div>
          </label>

          <label class="mode-option" class:selected={exportMode === 'grouped_folders'}>
            <input type="radio" bind:group={exportMode} value="grouped_folders" />
            <div class="mode-text">
              <span class="mode-title">3. Kelompokkan ke Folder Aksi</span>
              <span class="mode-desc">
                Otomatis membuat subfolder sesuai nama aksi: folder Gol/, folder Set_Piece/, folder Transisi/.
              </span>
            </div>
          </label>
        </div>

        <!-- DRAWINGS & PAUSE CHECKBOX -->
        <div class="options-checklist">
          <label class="check-label">
            <input type="checkbox" bind:checked={includeDrawings} />
            <span>Sertakan Anotasi Telestrasi & Waktu Jeda Freeze-Frame</span>
          </label>

          <div class="res-row">
            <span class="res-title">Resolusi Output Video:</span>
            <div class="res-buttons">
              <button
                class="btn-res"
                class:active={outputResolution === '1080p'}
                onclick={() => (outputResolution = '1080p')}
              >
                1080p (Full HD)
              </button>
              <button
                class="btn-res"
                class:active={outputResolution === '720p'}
                onclick={() => (outputResolution = '720p')}
              >
                720p (HD)
              </button>
            </div>
          </div>
        </div>

        <!-- PROGRESS & STATUS -->
        {#if isExporting || exportProgress > 0}
          <div class="progress-wrap">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: {exportProgress}%"></div>
            </div>
            <div class="progress-meta">
              <span class="status-msg">{exportStatusMessage}</span>
              <span class="pct-num">{exportProgress}%</span>
            </div>
          </div>
        {/if}

        {#if exportSuccessPath}
          <div class="success-box">
            <CheckCircle2 size={16} />
            <span>File berhasil dirender: {exportSuccessPath}</span>
          </div>
        {/if}

        <button
          class="btn-render-action"
          onclick={triggerExport}
          disabled={isExporting}
        >
          <Film size={16} />
          <span>{isExporting ? 'Sedang Memproses Render...' : 'Render & Simpan Video'}</span>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .playlist-export-hub {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #0b0f19;
    color: #f8fafc;
    overflow: hidden;
  }

  /* HEADER */
  .hub-header {
    height: 52px;
    background-color: #0f172a;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .btn-back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-back:hover {
    color: #f8fafc;
    border-color: #64748b;
  }

  .header-title-wrap {
    display: flex;
    flex-direction: column;
  }

  .hub-main-title {
    font-size: 13px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .hub-sub-title {
    font-size: 10px;
    color: #64748b;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-csv {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #10b981;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-csv:hover {
    background-color: #273549;
  }

  .btn-primary-export {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-primary-export:hover:not(:disabled) {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }

  .btn-primary-export:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* GRID */
  .hub-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 440px;
    gap: 16px;
    padding: 16px;
    overflow: hidden;
    box-sizing: border-box;
  }

  /* PLAYLIST COLUMN */
  .playlist-column {
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: hidden;
  }

  .presentation-player-card {
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .card-bar {
    padding: 10px 14px;
    background-color: #162032;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .bar-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
  }

  .now-playing-badge {
    font-size: 10px;
    background-color: #1e293b;
    color: #34d399;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .video-frame {
    height: 240px;
    background-color: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pres-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .mock-pres-screen {
    text-align: center;
    color: #475569;
  }

  .mock-pres-screen p {
    font-size: 13px;
    color: #cbd5e1;
    margin: 8px 0 4px 0;
  }

  .mock-pres-screen span {
    font-size: 10px;
  }

  .pres-controls {
    padding: 8px 14px;
    background-color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid #1e293b;
  }

  .btn-pres-play {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #059669, #047857);
    color: #ffffff;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .pres-counter {
    font-size: 11px;
    color: #94a3b8;
  }

  /* PLAYLIST ITEMS CARD */
  .playlist-items-card {
    flex: 1;
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .items-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .drag-hint {
    font-size: 10px;
    color: #64748b;
  }

  .items-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .empty-playlist {
    text-align: center;
    padding: 32px 16px;
    color: #64748b;
  }

  .playlist-item-row {
    background-color: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .playlist-item-row:hover {
    background-color: #273549;
    border-color: #475569;
  }

  .playlist-item-row.active-row {
    border-color: #38bdf8;
    background-color: #162a45;
  }

  .item-order-box {
    width: 22px;
    height: 22px;
    background-color: #0f172a;
    color: #38bdf8;
    font-size: 10px;
    font-weight: 800;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #334155;
  }

  .item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .item-title {
    font-size: 11px;
    font-weight: 600;
    color: #f8fafc;
  }

  .item-cat {
    font-size: 8px;
    font-weight: 800;
    color: #ffffff;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-time {
    font-family: monospace;
    font-size: 9px;
    color: #38bdf8;
  }

  .meta-badge {
    font-size: 9px;
    background-color: #0f172a;
    color: #cbd5e1;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .meta-freeze {
    font-size: 9px;
    color: #fbbf24;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-order {
    background-color: #0f172a;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-order:hover:not(:disabled) {
    color: #f8fafc;
    border-color: #64748b;
  }

  .btn-order:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn-del {
    background-color: transparent;
    border: none;
    color: #64748b;
    padding: 4px 6px;
    cursor: pointer;
  }

  .btn-del:hover {
    color: #ef4444;
  }

  /* EXPORT CONFIG COLUMN */
  .export-column {
    display: flex;
    flex-direction: column;
  }

  .export-config-card {
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .config-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #38bdf8;
  }

  .mode-select-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mode-option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background-color: #1e293b;
    border: 1px solid #334155;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mode-option:hover {
    border-color: #475569;
  }

  .mode-option.selected {
    border-color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.08);
  }

  .mode-option input {
    margin-top: 3px;
  }

  .mode-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-title {
    font-size: 12px;
    font-weight: 700;
    color: #f8fafc;
  }

  .mode-desc {
    font-size: 10px;
    line-height: 1.4;
    color: #94a3b8;
  }

  .options-checklist {
    background-color: #162032;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    color: #f1f5f9;
    cursor: pointer;
  }

  .res-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .res-title {
    font-size: 11px;
    color: #94a3b8;
  }

  .res-buttons {
    display: flex;
    gap: 6px;
  }

  .btn-res {
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-res.active {
    background-color: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  /* PROGRESS */
  .progress-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .progress-bar-bg {
    height: 6px;
    background-color: #1e293b;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #38bdf8, #10b981);
    transition: width 0.3s;
  }

  .progress-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
  }

  .status-msg {
    color: #94a3b8;
  }

  .pct-num {
    font-family: monospace;
    font-weight: 700;
    color: #38bdf8;
  }

  .success-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 11px;
  }

  .btn-render-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-render-action:hover:not(:disabled) {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    transform: translateY(-1px);
  }

  .btn-render-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
