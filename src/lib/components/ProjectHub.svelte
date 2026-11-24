<script lang="ts">
  import { projectStore } from "$lib/stores/projectStore.svelte";
  import {
    Video,
    Sparkles,
    LayoutGrid,
    Upload,
    PlayCircle,
    ArrowRight,
    FolderOpen,
    Clock,
    Award,
    Shield,
    Users,
  } from "lucide-svelte";

  let homeTeam = $state("Tim Kami (Futsal Pro)");
  let awayTeam = $state("Tim Lawan");
  let matchHalf = $state<"Babak 1" | "Babak 2" | "Full Time">("Babak 1");
  let isDragging = $state(false);

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const url = URL.createObjectURL(file);
      projectStore.loadVideo(
        url,
        file.name,
        `${homeTeam} vs ${awayTeam} (${matchHalf})`,
        180,
      );
      projectStore.setStage("tagging");
    }
  }

  function handleQuickClipUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const url = URL.createObjectURL(file);
      projectStore.loadVideo(
        url,
        file.name,
        `Klip Telestrasi: ${file.name}`,
        30,
      );

      // Auto-create a single master tag clip so telestrator can immediately draw on it
      const quickTag = {
        id: `quick-clip-${Date.now()}`,
        title: `Telestrasi: ${file.name.replace(/\.[^/.]+$/, "")}`,
        category: "Transition Attack" as const,
        startTime: 0,
        endTime: 30,
        color: "#38bdf8",
        playerLabel: "#9 Pivot",
        pauseDuration: 3.0,
        drawings: [],
      };
      projectStore.addTag(quickTag);
      projectStore.openClipInTelestrator(quickTag);
    }
  }

  function loadSampleMatch() {
    projectStore.loadSampleDemo();
  }
</script>

