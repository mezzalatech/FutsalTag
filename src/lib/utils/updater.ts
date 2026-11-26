export type { Update } from "@tauri-apps/plugin-updater";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function checkForAppUpdate() {
  if (!isTauriRuntime()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return await check();
}

export async function installUpdateAndRelaunch(
  update: NonNullable<Awaited<ReturnType<typeof checkForAppUpdate>>>,
  onProgress?: (pct: number) => void
): Promise<void> {
  if (!isTauriRuntime()) return;
  let total = 0;
  let downloaded = 0;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      downloaded = 0;
      onProgress?.(0);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (total > 0) {
        onProgress?.(Math.min(99, Math.round((downloaded / total) * 100)));
      }
    } else if (event.event === "Finished") {
      onProgress?.(100);
    }
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
