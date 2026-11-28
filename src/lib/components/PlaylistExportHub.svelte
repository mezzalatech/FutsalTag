<script lang="ts">
  import { onMount, tick } from "svelte";
  import { invoke, convertFileSrc } from "@tauri-apps/api/core";
  import {
    projectStore,
    isTauriDesktop,
  } from "$lib/stores/projectStore.svelte";
  import ClipFilterBar from "$lib/components/ClipFilterBar.svelte";
  import type { ExportMode, PresentationSlide, ResolvedPlaylistClip } from "$lib/types";
  import {
    Play,
    Pause,
    SkipForward,
    SkipBack,
    ArrowLeft,
    ArrowRight,
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
    CloudUpload,
    Globe,
    Plus,
    Pencil,
    Type,
    Image as ImageIcon,
    Video,
    ChevronDown,
    Volume2,
    VolumeX,
  } from "lucide-svelte";
  import { exportInteractiveHtmlStatsReport } from "$lib/export/htmlStatsReport";
  import CloudExportModal from "$lib/components/CloudExportModal.svelte";
  import { renderDrawingsToDataUrl } from "$lib/export/telestrationRenderer";
  import {
    renderClipTitleCardDataUrl,
    renderTitleSlideDataUrl,
    renderImageSlideDataUrl,
  } from "$lib/export/slideCardRenderer";
  import {
    getEffectiveFreezeStopsForTag,
    getEffectiveSpeedSegmentsForTag,
    toSpeedSegmentsExportPayload,
    estimateClipRenderedDuration,
    type FreezeStopExportPayload,
  } from "$lib/export/freezeStops";
  import { buildWatermarkExportPayload } from "$lib/export/watermark";
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
  let wmLogoInputEl = $state<HTMLInputElement | undefined>(undefined);
  let deckImageInputEl = $state<HTMLInputElement | undefined>(undefined);
  let deckVideoInputEl = $state<HTMLInputElement | undefined>(undefined);
  let isCloudOpen = $state(false);
  let selectedClipKeys = $state<string[]>([]);
  let showTitleSlideForm = $state(false);
  let newSlideTitle = $state("");
  let newSlideSubtitle = $state("");
  let newSlideBgColor = $state("#0f172a");
  let rightPanelTab = $state<"deck" | "export">("deck");
  let showMoreExportMenu = $state(false);

  const activeDeck = $derived(projectStore.activeDeck);
  const allFilteredChecked = $derived(
    filteredClips.length > 0 &&
      filteredClips.every((c) => selectedClipKeys.includes(c.key)),
  );

  function fmtClipClock(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  function toggleClipSelection(key: string) {
    if (selectedClipKeys.includes(key)) {
      selectedClipKeys = selectedClipKeys.filter((k) => k !== key);
    } else {
      selectedClipKeys = [...selectedClipKeys, key];
    }
  }

  function toggleSelectAllFiltered() {
    if (allFilteredChecked) {
      selectedClipKeys = [];
    } else {
      selectedClipKeys = filteredClips.map((c) => c.key);
    }
  }

  function sendSelectedClipsToDeck() {
    const toAdd =
      selectedClipKeys.length > 0
        ? filteredClips.filter((c) => selectedClipKeys.includes(c.key))
        : filteredClips;
    if (toAdd.length === 0) return;
    projectStore.addClipsToActiveDeck(toAdd);
    selectedClipKeys = [];
    exportStatusMessage = `${toAdd.length} klip ditambahkan ke "${activeDeck.title}".`;
  }

  function handleCreateDeck() {
    const title = prompt(
      "Nama presentasi baru:",
      `Presentasi ${projectStore.presentationDecks.length + 1}`,
    );
    if (title === null) return;
    projectStore.createPresentationDeck(title);
  }

  function handleRenameDeck() {
    const title = prompt("Ubah nama presentasi:", activeDeck.title);
    if (title !== null && title.trim()) {
      projectStore.renamePresentationDeck(activeDeck.id, title);
    }
  }

  function handleDeleteDeck() {
    if (projectStore.presentationDecks.length <= 1) return;
    if (confirm(`Hapus presentasi "${activeDeck.title}"?`)) {
      projectStore.deletePresentationDeck(activeDeck.id);
    }
  }

  function handleAddTitleSlide() {
    if (!newSlideTitle.trim()) return;
    projectStore.addTitleSlideToActiveDeck(
      newSlideTitle,
      newSlideSubtitle,
      newSlideBgColor,
    );
    newSlideTitle = "";
    newSlideSubtitle = "";
    showTitleSlideForm = false;
  }

  function handleDeckImageSelected(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const title = file.name.replace(/\.[^.]+$/, "") || "Slide Gambar";
        projectStore.addImageSlideToActiveDeck(title, reader.result);
      }
    };
    reader.readAsDataURL(file);
    (e.currentTarget as HTMLInputElement).value = "";
  }

  function probeVideoDuration(src: string): Promise<number> {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      const finish = (dur: number) => {
        v.remove();
        resolve(Number.isFinite(dur) && dur > 0 ? dur : 15);
      };
      v.onloadedmetadata = () => finish(v.duration);
      v.onerror = () => finish(15);
      setTimeout(() => finish(15), 2000);
      v.src = src;
    });
  }

  async function handleAddDeckVideoClick() {
    if (isTauriDesktop()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const chosen = await open({
          title: "Pilih Video Sisipan MP4 / MOV",
          multiple: false,
          filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }],
        });
        if (typeof chosen === "string" && chosen) {
          const src = convertFileSrc(chosen);
          const dur = await probeVideoDuration(src);
          const name = chosen.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "Video Sisipan";
          projectStore.addExternalVideoSlideToActiveDeck(name, chosen, src, dur);
        }
      } catch (err: any) {
        exportStatusMessage = `Gagal memuat video sisipan: ${err?.message || err}`;
      }
    } else {
      deckVideoInputEl?.click();
    }
  }

  async function handleDeckVideoInputSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    const dur = await probeVideoDuration(src);
    const name = file.name.replace(/\.[^.]+$/, "") || "Video Sisipan";
    projectStore.addExternalVideoSlideToActiveDeck(name, null, src, dur);
    input.value = "";
  }

  function handleOpenPresentationFromDeck() {
    if (activeDeck.slides.length > 0) {
      projectStore.presentationSlides = activeDeck.slides;
    } else if (filteredClips.length > 0) {
      projectStore.presentationSlides = filteredClips.map((c, idx) => ({
        id: `pres-${idx}-${c.key}`,
        kind: "clip",
        title: c.tag.title,
        tag: c.tag,
        matchId: c.matchId,
        matchTitle: c.matchTitle,
        videoFilePath: c.videoFilePath,
        videoSrc: c.videoSrc,
        chromaFloorConfig: c.chromaFloorConfig,
        showTelestration: c.useTelestration,
      }));
    }
    onOpenPresentation?.();
  }

  async function handleExportHtmlStats() {
    if (projectStore.tags.length === 0) {
      exportStatusMessage = "Belum ada klip momen untuk diekspor ke Laporan HTML.";
      return;
    }
    try {
      const saved = await exportInteractiveHtmlStatsReport({
        matchTitle: projectStore.videoTitle,
        competition: projectStore.competitionName,
        durationSec: projectStore.duration,
        tags: projectStore.tags,
        roster: projectStore.roster,
        clubLogoDataUrl: projectStore.clubLogoDataUrl,
        formatMatchClock: (s) => projectStore.formatMatchClock(s),
      });
      if (saved) {
        exportSuccessPath = saved;
        exportStatusMessage = `Statistik HTML Mobile interaktif disimpan ke: ${saved}`;
      }
    } catch (err: any) {
      exportStatusMessage = `Gagal ekspor HTML: ${err?.message || err}`;
    }
  }

  function handleWmLogoSelected(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        projectStore.clubLogoDataUrl = reader.result;
        projectStore.watermarkConfig = {
          ...projectStore.watermarkConfig,
          enabled: true,
        };
        projectStore.markDirty();
      }
    };
    reader.readAsDataURL(file);
  }

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
      return sum + estimateClipRenderedDuration(c.tag, c.useTelestration);
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

  $effect(() => {
    const vol = projectStore.videoVolume;
    const muted = projectStore.videoMuted;
    if (presentationVideoEl) {
      presentationVideoEl.volume = vol;
      presentationVideoEl.muted = muted;
    }
  });

  function handlePresentationTimeUpdate() {
    if (!presentationVideoEl) return;
    const clip = filteredClips[selectedItemIndex];
    if (!clip) return;

    const ct = presentationVideoEl.currentTime;
    const speedSegs = getEffectiveSpeedSegmentsForTag(clip.tag);
    if (speedSegs.length > 0 && !presentationVideoEl.paused) {
      const hit = speedSegs.find((s) => ct >= s.startTime && ct < s.endTime);
      const nextRate = hit ? hit.rate : 1.0;
      if (Math.abs(presentationVideoEl.playbackRate - nextRate) > 0.01) {
        presentationVideoEl.playbackRate = nextRate;
      }
    } else if (Math.abs(presentationVideoEl.playbackRate - 1.0) > 0.01) {
      presentationVideoEl.playbackRate = 1.0;
    }

    if (ct >= clip.tag.endTime) {
      presentationVideoEl.playbackRate = 1.0;
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
    const useDeckSource = activeDeck.slides.length > 0;
    const sourceSlides: PresentationSlide[] = useDeckSource
      ? activeDeck.slides
      : filteredClips.map((c) => ({
          id: `flt-${c.key}`,
          kind: "clip" as const,
          title: c.tag.title,
          tag: c.tag,
          matchId: c.matchId,
          matchTitle: c.matchTitle,
          videoFilePath: c.videoFilePath,
          videoSrc: c.videoSrc,
          chromaFloorConfig: c.chromaFloorConfig,
          showTelestration: c.useTelestration,
        }));

    if (sourceSlides.length === 0) {
      exportStatusMessage =
        "Tidak ada klip atau slide untuk diekspor. Tambahkan ke Presentasi atau sesuaikan filter.";
      return;
    }

    const slideToResolvedClip = (s: Extract<PresentationSlide, { kind: "clip" }>): ResolvedPlaylistClip => {
      const mId = s.matchId || "__active__";
      const matchSrc =
        mId === "__active__"
          ? null
          : projectStore.libraryMatches.find((m) => m.id === mId) || null;
      return {
        key: s.id,
        matchId: mId,
        matchTitle: s.matchTitle || matchSrc?.title || projectStore.videoTitle,
        videoFilePath: s.videoFilePath ?? matchSrc?.videoFilePath ?? projectStore.videoFilePath,
        videoSrc: s.videoSrc ?? matchSrc?.videoSrc ?? projectStore.videoSrc,
        chromaFloorConfig: s.chromaFloorConfig ?? matchSrc?.chromaFloorConfig,
        tag: s.tag,
        hasTelestration: (s.tag.drawings?.length ?? 0) > 0 || Boolean(s.tag.voiceoverAudioBase64),
        useTelestration: s.showTelestration !== false,
      };
    };

    const clipSlides = sourceSlides.filter(
      (s): s is Extract<PresentationSlide, { kind: "clip" }> => s.kind === "clip",
    );

    isExporting = true;
    exportProgress = 5;
    exportStatusMessage = "Menyiapkan klip dan parameter render FFmpeg...";
    exportSuccessPath = null;

    const targetHeight = outputResolution === "720p" ? 720 : 1080;
    const stillH =
      outputAspectRatio === "9:16"
        ? targetHeight === 720
          ? 1280
          : 1920
        : targetHeight;
    const stillW =
      outputAspectRatio === "9:16"
        ? targetHeight
        : targetHeight === 720
          ? 1280
          : 1920;
    const renderW = targetHeight === 720 ? 1280 : 1920;
    const renderH = targetHeight === 720 ? 720 : 1080;

    try {
      const isAbsPath = (p: string | null | undefined) =>
        Boolean(p && (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)));

      if (isTauriDesktop()) {
        const resolvedClipsForCheck = clipSlides.map(slideToResolvedClip);
        const missingVideo = resolvedClipsForCheck.find(
          (c) => !isAbsPath(c.videoFilePath),
        );
        if (missingVideo) {
          throw new Error(
            `Path video absolut tidak ditemukan untuk "${missingVideo.matchTitle}". Simpan ulang proyek dengan video terbuka di Hub Proyek.`,
          );
        }

        const { open, save } = await import("@tauri-apps/plugin-dialog");
        const clips = resolvedClipsForCheck;
        const watermarkPayload = await buildWatermarkExportPayload(
          projectStore.clubLogoDataUrl,
          projectStore.watermarkConfig,
        );

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
          const speedSegmentsPayload = toSpeedSegmentsExportPayload(tag);
          const hasSpeeds = speedSegmentsPayload.length > 0;
          const needsFormatPass =
            outputAspectRatio === "9:16" || outputCrf !== 23;
          const needsBurnPass =
            isAnimated ||
            hasDrawings ||
            hasVoice ||
            hasSubtitle ||
            freezeStopsPayload.length > 0 ||
            hasSpeeds ||
            appendCleanReplay;
          const passWatermark =
            needsBurnPass && needsFormatPass ? null : watermarkPayload;

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
                speedSegments:
                  speedSegmentsPayload.length > 0 ? speedSegmentsPayload : null,
                watermark: passWatermark,
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
              speedSegments:
                speedSegmentsPayload.length > 0 ? speedSegmentsPayload : null,
              watermark: passWatermark,
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
              watermark: watermarkPayload,
            });
          } else {
            await invoke<string>("render_video_clip_ffmpeg", {
              inputPath,
              outputPath: outPath,
              startSec: tag.startTime,
              durationSec: clipDur,
              fastCopy: exportMode !== "merged_video",
              targetHeight,
              watermark: watermarkPayload,
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
              watermark: watermarkPayload,
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

          for (let i = 0; i < sourceSlides.length; i++) {
            const slide = sourceSlides[i];
            if (slide.kind === "title") {
              exportStatusMessage = `Merender slide judul ${i + 1}/${sourceSlides.length}: ${slide.title}...`;
              const pngB64 = renderTitleSlideDataUrl({
                title: slide.title,
                subtitle: slide.subtitle,
                bgColor: slide.bgColor,
                width: stillW,
                height: stillH,
              });
              const tempSlidePath = `${tempDir}${sep}futsaltag_title_${i}_${Date.now()}.mp4`;
              await invoke<string>("render_still_slide_ffmpeg", {
                imageBase64: pngB64,
                outputPath: tempSlidePath,
                durationSec: 3.0,
                targetHeight,
                vertical9x16: outputAspectRatio === "9:16",
              });
              renderedClips.push(tempSlidePath);
            } else if (slide.kind === "image") {
              exportStatusMessage = `Merender slide gambar ${i + 1}/${sourceSlides.length}: ${slide.title}...`;
              const pngB64 = await renderImageSlideDataUrl({
                imageDataUrl: slide.imageDataUrl,
                title: slide.title,
                caption: slide.caption,
                width: stillW,
                height: stillH,
              });
              const tempImgPath = `${tempDir}${sep}futsaltag_img_${i}_${Date.now()}.mp4`;
              await invoke<string>("render_still_slide_ffmpeg", {
                imageBase64: pngB64,
                outputPath: tempImgPath,
                durationSec: 3.5,
                targetHeight,
                vertical9x16: outputAspectRatio === "9:16",
              });
              renderedClips.push(tempImgPath);
            } else if (slide.kind === "clip") {
              const clip = slideToResolvedClip(slide);
              if (activeDeck.showTitleCardBeforeClip && !slide.id.startsWith("extvid-")) {
                exportStatusMessage = `Merender kartu judul ${i + 1}/${sourceSlides.length}: ${clip.tag.title}...`;
                const cardB64 = renderClipTitleCardDataUrl({
                  matchTitle: clip.matchTitle,
                  timeLabel: `${projectStore.formatMatchClock(clip.tag.startTime)}`,
                  category: clip.tag.category,
                  categoryColor: clip.tag.color,
                  clipTitle: clip.tag.title,
                  playerLabel: clip.tag.playerLabel,
                  labels: (clip.tag.labels ?? []).map((l) => l.name),
                  width: stillW,
                  height: stillH,
                });
                const cardPath = `${tempDir}${sep}futsaltag_card_${i}_${Date.now()}.mp4`;
                await invoke<string>("render_still_slide_ffmpeg", {
                  imageBase64: cardB64,
                  outputPath: cardPath,
                  durationSec: activeDeck.titleCardDurationSec || 2.0,
                  targetHeight,
                  vertical9x16: outputAspectRatio === "9:16",
                });
                renderedClips.push(cardPath);
              }
              exportStatusMessage = `Merender klip ${i + 1}/${sourceSlides.length}: [${clip.matchTitle}] ${clip.tag.title}...`;
              const tempClipPath = `${tempDir}${sep}futsaltag_pl_${i}_${Date.now()}.mp4`;
              await renderClipToPath(clip, tempClipPath);
              renderedClips.push(tempClipPath);
            }
            exportProgress = 15 + Math.floor(((i + 1) / sourceSlides.length) * 70);
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

<svelte:window onclick={() => (showMoreExportMenu = false)} />
<div class="playlist-export-hub">
  <!-- TOP SUB-HEADER -->
  <header class="hub-header">
    <div class="header-left">
      <button class="btn-back" onclick={() => projectStore.setStage("tagging")}>
        <ArrowLeft size={16} />
        <span>Kembali ke Tagging</span>
      </button>
      <div class="header-title-wrap">
        <span class="hub-main-title">Presentasi &amp; Ekspor Video</span>
        <span class="hub-sub-title"
          >Kumpulkan klip dari pertandingan, lalu putar di TV atau jadikan satu video.</span
        >
      </div>
    </div>

    <div class="header-right">
      <div class="hd-more-anchor">
        <button
          type="button"
          class="btn-csv"
          onclick={(e) => {
            e.stopPropagation();
            showMoreExportMenu = !showMoreExportMenu;
          }}
        >
          <FileSpreadsheet size={15} />
          <span>Ekspor Lain</span>
          <ChevronDown size={13} />
        </button>
        {#if showMoreExportMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="hd-dropdown" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
            <button type="button" class="hd-dd-item" onclick={() => { showMoreExportMenu = false; exportCSVStats(); }}>
              <FileSpreadsheet size={13} />
              <span>Ekspor Rekap CSV</span>
            </button>
            <button type="button" class="hd-dd-item" onclick={() => { showMoreExportMenu = false; handleExportMatchPdf(); }}>
              <Download size={13} />
              <span>Laporan PDF (A4)</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- MAIN BODY: MOMEN 3-COLUMN LAYOUT (CLIPS SOURCE | PREVIEW STAGE | PRESENTASI & EXPORT) -->
  <div class="hub-grid">
    <!-- COL 1: FILTER + CLIPS LIST -->
    <div class="clips-source-column">
      <ClipFilterBar compact={true} />

      <div class="playlist-items-card">
        <div class="items-header">
          <div class="title-wrap">
            <Layers size={15} />
            <span class="title-text"
              >Klip ({filteredClips.length})</span
            >
          </div>
          <div class="items-hdr-actions">
            {#if filteredClips.length > 0}
              <button
                type="button"
                class="btn-select-all"
                onclick={toggleSelectAllFiltered}
              >
                {allFilteredChecked ? "✓ Semua" : "Pilih Semua"}
              </button>
              <button
                type="button"
                class="btn-to-deck"
                onclick={sendSelectedClipsToDeck}
                title="Kirim klip tercentang (atau semua hasil saring) ke keranjang Presentasi aktif"
              >
                <ArrowRight size={12} />
                <span>Ke Presentasi ({selectedClipKeys.length || filteredClips.length})</span>
              </button>
            {/if}
          </div>
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
                <div class="pir-top">
                  <input
                    type="checkbox"
                    class="clip-check-box"
                    checked={selectedClipKeys.includes(clip.key)}
                    onclick={(e) => {
                      e.stopPropagation();
                      toggleClipSelection(clip.key);
                    }}
                    aria-label="Pilih klip {clip.tag.title}"
                  />
                  <div class="item-order-box">{idx + 1}</div>
                  <span
                    class="item-cat"
                    style="background-color: {clip.tag.color}"
                  >
                    {clip.tag.category}
                  </span>
                  <span class="item-title" title={clip.tag.title}>{clip.tag.title}</span>
                  <span class="meta-time">
                    {fmtClipClock(clip.tag.startTime)}–{fmtClipClock(clip.tag.endTime)}
                  </span>
                </div>

                <div class="pir-bottom">
                  <div class="pir-meta">
                    {#if hasMultiMatch}
                      <span class="match-pill-tag">{clip.matchTitle}</span>
                    {/if}
                    {#if clip.tag.playerLabel}
                      <span class="meta-badge">{clip.tag.playerLabel}</span>
                    {/if}
                    {#each (clip.tag.labels ?? []).slice(0, 2) as lbl}
                      <span class="meta-lbl-pill">{lbl.name}</span>
                    {/each}
                    <span class="meta-freeze">
                      {#if (clip.tag.freezeStops?.length ?? 0) > 1}
                        {clip.tag.freezeStops?.length} Jeda
                      {:else}
                        {(
                          clip.tag.freezeStops?.[0]?.duration ??
                          clip.tag.pauseDuration ??
                          3.0
                        ).toFixed(1)}s
                      {/if}
                      {clip.tag.appendCleanReplay ? "+R" : ""}
                    </span>
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
                      title={clip.useTelestration
                        ? "Tampil Dengan Telestrasi (klik untuk Video Polos)"
                        : "Tampil Video Polos (klik untuk Telestrasi)"}
                    >
                      <Sparkles size={11} />
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
                      <MoveUp size={12} />
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
                      <MoveDown size={12} />
                    </button>
                    <button
                      class="btn-del"
                      onclick={(e) => {
                        e.stopPropagation();
                        removeItem(idx);
                      }}
                      title="Keluarkan sementara dari ekspor"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <!-- COL 2: CENTER PREVIEW STAGE -->
    <div class="preview-column">
      <div class="presentation-player-card">
        <div class="card-bar">
          <div class="bar-title">
            <Tv size={15} />
            <span>Preview</span>
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
              <p>Pilih klip di kiri atau klik Putar</p>
              <span
                >Klik klip untuk pratinjau cepat, atau kirim ke Presentasi di sebelah kanan.</span
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
              <span>Jeda Preview</span>
            {:else}
              <Play size={16} />
              <span>Putar Preview</span>
            {/if}
          </button>

          <div class="pres-ctrl-right">
            <div class="vol-ctrl-box" title="Volume & Bisukan Audio Video">
              <button
                type="button"
                class="vol-mute-btn"
                class:muted={projectStore.videoMuted || projectStore.videoVolume === 0}
                onclick={() => projectStore.toggleVideoMute()}
                aria-label={projectStore.videoMuted ? "Bunyikan Audio" : "Bisukan Audio"}
              >
                {#if projectStore.videoMuted || projectStore.videoVolume === 0}
                  <VolumeX size={13} />
                {:else}
                  <Volume2 size={13} />
                {/if}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={projectStore.videoMuted ? 0 : projectStore.videoVolume}
                oninput={(e) =>
                  projectStore.setVideoVolume(
                    parseFloat((e.currentTarget as HTMLInputElement).value),
                  )}
                class="vol-range-slider"
                aria-label="Volume Preview"
              />
            </div>

            <span class="pres-counter">
              {filteredClips.length} Klip Terfilter
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- COL 3: MULTI-PRESENTATION DECK | EXPORT SETTINGS -->
    <div class="export-column">
      <div class="export-tab-switch" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={rightPanelTab === "deck"}
          class="ets-btn"
          class:active={rightPanelTab === "deck"}
          onclick={() => (rightPanelTab = "deck")}
        >
          Daftar Presentasi ({activeDeck.slides.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rightPanelTab === "export"}
          class="ets-btn"
          class:active={rightPanelTab === "export"}
          onclick={() => (rightPanelTab = "export")}
        >
          Pengaturan Ekspor
        </button>
      </div>

      {#if rightPanelTab === "deck"}
        {#if isExporting || exportProgress > 0}
          <div class="progress-wrap deck-progress-mini">
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
      <!-- MULTI-PRESENTATION DECK BASKET (MOMEN STYLE) -->
      <div class="export-config-card deck-basket-card">
        <div class="deck-top-bar">
          <select
            class="deck-select"
            value={activeDeck.id}
            onchange={(e) =>
              projectStore.selectPresentationDeck(e.currentTarget.value)}
            aria-label="Pilih Deck Presentasi"
          >
            {#each projectStore.presentationDecks as deck (deck.id)}
              <option value={deck.id}
                >{deck.title} ({deck.slides.length})</option
              >
            {/each}
          </select>
          <button
            type="button"
            class="deck-icon-btn"
            onclick={handleCreateDeck}
            title="Buat presentasi baru"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            class="deck-icon-btn"
            onclick={handleRenameDeck}
            title="Ubah nama presentasi"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            class="deck-icon-btn danger"
            disabled={projectStore.presentationDecks.length <= 1}
            onclick={handleDeleteDeck}
            title="Hapus presentasi ini"
          >
            <Trash2 size={12} />
          </button>
        </div>

        <label class="deck-title-card-toggle">
          <div class="dtct-text">
            <strong>Kartu judul sebelum tiap klip (2 detik)</strong>
            <span>Pertandingan, menit, dan tag tampil 2 detik sebelum klip diputar.</span>
          </div>
          <input
            type="checkbox"
            checked={activeDeck.showTitleCardBeforeClip}
            onchange={(e) =>
              projectStore.setActiveDeckTitleCard(
                e.currentTarget.checked,
                activeDeck.titleCardDurationSec || 2,
              )}
          />
        </label>

        <div class="deck-slides-list">
          {#if activeDeck.slides.length === 0}
            <div class="deck-empty-hint">
              Keranjang presentasi masih kosong. Klik <strong>Ke Presentasi</strong> di kiri, atau gunakan seluruh {filteredClips.length} klip terfilter saat ekspor.
            </div>
          {:else}
            {#each activeDeck.slides as slide, idx (slide.id)}
              <div class="deck-slide-row">
                <span class="deck-kind-badge kind-{slide.kind}">
                  {slide.kind === "title"
                    ? "JUDUL"
                    : slide.kind === "image"
                      ? "GAMBAR"
                      : slide.id.startsWith("extvid-")
                        ? "VIDEO"
                        : "KLIP"}
                </span>
                <span class="deck-slide-title">{slide.title}</span>
                {#if slide.kind === "clip" && !slide.id.startsWith("extvid-")}
                  <button
                    type="button"
                    class="btn-tel-toggle"
                    class:active={slide.showTelestration !== false}
                    onclick={() =>
                      projectStore.toggleActiveDeckClipTelestration(slide.id)}
                    title="Toggle Telestrasi untuk klip ini"
                  >
                    <Sparkles size={10} />
                  </button>
                {/if}
                <button
                  type="button"
                  class="btn-order"
                  disabled={idx === 0}
                  onclick={() => projectStore.moveActiveDeckSlide(idx, -1)}
                  title="Naikkan"
                >
                  <MoveUp size={11} />
                </button>
                <button
                  type="button"
                  class="btn-order"
                  disabled={idx === activeDeck.slides.length - 1}
                  onclick={() => projectStore.moveActiveDeckSlide(idx, 1)}
                  title="Turunkan"
                >
                  <MoveDown size={11} />
                </button>
                <button
                  type="button"
                  class="btn-del"
                  onclick={() => projectStore.removeActiveDeckSlide(slide.id)}
                  title="Hapus dari presentasi"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            {/each}
          {/if}
        </div>

        <div class="deck-insert-bar">
          <button
            type="button"
            class="deck-ins-btn"
            onclick={() => (showTitleSlideForm = !showTitleSlideForm)}
          >
            <Type size={12} />
            <span>Judul</span>
          </button>
          <button
            type="button"
            class="deck-ins-btn"
            onclick={() => deckImageInputEl?.click()}
          >
            <ImageIcon size={12} />
            <span>Gambar</span>
          </button>
          <button
            type="button"
            class="deck-ins-btn"
            onclick={handleAddDeckVideoClick}
          >
            <Video size={12} />
            <span>Video</span>
          </button>
          <input
            bind:this={deckImageInputEl}
            type="file"
            accept="image/*"
            class="hidden"
            onchange={handleDeckImageSelected}
          />
          <input
            bind:this={deckVideoInputEl}
            type="file"
            accept="video/*"
            class="hidden"
            onchange={handleDeckVideoInputSelected}
          />
        </div>

        {#if showTitleSlideForm}
          <div class="deck-title-form">
            <input
              type="text"
              placeholder="Judul Slide (mis. Babak 1 — Pressing)"
              bind:value={newSlideTitle}
              class="dtf-input"
            />
            <input
              type="text"
              placeholder="Subjudul opsional..."
              bind:value={newSlideSubtitle}
              class="dtf-input"
            />
            <div class="dtf-actions">
              <input
                type="color"
                bind:value={newSlideBgColor}
                title="Warna latar slide"
              />
              <button
                type="button"
                class="btn-res"
                onclick={() => (showTitleSlideForm = false)}>Batal</button
              >
              <button
                type="button"
                class="btn-res active"
                onclick={handleAddTitleSlide}>Sisipkan</button
              >
            </div>
          </div>
        {/if}

        <div class="deck-bottom-ctas">
          <button
            type="button"
            class="btn-deck-pres"
            onclick={handleOpenPresentationFromDeck}
          >
            <MonitorPlay size={14} />
            <span>Putar Layar Penuh</span>
          </button>
          <button
            type="button"
            class="btn-deck-merge"
            disabled={isExporting}
            onclick={() => {
              exportMode = "merged_video";
              triggerExport();
            }}
          >
            <Film size={14} />
            <span>Jadikan Satu Video</span>
          </button>
        </div>
      </div>
      {:else}
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
              <span class="res-title"
                >Estimasi Ukuran ({totalEstimatedDurationSec.toFixed(0)} dtk):</span
              >
              <span class="btn-res active">{estimatedTotalSizeText}</span>
            </div>
          {/if}

          <div class="wm-export-box">
            <input
              bind:this={wmLogoInputEl}
              type="file"
              accept="image/*"
              class="hidden"
              onchange={handleWmLogoSelected}
            />
            <div class="wm-box-hdr">
              <span class="res-title">Watermark Logo Klub di Video:</span>
              <div class="wm-box-actions">
                <button
                  type="button"
                  class="btn-res"
                  onclick={() => wmLogoInputEl?.click()}
                >
                  {projectStore.clubLogoDataUrl
                    ? "Ganti Logo"
                    : "+ Upload Logo"}
                </button>
                {#if projectStore.clubLogoDataUrl}
                  <button
                    type="button"
                    class="btn-res"
                    class:active={projectStore.watermarkConfig.enabled}
                    onclick={() => {
                      projectStore.watermarkConfig.enabled =
                        !projectStore.watermarkConfig.enabled;
                      projectStore.markDirty();
                    }}
                  >
                    {projectStore.watermarkConfig.enabled
                      ? "Aktif"
                      : "Nonaktif"}
                  </button>
                {/if}
              </div>
            </div>
            {#if projectStore.clubLogoDataUrl && projectStore.watermarkConfig.enabled}
              <div class="res-buttons">
                {#each [{ id: "top-right", lbl: "Atas Kanan" }, { id: "top-left", lbl: "Atas Kiri" }, { id: "bottom-right", lbl: "Bawah Kanan" }, { id: "bottom-left", lbl: "Bawah Kiri" }] as pos}
                  <button
                    type="button"
                    class="btn-res"
                    class:active={projectStore.watermarkConfig.position ===
                      pos.id}
                    onclick={() => {
                      projectStore.watermarkConfig.position = pos.id as any;
                      projectStore.markDirty();
                    }}
                  >
                    {pos.lbl}
                  </button>
                {/each}
              </div>
              <div class="res-row">
                <span class="res-title"
                  >Opasitas ({Math.round(
                    projectStore.watermarkConfig.opacity * 100,
                  )}%):</span
                >
                <input
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  bind:value={projectStore.watermarkConfig.opacity}
                  onchange={() => projectStore.markDirty()}
                />
              </div>
            {/if}
          </div>
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
          <button
            type="button"
            class="btn-interop"
            onclick={handleExportHtmlStats}
            title="Ekspor file .html interaktif mandiri untuk dibuka langsung di HP / WhatsApp pemain"
          >
            <Globe size={13} />
            <span>Statistik HTML (Mobile)</span>
          </button>
          <button
            type="button"
            class="btn-interop"
            onclick={() => (isCloudOpen = true)}
            title="Unggah proyek .futsal, statistik .html, atau video .mp4 ke Nextcloud / WebDAV / S3"
          >
            <CloudUpload size={13} />
            <span>Upload Cloud (WebDAV / S3)</span>
          </button>
        </div>
      </div>
      {/if}
    </div>
  </div>
</div>

<CloudExportModal isOpen={isCloudOpen} onClose={() => (isCloudOpen = false)} />

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

  /* GRID (MOMEN 3-COLUMN: FILTER+KLIP | PREVIEW | PRESENTASI/EKSPOR) */
  .hub-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(275px, 325px) minmax(0, 1fr) minmax(325px, 390px);
    gap: 12px;
    padding: 12px 14px;
    overflow: hidden;
    box-sizing: border-box;
  }

  .clips-source-column,
  .preview-column {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .preview-column .presentation-player-card {
    flex: 1;
    min-height: 0;
  }

  .preview-column .video-frame {
    flex: 1;
    height: auto;
    min-height: 220px;
  }

  .hd-more-anchor {
    position: relative;
  }

  .hd-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 80;
    min-width: 190px;
    background: #091322;
    border: 1px solid #1e4570;
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hd-dd-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 600;
    padding: 7px 9px;
    border-radius: 6px;
    cursor: pointer;
  }

  .hd-dd-item:hover {
    background: #12284a;
    color: #ffffff;
  }

  .export-tab-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    background: #050b16;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 3px;
    flex-shrink: 0;
  }

  .ets-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .ets-btn.active {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
  }

  .export-column .deck-basket-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .export-column .deck-slides-list {
    flex: 1;
    min-height: 140px;
    max-height: none;
  }

  .deck-progress-mini {
    flex-shrink: 0;
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
    gap: 8px;
  }

  .bar-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
    flex-shrink: 0;
  }

  .now-playing-badge {
    font-size: 10px;
    background-color: #0f2d4a;
    color: #38bdf8;
    border: 1px solid #0284c7;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    min-width: 0;
    max-width: 72%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    gap: 8px;
    border-top: 1px solid #1a355d;
  }

  .pres-ctrl-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .vol-ctrl-box {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #081223;
    border: 1px solid #1a355d;
    border-radius: 5px;
    padding: 3px 7px;
  }

  .vol-mute-btn {
    background: transparent;
    border: none;
    color: #93c5fd;
    padding: 1px;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .vol-mute-btn.muted {
    color: #f87171;
  }

  .vol-range-slider {
    width: 64px;
    height: 4px;
    accent-color: #38bdf8;
    cursor: pointer;
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
    padding: 7px 9px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
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

  .pir-top,
  .pir-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .pir-bottom {
    justify-content: space-between;
    padding-left: 20px;
  }

  .pir-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    min-width: 0;
    flex: 1;
  }

  .item-order-box {
    width: 19px;
    height: 19px;
    background-color: #060b14;
    color: #38bdf8;
    font-size: 9.5px;
    font-weight: 800;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #1a355d;
    flex-shrink: 0;
  }

  .item-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    flex-shrink: 0;
    white-space: nowrap;
  }

  .meta-time {
    font-family: monospace;
    font-size: 9.5px;
    color: #38bdf8;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .meta-badge {
    font-size: 9px;
    background-color: #060b14;
    color: #93c5fd;
    border: 1px solid #1a355d;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
  }

  .meta-freeze {
    font-size: 9px;
    color: #fbbf24;
    white-space: nowrap;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
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

  .wm-export-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    background: #07101f;
    border: 1px solid #1a355d;
    border-radius: 8px;
  }

  .wm-box-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .wm-box-actions {
    display: flex;
    gap: 6px;
  }

  .hidden {
    display: none;
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

  @media (max-width: 1120px) {
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

    .clips-source-column,
    .preview-column,
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

  .items-hdr-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-select-all,
  .btn-to-deck {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 5px;
    cursor: pointer;
    border: 1px solid #1e3b68;
    background: #0b172a;
    color: #93c5fd;
  }

  .btn-to-deck {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .clip-check-box {
    accent-color: #38bdf8;
    cursor: pointer;
    flex-shrink: 0;
  }

  .deck-basket-card {
    gap: 10px;
  }

  .deck-top-bar {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .deck-select {
    flex: 1;
    min-width: 0;
    background: #060b14;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 8px;
    border-radius: 6px;
  }

  .deck-icon-btn {
    background: #0b172a;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    border-radius: 6px;
    padding: 5px 7px;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .deck-icon-btn.danger:hover:not(:disabled) {
    border-color: #ef4444;
    color: #fca5a5;
  }

  .deck-icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .deck-title-card-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #07101f;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .deck-title-card-toggle input[type="checkbox"] {
    accent-color: #38bdf8;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .dtct-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dtct-text strong {
    font-size: 11px;
    color: #f1f5f9;
  }

  .dtct-text span {
    font-size: 9.5px;
    color: #94a3b8;
  }

  .deck-slides-list {
    max-height: 195px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: #050b16;
    border: 1px solid #1a355d;
    border-radius: 7px;
    padding: 6px;
  }

  .deck-empty-hint {
    font-size: 10.5px;
    color: #94a3b8;
    padding: 8px 4px;
    line-height: 1.45;
  }

  .deck-slide-row {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #091529;
    border: 1px solid #183259;
    border-radius: 5px;
    padding: 4px 6px;
  }

  .deck-kind-badge {
    font-size: 8px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 3px;
    background: #1e3a8a;
    color: #bfdbfe;
    flex-shrink: 0;
  }

  .deck-kind-badge.kind-title {
    background: #7c2d12;
    color: #fed7aa;
  }

  .deck-kind-badge.kind-image {
    background: #065f46;
    color: #a7f3d0;
  }

  .deck-slide-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .deck-insert-bar,
  .deck-bottom-ctas {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .deck-bottom-ctas {
    grid-template-columns: 1fr 1fr;
  }

  .deck-ins-btn,
  .btn-deck-pres,
  .btn-deck-merge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 10.5px;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid #1e3b68;
    background: #0b172a;
    color: #cbd5e1;
  }

  .btn-deck-pres {
    background: #0d1e38;
    border-color: #38bdf8;
    color: #7dd3fc;
  }

  .btn-deck-merge {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .deck-title-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #07101f;
    border: 1px solid #1e3b68;
    border-radius: 7px;
    padding: 8px;
  }

  .dtf-input {
    background: #040912;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 5px;
  }

  .dtf-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
</style>
