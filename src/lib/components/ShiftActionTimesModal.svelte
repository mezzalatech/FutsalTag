<script lang="ts">
  import { projectStore } from "$lib/stores/projectStore.svelte";
  import { X, Clock, CheckCircle } from "lucide-svelte";

  interface Props {
    isOpen: boolean;
    playheadTime: number;
    onClose: () => void;
    onApplied?: (shiftedCount: number, deltaSec: number) => void;
  }

  let { isOpen, playheadTime, onClose, onApplied }: Props = $props();

  let deltaSec = $state(0);
  let scope = $state<"all" | "from_playhead">("all");
  let includeClockAndSubs = $state(true);

  const PRESETS = [-5, -2, -1, -0.5, 0.5, 1, 2, 5];

  const affectedTags = $derived(
    scope === "all"
      ? projectStore.tags
      : projectStore.tags.filter((t) => t.startTime >= playheadTime - 0.001),
  );

  const sampleTag = $derived(affectedTags[0] ?? null);

  function fmt(sec: number): string {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = (s % 60).toFixed(1).padStart(4, "0");
    return `${String(m).padStart(2, "0")}:${r}`;
  }

  function applyShift() {
    if (!Number.isFinite(deltaSec) || Math.abs(deltaSec) < 0.001) return;
    const n = projectStore.shiftAllActionTimes(
      deltaSec,
      scope,
      playheadTime,
      includeClockAndSubs,
    );
    onApplied?.(n, deltaSec);
    onClose();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="st-backdrop" role="presentation" onclick={onClose}>
    <div class="st-card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="st-hdr">
        <div class="st-title">
          <Clock size={15} class="text-sky-400" />
          <h3>Geser Waktu Semua Tag (Shift Action Times)</h3>
        </div>
        <button type="button" class="st-close" onclick={onClose} title="Tutup">
          <X size={16} />
        </button>
      </div>

      <p class="st-desc">
        Cocokkan timestamp hasil <strong>Live Stopwatch</strong> atau kamera berbeda saat video rekaman memiliki awalan lebih cepat/lambat beberapa detik. Dapat di-undo via <strong>Ctrl+Z</strong>.
      </p>

      <div class="st-presets">
        {#each PRESETS as p}
          <button
            type="button"
            class="st-preset-btn"
            onclick={() => (deltaSec = Number((deltaSec + p).toFixed(2)))}
          >
            {p > 0 ? `+${p}` : p}s
          </button>
        {/each}
      </div>

      <label class="st-field">
        <span>Pergeseran Waktu (detik, negatif = mundur / positif = maju)</span>
        <input type="number" step="0.1" class="st-input" bind:value={deltaSec} />
      </label>

      <div class="st-scope-row">
        <button
          type="button"
          class="st-seg"
          class:active={scope === "all"}
          onclick={() => (scope = "all")}
        >
          Semua Klip ({projectStore.tags.length})
        </button>
        <button
          type="button"
          class="st-seg"
          class:active={scope === "from_playhead"}
          onclick={() => (scope = "from_playhead")}
        >
          Dari Playhead {fmt(playheadTime)} ({projectStore.tags.filter((t) => t.startTime >= playheadTime - 0.001).length})
        </button>
      </div>

      <label class="st-check">
        <input type="checkbox" bind:checked={includeClockAndSubs} />
        <span>Ikut geser tanda Kick-Off Babak &amp; Pergantian Pemain</span>
      </label>

      {#if sampleTag}
        <div class="st-preview">
          Pratinjau <strong>{sampleTag.title}</strong>:
          <code>{fmt(sampleTag.startTime)}</code> → <code>{fmt(Math.max(0, sampleTag.startTime + deltaSec))}</code>
        </div>
      {/if}

      <div class="st-actions">
        <button type="button" class="st-btn" onclick={onClose}>Batal</button>
        <button
          type="button"
          class="st-btn primary"
          disabled={affectedTags.length === 0 || Math.abs(deltaSec) < 0.01}
          onclick={applyShift}
        >
          <CheckCircle size={13} />
          <span>Terapkan ke {affectedTags.length} Klip</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .st-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 220;
    padding: 16px;
  }

  .st-card {
    width: 100%;
    max-width: 470px;
    background: #0b1629;
    border: 1px solid #1e3a5f;
    border-radius: 12px;
    padding: 18px;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 11px;
    box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75);
  }

  .st-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .st-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .st-title h3 {
    margin: 0;
    font-size: 14.5px;
    font-weight: 800;
  }

  .st-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  .st-desc {
    margin: 0;
    font-size: 11.5px;
    color: #94a3b8;
    line-height: 1.45;
  }

  .st-presets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .st-preset-btn {
    background: #0f1b33;
    border: 1px solid #243b61;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .st-preset-btn:hover {
    border-color: #38bdf8;
  }

  .st-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11px;
    font-weight: 700;
    color: #cbd5e1;
  }

  .st-input {
    background: #060d19;
    border: 1px solid #243b61;
    border-radius: 7px;
    padding: 8px 10px;
    color: #f8fafc;
    font-family: 'Fira Code', monospace;
    font-size: 14px;
    font-weight: 800;
  }

  .st-scope-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .st-seg {
    background: #071020;
    border: 1px solid #1e3354;
    color: #94a3b8;
    border-radius: 7px;
    padding: 7px 8px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .st-seg.active {
    background: rgba(14, 165, 233, 0.16);
    border-color: #38bdf8;
    color: #f8fafc;
  }

  .st-check {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    color: #cbd5e1;
    cursor: pointer;
  }

  .st-preview {
    background: #071020;
    border: 1px solid #1a2e4d;
    border-radius: 7px;
    padding: 8px 10px;
    font-size: 11px;
    color: #bae6fd;
  }

  .st-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .st-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #0f172a;
    border: 1px solid #334155;
    color: #cbd5e1;
    border-radius: 7px;
    padding: 7px 12px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .st-btn.primary {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .st-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
