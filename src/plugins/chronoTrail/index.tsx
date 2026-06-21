/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildMemberStore, MessageStore, SelectedChannelStore } from "@webpack/common";

/**
 * ChronoTrail — fly through a channel's history as a 3D river of messages.
 * Pure CSS 3D (perspective), no external deps. Scroll = dolly the camera
 * through time; older messages recede into the distance.
 */

const settings = definePluginSettings({
    modifier: {
        type: OptionType.SELECT,
        description: "Toggle modifier key",
        options: [
            { label: "Alt", value: "alt", default: true },
            { label: "Ctrl", value: "ctrl" },
            { label: "Shift", value: "shift" },
        ],
    },
    key: {
        type: OptionType.STRING,
        description: "Toggle key (single letter, used with the modifier above)",
        default: "T",
    },
    limit: {
        type: OptionType.SLIDER,
        description: "Max messages rendered",
        markers: [50, 100, 150, 200, 300],
        default: 150,
        stickToMarkers: true,
    },
    gap: {
        type: OptionType.SLIDER,
        description: "Depth between messages (px)",
        markers: [160, 220, 260, 320, 400],
        default: 260,
        stickToMarkers: true,
    },
});

const GAP = () => settings.store.gap || 260;

let root: HTMLDivElement | null = null;
let world: HTMLDivElement | null = null;
let cards: HTMLDivElement[] = [];
let cameraZ = 0;
let targetZ = 0;
let raf = 0;

function fmtTime(ts: any): string {
    try {
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return "just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
        return d.toLocaleDateString();
    } catch {
        return "";
    }
}

function buildCards() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return false;
    const channel = ChannelStore.getChannel(channelId);
    const guildId = channel?.guild_id;

    const arr: any[] = MessageStore.getMessages(channelId)?.toArray?.() ?? [];
    if (!arr.length) return false;

    // newest first -> closest to camera
    const msgs = arr.slice(-settings.store.limit).reverse();

    for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const author = m.author ?? {};
        const member = guildId ? GuildMemberStore.getMember(guildId, author.id) : null;
        const color = member?.colorString || "#dbdee1";

        const card = document.createElement("div");
        card.className = "vc-chrono-card";

        const img = document.createElement("img");
        img.src = author.getAvatarURL?.(guildId, 64) ?? "";
        img.loading = "lazy";
        card.appendChild(img);

        const body = document.createElement("div");
        body.className = "vc-chrono-body";

        const head = document.createElement("div");
        head.className = "vc-chrono-head";
        const nameEl = document.createElement("span");
        nameEl.className = "vc-chrono-author";
        nameEl.style.color = color;
        nameEl.textContent = author.globalName ?? author.username ?? "Unknown";
        const timeEl = document.createElement("span");
        timeEl.className = "vc-chrono-time";
        timeEl.textContent = fmtTime(m.timestamp);
        head.appendChild(nameEl);
        head.appendChild(timeEl);

        const text = document.createElement("div");
        text.className = "vc-chrono-text";
        const content = (m.content ?? "").trim();
        if (content) {
            text.textContent = content;
        } else if (m.attachments?.length) {
            text.textContent = `📎 ${m.attachments.length} attachment(s)`;
            text.classList.add("vc-chrono-empty");
        } else if (m.embeds?.length) {
            text.textContent = "🔗 embed";
            text.classList.add("vc-chrono-empty");
        } else {
            text.textContent = "·";
            text.classList.add("vc-chrono-empty");
        }

        body.appendChild(head);
        body.appendChild(text);
        card.appendChild(body);

        // winding "river" layout in 3D
        const x = Math.sin(i * 0.55) * 190;
        const y = Math.cos(i * 0.7) * 70;
        card.dataset.x = String(x);
        card.dataset.y = String(y);
        card.dataset.z = String(-i * GAP());

        world!.appendChild(card);
        cards.push(card);
    }
    return true;
}

