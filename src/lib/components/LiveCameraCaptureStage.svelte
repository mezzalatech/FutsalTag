<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    isTauriDesktop,
    projectStore,
  } from "$lib/stores/projectStore.svelte";
  import {
    Camera,
    Video,
    Square,
    RotateCcw,
    Play,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    Radio,
  } from "lucide-svelte";

  interface Props {
    isRecording?: boolean;
    currentTime?: number;
    duration?: number;
  }

  let {
    isRecording = $bindable(false),
    currentTime = $bindable(0),
    duration = $bindable(2400),
  }: Props = $props();

  let captureEngine = $state<"browser" | "dshow">("browser");
  let videoDevices = $state<{ deviceId: string; label: string }[]>([]);
  let audioDevices = $state<{ deviceId: string; label: string }[]>([]);
  let dshowVideoDevices = $state<string[]>([]);
  let dshowAudioDevices = $state<string[]>([]);

  let selectedVideoId = $state("");
  let selectedAudioId = $state("");
  let selectedDshowVideo = $state("");
  let selectedDshowAudio = $state("");
  let resolutionPreset = $state<"720p30" | "1080p30" | "1080p60">("720p30");

  let liveVideoEl = $state<HTMLVideoElement | null>(null);
  let replayVideoEl = $state<HTMLVideoElement | null>(null);
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedBlobs: Blob[] = [];
  let hasReplayBuffer = $state(false);
  let pendingChunkWrites: Promise<void> = Promise.resolve();
  let tempPartPath = $state<string | null>(null);
  let bytesWritten = $state(0);

  let isPreviewActive = $state(false);
  let isFinalizing = $state(false);
  let captureError = $state<string | null>(null);
  let statusText = $state<string | null>(null);

  // Instant Replay State ("Tonton Ulang" saat rekaman tetap berjalan)
  let isReplayMode = $state(false);
  let replayUrl = $state<string | null>(null);

  function presetDims(): { width: number; height: number; fps: number } {
    if (resolutionPreset === "1080p60") return { width: 1920, height: 1080, fps: 60 };
    if (resolutionPreset === "1080p30") return { width: 1920, height: 1080, fps: 30 };
    return { width: 1280, height: 720, fps: 30 };
  }

  async function refreshDevices() {
    captureError = null;
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const vids = list
          .filter((d) => d.kind === "videoinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Kamera / Capture #${i + 1}`,
          }));
        const auds = list
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Mikrofon #${i + 1}`,
          }));
        videoDevices = vids;
        audioDevices = auds;
        if (!selectedVideoId && vids.length > 0) selectedVideoId = vids[0].deviceId;
        if (!selectedAudioId && auds.length > 0) selectedAudioId = auds[0].deviceId;
      } catch {
        // Ignore enumerate errors before permission grant
      }
    }

    if (isTauriDesktop()) {
      try {
        const res = await invoke<{ video_devices: string[]; audio_devices: string[] }>(
          "list_capture_devices_ffmpeg",
        );
        dshowVideoDevices = res.video_devices || [];
        dshowAudioDevices = res.audio_devices || [];
        if (!selectedDshowVideo && dshowVideoDevices.length > 0) {
          selectedDshowVideo = dshowVideoDevices[0];
        }
        if (!selectedDshowAudio && dshowAudioDevices.length > 0) {
          selectedDshowAudio = dshowAudioDevices[0];
        }
      } catch {
        // Ignore dshow list fallback
      }
    }
  }

  async function startCameraPreview(): Promise<boolean> {
    captureError = null;
    stopCameraStream();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      captureError = "Perangkat browser/WebView ini tidak mendukung preview getUserMedia. Gunakan mode FFmpeg Capture.";
      return false;
    }
    const { width, height, fps } = presetDims();
    try {
      const videoConstraint: MediaTrackConstraints = {
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: fps },
      };
      if (selectedVideoId) videoConstraint.deviceId = { exact: selectedVideoId };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true,
          audio: false,
        });
      }

      mediaStream = stream;
      isPreviewActive = true;
      if (liveVideoEl) {
        liveVideoEl.srcObject = stream;
        liveVideoEl.play().catch(() => {});
      }
      await refreshDevices();
      return true;
    } catch (err: any) {
      captureError = `Kamera gagal dibuka (${err?.message || err}). Tutup Zoom/OBS jika sedang memakai kamera.`;
      return false;
    }
  }

  function stopCameraStream() {
    if (mediaStream) {
      for (const t of mediaStream.getTracks()) t.stop();
      mediaStream = null;
    }
    if (liveVideoEl) {
      liveVideoEl.srcObject = null;
    }
    isPreviewActive = false;
  }

  async function ensureOutputTargetPath(): Promise<string | null> {
    if (projectStore.liveCaptureTargetPath) return projectStore.liveCaptureTargetPath;
    if (!isTauriDesktop()) return null;
    const { save } = await import("@tauri-apps/plugin-dialog");
    const safe = (projectStore.videoTitle || "live_capture_futsal")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();
    const chosen = await save({
      title: "Simpan Rekaman MP4 Pertandingan",
      defaultPath: `${safe}.mp4`,
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });
    if (chosen) {
      projectStore.liveCaptureTargetPath = chosen;
    }
    return chosen || null;
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = typeof reader.result === "string" ? reader.result : "";
        const idx = res.indexOf(",");
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function pickRecorderMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") return undefined;
    const candidates = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      "video/mp4",
    ];
    return candidates.find((c) => MediaRecorder.isTypeSupported(c));
  }

  async function startLiveRecording() {
    captureError = null;
    if (isRecording || isFinalizing) return;

    if (captureEngine === "dshow") {
      if (!isTauriDesktop()) {
        captureError = "Mode FFmpeg Capture hanya berjalan di aplikasi Desktop.";
        return;
      }
      if (!selectedDshowVideo) {
        captureError = "Pilih perangkat kamera / HDMI Capture Card terlebih dahulu.";
        return;
      }
      const targetOut = await ensureOutputTargetPath();
      if (!targetOut) return;
      stopCameraStream();
      const { width, height, fps } = presetDims();
      try {
        await invoke("start_dshow_capture_ffmpeg", {
          videoDevice: selectedDshowVideo,
          audioDevice: selectedDshowAudio || null,
          outputPath: targetOut,
          fps,
          width,
          height,
        });
        currentTime = 0;
        projectStore.currentTime = 0;
        isRecording = true;
        statusText = `Merekam FFmpeg (${selectedDshowVideo})...`;
      } catch (err: any) {
        captureError = String(err?.message || err);
      }
      return;
    }

    // Browser / WebView2 preview + chunk-to-disk recording
    if (!mediaStream) {
      const ok = await startCameraPreview();
      if (!ok || !mediaStream) return;
    }

    let outPath: string | null = null;
    if (isTauriDesktop()) {
      outPath = await ensureOutputTargetPath();
      if (!outPath) return;
      try {
        tempPartPath = await invoke<string>("start_capture_temp_file", {
          outputPath: outPath,
        });
      } catch (err: any) {
        captureError = String(err?.message || err);
        return;
      }
    }

    recordedBlobs = [];
    hasReplayBuffer = false;
    bytesWritten = 0;
    pendingChunkWrites = Promise.resolve();
    const mime = pickRecorderMimeType();
    mediaRecorder = mime
      ? new MediaRecorder(mediaStream, { mimeType: mime, videoBitsPerSecond: 3_500_000 })
      : new MediaRecorder(mediaStream, { videoBitsPerSecond: 3_500_000 });

    mediaRecorder.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size === 0) return;
      recordedBlobs.push(ev.data);
      hasReplayBuffer = true;
      const tPath = tempPartPath;
      if (tPath && isTauriDesktop()) {
        pendingChunkWrites = pendingChunkWrites.then(async () => {
          const b64 = await blobToBase64(ev.data);
          bytesWritten = await invoke<number>("append_capture_chunk", {
            tempPath: tPath,
            chunkBase64: b64,
          });
        });
      }
    };

    currentTime = 0;
    projectStore.currentTime = 0;
    mediaRecorder.start(1000);
    isRecording = true;
    statusText = "Merekam langsung & siap menerima Tag...";
  }

  async function stopAndFinalizeRecording() {
    if (!isRecording || isFinalizing) return;
    captureError = null;
    isFinalizing = true;
    isRecording = false;
    closeInstantReplay();

    try {
      if (captureEngine === "dshow") {
        const target = projectStore.liveCaptureTargetPath;
        if (!target) throw new Error("Path output MP4 tidak ditemukan.");
        statusText = "Menutup & mengemas file MP4 FFmpeg Capture...";
        const finalPath = await invoke<string>("stop_dshow_capture_ffmpeg", {
          outputPath: target,
        });
        statusText = "Rekaman selesai!";
        projectStore.attachCapturedMp4(finalPath);
        return;
      }

      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          if (!mediaRecorder) return resolve();
          mediaRecorder.addEventListener("stop", () => resolve(), { once: true });
          mediaRecorder.stop();
        });
      }
      await pendingChunkWrites;
      stopCameraStream();

      if (isTauriDesktop() && tempPartPath && projectStore.liveCaptureTargetPath) {
        statusText = "Mengonversi stream rekaman menjadi MP4 seek-instan...";
        const finalPath = await invoke<string>("finalize_capture_mp4_ffmpeg", {
          tempPath: tempPartPath,
          outputPath: projectStore.liveCaptureTargetPath,
        });
        tempPartPath = null;
        projectStore.attachCapturedMp4(finalPath);
      } else if (recordedBlobs.length > 0) {
        const blob = new Blob(recordedBlobs, {
          type: mediaRecorder?.mimeType || "video/webm",
        });
        const url = URL.createObjectURL(blob);
        projectStore.liveCaptureActive = false;
        projectStore.videoSrc = url;
        projectStore.videoFilePath = "rekaman_live.webm";
      }
    } catch (err: any) {
      captureError = `Gagal memfinalisasi rekaman: ${err?.message || err}`;
    } finally {
      isFinalizing = false;
    }
  }

  function openInstantReplay() {
    if (recordedBlobs.length === 0) return;
    if (replayUrl) URL.revokeObjectURL(replayUrl);
    const blob = new Blob(recordedBlobs, {
      type: mediaRecorder?.mimeType || "video/webm",
    });
    replayUrl = URL.createObjectURL(blob);
    isReplayMode = true;
  }

  function handleReplayLoaded() {
    if (!replayVideoEl) return;
    const d = replayVideoEl.duration;
    if (Number.isFinite(d) && d > 0) {
      replayVideoEl.currentTime = Math.max(0, d - 15);
    }
    replayVideoEl.play().catch(() => {});
  }

  function closeInstantReplay() {
    isReplayMode = false;
    if (replayUrl) {
      URL.revokeObjectURL(replayUrl);
      replayUrl = null;
    }
    if (liveVideoEl && mediaStream) {
      liveVideoEl.srcObject = mediaStream;
      liveVideoEl.play().catch(() => {});
    }
  }

  // Real-time match recording clock ticker so hotkey tagging aligns 1:1 with captured video
  $effect(() => {
    if (!isRecording) return;
    let lastMs = performance.now();
    let rafId = 0;
    const step = (now: number) => {
      const dt = Math.min(0.25, Math.max(0, (now - lastMs) / 1000));
      lastMs = now;
      currentTime += dt;
      projectStore.currentTime = currentTime;
      if (currentTime >= duration - 10) {
        duration = Math.max(duration, Math.ceil(currentTime + 600));
        projectStore.duration = duration;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  });

  $effect(() => {
    if (liveVideoEl && mediaStream && !isReplayMode && liveVideoEl.srcObject !== mediaStream) {
      liveVideoEl.srcObject = mediaStream;
      liveVideoEl.play().catch(() => {});
    }
  });

  function formatClock(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  onMount(() => {
    refreshDevices();
  });

  onDestroy(() => {
    if (replayUrl) URL.revokeObjectURL(replayUrl);
    stopCameraStream();
  });
</script>

<div class="live-capture-stage">
  <div class="lc-topbar">
    <div class="lc-status-group">
      <span class="lc-rec-pill" class:recording={isRecording}>
        <Radio size={12} />
        <span>{isRecording ? `REC ${formatClock(currentTime)}` : "KAMERA LIVE SIAP"}</span>
      </span>
      {#if bytesWritten > 0}
        <span class="lc-size-pill">{(bytesWritten / (1024 * 1024)).toFixed(1)} MB tersimpan</span>
      {/if}
      {#if statusText}
        <span class="lc-note">{statusText}</span>
      {/if}
    </div>

    <div class="lc-controls-group">
      {#if isTauriDesktop()}
        <select class="lc-select" bind:value={captureEngine} disabled={isRecording || isFinalizing}>
          <option value="browser">Mode Preview + Instant Replay (Webcam / GoPro / UVC)</option>
          <option value="dshow">Mode FFmpeg Capture (Capture Card / AVFoundation)</option>
        </select>
      {/if}

      {#if captureEngine === "browser"}
        <select class="lc-select" bind:value={selectedVideoId} disabled={isRecording}>
          {#if videoDevices.length === 0}
            <option value="">Kamera Default</option>
          {:else}
            {#each videoDevices as dev}
              <option value={dev.deviceId}>{dev.label}</option>
            {/each}
          {/if}
        </select>
        <select class="lc-select" bind:value={selectedAudioId} disabled={isRecording}>
          {#if audioDevices.length === 0}
            <option value="">Mikrofon Default</option>
          {:else}
            {#each audioDevices as aud}
              <option value={aud.deviceId}>{aud.label}</option>
            {/each}
          {/if}
        </select>
      {:else}
        <select class="lc-select" bind:value={selectedDshowVideo} disabled={isRecording}>
          {#if dshowVideoDevices.length === 0}
            <option value="">Tidak ada device capture terdeteksi</option>
          {:else}
            {#each dshowVideoDevices as dev}
              <option value={dev}>{dev}</option>
            {/each}
          {/if}
        </select>
        <select class="lc-select" bind:value={selectedDshowAudio} disabled={isRecording}>
          <option value="">Tanpa Audio / Default</option>
          {#each dshowAudioDevices as aud}
            <option value={aud}>{aud}</option>
          {/each}
        </select>
      {/if}

      <select class="lc-select mini" bind:value={resolutionPreset} disabled={isRecording}>
        <option value="720p30">720p 30fps</option>
        <option value="1080p30">1080p 30fps</option>
        <option value="1080p60">1080p 60fps</option>
      </select>

      <button type="button" class="lc-btn" onclick={refreshDevices} disabled={isRecording} title="Cari ulang kamera/capture card">
        <RefreshCw size={12} />
      </button>
    </div>
  </div>

  <div class="lc-viewport">
    {#if isReplayMode && replayUrl}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={replayVideoEl}
        src={replayUrl}
        controls
        class="lc-video"
        onloadedmetadata={handleReplayLoaded}
      ></video>
      <div class="lc-replay-banner">
        <span>MODE TONTON ULANG INSTAN (REKAMAN MASIH BERJALAN DI LATAR BELAKANG)</span>
        <button type="button" class="lc-btn live-back" onclick={closeInstantReplay}>
          Kembali ke Live Kamera
        </button>
      </div>
    {:else if captureEngine === "browser" && isPreviewActive}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={liveVideoEl} autoplay muted playsinline class="lc-video"></video>
    {:else}
      <div class="lc-placeholder">
        <Camera size={32} class="text-sky-400" />
        <h4>{captureEngine === "dshow" ? "Capture Card FFmpeg Siap" : "Preview Kamera Belum Dibuka"}</h4>
        <p>
          Sambungkan kamera, GoPro (mode webcam), atau HDMI Capture Card, lalu tekan <strong>Buka Preview</strong> atau langsung <strong>Mulai Rekam</strong>.
        </p>
      </div>
    {/if}

    {#if captureError}
      <div class="lc-error">
        <AlertTriangle size={14} />
        <span>{captureError}</span>
      </div>
    {/if}
  </div>

  <div class="lc-bottombar">
    {#if captureEngine === "browser" && !isRecording}
      <button type="button" class="lc-btn" onclick={startCameraPreview} disabled={isFinalizing}>
        <Video size={13} />
        <span>{isPreviewActive ? "Muat Ulang Preview" : "Buka Preview Kamera"}</span>
      </button>
    {/if}

    {#if !isRecording}
      <button type="button" class="lc-btn rec-start" onclick={startLiveRecording} disabled={isFinalizing}>
        <Camera size={13} />
        <span>{isFinalizing ? "Menyimpan MP4..." : "Mulai Rekam & Live Tagging"}</span>
      </button>
    {:else}
      {#if captureEngine === "browser" && hasReplayBuffer && !isReplayMode}
        <button type="button" class="lc-btn replay" onclick={openInstantReplay}>
          <RotateCcw size={13} />
          <span>Tonton Ulang (-15s)</span>
        </button>
      {/if}
      <button type="button" class="lc-btn rec-stop" onclick={stopAndFinalizeRecording} disabled={isFinalizing}>
        <Square size={12} />
        <span>Hentikan & Jadikan MP4 Proyek</span>
      </button>
    {/if}

    {#if !isRecording && !isFinalizing}
      <button
        type="button"
        class="lc-btn"
        onclick={() => {
          stopCameraStream();
          projectStore.liveCaptureActive = false;
        }}
        title="Beralih ke Mode Stopwatch Tanpa Video"
      >
        <Play size={12} />
        <span>Mode Stopwatch Saja</span>
      </button>
    {/if}

    {#if isFinalizing}
      <span class="lc-finalizing"><CheckCircle2 size={13} /> Memfinalisasi MP4 ke disk...</span>
    {/if}
  </div>
</div>

<style>
  .live-capture-stage {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #060b14;
  }

  .lc-topbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 10px;
    background: #0a1426;
    border-bottom: 1px solid #1a2e4d;
  }

  .lc-status-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .lc-rec-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: 'Fira Code', monospace;
    font-size: 10.5px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(14, 165, 233, 0.14);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #7dd3fc;
  }

  .lc-rec-pill.recording {
    background: rgba(239, 68, 68, 0.22);
    border-color: #ef4444;
    color: #fecaca;
  }

  .lc-size-pill,
  .lc-note {
    font-size: 10px;
    color: #94a3b8;
  }

  .lc-controls-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .lc-select {
    background: #0f172a;
    border: 1px solid #243b61;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 4px 7px;
    font-size: 10.5px;
    max-width: 170px;
  }

  .lc-select.mini {
    max-width: 105px;
  }

  .lc-viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    background: #030712;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .lc-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .lc-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
    padding: 20px;
    max-width: 440px;
  }

  .lc-placeholder h4 {
    margin: 0;
    font-size: 14px;
    color: #f8fafc;
  }

  .lc-placeholder p {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: #94a3b8;
  }

  .lc-replay-banner {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: rgba(120, 53, 15, 0.9);
    border: 1px solid #f59e0b;
    color: #fef3c7;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 800;
  }

  .lc-error {
    position: absolute;
    bottom: 10px;
    left: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(127, 29, 29, 0.92);
    border: 1px solid #ef4444;
    color: #fecaca;
    padding: 7px 10px;
    border-radius: 7px;
    font-size: 11px;
  }

  .lc-bottombar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 7px 10px;
    background: #0a1426;
    border-top: 1px solid #1a2e4d;
  }

  .lc-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0f172a;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .lc-btn:hover:not(:disabled) {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .lc-btn.rec-start {
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    border-color: #f87171;
    color: #ffffff;
  }

  .lc-btn.rec-stop {
    background: #065f46;
    border-color: #10b981;
    color: #ecfdf5;
  }

  .lc-btn.replay,
  .lc-btn.live-back {
    background: rgba(245, 158, 11, 0.2);
    border-color: #f59e0b;
    color: #fde68a;
  }

  .lc-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .lc-finalizing {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 700;
    color: #34d399;
  }
</style>
