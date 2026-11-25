<script lang="ts">
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type {
    ClubPlayerProfile,
    ClubProfile,
    DominantFoot,
    FutsalPositionRole,
  } from '$lib/types';
  import {
    X,
    Shield,
    Plus,
    Trash2,
    Save,
    CheckCircle2,
    Users,
    UserPlus,
  } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  const ROLES: FutsalPositionRole[] = ['GK', 'Anchor', 'Flank', 'Pivot', 'Universal'];
  const FEET: DominantFoot[] = ['Kanan', 'Kiri', 'Keduanya'];
  const JERSEY_SWATCHES = ['#0284c7', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#1e293b'];

  let selectedClubId = $state<string>('');
  let draftClub = $state<ClubProfile | null>(null);
  let statusNotice = $state<string | null>(null);
  let isSaving = $state(false);

  // New player quick inputs
  let newNum = $state('#12');
  let newName = $state('');
  let newRole = $state<FutsalPositionRole>('Flank');
  let newFoot = $state<DominantFoot>('Kanan');

  $effect(() => {
    if (!isOpen) return;
    if (!projectStore.clubLibraryLoaded) {
      projectStore.loadClubLibrary().then(() => {
        ensureSelection();
      });
    } else {
      ensureSelection();
    }
  });

  function ensureSelection() {
    if (projectStore.clubLibrary.length === 0) return;
    const found =
      projectStore.clubLibrary.find((c) => c.id === selectedClubId) ??
      projectStore.clubLibrary[0];
    selectClub(found);
  }

  function selectClub(club: ClubProfile) {
    selectedClubId = club.id;
    draftClub = {
      ...club,
      players: club.players.map((p) => ({ ...p })),
    };
  }

  function createNewClub() {
    const fresh: ClubProfile = {
      id: `club-${Date.now()}`,
      name: `Klub Baru ${projectStore.clubLibrary.length + 1}`,
      shortName: 'NEW',
      isOwnTeam: true,
      jerseyColor: '#0284c7',
      gkColor: '#f59e0b',
      updatedAt: new Date().toISOString(),
      players: [
        { id: `cp-${Date.now()}-1`, num: '#1', name: 'Kiper', role: 'GK', dominantFoot: 'Kanan' },
        { id: `cp-${Date.now()}-4`, num: '#4', name: 'Anchor', role: 'Anchor', dominantFoot: 'Kanan' },
        { id: `cp-${Date.now()}-7`, num: '#7', name: 'Flank Kiri', role: 'Flank', dominantFoot: 'Kiri' },
        { id: `cp-${Date.now()}-11`, num: '#11', name: 'Flank Kanan', role: 'Flank', dominantFoot: 'Kanan' },
        { id: `cp-${Date.now()}-9`, num: '#9', name: 'Pivot', role: 'Pivot', dominantFoot: 'Keduanya' },
      ],
    };
    selectClub(fresh);
  }

  function addPlayerToDraft() {
    if (!draftClub) return;
    const name = newName.trim();
    if (!name) return;
    const num = newNum.trim().startsWith('#') ? newNum.trim() : `#${newNum.trim() || draftClub.players.length + 1}`;
    const player: ClubPlayerProfile = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      num,
      name,
      role: newRole,
      dominantFoot: newFoot,
    };
    draftClub.players = [...draftClub.players, player];
    newName = '';
    newNum = `#${draftClub.players.length + 1}`;
  }

  function removePlayerFromDraft(playerId: string) {
    if (!draftClub) return;
    draftClub.players = draftClub.players.filter((p) => p.id !== playerId);
  }

  function notify(msg: string) {
    statusNotice = msg;
    setTimeout(() => {
      if (statusNotice === msg) statusNotice = null;
    }, 3500);
  }

  async function handleSaveClub() {
    if (!draftClub || isSaving) return;
    isSaving = true;
    try {
      const savedTarget = await projectStore.upsertClubProfile(draftClub);
      selectedClubId = draftClub.id;
      notify(
        savedTarget === 'localStorage'
          ? `Klub "${draftClub.name}" tersimpan di browser!`
          : `Klub "${draftClub.name}" tersimpan ke: ${savedTarget}`
      );
    } catch (err: any) {
      notify(`Gagal menyimpan: ${err?.message || err}`);
    } finally {
      isSaving = false;
    }
  }

  async function handleDeleteClub() {
    if (!draftClub || projectStore.clubLibrary.length <= 1) return;
    await projectStore.deleteClubProfile(draftClub.id);
    ensureSelection();
    notify('Profil klub dihapus.');
  }

  async function handleApplyToActiveMatch() {
    if (!draftClub) return;
    await projectStore.upsertClubProfile(draftClub);
    if (draftClub.isOwnTeam) {
      projectStore.applyClubsToMatchRoster(draftClub.id, null);
      notify(`Roster "${draftClub.name}" (${draftClub.players.length} pemain) diterapkan ke laga aktif!`);
    } else {
      projectStore.applyClubsToMatchRoster(null, draftClub.id);
      notify(`Profil lawan "${draftClub.name}" diterapkan ke laga aktif!`);
    }
  }
</script>

