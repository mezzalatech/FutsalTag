<script lang="ts">
  import { onMount, tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    projectStore,
    isTauriDesktop,
  } from "$lib/stores/projectStore.svelte";
  import ClipFilterBar from "$lib/components/ClipFilterBar.svelte";
  import type { ExportMode, ResolvedPlaylistClip } from "$lib/types";
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
    Upload,
    FileCode2,
    MonitorPlay,
  } from "lucide-svelte";
  import { renderDrawingsToDataUrl } from "$lib/export/telestrationRenderer";
  import {
    getEffectiveFreezeStopsForTag,
    type FreezeStopExportPayload,
  } from "$lib/export/freezeStops";
  import { hasAnimatedTelestration } from "$lib/tracking/playerTracker";
  import {
    estimateExportSizeMb,
    formatEstimatedSize,
    type ExportAspectRatio,
    type ExportCrfPreset,
  } from "$lib/export/exportEstimator";
  import {
    exportSportsCodeXml,
    importSportsCodeXml,
    exportNativeXlsxPortable,
    saveTextFilePortable,
    openTextFilePortable,
  } from "$lib/export/interopExporters";

  interface Props {
    onOpenPresentation?: () => void;
  }

  let { onOpenPresentation }: Props = $props();

  const filteredClips = $derived(projectStore.getFilteredPlaylistClips());
  let selectedItemIndex = $state(0);
  const activePreviewClip = $derived(
    filteredClips[selectedItemIndex] ?? filteredClips[0] ?? null,
  );
  const activePreviewSrc = $derived(
    activePreviewClip?.videoSrc ?? projectStore.videoSrc,
  );
  const hasMultiMatch = $derived(
    new Set(filteredClips.map((c) => c.matchId)).size > 1,
  );
  let isPlayingPresentation = $state(false);
  let presentationVideoEl = $state<HTMLVideoElement | null>(null);
  let xmlImportInputEl = $state<HTMLInputElement | undefined>(undefined);

  // Export Settings State
  let exportMode = $state<ExportMode>("merged_video");
  let outputResolution = $state<"1080p" | "720p">("1080p");
  let outputAspectRatio = $state<ExportAspectRatio>("16:9");
  let outputCrf = $state<ExportCrfPreset>(23);
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let exportStatusMessage = $state("");
  let exportSuccessPath = $state<string | null>(null);

  const totalEstimatedDurationSec = $derived.by(() => {
    return filteredClips.reduce((sum, c) => {
      const base = Math.max(0.2, c.tag.endTime - c.tag.startTime);
      if (!c.useTelestration) return sum + base;
      const stops = getEffectiveFreezeStopsForTag(c.tag, c.tag.pauseDuration ?? 3.0);
      const freeze = stops.reduce((s, st) => s + st.duration, 0);
      return sum + base + freeze + (c.tag.appendCleanReplay ? base : 0);
    }, 0);
  });

  const estimatedTotalSizeText = $derived(
    formatEstimatedSize(
      estimateExportSizeMb(
        totalEstimatedDurationSec,
        outputResolution,
        outputCrf,
        outputAspectRatio,
      ),
    ),
  );

  onMount(() => {
    if (isTauriDesktop() && projectStore.libraryMatches.length === 0) {
      projectStore.scanMatchLibrary();
    }
  });

  $effect(() => {
    if (filteredClips.length === 0) {
      selectedItemIndex = 0;
    } else if (selectedItemIndex >= filteredClips.length) {
      selectedItemIndex = filteredClips.length - 1;
    }
  });

  async function playPresentationItem(idx: number) {
    if (filteredClips.length === 0 || idx < 0 || idx >= filteredClips.length)
      return;
    selectedItemIndex = idx;
    const clip = filteredClips[idx];
    await tick();
    if (!presentationVideoEl) return;
    const seekAndPlay = () => {
      if (!presentationVideoEl) return;
      presentationVideoEl.currentTime = clip.tag.startTime;
      presentationVideoEl.play().catch(() => {});
      isPlayingPresentation = true;
    };
    if (presentationVideoEl.readyState < 1) {
      presentationVideoEl.addEventListener("loadedmetadata", seekAndPlay, {
        once: true,
      });
    } else {
      seekAndPlay();
    }
  }

  function handlePresentationTimeUpdate() {
    if (!presentationVideoEl) return;
    const clip = filteredClips[selectedItemIndex];
    if (!clip) return;

    if (presentationVideoEl.currentTime >= clip.tag.endTime) {
      if (selectedItemIndex + 1 < filteredClips.length) {
        playPresentationItem(selectedItemIndex + 1);
      } else {
        presentationVideoEl.pause();
        isPlayingPresentation = false;
        selectedItemIndex = 0;
      }
    }
  }

  function moveItem(index: number, direction: "up" | "down") {
    projectStore.moveFilteredClip(
      filteredClips.map((c) => c.key),
      index,
      direction === "up" ? -1 : 1,
    );
  }

  function removeItem(index: number) {
    const clip = filteredClips[index];
    if (clip) projectStore.excludeFilteredClip(clip.key);
  }

  // Trigger Native / Web Export
  async function triggerExport() {
    if (filteredClips.length === 0) {
      exportStatusMessage =
        "Tidak ada klip sesuai filter. Ubah filter atau buka video/proyek terlebih dahulu.";
      return;
    }

    isExporting = true;
    exportProgress = 5;
    exportStatusMessage = "Menyiapkan klip dan parameter render FFmpeg...";
    exportSuccessPath = null;

    const targetHeight = outputResolution === "720p" ? 720 : 1080;
    const renderW = targetHeight === 720 ? 1280 : 1920;
    const renderH = targetHeight === 720 ? 720 : 1080;

    try {
      const isAbsPath = (p: string | null | undefined) =>
        Boolean(p && (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)));

      if (isTauriDesktop()) {
        const missingVideo = filteredClips.find(
          (c) => !isAbsPath(c.videoFilePath),
        );
        if (missingVideo) {
          throw new Error(
            `Path video absolut tidak ditemukan untuk "${missingVideo.matchTitle}". Simpan ulang proyek dengan video terbuka di Hub Proyek.`,
          );
        }

        const { open, save } = await import("@tauri-apps/plugin-dialog");
        const clips = filteredClips;

        const renderClipToPath = async (
          clip: ResolvedPlaylistClip,
          outPath: string,
        ) => {
          const tag = clip.tag;
          const inputPath = clip.videoFilePath!;
          const chromaConfig =
            clip.chromaFloorConfig ?? projectStore.chromaFloorConfig;
          const useTel = clip.useTelestration;
          const drawings = useTel ? tag.drawings || [] : [];
          const hasDrawings = drawings.length > 0;
          const hasVoice = useTel && Boolean(tag.voiceoverAudioBase64);
          const hasSubtitle =
            useTel &&
            Boolean(
              tag.burnSubtitle &&
                (tag.voiceoverTranscript?.trim() ||
                  (tag.subtitleCues?.length ?? 0) > 0),
            );
          const effectiveStops = useTel
            ? getEffectiveFreezeStopsForTag(tag, tag.pauseDuration ?? 3.0)
            : [];
          const appendCleanReplay = useTel && Boolean(tag.appendCleanReplay);
          const clipDur = Math.max(0.2, tag.endTime - tag.startTime);
          const freezeSec =
            effectiveStops[0]?.time ??
            tag.freezeTimestamp ??
            (tag.startTime + tag.endTime) / 2;
          const cameraZoomEl = drawings.find((d) => d.cameraZoomTarget);
          const cameraZoomTuple: [number, number, number] | null =
            cameraZoomEl?.cameraZoomTarget
              ? [
                  cameraZoomEl.cameraZoomTarget.x,
                  cameraZoomEl.cameraZoomTarget.y,
                  cameraZoomEl.cameraZoomTarget.scale,
                ]
              : null;

          const freezeStopsPayload: FreezeStopExportPayload[] =
            effectiveStops.map((st) => ({
              time: st.time,
              duration: st.duration,
              overlay_base64:
                hasDrawings || hasSubtitle
                  ? renderDrawingsToDataUrl(
                      drawings,
                      renderW,
                      renderH,
                      st.time,
                      {
                        chromaConfig,
                        clipStartTime: tag.startTime,
                        clipEndTime: tag.endTime,
                        subtitleText: tag.voiceoverTranscript,
                        subtitleCues: tag.subtitleCues,
                        burnSubtitle: tag.burnSubtitle,
                        animElapsedSec: 1.0,
                      },
                    ) || null
                  : null,
            }));

          const isAnimated =
            hasDrawings &&
            hasAnimatedTelestration(drawings, tag.startTime, tag.endTime);
          const needsFormatPass =
            outputAspectRatio === "9:16" || outputCrf !== 23;
          const needsBurnPass =
            isAnimated ||
            hasDrawings ||
            hasVoice ||
            hasSubtitle ||
            freezeStopsPayload.length > 0 ||
            appendCleanReplay;

          let burnOutputPath = outPath;
          if (needsBurnPass && needsFormatPass) {
            const tmp = await invoke<string>("get_temp_dir");
            const tSep = tmp.endsWith("/") || tmp.endsWith("\\") ? "" : "/";
            burnOutputPath = `${tmp}${tSep}futsaltag_fmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`;
          }

          if (isAnimated) {
            const tempDir = await invoke<string>("get_temp_dir");
            const seqSep =
              tempDir.endsWith("/") || tempDir.endsWith("\\") ? "" : "/";
            const seqDir = `${tempDir}${seqSep}futsaltag_pl_anim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const overlayFps = 12;
            const totalFrames = Math.max(
              2,
              Math.min(240, Math.ceil(clipDur * overlayFps)),
            );
            try {
              for (let fi = 0; fi < totalFrames; fi++) {
                const t = Math.min(
                  tag.endTime,
                  tag.startTime + fi / overlayFps,
                );
                const pngBase64 = renderDrawingsToDataUrl(
                  drawings,
                  renderW,
                  renderH,
                  t,
                  {
                    chromaConfig,
                    clipStartTime: tag.startTime,
                    clipEndTime: tag.endTime,
                    subtitleText: tag.voiceoverTranscript,
                    subtitleCues: tag.subtitleCues,
                    burnSubtitle: tag.burnSubtitle,
                  },
                );
                await invoke<string>("save_overlay_frame_png", {
                  dirPath: seqDir,
                  frameIndex: fi + 1,
                  pngBase64,
                });
              }

              await invoke<string>("burn_animated_telestration_clip_ffmpeg", {
                inputPath,
                outputPath: burnOutputPath,
                startSec: tag.startTime,
                durationSec: clipDur,
                overlayFramesDir: seqDir,
                overlayFps,
                freezeSec,
                pauseDuration: effectiveStops[0]?.duration ?? 0,
                freezeOverlayBase64:
                  freezeStopsPayload[0]?.overlay_base64 ?? null,
                cameraZoom: cameraZoomTuple,
                voiceoverBase64: useTel
                  ? tag.voiceoverAudioBase64 || null
                  : null,
                targetHeight,
                freezeStops:
                  freezeStopsPayload.length > 0 ? freezeStopsPayload : null,
                appendCleanReplay,
              });
            } finally {
              await invoke("cleanup_temp_dir", { dirPath: seqDir }).catch(
                () => {},
              );
            }
          } else if (needsBurnPass) {
            await invoke<string>("burn_telestration_clip_ffmpeg", {
              inputPath,
              outputPath: burnOutputPath,
              startSec: tag.startTime,
              durationSec: clipDur,
              freezeSec,
              pauseDuration: effectiveStops[0]?.duration ?? 0,
              overlayBase64: freezeStopsPayload[0]?.overlay_base64 ?? null,
              voiceoverBase64: useTel ? tag.voiceoverAudioBase64 || null : null,
              targetHeight,
              cameraZoom: cameraZoomTuple,
              freezeStops:
                freezeStopsPayload.length > 0 ? freezeStopsPayload : null,
              appendCleanReplay,
            });
          } else if (needsFormatPass) {
            await invoke<string>("export_formatted_clip_ffmpeg", {
              inputPath,
              outputPath: outPath,
              startSec: tag.startTime,
              durationSec: clipDur,
              targetHeight,
              crf: outputCrf,
              vertical9x16: outputAspectRatio === "9:16",
            });
          } else {
            await invoke<string>("render_video_clip_ffmpeg", {
              inputPath,
              outputPath: outPath,
              startSec: tag.startTime,
              durationSec: clipDur,
              fastCopy: exportMode !== "merged_video",
              targetHeight,
            });
          }

          if (needsBurnPass && needsFormatPass) {
            await invoke<string>("export_formatted_clip_ffmpeg", {
              inputPath: burnOutputPath,
              outputPath: outPath,
              targetHeight,
              crf: outputCrf,
              vertical9x16: outputAspectRatio === "9:16",
              removeInput: true,
            });
          }
        };

        if (exportMode === "merged_video") {
          const finalPath = await save({
            title: "Simpan Video Kompilasi Playlist",
            defaultPath: `FutsalTag_Pro_Playlist_${Date.now()}.mp4`,
            filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
          });
          if (!finalPath) {
            isExporting = false;
            exportProgress = 0;
            return;
          }

          const tempDir = await invoke<string>("get_temp_dir");
          const sep =
            tempDir.endsWith("/") || tempDir.endsWith("\\") ? "" : "/";
          const renderedClips: string[] = [];

          for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            exportStatusMessage = `Merender klip ${i + 1}/${clips.length}: [${clip.matchTitle}] ${clip.tag.title}...`;
            const tempClipPath = `${tempDir}${sep}futsaltag_pl_${i}_${Date.now()}.mp4`;
            await renderClipToPath(clip, tempClipPath);
            renderedClips.push(tempClipPath);
            exportProgress = 15 + Math.floor(((i + 1) / clips.length) * 70);
          }

          exportStatusMessage =
            "Menggabungkan seluruh klip menjadi 1 video presentasi...";
          await invoke<string>("concat_playlist_ffmpeg", {
            clipPaths: renderedClips,
            outputPath: finalPath,
            cleanupInputs: true,
          });

          exportProgress = 100;
          exportStatusMessage = `Selesai! Kompilasi video tersimpan di: ${finalPath}`;
          exportSuccessPath = finalPath;
        } else {
          const targetDir = await open({
            title:
              exportMode === "grouped_folders"
                ? "Pilih Folder Utama (Subfolder Kategori Otomatis)"
                : "Pilih Folder Tujuan Klip Terpisah",
            directory: true,
            multiple: false,
          });
          if (!targetDir || typeof targetDir !== "string") {
            isExporting = false;
            exportProgress = 0;
            return;
          }

          const sep =
            targetDir.endsWith("/") || targetDir.endsWith("\\") ? "" : "/";
          for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            const safeCat = clip.tag.category.replace(/[^a-zA-Z0-9_-]/g, "_");
            const safeTitle = clip.tag.title
              .replace(/[^a-zA-Z0-9_-]/g, "_")
              .slice(0, 42);
            const safeMatch = clip.matchTitle
              .replace(/[^a-zA-Z0-9_-]/g, "_")
              .slice(0, 22);
            const matchPrefix = hasMultiMatch ? `${safeMatch}_` : "";
            const idxStr = String(i + 1).padStart(2, "0");
            let outPath: string;
            if (exportMode === "grouped_folders") {
              const subDir = `${targetDir}${sep}${safeCat}`;
              await invoke("ensure_dir", { path: subDir });
              outPath = `${subDir}${sep}${idxStr}_${matchPrefix}${safeTitle}.mp4`;
            } else {
              outPath = `${targetDir}${sep}${idxStr}_${matchPrefix}${safeCat}_${safeTitle}.mp4`;
            }

            exportStatusMessage = `Merender klip ${i + 1}/${clips.length}: [${clip.matchTitle}] ${clip.tag.title}...`;
            await renderClipToPath(clip, outPath);
            exportProgress = 10 + Math.floor(((i + 1) / clips.length) * 90);
          }

          exportProgress = 100;
          exportStatusMessage = `Selesai! ${clips.length} klip tersimpan di folder: ${targetDir}`;
          exportSuccessPath = targetDir;
        }
      } else {
        for (let p = 20; p <= 100; p += 20) {
          await new Promise((r) => setTimeout(r, 250));
          exportProgress = p;
          if (p === 40)
            exportStatusMessage = "Simulasi Web: menyiapkan preview...";
          if (p === 80)
            exportStatusMessage =
              "Gunakan aplikasi desktop Tauri untuk render MP4 FFmpeg asli.";
        }
        exportStatusMessage =
          "Mode Web Demo selesai (render MP4 nyata hanya aktif di Tauri Desktop).";
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
      [
        "Pertandingan",
        "ID",
        "Kategori Aksi",
        "Mulai (s)",
        "Selesai (s)",
        "Pemain",
        "Label",
        "Telestrasi",
        "Hasil",
        "Rating",
      ],
      ...filteredClips.map((c) => [
        `"${c.matchTitle.replace(/"/g, '""')}"`,
        c.tag.id,
        `"${c.tag.category}"`,
        c.tag.startTime.toFixed(2),
        c.tag.endTime.toFixed(2),
        `"${c.tag.playerLabel || "-"}"`,
        `"${(c.tag.labels ?? []).map((l) => l.name).join("; ") || "-"}"`,
        c.useTelestration ? "Telestrasi" : "Polos",
        `"${c.tag.outcomeLabel || "-"}"`,
        `"${c.tag.rating || "-"}"`,
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FutsalTag_Pro_Statistik_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleExportMatchPdf() {
    if (projectStore.tags.length === 0) {
      exportStatusMessage =
        "Belum ada klip momen untuk dicetak ke Laporan PDF.";
      return;
    }
    try {
      const { exportExecutiveMatchPdfReport } = await import(
        "$lib/export/matchPdfReport"
      );
      const saved = await exportExecutiveMatchPdfReport({
        matchTitle: projectStore.videoTitle,
        durationSec: projectStore.duration,
        tags: projectStore.tags,
        roster: projectStore.roster,
        formatMatchClock: (s) => projectStore.formatMatchClock(s),
        getPlayerDisplayLabel: (p) => projectStore.getPlayerDisplayLabel(p),
      });
      if (saved) {
        exportSuccessPath = saved;
        exportStatusMessage = `Laporan Pertandingan PDF 1-Klik disimpan ke: ${saved}`;
      }
    } catch (err: any) {
      exportStatusMessage = `Gagal ekspor PDF: ${err?.message || err}`;
    }
  }

  async function handleExportSportsCodeXml() {
    if (projectStore.tags.length === 0) {
      exportStatusMessage = "Belum ada klip untuk diekspor ke XML.";
      return;
    }
    const xml = exportSportsCodeXml(projectStore.tags, projectStore.videoTitle);
    const safeName = (projectStore.videoTitle || "futsaltag")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();
    const saved = await saveTextFilePortable(
      `${safeName}_sportscode.xml`,
      xml,
      "application/xml;charset=utf-8",
      "SportsCode / Once Sport XML",
      ["xml"],
    );
    if (saved) {
      exportSuccessPath = saved;
      exportStatusMessage = `XML SportsCode/Once Sport (${projectStore.tags.length} klip) diekspor ke: ${saved}`;
    }
  }

  function applyImportedXml(xmlStr: string, sourceName: string) {
    const imported = importSportsCodeXml(xmlStr);
    if (imported.length === 0) {
      exportStatusMessage = `Tidak ditemukan klip valid di dalam "${sourceName}".`;
      return;
    }
    for (const tag of imported) {
      projectStore.addTag(tag);
    }
    exportSuccessPath = sourceName;
    exportStatusMessage = `Berhasil mengimpor ${imported.length} klip dari "${sourceName}" ke Linimasa!`;
  }

  async function handleImportSportsCodeXmlClick() {
    if (isTauriDesktop()) {
      try {
        const res = await openTextFilePortable(
          "Impor XML SportsCode / Once Sport (.xml)",
          "XML Files",
          ["xml"],
        );
        if (res) applyImportedXml(res.content, res.name);
      } catch (err: any) {
        exportStatusMessage = `Gagal impor XML: ${err?.message || err}`;
      }
    } else {
      xmlImportInputEl?.click();
    }
  }

  function handleXmlFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        try {
          applyImportedXml(text, file.name);
        } catch (err: any) {
          exportStatusMessage = `Gagal impor XML: ${err?.message || err}`;
        }
      }
    };
    reader.readAsText(file);
    input.value = "";
  }

  async function handleExportExcelWorkbook() {
    const safeName = (projectStore.videoTitle || "laporan_futsal")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();
    const saved = await exportNativeXlsxPortable(
      {
        matchTitle: projectStore.videoTitle,
        tags: projectStore.tags,
        roster: projectStore.roster,
        duration: projectStore.duration,
        periodKickoffs: projectStore.periodKickoffs,
        startingLineupIds: projectStore.startingLineupIds,
        substitutions: projectStore.substitutions,
        formatMatchClock: (s) => projectStore.formatMatchClock(s),
        getPlayerDisplayLabel: (p) => projectStore.getPlayerDisplayLabel(p),
        normalizePlayerLabel: (lbl) => projectStore.normalizePlayerLabel(lbl),
        isGoalkeeper: (p) => projectStore.isGoalkeeper(p),
      },
      `${safeName}_5sheet.xlsx`,
    );
    if (saved) {
      exportSuccessPath = saved;
      exportStatusMessage = `Laporan Excel Asli (.xlsx, 5 lembar kerja) tersimpan: ${saved}`;
    }
  }
