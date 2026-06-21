/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildMemberStore, MediaEngineStore, UserStore, VoiceStateStore } from "@webpack/common";

/**
 * Voice3D — a 3D cozy lounge of your voice channel, seen from a high angle.
 * Everyone ELSE in the call stands in the room; drag them around. The closer
 * you drag someone to the front (you), the louder they get.
 *
 * Honest limit: Discord Desktop's native voice engine only exposes a scalar
 * per-user volume, so this is DISTANCE (loud/quiet), not L/R stereo.
 */

const VoiceActions = findByPropsLazy("setLocalVolume");

const settings = definePluginSettings({
    spatialVolume: {
        type: OptionType.BOOLEAN,
        description: "Drag changes volume by distance (closer = louder)",
        default: true,
    },
    angle: {
        type: OptionType.SLIDER,
        description: "Camera angle (higher = more top-down)",
        markers: makeRange(10, 50, 4),
        default: 14,
        stickToMarkers: false,
        onChange: () => layoutStage(),
    },
    range: {
        type: OptionType.SLIDER,
        description: "Falloff distance (higher = gentler)",
        markers: makeRange(400, 1000, 100),
        default: 700,
        stickToMarkers: true,
    },
});

const LIFT = -46;
const MAXV = 160, MINV = 8;

type Item = {
    uid: string;
    el: HTMLDivElement;
    av: HTMLDivElement;
    x: number;
    z: number;
    origVol: number;
    lastVol: number;
};

let fab: HTMLButtonElement | null = null;
let root: HTMLDivElement | null = null;
let stage: HTMLDivElement | null = null;
let title: HTMLDivElement | null = null;
let items: Item[] = [];
let zoom = -10;

const speaking = new Set<string>();
const savedPos = new Map<string, { x: number; z: number; }>();

let drag: { item: Item; ox: number; oz: number; mx: number; my: number; cx: number; cy: number; } | null = null;
let dragRAF = 0;
let lastVolT = 0;

const TILT = () => settings.store.angle || 34;

function myId(): string | null {
    try { return UserStore.getCurrentUser()?.id ?? null; } catch { return null; }
}
function myVoiceChannel(): string | null {
    try {
        const id = myId();
        return id ? (VoiceStateStore.getVoiceStateForUser(id)?.channelId ?? null) : null;
    } catch { return null; }
}

function volFromDist(x: number, z: number): number {
    const d = Math.hypot(x, z);
    const range = settings.store.range || 700;
    return Math.max(MINV, Math.min(MAXV, Math.round(MAXV * (1 - d / range))));
}
function applyVolume(it: Item, force = false) {
    if (!settings.store.spatialVolume) return;
    const v = volFromDist(it.x, it.z);
    if (!force && Math.abs(v - it.lastVol) < 3) return;
    it.lastVol = v;
    try { VoiceActions.setLocalVolume(it.uid, v); } catch { }
}
function restoreVolume(it: Item) {
    try { VoiceActions.setLocalVolume(it.uid, it.origVol); } catch { }
}

function layoutItem(it: Item) {
    it.el.style.transform = `translate3d(${it.x}px, ${LIFT}px, ${it.z}px) rotateX(${-TILT()}deg)`;
}
function setDepth(it: Item) {
    const dim = 0.6 + 0.4 * (1 - Math.min(1, (-it.z) / 760));
    it.av.style.filter = `brightness(${dim.toFixed(2)})`;
}
function layoutStage() {
    if (stage) stage.style.transform = `translateZ(${zoom}px) rotateX(${TILT()}deg)`;
    for (const it of items) layoutItem(it);
}

function makeRoom(): HTMLDivElement {
    const room = document.createElement("div");
    room.className = "vc-v3-room";
    for (const side of ["back", "left", "right", "floor3d", "ceiling"]) {
        const w = document.createElement("div");
        w.className = "vc-v3-wall " + side;
        room.appendChild(w);
    }
    return room;
}

function buildItems(channelId: string) {
    for (const it of items) it.el.remove();
    items = [];

    const me = myId();
    const guildId = ChannelStore.getChannel(channelId)?.guild_id;
    const states = (VoiceStateStore as any).getVoiceStatesForChannel?.(channelId) ?? {};
    const uids = Object.keys(states).filter(u => u !== me);
    const n = uids.length || 1;

    uids.forEach((uid, i) => {
        const user = UserStore.getUser(uid);
        if (!user) return;
        const member = guildId ? GuildMemberStore.getMember(guildId, uid) : null;
        const name = member?.nick || user.globalName || user.username || "User";

        const el = document.createElement("div");
        el.className = "vc-v3-item";
        if (speaking.has(uid)) el.classList.add("speaking");

        const av = document.createElement("div");
        av.className = "vc-v3-av";
        const img = document.createElement("img");
        img.src = user.getAvatarURL?.(guildId, 128) ?? "";
        av.appendChild(img);

        const nameEl = document.createElement("div");
        nameEl.className = "vc-v3-name";
        nameEl.textContent = name;

        el.appendChild(av);
        el.appendChild(nameEl);

        let pos = savedPos.get(uid);
        if (!pos) {
            const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
            const ang = t * 1.05;
            pos = { x: Math.sin(ang) * 340, z: -260 - Math.cos(ang) * 140 };
            savedPos.set(uid, pos);
        }

        const it: Item = {
            uid, el, av, x: pos.x, z: pos.z,
            origVol: (() => { try { return MediaEngineStore.getLocalVolume(uid) ?? 100; } catch { return 100; } })(),
            lastVol: -1,
        };
        el.addEventListener("mousedown", e => onItemDown(e, it));
        stage!.appendChild(el);
        items.push(it);
        layoutItem(it);
        setDepth(it);
        applyVolume(it, true);
    });

    if (title) {
        const ch = ChannelStore.getChannel(channelId);
        title.textContent = items.length
            ? `🔊 ${ch?.name ?? "Voice"} · ${items.length} other${items.length > 1 ? "s" : ""} in room`
            : `🔊 ${ch?.name ?? "Voice"} · nobody else here yet`;
    }
}

