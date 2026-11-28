<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { convertFileSrc, invoke } from "@tauri-apps/api/core";
  import {
    projectStore,
    isTauriDesktop,
    parseYouTubeVideoId,
  } from "$lib/stores/projectStore.svelte";
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
    Trophy,
    CheckCircle2,
    Calendar,
    BarChart3,
    Search,
    Copy,
    Trash2,
    RefreshCw,
    Timer,
    Link2,
    Download,
    XCircle,
    Camera,
  } from "lucide-svelte";

  interface Props {
    onOpenTeamDatabase?: () => void;
    onOpenSeasonAnalytics?: () => void;
  }

  let { onOpenTeamDatabase, onOpenSeasonAnalytics }: Props = $props();

  let homeTeam = $state("Tim Kami (Futsal Pro)");
  let awayTeam = $state("Tim Lawan");
  let tournamentName = $state("Liga Futsal Profesional 2026");
  let matchHalf = $state<"Babak 1" | "Babak 2" | "Full Time">("Babak 1");
  let matchKind = $state<"match" | "training">("match");
  let libSearch = $state("");
  let libKind = $state<"all" | "match" | "training">("all");
  let libStatus = $state<"all" | "analysed" | "empty">("all");

  const filteredLibrary = $derived.by(() => {
    const q = libSearch.trim().toLowerCase();
    return projectStore.libraryMatches.filter((m) => {
      if (libKind !== "all" && (m.matchKind ?? "match") !== libKind)
        return false;
      if (libStatus === "analysed" && m.tags.length === 0) return false;
      if (libStatus === "empty" && m.tags.length > 0) return false;
      if (q) {
        const hay =
          `${m.title} ${m.competition || ""} ${m.matchDate || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });
  let homeColor = $state("#0284c7");
  let awayColor = $state("#ef4444");
  let selectedHomeClubId = $state<string>("");
  let selectedAwayClubId = $state<string>("");
  let isDragging = $state(false);
  let fullVideoInputEl: HTMLInputElement | undefined = $state();
  let onlyDrawInputEl: HTMLInputElement | undefined = $state();
  let projectFileInputEl: HTMLInputElement | undefined = $state();
  let quickVideoInputEl: HTMLInputElement | undefined = $state();
  let isMergingVideos = $state(false);
  let mergeStatusMsg = $state<string | null>(null);

  // Tahap S2: Impor Link Online (YouTube / HLS .m3u8 / RTSP / Direct MP4)
  let showOnlineUrlModal = $state(false);
  let onlineUrlInput = $state("");
  let customYtDlpPath = $state("");
  let onlineToolsStatus = $state<{
    yt_dlp_available: boolean;
    yt_dlp_path: string | null;
    yt_dlp_version: string | null;
    ffmpeg_available: boolean;
  } | null>(null);
  let isCheckingTools = $state(false);
  let isInstallingYtDlp = $state(false);
  let isDownloadingOnline = $state(false);
  let onlineUrlError = $state<string | null>(null);

  const detectedOnlineKind = $derived.by(() => {
    const u = onlineUrlInput.trim();
    if (!u) return null;
    if (parseYouTubeVideoId(u)) return "youtube";
    if (/\.m3u8(\?|$|#)/i.test(u) || /^rtsp:|^rtmp:/i.test(u)) return "hls";
    if (/\.(mp4|mov|webm|m4v|mkv)(\?|$|#)/i.test(u)) return "direct";
    return "web";
  });

  let unlistenTauriDrop: (() => void) | null = null;

  onMount(async () => {
    if (!projectStore.clubLibraryLoaded) {
      projectStore.loadClubLibrary();
    }
    if (isTauriDesktop()) {
      projectStore.scanMatchLibrary();
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlistenTauriDrop = await getCurrentWebview().onDragDropEvent(
          async (event) => {
            if (
              event.payload.type === "enter" ||
              event.payload.type === "over"
            ) {
              isDragging = true;
            } else if (event.payload.type === "leave") {
              isDragging = false;
            } else if (event.payload.type === "drop") {
              isDragging = false;
              const droppedPaths = event.payload.paths ?? [];
              const droppedPath = droppedPaths[0];
              if (!droppedPath) return;

              if (!projectStore.confirmDiscardIfDirty("membuka berkas baru"))
                return;

              if (/\.(futsal|json)$/i.test(droppedPath)) {
                try {
                  await projectStore.openProjectFromPath(droppedPath);
                } catch (err: any) {
                  alert(`Gagal membuka berkas proyek: ${err?.message || err}`);
                }
                return;
              }

              const videoDrops = droppedPaths.filter((p) =>
                /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(p),
              );
              if (videoDrops.length > 0) {
                await openMergedOrSingleVideos(videoDrops);
              }
            }
          },
        );
      } catch {
        // Fallback ke HTML5 drag-drop biasa
      }
    }
  });

  onDestroy(() => {
    if (unlistenTauriDrop) {
      unlistenTauriDrop();
      unlistenTauriDrop = null;
    }
  });

  function handleSelectHomeClub(clubId: string) {
    selectedHomeClubId = clubId;
    const club = projectStore.clubLibrary.find((c) => c.id === clubId);
    if (club) {
      homeTeam = club.name;
      homeColor = club.jerseyColor;
    }
  }

  function handleSelectAwayClub(clubId: string) {
    selectedAwayClubId = clubId;
    const club = projectStore.clubLibrary.find((c) => c.id === clubId);
    if (club) {
      awayTeam = club.name;
      awayColor = club.jerseyColor;
    }
  }

  const TEAM_COLORS = [
    "#0284c7",
    "#ef4444",
    "#10b981",
    "#f59e0b",
    "#ffffff",
    "#1e293b",
  ];

  async function openMergedOrSingleVideos(paths: string[]) {
    if (paths.length === 0) return;
    let finalPath = paths[0];
    if (paths.length >= 2) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const firstDir = paths[0].replace(/[\\/][^\\/]+$/, "");
      const safeName = `${homeTeam}_vs_${awayTeam}_merged`
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase();
      const sep =
        firstDir.includes("\\") && !firstDir.includes("/") ? "\\" : "/";
      const targetOut = await save({
        title: `Simpan Hasil Gabung ${paths.length} Bagian Video`,
        defaultPath: firstDir
          ? `${firstDir}${sep}${safeName}.mp4`
          : `${safeName}.mp4`,
        filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      });
      if (!targetOut) return;

      isMergingVideos = true;
      mergeStatusMsg = `Menggabungkan ${paths.length} file video menjadi 1 pertandingan utuh...`;
      try {
        finalPath = await invoke<string>("merge_source_videos_ffmpeg", {
          inputPaths: paths,
          outputPath: targetOut,
        });
      } finally {
        isMergingVideos = false;
        mergeStatusMsg = null;
      }
    }

    const assetUrl = convertFileSrc(finalPath);
    projectStore.loadVideo(
      assetUrl,
      finalPath,
      `${homeTeam} vs ${awayTeam} (${matchHalf})`,
      180,
    );
    projectStore.matchKind = matchKind;
    projectStore.competitionName = tournamentName.trim();
    if (selectedHomeClubId || selectedAwayClubId) {
      projectStore.applyClubsToMatchRoster(
        selectedHomeClubId || null,
        selectedAwayClubId || null,
      );
    }
    projectStore.setStage("tagging");
  }

  function handleStartLiveStopwatch() {
    if (!projectStore.confirmDiscardIfDirty("memulai tagging live stopwatch"))
      return;
    projectStore.startLiveStopwatchSession(
      `${homeTeam} vs ${awayTeam} (${matchHalf})`,
      matchKind,
      tournamentName.trim(),
    );
    if (selectedHomeClubId || selectedAwayClubId) {
      projectStore.applyClubsToMatchRoster(
        selectedHomeClubId || null,
        selectedAwayClubId || null,
      );
    }
  }

  async function handleStartQuickOnlyDraw() {
    if (
      !projectStore.confirmDiscardIfDirty(
        "membuka Telestrasi Cepat (OnlyDraw)",
      )
    )
      return;
    if (isTauriDesktop()) {
      await projectStore.startQuickOnlyDrawSession();
    } else {
      onlyDrawInputEl?.click();
    }
  }

  function handleOnlyDrawFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const url = URL.createObjectURL(file);
    const title = file.name.replace(/\.[^.]+$/, "");
    projectStore.startQuickOnlyDrawSession({
      filePath: null,
      videoSrc: url,
      title,
    });
  }

  async function handleStartLiveCapture() {
    if (
      !projectStore.confirmDiscardIfDirty(
        "memulai rekaman kamera / capture card live",
      )
    )
      return;
    let targetPath: string | null = null;
    if (isTauriDesktop()) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const safeName = `${homeTeam}_vs_${awayTeam}_live`
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .toLowerCase();
        const picked = await save({
          title: "Pilih Lokasi Simpan Video MP4 Rekaman Live",
          defaultPath: `${safeName}.mp4`,
          filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
        });
        if (!picked) return;
        targetPath = picked;
      } catch {
        // Fallback: user akan ditanya saat menekan Mulai Rekam
      }
    }
    projectStore.startLiveCaptureSession(
      `${homeTeam} vs ${awayTeam} (${matchHalf})`,
      targetPath,
      matchKind,
      tournamentName.trim(),
    );
    if (selectedHomeClubId || selectedAwayClubId) {
      projectStore.applyClubsToMatchRoster(
        selectedHomeClubId || null,
        selectedAwayClubId || null,
      );
    }
  }

  async function refreshOnlineToolsStatus() {
    if (!isTauriDesktop()) return;
    isCheckingTools = true;
    try {
      onlineToolsStatus = await invoke("check_online_tools_status", {
        customYtDlpPath: customYtDlpPath.trim() || null,
      });
    } catch {
      onlineToolsStatus = null;
    } finally {
      isCheckingTools = false;
    }
  }

  function openOnlineUrlModal() {
    if (!projectStore.confirmDiscardIfDirty("membuka video dari tautan online"))
      return;
    onlineUrlError = null;
    showOnlineUrlModal = true;
    refreshOnlineToolsStatus();
  }

  async function handleInstallYtDlp() {
    if (!isTauriDesktop() || isInstallingYtDlp) return;
    isInstallingYtDlp = true;
    onlineUrlError = null;
    try {
      const path = await invoke<string>("install_yt_dlp_tool");
      customYtDlpPath = path;
      await refreshOnlineToolsStatus();
    } catch (err: any) {
      onlineUrlError = String(err?.message || err);
    } finally {
      isInstallingYtDlp = false;
    }
  }

  async function handlePickCustomYtDlp() {
    if (!isTauriDesktop()) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        title: "Pilih Binary yt-dlp (.exe)",
        multiple: false,
      });
      if (picked && typeof picked === "string") {
        customYtDlpPath = picked;
        await refreshOnlineToolsStatus();
      }
    } catch (err: any) {
      onlineUrlError = String(err?.message || err);
    }
  }

  function handleStreamOnlineVideo() {
    const url = onlineUrlInput.trim();
    if (!/^https?:\/\//i.test(url)) {
      onlineUrlError =
        "Mode stream langsung di pemutar membutuhkan URL diawali https:// atau http://.";
      return;
    }
    if (detectedOnlineKind === "hls" || detectedOnlineKind === "web") {
      onlineUrlError =
        "Tautan halaman web/HLS ini tidak dapat diputar langsung sebagai stream HTML5. Klik 'Unduh MP4 Lokal (Penuh)' agar siap dianalisis.";
      return;
    }
    onlineUrlError = null;
    projectStore.loadOnlineVideo(
      url,
      `${homeTeam} vs ${awayTeam} (${matchHalf})`,
      matchKind,
      tournamentName.trim(),
    );
    if (selectedHomeClubId || selectedAwayClubId) {
      projectStore.applyClubsToMatchRoster(
        selectedHomeClubId || null,
        selectedAwayClubId || null,
      );
    }
    showOnlineUrlModal = false;
  }

  async function handleDownloadOnlineVideo() {
    const url = onlineUrlInput.trim();
    if (!/^(https?|rtsp|rtmp|rtmps):\/\//i.test(url)) {
      onlineUrlError =
        "URL tidak valid. Awali dengan https://, http://, rtsp://, atau rtmp://.";
      return;
    }
    if (!isTauriDesktop()) return;
    onlineUrlError = null;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const safeName = `${homeTeam}_vs_${awayTeam}_online`
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase();
      const targetOut = await save({
        title: "Simpan Unduhan Video MP4 Lokal",
        defaultPath: `${safeName}.mp4`,
        filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      });
      if (!targetOut) return;

      isDownloadingOnline = true;
      const savedPath = await invoke<string>("download_online_video_ffmpeg", {
        url,
        outputPath: targetOut,
        customYtDlpPath: customYtDlpPath.trim() || null,
      });
      showOnlineUrlModal = false;
      await openMergedOrSingleVideos([savedPath]);
    } catch (err: any) {
      onlineUrlError = String(err?.message || err);
    } finally {
      isDownloadingOnline = false;
    }
  }

  async function handleTauriVideoClick(quickTelestrate = false) {
    if (!projectStore.confirmDiscardIfDirty("membuka video baru")) return;
    if (!isTauriDesktop()) {
      if (quickTelestrate) {
        quickVideoInputEl?.click();
      } else {
        fullVideoInputEl?.click();
      }
      return;
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        title: quickTelestrate
          ? "Pilih Klip Video untuk Telestrasi"
          : "Pilih Video Pertandingan (Bisa >1 File untuk Auto-Gabung)",
        multiple: !quickTelestrate,
        filters: [
          {
            name: "Video Files",
            extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"],
          },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;

      if (quickTelestrate) {
        const first = paths[0];
        const assetUrl = convertFileSrc(first);
        const fileName = first.split(/[\\/]/).pop() || first;
        projectStore.loadVideo(
          assetUrl,
          first,
          `Klip Telestrasi: ${fileName}`,
          30,
        );
        const quickTag = {
          id: `quick-clip-${Date.now()}`,
          title: `Telestrasi: ${fileName.replace(/\.[^/.]+$/, "")}`,
          category: "Transition Attack" as const,
          startTime: 0,
          endTime: 30,
          color: "#38bdf8",
          playerLabel: "#9 Pivot",
          pauseDuration: 3.0,
          freezeTimestamp: 15.0,
          drawings: [],
        };
        projectStore.addTag(quickTag);
        projectStore.openClipInTelestrator(quickTag);
      } else {
        await openMergedOrSingleVideos(paths);
      }
    } catch (err: any) {
      alert(`Gagal membuka / menggabungkan video: ${err?.message || err}`);
    }
  }

  async function handleTauriProjectOpenClick() {
    if (!projectStore.confirmDiscardIfDirty("membuka berkas proyek lain"))
      return;
    if (!isTauriDesktop()) {
      projectFileInputEl?.click();
      return;
    }
    try {
      await projectStore.openProjectFromDisk();
    } catch (err: any) {
      alert(`Gagal membuka berkas proyek: ${err?.message || err}`);
    }
  }

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      processSelectedFile(input.files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (isTauriDesktop()) return;
    if (
      e.dataTransfer &&
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  }

  function processSelectedFile(file: File) {
    if (!projectStore.confirmDiscardIfDirty("membuka video baru")) return;
    const url = URL.createObjectURL(file);
    projectStore.loadVideo(
      url,
      file.name,
      `${homeTeam} vs ${awayTeam} (${matchHalf})`,
      180,
    );
    projectStore.matchKind = matchKind;
    projectStore.competitionName = tournamentName.trim();
    if (selectedHomeClubId || selectedAwayClubId) {
      projectStore.applyClubsToMatchRoster(
        selectedHomeClubId || null,
        selectedAwayClubId || null,
      );
    }
    projectStore.setStage("tagging");
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
    if (!projectStore.confirmDiscardIfDirty("memuat sampel demo")) return;
    projectStore.loadSampleDemo();
  }

  async function handleOpenLibraryMatch(filePath: string | null) {
    if (!filePath) return;
    if (!projectStore.confirmDiscardIfDirty("membuka pertandingan ini")) return;
    try {
      await projectStore.openProjectFromPath(filePath);
    } catch (err: any) {
      alert(`Gagal membuka pertandingan: ${err?.message || err}`);
    }
  }

  async function handleDeleteLibraryMatch(
    filePath: string | null,
    title: string,
  ) {
    if (!filePath) return;
    if (
      !confirm(
        `Hapus file analisis "${title}" dari folder pustaka? File video MP4 asli tidak akan terhapus.`,
      )
    )
      return;
    try {
      await projectStore.deleteMatchFile(filePath);
    } catch (err: any) {
      alert(`Gagal menghapus file: ${err?.message || err}`);
    }
  }

  function handleProjectFileOpen(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          const ok = projectStore.importProjectJson(text);
          if (ok) {
            alert(`Berkas proyek "${file.name}" berhasil dimuat!`);
          } else {
            alert("Format berkas proyek tidak valid.");
          }
        }
      };
      reader.readAsText(file);
    }
  }
</script>

<div class="project-hub-container">
  <!-- WELCOME HERO -->
  <div class="hero-section">
    <div class="hero-badge">
      <Award size={13} />
      <span>FUTSAL VIDEO ANALYSIS & AI TELESTRATION</span>
    </div>
    <h1 class="hero-title">
      Selamat Datang di <span class="highlight">ARF FUTSALTAG</span>
    </h1>
    <p class="hero-desc">
      Platform analisis video futsal profesional, auto pre/post roll tagging,
      telestrasi siaran TV, dan papan taktik standar FIFA (40m x 20m).
    </p>
  </div>

  {#if projectStore.autoSaveMeta}
    <div class="autosave-recovery-banner" role="status">
      <div class="rec-info">
        <Clock size={16} />
        <div>
          <strong>Cadangan Sesi Terakhir Tersedia:</strong>
          <span
            >{projectStore.autoSaveMeta.title} ({projectStore.autoSaveMeta
              .tagCount} klip)</span
          >
        </div>
      </div>
      <div class="rec-actions">
        <button
          type="button"
          class="btn-rec-restore"
          onclick={() => projectStore.restoreAutoSave()}
        >
          Pulihkan Cadangan
        </button>
        <button
          type="button"
          class="btn-rec-dismiss"
          onclick={() => projectStore.clearAutoSave()}
        >
          Abaikan
        </button>
      </div>
    </div>
  {/if}

  <!-- QUICK RECENT PROJECTS STRIP (1-CLICK OPEN) -->
  {#if projectStore.recentProjects.length > 0}
    <div class="quick-recent-strip">
      <span class="qrs-lbl">
        <Clock size={12} />
        <span>Proyek Terakhir:</span>
      </span>
      <div class="qrs-list">
        {#each projectStore.recentProjects.slice(0, 4) as rp (rp.filePath)}
          <button
            type="button"
            class="qrs-pill"
            onclick={() => handleOpenLibraryMatch(rp.filePath)}
            title={rp.filePath}
          >
            <span class="qrs-title">{rp.title}</span>
            <span class="qrs-cnt">{rp.tagCount} klip</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- WORKFLOW ENTRY CARDS -->
  <div class="cards-grid">
    <!-- CARD 1: FULL MATCH ANALYSIS (MOMEN SPORTS WORKSPACE) -->
    <div
      class="workflow-card primary-card"
      class:dragover={isDragging}
      ondragover={(e) => {
        e.preventDefault();
        isDragging = true;
      }}
      ondragleave={() => (isDragging = false)}
      ondrop={handleDrop}
      role="region"
      aria-label="Upload Video Pertandingan"
    >
      <div class="card-badge">TAHAP LENGKAP</div>
      <div class="card-icon-wrap icon-blue">
        <Video size={26} />
      </div>
      <h3 class="card-title">Analisis Pertandingan Penuh</h3>
      <p class="card-desc">
        Impor video pertandingan futsal (1 babak / 40 menit). Lakukan pemotongan
        momen instan (tagging) dengan tombol aksi cepat, labeling pemain, dan
        matriks silang statistik.
      </p>

      <!-- MATCH SETUP FORM -->
      <div class="match-meta-form">
        <!-- Tournament Name & Kind -->
        <div class="form-row-sm">
          <Trophy size={11} class="text-sky-400" />
          <input
            type="text"
            class="input-meta-compact"
            placeholder="Nama Turnamen / Latihan"
            bind:value={tournamentName}
          />
          <select
            class="club-select kind-mini-sel"
            bind:value={matchKind}
            title="Jenis sesi analisis"
          >
            <option value="match">Pertandingan</option>
            <option value="training">Latihan</option>
          </select>
        </div>

        <!-- Club Library Dropdowns -->
        <div class="club-select-row">
          <select
            class="club-select"
            value={selectedHomeClubId}
            onchange={(e) =>
              handleSelectHomeClub(
                (e.currentTarget as HTMLSelectElement).value,
              )}
            title="Pilih Klub Home dari Library (otomatis isi roster)"
          >
            <option value="">-- Klub Home (Library) --</option>
            {#each projectStore.clubLibrary as c (c.id)}
              <option value={c.id}>{c.name} ({c.players.length} pemain)</option>
            {/each}
          </select>
          <select
            class="club-select"
            value={selectedAwayClubId}
            onchange={(e) =>
              handleSelectAwayClub(
                (e.currentTarget as HTMLSelectElement).value,
              )}
            title="Pilih Profil Lawan dari Library"
          >
            <option value="">-- Klub Away (Library) --</option>
            {#each projectStore.clubLibrary as c (c.id)}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>

        <!-- Teams row with jersey color pills -->
        <div class="form-row teams-setup-row">
          <div class="team-input-group">
            <span class="color-dot" style="background-color: {homeColor}"
            ></span>
            <input
              type="text"
              class="input-meta"
              placeholder="Tim Kandang"
              bind:value={homeTeam}
            />
          </div>

          <span class="vs-text">VS</span>

          <div class="team-input-group">
            <span class="color-dot" style="background-color: {awayColor}"
            ></span>
            <input
              type="text"
              class="input-meta"
              placeholder="Tim Tandang"
              bind:value={awayTeam}
            />
          </div>
        </div>

        <!-- Period selector -->
        <div class="half-select">
          <label class="radio-label" class:selected={matchHalf === "Babak 1"}>
            <input type="radio" bind:group={matchHalf} value="Babak 1" /> Babak 1
            (20m)
          </label>
          <label class="radio-label" class:selected={matchHalf === "Babak 2"}>
            <input type="radio" bind:group={matchHalf} value="Babak 2" /> Babak 2
            (20m)
          </label>
          <label class="radio-label" class:selected={matchHalf === "Full Time"}>
            <input type="radio" bind:group={matchHalf} value="Full Time" /> Penuh
            (40m)
          </label>
        </div>
      </div>

      <!-- ACTIONS -->
      <div class="card-actions">
        <button
          type="button"
          class="btn-primary-action"
          disabled={isMergingVideos}
          onclick={() => handleTauriVideoClick(false)}
          title="Pilih 1 file video atau beberapa bagian (Babak 1 + Babak 2 / GoPro) untuk digabung otomatis"
        >
          <Upload size={15} />
          <span
            >{isMergingVideos
              ? "Menggabungkan Video..."
              : "Pilih / Gabung Video MP4"}</span
          >
        </button>
        {#if mergeStatusMsg}
          <div class="merge-status-note">{mergeStatusMsg}</div>
        {/if}
        <div class="hub-sec-grid">
          <button
            type="button"
            class="btn-load-project"
            onclick={handleStartLiveStopwatch}
            title="Catat tag, pemain & menit bermain langsung di lapangan pakai Stopwatch (video bisa ditautkan nanti via Relink)"
          >
            <Timer size={13} />
            <span>Stopwatch Live</span>
          </button>
          <button
            type="button"
            class="btn-load-project"
            onclick={openOnlineUrlModal}
            title="Putar langsung atau unduh dari link YouTube, HLS (.m3u8), RTSP, atau MP4"
          >
            <Link2 size={13} />
            <span>Link Online</span>
          </button>
          <button
            type="button"
            class="btn-load-project"
            onclick={handleStartLiveCapture}
            title="Rekam langsung dari Webcam, GoPro mode Webcam, atau HDMI Capture Card sambil Live Tagging"
          >
            <Camera size={13} />
            <span>Kamera Live</span>
          </button>
          <button
            type="button"
            class="btn-load-project"
            title="Buka Proyek yang Sudah Ada (.futsal / .json)"
            onclick={handleTauriProjectOpenClick}
          >
            <FolderOpen size={13} />
            <span>Buka .futsal</span>
          </button>
        </div>
        <input
          bind:this={fullVideoInputEl}
          type="file"
          accept="video/*"
          onchange={handleFileUpload}
          style="display: none;"
        />
        <input
          bind:this={projectFileInputEl}
          type="file"
          accept=".futsal,.json"
          onchange={handleProjectFileOpen}
          style="display: none;"
        />
      </div>
    </div>

    <!-- CARD 2: QUICK TELESTRATOR CLIP (ONCE SPORT STYLE) -->
    <div class="workflow-card quick-card">
      <div class="card-badge badge-amber">MODE CEPAT</div>
      <div class="card-icon-wrap icon-amber">
        <Sparkles size={26} />
      </div>
      <h3 class="card-title">Studio Telestrasi Singkat</h3>
      <p class="card-desc">
        Punya cuplikan 10–60 detik rekaman ponsel atau cuplikan gol? Langsung
        buka Studio Telestrasi untuk menggambar spotlight 3D, lingkaran pemain,
        dan radar visi.
      </p>

      <div class="quick-clip-features">
        <div class="feature-item">
          <CheckCircle2 size={12} class="text-sky-400" />
          <span>Langsung menggambar tanpa setup tagging</span>
        </div>
        <div class="feature-item">
          <CheckCircle2 size={12} class="text-sky-400" />
          <span>Spotlight 3D & efek pendar lapangan futsal</span>
        </div>
        <div class="feature-item">
          <CheckCircle2 size={12} class="text-sky-400" />
          <span>Freeze-frame slider & preset durasi jeda</span>
        </div>
      </div>

      <div class="card-actions">
        <button
          type="button"
          class="btn-amber-action"
          onclick={() => handleTauriVideoClick(true)}
        >
          <FolderOpen size={15} />
          <span>Impor Klip & Langsung Gambar</span>
        </button>
        <button
          type="button"
          class="btn-load-project"
          onclick={handleStartQuickOnlyDraw}
          title="Buka 1 klip video langsung ke Studio Telestrasi tanpa perlu setup board atau roster (Once Sport OnlyDraw)"
        >
          <Sparkles size={14} />
          <span>Telestrasi Cepat (1 Klip — OnlyDraw)</span>
        </button>
        <input
          bind:this={quickVideoInputEl}
          type="file"
          accept="video/*"
          onchange={handleQuickClipUpload}
          style="display: none;"
        />
        <input
          bind:this={onlyDrawInputEl}
          type="file"
          accept="video/*"
          onchange={handleOnlyDrawFileUpload}
          style="display: none;"
        />
      </div>
    </div>

    <!-- CARD 3: TACTICAL COACH BOARD -->
    <div class="workflow-card coach-card">
      <div class="card-badge badge-green">PAPAN TAKTIK</div>
      <div class="card-icon-wrap icon-green">
        <LayoutGrid size={26} />
      </div>
      <h3 class="card-title">Papan Taktik Futsal (2D)</h3>
      <p class="card-desc">
        Rancang simulasi rotasi 3-1, 4-0 flat, power play 5v4, dan skema bola
        mati (kick-in & corner) dengan animasi pergerakan pemain dan ekspor
        dokumen taktik PDF.
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
          <ArrowRight size={15} />
          <span>Buka Papan Taktik (Coach Board)</span>
        </button>
      </div>
    </div>
  </div>

  <!-- MATCH LIBRARY & RECENT PROJECTS PANEL (MOMEN SPORTS STYLE) -->
  <div class="library-hub-panel">
    <div class="lhp-top">
      <div class="recent-title">
        <FolderOpen size={15} class="text-sky-400" />
        <span
          >Daftar Pertandingan Pustaka ({projectStore.libraryMatches
            .length})</span
        >
      </div>

      <div class="lhp-controls">
        <div class="lhp-search">
          <Search size={12} />
          <input
            type="text"
            bind:value={libSearch}
            placeholder="Cari laga / turnamen..."
          />
        </div>
        <div class="lhp-seg">
          <button
            type="button"
            class:active={libKind === "all"}
            onclick={() => (libKind = "all")}>Semua</button
          >
          <button
            type="button"
            class:active={libKind === "match"}
            onclick={() => (libKind = "match")}>Pertandingan</button
          >
          <button
            type="button"
            class:active={libKind === "training"}
            onclick={() => (libKind = "training")}>Latihan</button
          >
        </div>
        <div class="lhp-seg">
          <button
            type="button"
            class:active={libStatus === "all"}
            onclick={() => (libStatus = "all")}>Semua Status</button
          >
          <button
            type="button"
            class:active={libStatus === "analysed"}
            onclick={() => (libStatus = "analysed")}>Ada Klip</button
          >
          <button
            type="button"
            class:active={libStatus === "empty"}
            onclick={() => (libStatus = "empty")}>Kosong</button
          >
        </div>
        {#if isTauriDesktop()}
          <button
            type="button"
            class="recent-chip"
            onclick={() => projectStore.pickMatchLibraryFolder()}
            title={projectStore.matchLibraryFolder || "Pilih Folder Pustaka"}
          >
            <FolderOpen size={12} class="text-sky-400" />
            <span class="chip-name">Folder</span>
          </button>
          <button
            type="button"
            class="recent-chip"
            onclick={() => projectStore.scanMatchLibrary()}
            title="Scan ulang folder .futsal"
          >
            <RefreshCw size={12} class="text-emerald-400" />
            <span class="chip-name">Scan</span>
          </button>
        {/if}
      </div>
    </div>

    {#if filteredLibrary.length > 0}
      <div class="lhp-grid">
        {#each filteredLibrary as m (m.id)}
          <div class="lhp-card">
            <div class="lhp-card-main">
              <span
                class="lhp-kind-badge"
                class:training={m.matchKind === "training"}
              >
                {m.matchKind === "training" ? "Latihan" : "Laga"}
              </span>
              <span class="lhp-card-title" title={m.filePath || m.title}
                >{m.title}</span
              >
              <span class="chip-meta"
                >{m.tags.length} Klip{m.competition
                  ? ` · ${m.competition}`
                  : ""}</span
              >
            </div>
            <div class="lhp-card-actions">
              <button
                type="button"
                class="lhp-btn open"
                onclick={() => handleOpenLibraryMatch(m.filePath)}
              >
                Lanjutkan
              </button>
              <button
                type="button"
                class="lhp-btn"
                onclick={() => projectStore.duplicateMatchFile(m)}
                title="Duplikat file analisis"
              >
                <Copy size={11} />
              </button>
              <button
                type="button"
                class="lhp-btn del"
                onclick={() => handleDeleteLibraryMatch(m.filePath, m.title)}
                title="Hapus file .futsal"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="lhp-empty">
        Belum ada file `.futsal` tersimpan di folder pustaka{projectStore.matchLibraryFolder
          ? ` (${projectStore.matchLibraryFolder})`
          : ""}. Simpan proyek dengan Ctrl+S atau pilih folder pustaka.
      </div>
    {/if}

    <div class="recent-projects-bar">
      <div class="recent-title">
        <Clock size={14} class="text-sky-400" />
        <span>Pintasan Cepat:</span>
      </div>
      <div class="recent-chips-row">
        <button class="recent-chip" onclick={loadSampleMatch}>
          <span class="chip-status">⚽ Sampel Demo</span>
          <span class="chip-name">Pendekar United vs Blacksteel</span>
          <span class="chip-meta">(Babak 1 • 3 Klip Taktis)</span>
        </button>
        {#if onOpenTeamDatabase}
          <button
            type="button"
            class="recent-chip"
            onclick={onOpenTeamDatabase}
          >
            <Shield size={12} class="text-sky-400" />
            <span class="chip-name"
              >Library Klub ({projectStore.clubLibrary.length})</span
            >
          </button>
        {/if}
        {#if onOpenSeasonAnalytics}
          <button
            type="button"
            class="recent-chip"
            onclick={onOpenSeasonAnalytics}
          >
            <BarChart3 size={12} class="text-emerald-400" />
            <span class="chip-name">Season Analytics Hub</span>
          </button>
        {/if}
        <div class="workflow-breadcrumbs">
          <span class="crumb-text">Alur 4 Tahap:</span>
          <span class="crumb active">1. Hub</span>
          <span class="crumb-arrow">→</span>
          <span class="crumb">2. Tagging</span>
          <span class="crumb-arrow">→</span>
          <span class="crumb">3. Telestrasi</span>
          <span class="crumb-arrow">→</span>
          <span class="crumb">4. Presentasi & Ekspor</span>
        </div>
      </div>
    </div>
  </div>

  {#if showOnlineUrlModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="online-modal-backdrop"
      role="presentation"
      onclick={() => !isDownloadingOnline && !isInstallingYtDlp && (showOnlineUrlModal = false)}
    >
      <div
        class="online-modal-card"
        role="dialog"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="om-header">
          <div class="om-title-wrap">
            <Link2 size={16} class="text-sky-400" />
            <h3>Impor Link Video Online</h3>
          </div>
          <button
            type="button"
            class="om-close"
            disabled={isDownloadingOnline || isInstallingYtDlp}
            onclick={() => (showOnlineUrlModal = false)}
            title="Tutup"
          >
            <XCircle size={16} />
          </button>
        </div>

        <p class="om-desc">
          Tempel URL pertandingan dari <strong>YouTube</strong> (video/live/shorts), tautan langsung <strong>.mp4/.webm</strong>, atau stream <strong>.m3u8 / RTSP</strong>.
        </p>

        <label class="om-field">
          <span>Tautan Video Online</span>
          <input
            type="url"
            class="om-input"
            bind:value={onlineUrlInput}
            placeholder="https://www.youtube.com/watch?v=... atau https://.../match.mp4"
          />
        </label>

        {#if detectedOnlineKind}
          <div class="om-kind-row">
            <span class="om-kind-pill">
              {#if detectedOnlineKind === "youtube"}
                Terdeteksi: YouTube (ID: {parseYouTubeVideoId(onlineUrlInput)})
              {:else if detectedOnlineKind === "hls"}
                Terdeteksi: Stream HLS / RTSP (Disarankan Unduh via FFmpeg)
              {:else if detectedOnlineKind === "direct"}
                Terdeteksi: File Video Direct HTTP/HTTPS
              {:else}
                Tautan Web Video (Google Drive / Medsos) — gunakan Unduh MP4 Lokal via yt-dlp
              {/if}
            </span>
          </div>
        {/if}

        {#if isTauriDesktop()}
          <div class="om-tools-box">
            <div class="om-tools-row">
              <span>
                Status <code>yt-dlp</code>:
                {#if isCheckingTools}
                  <strong>Memeriksa...</strong>
                {:else if onlineToolsStatus?.yt_dlp_available}
                  <strong class="ok">Siap ({onlineToolsStatus.yt_dlp_version || "terpasang"})</strong>
                {:else}
                  <strong class="warn">Belum terpasang (perlu jika ingin unduh YouTube ke MP4)</strong>
                {/if}
              </span>
              <div class="om-tools-btns">
                {#if !onlineToolsStatus?.yt_dlp_available}
                  <button
                    type="button"
                    class="om-mini-btn"
                    disabled={isInstallingYtDlp || isDownloadingOnline}
                    onclick={handleInstallYtDlp}
                  >
                    {isInstallingYtDlp ? "Mengunduh yt-dlp..." : "Pasang yt-dlp Otomatis"}
                  </button>
                {/if}
                <button
                  type="button"
                  class="om-mini-btn"
                  disabled={isInstallingYtDlp || isDownloadingOnline}
                  onclick={handlePickCustomYtDlp}
                >
                  Pilih Manual...
                </button>
              </div>
            </div>
          </div>
        {/if}

        {#if onlineUrlError}
          <div class="om-error">{onlineUrlError}</div>
        {/if}

        <div class="om-actions">
          <button
            type="button"
            class="om-btn primary"
            disabled={!onlineUrlInput.trim() || isDownloadingOnline || detectedOnlineKind === "hls" || detectedOnlineKind === "web"}
            onclick={handleStreamOnlineVideo}
            title="Langsung putar & tagging tanpa mengunduh file MP4 (khusus YouTube / Direct MP4 HTTP)"
          >
            <PlayCircle size={15} />
            <span>Stream Langsung & Tagging</span>
          </button>
          {#if isTauriDesktop()}
            <button
              type="button"
              class="om-btn secondary"
              disabled={!onlineUrlInput.trim() || isDownloadingOnline || isInstallingYtDlp}
              onclick={handleDownloadOnlineVideo}
              title="Simpan ke file MP4 lokal agar Telestrasi Frame, AI Tracking & Ekspor Klip Video aktif penuh"
            >
              <Download size={15} />
              <span>{isDownloadingOnline ? "Mengunduh ke MP4..." : "Unduh MP4 Lokal (Penuh)"}</span>
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .project-hub-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: radial-gradient(ellipse at 50% 15%, #0e2347 0%, #060b14 80%);
    color: #f0f6fc;
    padding: 14px 24px 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 12px;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      sans-serif;
  }

  /* HERO */
  .hero-section {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
    padding: 3px 12px;
    border-radius: 999px;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
  }

  .hero-title {
    font-size: clamp(20px, 2.4vw, 28px);
    font-weight: 900;
    letter-spacing: -0.02em;
    margin: 0 0 4px 0;
    color: #ffffff;
  }

  .highlight {
    background: linear-gradient(135deg, #38bdf8 0%, #60a5fa 50%, #93c5fd 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.4));
  }

  .autosave-recovery-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 10px 14px;
    background: linear-gradient(
      90deg,
      rgba(2, 132, 199, 0.16),
      rgba(16, 185, 129, 0.12)
    );
    border: 1px solid rgba(56, 189, 248, 0.45);
    border-radius: 10px;
  }

  .rec-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: #e0f2fe;
  }

  .rec-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-rec-restore {
    background: #0284c7;
    border: 1px solid #38bdf8;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-rec-dismiss {
    background: transparent;
    border: 1px solid #1e3b68;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
  }

  .hero-desc {
    font-size: 12px;
    line-height: 1.45;
    color: #94a3b8;
    margin: 0;
  }

  .quick-recent-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 6px 12px;
    background: rgba(9, 19, 34, 0.85);
    border: 1px solid #1a355d;
    border-radius: 9px;
  }

  .qrs-lbl {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    font-weight: 800;
    color: #7dd3fc;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .qrs-list {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }

  .qrs-list::-webkit-scrollbar {
    display: none;
  }

  .qrs-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #0d1e38;
    border: 1px solid #1e3b68;
    color: #e2e8f0;
    font-size: 10.5px;
    font-weight: 600;
    padding: 4px 9px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .qrs-pill:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .qrs-title {
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .qrs-cnt {
    font-size: 9.5px;
    color: #38bdf8;
    font-weight: 700;
  }

  .hub-sec-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .hub-sec-grid .btn-load-project {
    padding: 7px 8px;
    font-size: 10.5px;
    justify-content: center;
  }

  /* CARDS GRID */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  .workflow-card {
    background: linear-gradient(180deg, #0d1e38 0%, #071222 100%);
    border: 1px solid #1a355d;
    border-radius: 14px;
    padding: 16px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow:
      0 10px 30px -10px rgba(0, 0, 0, 0.7),
      0 0 15px rgba(14, 165, 233, 0.06);
  }

  @media (max-width: 1160px) {
    .cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .project-hub-container {
      padding: 14px 14px 28px;
    }

    .cards-grid {
      grid-template-columns: 1fr;
    }

    .btn-primary-action,
    .btn-load-project {
      min-height: 40px;
    }
  }

  @media (max-width: 560px) {
    .club-select-row {
      grid-template-columns: 1fr;
    }

    .teams-setup-row {
      flex-direction: column;
      align-items: stretch;
    }

    .half-select {
      flex-wrap: wrap;
      gap: 8px;
    }
  }

  .workflow-card:hover {
    transform: translateY(-4px);
    border-color: #38bdf8;
    box-shadow:
      0 20px 35px -10px rgba(0, 0, 0, 0.8),
      0 0 25px rgba(56, 189, 248, 0.25);
  }

  .workflow-card.dragover {
    border-color: #10b981;
    background: linear-gradient(180deg, #0f2d48 0%, #071526 100%);
    box-shadow: 0 0 24px rgba(16, 185, 129, 0.4);
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
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
  }

  .icon-blue {
    background: linear-gradient(
      135deg,
      rgba(56, 189, 248, 0.25),
      rgba(30, 58, 138, 0.5)
    );
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
  }

  .icon-amber {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.25),
      rgba(30, 64, 175, 0.5)
    );
    color: #60a5fa;
    border: 1px solid rgba(96, 165, 250, 0.4);
    box-shadow: 0 0 15px rgba(96, 165, 250, 0.3);
  }

  .icon-green {
    background: linear-gradient(
      135deg,
      rgba(16, 185, 129, 0.25),
      rgba(6, 78, 59, 0.5)
    );
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.4);
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
  }

  .card-title {
    font-size: 17px;
    font-weight: 800;
    margin: 0 0 8px 0;
    color: #f0f6fc;
  }

  .card-desc {
    font-size: 11px;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0 0 14px 0;
    flex-grow: 1;
  }

  /* FORMS & PREVIEWS */
  .match-meta-form {
    background-color: #091528;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 14px;
    border: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-row-sm {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #060e1d;
    border: 1px solid #1a355d;
    padding: 4px 8px;
    border-radius: 5px;
  }

  .input-meta-compact {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #f0f6fc;
    font-size: 10px;
    font-weight: 600;
  }

  .teams-setup-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .team-input-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #060e1d;
    border: 1px solid #1a355d;
    border-radius: 5px;
    padding: 2px 6px;
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .input-meta {
    flex: 1;
    background: transparent;
    border: none;
    color: #f0f6fc;
    font-size: 10px;
    padding: 5px 0;
    outline: none;
    width: 100%;
  }

  .vs-text {
    font-size: 10px;
    font-weight: 900;
    color: #38bdf8;
  }

  .half-select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .radio-label {
    flex: 1;
    font-size: 9px;
    color: #94a3b8;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #060e1d;
    border: 1px solid #1a355d;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .radio-label.selected {
    color: #38bdf8;
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
  }

  .radio-label input {
    accent-color: #38bdf8;
  }

  .card-actions {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .btn-primary-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
    color: #ffffff;
    padding: 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
    border: 1px solid #38bdf8;
    transition: all 0.2s ease;
  }

  .btn-primary-action:hover {
    background: linear-gradient(135deg, #0369a1 0%, #1d4ed8 100%);
    box-shadow: 0 6px 20px rgba(2, 132, 199, 0.5);
  }

  .btn-load-project {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: linear-gradient(
      135deg,
      rgba(14, 165, 233, 0.1),
      rgba(30, 64, 175, 0.15)
    );
    border: 1px dashed #0284c7;
    color: #38bdf8;
    padding: 7px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-load-project:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: linear-gradient(
      135deg,
      rgba(2, 132, 199, 0.3),
      rgba(37, 99, 235, 0.3)
    );
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
  }

  .quick-clip-features {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background-color: #091528;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 14px;
    border: 1px solid #1a355d;
  }

  .feature-item {
    font-size: 10px;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-amber-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%);
    color: #ffffff;
    padding: 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #60a5fa;
  }

  .btn-amber-action:hover {
    background: linear-gradient(135deg, #0369a1 0%, #1e40af 100%);
  }

  .coach-presets-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    background-color: #091528;
    padding: 10px;
    border-radius: 8px;
    margin-bottom: 14px;
    border: 1px solid #1a355d;
  }

  .preset-tag {
    font-size: 9px;
    font-weight: 600;
    color: #34d399;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 3px 7px;
    border-radius: 4px;
  }

  .btn-green-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    color: #ffffff;
    padding: 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #34d399;
  }

  .btn-green-action:hover {
    background: linear-gradient(135deg, #047857 0%, #065f46 100%);
  }

  /* RECENT PROJECTS BAR */
  .recent-projects-bar {
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border: 1px solid #1a355d;
    border-radius: 10px;
    padding: 10px 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .recent-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .recent-chips-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .recent-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #091322;
    border: 1px solid #1e3b68;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .recent-chip:hover {
    border-color: #38bdf8;
    background: #102444;
  }

  .chip-status {
    font-size: 9px;
    font-weight: 700;
    color: #10b981;
  }

  .chip-name {
    font-size: 10px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .chip-meta {
    font-size: 9px;
    color: #94a3b8;
  }

  .workflow-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #64748b;
  }

  .crumb-text {
    font-weight: 700;
    color: #94a3b8;
  }

  .crumb.active {
    color: #38bdf8;
    font-weight: 700;
  }

  .crumb-arrow {
    color: #1a355d;
  }

  .club-select-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .club-select {
    background: #060e1d;
    border: 1px solid #1a355d;
    color: #93c5fd;
    font-size: 9.5px;
    font-weight: 700;
    padding: 4px 6px;
    border-radius: 5px;
    outline: none;
    min-width: 0;
  }

  .kind-mini-sel {
    max-width: 110px;
    flex-shrink: 0;
  }

  .library-hub-panel {
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .lhp-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lhp-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .lhp-search {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #060b14;
    border: 1px solid #1e3b68;
    border-radius: 6px;
    padding: 3px 8px;
    color: #64748b;
  }

  .lhp-search input {
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 10.5px;
    width: 140px;
  }

  .lhp-seg {
    display: inline-flex;
    background: #060b14;
    border: 1px solid #1e3b68;
    border-radius: 6px;
    overflow: hidden;
  }

  .lhp-seg button {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 7px;
    cursor: pointer;
  }

  .lhp-seg button.active {
    background: #0284c7;
    color: #ffffff;
  }

  .lhp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 8px;
    max-height: 185px;
    overflow-y: auto;
  }

  .lhp-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #091322;
    border: 1px solid #1e3b68;
    border-radius: 8px;
    padding: 8px 10px;
  }

  .lhp-card-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .lhp-kind-badge {
    align-self: flex-start;
    font-size: 8.5px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(2, 132, 199, 0.25);
    color: #38bdf8;
  }

  .lhp-kind-badge.training {
    background: rgba(16, 185, 129, 0.22);
    color: #34d399;
  }

  .lhp-card-title {
    font-size: 11px;
    font-weight: 700;
    color: #f8fafc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lhp-card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .lhp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #0f172a;
    border: 1px solid #243b61;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 7px;
    border-radius: 5px;
    cursor: pointer;
  }

  .lhp-btn.open {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .lhp-btn.del:hover {
    border-color: #ef4444;
    color: #fca5a5;
  }

  .lhp-empty {
    font-size: 10.5px;
    color: #64748b;
    padding: 6px 2px;
  }

  .merge-status-note {
    font-size: 10.5px;
    font-weight: 700;
    color: #38bdf8;
    background: rgba(2, 132, 199, 0.14);
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 6px;
    padding: 5px 8px;
    text-align: center;
  }

  .online-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 16px;
  }

  .online-modal-card {
    width: 100%;
    max-width: 540px;
    background: #0b1629;
    border: 1px solid #1e3a5f;
    border-radius: 12px;
    padding: 18px;
    box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .om-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .om-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .om-title-wrap h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    color: #f8fafc;
  }

  .om-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 2px;
  }

  .om-close:hover {
    color: #f8fafc;
  }

  .om-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #94a3b8;
  }

  .om-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .om-field span {
    font-size: 11px;
    font-weight: 700;
    color: #cbd5e1;
  }

  .om-input {
    width: 100%;
    box-sizing: border-box;
    background: #060d19;
    border: 1px solid #243b61;
    border-radius: 7px;
    padding: 9px 10px;
    color: #f8fafc;
    font-size: 12px;
    outline: none;
  }

  .om-input:focus {
    border-color: #38bdf8;
  }

  .om-kind-row {
    display: flex;
  }

  .om-kind-pill {
    font-size: 10.5px;
    font-weight: 700;
    color: #7dd3fc;
    background: rgba(14, 165, 233, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 999px;
    padding: 3px 10px;
  }

  .om-tools-box {
    background: #071020;
    border: 1px solid #1a2e4d;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 11px;
    color: #cbd5e1;
  }

  .om-tools-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .om-tools-row .ok {
    color: #34d399;
  }

  .om-tools-row .warn {
    color: #fbbf24;
  }

  .om-tools-btns {
    display: flex;
    gap: 6px;
  }

  .om-mini-btn {
    background: #10203a;
    border: 1px solid #284574;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 10.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .om-mini-btn:hover:not(:disabled) {
    border-color: #38bdf8;
  }

  .om-error {
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.45);
    color: #fca5a5;
    border-radius: 7px;
    padding: 8px 10px;
    font-size: 11px;
    line-height: 1.4;
  }

  .om-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 2px;
  }

  .om-btn {
    flex: 1 1 200px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .om-btn.primary {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
  }

  .om-btn.secondary {
    background: #0f1d35;
    border-color: #10b981;
    color: #6ee7b7;
  }

  .om-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
