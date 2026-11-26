<script lang="ts">
  import { onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { isTauriDesktop } from "$lib/stores/projectStore.svelte";
  import { qrToSvgDataUrl } from "$lib/utils/qrCode";
  import {
    X,
    Smartphone,
    Copy,
    Check,
    Wifi,
    Power,
    UserX,
    RefreshCw,
  } from "lucide-svelte";

  interface ConnectedPhone {
    phone_id: string;
    name: string;
    tap_count: number;
    last_seen_ms: number;
  }

  interface RemoteStatus {
    running: boolean;
    url: string | null;
    ip: string | null;
    port: number;
    token: string;
    phones: ConnectedPhone[];
  }

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onRemoteRunningChange?: (running: boolean) => void;
  }

  let { isOpen, onClose, onRemoteRunningChange }: Props = $props();

  let status = $state<RemoteStatus>({
    running: false,
    url: null,
    ip: null,
    port: 0,
    token: "",
    phones: [],
  });
  let isBusy = $state(false);
  let errorMsg = $state<string | null>(null);
  let copiedUrl = $state(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const qrDataUrl = $derived(status.url ? qrToSvgDataUrl(status.url) : null);

  async function refreshStatus() {
    if (!isTauriDesktop()) return;
    try {
      const next = await invoke<RemoteStatus>("get_remote_server_status");
      status = next;
      onRemoteRunningChange?.(next.running);
    } catch {
      // Ignore poll errors
    }
  }

  async function startServer() {
    if (!isTauriDesktop() || isBusy) return;
    isBusy = true;
    errorMsg = null;
    try {
      const next = await invoke<RemoteStatus>("start_remote_server");
      status = next;
      onRemoteRunningChange?.(next.running);
    } catch (err: any) {
      errorMsg = String(err?.message || err);
    } finally {
      isBusy = false;
    }
  }

  async function stopServer() {
    if (!isTauriDesktop() || isBusy) return;
    isBusy = true;
    errorMsg = null;
    try {
      await invoke("stop_remote_server");
      status = { ...status, running: false, url: null, phones: [] };
      onRemoteRunningChange?.(false);
    } catch (err: any) {
      errorMsg = String(err?.message || err);
    } finally {
      isBusy = false;
    }
  }

  async function kickPhone(phoneId: string) {
    if (!isTauriDesktop()) return;
    try {
      await invoke("kick_remote_phone", { phoneId });
      await refreshStatus();
    } catch {
      // Ignore
    }
  }

  function copyUrl() {
    if (!status.url || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(status.url).then(() => {
      copiedUrl = true;
      setTimeout(() => (copiedUrl = false), 2000);
    }).catch(() => {});
  }

  $effect(() => {
    if (!isOpen) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      return;
    }
    if (isTauriDesktop()) {
      refreshStatus().then(() => {
        if (!status.running) startServer();
      });
      pollTimer = setInterval(refreshStatus, 1200);
    }
    return () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="pr-backdrop" role="presentation" onclick={onClose}>
    <div class="pr-card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="pr-header">
        <div class="pr-title">
          <Smartphone size={16} class="text-sky-400" />
          <h3>Remote Tagging dari HP (QR Code Wi-Fi)</h3>
        </div>
        <button type="button" class="pr-close" onclick={onClose} title="Tutup">
          <X size={16} />
        </button>
      </div>

      {#if !isTauriDesktop()}
        <div class="pr-warn">
          Server Remote HP hanya berjalan pada aplikasi Desktop (Tauri) agar bisa membuka port Wi-Fi lokal untuk HP di pinggir lapangan.
        </div>
      {:else}
        <p class="pr-desc">
          Pastikan laptop &amp; HP terhubung di <strong>Wi-Fi / Hotspot HP yang sama</strong>. Pindai QR Code dengan kamera HP (tanpa instal aplikasi apa pun) untuk men-tag langsung ke laptop.
        </p>

        {#if errorMsg}
          <div class="pr-err">{errorMsg}</div>
        {/if}

        <div class="pr-body">
          <div class="pr-qr-col">
            {#if status.running && qrDataUrl}
              <div class="pr-qr-box">
                <img src={qrDataUrl} alt="QR Code Remote HP" class="pr-qr-img" />
              </div>
              <div class="pr-url-row">
                <input type="text" readonly value={status.url || ""} class="pr-url-input" />
                <button type="button" class="pr-mini-btn" onclick={copyUrl} title="Salin alamat">
                  {#if copiedUrl}<Check size={12} />{:else}<Copy size={12} />{/if}
                </button>
              </div>
              <button type="button" class="pr-stop-btn" onclick={stopServer} disabled={isBusy}>
                <Power size={13} />
                <span>Matikan Server Remote</span>
              </button>
            {:else}
              <div class="pr-qr-empty">
                <Wifi size={28} class="text-slate-400" />
                <span>Server Remote HP nonaktif</span>
                <button type="button" class="pr-start-btn" onclick={startServer} disabled={isBusy}>
                  {isBusy ? "Menyiapkan..." : "Aktifkan Remote HP"}
                </button>
              </div>
            {/if}
          </div>

          <div class="pr-phones-col">
            <div class="pr-phones-hdr">
              <span>HP Terhubung ({status.phones.length})</span>
              <button type="button" class="pr-mini-btn" onclick={refreshStatus} title="Refresh daftar HP">
                <RefreshCw size={11} />
              </button>
            </div>
            {#if status.phones.length === 0}
              <div class="pr-phones-empty">
                Belum ada HP yang terhubung. Scan QR atau buka alamat di browser HP.
                <br /><br />
                <small>Tips: Jika HP tidak bisa membuka halaman, cek Windows Firewall (izinkan akses jaringan privat/hotspot) atau gunakan Hotspot dari salah satu HP.</small>
              </div>
            {:else}
              <div class="pr-phones-list">
                {#each status.phones as ph (ph.phone_id)}
                  <div class="pr-phone-row">
                    <div>
                      <strong>{ph.name}</strong>
                      <div class="pr-phone-meta">{ph.tap_count} tap terkirim</div>
                    </div>
                    <button type="button" class="pr-kick-btn" onclick={() => kickPhone(ph.phone_id)} title="Putuskan HP ini">
                      <UserX size={12} />
                      <span>Putuskan</span>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .pr-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 220;
    padding: 16px;
  }

  .pr-card {
    width: 100%;
    max-width: 640px;
    background: #0b1629;
    border: 1px solid #1e3a5f;
    border-radius: 12px;
    padding: 18px;
    color: #f8fafc;
    box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pr-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pr-title h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }

  .pr-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  .pr-desc {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.45;
  }

  .pr-warn,
  .pr-err {
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.45);
    color: #fecaca;
    padding: 9px 11px;
    border-radius: 8px;
    font-size: 11.5px;
  }

  .pr-body {
    display: grid;
    grid-template-columns: 230px 1fr;
    gap: 16px;
  }

  @media (max-width: 600px) {
    .pr-body {
      grid-template-columns: 1fr;
    }
  }

  .pr-qr-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .pr-qr-box {
    width: 210px;
    height: 210px;
    background: #ffffff;
    border-radius: 10px;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pr-qr-img {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  .pr-qr-empty {
    width: 210px;
    height: 210px;
    border: 1px dashed #334155;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 11.5px;
    color: #94a3b8;
  }

  .pr-url-row {
    width: 100%;
    display: flex;
    gap: 4px;
  }

  .pr-url-input {
    flex: 1;
    min-width: 0;
    background: #060d19;
    border: 1px solid #243b61;
    color: #7dd3fc;
    border-radius: 6px;
    padding: 5px 7px;
    font-family: 'Fira Code', monospace;
    font-size: 10px;
  }

  .pr-mini-btn {
    background: #10203a;
    border: 1px solid #284574;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 5px 7px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .pr-start-btn {
    background: #0284c7;
    border: none;
    color: #fff;
    border-radius: 7px;
    padding: 7px 12px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .pr-stop-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.45);
    color: #fca5a5;
    border-radius: 7px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .pr-phones-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #071020;
    border: 1px solid #1a2e4d;
    border-radius: 10px;
    padding: 12px;
  }

  .pr-phones-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 800;
    color: #e2e8f0;
  }

  .pr-phones-empty {
    font-size: 11.5px;
    color: #94a3b8;
    line-height: 1.5;
  }

  .pr-phones-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 220px;
    overflow-y: auto;
  }

  .pr-phone-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 9px;
    background: #0f1b33;
    border: 1px solid #1f355c;
    border-radius: 7px;
    font-size: 12px;
  }

  .pr-phone-meta {
    font-size: 10.5px;
    color: #34d399;
  }

  .pr-kick-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #1e293b;
    border: 1px solid #475569;
    color: #fca5a5;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 10.5px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