<div class="project-hub-container">
  <!-- WELCOME HERO -->
  <div class="hero-section">
    <div class="hero-badge">
      <Award size={14} />
      <span>FUTSAL TACTICAL & VIDEO ANALYSIS PLATFORM</span>
    </div>
    <h1 class="hero-title">
      Selamat Datang di <span class="highlight">TELESLATOR</span>
    </h1>
    <p class="hero-desc">
      Aplikasi analisis video pertandingan, telestrasi AI berstandar siaran TV,
      dan papan taktik profesional untuk pelatih dan analis futsal modern.
    </p>
  </div>

  <!-- WORKFLOW ENTRY CARDS -->
  <div class="cards-grid">
    <!-- CARD 1: FULL MATCH ANALYSIS -->
    <div class="workflow-card primary-card">
      <div class="card-badge">TAHAP LENGKAP</div>
      <div class="card-icon-wrap icon-blue">
        <Video size={28} />
      </div>
      <h3 class="card-title">Analisis Pertandingan Penuh</h3>
      <p class="card-desc">
        Impor video 1 babak atau 40 menit pertandingan futsal. Lakukan
        pemotongan video terpandu (tagging) dengan auto pre/post roll, labeling
        pemain, dan matriks silang taktis.
      </p>

      <div class="match-meta-form">
        <div class="form-row">
          <input
            type="text"
            class="input-meta"
            placeholder="Tim Sendiri"
            bind:value={homeTeam}
          />
          <span class="vs-text">VS</span>
          <input
            type="text"
            class="input-meta"
            placeholder="Tim Lawan"
            bind:value={awayTeam}
          />
        </div>
        <div class="form-row half-select">
          <label class="radio-label">
            <input type="radio" bind:group={matchHalf} value="Babak 1" /> Babak 1
          </label>
          <label class="radio-label">
            <input type="radio" bind:group={matchHalf} value="Babak 2" /> Babak 2
          </label>
          <label class="radio-label">
            <input type="radio" bind:group={matchHalf} value="Full Time" /> Full
          </label>
        </div>
      </div>

      <div class="card-actions">
        <label class="btn-primary-action">
          <Upload size={16} />
          <span>Pilih Video Pertandingan</span>
          <input
            type="file"
            accept="video/*"
            onchange={handleFileUpload}
            style="display: none;"
          />
        </label>
        <button class="btn-sample-action" onclick={loadSampleMatch}>
          <PlayCircle size={14} />
          <span>Gunakan Sampel Demo</span>
        </button>
      </div>
    </div>

    <!-- CARD 2: QUICK TELESTRATOR CLIP -->
    <div class="workflow-card quick-card">
      <div class="card-badge badge-amber">MODE CEPAT</div>
      <div class="card-icon-wrap icon-amber">
        <Sparkles size={28} />
      </div>
      <h3 class="card-title">Studio Telestrasi Singkat</h3>
      <p class="card-desc">
        Miliki klip 10–60 detik dari rekaman kamera HP, TikTok, atau cuplikan
        gol? Masuk langsung ke Studio Telestrasi untuk menggambar spotlight 3D,
        vision cone, dan AI tracking.
      </p>

      <div class="quick-clip-features">
        <div class="feature-item">
          ✓ Langsung menggambar tanpa setup tagging
        </div>
        <div class="feature-item">
          ✓ Spotlight 3D & efek pendar lapangan futsal
        </div>
        <div class="feature-item">
          ✓ AI Auto-tracking pemain & lintasan bola
        </div>
      </div>

      <div class="card-actions">
        <label class="btn-amber-action">
          <FolderOpen size={16} />
          <span>Impor Klip & Langsung Gambar</span>
          <input
            type="file"
            accept="video/*"
            onchange={handleQuickClipUpload}
            style="display: none;"
          />
        </label>
      </div>
    </div>

    <!-- CARD 3: TACTICAL COACH BOARD -->
    <div class="workflow-card coach-card">
      <div class="card-badge badge-green">PAPAN TAKTIK</div>
      <div class="card-icon-wrap icon-green">
        <LayoutGrid size={28} />
      </div>
      <h3 class="card-title">Papan Taktik Futsal 2D</h3>
      <p class="card-desc">
        Rancang pola strategi rotasi 3-1, 4-0 flat, power play 5v4, dan skema
        bola mati (kick-in & corner) dengan animasi pergerakan pemain dan ekspor
        PDF taktik.
      </p>

      <div class="coach-presets-preview">
        <span class="preset-tag">Rotasi 3-1 Pivot</span>
        <span class="preset-tag">4-0 Flat Flank</span>
        <span class="preset-tag">Power Play 5v4</span>
        <span class="preset-tag">Pressing Diamond</span>
      </div>

      <div class="card-actions">
        <button
          class="btn-green-action"
          onclick={() => projectStore.setStage("coachboard")}
        >
          <ArrowRight size={16} />
          <span>Buka Papan Taktik (Coach Board)</span>
        </button>
      </div>
    </div>
  </div>

  <!-- BOTTOM PROJECT RECENT INFO -->
  <div class="recent-projects-bar">
    <div class="recent-title">
      <Clock size={16} />
      <span>Alur Kerja Terpandu Once Sport Style:</span>
    </div>
    <div class="workflow-breadcrumbs">
      <div class="crumb active">1. Hub Proyek</div>
      <div class="crumb-arrow">→</div>
      <div class="crumb">2. Layar Tagging & Klip</div>
      <div class="crumb-arrow">→</div>
      <div class="crumb">3. Studio Telestrasi (Draw)</div>
      <div class="crumb-arrow">→</div>
      <div class="crumb">4. Playlist & Ekspor Multi-Format</div>
    </div>
  </div>
</div>

