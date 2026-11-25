<script lang="ts">
  import { Mic, Square, Play, Pause, Trash2, Check, Sparkles } from 'lucide-svelte';

  interface Props {
    existingAudioBase64?: string;
    transcript?: string;
    burnSubtitle?: boolean;
    isTranscribing?: boolean;
    whisperAvailable?: boolean;
    whisperEngineLabel?: string;
    onSaveVoiceover: (base64Audio: string) => void;
    onClearVoiceover: () => void;
    onTranscribeVoiceover?: () => void;
    onUpdateTranscript?: (text: string) => void;
    onToggleBurnSubtitle?: (enabled: boolean) => void;
  }

  let {
    existingAudioBase64,
    transcript = '',
    burnSubtitle = true,
    isTranscribing = false,
    whisperAvailable = false,
    whisperEngineLabel = 'Whisper Offline',
    onSaveVoiceover,
    onClearVoiceover,
    onTranscribeVoiceover,
    onUpdateTranscript,
    onToggleBurnSubtitle,
  }: Props = $props();

  let isRecording = $state(false);
  let recordSeconds = $state(0);
  let recordTimer: any = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  let audioUrl = $state<string | null>(null);
  let audioEl = $state<HTMLAudioElement | null>(null);
  let isPlayingAudio = $state(false);

  $effect(() => {
    if (existingAudioBase64) {
      audioUrl = existingAudioBase64.startsWith('data:')
        ? existingAudioBase64
        : `data:audio/webm;base64,${existingAudioBase64}`;
    } else if (!isRecording) {
      audioUrl = null;
    }
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = reader.result as string;
          audioUrl = b64;
          onSaveVoiceover(b64);
        };
        reader.readAsDataURL(blob);

        // Stop media stream tracks
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordSeconds = 0;
      recordTimer = setInterval(() => {
        recordSeconds += 1;
      }, 1000);
    } catch {
      alert('Tidak dapat mengakses mikrofon. Pastikan izin mikrofon telah diberikan di sistem.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      if (recordTimer) clearInterval(recordTimer);
    }
  }

  function togglePlayPreview() {
    if (!audioEl) return;
    if (audioEl.paused) {
      audioEl.play();
      isPlayingAudio = true;
    } else {
      audioEl.pause();
      isPlayingAudio = false;
    }
  }

  function deleteVoiceover() {
    audioUrl = null;
    isPlayingAudio = false;
    onClearVoiceover();
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
</script>

<div class="voiceover-recorder-box">
  <div class="vo-header">
    <div class="vo-title">
      <Mic size={14} class="vo-icon" />
      <span>Instruksi Suara Pelatih (Voiceover)</span>
    </div>

    {#if audioUrl && !isRecording}
      <span class="badge-ready">
        <Check size={11} />
        <span>Audio Siap</span>
      </span>
    {/if}
  </div>

  <div class="vo-controls">
    {#if !isRecording && !audioUrl}
      <button class="btn-mic-start" onclick={startRecording} title="Mulai rekam instruksi suara untuk klip ini">
        <Mic size={14} />
        <span>Rekam Suara (Mic)</span>
      </button>
    {:else if isRecording}
      <div class="recording-indicator">
        <span class="rec-dot"></span>
        <span class="rec-time">Merekam: {formatTime(recordSeconds)}</span>
      </div>
      <button class="btn-mic-stop" onclick={stopRecording} title="Hentikan rekaman suara">
        <Square size={13} />
        <span>Selesai</span>
      </button>
    {:else if audioUrl}
      <!-- Audio Player Preview -->
      <!-- svelte-ignore a11y_media_has_caption -->
      <audio
        bind:this={audioEl}
        src={audioUrl}
        onended={() => (isPlayingAudio = false)}
        class="hidden-audio"
      ></audio>

      <button class="btn-play-audio" onclick={togglePlayPreview} title={isPlayingAudio ? 'Jeda Audio' : 'Dengarkan Rekaman'}>
        {#if isPlayingAudio}
          <Pause size={13} />
          <span>Jeda</span>
        {:else}
          <Play size={13} />
          <span>Dengar Audio</span>
        {/if}
      </button>

      <button class="btn-del-audio" onclick={deleteVoiceover} title="Hapus rekaman audio ini">
        <Trash2 size={13} />
      </button>
    {/if}
  </div>

  {#if audioUrl && !isRecording && onTranscribeVoiceover}
    <button
      type="button"
      class="btn-whisper-transcribe"
      disabled={isTranscribing || !whisperAvailable}
      onclick={onTranscribeVoiceover}
      title={whisperAvailable ? `Transkrip audio suara otomatis secara offline (${whisperEngineLabel})` : 'Whisper Offline tersedia di aplikasi Desktop Tauri'}
    >
      <Sparkles size={12} />
      <span>
        {isTranscribing
          ? 'Mentranskrip Suara (Offline)...'
          : transcript
            ? 'Transkrip Ulang (Whisper)'
            : 'Transkrip Otomatis (Offline)'}
      </span>
    </button>
  {/if}

  {#if transcript || (audioUrl && !isRecording)}
    <div class="vo-subtitle-box">
      <textarea
        class="vo-transcript-input"
        rows="2"
        placeholder="Teks subtitle / instruksi taktik (bisa diketik manual atau via Whisper)..."
        value={transcript}
        oninput={(e) => onUpdateTranscript?.((e.currentTarget as HTMLTextAreaElement).value)}
      ></textarea>

      {#if transcript.trim().length > 0 && onToggleBurnSubtitle}
        <label class="vo-burn-toggle">
          <input
            type="checkbox"
            checked={burnSubtitle}
            onchange={(e) => onToggleBurnSubtitle?.((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>Burn-in Subtitle ke Video MP4</span>
        </label>
      {/if}
    </div>
  {/if}

  <div class="vo-hint">
    Suara pelatih dimixing & subtitle dapat dibakar ke MP4 secara offline.
  </div>
</div>

<style>
  .voiceover-recorder-box {
    background: #081224;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .vo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .vo-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #e2e8f0;
  }

  :global(.vo-icon) {
    color: #38bdf8;
  }

  .badge-ready {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    font-weight: 800;
    color: #34d399;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10b981;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .vo-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-mic-start {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
    transition: all 0.15s;
  }

  .btn-mic-start:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }

  .recording-indicator {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    padding: 6px 10px;
    border-radius: 6px;
  }

  .rec-dot {
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    animation: blink 1s infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .rec-time {
    font-family: monospace;
    font-size: 11px;
    font-weight: 700;
    color: #f87171;
  }

  .btn-mic-stop {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #ef4444;
    color: #ffffff;
    border: none;
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-play-audio {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #142a4d;
    border: 1px solid #38bdf8;
    color: #38bdf8;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-play-audio:hover {
    background: #1e3b68;
    color: #ffffff;
  }

  .btn-del-audio {
    background: transparent;
    border: 1px solid #7f1d1d;
    color: #ef4444;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-del-audio:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .btn-whisper-transcribe {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid #10b981;
    color: #6ee7b7;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-whisper-transcribe:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.26);
    color: #ffffff;
  }

  .btn-whisper-transcribe:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .vo-subtitle-box {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .vo-transcript-input {
    width: 100%;
    box-sizing: border-box;
    background: #050b16;
    border: 1px solid #1e3b68;
    border-radius: 5px;
    color: #f1f5f9;
    font-size: 10px;
    line-height: 1.35;
    padding: 5px 7px;
    resize: vertical;
    font-family: system-ui, sans-serif;
  }

  .vo-transcript-input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .vo-burn-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 600;
    color: #93c5fd;
    cursor: pointer;
  }

  .hidden-audio {
    display: none;
  }

  .vo-hint {
    font-size: 9px;
    color: #64748b;
    line-height: 1.3;
  }
</style>