function onItemDown(e: MouseEvent, it: Item) {
    e.preventDefault();
    e.stopPropagation();
    drag = { item: it, ox: it.x, oz: it.z, mx: e.clientX, my: e.clientY, cx: e.clientX, cy: e.clientY };
    it.el.classList.add("dragging");
}
function onMove(e: MouseEvent) {
    if (!drag) return;
    drag.cx = e.clientX; drag.cy = e.clientY;
    if (!dragRAF) dragRAF = requestAnimationFrame(applyDrag);
}
function applyDrag() {
    dragRAF = 0;
    if (!drag) return;
    const it = drag.item;
    // vertical mouse travels deeper because the camera looks down — scale by the tilt
    const depthScale = 1 / Math.max(0.35, Math.cos(TILT() * Math.PI / 180));
    it.x = Math.max(-560, Math.min(560, drag.ox + (drag.cx - drag.mx) * 1.05));
    it.z = Math.max(-740, Math.min(-20, drag.oz + (drag.cy - drag.my) * 1.05 * depthScale));
    savedPos.set(it.uid, { x: it.x, z: it.z });
    layoutItem(it);
    const now = Date.now();
    if (now - lastVolT > 90) { lastVolT = now; applyVolume(it); }
}
function onUp() {
    if (!drag) return;
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = 0; }
    const it = drag.item;
    it.el.classList.remove("dragging");
    setDepth(it);
    applyVolume(it, true);
    drag = null;
}

function onWheel(e: WheelEvent) {
    if (!root) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    zoom = Math.max(-420, Math.min(320, zoom + (e.deltaY > 0 ? -40 : 40)));
    layoutStage();
}
function onKey(e: KeyboardEvent) {
    if (!root) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
}

function chatBounds(): { left: number; top: number; } | null {
    try {
        const sb = document.querySelector('[class*="sidebar_"]') as HTMLElement | null;
        if (!sb) return null;
        const r = sb.getBoundingClientRect();
        if (r.width < 80 || r.right > window.innerWidth * 0.6) return null;
        return { left: Math.round(r.right), top: Math.round(r.top) };
    } catch { return null; }
}
function applyBounds() {
    if (!root) return;
    const b = chatBounds();
    root.style.left = (b ? b.left : 0) + "px";
    root.style.top = (b ? b.top : 0) + "px";
    root.style.right = "0";
    root.style.bottom = "0";
}
function onResize() { applyBounds(); }

function onVoice() {
    updateFab();
    if (root) {
        const ch = myVoiceChannel();
        if (ch) buildItems(ch);
        else close();
    }
}
function onSpeaking(e: any) {
    if (!e?.userId) return;
    const flags = e.speakingFlags ?? (e.speaking ? 1 : 0);
    if (flags) speaking.add(e.userId); else speaking.delete(e.userId);
    if (!root) return;
    const it = items.find(x => x.uid === e.userId);
    if (it) it.el.classList.toggle("speaking", !!flags);
}

function updateFab() {
    if (!fab) return;
    fab.style.display = myVoiceChannel() ? "flex" : "none";
    fab.textContent = root ? "✕ Close 3D" : "🪩 3D Room";
}
function ensureFab() {
    if (fab) return;
    fab = document.createElement("button");
    fab.className = "vc-v3-fab";
    fab.style.display = "none";
    fab.addEventListener("click", () => toggle());
    document.body.appendChild(fab);
    updateFab();
}

function open() {
    if (root) return;
    zoom = -10;
    root = document.createElement("div");
    root.className = "vc-v3-root";
    applyBounds();

    stage = document.createElement("div");
    stage.className = "vc-v3-stage";
    stage.appendChild(makeRoom());
    root.appendChild(stage);
    layoutStage();

    title = document.createElement("div");
    title.className = "vc-v3-title";
    root.appendChild(title);

    const channelId = myVoiceChannel();
    if (channelId) buildItems(channelId);

    const hint = document.createElement("div");
    hint.className = "vc-v3-hint";
    hint.textContent = "Voice3D v7 · drag a person to move them · closer = louder · scroll to zoom · Esc to exit";
    root.appendChild(hint);

    document.body.appendChild(root);
    requestAnimationFrame(() => root?.classList.add("vc-v3-on"));

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    updateFab();
}

function close() {
    if (!root) return;
    for (const it of items) restoreVolume(it);
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = 0; }
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    const r = root;
    r.classList.remove("vc-v3-on");
    root = null; stage = null; title = null; items = []; drag = null;
    setTimeout(() => r.remove(), 300);
    updateFab();
}

function toggle() { if (root) close(); else open(); }

export default definePlugin({
    name: "Voice3D",
    description: "A 3D cozy lounge of your voice channel seen from a high angle: a button appears while you're in voice; open it to drag the other participants around the room — closer = louder (real, via per-user volume). Sidebars stay visible. (Distance only on Desktop; true L/R stereo needs Vesktop/web.)",
    authors: [Devs.o0],
    tags: ["Voice", "Visual", "Fun", "3D"],
    settings,

    start() {
        ensureFab();
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoice);
        FluxDispatcher.subscribe("SPEAKING", onSpeaking);
    },
    stop() {
        close();
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoice);
        FluxDispatcher.unsubscribe("SPEAKING", onSpeaking);
        speaking.clear();
        fab?.remove();
        fab = null;
    },
});