<style>
  .project-hub-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: radial-gradient(ellipse at 50% 15%, #0e2347 0%, #060b14 80%);
    color: #f8fafc;
    padding: 32px 48px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* HERO */
  .hero-section {
    text-align: center;
    max-width: 820px;
    margin: 0 auto 32px auto;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin-bottom: 12px;
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
  }

  .hero-title {
    font-size: 34px;
    font-weight: 900;
    letter-spacing: -0.02em;
    margin: 0 0 12px 0;
    color: #ffffff;
  }

  .highlight {
    background: linear-gradient(135deg, #38bdf8 0%, #60a5fa 50%, #93c5fd 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.4));
  }

  .hero-desc {
    font-size: 14px;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0;
  }

  /* CARDS GRID */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 1240px;
    width: 100%;
    margin: 0 auto;
  }

  .workflow-card {
    background: linear-gradient(180deg, #0d1e38 0%, #071222 100%);
    border: 1px solid #1a355d;
    border-radius: 14px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    position: relative;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7), 0 0 15px rgba(14, 165, 233, 0.06);
  }

  .workflow-card:hover {
    transform: translateY(-5px);
    border-color: #38bdf8;
    box-shadow: 0 20px 35px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(56, 189, 248, 0.25);
  }

  .card-badge {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
  }

  .badge-amber {
    background: rgba(2, 132, 199, 0.2);
    color: #60a5fa;
    border-color: rgba(96, 165, 250, 0.4);
  }

  .badge-green {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.4);
  }

  .card-icon-wrap {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }

  .icon-blue {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(30, 58, 138, 0.5));
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
  }

  .icon-amber {
    background: linear-gradient(135deg, rgba(96, 165, 250, 0.25), rgba(30, 64, 175, 0.5));
    color: #60a5fa;
    border: 1px solid rgba(96, 165, 250, 0.4);
    box-shadow: 0 0 15px rgba(96, 165, 250, 0.3);
  }

  .icon-green {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 78, 59, 0.5));
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.4);
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
  }

  .card-title {
    font-size: 18px;
    font-weight: 800;
    margin: 0 0 8px 0;
    color: #f1f5f9;
  }

  .card-desc {
    font-size: 12px;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0 0 16px 0;
    flex-grow: 1;
  }

  /* FORMS & PREVIEWS */
  .match-meta-form {
    background-color: #091528;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 16px;
    border: 1px solid #1a355d;
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .input-meta {
    flex: 1;
    background-color: #060e1d;
    border: 1px solid #1a355d;
    color: #f8fafc;
    font-size: 11px;
    padding: 7px 10px;
    border-radius: 5px;
    box-sizing: border-box;
  }

  .input-meta:focus {
    outline: none;
    border-color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
  }

  .vs-text {
    font-size: 10px;
    font-weight: 800;
    color: #38bdf8;
  }

  .half-select {
    display: flex;
    justify-content: space-around;
    margin-bottom: 0;
  }

  .radio-label {
    font-size: 10px;
    color: #cbd5e1;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .quick-clip-features {
    background-color: #091528;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    border: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .feature-item {
    font-size: 11px;
    color: #93c5fd;
  }

  .coach-presets-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
    background-color: #091528;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #1a355d;
  }

  .preset-tag {
    font-size: 10px;
    background-color: #060e1d;
    color: #34d399;
    border: 1px solid #064e3b;
    padding: 3px 8px;
    border-radius: 4px;
  }

  /* BUTTONS */
  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: auto;
  }

  .btn-primary-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
    transition: all 0.2s;
  }

  .btn-primary-action:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.55);
    transform: translateY(-1px);
  }

  .btn-sample-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background-color: transparent;
    color: #93c5fd;
    font-size: 11px;
    font-weight: 600;
    padding: 7px 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px dashed #1e3b68;
    transition: all 0.2s;
  }

  .btn-sample-action:hover {
    color: #38bdf8;
    border-color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.1);
  }

  .btn-amber-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7, #1d4ed8);
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 14px rgba(96, 165, 250, 0.35);
    transition: all 0.2s;
  }

  .btn-amber-action:hover {
    background: linear-gradient(135deg, #0369a1, #1e40af);
    box-shadow: 0 0 20px rgba(96, 165, 250, 0.55);
    transform: translateY(-1px);
  }

  .btn-green-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #059669, #047857);
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 14px rgba(16, 185, 129, 0.35);
    transition: all 0.2s;
  }

  .btn-green-action:hover {
    background: linear-gradient(135deg, #047857, #065f46);
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.55);
    transform: translateY(-1px);
  }

  /* RECENT BAR */
  .recent-projects-bar {
    max-width: 1240px;
    width: 100%;
    margin: 32px auto 0 auto;
    background: #091528;
    border: 1px solid #1a355d;
    border-radius: 10px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .recent-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #93c5fd;
  }

  .workflow-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .crumb {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    padding: 4px 10px;
    border-radius: 5px;
    background-color: #060e1d;
    border: 1px solid #162c4a;
  }

  .crumb.active {
    color: #38bdf8;
    background: rgba(14, 165, 233, 0.15);
    border: 1px solid #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
  }

  .crumb-arrow {
    color: #334e77;
    font-size: 11px;
  }
</style>
