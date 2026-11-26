import type { RosterPlayer, VideoTagEvent } from '$lib/types';
import { escapeXml, saveTextFilePortable } from '$lib/export/interopExporters';

export interface HtmlStatsReportInput {
  matchTitle: string;
  competition?: string;
  matchDate?: string;
  durationSec: number;
  tags: VideoTagEvent[];
  roster: RosterPlayer[];
  clubLogoDataUrl?: string | null;
  formatMatchClock?: (sec: number) => string;
}

function fmtSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/**
 * Generate a self-contained responsive HTML5 match statistics report suitable for sharing via WhatsApp
 * and viewing on any phone or desktop browser offline.
 */
export function buildInteractiveHtmlStatsReport(input: HtmlStatsReportInput): string {
  const tags = [...input.tags].sort((a, b) => a.startTime - b.startTime);
  const goals = tags.filter((t) => /goal|gol/i.test(t.category) || t.outcomeLabel === 'Gol / Sukses').length;
  const shots = tags.filter((t) => /shot|tembak/i.test(t.category)).length;
  const saves = tags.filter((t) => /save|kiper|goalkeeper/i.test(t.category)).length;
  const turnovers = tags.filter((t) => t.outcomeLabel === 'Turnover' || /foul|transition defense/i.test(t.category)).length;

  const catCounts = new Map<string, { count: number; color: string }>();
  for (const t of tags) {
    const prev = catCounts.get(t.category);
    catCounts.set(t.category, {
      count: (prev?.count ?? 0) + 1,
      color: prev?.color || t.color || '#38bdf8',
    });
  }
  const catSorted = [...catCounts.entries()].sort((a, b) => b[1].count - a[1].count);
  const maxCatCount = Math.max(1, catSorted[0]?.[1].count ?? 1);

  const playerStats = new Map<
    string,
    { label: string; total: number; goals: number; shots: number; telestrations: number }
  >();
  for (const t of tags) {
    const pLabel = t.playerLabel?.trim() || 'Tim / Umum';
    const cur = playerStats.get(pLabel) ?? {
      label: pLabel,
      total: 0,
      goals: 0,
      shots: 0,
      telestrations: 0,
    };
    cur.total += 1;
    if (/goal|gol/i.test(t.category) || t.outcomeLabel === 'Gol / Sukses') cur.goals += 1;
    if (/shot|tembak/i.test(t.category)) cur.shots += 1;
    if ((t.drawings?.length ?? 0) > 0) cur.telestrations += 1;
    playerStats.set(pLabel, cur);
  }
  const playerSorted = [...playerStats.values()].sort((a, b) => b.total - a.total);

  const catButtonsHtml = catSorted
    .map(
      ([cat, meta]) =>
        `<button class="chip" data-cat="${escapeXml(cat)}"><span class="dot" style="background:${escapeXml(meta.color)}"></span>${escapeXml(cat)} (${meta.count})</button>`
    )
    .join('\n');

  const catBarsHtml = catSorted
    .map(([cat, meta]) => {
      const pct = Math.round((meta.count / maxCatCount) * 100);
      return `<div class="bar-row">
        <span class="bar-name">${escapeXml(cat)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${escapeXml(meta.color)}"></div></div>
        <span class="bar-val">${meta.count}</span>
      </div>`;
    })
    .join('\n');

  const playerRowsHtml = playerSorted
    .map(
      (p) => `<tr>
        <td><strong>${escapeXml(p.label)}</strong></td>
        <td>${p.total}</td>
        <td>${p.goals}</td>
        <td>${p.shots}</td>
        <td>${p.telestrations}</td>
      </tr>`
    )
    .join('\n');

  const timelineRowsHtml = tags
    .map((t) => {
      const clockStr = input.formatMatchClock ? input.formatMatchClock(t.startTime) : fmtSec(t.startTime);
      const labelsTxt = (t.labels ?? []).map((l) => l.name).join(', ');
      return `<tr class="event-row" data-cat="${escapeXml(t.category)}" data-search="${escapeXml(
        `${t.category} ${t.playerLabel || ''} ${labelsTxt} ${t.notes || ''} ${t.outcomeLabel || ''}`.toLowerCase()
      )}">
        <td class="mono">${escapeXml(clockStr)}</td>
        <td><span class="cat-badge" style="border-color:${escapeXml(t.color || '#38bdf8')}">${escapeXml(t.category)}</span></td>
        <td>${escapeXml(t.playerLabel || '-')}</td>
        <td>${escapeXml(labelsTxt || '-')}</td>
        <td>${escapeXml(t.outcomeLabel || '-')}</td>
        <td>${escapeXml(t.notes || '-')}</td>
      </tr>`;
    })
    .join('\n');

  const logoHtml = input.clubLogoDataUrl
    ? `<img src="${escapeXml(input.clubLogoDataUrl)}" alt="Logo Klub" class="club-logo" />`
    : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ARF FutsalTag Stats — ${escapeXml(input.matchTitle)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #060b14; color: #f8fafc; line-height: 1.45; padding: 18px; }
  .wrap { max-width: 1120px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .hdr { display: flex; align-items: center; justify-content: space-between; gap: 14px; background: linear-gradient(135deg,#0d1e38,#091528); border: 1px solid #1e3a5f; border-radius: 14px; padding: 16px 20px; flex-wrap: wrap; }
  .hdr-left { display: flex; align-items: center; gap: 14px; }
  .club-logo { width: 52px; height: 52px; object-fit: contain; border-radius: 10px; background: rgba(255,255,255,0.06); padding: 4px; }
  .brand { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: #38bdf8; text-transform: uppercase; }
  h1 { font-size: 20px; font-weight: 800; color: #ffffff; }
  .meta { font-size: 12px; color: #94a3b8; }
  .btn-print { background: #0284c7; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; font-size: 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .kpi { background: #0b1628; border: 1px solid #1b3256; border-radius: 12px; padding: 14px; }
  .kpi-val { font-size: 26px; font-weight: 900; color: #38bdf8; font-family: monospace; }
  .kpi-lbl { font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; margin-top: 2px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 820px) { .two-col { grid-template-columns: 1fr; } }
  .card { background: #0b1628; border: 1px solid #1b3256; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .card-title { font-size: 13px; font-weight: 800; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.04em; }
  .bar-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .bar-name { width: 140px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e1; }
  .bar-track { flex: 1; height: 10px; background: #060b14; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .bar-val { width: 30px; text-align: right; font-family: monospace; font-weight: 700; color: #f8fafc; }
  .filter-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .search-input { flex: 1; min-width: 180px; background: #060b14; border: 1px solid #1e3a5f; border-radius: 8px; color: #f8fafc; padding: 7px 10px; font-size: 12px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; background: #0f172a; border: 1px solid #1e3a5f; color: #cbd5e1; border-radius: 999px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .chip.active { background: #0284c7; border-color: #38bdf8; color: #ffffff; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .tbl-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; color: #94a3b8; border-bottom: 1px solid #1e3a5f; padding: 8px 10px; }
  td { border-bottom: 1px solid rgba(30,58,95,0.45); padding: 8px 10px; color: #e2e8f0; vertical-align: top; }
  .mono { font-family: monospace; color: #38bdf8; white-space: nowrap; }
  .cat-badge { display: inline-block; border-left: 3px solid; padding-left: 6px; font-weight: 700; }
  @media print {
    body { background: #ffffff; color: #0f172a; padding: 0; }
    .card, .kpi, .hdr { background: #ffffff; border-color: #cbd5e1; color: #0f172a; }
    .btn-print, .filter-bar { display: none; }
    td, .bar-name, h1 { color: #0f172a; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="hdr">
    <div class="hdr-left">
      ${logoHtml}
      <div>
        <div class="brand">ARF FutsalTag · Laporan Statistik Interaktif</div>
        <h1>${escapeXml(input.matchTitle)}</h1>
        <div class="meta">${escapeXml(input.competition || 'Pertandingan Futsal')} · Durasi Video ${fmtSec(input.durationSec)} · ${tags.length} Tag Tercatat</div>
      </div>
    </div>
    <button class="btn-print" onclick="window.print()">Cetak / Simpan PDF</button>
  </header>

  <section class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${tags.length}</div><div class="kpi-lbl">Total Momen Aksi</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#10b981">${goals}</div><div class="kpi-lbl">Gol / Sukses</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#38bdf8">${shots}</div><div class="kpi-lbl">Peluang Tembakan</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#06b6d4">${saves}</div><div class="kpi-lbl">Penyelamatan Kiper</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#f59e0b">${turnovers}</div><div class="kpi-lbl">Turnover / Pelanggaran</div></div>
  </section>

  <section class="two-col">
    <div class="card">
      <div class="card-title">Distribusi Kategori Aksi</div>
      ${catBarsHtml || '<p class="meta">Belum ada data tag.</p>'}
    </div>
    <div class="card">
      <div class="card-title">Leaderboard Pemain (${playerSorted.length})</div>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Pemain</th><th>Total</th><th>Gol</th><th>Tembak</th><th>Telestrasi</th></tr></thead>
          <tbody>${playerRowsHtml}</tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="card-title">Linimasa Kejadian (<span id="shown-count">${tags.length}</span>)</div>
    <div class="filter-bar">
      <input id="search-box" class="search-input" type="search" placeholder="Cari pemain, kategori, hasil, catatan..." />
      <button class="chip active" data-cat="__all__">Semua (${tags.length})</button>
      ${catButtonsHtml}
    </div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Waktu</th><th>Kategori</th><th>Pemain</th><th>Label</th><th>Hasil</th><th>Catatan Pelatih</th></tr></thead>
        <tbody>${timelineRowsHtml}</tbody>
      </table>
    </div>
  </section>
</div>
<script>
(() => {
  let activeCat = '__all__';
  const rows = Array.from(document.querySelectorAll('.event-row'));
  const chips = Array.from(document.querySelectorAll('.chip'));
  const searchEl = document.getElementById('search-box');
  const countEl = document.getElementById('shown-count');
  const apply = () => {
    const q = (searchEl?.value || '').trim().toLowerCase();
    let vis = 0;
    for (const r of rows) {
      const matchCat = activeCat === '__all__' || r.getAttribute('data-cat') === activeCat;
      const matchQ = !q || (r.getAttribute('data-search') || '').includes(q);
      const ok = matchCat && matchQ;
      r.style.display = ok ? '' : 'none';
      if (ok) vis++;
    }
    if (countEl) countEl.textContent = String(vis);
  };
  chips.forEach((c) => c.addEventListener('click', () => {
    activeCat = c.getAttribute('data-cat') || '__all__';
    chips.forEach((x) => x.classList.toggle('active', x === c));
    apply();
  }));
  searchEl?.addEventListener('input', apply);
})();
</script>
</body>
</html>`;
}

export async function exportInteractiveHtmlStatsReport(
  input: HtmlStatsReportInput
): Promise<string | null> {
  const html = buildInteractiveHtmlStatsReport(input);
  const safeName = (input.matchTitle || 'futsaltag')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();
  return saveTextFilePortable(
    `${safeName}_stats.html`,
    html,
    'text/html;charset=utf-8',
    'Laporan Statistik HTML Interaktif',
    ['html', 'htm']
  );
}
