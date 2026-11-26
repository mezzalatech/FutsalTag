<script lang="ts">
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { RosterPlayer, SubstitutionEvent, VideoTagEvent } from '$lib/types';
  import {
    Play,
    Pause,
    ArrowLeftRight,
    Users,
    Clock,
    Plus,
    Trash2,
    SlidersHorizontal,
    Check,
    Film,
    TrendingUp,
  } from 'lucide-svelte';

  interface Props {
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
    onPlayClips?: (clips: VideoTagEvent[], title: string) => void;
  }

  let {
    currentTime,
    duration,
    isPlaying,
    onTogglePlay,
    onSeek,
    onPlayClips,
  }: Props = $props();

  let selectedOutId = $state<string | null>(null);
  let editingStartingFive = $state<boolean>(false);
  let newSubPlayerInput = $state<string>('');
  let actionToast = $state<string | null>(null);
  let stintLimitMin = $state<number>(4);

  function showToast(msg: string) {
    actionToast = msg;
    setTimeout(() => {
      if (actionToast === msg) actionToast = null;
    }, 2600);
  }

  function formatDurationMMSS(sec: number): string {
    const safe = Math.max(0, Math.round(sec));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function formatCompactMin(sec: number): string {
    const safe = Math.max(0, sec);
    const m = Math.floor(safe / 60);
    const s = Math.round(safe % 60);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }

  // Non-opponent squad players
  const squadPlayers = $derived(
    projectStore.roster.filter((p) => !p.isOpponent && p.name !== 'Tim Lawan')
  );

  // Active 5 at current video timestamp
  const activeLineupIds = $derived(projectStore.getActiveLineupIdsAt(currentTime));

  const onCourtPlayers = $derived(
    activeLineupIds
      .map((id) => projectStore.getRosterPlayerById(id))
      .filter((p): p is RosterPlayer => Boolean(p))
  );

  const benchPlayers = $derived(
    squadPlayers.filter((p) => !activeLineupIds.includes(p.id))
  );

  // Match timeline span for interval slicing
  const matchBounds = $derived.by(() => {
    const koStart =
      projectStore.periodKickoffs.length > 0
        ? Math.min(...projectStore.periodKickoffs.map((k) => k.videoTime))
        : 0;
    const maxSub = projectStore.substitutions.reduce((m, s) => Math.max(m, s.atTime + 1), 0);
    const maxTag = projectStore.tags.reduce((m, t) => Math.max(m, t.endTime), 0);
    const end = Math.max(duration || 120, currentTime, maxSub, maxTag, koStart + 10);
    return { start: koStart, end };
  });

  interface MatchInterval {
    start: number;
    end: number;
    lineupIds: string[];
  }

  const intervals = $derived.by<MatchInterval[]>(() => {
    const { start, end } = matchBounds;
    const cuts = Array.from(
      new Set([
        start,
        ...projectStore.substitutions
          .map((s) => s.atTime)
          .filter((t) => t > start + 0.01 && t < end - 0.01),
        end,
      ])
    ).sort((a, b) => a - b);

    const out: MatchInterval[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const s = cuts[i];
      const e = cuts[i + 1];
      if (e - s < 0.05) continue;
      out.push({
        start: s,
        end: e,
        lineupIds: projectStore.getActiveLineupIdsAt(s + 0.01),
      });
    }
    return out;
  });

  interface PlayerShiftSummary {
    player: RosterPlayer;
    isOnCourt: boolean;
    totalSec: number;
    pct: number;
    shifts: { start: number; end: number }[];
    currentStintSec: number;
    maxStintSec: number;
    isFatigued: boolean;
    avgRestSec: number;
    minRestSec: number;
    maxRestSec: number;
  }

  const playerMinutesList = $derived.by<PlayerShiftSummary[]>(() => {
    const totalMatchDur = Math.max(1, matchBounds.end - matchBounds.start);
    const limitSec = stintLimitMin * 60;
    return squadPlayers.map((player) => {
      const merged: { start: number; end: number }[] = [];
      let totalSec = 0;
      for (const iv of intervals) {
        if (!iv.lineupIds.includes(player.id)) continue;
        totalSec += iv.end - iv.start;
        const last = merged[merged.length - 1];
        if (last && Math.abs(last.end - iv.start) < 0.05) {
          last.end = iv.end;
        } else {
          merged.push({ start: iv.start, end: iv.end });
        }
      }
      const isOnCourt = activeLineupIds.includes(player.id);
      const isGk = projectStore.isGoalkeeper(player);
      const activeShift =
        merged.find((sh) => currentTime >= sh.start - 0.05 && currentTime <= sh.end + 0.05) ??
        (isOnCourt ? merged[merged.length - 1] : undefined);
      const currentStintSec = isOnCourt && activeShift ? Math.max(0, currentTime - activeShift.start) : 0;
      const maxStintSec = merged.reduce((mx, sh) => Math.max(mx, sh.end - sh.start), 0);
      const rests: number[] = [];
      for (let i = 1; i < merged.length; i++) {
        const gap = merged[i].start - merged[i - 1].end;
        if (gap > 0.5) rests.push(gap);
      }
      const avgRestSec = rests.length > 0 ? rests.reduce((a, b) => a + b, 0) / rests.length : 0;
      const minRestSec = rests.length > 0 ? Math.min(...rests) : 0;
      const maxRestSec = rests.length > 0 ? Math.max(...rests) : 0;
      return {
        player,
        isOnCourt,
        totalSec,
        pct: Math.min(100, (totalSec / totalMatchDur) * 100),
        shifts: merged,
        currentStintSec,
        maxStintSec,
        isFatigued: !isGk && isOnCourt && currentStintSec >= limitSec,
        avgRestSec,
        minRestSec,
        maxRestSec,
      };
    });
  });

  const playerSummaryById = $derived(new Map(playerMinutesList.map((s) => [s.player.id, s])));

  interface QuartetAnalyticsRow {
    key: string;
    players: RosterPlayer[];
    durationSec: number;
    shiftsCount: number;
    gf: number;
    ga: number;
    plusMinus: number;
    sot: number;
    clips: VideoTagEvent[];
    isCurrent: boolean;
  }

  const quartetAnalytics = $derived.by<QuartetAnalyticsRow[]>(() => {
    const map = new Map<string, QuartetAnalyticsRow>();
    const currentOutfieldKey = activeLineupIds
      .filter((id) => {
        const p = projectStore.getRosterPlayerById(id);
        return p && !projectStore.isGoalkeeper(p);
      })
      .sort()
      .join('|');

    for (const iv of intervals) {
      const outfield = iv.lineupIds
        .map((id) => projectStore.getRosterPlayerById(id))
        .filter((p): p is RosterPlayer => Boolean(p))
        .filter((p) => !projectStore.isGoalkeeper(p));

      if (outfield.length === 0) continue;
      const sortedIds = outfield.map((p) => p.id).sort();
      const key = sortedIds.join('|');

      let row = map.get(key);
      if (!row) {
        row = {
          key,
          players: outfield,
          durationSec: 0,
          shiftsCount: 0,
          gf: 0,
          ga: 0,
          plusMinus: 0,
          sot: 0,
          clips: [],
          isCurrent: key === currentOutfieldKey,
        };
        map.set(key, row);
      }
      row.durationSec += iv.end - iv.start;
      row.shiftsCount += 1;
    }

    // Attribute tags to the interval matching their midpoint
    for (const tag of projectStore.tags) {
      const mid = Math.max(
        matchBounds.start,
        Math.min(matchBounds.end - 0.01, (tag.startTime + tag.endTime) / 2)
      );
      const iv =
        intervals.find((item) => mid >= item.start && mid <= item.end) ||
        intervals[intervals.length - 1];
      if (!iv) continue;

      const outfieldIds = iv.lineupIds
        .filter((id) => {
          const p = projectStore.getRosterPlayerById(id);
          return p && !projectStore.isGoalkeeper(p);
        })
        .sort();
      const row = map.get(outfieldIds.join('|'));
      if (!row) continue;

      row.clips.push(tag);
      const isAway =
        tag.teamSide === 'away' ||
        projectStore.normalizePlayerLabel(tag.playerLabel) === 'Tim Lawan';
      const isGoal = /\b(goal|gol)\b/i.test(tag.category);
      const isConceded =
        /kebobolan|conceded|gol lawan/i.test(tag.category) ||
        (/kebobolan/i.test(tag.title) && isAway);
      const isSot =
        /shot on target|shoot ot|\bsot\b|tembakan tepat|on target/i.test(tag.category) && !isAway;

      if (isGoal && !isAway) row.gf += 1;
      if ((isGoal && isAway) || isConceded) row.ga += 1;
      if (isSot) row.sot += 1;
    }

    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      plusMinus: r.gf - r.ga,
    }));

    return rows.sort((a, b) => b.plusMinus - a.plusMinus || b.durationSec - a.durationSec);
  });

  function handleSelectOut(player: RosterPlayer) {
    if (editingStartingFive) {
      toggleStartingMember(player.id);
      return;
    }
    selectedOutId = selectedOutId === player.id ? null : player.id;
  }

  function handleSelectIn(benchPlayer: RosterPlayer) {
    if (editingStartingFive) {
      toggleStartingMember(benchPlayer.id);
      return;
    }
    if (!selectedOutId) {
      showToast('Klik dulu pemain yang keluar di panel "Di Lapangan"');
      return;
    }
    const outPlayer = projectStore.getRosterPlayerById(selectedOutId);
    const ev = projectStore.recordSubstitution(selectedOutId, benchPlayer.id, currentTime, 'home');
    selectedOutId = null;
    if (ev && outPlayer) {
      showToast(
        `Ganti Pemain: ${outPlayer.num} ${outPlayer.name} ➔ ${benchPlayer.num} ${benchPlayer.name} (${projectStore.formatMatchClock(ev.atTime)})`
      );
    }
  }

  function toggleStartingMember(playerId: string) {
    const current = [...projectStore.startingLineupIds];
    if (current.includes(playerId)) {
      if (current.length <= 1) return;
      projectStore.setStartingLineup(current.filter((id) => id !== playerId));
    } else if (current.length < 5) {
      projectStore.setStartingLineup([...current, playerId]);
    } else {
      showToast('Starting 5 sudah penuh (5 pemain). Lepas 1 pemain dulu.');
    }
  }

  function handleAddBenchPlayer() {
    const raw = newSubPlayerInput.trim();
    if (!raw) return;
    const addedLabel = projectStore.addRosterPlayer(raw);
    newSubPlayerInput = '';
    if (addedLabel) {
      showToast(`Pemain cadangan "${addedLabel}" ditambahkan ke skuad`);
    }
  }

  function getSubDurationBefore(sub: SubstitutionEvent): string {
    return projectStore.periodKickoffs.length > 0
      ? projectStore.formatMatchClock(sub.atTime)
      : formatDurationMMSS(sub.atTime);
  }