{#if isOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onClose} role="presentation">
  <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
    <!-- HEADER -->
    <header class="modal-header">
      <div class="hdr-left">
        <Shield size={18} class="text-sky-400" />
        <div>
          <h2 class="modal-title">LIBRARY KLUB, PROFIL LAWAN & ROSTER FUTSAL</h2>
          <p class="modal-sub">Penyimpanan persisten di AppData Tauri — pilih klub langsung saat membuat proyek baru</p>
        </div>
      </div>

      <div class="hdr-right">
        {#if statusNotice}
          <span class="status-pill">
            <CheckCircle2 size={12} />
            <span>{statusNotice}</span>
          </span>
        {/if}
        <button type="button" class="btn-close" onclick={onClose} title="Tutup">
          <X size={18} />
        </button>
      </div>
    </header>

    <!-- 2-COLUMN BODY -->
    <div class="modal-body">
      <!-- LEFT: CLUBS LIST -->
      <aside class="clubs-sidebar">
        <div class="cs-hdr">
          <span>DAFTAR KLUB ({projectStore.clubLibrary.length})</span>
          <button type="button" class="btn-new-club" onclick={createNewClub}>
            <Plus size={12} />
            <span>Baru</span>
          </button>
        </div>

        <div class="clubs-scroll">
          {#each projectStore.clubLibrary as club (club.id)}
            <button
              type="button"
              class="club-list-item"
              class:active={draftClub?.id === club.id}
              onclick={() => selectClub(club)}
            >
              <span class="club-dot" style="background-color: {club.jerseyColor};"></span>
              <div class="club-meta">
                <span class="club-name">{club.name}</span>
                <span class="club-sub">
                  {club.isOwnTeam ? 'Tim Sendiri' : 'Lawan'} · {club.players.length} pemain
                </span>
              </div>
            </button>
          {/each}
        </div>
      </aside>

      <!-- RIGHT: CLUB & ROSTER EDITOR -->
      <section class="club-editor">
        {#if draftClub}
          <div class="club-form-grid">
            <div class="field-box">
              <label for="club-name-inp">Nama Klub</label>
              <input id="club-name-inp" type="text" bind:value={draftClub.name} class="txt-input" />
            </div>
            <div class="field-box">
              <label for="club-short-inp">Singkatan (3-4 huruf)</label>
              <input id="club-short-inp" type="text" bind:value={draftClub.shortName} maxlength="6" class="txt-input" />
            </div>
            <div class="field-box">
              <span class="lbl-span">Kategori Klub</span>
              <div class="type-toggle">
                <button
                  type="button"
                  class="tt-btn"
                  class:active={draftClub.isOwnTeam}
                  onclick={() => {
                    if (draftClub) draftClub.isOwnTeam = true;
                  }}
                >
                  Tim Sendiri
                </button>
                <button
                  type="button"
                  class="tt-btn away"
                  class:active={!draftClub.isOwnTeam}
                  onclick={() => {
                    if (draftClub) draftClub.isOwnTeam = false;
                  }}
                >
                  Tim Lawan
                </button>
              </div>
            </div>
            <div class="field-box">
              <span class="lbl-span">Warna Jersey & Kiper</span>
              <div class="colors-row">
                <input type="color" bind:value={draftClub.jerseyColor} title="Warna Jersey Utama" />
                <input type="color" bind:value={draftClub.gkColor} title="Warna Jersey Kiper" />
                {#each JERSEY_SWATCHES as sw}
                  <button
                    type="button"
                    class="swatch-mini"
                    style="background-color: {sw};"
                    onclick={() => {
                      if (draftClub) draftClub.jerseyColor = sw;
                    }}
                    aria-label="Pilih warna {sw}"
                  ></button>
                {/each}
              </div>
            </div>
          </div>

          <!-- ADD PLAYER ROW -->
          <div class="add-player-bar">
            <div class="ap-title">
              <UserPlus size={13} class="text-sky-400" />
              <span>Tambah Pemain</span>
            </div>
            <input type="text" bind:value={newNum} placeholder="#10" class="txt-input w-num" />
            <input
              type="text"
              bind:value={newName}
              placeholder="Nama lengkap / panggilan..."
              class="txt-input flex-1"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPlayerToDraft();
                }
              }}
            />
            <select bind:value={newRole} class="sel-input">
              {#each ROLES as r}
                <option value={r}>{r}</option>
              {/each}
            </select>
            <select bind:value={newFoot} class="sel-input">
              {#each FEET as f}
                <option value={f}>Kaki {f}</option>
              {/each}
            </select>
            <button type="button" class="btn-add-p" onclick={addPlayerToDraft}>
              <Plus size={13} />
              <span>Tambah</span>
            </button>
          </div>

          <!-- ROSTER TABLE -->
          <div class="roster-table-scroll">
            <table class="roster-edit-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Pemain</th>
                  <th>Peran Futsal</th>
                  <th>Kaki Dominan</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each draftClub.players as p (p.id)}
                  <tr>
                    <td>
                      <input type="text" bind:value={p.num} class="tbl-input w-num" />
                    </td>
                    <td>
                      <input type="text" bind:value={p.name} class="tbl-input" />
                    </td>
                    <td>
                      <select bind:value={p.role} class="sel-input">
                        {#each ROLES as r}
                          <option value={r}>{r}</option>
                        {/each}
                      </select>
                    </td>
                    <td>
                      <select bind:value={p.dominantFoot} class="sel-input">
                        {#each FEET as f}
                          <option value={f}>{f}</option>
                        {/each}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn-del-row"
                        onclick={() => removePlayerFromDraft(p.id)}
                        title="Hapus pemain"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- FOOTER ACTIONS -->
          <div class="editor-footer">
            <button
              type="button"
              class="btn-danger"
              disabled={projectStore.clubLibrary.length <= 1}
              onclick={handleDeleteClub}
            >
              <Trash2 size={13} />
              <span>Hapus Klub</span>
            </button>

            <div class="ef-right">
              <button type="button" class="btn-secondary" onclick={handleApplyToActiveMatch}>
                <Users size={13} />
                <span>Terapkan ke Laga Aktif</span>
              </button>
              <button type="button" class="btn-primary" onclick={handleSaveClub} disabled={isSaving}>
                <Save size={13} />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Klub ke AppData'}</span>
              </button>
            </div>
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 10, 20, 0.86);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
  }

  .modal-card {
    width: 960px;
    max-width: 96vw;
    height: 620px;
    max-height: 90vh;
    background: #07101f;
    border: 1px solid #1e3b68;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #f8fafc;
  }

  .modal-header {
    padding: 14px 18px;
    background: linear-gradient(180deg, #102548 0%, #0b1931 100%);
    border-bottom: 1px solid #1e3b68;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .hdr-left,
  .hdr-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-title {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
  }

  .modal-sub {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: #94a3b8;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
    color: #34d399;
    background: rgba(16, 185, 129, 0.16);
    border: 1px solid rgba(16, 185, 129, 0.4);
    padding: 4px 10px;
    border-radius: 999px;
    max-width: 340px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
  }

  .btn-close:hover {
    color: #ffffff;
  }

  .modal-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 240px 1fr;
    overflow: hidden;
  }

  .clubs-sidebar {
    background: #060d1a;
    border-right: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .cs-hdr {
    padding: 10px 12px;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 800;
    color: #93c5fd;
  }

  .btn-new-club {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0284c7;
    border: none;
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 5px;
    cursor: pointer;
  }

  .clubs-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .club-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #0b1629;
    border: 1px solid #152b4f;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    text-align: left;
  }

  .club-list-item.active {
    border-color: #38bdf8;
    background: #102a4e;
  }

  .club-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }

  .club-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .club-name {
    font-size: 11px;
    font-weight: 800;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .club-sub {
    font-size: 9.5px;
    color: #64748b;
  }

  .club-editor {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }

  .club-form-grid {
    display: grid;
    grid-template-columns: 1.3fr 0.7fr 1fr 1fr;
    gap: 10px;
  }

  .field-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-box label,
  .lbl-span {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
  }

  .txt-input,
  .sel-input,
  .tbl-input {
    background: #040912;
    border: 1px solid #1a355d;
    color: #f8fafc;
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 5px;
    outline: none;
  }

  .txt-input:focus,
  .tbl-input:focus {
    border-color: #38bdf8;
  }

  .w-num {
    width: 54px;
  }

  .flex-1 {
    flex: 1;
    min-width: 0;
  }

  .type-toggle {
    display: flex;
    gap: 4px;
  }

  .tt-btn {
    flex: 1;
    background: #0b1629;
    border: 1px solid #1a355d;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 6px;
    border-radius: 5px;
    cursor: pointer;
  }

  .tt-btn.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .tt-btn.away.active {
    background: #b91c1c;
    border-color: #ef4444;
  }

  .colors-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .colors-row input[type='color'] {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  .swatch-mini {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.35);
    cursor: pointer;
  }

  .add-player-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #091322;
    border: 1px solid #1a355d;
    padding: 8px 10px;
    border-radius: 8px;
    flex-wrap: wrap;
  }

  .ap-title {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 800;
    color: #93c5fd;
  }

  .btn-add-p {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0284c7;
    border: none;
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
  }

  .roster-table-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: #050b16;
    border: 1px solid #1a355d;
    border-radius: 8px;
  }

  .roster-edit-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .roster-edit-table th {
    background: #091426;
    color: #93c5fd;
    font-size: 10px;
    text-align: left;
    padding: 7px 10px;
    border-bottom: 1px solid #1a355d;
    position: sticky;
    top: 0;
  }

  .roster-edit-table td {
    padding: 6px 10px;
    border-bottom: 1px solid #122440;
  }

  .btn-del-row {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
  }

  .btn-del-row:hover {
    color: #ef4444;
  }

  .editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 4px;
  }

  .ef-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    padding: 7px 12px;
    border-radius: 7px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-secondary {
    background: #0b172a;
    border-color: #1e4570;
    color: #93c5fd;
  }

  .btn-danger {
    background: transparent;
    border-color: #7f1d1d;
    color: #f87171;
  }

  .btn-danger:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
