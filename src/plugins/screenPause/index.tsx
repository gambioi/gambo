/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, MediaEngineStore, Menu, showToast, Toasts } from "@webpack/common";

// ─── How it works ───────────────────────────────────────────────────────────────
// On this client the screen capture + WebRTC happen in the NATIVE layer (neither
// getDisplayMedia nor window.RTCPeerConnection are reachable from the renderer).
// But Discord's MediaEngine exposes the live connections in the renderer. The
// go-live connection (context "stream", selfVideo true) has a native `conn` with
// Discord's own broadcast controls:
//   • conn.setVideoBroadcast(false)  → pause the outgoing video (viewers freeze)
//   • conn.setVideoBroadcast(true)   → resume
//   • conn.setGoLiveSource / clearDesktopSource → used to also cut the shared audio
// We toggle these on a keybind. The microphone lives on the "default" connection
// and is never touched.

export let paused = false;

let indicator: HTMLDivElement | null = null;

// Capture the (pid, loopback) Discord passes to setSoundshareSource so we can detach
// on pause and restore the exact source on resume. Keyed per connection.
let soundshareHooked = false;
const lastSoundshare = new WeakMap<any, { pid: any; loopback: any; }>();
const pendingRestore = new WeakMap<any, { pid: any; loopback: any; }>();

// Same idea for the desktop source: capture what Discord set so "black" mode can
// clear it on pause and restore the exact source on resume.
let desktopHooked = false;
const lastDesktop = new WeakMap<any, { kind: "opts" | "src"; args: any[]; }>();
const pendingDesktop = new WeakMap<any, { kind: "opts" | "src"; args: any[]; }>();

function ensureDesktopHook(conn: any) {
    if (desktopHooked || !conn) return;
    const proto = Object.getPrototypeOf(conn);
    const patch = (name: string, kind: "opts" | "src") => {
        const t = Object.prototype.hasOwnProperty.call(conn, name) && typeof conn[name] === "function"
            ? conn : (proto && typeof proto[name] === "function" ? proto : null);
        if (!t) return;
        const orig = t[name];
        if ((orig as any).__sp) return;
        const wrapped = function (this: any, ...args: any[]) {
            try { lastDesktop.set(this, { kind, args }); } catch { }
            return orig.apply(this, args);
        };
        (wrapped as any).__sp = true;
        t[name] = wrapped;
    };
    patch("setDesktopSourceWithOptions", "opts");
    patch("setDesktopSource", "src");
    desktopHooked = true;
    diag("desktop hook installed");
}

// Fallback restore info if we never captured Discord's own call: rebuild options
// from the connection's goLiveSourceIdentifier (same shape philsPluginLibrary uses).
function desktopFromIdentifier(sc: any): { kind: "opts"; args: any[]; } | null {
    const id = sc?.goLiveSourceIdentifier;
    if (!id) return null;
    const [type, sourceId] = String(id).split(":");
    return {
        kind: "opts",
        args: [{
            hdrCaptureMode: "never",
            allowScreenCaptureKit: true,
            useQuartzCapturer: true,
            useGraphicsCapture: true,
            useVideoHook: true,
            sourceId,
            type,
        }],
    };
}

function ensureSoundshareHook(sc: any) {
    if (soundshareHooked || !sc) return;
    const proto = Object.getPrototypeOf(sc);
    const target = (typeof sc.setSoundshareSource === "function" && Object.prototype.hasOwnProperty.call(sc, "setSoundshareSource"))
        ? sc : (proto && typeof proto.setSoundshareSource === "function" ? proto : null);
    if (!target) { diag("soundshare: setSoundshareSource not found on connection"); return; }
    const orig = target.setSoundshareSource;
    target.setSoundshareSource = function (pid: any, loopback: any) {
        try { if (pid) lastSoundshare.set(this, { pid, loopback }); } catch { }
        return orig.call(this, pid, loopback);
    };
    soundshareHooked = true;
    diag("soundshare hook installed");
}

// ─── Persistent on-screen debug panel ───────────────────────────────────────────
let diagPanel: HTMLDivElement | null = null;
const diagLines: string[] = [];
function diag(msg: string) {
    if (!settings.store.debug) return;
    diagLines.push(msg);
    while (diagLines.length > 16) diagLines.shift();
    if (!diagPanel) {
        diagPanel = document.createElement("div");
        Object.assign(diagPanel.style, {
            position: "fixed", top: "8px", left: "8px", zIndex: "100000",
            maxWidth: "560px", padding: "8px 10px", borderRadius: "8px",
            background: "rgba(0,0,0,.82)", color: "#0f0",
            font: "600 11px/1.4 monospace", whiteSpace: "pre-wrap",
            border: "1px solid #0f04", pointerEvents: "none", userSelect: "text",
        } as CSSStyleDeclaration);
        document.body.appendChild(diagPanel);
    }
    diagPanel.textContent = "▼ ScreenPause debug\n" + diagLines.join("\n");
}
function killDiag() { diagPanel?.remove(); diagPanel = null; diagLines.length = 0; }