</script>

<div class="playlist-export-hub">
  <!-- TOP SUB-HEADER -->
  <header class="hub-header">
    <div class="header-left">
      <button class="btn-back" onclick={() => projectStore.setStage("tagging")}>
        <ArrowLeft size={16} />
        <span>Kembali ke Tagging</span>
      </button>
      <div class="header-title-wrap">
        <span class="hub-main-title">Pusat Playlist & Ekspor Multi-Format</span>
        <span class="hub-sub-title"
          >Susun urutan klip presentasi dan ekspor video siaran tim</span
        >
      </div>
    </div>

    <div class="header-right">
      {#if onOpenPresentation}
        <button
          class="btn-csv"
          onclick={onOpenPresentation}
          title="Buka Studio Presentasi Fullscreen Ruang Ganti"
        >
          <MonitorPlay size={15} />
          <span>Presenter Fullscreen</span>
        </button>
      {/if}
      <button class="btn-csv" onclick={exportCSVStats}>
        <FileSpreadsheet size={15} />
        <span>Ekspor Rekap CSV</span>
      </button>
      <button
        class="btn-csv"
        onclick={handleExportMatchPdf}
        title="Cetak Laporan Pertandingan PDF 1-Klik (A4 Landscape)"
      >
        <Download size={15} />
        <span>Laporan PDF</span>
      </button>
      <button
        class="btn-primary-export"
        onclick={triggerExport}
        disabled={isExporting}
      >
        <Download size={15} />
        <span>{isExporting ? "Sedang Merender..." : "Mulai Ekspor Video"}</span>
      </button>
    </div>
  </header>

  <!-- MAIN BODY: 2 COLUMNS (LEFT: PRESENTATION PLAYER & PLAYLIST, RIGHT: EXPORT SETTINGS) -->
  <div class="hub-grid">
    <!-- LEFT: FILTER + TV PRESENTATION PLAYER & REORDERABLE PLAYLIST -->
    <div class="playlist-column">
      <ClipFilterBar />

      <!-- TV PRESENTATION PLAYER -->
      <div class="presentation-player-card">
        <div class="card-bar">
          <div class="bar-title">
            <Tv size={15} />
            <span>Mode Simulasi Siaran Presentasi TV (Auto-Play Sequencer)</span
            >
          </div>
          {#if activePreviewClip}
            <span class="now-playing-badge">
              [{activePreviewClip.matchTitle}] Klip #{selectedItemIndex + 1}: {activePreviewClip
                .tag.title}
            </span>
          {/if}
        </div>

        <div class="video-frame">
          {#if activePreviewSrc}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={presentationVideoEl}
              src={activePreviewSrc}
              class="pres-video"
              ontimeupdate={handlePresentationTimeUpdate}
            ></video>
          {:else}
            <div class="mock-pres-screen">
              <Film size={36} />
              <p>Simulasi Presentasi TV Berurutan Aktif</p>
              <span
                >Setiap klip akan diputar berurutan lintas pertandingan sesuai
                filter aktif.</span
              >
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
            Total {filteredClips.length} Klip Terfilter
          </span>
        </div>
      </div>

      <!-- PLAYLIST ITEMS LIST -->
      <div class="playlist-items-card">
        <div class="items-header">
          <div class="title-wrap">
            <Layers size={15} />
            <span class="title-text"
              >Daftar Klip Aktif ({filteredClips.length})</span
            >
          </div>
          <span class="drag-hint"
            >Filter di atas langsung menyaring Presentasi & Ekspor MP4</span
          >
        </div>

        <div class="items-scroll">
          {#if filteredClips.length === 0}
            <div class="empty-playlist">
              <p>Belum ada klip sesuai filter.</p>
              <span
                >Ubah filter Tag/Label/Pemain di atas, atau Scan folder pustaka
                `.futsal`.</span
              >
            </div>
          {:else}
            {#each filteredClips as clip, idx (clip.key)}
              <div
                class="playlist-item-row"
                class:active-row={selectedItemIndex === idx}
                onclick={() => playPresentationItem(idx)}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    playPresentationItem(idx);
                }}
              >
                <div class="item-order-box">{idx + 1}</div>

                <div class="item-info">
                  <div class="item-title-row">
                    <span class="match-pill-tag">{clip.matchTitle}</span>
                    <span class="item-title">{clip.tag.title}</span>
                    <span
                      class="item-cat"
                      style="background-color: {clip.tag.color}"
                    >
                      {clip.tag.category}
                    </span>
                  </div>
                  <div class="item-meta">
                    <span class="meta-time">
                      [{clip.tag.startTime.toFixed(1)}s - {clip.tag.endTime.toFixed(
                        1,
                      )}s]
                    </span>
                    {#if clip.tag.playerLabel}
                      <span class="meta-badge">{clip.tag.playerLabel}</span>
                    {/if}
                    {#each (clip.tag.labels ?? []).slice(0, 3) as lbl}
                      <span class="meta-lbl-pill">{lbl.name}</span>
                    {/each}
                    <span class="meta-freeze">
                      {#if (clip.tag.freezeStops?.length ?? 0) > 1}
                        {clip.tag.freezeStops?.length} Jeda
                      {:else}
                        Jeda: {(
                          clip.tag.freezeStops?.[0]?.duration ??
                          clip.tag.pauseDuration ??
                          3.0
                        ).toFixed(1)}s
                      {/if}
                      {clip.tag.appendCleanReplay ? " + Replay" : ""}
                    </span>
                  </div>
                </div>

                <!-- TELESTRATION PER-CLIP TOGGLE & REORDER -->
                <div class="item-actions">
                  <button
                    type="button"
                    class="btn-tel-toggle"
                    class:active={clip.useTelestration}
                    onclick={(e) => {
                      e.stopPropagation();
                      projectStore.setClipTelestration(
                        clip.key,
                        !clip.useTelestration,
                      );
                    }}
                    title={clip.hasTelestration
                      ? "Klik untuk pilih ekspor/tayang Dengan Telestrasi atau Video Polos"
                      : "Klip ini polos (belum ada telestrasi)"}
                  >
                    <Sparkles size={11} />
                    <span>{clip.useTelestration ? "Telestrasi" : "Polos"}</span>
                  </button>
                  <button
                    class="btn-order"
                    disabled={idx === 0}
                    onclick={(e) => {
                      e.stopPropagation();
                      moveItem(idx, "up");
                    }}
                    title="Pindahkan ke atas"
                  >
                    <MoveUp size={13} />
                  </button>
                  <button
                    class="btn-order"
                    disabled={idx === filteredClips.length - 1}
                    onclick={(e) => {
                      e.stopPropagation();
                      moveItem(idx, "down");
                    }}
                    title="Pindahkan ke bawah"
                  >
                    <MoveDown size={13} />
                  </button>
                  <button
                    class="btn-del"
                    onclick={(e) => {
                      e.stopPropagation();
                      removeItem(idx);
                    }}
                    title="Keluarkan sementara dari ekspor"
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
          <label
            class="mode-option"
            class:selected={exportMode === "merged_video"}
          >
            <input type="radio" bind:group={exportMode} value="merged_video" />
            <div class="mode-text">
              <span class="mode-title"
                >1. Gabung Menjadi 1 Video Utuh (Merge)</span
              >
              <span class="mode-desc">
                Menggabungkan seluruh klip playlist menjadi 1 file video MP4
                bersambung. Sangat cocok untuk rapat analisis tim.
              </span>
            </div>
          </label>

          <label
            class="mode-option"
            class:selected={exportMode === "separate_clips"}
          >
            <input
              type="radio"
              bind:group={exportMode}
              value="separate_clips"
            />
            <div class="mode-text">
              <span class="mode-title">2. Ekspor Klip Terpisah di 1 Folder</span
              >
              <span class="mode-desc">
                Merender setiap aksi ke file mandiri: Klip_01_Gol.mp4,
                Klip_02_Pressing.mp4, dll.
              </span>
            </div>
          </label>

          <label
            class="mode-option"
            class:selected={exportMode === "grouped_folders"}
          >
            <input
              type="radio"
              bind:group={exportMode}
              value="grouped_folders"
            />
            <div class="mode-text">
              <span class="mode-title">3. Kelompokkan ke Folder Aksi</span>
              <span class="mode-desc">
                Otomatis membuat subfolder sesuai nama aksi: folder Gol/, folder
                Set_Piece/, folder Transisi/.
              </span>
            </div>
          </label>
        </div>

        <!-- DRAWINGS & PAUSE CHECKBOX -->
        <div class="options-checklist">
          <label class="check-label">
            <input
              type="checkbox"
              checked={projectStore.globalIncludeTelestration}
              onchange={(e) =>
                projectStore.setAllClipsTelestration(e.currentTarget.checked)}
            />
            <span
              >Sertakan Anotasi Telestrasi & Waktu Jeda Freeze-Frame (Global)</span
            >
          </label>

          <div class="res-row">
            <span class="res-title">Resolusi Output Video:</span>
            <div class="res-buttons">
              <button
                class="btn-res"
                class:active={outputResolution === "1080p"}
                onclick={() => (outputResolution = "1080p")}
              >
                1080p (Full HD)
              </button>
              <button
                class="btn-res"
                class:active={outputResolution === "720p"}
                onclick={() => (outputResolution = "720p")}
              >
                720p (HD)
              </button>
            </div>
          </div>

          <div class="res-row">
            <span class="res-title">Rasio Video:</span>
            <div class="res-buttons">
              <button
                class="btn-res"
                class:active={outputAspectRatio === "16:9"}
                onclick={() => (outputAspectRatio = "16:9")}
              >
                16:9 Landscape
              </button>
              <button
                class="btn-res"
                class:active={outputAspectRatio === "9:16"}
                onclick={() => (outputAspectRatio = "9:16")}
              >
                9:16 Reels / IG
              </button>
            </div>
          </div>

          <div class="res-row">
            <span class="res-title">Kualitas (CRF):</span>
            <div class="res-buttons">
              <button
                class="btn-res"
                class:active={outputCrf === 18}
                onclick={() => (outputCrf = 18)}
              >
                Tinggi (18)
              </button>
              <button
                class="btn-res"
                class:active={outputCrf === 23}
                onclick={() => (outputCrf = 23)}
              >
                Standar (23)
              </button>
              <button
                class="btn-res"
                class:active={outputCrf === 28}
                onclick={() => (outputCrf = 28)}
              >
                Ringan WA (28)
              </button>
            </div>
          </div>

          {#if filteredClips.length > 0}
            <div class="res-row">
              <span class="res-title">Estimasi Ukuran ({totalEstimatedDurationSec.toFixed(0)} dtk):</span>
              <span class="btn-res active">{estimatedTotalSizeText}</span>
            </div>
          {/if}
        </div>

        <!-- PROGRESS & STATUS -->
        {#if isExporting || exportProgress > 0}
          <div class="progress-wrap">
            <div class="progress-bar-bg">
              <div
                class="progress-bar-fill"
                style="width: {exportProgress}%"
              ></div>
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
          <span
            >{isExporting
              ? "Sedang Memproses Render..."
              : "Render & Simpan Video"}</span
          >
        </button>
      </div>

      <!-- INTEROPERABILITY & MULTI-SHEET REPORTS CARD -->
      <div class="export-config-card interop-card">
        <div class="config-header">
          <FileCode2 size={16} />
          <span>Interoperabilitas & Laporan Industri</span>
        </div>
        <div class="interop-grid">
          <button
            type="button"
            class="btn-interop"
            onclick={handleImportSportsCodeXmlClick}
          >
            <Upload size={13} />
            <span>Impor XML (Once/SportsCode)</span>
          </button>
          <input
            bind:this={xmlImportInputEl}
            type="file"
            accept=".xml"
            onchange={handleXmlFileChange}
            style="display: none;"
          />
          <button
            type="button"
            class="btn-interop"
            onclick={handleExportSportsCodeXml}
          >
            <Download size={13} />
            <span>Ekspor XML SportsCode</span>
          </button>
          <button
            type="button"
            class="btn-interop btn-interop-excel"
            onclick={handleExportExcelWorkbook}
          >
            <FileSpreadsheet size={13} />
            <span>Ekspor Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            class="btn-interop btn-interop-pdf"
            onclick={handleExportMatchPdf}
          >
            <Download size={13} />
            <span>Laporan PDF 1-Klik (A4)</span>
          </button>
        </div>
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
    gap: 12px;
    overflow-y: auto;
    min-height: 0;
  }

  .interop-card {
    gap: 10px;
  }

  .interop-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .btn-interop {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #0d1e38;
    border: 1px solid #1e3a5f;
    color: #93c5fd;
    padding: 8px 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-interop:hover {
    border-color: #38bdf8;
    color: #ffffff;
    background: #132c52;
  }

  .btn-interop-excel {
    grid-column: 1 / -1;
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(52, 211, 153, 0.45);
    color: #34d399;
  }

  .btn-interop-excel:hover {
    background: rgba(16, 185, 129, 0.28);
    border-color: #10b981;
  }

  .btn-interop-pdf {
    grid-column: 1 / -1;
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.45);
    color: #38bdf8;
  }

  .btn-interop-pdf:hover {
    background: rgba(56, 189, 248, 0.28);
    border-color: #38bdf8;
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

  @media (max-width: 1024px) {
    .playlist-export-hub {
      overflow-y: auto;
      height: auto;
      min-height: 100%;
    }

    .hub-header {
      flex-wrap: wrap;
      height: auto;
      padding: 10px 12px;
      gap: 8px;
    }

    .hub-grid {
      grid-template-columns: 1fr;
      overflow: visible;
      padding: 12px;
    }

    .playlist-column,
    .playlist-items-card,
    .export-column {
      overflow: visible;
    }

    .video-frame {
      height: auto;
      aspect-ratio: 16 / 9;
      max-height: 320px;
    }
  }

  @media (max-width: 640px) {
    .interop-grid {
      grid-template-columns: 1fr;
    }

    .playlist-item-row {
      flex-wrap: wrap;
      gap: 8px;
    }

    .res-row {
      flex-wrap: wrap;
      gap: 8px;
    }
  }

  .match-pill-tag {
    font-size: 9.5px;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 4px;
    background: #0f766e;
    color: #ccfbf1;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-lbl-pill {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    background: #1e293b;
    border: 1px solid #334155;
    color: #cbd5e1;
  }

  .btn-tel-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    background: #0f172a;
    border: 1px solid #334155;
    color: #94a3b8;
    cursor: pointer;
  }

  .btn-tel-toggle.active {
    background: rgba(2, 132, 199, 0.22);
    border-color: #38bdf8;
    color: #38bdf8;
  }
</style>
