/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addChatBarButton, ChatBarButton, ChatBarButtonFactory, removeChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Toasts } from "@webpack/common";

const Native = GamboNative.pluginHelpers.BigFileUpload as PluginNative<typeof import("./native")>;

const settings = definePluginSettings({
    host: {
        type: OptionType.SELECT,
        description: "Where to upload the file",
        options: [
            { label: "GoFile — permanent, very large (best for 500 MB+)", value: "gofile", default: true },
            { label: "Catbox — permanent, up to 200 MB", value: "catbox" },
            { label: "Litterbox — temporary, up to 1 GB", value: "litterbox" }
        ]
    },
    litterboxTime: {
        type: OptionType.SELECT,
        description: "Litterbox expiry time (only for Litterbox)",
        options: [
            { label: "1 hour", value: "1h" },
            { label: "12 hours", value: "12h" },
            { label: "24 hours", value: "24h", default: true },
            { label: "3 days", value: "72h" }
        ]
    },
    autoIntercept: {
        type: OptionType.BOOLEAN,
        description: "Auto-upload: when you drag or paste a file bigger than the limit below, send it via the chosen host instead of Discord's 'too powerful' popup",
        default: true
    },
    interceptOverMB: {
        type: OptionType.NUMBER,
        description: "Auto-upload files larger than this many MB (set to your Discord limit — e.g. 500 for Nitro, 10 for free)",
        default: 500
    }
});

function showToast(type: number, message: string) {
    Toasts.show({ id: Toasts.genId(), type, message, options: { position: Toasts.Position.BOTTOM } });
}

// ─── Progress overlay (with Cancel) ─────────────────────────────────────────────
let box: HTMLDivElement | null = null;
let barFill: HTMLDivElement | null = null;
let label: HTMLDivElement | null = null;
let onCancel: (() => void) | null = null;

function fmtBytes(n: number) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + " KB";
    return n + " B";
}

function showProgress(name: string, cancel: () => void) {
    onCancel = cancel;
    if (!box) {
        box = document.createElement("div");
        Object.assign(box.style, {
            position: "fixed", bottom: "84px", left: "50%", transform: "translateX(-50%)",
            zIndex: "10000", width: "360px", maxWidth: "80vw", padding: "12px 14px",
            borderRadius: "10px", background: "var(--background-floating, #111214)",
            color: "var(--text-normal, #fff)", boxShadow: "0 8px 24px rgba(0,0,0,.5)",
            font: "500 13px/1.4 var(--font-primary, sans-serif)", border: "1px solid rgba(255,255,255,.08)",
        } as CSSStyleDeclaration);

        label = document.createElement("div");
        label.style.marginBottom = "8px";
        box.appendChild(label);

        const barBg = document.createElement("div");
        Object.assign(barBg.style, {
            height: "8px", borderRadius: "4px", background: "rgba(255,255,255,.12)", overflow: "hidden",
        } as CSSStyleDeclaration);
        barFill = document.createElement("div");
        Object.assign(barFill.style, {
            height: "100%", width: "0%", borderRadius: "4px",
            background: "var(--brand-500, #5865f2)", transition: "width .15s linear",
        } as CSSStyleDeclaration);
        barBg.appendChild(barFill);
        box.appendChild(barBg);

        const btn = document.createElement("button");
        btn.textContent = "Cancel";
        Object.assign(btn.style, {
            marginTop: "10px", width: "100%", padding: "7px", borderRadius: "8px", border: "none",
            cursor: "pointer", font: "600 13px var(--font-primary, sans-serif)",
            background: "var(--button-danger-background, #da373c)", color: "#fff",
        } as CSSStyleDeclaration);
        btn.onclick = () => { onCancel?.(); };
        box.appendChild(btn);

        document.body.appendChild(box);
    }
    if (label) label.textContent = `Uploading ${name}…`;
    if (barFill) barFill.style.width = "0%";
}

let lastTick = 0, lastLoaded = 0, speed = 0;
function updateProgress(name: string, loaded: number, total: number) {
    const now = performance.now();
    if (lastTick) {
        const dt = (now - lastTick) / 1000;
        if (dt > 0.25) { speed = (loaded - lastLoaded) / dt; lastTick = now; lastLoaded = loaded; }
    } else { lastTick = now; lastLoaded = loaded; }

    const pct = total ? Math.min(100, (loaded / total) * 100) : 0;
    if (barFill) barFill.style.width = pct.toFixed(1) + "%";
    const eta = speed > 0 ? Math.max(0, (total - loaded) / speed) : 0;
    if (label) label.textContent =
        `Uploading ${name} — ${pct.toFixed(0)}% (${fmtBytes(loaded)}/${fmtBytes(total)})` +
        (speed > 0 ? ` • ${fmtBytes(speed)}/s • ${Math.ceil(eta)}s left` : "");
}