const settings = definePluginSettings({
    pauseVideo: {
        type: OptionType.BOOLEAN,
        description: "Pause the outgoing video (viewers freeze) while paused",
        default: true,
    },
    pauseAudio: {
        type: OptionType.BOOLEAN,
        description: "Also cut the shared screen audio while paused",
        default: true,
    },
    pauseMode: {
        type: OptionType.SELECT,
        description: "Pause method (note: viewers always see a frozen frame — Discord can't be told to render black; 'black' only blacks YOUR local preview)",
        options: [
            { label: "Freeze (viewers keep last frame)", value: "freeze", default: true },
            { label: "Black local preview (viewers still freeze)", value: "black" },
        ],
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when toggling",
        default: true,
    },
    showIndicator: {
        type: OptionType.BOOLEAN,
        description: "Show a floating \"Screen Paused\" badge while paused",
        default: true,
    },
    debug: {
        type: OptionType.BOOLEAN,
        description: "Show the on-screen debug panel",
        default: false,
        onChange: v => { if (!v) killDiag(); },
    },
    keybind: {
        type: OptionType.SELECT,
        description: "Keybind to toggle screen pause",
        options: [
            { label: "F7", value: "f7" },
            { label: "F8", value: "f8" },
            { label: "F9", value: "f9" },
            { label: "F10", value: "f10", default: true },
            { label: "F11", value: "f11" },
            { label: "F12", value: "f12" },
            { label: "Ctrl+P", value: "ctrl+p" },
            { label: "Ctrl+Shift+P", value: "ctrl+shift+p" },
            { label: "Alt+P", value: "alt+p" },
        ],
        onChange: () => setupKeybindListener(),
    },
    useCustomKeybind: {
        type: OptionType.BOOLEAN,
        description: "Use a custom keybind instead of the preset",
        default: false,
        onChange: () => setupKeybindListener(),
    },
    customKeybind: {
        type: OptionType.STRING,
        description: "Custom keybind (e.g. ctrl+shift+p)",
        default: "",
        disabled: () => !settings.store.useCustomKeybind,
        onChange: () => setupKeybindListener(),
    },
});

// ─── Find the screen-broadcast connection ───────────────────────────────────────
function getStreamConnection(): any | null {
    try {
        const me = (MediaEngineStore as any)?.getMediaEngine?.();
        const conns: any[] = me?.connections ? [...me.connections] : [];
        return (
            conns.find(c => c.context === "stream") ??
            conns.find(c => c.selfVideo && c.streamUserId) ??
            null
        );
    } catch { return null; }
}

// ─── Apply ──────────────────────────────────────────────────────────────────────
function applyPauseState(): boolean {
    const sc = getStreamConnection();
    const conn = sc?.conn;
    if (!conn) { diag("apply: no stream conn"); return false; }

    ensureSoundshareHook(sc);
    ensureDesktopHook(conn);
    let did = false;

    if (settings.store.pauseVideo) {
        if (settings.store.pauseMode === "black") {
            // Clear the desktop source → viewers see black, then restore it on resume.
            try {
                if (paused) {
                    const cap = lastDesktop.get(conn) ?? desktopFromIdentifier(sc);
                    if (cap) pendingDesktop.set(conn, cap);
                    conn.clearDesktopSource?.();
                    diag(`clearDesktopSource (black) restore=${cap ? cap.kind : "none!"}`);
                    did = true;
                } else {
                    const r = pendingDesktop.get(conn) ?? desktopFromIdentifier(sc);
                    if (r) {
                        if (r.kind === "opts" && typeof conn.setDesktopSourceWithOptions === "function")
                            conn.setDesktopSourceWithOptions(...r.args);
                        else if (typeof conn.setDesktopSource === "function")
                            conn.setDesktopSource(...r.args);
                        pendingDesktop.delete(conn);
                        diag(`desktop restored (${r.kind})`);
                        did = true;
                    } else diag("desktop restore: no info");
                }
            } catch (e) { diag("black err " + ((e as any)?.message ?? e)); }
        } else if (typeof conn.setVideoBroadcast === "function") {
            // Freeze: stop broadcasting → viewers keep the last frame.
            try {
                conn.setVideoBroadcast(!paused);
                diag(`setVideoBroadcast(${!paused}) ok`);
                did = true;
            } catch (e) { diag("setVideoBroadcast err " + ((e as any)?.message ?? e)); }
        }
    }

    // Cut/restore the shared screen audio via the connection's setSoundshareSource.
    if (settings.store.pauseAudio && typeof sc.setSoundshareSource === "function") {
        try {
            if (paused) {
                // prefer the (pid, loopback) we captured from Discord; fall back to the
                // live soundshareId if we never saw the attach call.
                const cap = lastSoundshare.get(sc) ?? (sc.soundshareId ? { pid: sc.soundshareId, loopback: true } : null);
                if (cap?.pid && sc.soundshareActive) {
                    pendingRestore.set(sc, cap);
                    sc.setSoundshareSource(0, false); // detach → silence
                    diag(`soundshare OFF (saved pid=${cap.pid} lb=${cap.loopback})`);
                    did = true;
                } else {
                    diag(`soundshare: nothing to cut (active=${sc.soundshareActive} cap=${JSON.stringify(cap)})`);
                }
            } else {
                const r = pendingRestore.get(sc);
                if (r?.pid) {
                    sc.setSoundshareSource(r.pid, r.loopback ?? true);
                    pendingRestore.delete(sc);
                    diag(`soundshare RESTORED pid=${r.pid}`);
                    did = true;
                }
            }
        } catch (e) { diag("soundshare err " + ((e as any)?.message ?? e)); }
    } else if (settings.store.pauseAudio) {
        diag("soundshare: sc.setSoundshareSource missing");
    }

    return did;
}

