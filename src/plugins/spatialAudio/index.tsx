/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addSettingsPanelButton, removeSettingsPanelButton } from "@plugins/philsPluginLibrary";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, MediaEngineStore, React, UserStore, VoiceStateStore } from "@webpack/common";

const VoiceActions = findByPropsLazy("setLocalVolume");

// Live voice connection (captured from the MediaEngine). Its `outputs[userId]` is the
// per-user audio object: { audioContext, stream, streamSourceNode, gainNode, audioElement,
// levelNode, ... } — Web Audio IS used here, so we insert a StereoPanner into that graph.
let voiceConn: any = null;

function hookConnection() {
    try {
        const me: any = (MediaEngineStore as any).getMediaEngine?.();
        if (!me) return;
        if (me.connections) for (const c of me.connections) if (c?.context === "default") voiceConn = c;
        me.emitter?.on?.("connection", (c: any) => { if (c?.context === "default") voiceConn = c; });
    } catch { }
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const PW = 360, PH = 300;
const YX = PW / 2, YY = PH - 44;
const MAXR = Math.hypot(YX, YY);
const AV = 38;            // avatar diameter
const AVR = AV / 2;

type Mode = "Arc" | "Grid" | "Line" | "Manual";
type Pos = { x: number; y: number; };

// ─── State ───────────────────────────────────────────────────────────────────
let root: HTMLDivElement | null = null;
let gridEl: HTMLDivElement | null = null;
let arcRowEl: HTMLDivElement | null = null;

const items = new Map<string, { el: HTMLDivElement; pos: Pos; origVol: number; line?: SVGLineElement; }>();
const speaking = new Set<string>();
let mode: Mode = "Arc";
let roomSize = 50;
let distPct = 55;
let arcAngle = 180;
let drag: { uid: string; mx: number; my: number; ox: number; oy: number; moved: boolean; } | null = null;
let dragRAF = 0;
// Window drag (move the whole panel)
let winDrag: { mx: number; my: number; ox: number; oy: number; } | null = null;

// ─── True 3D spatial audio via Web Audio PannerNode (HRTF) ────────────────────
//   source → panner(HRTF) → lowpass → gainNode → destination
// The PannerNode does distance attenuation + binaural direction (front/back/L/R on
// headphones). The lowpass muffles far/occluded sources for depth.
// Clean chain (no HRTF colouring, no extra gain → no clipping):
//   source → stereoPan → lowpass → gain
// Distance VOLUME is driven by Discord's own setLocalVolume (the reliable lever — a
// gain node here gets compensated by Discord's output processing), pan + muffle here.
interface Chain {
    stereoPan: StereoPannerNode; // clean L/R pan
    lowpass: BiquadFilterNode;   // distance muffle
    gain: GainNode;              // Discord's gain (final)
    source: MediaStreamAudioSourceNode;
    data: any;
    prevElemVol: number | null;
}
const chains = new Map<string, Chain>();

function getStreamData(userId: string): any | undefined {
    if (!voiceConn) hookConnection();
    const o = voiceConn?.outputs?.[userId];
    if (o?.audioContext) return o;
    return undefined;
}

function ensureChain(userId: string): Chain | null {
    const data = getStreamData(userId);

    const existing = chains.get(userId);
    if (existing) {
        // Reuse only if it's still the SAME output object (Discord recreates it on
        // mute/reconnect — a stale chain points at dead nodes and does nothing).
        if (data && existing.data === data) return existing;
        teardownChain(userId);
    }

    if (!data?.audioContext || !data?.stream || !data.gainNode) return null;
    if (data.stream.getAudioTracks().length === 0) return null;

    try {
        const ctx: AudioContext = data.audioContext;
        const source: MediaStreamAudioSourceNode =
            data.streamSourceNode ??= ctx.createMediaStreamSource(data.stream);
        const gain: GainNode = data.gainNode;

        const stereoPan = ctx.createStereoPanner();

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 22000;
        lowpass.Q.value = 0.5;

        // Mute the raw <audio> path so ALL sound goes through our spatial graph (otherwise
        // an unprocessed copy plays in parallel and dilutes the pan).
        let prevElemVol: number | null = null;
        if (data.audioElement) {
            prevElemVol = data.audioElement.volume;
            data.audioElement.volume = 0;
        }

        // source → stereoPan → lowpass → gain. Keep meter fed.
        try { source.disconnect(); } catch { }
        source.connect(stereoPan);
        stereoPan.connect(lowpass);
        lowpass.connect(gain);
        if (data.levelNode) { try { source.connect(data.levelNode); } catch { } }

        const chain: Chain = { stereoPan, lowpass, gain, source, data, prevElemVol };
        chains.set(userId, chain);
        return chain;
    } catch { return null; }
}

function teardownChain(userId: string) {
    const c = chains.get(userId);
    if (!c) return;
    try {
        c.stereoPan.disconnect();
        c.lowpass.disconnect();
        c.source.disconnect();
        // Unmute the raw <audio> path and restore original graph: source → gain
        if (c.data.audioElement && c.prevElemVol != null) c.data.audioElement.volume = c.prevElemVol;
        c.source.connect(c.gain);
        if (c.data.levelNode) { try { c.source.connect(c.data.levelNode); } catch { } }
    } catch { }
    chains.delete(userId);
}

// ─── Spatial audio update ─────────────────────────────────────────────────────
function applyAudio(uid: string, pos: Pos) {
    const chain = ensureChain(uid);
    if (!chain) return;

    // PAN: clean stereo L/R from horizontal radar position (amplified a bit)
    const rx = Math.max(-1, Math.min(1, (pos.x - YX) / YX));
    try { chain.stereoPan.pan.value = Math.max(-1, Math.min(1, rx * 1.25)); } catch { }

    // VOLUME: driven by Discord's setLocalVolume (reliable, audible). Flat-ish near You,
    // steep falloff past the "hearing range". 0..200 (100 = normal, 0 = silent).
    const rd = Math.min(1, Math.hypot(pos.x - YX, pos.y - YY) / MAXR); // 0 (at you) .. 1 (edge)
    const reach = 0.3 + (distPct / 100) * 0.9;                         // 0.39 .. 1.2
    const prox = Math.max(0, Math.min(1, 1 - Math.pow(rd / reach, 1.7))); // 1 near .. 0 past reach
    try { VoiceActions.setLocalVolume(uid, Math.round(prox * 150)); } catch { }

    // Far → gently muffled (depth cue, kept subtle to preserve quality)
    const cutoff = Math.max(3500, 20000 - rd * 14000);
    try { chain.lowpass.frequency.value = cutoff; } catch { }

    // Visual distance feedback: fade the avatar as it gets quieter
    items.get(uid)?.el.style.setProperty("opacity", (0.35 + prox * 0.65).toFixed(2));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function myId(): string | null {
    try { return UserStore.getCurrentUser()?.id ?? null; } catch { return null; }
}
function myVoiceChannel(): string | null {
    try {
        const id = myId();
        return id ? ((VoiceStateStore as any).getVoiceStateForUser(id)?.channelId ?? null) : null;
    } catch { return null; }
}

// ─── Auto-arrange ─────────────────────────────────────────────────────────────
function autoPositions(uids: string[]): Map<string, Pos> {
    const m = new Map<string, Pos>();
    const n = uids.length;
    const d = (distPct / 100) * (YY - 40);
    if (mode === "Arc") {
        const a0 = -Math.PI / 2 - (arcAngle * Math.PI / 180) / 2;
        const step = n > 1 ? (arcAngle * Math.PI / 180) / (n - 1) : 0;
        uids.forEach((u, i) => m.set(u, {
            x: YX + Math.cos(a0 + step * i) * d,
            y: YY + Math.sin(a0 + step * i) * d,
        }));
    } else if (mode === "Line") {
        const sp = Math.min(52, (PW - 72) / Math.max(n - 1, 1));
        uids.forEach((u, i) => m.set(u, { x: YX - sp * (n - 1) / 2 + sp * i, y: YY - d }));
    } else if (mode === "Grid") {
        const cols = Math.ceil(Math.sqrt(n));
        const sp = Math.min(60, (PW - 72) / Math.max(cols - 1, 1));
        uids.forEach((u, i) => m.set(u, {
            x: YX - sp * (cols - 1) / 2 + (i % cols) * sp,
            y: YY - d - Math.floor(i / cols) * 52,
        }));
    }
    return m;
}

function rearrange() {
    if (mode === "Manual") return;
    const positions = autoPositions([...items.keys()]);
    for (const [uid, item] of items) {
        const p = positions.get(uid);
        if (!p) continue;
        item.pos = p;
        placeAvatar(uid);
        applyAudio(uid, p);
    }
    updateRings();
}

function placeAvatar(uid: string) {
    const item = items.get(uid);
    if (!item || !gridEl) return;
    item.el.style.left = (item.pos.x - AVR) + "px";
    item.el.style.top = (item.pos.y - AVR) + "px";

    // Proximity → scale (closer to You = bigger / more present)
    const d = Math.hypot(item.pos.x - YX, item.pos.y - YY);
    const prox = 1 - Math.min(1, d / MAXR);
    item.el.style.setProperty("--prox", (0.82 + prox * 0.42).toFixed(3));

    // Connection line You → avatar
    if (item.line) {
        item.line.setAttribute("x2", String(item.pos.x));
        item.line.setAttribute("y2", String(item.pos.y));
        item.line.setAttribute("opacity", (0.06 + prox * 0.22).toFixed(3));
    }
}

// ─── Radar SVG (concentric range rings + radial guides) ──────────────────────
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
}

function makeRadar(): SVGSVGElement {
    const svg = svgEl("svg", { class: "vc-sa-svg", width: PW, height: PH, viewBox: `0 0 ${PW} ${PH}` });

    // soft radial backdrop glow behind the listener
    const defs = svgEl("defs", {});
    const grad = svgEl("radialGradient", { id: "vc-sa-glow", cx: "50%", cy: "100%", r: "90%" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "rgba(88,101,242,0.18)" }));
    grad.appendChild(svgEl("stop", { offset: "60%", "stop-color": "rgba(88,101,242,0.05)" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(88,101,242,0)" }));
    defs.appendChild(grad);
    // gradient for connection lines (bright at You, fading toward the avatar)
    const lg = svgEl("linearGradient", { id: "vc-sa-linegrad", x1: "0", y1: "1", x2: "0", y2: "0" });
    lg.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#5865f2" }));
    lg.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(88,101,242,0.2)" }));
    defs.appendChild(lg);
    svg.appendChild(defs);
    svg.appendChild(svgEl("rect", { x: 0, y: 0, width: PW, height: PH, fill: "url(#vc-sa-glow)" }));

    // radial guide lines fanning out from the listener
    for (let i = -2; i <= 2; i++) {
        const ang = -Math.PI / 2 + i * (Math.PI / 6);
        svg.appendChild(svgEl("line", {
            x1: YX, y1: YY,
            x2: YX + Math.cos(ang) * MAXR, y2: YY + Math.sin(ang) * MAXR,
            stroke: "rgba(255,255,255,0.035)", "stroke-width": 1,
        }));
    }

    // connection lines (You → each avatar) live in their own group
    svg.appendChild(svgEl("g", { class: "vc-sa-lines" }));

    // concentric range rings (3 static + 1 active distance ring)
    for (let i = 1; i <= 3; i++) {
        const r = (i / 3) * MAXR * 0.92;
        svg.appendChild(svgEl("ellipse", {
            class: "vc-sa-rangering",
            cx: YX, cy: YY, rx: r, ry: r * 0.7,
            fill: "none", stroke: "rgba(255,255,255,0.06)", "stroke-width": 1,
        }));
    }

    // active distance ring (blurple, dashed)
    svg.appendChild(svgEl("ellipse", {
        class: "vc-sa-ring",
        cx: YX, cy: YY, fill: "none",
        stroke: "rgba(88,101,242,0.55)", "stroke-width": 1.5, "stroke-dasharray": "5 5",
    }));

    return svg;
}

function updateRings() {
    if (!root) return;
    const ring = root.querySelector<SVGEllipseElement>(".vc-sa-ring");
    if (!ring) return;
    const r = (distPct / 100) * MAXR;
    ring.setAttribute("rx", String(Math.round(r)));
    ring.setAttribute("ry", String(Math.round(r * 0.7)));
}

// ─── Slider with live value badge ─────────────────────────────────────────────
function makeSlider(label: string, min: number, max: number, val: number, fmt: (v: number) => string, cb: (v: number) => void): { row: HTMLDivElement; input: HTMLInputElement; } {
    const row = document.createElement("div");
    row.className = "vc-sa-row";

    const head = document.createElement("div");
    head.className = "vc-sa-rowhead";
    const lbl = document.createElement("span");
    lbl.className = "vc-sa-label"; lbl.textContent = label;
    const badge = document.createElement("span");
    badge.className = "vc-sa-badge"; badge.textContent = fmt(val);
    head.appendChild(lbl); head.appendChild(badge);

    const input = document.createElement("input");
    input.type = "range"; input.min = String(min); input.max = String(max); input.value = String(val);
    input.className = "vc-sa-slider";
    input.setAttribute("aria-label", label);
    const paint = () => {
        const p = ((+input.value - min) / (max - min)) * 100;
        input.style.setProperty("--p", p + "%");
        badge.textContent = fmt(+input.value);
    };
    paint();
    input.addEventListener("input", () => { paint(); cb(+input.value); });

    row.appendChild(head); row.appendChild(input);
    return { row, input };
}

// ─── Mode segmented control ───────────────────────────────────────────────────
const MODE_ICONS: Record<Mode, string> = {
    Arc: '<path d="M3 17a9 9 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="3" cy="17" r="1.6" fill="currentColor"/><circle cx="12" cy="8" r="1.6" fill="currentColor"/><circle cx="21" cy="17" r="1.6" fill="currentColor"/>',
    Grid: '<circle cx="8" cy="8" r="1.8" fill="currentColor"/><circle cx="16" cy="8" r="1.8" fill="currentColor"/><circle cx="8" cy="16" r="1.8" fill="currentColor"/><circle cx="16" cy="16" r="1.8" fill="currentColor"/>',
    Line: '<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>',
    Manual: '<path d="M6 4l13 7-5 1.5L11 18z" fill="currentColor"/>',
};

function makeModeControl(): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "vc-sa-seg";
    (["Arc", "Grid", "Line", "Manual"] as Mode[]).forEach(m => {
        const btn = document.createElement("button");
        btn.className = "vc-sa-segbtn" + (m === mode ? " active" : "");
        btn.dataset.mode = m;
        btn.setAttribute("aria-label", m + " placement");
        btn.title = m;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16">${MODE_ICONS[m]}</svg><span>${m}</span>`;
        btn.addEventListener("click", () => {
            mode = m;
            root?.querySelectorAll<HTMLButtonElement>(".vc-sa-segbtn")
                .forEach(b => b.classList.toggle("active", b.dataset.mode === m));
            if (arcRowEl) arcRowEl.style.display = m === "Arc" ? "flex" : "none";
            if (m !== "Manual") rearrange();
        });
        wrap.appendChild(btn);
    });
    return wrap;
}

// ─── Build grid users ─────────────────────────────────────────────────────────
function createAvatar(uid: string): HTMLDivElement {
    const user = UserStore.getUser(uid);
    const el = document.createElement("div");
    el.className = "vc-sa-av";
    el.title = user?.username ?? uid;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Move " + (user?.username ?? "user"));

    if (user?.avatar) {
        const img = document.createElement("img");
        img.src = `https://cdn.discordapp.com/avatars/${uid}/${user.avatar}.webp?size=64`;
        img.alt = "";
        el.appendChild(img);
    } else {
        const fb = document.createElement("div");
        fb.className = "vc-sa-av-fb";
        fb.textContent = user?.username?.[0]?.toUpperCase() ?? "?";
        el.appendChild(fb);
    }

    el.addEventListener("mousedown", e => {
        e.preventDefault(); e.stopPropagation();
        const cur = items.get(uid);
        if (!cur) return;
        if (mode !== "Manual") {
            mode = "Manual";
            root?.querySelectorAll<HTMLButtonElement>(".vc-sa-segbtn")
                .forEach(b => b.classList.toggle("active", b.dataset.mode === "Manual"));
            if (arcRowEl) arcRowEl.style.display = "none";
        }
        el.classList.add("dragging");
        drag = { uid, mx: e.clientX, my: e.clientY, ox: cur.pos.x, oy: cur.pos.y, moved: false };
    });

    return el;
}

// Incremental: keep existing avatars + their positions, only add joiners / remove leavers.
// Never wipes the grid, so a voice-state update never resets a dragged position.
function buildGrid(channelId: string) {
    if (!gridEl) return;

    const me = myId();
    const states = (VoiceStateStore as any).getVoiceStatesForChannel?.(channelId) ?? {};
    const uids = Object.keys(states).filter(u => u !== me);
    const uidSet = new Set(uids);

    const linesG = root?.querySelector(".vc-sa-lines");

    // Remove users who left
    for (const [uid, item] of [...items]) {
        if (!uidSet.has(uid)) {
            item.el.remove();
            item.line?.remove();
            try { VoiceActions.setLocalVolume(uid, item.origVol); } catch { }
            teardownChain(uid);
            items.delete(uid);
        }
    }

    // Add joiners
    const joiners = uids.filter(u => !items.has(u));
    for (const uid of joiners) {
        let origVol = 100;
        try { origVol = (MediaEngineStore as any).getLocalVolume?.(uid) ?? 100; } catch { }
        const el = createAvatar(uid);
        let line: SVGLineElement | undefined;
        if (linesG) {
            line = svgEl("line", {
                x1: YX, y1: YY, x2: YX, y2: YY,
                stroke: "url(#vc-sa-linegrad)", "stroke-width": 1.5, opacity: 0.15,
            });
            linesG.appendChild(line);
        }
        if (speaking.has(uid)) el.classList.add("speaking");
        items.set(uid, { el, pos: { x: YX, y: YY - 90 }, origVol, line });
        gridEl.appendChild(el);
    }

    // Layout: auto modes arrange everyone; Manual keeps current positions
    if (mode !== "Manual") {
        const positions = autoPositions([...items.keys()]);
        for (const [uid, item] of items) {
            const p = positions.get(uid);
            if (p) item.pos = p;
            placeAvatar(uid);
            applyAudio(uid, item.pos);
        }
    } else {
        // Only place/apply joiners; leave dragged avatars where they are
        for (const uid of joiners) { placeAvatar(uid); applyAudio(uid, items.get(uid)!.pos); }
    }

    const sub = root?.querySelector<HTMLSpanElement>(".vc-sa-sub");
    if (sub) {
        const ch = ChannelStore.getChannel(channelId);
        const n = uids.length;
        sub.textContent = (ch?.name ? `#${ch.name}` : "Voice") + ` · ${n} ${n === 1 ? "person" : "people"}`;
    }
    updateRings();
}

// ─── Drag ────────────────────────────────────────────────────────────────────
function onMouseMove(e: MouseEvent) {
    // Move the whole panel
    if (winDrag && root) {
        const w = root.offsetWidth, h = root.offsetHeight;
        const nx = Math.max(0, Math.min(window.innerWidth - w, winDrag.ox + (e.clientX - winDrag.mx)));
        const ny = Math.max(0, Math.min(window.innerHeight - 40, winDrag.oy + (e.clientY - winDrag.my)));
        root.style.left = nx + "px";
        root.style.top = ny + "px";
        return;
    }
    if (!drag || !gridEl) return;
    const cx = e.clientX, cy = e.clientY;
    if (dragRAF) return;
    dragRAF = requestAnimationFrame(() => {
        dragRAF = 0;
        if (!drag || !gridEl) return;
        const item = items.get(drag.uid);
        if (!item) return;
        if (Math.abs(cx - drag.mx) > 2 || Math.abs(cy - drag.my) > 2) drag.moved = true;
        item.pos = {
            x: Math.max(AVR, Math.min(PW - AVR, drag.ox + (cx - drag.mx))),
            y: Math.max(AVR, Math.min(PH - AVR, drag.oy + (cy - drag.my))),
        };
        placeAvatar(drag.uid);
        applyAudio(drag.uid, item.pos);
    });
}
function onMouseUp() {
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = 0; }
    if (drag) items.get(drag.uid)?.el.classList.remove("dragging");
    drag = null;
    if (winDrag) { root?.querySelector(".vc-sa-head")?.classList.remove("dragging"); winDrag = null; }
}
function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
}