function hideProgress() {
    box?.remove();
    box = null; barFill = null; label = null; onCancel = null;
    lastTick = 0; lastLoaded = 0; speed = 0;
}

let busy = false;

async function uploadOne(file: File) {
    if (busy) { showToast(Toasts.Type.FAILURE, "Another upload is already running."); return; }
    busy = true;

    const host = settings.store.host as "catbox" | "litterbox" | "gofile";
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const total = file.size;
    const CHUNK = 4 * 1024 * 1024; // 4 MB slices — small reads avoid OOM + the File.path/permission errors

    let cancelled = false;
    showProgress(file.name, () => {
        cancelled = true;
        Native.cancelUpload({ id });
        hideProgress();
        showToast(Toasts.Type.MESSAGE, "Upload cancelled.");
    });

    try {
        await Native.beginUpload({ id, name: file.name, host, time: settings.store.litterboxTime, total });

        // Read the file in slices and push each to native; backpressure paces this
        // loop to the real upload speed, so `pushed` tracks network progress.
        let pushed = 0;
        while (pushed < total && !cancelled) {
            const slice = file.slice(pushed, Math.min(pushed + CHUNK, total));
            const buf = new Uint8Array(await slice.arrayBuffer());
            const ok = await Native.pushChunk({ id, chunk: buf });
            if (!ok) break; // aborted on the native side
            pushed += buf.byteLength;
            updateProgress(file.name, pushed, total);
        }

        const res = await Native.endChunks({ id });
        if (cancelled) return; // panel + toast already handled by the cancel button
        hideProgress();

        if (res.ok) {
            insertTextIntoChatInputBox(res.url + " ");
            showToast(Toasts.Type.SUCCESS, "Uploaded! Link added to your message box.");
        } else if (res.error === "__ABORT__") {
            showToast(Toasts.Type.MESSAGE, "Upload cancelled.");
        } else {
            showToast(Toasts.Type.FAILURE, "Upload failed: " + res.error);
        }
    } catch (err: any) {
        if (!cancelled) {
            Native.cancelUpload({ id });
            hideProgress();
            showToast(Toasts.Type.FAILURE, "Upload failed: " + (err?.message ?? String(err)));
        }
    } finally {
        busy = false;
    }
}

function pickAndUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
        const file = input.files?.[0];
        if (file) uploadOne(file);
    };
    input.click();
}

// ─── Auto-intercept oversize drag/paste (before Discord's "too powerful" popup) ──
function handleIncoming(e: Event, files: FileList | null | undefined) {
    if (!settings.store.autoIntercept || !files || files.length === 0) return;

    const limit = Math.max(1, settings.store.interceptOverMB || 500) * 1024 * 1024;
    const big = [...files].filter(f => f.size > limit);
    if (big.length === 0) return; // small files → let Discord handle them normally

    // Stop Discord from ever seeing it (no "too powerful" popup).
    e.preventDefault();
    e.stopImmediatePropagation();

    uploadOne(big[0]);
    if (big.length > 1) showToast(Toasts.Type.MESSAGE, `Uploading 1 of ${big.length} big files (one at a time).`);
}

const onDrop = (e: DragEvent) => handleIncoming(e, e.dataTransfer?.files);
const onPaste = (e: ClipboardEvent) => handleIncoming(e, e.clipboardData?.files);

const UploadIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 13a1 1 0 0 1 1 1v3h12v-3a1 1 0 1 1 2 0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a1 1 0 0 1 1-1Z" />
        <path d="M12 3a1 1 0 0 1 .71.29l4 4a1 1 0 0 1-1.42 1.42L13 6.41V15a1 1 0 1 1-2 0V6.41L8.71 8.71A1 1 0 0 1 7.3 7.29l4-4A1 1 0 0 1 12 3Z" />
    </svg>
);

const ChatBarIcon: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat) return null;
    return (
        <ChatBarButton tooltip="Upload a big file (no Nitro)" onClick={pickAndUpload}>
            <UploadIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "BigFileUpload",
    description: "Send large files without Nitro — uploads to GoFile/Catbox/Litterbox and pastes the link into your message. Live progress bar + cancel.",
    authors: [{ name: "Gambo", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    settings,

    start() {
        addChatBarButton("BigFileUpload", ChatBarIcon, UploadIcon);
        // Capture phase → we run before Discord's own handlers and can swallow the event.
        document.addEventListener("drop", onDrop, true);
        document.addEventListener("paste", onPaste, true);
    },

    stop() {
        removeChatBarButton("BigFileUpload");
        document.removeEventListener("drop", onDrop, true);
        document.removeEventListener("paste", onPaste, true);
        hideProgress();
    }
});
