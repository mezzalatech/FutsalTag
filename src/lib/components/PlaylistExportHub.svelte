<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { projectStore, isTauriDesktop } from '$lib/stores/projectStore.svelte';
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
  import { renderDrawingsToDataUrl } from '$lib/export/telestrationRenderer';

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
    if (!currentPlaylist || currentPlaylist.items.length === 0) {
      exportStatusMessage = 'Playlist masih kosong. Tambahkan klip terlebih dahulu.';
      return;
    }

    isExporting = true;
    exportProgress = 5;
    exportStatusMessage = 'Menyiapkan klip dan parameter render FFmpeg...';
    exportSuccessPath = null;

    const targetHeight = outputResolution === '720p' ? 720 : 1080;
    const renderW = targetHeight === 720 ? 1280 : 1920;
    const renderH = targetHeight === 720 ? 720 : 1080;

    try {
      const hasAbsVideo =
        projectStore.videoFilePath &&
        (projectStore.videoFilePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath));

      if (isTauriDesktop()) {
        if (!hasAbsVideo || !projectStore.videoFilePath) {
          throw new Error(
            'Path video absolut tidak ditemukan. Buka video lewat tombol "Pilih Video" di Hub Proyek.'
          );
        }

        const { open, save } = await import('@tauri-apps/plugin-dialog');
        const items = currentPlaylist.items;

        const renderItemToPath = async (item: ActionPlaylistItem, outPath: string) => {
          const tag = item.tagEvent;
          const hasDrawings = includeDrawings && tag.drawings && tag.drawings.length > 0;
          const hasVoice = Boolean(tag.voiceoverAudioBase64);
          const freezeSec = tag.freezeTimestamp ?? (tag.startTime + tag.endTime) / 2;

          if (hasDrawings || hasVoice) {
            const overlayBase64 = hasDrawings
              ? renderDrawingsToDataUrl(tag.drawings || [], renderW, renderH, freezeSec)
              : null;
            await invoke<string>('burn_telestration_clip_ffmpeg', {
              inputPath: projectStore.videoFilePath,
              outputPath: outPath,
              startSec: tag.startTime,
              durationSec: tag.endTime - tag.startTime,
              freezeSec,
              pauseDuration: tag.pauseDuration || item.pauseDuration || 3.0,
              overlayBase64,
              voiceoverBase64: tag.voiceoverAudioBase64 || null,
              targetHeight,
            });
          } else {
            await invoke<string>('render_video_clip_ffmpeg', {
              inputPath: projectStore.videoFilePath,
              outputPath: outPath,
              startSec: tag.startTime,
              durationSec: tag.endTime - tag.startTime,
              fastCopy: exportMode !== 'merged_video',
              targetHeight,
            });
          }
        };

        if (exportMode === 'merged_video') {
          const finalPath = await save({
            title: 'Simpan Video Kompilasi Playlist',
            defaultPath: `FutsalTag_Pro_Playlist_${Date.now()}.mp4`,
            filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
          });
          if (!finalPath) {
            isExporting = false;
            exportProgress = 0;
            return;
          }

          const tempDir = await invoke<string>('get_temp_dir');
          const sep = tempDir.endsWith('/') || tempDir.endsWith('\\') ? '' : '/';
          const renderedClips: string[] = [];

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            exportStatusMessage = `Merender klip ${i + 1}/${items.length}: ${item.title}...`;
            const tempClipPath = `${tempDir}${sep}futsaltag_pl_${i}_${Date.now()}.mp4`;
            await renderItemToPath(item, tempClipPath);
            renderedClips.push(tempClipPath);
            exportProgress = 15 + Math.floor(((i + 1) / items.length) * 70);
          }

          exportStatusMessage = 'Menggabungkan seluruh klip menjadi 1 video presentasi...';
          await invoke<string>('concat_playlist_ffmpeg', {
            clipPaths: renderedClips,
            outputPath: finalPath,
            cleanupInputs: true,
          });

          exportProgress = 100;
          exportStatusMessage = `Selesai! Kompilasi video tersimpan di: ${finalPath}`;
          exportSuccessPath = finalPath;
        } else {
          // separate_clips OR grouped_folders
          const targetDir = await open({
            title:
              exportMode === 'grouped_folders'
                ? 'Pilih Folder Utama (Subfolder Kategori Otomatis)'
                : 'Pilih Folder Tujuan Klip Terpisah',
            directory: true,
            multiple: false,
          });
          if (!targetDir || typeof targetDir !== 'string') {
            isExporting = false;
            exportProgress = 0;
            return;
          }

          const sep = targetDir.endsWith('/') || targetDir.endsWith('\\') ? '' : '/';
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const safeCat = item.tagEvent.category.replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeTitle = item.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
            const idxStr = String(i + 1).padStart(2, '0');
            let outPath: string;
            if (exportMode === 'grouped_folders') {
              const subDir = `${targetDir}${sep}${safeCat}`;
              await invoke('ensure_dir', { path: subDir });
              outPath = `${subDir}${sep}${idxStr}_${safeTitle}.mp4`;
            } else {
              outPath = `${targetDir}${sep}${idxStr}_${safeCat}_${safeTitle}.mp4`;
            }

            exportStatusMessage = `Merender klip ${i + 1}/${items.length}: ${item.title}...`;
            await renderItemToPath(item, outPath);
            exportProgress = 10 + Math.floor(((i + 1) / items.length) * 90);
          }

          exportProgress = 100;
          exportStatusMessage = `Selesai! ${items.length} klip tersimpan di folder: ${targetDir}`;
          exportSuccessPath = targetDir;
        }
      } else {
        // Browser-only demo preview mode
        for (let p = 20; p <= 100; p += 20) {
          await new Promise((r) => setTimeout(r, 250));
          exportProgress = p;
          if (p === 40) exportStatusMessage = 'Simulasi Web: menyiapkan preview...';
          if (p === 80) exportStatusMessage = 'Gunakan aplikasi desktop Tauri untuk render MP4 FFmpeg asli.';
        }
        exportStatusMessage = 'Mode Web Demo selesai (render MP4 nyata hanya aktif di Tauri Desktop).';
        exportSuccessPath = `Web_Preview_${exportMode}`;
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
    link.setAttribute('download', `FutsalTag_Pro_Statistik_${Date.now()}.csv`);
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
                role="button"
                tabindex="0"
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') playPresentationItem(idx); }}
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
    background: radial-gradient(circle at 50% 0%, #0c1c38 0%, #060b14 100%);
    color: #f0f6fc;
    overflow: hidden;
  }

  /* HEADER (DEEP SAPPHIRE) */
  .hub-header {
    min-height: 50px;
    height: auto;
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border-bottom: 1px solid #1a355d;
    box-shadow: 0 4px 16px rgba(2, 6, 23, 0.7);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    gap: 10px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .btn-back {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-back:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: #163666;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .header-title-wrap {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .hub-main-title {
    font-size: 13px;
    font-weight: 700;
    color: #f0f6fc;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hub-sub-title {
    font-size: 10px;
    color: #38bdf8;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-csv {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0d233a;
    border: 1px solid #1e4570;
    color: #38bdf8;
    padding: 5px 11px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-csv:hover {
    background-color: #123456;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  }

  .btn-primary-export {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
    transition: all 0.2s ease;
  }

  .btn-primary-export:hover:not(:disabled) {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 6px 20px rgba(2, 132, 199, 0.5);
  }

  .btn-primary-export:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* GRID */
  .hub-grid {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(350px, 410px);
    gap: 14px;
    padding: 14px;
    overflow: hidden;
    box-sizing: border-box;
  }

  /* PLAYLIST COLUMN */
  .playlist-column {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    overflow: hidden;
  }

  .presentation-player-card {
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .card-bar {
    padding: 10px 14px;
    background: linear-gradient(180deg, #0d1e38 0%, #0a172a 100%);
    border-bottom: 1px solid #1a355d;
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
    background-color: #0f2d4a;
    color: #38bdf8;
    border: 1px solid #0284c7;
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
    color: #64748b;
  }

  .mock-pres-screen p {
    font-size: 13px;
    color: #93c5fd;
    margin: 8px 0 4px 0;
  }

  .mock-pres-screen span {
    font-size: 10px;
  }

  .pres-controls {
    padding: 8px 14px;
    background-color: #0a1628;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid #1a355d;
  }

  .btn-pres-play {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(2, 132, 199, 0.3);
    transition: all 0.15s ease;
  }

  .btn-pres-play:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }

  .pres-counter {
    font-size: 11px;
    color: #93c5fd;
    font-family: monospace;
  }

  /* PLAYLIST ITEMS CARD */
  .playlist-items-card {
    flex: 1;
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
    color: #f0f6fc;
  }

  .drag-hint {
    font-size: 10px;
    color: #7dd3fc;
    opacity: 0.8;
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
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .playlist-item-row:hover {
    background-color: #132a4e;
    border-color: #2563eb;
    transform: translateX(2px);
  }

  .playlist-item-row.active-row {
    border-color: #38bdf8;
    background: linear-gradient(90deg, #102e5c, #0d1e38);
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.2);
  }

  .item-order-box {
    width: 22px;
    height: 22px;
    background-color: #060b14;
    color: #38bdf8;
    font-size: 10px;
    font-weight: 800;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #1a355d;
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
    color: #f0f6fc;
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
    background-color: #060b14;
    color: #93c5fd;
    border: 1px solid #1a355d;
    padding: 1px 5px;
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
    background-color: #060b14;
    border: 1px solid #1a355d;
    color: #94a3b8;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-order:hover:not(:disabled) {
    color: #38bdf8;
    border-color: #38bdf8;
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
    transition: color 0.15s ease;
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
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mode-option:hover {
    border-color: #2563eb;
    background-color: #122849;
  }

  .mode-option.selected {
    border-color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.12);
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.15);
  }

  .mode-option input {
    margin-top: 3px;
    accent-color: #38bdf8;
  }

  .mode-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-title {
    font-size: 12px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .mode-desc {
    font-size: 10px;
    line-height: 1.4;
    color: #94a3b8;
  }

  .options-checklist {
    background-color: #0a1628;
    border: 1px solid #1a355d;
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
    color: #f0f6fc;
    cursor: pointer;
  }

  .check-label input {
    accent-color: #38bdf8;
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
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    color: #94a3b8;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-res.active {
    background-color: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
  }

  /* PROGRESS */
  .progress-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .progress-bar-bg {
    height: 6px;
    background-color: #060b14;
    border: 1px solid #1a355d;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #0284c7, #38bdf8);
    transition: width 0.3s;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
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
    border: 1px solid #38bdf8;
    padding: 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 4px 18px rgba(2, 132, 199, 0.35);
  }

  .btn-render-action:hover:not(:disabled) {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(2, 132, 199, 0.5);
  }

  .btn-render-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
