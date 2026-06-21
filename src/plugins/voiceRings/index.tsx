/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

/**
 * VoiceRings — avatars of people currently speaking get a lively pulsing glow
 * ring instead of Discord's flat green outline.
 *
 * Honest limit: Discord does not expose other users' raw audio to the renderer,
 * so the ring is driven by the SPEAKING flux event (speaking / not speaking),
 * not by real amplitude. Your own avatar pulses the same way.
 */

const settings = definePluginSettings({
    speed: {
        type: OptionType.SLIDER,
        description: "3D bob speed in seconds (lower = faster)",
        markers: makeRange(0.6, 2.2, 0.2),
        default: 1.3,
        stickToMarkers: false,
        onChange: applyVars,
    },
    size: {
        type: OptionType.SLIDER,
        description: "Ring thickness (px)",
        markers: makeRange(2, 10, 1),
        default: 4,
        stickToMarkers: true,
        onChange: applyVars,
    },
});

const speaking = new Set<string>();
let timer: any = null;

function applyVars() {
    const r = document.documentElement;
    r.style.setProperty("--vc-vr-speed", settings.store.speed + "s");
    r.style.setProperty("--vc-vr-size", settings.store.size + "px");
}

const SELECTOR = '[class*="voiceUser"] img[src*="/avatars/"], [class*="tile"] img[src*="/avatars/"]';

// per-user ring colour derived from their avatar
const colorCache = new Map<string, { c1: string; c2: string; }>();
const pendingColor = new Set<string>();

function hashColor(uid: string): string {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360}, 68%, 60%)`;
}

function lighten(r: number, g: number, b: number, amt: number): string {
    return `rgb(${Math.round(r + (255 - r) * amt)},${Math.round(g + (255 - g) * amt)},${Math.round(b + (255 - b) * amt)})`;
}

function setVars(img: HTMLImageElement, c1: string, c2: string) {
    img.style.setProperty("--vc-vr-c", c1);
    img.style.setProperty("--vc-vr-c2", c2);
}

function ensureColor(uid: string, img: HTMLImageElement) {
    const cached = colorCache.get(uid);
    if (cached) { setVars(img, cached.c1, cached.c2); return; }

    // immediate deterministic fallback so the ring is never colourless
    const fb = hashColor(uid);
    setVars(img, fb, fb);

    if (pendingColor.has(uid)) return;
    pendingColor.add(uid);

    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
        pendingColor.delete(uid);
        try {
            const cv = document.createElement("canvas");
            cv.width = cv.height = 20;
            const ctx = cv.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(im, 0, 0, 20, 20);
            const d = ctx.getImageData(0, 0, 20, 20).data;
            let bestScore = -1, br = 88, bg = 101, bb = 242;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 128) continue;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                const sat = mx === 0 ? 0 : (mx - mn) / mx;
                const score = sat * (mx / 255);
                if (score > bestScore) { bestScore = score; br = r; bg = g; bb = b; }
            }
            const grey = bestScore < 0.12;
            const c1 = grey ? hashColor(uid) : `rgb(${br},${bg},${bb})`;
            const c2 = grey ? c1 : lighten(br, bg, bb, 0.45);
            colorCache.set(uid, { c1, c2 });
            setVars(img, c1, c2);
        } catch {
            // cross-origin tainted canvas — keep the hash fallback
        }
    };
    im.onerror = () => pendingColor.delete(uid);
    im.src = img.src;
}

function apply() {
    const imgs = document.querySelectorAll<HTMLImageElement>(SELECTOR);
    for (const img of imgs) {
        const m = img.src.match(/\/avatars\/(\d+)\//);
        const uid = m?.[1];
        const on = !!uid && speaking.has(uid);
        if (on) ensureColor(uid!, img);
        if (on !== img.classList.contains("vc-vr-ring")) {
            img.classList.toggle("vc-vr-ring", on);
        }
    }
}

function onSpeaking(e: any) {
    const flags = e?.speakingFlags ?? (e?.speaking ? 1 : 0);
    if (!e?.userId) return;
    if (flags) speaking.add(e.userId);
    else speaking.delete(e.userId);
    apply();
}

export default definePlugin({
    name: "VoiceRings",
    description: "Speaking users' avatars pop and rotate in 3D (perspective tilt + lift + glow) instead of the flat green outline. Driven by Discord's speaking event (not raw amplitude — Discord doesn't expose other users' audio).",
    authors: [Devs.o0],
    tags: ["Voice", "Visual", "Appearance"],
    settings,

    start() {
        applyVars();
        FluxDispatcher.subscribe("SPEAKING", onSpeaking);
        // re-apply periodically to survive Discord re-renders / new voice tiles
        timer = setInterval(apply, 400);
    },

    stop() {
        FluxDispatcher.unsubscribe("SPEAKING", onSpeaking);
        if (timer) { clearInterval(timer); timer = null; }
        speaking.clear();
        for (const img of document.querySelectorAll(".vc-vr-ring")) img.classList.remove("vc-vr-ring");
        const r = document.documentElement;
        r.style.removeProperty("--vc-vr-speed");
        r.style.removeProperty("--vc-vr-size");
    },
});
