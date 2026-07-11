/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Modern restyle for the shared Phil settings modals (Microphone / Headset /
// Screenshare). Injected once. Uses Discord CSS variables so it follows the
// user's theme (light/dark/custom). Purely cosmetic — no behaviour change.

let injected = false;

const CSS = `
/* ── cards ─────────────────────────────────────────────── */
.phil-card {
    position: relative;
    overflow: hidden;
    padding: 16px !important;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-radius: 14px !important;
    /* Explicit border + elevated surface so the card reads as a card on any theme. */
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, .09)) !important;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, .04), rgba(255, 255, 255, .015)),
        var(--background-secondary, #2b2d31) !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, .22);
    transition: border-color .18s ease, transform .15s ease, box-shadow .2s ease;
}
.phil-card:hover {
    border-color: var(--brand-experiment, #5865f2) !important;
    box-shadow: 0 8px 22px rgba(0, 0, 0, .3);
}
/* colored accent stripe on the left of every card */
.phil-card::before {
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, var(--brand-experiment, #5865f2), #7c83ff);
    opacity: .85;
}

/* gradient Apply button in the footer */
.phil-apply {
    background: linear-gradient(135deg, var(--brand-experiment, #5865f2), #7c83ff) !important;
    border: none !important;
    border-radius: 11px !important;
    font-weight: 800 !important;
    box-shadow: 0 6px 18px rgba(88, 101, 242, .45) !important;
    transition: filter .15s ease, transform .12s ease !important;
}
.phil-apply:hover { filter: brightness(1.08); transform: translateY(-1px); }
.phil-apply:active { transform: scale(.97); }

.phil-card-top {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 24px;
}
.phil-card-title {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--header-primary);
    letter-spacing: .2px;
}
/* switch always pinned to the right of the header row */
.phil-card-switch { margin-left: auto !important; }

.phil-card-ctl {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex: 1;
}
.phil-card-ctl > * { flex: 1; }

/* ── header ────────────────────────────────────────────── */
.phil-head {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
}
.phil-head-ic {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #5865f2, #7c83ff);
    box-shadow: 0 6px 18px rgba(88, 101, 242, .5);
    flex: none;
}
.phil-head-title {
    font-size: 19px;
    font-weight: 800;
    color: var(--header-primary);
    letter-spacing: -.2px;
    line-height: 1.15;
}
.phil-head-sub {
    font-size: 12.5px;
    color: var(--header-secondary, #9aa0b0);
    margin-top: 1px;
}

/* ── controls inside cards ─────────────────────────────── */
.phil-card [class*="input"] input,
.phil-card [class*="lookFilled"] {
    border-radius: 10px !important;
}
.phil-card button {
    border-radius: 10px !important;
}
`;

export function ensurePhilModernStyle() {
    if (injected) return;
    injected = true;
    try {
        const style = document.createElement("style");
        style.id = "phil-modern-settings";
        style.textContent = CSS;
        document.head.appendChild(style);
    } catch { /* non-fatal */ }
}