// ─── Open / close ─────────────────────────────────────────────────────────────
function open() {
    if (root) return;
    root = document.createElement("div");
    root.className = "vc-sa-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Spatial Audio");

    // ── Header ────────────────────────────────────────────────────────────────
    const head = document.createElement("div");
    head.className = "vc-sa-head";
    head.innerHTML = `
        <span class="vc-sa-headicon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 3a9 9 0 0 1 9 9c0 2.21-.8 4.23-2.11 5.79l-1.42-1.42A6.96 6.96 0 0 0 19 12a7 7 0 1 0-14 0c0 1.98.82 3.77 2.13 5.07L5.72 18.5A8.96 8.96 0 0 1 3 12a9 9 0 0 1 9-9zm0 4a5 5 0 0 1 5 5c0 1.38-.56 2.63-1.46 3.54l-1.42-1.42A2.97 2.97 0 0 0 15 12a3 3 0 1 0-6 0c0 .84.35 1.6.92 2.15l-1.43 1.43A4.97 4.97 0 0 1 7 12a5 5 0 0 1 5-5zm0 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
            </svg>
        </span>
        <div class="vc-sa-titles">
            <span class="vc-sa-title">Spatial Audio</span>
            <span class="vc-sa-sub">Voice</span>
        </div>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "vc-sa-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
    closeBtn.addEventListener("click", close);
    head.appendChild(closeBtn);

    // Drag the whole panel by its header
    head.addEventListener("mousedown", e => {
        if ((e.target as HTMLElement).closest(".vc-sa-close")) return;
        if (!root) return;
        const rect = root.getBoundingClientRect();
        root.style.bottom = "auto";
        root.style.left = rect.left + "px";
        root.style.top = rect.top + "px";
        winDrag = { mx: e.clientX, my: e.clientY, ox: rect.left, oy: rect.top };
        head.classList.add("dragging");
        e.preventDefault();
    });

    root.appendChild(head);

    // ── Radar stage ─────────────────────────────────────────────────────────────
    const stage = document.createElement("div");
    stage.className = "vc-sa-stage";

    gridEl = document.createElement("div");
    gridEl.className = "vc-sa-grid";
    gridEl.style.width = PW + "px";
    gridEl.style.height = PH + "px";
    gridEl.appendChild(makeRadar());

    // "You" listener marker at center-bottom
    const youEl = document.createElement("div");
    youEl.className = "vc-sa-you";
    youEl.style.left = YX + "px";
    youEl.style.top = YY + "px";
    youEl.innerHTML = `<span class="vc-sa-you-pulse"></span><span class="vc-sa-you-dot"></span><span class="vc-sa-you-lbl">YOU</span>`;
    gridEl.appendChild(youEl);

    stage.appendChild(gridEl);
    root.appendChild(stage);

    // ── Controls ────────────────────────────────────────────────────────────────
    const ctrl = document.createElement("div");
    ctrl.className = "vc-sa-ctrl";

    const modeRow = document.createElement("div");
    modeRow.className = "vc-sa-row";
    const modeLbl = document.createElement("span");
    modeLbl.className = "vc-sa-label"; modeLbl.textContent = "Placement";
    modeRow.appendChild(modeLbl);
    modeRow.appendChild(makeModeControl());
    ctrl.appendChild(modeRow);

    const { row: dRow } = makeSlider("Hearing range", 10, 100, distPct, v => v + "%", v => {
        distPct = v; updateRings(); if (mode !== "Manual") rearrange();
    });
    ctrl.appendChild(dRow);

    const { row: rsRow } = makeSlider("Room size", 10, 100, roomSize, v => v + " m²", v => {
        roomSize = v; if (mode !== "Manual") rearrange();
    });
    ctrl.appendChild(rsRow);

    const { row: arcRow } = makeSlider("Arc spread", 30, 360, arcAngle, v => v + "°", v => {
        arcAngle = v; if (mode === "Arc") rearrange();
    });
    arcRow.style.display = mode === "Arc" ? "flex" : "none";
    arcRowEl = arcRow;
    ctrl.appendChild(arcRow);

    root.appendChild(ctrl);

    const hint = document.createElement("div");
    hint.className = "vc-sa-hint";
    hint.innerHTML = `<span>Drag people · closer = louder · left/right = stereo · 🎧 headphones</span>`;
    root.appendChild(hint);

    document.body.appendChild(root);

    const ch = myVoiceChannel();
    if (ch) buildGrid(ch);
    updateRings();
    requestAnimationFrame(() => root?.classList.add("vc-sa-on"));

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKey, true);
    startRefresh();
}

function close() {
    if (!root) return;
    stopRefresh();
    for (const [uid, item] of items) {
        try { VoiceActions.setLocalVolume(uid, item.origVol); } catch { }
        teardownChain(uid);
    }
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = 0; }
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("keydown", onKey, true);
    const r = root;
    r.classList.remove("vc-sa-on");
    root = null; gridEl = null; arcRowEl = null;
    items.clear(); drag = null;
    setTimeout(() => r.remove(), 200);
}

function toggle() { if (root) close(); else open(); }

// ─── Flux ────────────────────────────────────────────────────────────────────
function onVoice() {
    if (!root || drag) return; // never rebuild mid-drag
    const ch = myVoiceChannel();
    if (ch) buildGrid(ch); else close();
}

function onSpeaking(e: any) {
    const uid = e?.userId;
    if (!uid) return;
    const isSpeaking = !!e.speakingFlags;
    if (isSpeaking) speaking.add(uid); else speaking.delete(uid);
    const item = items.get(uid);
    item?.el.classList.toggle("speaking", isSpeaking);
    // (Re)build + position the chain the moment a user becomes audible — their output
    // object often only exists once they start talking.
    if (isSpeaking && item) applyAudio(uid, item.pos);
}

// Periodic safety refresh: re-spatialise everyone so recreated outputs (mute/reconnect)
// get re-hooked even without user interaction.
let refreshTimer: number | null = null;
function startRefresh() {
    stopRefresh();
    refreshTimer = window.setInterval(() => {
        if (!root || drag) return;
        // Catch late-arriving voice states / recreated outputs without resetting drags
        const ch = myVoiceChannel();
        if (ch) buildGrid(ch);
        for (const [uid, item] of items) applyAudio(uid, item.pos);
    }, 1000);
}
function stopRefresh() {
    if (refreshTimer != null) { clearInterval(refreshTimer); refreshTimer = null; }
}

// ─── Toolbar icon ─────────────────────────────────────────────────────────────
const SpatialAudioIcon = (props: React.ComponentProps<"svg">) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>
        <path d="M12 3a9 9 0 0 1 9 9c0 2.21-.8 4.23-2.11 5.79l-1.42-1.42A6.96 6.96 0 0 0 19 12a7 7 0 1 0-14 0c0 1.98.82 3.77 2.13 5.07L5.72 18.5A8.96 8.96 0 0 1 3 12a9 9 0 0 1 9-9zm0 4a5 5 0 0 1 5 5c0 1.38-.56 2.63-1.46 3.54l-1.42-1.42A2.97 2.97 0 0 0 15 12a3 3 0 1 0-6 0c0 .84.35 1.6.92 2.15l-1.43 1.43A4.97 4.97 0 0 1 7 12a5 5 0 0 1 5-5zm0 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
);

// ─── Plugin ──────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "SpatialAudio",
    description: "Spatial voice — drag people around a radar: left/right stereo pan + distance volume (and gentle far-muffle) via clean Web Audio. Best with headphones.",
    authors: [{ name: "Gambo", id: 0n }],
    tags: ["Voice", "Audio", "Spatial", "Fun"],
    dependencies: ["PhilsPluginLibrary"],
    enabledByDefault: true, // on by default but can be disabled in the plugins list

    start() {
        addSettingsPanelButton({
            name: "SpatialAudio",
            icon: SpatialAudioIcon as any,
            tooltipText: "Spatial Audio",
            onClick: toggle
        });
        hookConnection();
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoice);
        FluxDispatcher.subscribe("RTC_CONNECTION_STATE", onVoice);
        FluxDispatcher.subscribe("VOICE_CHANNEL_SELECT", onVoice);
        FluxDispatcher.subscribe("SPEAKING", onSpeaking);
    },

    stop() {
        close();
        removeSettingsPanelButton("SpatialAudio");
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoice);
        FluxDispatcher.unsubscribe("RTC_CONNECTION_STATE", onVoice);
        FluxDispatcher.unsubscribe("VOICE_CHANNEL_SELECT", onVoice);
        FluxDispatcher.unsubscribe("SPEAKING", onSpeaking);
        for (const uid of [...chains.keys()]) teardownChain(uid);
        speaking.clear();
    },
});
