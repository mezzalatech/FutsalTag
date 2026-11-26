<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { projectStore, isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import { buildInteractiveHtmlStatsReport } from '$lib/export/htmlStatsReport';
  import { X, CloudUpload, CheckCircle2, Copy, Check, FileCode2, Film, FolderGit2 } from 'lucide-svelte';

  interface CloudUploadResult {
    status_code: number;
    uploaded_url: string;
    share_url: string;
    bytes_sent: number;
  }

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  const STORAGE_KEY = 'futsaltag_cloud_config_v1';

  function loadInitialCfg() {
    if (typeof localStorage === 'undefined') {
      return { provider: 'nextcloud', baseUrl: '', username: '' };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        provider: parsed?.provider === 'webdav' || parsed?.provider === 's3_presigned' ? parsed.provider : 'nextcloud',
        baseUrl: typeof parsed?.baseUrl === 'string' ? parsed.baseUrl : '',
        username: typeof parsed?.username === 'string' ? parsed.username : '',
      };
    } catch {
      return { provider: 'nextcloud', baseUrl: '', username: '' };
    }
  }

  const init = loadInitialCfg();
  let provider = $state<'nextcloud' | 'webdav' | 's3_presigned'>(init.provider);
  let baseUrl = $state(init.baseUrl);
  let username = $state(init.username);
  let password = $state('');
  let payloadType = $state<'project' | 'html_report' | 'video_file'>('html_report');
  let selectedLocalFile = $state('');
  let isUploading = $state(false);
  let statusMsg = $state<string | null>(null);
  let errMsg = $state<string | null>(null);
  let lastResult = $state<CloudUploadResult | null>(null);
  let copied = $state(false);

  function persistConfig() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, baseUrl, username }));
    } catch {
      // Ignore quota errors
    }
  }

  async function pickLocalMp4() {
    if (!isTauriDesktop()) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const chosen = await open({
      title: 'Pilih Video / Klip untuk Diunggah ke Cloud',
      multiple: false,
      filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    });
    if (typeof chosen === 'string') {
      selectedLocalFile = chosen;
    }
  }

  async function handleUpload() {
    if (!isTauriDesktop()) {
      errMsg = 'Upload Cloud WebDAV / Nextcloud / S3 hanya tersedia di aplikasi desktop Tauri.';
      return;
    }
    if (!baseUrl.trim()) {
      errMsg = 'Masukkan URL server Cloud / Share Link terlebih dahulu.';
      return;
    }
    if (payloadType === 'video_file' && !selectedLocalFile.trim()) {
      errMsg = 'Pilih file video lokal yang ingin diunggah terlebih dahulu.';
      return;
    }

    persistConfig();
    isUploading = true;
    errMsg = null;
    statusMsg = 'Mengunggah ke Cloud Storage...';
    lastResult = null;

    try {
      const safeTitle = (projectStore.videoTitle || 'futsaltag')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase();

      let res: CloudUploadResult;
      if (payloadType === 'project') {
        const json = projectStore.exportProjectJson();
        res = await invoke<CloudUploadResult>('upload_text_cloud', {
          content: json,
          baseUrl: baseUrl.trim(),
          provider,
          username: username.trim() || null,
          password: password || null,
          remoteFilename: `${safeTitle}.futsal`,
        });
      } else if (payloadType === 'html_report') {
        const html = buildInteractiveHtmlStatsReport({
          matchTitle: projectStore.videoTitle,
          competition: projectStore.competitionName,
          durationSec: projectStore.duration,
          tags: projectStore.tags,
          roster: projectStore.roster,
          clubLogoDataUrl: projectStore.clubLogoDataUrl,
          formatMatchClock: (s) => projectStore.formatMatchClock(s),
        });
        res = await invoke<CloudUploadResult>('upload_text_cloud', {
          content: html,
          baseUrl: baseUrl.trim(),
          provider,
          username: username.trim() || null,
          password: password || null,
          remoteFilename: `${safeTitle}_stats.html`,
        });
      } else {
        res = await invoke<CloudUploadResult>('upload_file_cloud', {
          filePath: selectedLocalFile,
          baseUrl: baseUrl.trim(),
          provider,
          username: username.trim() || null,
          password: password || null,
          remoteFilename: null,
        });
      }

      lastResult = res;
      const kb = (res.bytes_sent / 1024).toFixed(1);
      statusMsg = `Berhasil diunggah (${kb} KB · HTTP ${res.status_code})!`;
    } catch (err: any) {
      errMsg = String(err?.message || err);
      statusMsg = null;
    } finally {
      isUploading = false;
    }
  }

  async function copyShareLink() {
    if (!lastResult?.share_url) return;
    try {
      await navigator.clipboard.writeText(lastResult.share_url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="cl-backdrop" role="presentation" onclick={onClose}>
    <div class="cl-card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <header class="cl-hdr">
        <div class="cl-title">
          <CloudUpload size={16} class="text-sky-400" />
          <h3>Upload Cloud Tim (Nextcloud / WebDAV / S3)</h3>
        </div>
        <button type="button" class="cl-close" onclick={onClose} title="Tutup">
          <X size={16} />
        </button>
      </header>

      <p class="cl-desc">
        Sinkronkan proyek <code>.futsal</code>, laporan mobile <code>.html</code>, atau klip <code>.mp4</code> ke server WebDAV/Nextcloud/S3 milik klub sendiri (BYOS).
      </p>

      <div class="cl-seg">
        <button
          type="button"
          class="cl-tab"
          class:active={provider === 'nextcloud'}
          onclick={() => (provider = 'nextcloud')}
        >
          Nextcloud Share Link
        </button>
        <button
          type="button"
          class="cl-tab"
          class:active={provider === 'webdav'}
          onclick={() => (provider = 'webdav')}
        >
          WebDAV Folder
        </button>
        <button
          type="button"
          class="cl-tab"
          class:active={provider === 's3_presigned'}
          onclick={() => (provider = 's3_presigned')}
        >
          S3 / Presigned PUT
        </button>
      </div>

      <label class="cl-field">
        <span>
          {provider === 'nextcloud'
            ? 'Link Share Folder Nextcloud (contoh: https://cloud.klub.id/s/TokenShare)'
            : provider === 'webdav'
              ? 'Endpoint Folder WebDAV (contoh: https://dav.klub.id/remote.php/dav/files/coach/)'
              : 'Amazon S3 Presigned PUT URL atau Bucket Path'}
        </span>
        <input
          type="url"
          class="cl-input"
          bind:value={baseUrl}
          placeholder={provider === 'nextcloud' ? 'https://cloud.example.com/s/AbCd123' : 'https://...'}
        />
      </label>

      {#if provider !== 's3_presigned'}
        <div class="cl-row-2">
          <label class="cl-field">
            <span>Username {provider === 'nextcloud' ? '(opsional untuk public share)' : ''}</span>
            <input type="text" class="cl-input" bind:value={username} placeholder="coach" />
          </label>
          <label class="cl-field">
            <span>Password / Share Password (opsional)</span>
            <input type="password" class="cl-input" bind:value={password} placeholder="••••••" />
          </label>
        </div>
      {/if}

      <div class="cl-payload-box">
        <span class="cl-sub">Pilih Konten yang Akan Diunggah:</span>
        <div class="cl-payload-grid">
          <button
            type="button"
            class="cl-pay-btn"
            class:active={payloadType === 'html_report'}
            onclick={() => (payloadType = 'html_report')}
          >
            <FileCode2 size={14} />
            <span>Laporan Statistik (.html)</span>
          </button>
          <button
            type="button"
            class="cl-pay-btn"
            class:active={payloadType === 'project'}
            onclick={() => (payloadType = 'project')}
          >
            <FolderGit2 size={14} />
            <span>Proyek Aktif (.futsal)</span>
          </button>
          <button
            type="button"
            class="cl-pay-btn"
            class:active={payloadType === 'video_file'}
            onclick={() => (payloadType = 'video_file')}
          >
            <Film size={14} />
            <span>File Video MP4</span>
          </button>
        </div>

        {#if payloadType === 'video_file'}
          <div class="cl-file-pick">
            <button type="button" class="cl-btn-sec" onclick={pickLocalMp4}>Pilih Video Lokal...</button>
            <span class="cl-file-path">{selectedLocalFile || 'Belum ada file dipilih'}</span>
          </div>
        {/if}
      </div>

      {#if errMsg}
        <div class="cl-alert-err">{errMsg}</div>
      {/if}
      {#if statusMsg}
        <div class="cl-alert-ok">
          <CheckCircle2 size={15} />
          <span>{statusMsg}</span>
        </div>
      {/if}

      {#if lastResult}
        <div class="cl-share-row">
          <span class="cl-share-url">{lastResult.share_url}</span>
          <button type="button" class="cl-btn-sec" onclick={copyShareLink}>
            {#if copied}<Check size={13} />{:else}<Copy size={13} />{/if}
            <span>{copied ? 'Tersalin' : 'Salin Link'}</span>
          </button>
        </div>
      {/if}

      <footer class="cl-ftr">
        <button type="button" class="cl-btn-sec" onclick={onClose}>Tutup</button>
        <button type="button" class="cl-btn-pri" disabled={isUploading} onclick={handleUpload}>
          <CloudUpload size={14} />
          <span>{isUploading ? 'Mengunggah...' : 'Unggah Sekarang'}</span>
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .cl-backdrop { position: fixed; inset: 0; background: rgba(2,6,23,0.78); backdrop-filter: blur(4px); z-index: 900; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .cl-card { width: min(560px, 100%); background: #0b1628; border: 1px solid #1e3a5f; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; color: #f8fafc; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
  .cl-hdr { display: flex; align-items: center; justify-content: space-between; }
  .cl-title { display: flex; align-items: center; gap: 8px; }
  .cl-title h3 { margin: 0; font-size: 14px; font-weight: 800; }
  .cl-close { background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 4px; }
  .cl-desc { margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.4; }
  .cl-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .cl-tab { background: #060b14; border: 1px solid #1e3a5f; color: #94a3b8; font-size: 11px; font-weight: 700; padding: 7px 6px; border-radius: 7px; cursor: pointer; }
  .cl-tab.active { background: #0284c7; border-color: #38bdf8; color: #ffffff; }
  .cl-field { display: flex; flex-direction: column; gap: 5px; font-size: 11px; font-weight: 700; color: #cbd5e1; }
  .cl-input { background: #060b14; border: 1px solid #1e3a5f; border-radius: 8px; padding: 8px 10px; color: #ffffff; font-size: 12px; }
  .cl-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cl-payload-box { display: flex; flex-direction: column; gap: 8px; background: #060b14; border: 1px solid #1a355d; border-radius: 9px; padding: 10px; }
  .cl-sub { font-size: 11px; font-weight: 700; color: #94a3b8; }
  .cl-payload-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .cl-pay-btn { display: flex; align-items: center; justify-content: center; gap: 5px; background: #0b1628; border: 1px solid #1e3a5f; color: #cbd5e1; padding: 8px 6px; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .cl-pay-btn.active { background: rgba(16,185,129,0.2); border-color: #10b981; color: #6ee7b7; }
  .cl-file-pick { display: flex; align-items: center; gap: 8px; }
  .cl-file-path { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .cl-alert-err { font-size: 11.5px; color: #fecaca; background: rgba(239,68,68,0.16); border: 1px solid #ef4444; padding: 8px 10px; border-radius: 8px; }
  .cl-alert-ok { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #6ee7b7; background: rgba(16,185,129,0.15); border: 1px solid #10b981; padding: 8px 10px; border-radius: 8px; }
  .cl-share-row { display: flex; align-items: center; gap: 8px; background: #060b14; border: 1px solid #1e3a5f; padding: 7px 10px; border-radius: 8px; }
  .cl-share-url { flex: 1; font-size: 11px; color: #38bdf8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; }
  .cl-ftr { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .cl-btn-sec { display: inline-flex; align-items: center; gap: 5px; background: #0f172a; border: 1px solid #1e3a5f; color: #cbd5e1; font-size: 12px; font-weight: 700; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
  .cl-btn-pri { display: inline-flex; align-items: center; gap: 6px; background: #0284c7; border: 1px solid #38bdf8; color: #ffffff; font-size: 12px; font-weight: 800; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
  .cl-btn-pri:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
