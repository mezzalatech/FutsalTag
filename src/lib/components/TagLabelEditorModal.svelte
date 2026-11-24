<script lang="ts">
  import type {
    VideoTagEvent,
    TagCategory,
    TagOutcome,
    CourtZone,
    TagRating,
    TagDescriptor,
    Point2D,
  } from "$lib/types";
  import { projectStore } from "$lib/stores/projectStore.svelte";
  import {
    X,
    User,
    Tag,
    Clock,
    FileText,
    Star,
    Check,
    Trash2,
    Plus,
    Sliders,
    Sparkles,
    Shield,
    Crosshair,
    Layers,
    MapPin,
    Share2,
    RotateCcw,
  } from "lucide-svelte";

  interface Props {
    tag: VideoTagEvent;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedTag: VideoTagEvent) => void;
    onDelete?: (tagId: string) => void;
  }

  let { tag, isOpen, onClose, onSave, onDelete }: Props = $props();

  // Local draft state
  let draftTitle = $state("");
  let draftCategory = $state<TagCategory>("Goal");
  let draftBoardButtonId = $state<string | undefined>(undefined);
  let draftStartTime = $state(0);
  let draftEndTime = $state(0);
  let draftColor = $state("#10b981");
  let draftPlayerLabel = $state<string>("#9 Pivot");
  let draftPlayersInvolved = $state<string[]>(["#9 Pivot"]);
  let draftLabels = $state<TagDescriptor[]>([]);
  let draftPassTargetPlayer = $state<string>("");
  let draftOutcomeLabel = $state<TagOutcome>("Gol / Sukses");
  let draftZoneLabel = $state<CourtZone>("Area Penalti Lawan");
  let draftCourtCoord = $state<Point2D | undefined>(undefined);
  let draftRating = $state<TagRating>("⭐⭐⭐ Bagus");
  let draftNotes = $state("");
  let draftPauseDuration = $state(3.0);
  let newPlayerInput = $state("");
  let newLabelInput = $state("");

  const rosterList = $derived(
    projectStore.roster.map((p) => projectStore.getPlayerDisplayLabel(p))
  );

  const boardDescriptors = $derived(
    projectStore.activeBoard.buttons.filter((b) => b.kind === "descriptor")
  );

  const boardCategories = $derived.by(() => {
    const out = projectStore.activeBoard.buttons
      .filter((b) => b.kind === "category")
      .map((btn) => ({
        id: btn.id,
        cat: btn.name as TagCategory,
        label: btn.name,
        color: btn.color,
        continuous: btn.continuous,
        hotkey: btn.hotkey,
      }));
    const hasCurrent = out.some(
      (c) => c.cat.toLowerCase() === String(draftCategory || "").toLowerCase()
    );
    if (draftCategory && !hasCurrent) {
      out.push({
        id: draftBoardButtonId || String(draftCategory),
        cat: draftCategory,
        label: String(draftCategory),
        color: draftColor || "#0284c7",
        continuous: false,
        hotkey: null,
      });
    }
    return out;
  });

  const selectedCatButtonId = $derived(
    draftBoardButtonId ||
      boardCategories.find(
        (c) => c.cat.toLowerCase() === String(draftCategory || "").toLowerCase()
      )?.id ||
      null
  );

  const OUTCOMES: TagOutcome[] = [
    "Gol / Sukses",
    "Terblok / Diselamatkan",
    "Keluar / Gagal",
    "Turnover",
  ];

  const ZONES: CourtZone[] = [
    "Area Penalti Lawan",
    "Flank Kiri",
    "Flank Kanan",
    "Area Tengah",
    "Area Bertahan Sendiri",
  ];

  const RATINGS: TagRating[] = [
    "⭐⭐⭐ Bagus",
    "⚠️ Evaluasi",
    "❌ Kesalahan Fatal",
  ];

  // Sync draft when tag prop changes
  $effect(() => {
    if (tag) {
      draftTitle = tag.title;
      draftCategory = tag.category;
      draftBoardButtonId = tag.boardButtonId;
      draftStartTime = tag.startTime;
      draftEndTime = tag.endTime;
      draftColor = tag.color;
      const initialPlayers =
        tag.playersInvolved && tag.playersInvolved.length > 0
          ? Array.from(new Set(tag.playersInvolved.map((p) => projectStore.normalizePlayerLabel(p))))
          : [projectStore.normalizePlayerLabel(tag.playerLabel || "#9 Pivot")];
      draftPlayersInvolved = initialPlayers;
      draftPlayerLabel = initialPlayers[0] || "#9 Pivot";
      draftLabels = tag.labels ? tag.labels.map((l) => ({ ...l })) : [];
      draftPassTargetPlayer = tag.passTargetPlayer || "";
      draftOutcomeLabel = tag.outcomeLabel || "Gol / Sukses";
      draftZoneLabel = tag.zoneLabel || "Area Penalti Lawan";
      draftCourtCoord = tag.courtCoord ? { ...tag.courtCoord } : undefined;
      draftRating = tag.rating || "⭐⭐⭐ Bagus";
      draftNotes = tag.notes || "";
      draftPauseDuration = tag.pauseDuration || 3.0;
    }
  });

  function toggleDraftPlayer(player: string) {
    if (draftPlayersInvolved.includes(player)) {
      if (draftPlayersInvolved.length > 1) {
        draftPlayersInvolved = draftPlayersInvolved.filter((p) => p !== player);
      }
    } else {
      draftPlayersInvolved = [...draftPlayersInvolved, player];
    }
    draftPlayerLabel = draftPlayersInvolved[0] || player;
  }

  function toggleDraftLabel(id: string, name: string, color?: string, group?: string | null) {
    if (draftLabels.some((l) => l.id === id || l.name.toLowerCase() === name.toLowerCase())) {
      draftLabels = draftLabels.filter(
        (l) => l.id !== id && l.name.toLowerCase() !== name.toLowerCase()
      );
    } else {
      const cleaned = group ? draftLabels.filter((l) => l.group !== group) : draftLabels;
      draftLabels = [
        ...cleaned,
        { id, name, color: color || "#38bdf8", group: group ?? null, atTime: draftStartTime },
      ];
    }
  }

  function handleAddCustomLabel() {
    const clean = newLabelInput.trim();
    if (!clean) return;
    toggleDraftLabel(`custom_${Date.now()}`, clean, "#38bdf8", null);
    newLabelInput = "";
  }

  function inferZoneFromCoord(pt: Point2D): CourtZone {
    if (pt.x >= 30) return "Area Penalti Lawan";
    if (pt.x <= 12) return "Area Bertahan Sendiri";
    if (pt.y <= 6.5) return "Flank Kiri";
    if (pt.y >= 13.5) return "Flank Kanan";
    return "Area Tengah";
  }

  function handleMiniCourtClick(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const xM = Math.max(0, Math.min(40, ((e.clientX - rect.left) / rect.width) * 40));
    const yM = Math.max(0, Math.min(20, ((e.clientY - rect.top) / rect.height) * 20));
    draftCourtCoord = { x: Number(xM.toFixed(1)), y: Number(yM.toFixed(1)) };
    draftZoneLabel = inferZoneFromCoord(draftCourtCoord);
  }

  function handleSave() {
    onSave({
      ...tag,
      title: draftTitle,
      category: draftCategory,
      boardButtonId: draftBoardButtonId,
      startTime: Number(draftStartTime.toFixed(2)),
      endTime: Number(draftEndTime.toFixed(2)),
      color: draftColor,
      playerLabel: draftPlayersInvolved[0] || draftPlayerLabel,
      playersInvolved: [...draftPlayersInvolved],
      labels: draftLabels.map((l) => ({ ...l })),
      passTargetPlayer: draftPassTargetPlayer || undefined,
      outcomeLabel: draftOutcomeLabel,
      zoneLabel: draftZoneLabel,
      courtCoord: draftCourtCoord,
      rating: draftRating,
      notes: draftNotes,
      pauseDuration: draftPauseDuration,
    });
    onClose();
  }

  function handleAddPlayer() {
    const added = projectStore.addRosterPlayer(newPlayerInput);
    if (added) {
      if (!draftPlayersInvolved.includes(added)) {
        draftPlayersInvolved = [...draftPlayersInvolved, added];
      }
      draftPlayerLabel = draftPlayersInvolved[0] || added;
      newPlayerInput = "";
    }
  }

  function adjustTime(type: "start" | "end", delta: number) {
    if (type === "start") {
      draftStartTime = Math.max(0, draftStartTime + delta);
      if (draftStartTime >= draftEndTime) draftStartTime = draftEndTime - 0.5;
    } else {
      draftEndTime = Math.max(draftStartTime + 0.5, draftEndTime + delta);
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" onclick={onClose} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="editor-drawer"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <!-- DRAWER HEADER (DEEP SAPPHIRE BLUE) -->
      <header class="drawer-header">
        <div class="header-title-box">
          <div class="icon-chip">
            <Tag size={16} />
          </div>
          <div>
            <h2 class="drawer-title">EDIT KLIP & METADATA TAKTIS</h2>
            <span class="drawer-subtitle"
              >Papan Aktif: {projectStore.activeBoard.name} ({boardCategories.length} Tag · {boardDescriptors.length} Label)</span
            >
          </div>
        </div>

        <button class="btn-close" onclick={onClose} title="Tutup">
          <X size={18} />
        </button>
      </header>

      <!-- DRAWER BODY SCROLL -->
      <div class="drawer-body">
        <!-- 1. ACTION TITLE & CATEGORY -->
        <section class="form-section">
          <label class="section-label">
            <Layers size={13} class="text-sky-400" />
            <span>KATEGORI AKSI & JUDUL KLIP</span>
          </label>

          <input
            type="text"
            bind:value={draftTitle}
            class="input-title-text"
            placeholder="Judul Klip Aksi..."
          />

          <div class="categories-scroll-grid">
            {#each boardCategories as item (item.id + item.label)}
              <button
                type="button"
                class="category-chip"
                class:active={draftCategory === item.cat}
                style="--chip-color: {item.color}"
                onclick={() => {
                  draftCategory = item.cat;
                  draftBoardButtonId = item.id;
                  draftColor = item.color;
                  if (!draftTitle || draftTitle.includes("(")) {
                    draftTitle = `${item.label} (${draftStartTime.toFixed(1)}s - ${draftEndTime.toFixed(1)}s)`;
                  }
                }}
              >
                <span class="chip-dot" style="background-color: {item.color};"></span>
                <span class="chip-label">{item.label}</span>
                {#if item.hotkey}
                  <span class="chip-kbd">{item.hotkey}</span>
                {/if}
              </button>
            {/each}
          </div>
        </section>

        <!-- 2. MULTI-PLAYER ROSTER SELECTION -->
        <section class="form-section">
          <label class="section-label">
            <User size={13} class="text-sky-400" />
            <span>PEMAIN YANG TERLIBAT (MULTI-PEMAIN FUTSAL)</span>
          </label>

          <div class="roster-pills-wrap">
            {#each rosterList as player}
              <button
                type="button"
                class="roster-pill"
                class:active={draftPlayersInvolved.includes(player)}
                onclick={() => toggleDraftPlayer(player)}
              >
                <span class="player-dot"></span>
                <span>{player}</span>
              </button>
            {/each}
          </div>

          <!-- Add custom player -->
          <div class="add-player-row">
            <input
              type="text"
              placeholder="Tambah pemain baru (misal: #14 Pivot Reza)..."
              bind:value={newPlayerInput}
              class="input-new-player"
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddPlayer();
                }
              }}
            />
            <button
              type="button"
              class="btn-add-player"
              onclick={handleAddPlayer}
            >
              <Plus size={14} />
              <span>Tambah</span>
            </button>
          </div>
        </section>

        <!-- 2B. TACTICAL DESCRIPTORS / MULTI-LABELS (MOMEN & ONCE SPORT) -->
        <section class="form-section">
          <label class="section-label">
            <Tag size={13} class="text-amber-400" />
            <span>LABEL TAKTIS / DESCRIPTORS KLIP ({draftLabels.length} aktif)</span>
          </label>
          <div class="labels-chips-wrap">
            {#each boardDescriptors as descBtn (descBtn.id)}
              {@const isActive = draftLabels.some(
                (l) => l.id === descBtn.id || l.name.toLowerCase() === descBtn.name.toLowerCase()
              )}
              {@const isScopedOut = Boolean(
                descBtn.forTags.length > 0 &&
                  selectedCatButtonId &&
                  !descBtn.forTags.includes(selectedCatButtonId)
              )}
              <button
                type="button"
                class="desc-chip-btn"
                class:active={isActive}
                class:dim={isScopedOut}
                onclick={() => toggleDraftLabel(descBtn.id, descBtn.name, descBtn.color, descBtn.group)}
                title={isScopedOut
                  ? `Label ini dihubungkan ke tag: ${descBtn.forTags.join(', ')} (tetap bisa dipaksa aktif bila diklik)`
                  : `Toggle label: ${descBtn.name}`}
              >
                <span class="desc-chip-dot" style="background-color: {descBtn.color};"></span>
                <span>{descBtn.name}</span>
              </button>
            {/each}
            {#each draftLabels.filter((l) => !boardDescriptors.some((b) => b.id === l.id || b.name.toLowerCase() === l.name.toLowerCase())) as extraLbl}
              <button
                type="button"
                class="desc-chip-btn active"
                onclick={() => toggleDraftLabel(extraLbl.id, extraLbl.name, extraLbl.color, extraLbl.group)}
              >
                <span class="desc-chip-dot" style="background-color: {extraLbl.color || '#38bdf8'};"></span>
                <span>{extraLbl.name}</span>
              </button>
            {/each}
          </div>
          <div class="add-player-row">
            <input
              type="text"
              placeholder="Tambah label kustom (misal: CONNECT PIVOT, OVERLAP)..."
              bind:value={newLabelInput}
              class="input-new-player"
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomLabel();
                }
              }}
            />
            <button
              type="button"
              class="btn-add-player"
              onclick={handleAddCustomLabel}
            >
              <Plus size={14} />
              <span>+ Label</span>
            </button>
          </div>
        </section>

        <!-- 3. TACTICAL DESCRIPTORS: OUTCOME & RATING -->
        <div class="form-two-col">
          <!-- OUTCOME -->
          <section class="form-section">
            <label class="section-label">
              <Crosshair size={13} class="text-emerald-400" />
              <span>HASIL AKSI (OUTCOME)</span>
            </label>
            <div class="chips-stack">
              {#each OUTCOMES as outcome}
                <button
                  type="button"
                  class="choice-btn"
                  class:active={draftOutcomeLabel === outcome}
                  onclick={() => (draftOutcomeLabel = outcome)}
                >
                  <span class="radio-disc"></span>
                  <span>{outcome}</span>
                </button>
              {/each}
            </div>
          </section>

          <!-- RATING -->
          <section class="form-section">
            <label class="section-label">
              <Star size={13} class="text-amber-400" />
              <span>KUALITAS / RATING AKSI</span>
            </label>
            <div class="chips-stack">
              {#each RATINGS as rating}
                <button
                  type="button"
                  class="choice-btn"
                  class:active={draftRating === rating}
                  onclick={() => (draftRating = rating)}
                >
                  <span class="radio-disc"></span>
                  <span>{rating}</span>
                </button>
              {/each}
            </div>
          </section>
        </div>

        <!-- 4. COURT ZONE & INTERACTIVE 40m x 20m COORDINATE PICKER -->
        <section class="form-section">
          <div class="section-header-inline">
            <label class="section-label">
              <MapPin size={13} class="text-cyan-400" />
              <span>ZONA & TITIK KOORDINAT LAPANGAN (40m x 20m)</span>
            </label>
            {#if draftCourtCoord}
              <span class="coord-readout">
                ({draftCourtCoord.x.toFixed(1)}m, {draftCourtCoord.y.toFixed(1)}m)
                <button
                  type="button"
                  class="btn-reset-coord"
                  onclick={() => (draftCourtCoord = undefined)}
                  title="Hapus titik koordinat"
                >
                  <RotateCcw size={10} /> Reset
                </button>
              </span>
            {:else}
              <span class="coord-hint">Klik lapangan di bawah untuk pin lokasi nyata Heatmap</span>
            {/if}
          </div>

          <div class="mini-court-picker-wrap">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <svg
              viewBox="0 0 400 200"
              class="mini-court-svg"
              onclick={handleMiniCourtClick}
              role="button"
              tabindex="0"
              aria-label="Pilih koordinat lapangan futsal 40m x 20m"
            >
              <rect x="0" y="0" width="400" height="200" fill="#0a2540" rx="6" />
              <rect x="4" y="4" width="392" height="192" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" />
              <line x1="200" y1="4" x2="200" y2="196" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
              <circle cx="200" cy="100" r="30" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
              <path d="M 4 40 A 60 60 0 0 1 4 160" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
              <path d="M 396 40 A 60 60 0 0 0 396 160" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
              <text x="16" y="18" fill="rgba(255,255,255,0.45)" font-size="9" font-weight="bold">BERTAHAN (0m)</text>
              <text x="305" y="18" fill="rgba(56,189,248,0.7)" font-size="9" font-weight="bold">ARAH SERANG ➔ (40m)</text>
              {#if draftCourtCoord}
                <circle
                  cx={draftCourtCoord.x * 10}
                  cy={draftCourtCoord.y * 10}
                  r="7"
                  fill="#38bdf8"
                  stroke="#ffffff"
                  stroke-width="2"
                />
              {/if}
            </svg>
          </div>

          <div class="zones-grid">
            {#each ZONES as zone}
              <button
                type="button"
                class="zone-btn"
                class:active={draftZoneLabel === zone}
                onclick={() => (draftZoneLabel = zone)}
              >
                <span>{zone}</span>
              </button>
            {/each}
          </div>
        </section>

        <!-- 4B. PASSING TARGET RECEIVER (FOR PASSING NETWORK) -->
        <section class="form-section">
          <label class="section-label">
            <Share2 size={13} class="text-sky-400" />
            <span>PENERIMA OPERAN / TARGET UMPAN (UNTUK PASSING NETWORK)</span>
          </label>
          <select bind:value={draftPassTargetPlayer} class="input-title-text">
            <option value="">— Tidak ada / Aksi Individu —</option>
            {#each rosterList.filter((p) => p !== draftPlayerLabel && p !== 'Tim Lawan') as targetP}
              <option value={targetP}>{targetP}</option>
            {/each}
          </select>
        </section>

        <!-- 5. PRECISE TIMING & DURATION FINE-TUNING (Once Sport EditActionTimeDialog) -->
        <section class="form-section time-tuning-box">
          <label class="section-label">
            <Clock size={13} class="text-sky-400" />
            <span>PENYESUAIAN WAKTU & JEDA FREEZE-FRAME</span>
          </label>

          <div class="timing-controls-grid">
            <!-- Start Time -->
            <div class="time-adjust-card">
              <span class="time-label">Mulai (Start):</span>
              <span class="time-val">{draftStartTime.toFixed(2)}s</span>
              <div class="adjust-btns">
                <button
                  type="button"
                  class="btn-micro"
                  onclick={() => adjustTime("start", -0.5)}>-0.5s</button
                >
                <button
                  type="button"
                  class="btn-micro"
                  onclick={() => adjustTime("start", 0.5)}>+0.5s</button
                >
              </div>
            </div>

            <!-- End Time -->
            <div class="time-adjust-card">
              <span class="time-label">Selesai (End):</span>
              <span class="time-val">{draftEndTime.toFixed(2)}s</span>
              <div class="adjust-btns">
                <button
                  type="button"
                  class="btn-micro"
                  onclick={() => adjustTime("end", -0.5)}>-0.5s</button
                >
                <button
                  type="button"
                  class="btn-micro"
                  onclick={() => adjustTime("end", 0.5)}>+0.5s</button
                >
              </div>
            </div>

            <!-- Total Duration -->
            <div class="time-adjust-card card-total">
              <span class="time-label">Total Durasi Klip:</span>
              <span class="time-val text-sky-400"
                >{(draftEndTime - draftStartTime).toFixed(1)}s</span
              >
              <span class="sub-hint">Auto Pre/Post Roll</span>
            </div>
          </div>

          <!-- Freeze Pause Duration Slider -->
          <div class="freeze-slider-row">
            <span class="freeze-title"
              >Jeda Freeze-Frame saat Presentasi / Gambar:</span
            >
            <input
              type="range"
              min="1"
              max="8"
              step="0.5"
              bind:value={draftPauseDuration}
              class="blue-slider"
            />
            <span class="freeze-val">{draftPauseDuration.toFixed(1)} Detik</span
            >
          </div>
        </section>

        <!-- 6. COACH TACTICAL NOTES -->
        <section class="form-section">
          <label class="section-label">
            <FileText size={13} class="text-sky-400" />
            <span>CATATAN TAKTIK PELATIH (COACH NOTES)</span>
          </label>
          <textarea
            bind:value={draftNotes}
            rows="3"
            class="textarea-notes"
            placeholder="Tuliskan catatan taktis untuk pemain (misal: 'Anchor terlambat menggeser posisi saat transisi lawan...')."
          ></textarea>
        </section>
      </div>

      <!-- DRAWER FOOTER (SAPPHIRE ACTIONS) -->
      <footer class="drawer-footer">
        {#if onDelete}
          <button
            type="button"
            class="btn-delete"
            onclick={() => {
              if (confirm("Yakin ingin menghapus klip ini?")) {
                onDelete(tag.id);
                onClose();
              }
            }}
          >
            <Trash2 size={14} />
            <span>Hapus Klip</span>
          </button>
        {/if}

        <div class="footer-right-btns">
          <button type="button" class="btn-cancel" onclick={onClose}>
            Batal
          </button>
          <button type="button" class="btn-save-tag" onclick={handleSave}>
            <Check size={16} />
            <span>Simpan Tag & Label</span>
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* MODAL BACKDROP */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(3, 7, 18, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  /* DRAWER CARD (DEEP BLUE THEME) */
  .editor-drawer {
    width: 760px;
    max-width: 95vw;
    max-height: 92vh;
    background: radial-gradient(circle at 50% 0%, #0f2444 0%, #08101d 100%);
    border: 1px solid #1e3b68;
    border-radius: 14px;
    box-shadow:
      0 25px 50px -12px rgba(2, 6, 23, 0.9),
      0 0 24px rgba(14, 165, 233, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* HEADER */
  .drawer-header {
    padding: 16px 20px;
    background: linear-gradient(180deg, #102548 0%, #0c1a33 100%);
    border-bottom: 1px solid #1e3b68;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .header-title-box {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon-chip {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
  }

  .drawer-title {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #38bdf8;
    margin: 0;
  }

  .drawer-subtitle {
    font-size: 10px;
    color: #94a3b8;
  }

  .btn-close {
    background: transparent;
    border: 1px solid #1e3b68;
    color: #94a3b8;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .btn-close:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.1);
  }

  /* BODY */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #93c5fd;
  }

  .input-title-text {
    background-color: #0c1a33;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 6px;
    transition: border-color 0.2s;
  }

  .input-title-text:focus {
    outline: none;
    border-color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
  }

  /* CATEGORIES GRID */
  .categories-scroll-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .category-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0d1e38;
    border: 1px solid #1e3b68;
    border-left: 3px solid var(--chip-color);
    padding: 6px 8px;
    border-radius: 6px;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .category-chip:hover {
    background-color: #142a4d;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .category-chip.active {
    background: linear-gradient(
      135deg,
      rgba(2, 132, 199, 0.3),
      rgba(37, 99, 235, 0.4)
    );
    border-color: #38bdf8;
    color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  }

  .chip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chip-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-kbd {
    font-family: monospace;
    font-size: 9px;
    font-weight: 800;
    color: #93c5fd;
    background: #060b14;
    border: 1px solid #1e3b68;
    border-radius: 3px;
    padding: 0 4px;
    flex-shrink: 0;
  }

  /* ROSTER */
  .roster-pills-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .roster-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0d1e38;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .roster-pill:hover {
    background-color: #142a4d;
    border-color: #38bdf8;
  }

  .roster-pill.active {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
  }

  .player-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #38bdf8;
  }

  .roster-pill.active .player-dot {
    background-color: #ffffff;
  }

  .labels-chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    max-height: 112px;
    overflow-y: auto;
    padding: 4px;
    background: #081222;
    border: 1px solid #1a355d;
    border-radius: 6px;
  }

  .desc-chip-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0d1e38;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s;
  }

  .desc-chip-btn:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .desc-chip-btn.active {
    background: rgba(56, 189, 248, 0.22);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .desc-chip-btn.dim {
    opacity: 0.35;
  }

  .desc-chip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .add-player-row {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .input-new-player {
    flex: 1;
    background-color: #0c1a33;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    font-size: 11px;
    padding: 6px 10px;
    border-radius: 6px;
  }

  .input-new-player:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .btn-add-player {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #142a4d;
    border: 1px solid #1e3b68;
    color: #38bdf8;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-add-player:hover {
    background-color: #1c3b6b;
    border-color: #38bdf8;
  }

  /* TWO COL */
  .form-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .chips-stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .choice-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #0d1e38;
    border: 1px solid #1e3b68;
    padding: 7px 10px;
    border-radius: 6px;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .choice-btn:hover {
    background-color: #142a4d;
    color: #ffffff;
  }

  .choice-btn.active {
    background: linear-gradient(
      135deg,
      rgba(2, 132, 199, 0.25),
      rgba(37, 99, 235, 0.35)
    );
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .radio-disc {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid #64748b;
  }

  .choice-btn.active .radio-disc {
    border-color: #38bdf8;
    background-color: #38bdf8;
  }

  /* MINI COURT PICKER */
  .section-header-inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .coord-readout {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: monospace;
    font-size: 10px;
    font-weight: 700;
    color: #38bdf8;
  }

  .coord-hint {
    font-size: 10px;
    color: #64748b;
  }

  .btn-reset-coord {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #142a4d;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    cursor: pointer;
  }

  .mini-court-picker-wrap {
    background: #06101f;
    border: 1px solid #1e3b68;
    border-radius: 8px;
    padding: 6px;
  }

  .mini-court-svg {
    width: 100%;
    max-height: 145px;
    display: block;
    cursor: crosshair;
  }

  /* ZONES */
  .zones-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .zone-btn {
    background-color: #0d1e38;
    border: 1px solid #1e3b68;
    padding: 7px 8px;
    border-radius: 6px;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .zone-btn:hover {
    background-color: #142a4d;
    color: #ffffff;
  }

  .zone-btn.active {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border-color: #38bdf8;
  }

  /* TIMING BOX */
  .time-tuning-box {
    background-color: #0a172c;
    border: 1px solid #1e3b68;
    padding: 14px;
    border-radius: 8px;
  }

  .timing-controls-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }

  .time-adjust-card {
    background-color: #0e203c;
    border: 1px solid #1b355d;
    padding: 8px 10px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .time-label {
    font-size: 9px;
    color: #94a3b8;
    font-weight: 700;
  }

  .time-val {
    font-family: monospace;
    font-size: 14px;
    font-weight: 800;
    color: #38bdf8;
  }

  .adjust-btns {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }

  .btn-micro {
    background-color: #142a4d;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-micro:hover {
    background-color: #1e3b68;
    color: #ffffff;
  }

  .card-total {
    justify-content: center;
  }

  .sub-hint {
    font-size: 9px;
    color: #64748b;
  }

  .freeze-slider-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background-color: #0e203c;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #1b355d;
  }

  .freeze-title {
    font-size: 11px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .blue-slider {
    flex: 1;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .freeze-val {
    font-family: monospace;
    font-size: 12px;
    font-weight: 800;
    color: #38bdf8;
    min-width: 60px;
  }

  /* TEXTAREA */
  .textarea-notes {
    background-color: #0c1a33;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    font-size: 11px;
    line-height: 1.5;
    padding: 8px 12px;
    border-radius: 6px;
    resize: vertical;
    font-family: inherit;
  }

  .textarea-notes:focus {
    outline: none;
    border-color: #38bdf8;
  }

  /* FOOTER */
  .drawer-footer {
    padding: 14px 20px;
    background-color: #0c1a33;
    border-top: 1px solid #1e3b68;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .btn-delete {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid #7f1d1d;
    color: #ef4444;
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-delete:hover {
    background-color: rgba(239, 68, 68, 0.15);
  }

  .footer-right-btns {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
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
    border-color: #38bdf8;
  }

  .btn-save-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.3);
    transition: all 0.2s;
  }

  .btn-save-tag:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    transform: translateY(-1px);
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.5);
  }
</style>