function render() {
    for (const card of cards) {
        const x = Number(card.dataset.x);
        const y = Number(card.dataset.y);
        const z = Number(card.dataset.z);
        const ez = cameraZ + z; // effective distance from screen plane

        // hide cards behind the camera or way too far
        if (ez > 350 || ez < -2200) {
            card.style.display = "none";
            continue;
        }
        card.style.display = "";

        // fog: fade with distance, blur the far ones
        let op = 1;
        if (ez < -700) op = Math.max(0, 1 - (-ez - 700) / 1500);
        if (ez > 80) op = Math.max(0, 1 - (ez - 80) / 270);
        const blur = ez < -900 ? Math.min(6, (-ez - 900) / 240) : 0;

        card.style.opacity = String(op);
        card.style.filter = blur ? `blur(${blur}px)` : "";
        card.style.transform = `translate3d(${x}px, ${y}px, ${ez}px)`;
        card.style.zIndex = String(100000 + Math.round(ez));
    }
}

function loop() {
    cameraZ += (targetZ - cameraZ) * 0.12;
    render();
    if (Math.abs(targetZ - cameraZ) > 0.4) {
        raf = requestAnimationFrame(loop);
    } else {
        cameraZ = targetZ;
        render();
        raf = 0;
    }
}

function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
}

function step(dir: number, big = false) {
    const maxZ = cards.length * GAP();
    const amt = GAP() * (big ? 4 : 0.6);
    targetZ = Math.max(0, Math.min(maxZ, targetZ + dir * amt));
    updateHud();
    kick();
}

function onWheel(e: WheelEvent) {
    if (!root) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    step(e.deltaY > 0 ? 1 : -1);
}

let hud: HTMLDivElement | null = null;
function updateHud() {
    if (!hud) return;
    const idx = Math.round(targetZ / GAP());
    hud.textContent = `${Math.min(idx + 1, cards.length)} / ${cards.length}  ·  flying back in time`;
}

function onKey(e: KeyboardEvent) {
    if (!root) return;
    switch (e.key) {
        case "Escape": e.preventDefault(); close(); break;
        case "ArrowDown": case "ArrowRight": e.preventDefault(); step(1); break;
        case "ArrowUp": case "ArrowLeft": e.preventDefault(); step(-1); break;
        case "PageDown": e.preventDefault(); step(1, true); break;
        case "PageUp": e.preventDefault(); step(-1, true); break;
        case "Home": e.preventDefault(); targetZ = 0; updateHud(); kick(); break;
        case "End": e.preventDefault(); targetZ = cards.length * GAP(); updateHud(); kick(); break;
    }
}

function open() {
    if (root) return;
    root = document.createElement("div");
    root.className = "vc-chrono-root";

    world = document.createElement("div");
    world.className = "vc-chrono-world";
    root.appendChild(world);

    cards = [];
    cameraZ = 0;
    targetZ = 0;

    if (!buildCards()) {
        // nothing to show
        root = null;
        world = null;
        return;
    }

    hud = document.createElement("div");
    hud.className = "vc-chrono-hud";
    root.appendChild(hud);
    updateHud();

    const hint = document.createElement("div");
    hint.className = "vc-chrono-hint";
    hint.textContent = "scroll to fly through time   ·   Esc to exit";
    root.appendChild(hint);

    document.body.appendChild(root);
    requestAnimationFrame(() => root?.classList.add("vc-chrono-on"));

    // capture phase on window so we beat SmoothMode / Discord's own wheel handlers
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, true);
    render();
}

function close() {
    if (!root) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    window.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("keydown", onKey, true);
    const r = root;
    r.classList.remove("vc-chrono-on");
    root = null;
    world = null;
    hud = null;
    cards = [];
    setTimeout(() => r.remove(), 300);
}

function toggle() {
    if (root) close();
    else open();
}

function onToggleKey(e: KeyboardEvent) {
    const mod = settings.store.modifier;
    const want = (settings.store.key || "T").toUpperCase();
    const modOk =
        (mod === "alt" && e.altKey && !e.ctrlKey && !e.shiftKey) ||
        (mod === "ctrl" && e.ctrlKey && !e.altKey && !e.shiftKey) ||
        (mod === "shift" && e.shiftKey && !e.altKey && !e.ctrlKey);
    if (modOk && e.key.toUpperCase() === want) {
        e.preventDefault();
        toggle();
    }
}

export default definePlugin({
    name: "ChronoTrail",
    description: "Fly through a channel's history as a 3D river of messages. Default toggle: Alt+T, scroll to travel through time, Esc to exit.",
    authors: [Devs.o0],
    tags: ["Fun", "Visual", "Chat"],
    settings,

    start() {
        window.addEventListener("keydown", onToggleKey, true);
    },

    stop() {
        close();
        window.removeEventListener("keydown", onToggleKey, true);
    },
});
