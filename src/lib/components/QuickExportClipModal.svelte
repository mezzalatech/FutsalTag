<script lang="ts">
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { VideoTagEvent } from '$lib/types';
  import { getEffectiveFreezeStopsForTag } from '$lib/export/freezeStops';
  import {
    estimateExportSizeMb,
    formatEstimatedSize,
    type ExportAspectRatio,
    type ExportCrfPreset,
  } from '$lib/export/exportEstimator';
  import { Download, X, Sparkles, Smartphone, Monitor } from 'lucide-svelte';

  interface Props {
    clip: VideoTagEvent | null;
    isExporting: boolean;
    onClose: () => void;
    onConfirmExport: (opts: {
      resolution: '1080p' | '720p';
      crf: ExportCrfPreset;
      aspectRatio: ExportAspectRatio;
      includeTelestration: boolean;
    }) => void;
  }

  let { clip, isExporting, onClose, onConfirmExport }: Props = $props();

  let resolution = $state<'1080p' | '720p'>('720p');
  let crf = $state<ExportCrfPreset>(23);
  let aspectRatio = $state<ExportAspectRatio>('16:9');
  let includeTelestration = $state<boolean>(true);

  $effect(() => {
    if (clip) {
      includeTelestration = projectStore.tagHasTelestration(clip);
    }
  });

  const baseDurationSec = $derived(
    clip ? Math.max(0.4, clip.endTime - clip.startTime) : 0
  );
  const freezeExtraSec = $derived.by(() => {
    if (!clip || !includeTelestration) return 0;
    const stops = getEffectiveFreezeStopsForTag(clip);
    const stopSum = stops.reduce((s, x) => s + x.duration, 0);
    return stopSum + (clip.appendCleanReplay ? baseDurationSec : 0);
  });
  const totalOutputSec = $derived(baseDurationSec + freezeExtraSec);
  const estimatedSize = $derived(
    formatEstimatedSize(estimateExportSizeMb(totalOutputSec, resolution, crf, aspectRatio))
  );
</script>

{#if clip}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="qe-backdrop" role="presentation" onclick={onClose}>
    <div class="qe-card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <header class="qe-hdr">
        <div class="qe-title-wrap">
          <Download size={16} class="text-sky-400" />
          <h3>Ekspor Cepat MP4 Klip</h3>
        </div>
        <button type="button" class="qe-close" onclick={onClose} aria-label="Tutup">
          <X size={16} />
        </button>
      </header>

      <div class="qe-clip-summary">
        <span class="qe-cat" style="background-color: {clip.color};">{clip.category}</span>
        <strong class="qe-clip-name">{clip.title}</strong>
        <span class="qe-clip-meta">
          {clip.playerLabel || 'Tim'} · {totalOutputSec.toFixed(1)}s
        </span>
      </div>

      <div class="qe-section">
        <span class="qe-lbl">Rasio & Platform</span>
        <div class="qe-pills">
          <button
            type="button"
            class="qe-pill"
            class:active={aspectRatio === '16:9'}
            onclick={() => (aspectRatio = '16:9')}
          >
            <Monitor size={13} />
            <span>16:9 Landscape</span>
          </button>
          <button
            type="button"
            class="qe-pill"
            class:active={aspectRatio === '9:16'}
            onclick={() => (aspectRatio = '9:16')}
          >
            <Smartphone size={13} />
            <span>9:16 Vertikal (Reels / Shorts)</span>
          </button>
        </div>
      </div>

      <div class="qe-grid-2">
        <div class="qe-section">
          <span class="qe-lbl">Resolusi</span>
          <div class="qe-pills">
            <button
              type="button"
              class="qe-pill"
              class:active={resolution === '1080p'}
              onclick={() => (resolution = '1080p')}
            >
              1080p Full HD
            </button>
            <button
              type="button"
              class="qe-pill"
              class:active={resolution === '720p'}
              onclick={() => (resolution = '720p')}
            >
              720p HD
            </button>
          </div>
        </div>

        <div class="qe-section">
          <span class="qe-lbl">Kualitas (CRF)</span>
          <div class="qe-pills">
            <button type="button" class="qe-pill" class:active={crf === 18} onclick={() => (crf = 18)}>
              Tinggi (18)
            </button>
            <button type="button" class="qe-pill" class:active={crf === 23} onclick={() => (crf = 23)}>
              Standar (23)
            </button>
            <button type="button" class="qe-pill" class:active={crf === 28} onclick={() => (crf = 28)}>
              Ringan WA (28)
            </button>
          </div>
        </div>
      </div>

      <label class="qe-tel-check">
        <input type="checkbox" bind:checked={includeTelestration} />
        <Sparkles size={13} class="text-sky-400" />
        <span>Sertakan Anotasi Telestrasi, Freeze & Voiceover</span>
      </label>

      <div class="qe-estimate-bar">
        <span>Estimasi Ukuran File:</span>
        <strong>{estimatedSize}</strong>
      </div>

      <footer class="qe-footer">
        <button type="button" class="qe-btn" onclick={onClose} disabled={isExporting}>Batal</button>
        <button
          type="button"
          class="qe-btn primary"
          disabled={isExporting}
          onclick={() =>
            onConfirmExport({
              resolution,
              crf,
              aspectRatio,
              includeTelestration,
            })}
        >
          <Download size={14} />
          <span>{isExporting ? 'Mengekspor...' : 'Simpan MP4'}</span>
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .qe-backdrop {
    position: fixed;
    inset: 0;
    z-index: 350;
    background: rgba(2, 6, 23, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .qe-card {
    width: 100%;
    max-width: 470px;
    background: #0a1426;
    border: 1px solid #1e3b68;
    border-radius: 12px;
    padding: 16px 18px;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.75);
  }

  .qe-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .qe-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .qe-title-wrap h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
  }

  .qe-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 3px;
  }

  .qe-clip-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    background: #060b14;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 8px 10px;
  }

  .qe-cat {
    font-size: 10px;
    font-weight: 800;
    color: #ffffff;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .qe-clip-name {
    font-size: 12px;
    flex: 1;
    min-width: 120px;
  }

  .qe-clip-meta {
    font-size: 11px;
    color: #94a3b8;
  }

  .qe-grid-2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .qe-section {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .qe-lbl {
    font-size: 10.5px;
    font-weight: 700;
    color: #94a3b8;
  }

  .qe-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .qe-pill {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: #0f172a;
    border: 1px solid #243b61;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 7px;
    cursor: pointer;
    white-space: nowrap;
  }

  .qe-pill.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .qe-tel-check {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    color: #cbd5e1;
    cursor: pointer;
  }

  .qe-estimate-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(14, 165, 233, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 11.5px;
    color: #bae6fd;
  }

  .qe-estimate-bar strong {
    font-size: 13px;
    color: #38bdf8;
  }

  .qe-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .qe-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 7px;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .qe-btn.primary {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border-color: #38bdf8;
    color: #ffffff;
  }
</style>