</script>

<div class="minutes-shell">
  <!-- TOP MINI TRANSPORT BAR -->
  <div class="minutes-transport">
    <div class="mt-left">
      <button type="button" class="mt-play-btn" onclick={onTogglePlay} title="Play/Pause (Spasi)">
        {#if isPlaying}
          <Pause size={14} />
        {:else}
          <Play size={14} />
        {/if}
      </button>
      <span class="mt-clock">
        {projectStore.periodKickoffs.length > 0
          ? projectStore.formatMatchClock(currentTime, true)
          : formatDurationMMSS(currentTime)}
      </span>
      <button type="button" class="mt-seek-btn" onclick={() => onSeek(currentTime - 5)}>-5s</button>
      <button type="button" class="mt-seek-btn" onclick={() => onSeek(currentTime + 5)}>+5s</button>

      <span class="mt-pill-info">
        <ArrowLeftRight size={11} />
        <span>Pergantian: <strong>{projectStore.substitutions.length}</strong></span>
      </span>
    </div>

    {#if actionToast}
      <div class="mt-toast">
        <Check size={12} />
        <span>{actionToast}</span>
      </div>
    {/if}

    <div class="mt-right">
      <button
        type="button"
        class="mt-edit-s5-btn"
        class:active={editingStartingFive}
        onclick={() => {
          editingStartingFive = !editingStartingFive;
          selectedOutId = null;
        }}
        title="Pilih 5 pemain utama (Starting 5) sebelum kick-off"
      >
        <SlidersHorizontal size={12} />
        <span>{editingStartingFive ? 'Selesai Atur Starting 5' : 'Atur Starting 5'}</span>
      </button>
    </div>
  </div>

  <!-- MAIN CONTENT GRID -->
  <div class="minutes-body">
    <!-- ROW 1: 1-KLIK GANTI PEMAIN + RIWAYAT PERGANTIAN -->
    <div class="sub-engine-grid">
      <!-- PANEL KIRI: ON COURT (5 PEMAIN) -->
      <section class="card-panel">
        <div class="panel-hdr">
          <div class="ph-title">
            <Users size={13} class="text-emerald-400" />
            <span>DI LAPANGAN ({onCourtPlayers.length}/5)</span>
          </div>
          <span class="ph-hint">
            {editingStartingFive
              ? 'Klik untuk lepas dari Starting 5'
              : selectedOutId
                ? 'Pilih pemain pengganti di kanan ➔'
                : 'Klik 1 pemain untuk diganti (Sub Out)'}
          </span>
        </div>

        <div class="players-grid">
          {#each onCourtPlayers as p (p.id)}
            {@const isGk = projectStore.isGoalkeeper(p)}
            {@const isOutSelected = selectedOutId === p.id}
            {@const summary = playerSummaryById.get(p.id)}
            {@const isFatigued = Boolean(summary?.isFatigued)}
            <button
              type="button"
              class="player-sub-card on-court"
              class:selected-out={isOutSelected}
              class:fatigued={isFatigued && !isOutSelected}
              onclick={() => handleSelectOut(p)}
            >
              <span class="psc-num" style="background-color: {p.color};">{p.num}</span>
              <div class="psc-meta">
                <span class="psc-name">{p.name}</span>
                <span class="psc-role">
                  {isGk ? 'GK' : p.role}{#if summary && !isGk} · {formatCompactMin(summary.currentStintSec)}{/if}
                </span>
              </div>
              {#if isOutSelected}
                <span class="psc-badge-out">KELUAR</span>
              {:else if isFatigued && summary}
                <span class="psc-badge-tired" title="Stint melebihi limit {stintLimitMin}m">GANTI ({formatCompactMin(summary.currentStintSec)})</span>
              {:else}
                <span class="psc-badge-on">{isGk ? 'GK' : 'ON'}</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <!-- PANEL TENGAH: BENCH (CADANGAN) -->
      <section class="card-panel">
        <div class="panel-hdr">
          <div class="ph-title">
            <ArrowLeftRight size={13} class="text-sky-400" />
            <span>BANGKU CADANGAN ({benchPlayers.length})</span>
          </div>
          <div class="add-bench-box">
            <input
              type="text"
              bind:value={newSubPlayerInput}
              placeholder="+ #10 Nama"
              class="add-bench-input"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddBenchPlayer();
                }
              }}
            />
            <button type="button" class="add-bench-btn" onclick={handleAddBenchPlayer} title="Tambah pemain skuad">
              <Plus size={11} />
            </button>
          </div>
        </div>

        {#if benchPlayers.length === 0}
          <div class="empty-bench">
            Tambahkan pemain cadangan (mis. <code>#6 Anchor 2</code>) untuk mencatat rotasi rolling futsal.
          </div>
        {:else}
          <div class="players-grid">
            {#each benchPlayers as p (p.id)}
              <button
                type="button"
                class="player-sub-card bench"
                class:ready-in={Boolean(selectedOutId)}
                onclick={() => handleSelectIn(p)}
                title={selectedOutId
                  ? `Masukkan ${p.num} ${p.name} pada ${formatDurationMMSS(currentTime)}`
                  : 'Pilih pemain yang keluar terlebih dahulu'}
              >
                <span class="psc-num" style="background-color: {p.color};">{p.num}</span>
                <div class="psc-meta">
                  <span class="psc-name">{p.name}</span>
                  <span class="psc-role">{p.role}</span>
                </div>
                {#if selectedOutId}
                  <span class="psc-badge-in">MASUK</span>
                {:else if editingStartingFive}
                  <span class="psc-badge-in">+S5</span>
                {:else}
                  <span class="psc-badge-bench">BENCH</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <!-- PANEL KANAN: RIWAYAT PERGANTIAN -->
      <section class="card-panel sub-log-panel">
        <div class="panel-hdr">
          <div class="ph-title">
            <Clock size={13} class="text-amber-400" />
            <span>RIWAYAT ROTASI</span>
          </div>
          <span class="ph-hint">{projectStore.substitutions.length} event</span>
        </div>

        <div class="sub-log-scroll">
          {#if projectStore.substitutions.length === 0}
            <div class="empty-bench">Belum ada pergantian pemain tercatat.</div>
          {:else}
            {#each projectStore.substitutions as sub (sub.id)}
              {@const pOut = projectStore.getRosterPlayerById(sub.playerOut)}
              {@const pIn = projectStore.getRosterPlayerById(sub.playerIn)}
              <div class="sub-log-row">
                <button
                  type="button"
                  class="sub-log-time"
                  onclick={() => onSeek(sub.atTime)}
                  title="Lompat ke detik {sub.atTime.toFixed(1)}s"
                >
                  {getSubDurationBefore(sub)}
                </button>
                <div class="sub-log-names">
                  <span class="sub-out-txt">▼ {pOut ? `${pOut.num} ${pOut.name}` : sub.playerOut}</span>
                  <span class="sub-in-txt">▲ {pIn ? `${pIn.num} ${pIn.name}` : sub.playerIn}</span>
                </div>
                <button
                  type="button"
                  class="sub-del-btn"
                  onclick={() => projectStore.deleteSubstitution(sub.id)}
                  title="Hapus catatan pergantian"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </section>
    </div>

    <!-- ROW 2: TIMELINE SHIFT MENIT BERMAIN PER PEMAIN -->
    <section class="card-panel">
      <div class="panel-hdr">
        <div class="ph-title">
          <Clock size={13} class="text-sky-400" />
          <span>TIMELINE SHIFT & MENIT BERMAIN PEMAIN</span>
        </div>
        <div class="stint-limit-ctrl">
          <span>Limit Stint:</span>
          <button type="button" class="stint-step-btn" onclick={() => (stintLimitMin = Math.max(1, stintLimitMin - 1))} title="Kurangi batas menit stint">-</button>
          <strong>{stintLimitMin}m</strong>
          <button type="button" class="stint-step-btn" onclick={() => (stintLimitMin = Math.min(10, stintLimitMin + 1))} title="Tambah batas menit stint">+</button>
          <span class="ph-hint">
            Rentang: {formatCompactMin(matchBounds.end - matchBounds.start)} · Klik batang shift untuk lompat
          </span>
        </div>
      </div>

      <div class="shifts-list">
        {#each playerMinutesList as item (item.player.id)}
          {@const totalSpan = Math.max(1, matchBounds.end - matchBounds.start)}
          {@const playheadLeft = Math.max(0, Math.min(100, ((currentTime - matchBounds.start) / totalSpan) * 100))}
          {@const isGk = projectStore.isGoalkeeper(item.player)}
          <div class="shift-row">
            <div class="shift-player-col">
              <span class="psc-num" style="background-color: {item.player.color};">{item.player.num}</span>
              <span class="shift-pname">{item.player.name}</span>
              {#if item.isFatigued}
                <span class="on-dot tired" title="Perlu rotasi (melebihi limit {stintLimitMin}m)"></span>
              {:else if item.isOnCourt}
                <span class="on-dot" title="Sedang di lapangan"></span>
              {/if}
            </div>

            <div class="shift-bar-track">
              <div class="shift-playhead" style="left: {playheadLeft}%;"></div>
              {#each item.shifts as sh}
                {@const lPct = ((sh.start - matchBounds.start) / totalSpan) * 100}
                {@const wPct = Math.max(0.8, ((sh.end - sh.start) / totalSpan) * 100)}
                {@const overLimit = !isGk && (sh.end - sh.start) >= stintLimitMin * 60}
                <button
                  type="button"
                  class="shift-segment"
                  class:over-limit={overLimit}
                  style="left: {lPct}%; width: {wPct}%; background-color: {item.player.color};"
                  onclick={() => onSeek(sh.start)}
                  title="{item.player.num} {item.player.name}: {formatDurationMMSS(sh.start)} - {formatDurationMMSS(sh.end)} ({formatCompactMin(sh.end - sh.start)}){overLimit ? ' · ⚠️ Melebihi limit stint' : ''}"
                ></button>
              {/each}
            </div>

            <div class="shift-total-col">
              <span class="shift-min">{formatCompactMin(item.totalSec)}</span>
              <span class="shift-pct">{item.pct.toFixed(0)}%</span>
              <span
                class="shift-rest"
                title={item.avgRestSec > 0 ? `Rata-rata istirahat: ${formatCompactMin(item.avgRestSec)} (Min: ${formatCompactMin(item.minRestSec)} · Max: ${formatCompactMin(item.maxRestSec)})` : 'Belum ada jeda istirahat'}
              >
                R:{item.avgRestSec > 0 ? formatCompactMin(item.avgRestSec) : '-'}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- ROW 3: ANALISIS QUARTET 4v4 (+/-) -->
    <section class="card-panel">
      <div class="panel-hdr">
        <div class="ph-title">
          <TrendingUp size={13} class="text-emerald-400" />
          <span>ANALISIS KOMBINASI QUARTET 4v4 (+/-) FUTSAL</span>
        </div>
        <span class="ph-hint">
          Evaluasi efektivitas 4 pemain outfield (Gol Untuk, Kebobolan, Selisih +/-, dan Shot on Target)
        </span>
      </div>

      <div class="quartet-table-wrap">
        <table class="quartet-table">
          <thead>
            <tr>
              <th class="th-left">Kombinasi Quartet (Outfield)</th>
              <th>Durasi</th>
              <th>Shift</th>
              <th>GF</th>
              <th>GA</th>
              <th>+/-</th>
              <th>Shot OT</th>
              <th>Klip</th>
            </tr>
          </thead>
          <tbody>
            {#if quartetAnalytics.length === 0}
              <tr>
                <td colspan="8" class="empty-td">
                  Belum ada data kombinasi quartet. Catat minimal Starting 5 atau pergantian pemain.
                </td>
              </tr>
            {:else}
              {#each quartetAnalytics as q (q.key)}
                <tr class:active-quartet={q.isCurrent}>
                  <td class="td-left">
                    <div class="quartet-chips">
                      {#if q.isCurrent}
                        <span class="q-live-tag">AKTIF</span>
                      {/if}
                      {#each q.players as qp (qp.id)}
                        <span class="q-player-pill">
                          <i style="background-color: {qp.color};">{qp.num}</i>
                          <span>{qp.name}</span>
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td class="mono">{formatCompactMin(q.durationSec)}</td>
                  <td class="mono">{q.shiftsCount}x</td>
                  <td class="mono text-gf">{q.gf}</td>
                  <td class="mono text-ga">{q.ga}</td>
                  <td>
                    <span
                      class="pm-pill"
                      class:pos={q.plusMinus > 0}
                      class:neg={q.plusMinus < 0}
                    >
                      {q.plusMinus > 0 ? `+${q.plusMinus}` : q.plusMinus}
                    </span>
                  </td>
                  <td class="mono">{q.sot}</td>
                  <td>
                    {#if q.clips.length > 0 && onPlayClips}
                      <button
                        type="button"
                        class="btn-play-q"
                        onclick={() =>
                          onPlayClips(
                            q.clips,
                            `Quartet ${q.players.map((p) => p.num).join(' ')} (${q.clips.length} Klip)`
                          )}
                        title="Putar {q.clips.length} klip saat quartet ini di lapangan"
                      >
                        <Film size={11} />
                        <span>{q.clips.length}</span>
                      </button>
                    {:else}
                      <span class="muted-zero">{q.clips.length}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>

<style>
  .minutes-shell {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #060b14;
    overflow: hidden;
  }

  .minutes-transport {
    height: 40px;
    min-height: 40px;
    padding: 0 14px;
    background: #091322;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
  }

  .mt-left,
  .mt-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mt-play-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    border: 1px solid #fca5a5;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .mt-clock {
    font-family: 'Fira Code', monospace;
    font-size: 12px;
    font-weight: 800;
    color: #38bdf8;
    background: #060b14;
    border: 1px solid #1a355d;
    padding: 3px 8px;
    border-radius: 5px;
  }

  .mt-seek-btn {
    background: #0b172a;
    border: 1px solid #1a355d;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 4px;
    cursor: pointer;
  }

  .mt-seek-btn:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }

  .mt-pill-info {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: #cbd5e1;
    background: #0b172a;
    border: 1px solid #1a355d;
    padding: 3px 8px;
    border-radius: 999px;
  }

  .mt-toast {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
    color: #34d399;
    background: rgba(16, 185, 129, 0.16);
    border: 1px solid rgba(16, 185, 129, 0.45);
    padding: 3px 10px;
    border-radius: 999px;
  }

  .mt-edit-s5-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0b172a;
    border: 1px solid #1a355d;
    color: #93c5fd;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
  }

  .mt-edit-s5-btn.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .minutes-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sub-engine-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 270px;
    gap: 12px;
  }

  @media (max-width: 1120px) {
    .sub-engine-grid {
      grid-template-columns: 1fr 1fr;
    }
    .sub-log-panel {
      grid-column: 1 / -1;
    }
  }

  .card-panel {
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .ph-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    color: #f0f6fc;
    letter-spacing: 0.03em;
  }

  .ph-hint {
    font-size: 10px;
    color: #64748b;
  }

  .players-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }

  .player-sub-card {
    display: flex;
    align-items: center;
    gap: 7px;
    background: #0b1629;
    border: 1px solid #1a355d;
    border-radius: 7px;
    padding: 6px 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease;
  }

  .player-sub-card:hover {
    border-color: #38bdf8;
    background: #102342;
  }

  .player-sub-card.selected-out {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.18);
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
  }

  .player-sub-card.bench.ready-in {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.12);
  }

  .psc-num {
    font-size: 9px;
    font-weight: 900;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .psc-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .psc-name {
    font-size: 10px;
    font-weight: 800;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .psc-role {
    font-size: 8.5px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .psc-badge-on,
  .psc-badge-out,
  .psc-badge-in,
  .psc-badge-bench {
    font-size: 8px;
    font-weight: 900;
    padding: 2px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .psc-badge-on {
    background: rgba(16, 185, 129, 0.18);
    color: #34d399;
  }

  .psc-badge-out {
    background: #ef4444;
    color: #ffffff;
  }

  .psc-badge-in {
    background: #10b981;
    color: #04101d;
  }

  .psc-badge-bench {
    background: #1e293b;
    color: #94a3b8;
  }

  .add-bench-box {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #060b14;
    border: 1px solid #1a355d;
    border-radius: 5px;
    padding: 2px 4px;
  }

  .add-bench-input {
    width: 105px;
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 10px;
  }

  .add-bench-btn {
    background: #0284c7;
    border: none;
    color: #ffffff;
    border-radius: 4px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .empty-bench {
    font-size: 10px;
    color: #64748b;
    padding: 10px 6px;
  }

  .sub-log-scroll {
    max-height: 145px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .sub-log-row {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0b1629;
    border: 1px solid #152b4f;
    border-radius: 6px;
    padding: 4px 7px;
  }

  .sub-log-time {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 800;
    color: #38bdf8;
    background: #060b14;
    border: 1px solid #1a355d;
    padding: 2px 5px;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .sub-log-names {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 9.5px;
    line-height: 1.25;
  }

  .sub-out-txt {
    color: #fca5a5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub-in-txt {
    color: #6ee7b7;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub-del-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 2px;
  }

  .sub-del-btn:hover {
    color: #ef4444;
  }

  /* SHIFTS TIMELINE */
  .shifts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .shift-row {
    display: grid;
    grid-template-columns: 160px 1fr 135px;
    align-items: center;
    gap: 10px;
  }

  .shift-player-col {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .shift-pname {
    font-size: 10px;
    font-weight: 700;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .on-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    flex-shrink: 0;
  }

  .shift-bar-track {
    position: relative;
    height: 14px;
    background: #060b14;
    border: 1px solid #152b4f;
    border-radius: 4px;
    overflow: hidden;
  }

  .shift-segment {
    position: absolute;
    top: 2px;
    bottom: 2px;
    border: none;
    border-radius: 3px;
    opacity: 0.85;
    cursor: pointer;
  }

  .shift-segment:hover {
    opacity: 1;
    outline: 1px solid #ffffff;
  }

  .shift-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ffffff;
    z-index: 4;
    pointer-events: none;
  }

  .shift-total-col {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    font-family: 'Fira Code', monospace;
  }

  .shift-min {
    font-size: 10px;
    font-weight: 800;
    color: #f8fafc;
  }

  .shift-pct {
    font-size: 9px;
    color: #38bdf8;
  }

  /* QUARTET TABLE */
  .quartet-table-wrap {
    overflow-x: auto;
  }

  .quartet-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    text-align: center;
  }

  .quartet-table th {
    background: #060b14;
    color: #93c5fd;
    font-size: 10px;
    font-weight: 800;
    padding: 7px 10px;
    border-bottom: 1px solid #1a355d;
  }

  .quartet-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #122440;
  }

  .th-left,
  .td-left {
    text-align: left;
  }

  tr.active-quartet td {
    background: rgba(16, 185, 129, 0.08);
  }

  .quartet-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .q-live-tag {
    font-size: 8px;
    font-weight: 900;
    background: #10b981;
    color: #04101d;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .q-player-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0b172a;
    border: 1px solid #1e3a5f;
    border-radius: 999px;
    padding: 2px 7px 2px 3px;
    font-size: 10px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .q-player-pill i {
    font-style: normal;
    font-size: 8.5px;
    font-weight: 900;
    color: #ffffff;
    padding: 1px 5px;
    border-radius: 999px;
  }

  .mono {
    font-family: 'Fira Code', monospace;
    font-weight: 700;
  }

  .text-gf {
    color: #34d399;
  }

  .text-ga {
    color: #f87171;
  }

  .pm-pill {
    display: inline-block;
    min-width: 28px;
    padding: 2px 7px;
    border-radius: 999px;
    font-family: 'Fira Code', monospace;
    font-weight: 900;
    background: #1e293b;
    color: #cbd5e1;
  }

  .pm-pill.pos {
    background: rgba(16, 185, 129, 0.22);
    border: 1px solid #10b981;
    color: #34d399;
  }

  .pm-pill.neg {
    background: rgba(239, 68, 68, 0.22);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }

  .btn-play-q {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0284c7;
    border: 1px solid #38bdf8;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 5px;
    cursor: pointer;
  }

  .muted-zero {
    color: #475569;
  }

  .empty-td {
    padding: 16px;
    color: #64748b;
  }

  .stint-limit-ctrl {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #94a3b8;
    flex-wrap: wrap;
  }

  .stint-limit-ctrl strong {
    color: #38bdf8;
    min-width: 24px;
    text-align: center;
  }

  .stint-step-btn {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid #334155;
    background: #0f172a;
    color: #e2e8f0;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .stint-step-btn:hover {
    border-color: #38bdf8;
  }

  .player-sub-card.fatigued {
    border-color: rgba(239, 68, 68, 0.75);
    background: rgba(127, 29, 29, 0.28);
  }

  .psc-badge-tired {
    font-size: 9px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.25);
    border: 1px solid #ef4444;
    color: #fca5a5;
    flex-shrink: 0;
  }

  .on-dot.tired {
    background: #ef4444;
    box-shadow: 0 0 6px #ef4444;
  }

  .shift-segment.over-limit {
    background-color: #ef4444 !important;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);
  }

  .shift-rest {
    font-size: 9px;
    color: #94a3b8;
    background: #0f172a;
    border: 1px solid #1e293b;
    padding: 1px 4px;
    border-radius: 4px;
  }
</style>