function setPaused(next: boolean) {
    const sc = getStreamConnection();
    if (!sc?.conn) {
        if (settings.store.showToasts)
            showToast("ScreenPause: start a screen share first", Toasts.Type.FAILURE);
        return;
    }
    paused = next;
    applyPauseState();
    updateIndicator();
    if (settings.store.showToasts)
        showToast(paused ? "Screen share paused ⏸" : "Screen share resumed ▶", paused ? Toasts.Type.MESSAGE : Toasts.Type.SUCCESS);
}

export function toggle() {
    setPaused(!paused);
}

// If the share ends while we're paused, clear the stale paused state + indicator
// (otherwise the badge lingers and the next keypress would start on "resume").
// Subscribing to several candidate event names is safe — unknown ones never fire.
const STREAM_END_EVENTS = ["STREAM_DELETE", "STREAM_STOP", "STREAM_CLOSE"];
function onStreamEnd() {
    if (!paused) return;
    paused = false;
    updateIndicator();
    diag("stream ended → reset paused");
}

// ─── Indicator ──────────────────────────────────────────────────────────────────
function updateIndicator() {
    const shouldShow = paused && settings.store.showIndicator;
    if (shouldShow && !indicator) {
        indicator = document.createElement("div");
        indicator.textContent = "⏸ Screen Paused";
        Object.assign(indicator.style, {
            position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)",
            zIndex: "10000", padding: "6px 14px", borderRadius: "8px",
            background: "rgba(240, 71, 71, 0.92)", color: "#fff",
            font: "600 13px/1 var(--font-primary, sans-serif)",
            boxShadow: "0 2px 10px rgba(0,0,0,.4)", pointerEvents: "none", userSelect: "none",
        } as CSSStyleDeclaration);
        document.body.appendChild(indicator);
    } else if (!shouldShow && indicator) {
        indicator.remove();
        indicator = null;
    }
}

// ─── Keybind ────────────────────────────────────────────────────────────────────
function parseKeybind(raw: string) {
    const parts = raw.toLowerCase().split("+");
    return {
        ctrl: parts.includes("ctrl") || parts.includes("control"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        key: parts[parts.length - 1],
    };
}

let keydownListener: ((e: KeyboardEvent) => void) | null = null;

function setupKeybindListener() {
    if (keydownListener) {
        document.removeEventListener("keydown", keydownListener);
        keydownListener = null;
    }
    keydownListener = (e: KeyboardEvent) => {
        const raw = settings.store.useCustomKeybind && settings.store.customKeybind
            ? settings.store.customKeybind
            : (settings.store.keybind ?? "f10");
        const kb = parseKeybind(raw);
        if (
            kb.ctrl === (e.ctrlKey || e.metaKey) &&
            kb.shift === e.shiftKey &&
            kb.alt === e.altKey &&
            e.key.toLowerCase() === kb.key
        ) {
            e.preventDefault();
            toggle();
        }
    };
    document.addEventListener("keydown", keydownListener);
}

// ─── Plugin ─────────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "ScreenPause",
    description: "Pause your screen share on a keybind — freezes the image and cuts the shared audio to viewers via Discord's own broadcast controls, without dropping the stream. Toggle again to resume. Your mic is never touched.",
    authors: [{ name: "_o0", id: 976573494353616897n }],
    tags: ["Voice", "Screenshare", "Stream", "Privacy"],
    settings,

    contextMenus: {
        "user-panel-video": (children: any) => {
            children.push(
                <Menu.MenuSeparator />,
                <Menu.MenuCheckboxItem
                    id="vc-screenpause-toggle"
                    label={`Screen Paused: ${paused ? "ON" : "OFF"}`}
                    checked={paused}
                    action={() => toggle()}
                />
            );
        },
    },

    start() {
        setupKeybindListener();
        for (const e of STREAM_END_EVENTS) FluxDispatcher.subscribe(e as any, onStreamEnd);
        diag("loaded ✅ (MediaEngine mode)");
    },

    stop() {
        // make sure we don't leave the broadcast paused
        if (paused) { paused = false; try { applyPauseState(); } catch { } }
        for (const e of STREAM_END_EVENTS) FluxDispatcher.unsubscribe(e as any, onStreamEnd);
        if (keydownListener) {
            document.removeEventListener("keydown", keydownListener);
            keydownListener = null;
        }
        updateIndicator();
        killDiag();
    },
});
