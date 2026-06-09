/*
 * Gambo, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { makeRange, OptionType } from "@utils/types";

let style: HTMLStyleElement | undefined;

// Easing premium pour le scroll/zoom (easeOutQuint)
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
// Easing pour les hovers : snappy et naturel (Material standard) — agréable, pas mou
const HOVER_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const settings = definePluginSettings({
    momentumScroll: {
        type: OptionType.BOOLEAN,
        description: "Scroll à inertie (molette beurrée avec momentum) — le vrai smooth",
        default: true,
        onChange: rebindWheel
    },
    scrollSmoothness: {
        type: OptionType.SLIDER,
        description: "Douceur du scroll molette (plus haut = plus glissant/smooth)",
        markers: makeRange(1, 20, 1),
        default: 12,
        stickToMarkers: true
    },
    scrollSpeed: {
        type: OptionType.SLIDER,
        description: "Vitesse du scroll molette (distance par cran)",
        markers: makeRange(10, 200, 10),
        default: 100,
        stickToMarkers: false
    },
    smoothTransitions: {
        type: OptionType.BOOLEAN,
        description: "Transitions douces sur l'UI (hover, panneaux, boutons) avec easing premium",
        default: true,
        onChange: applyCss
    },
    smoothZoom: {
        type: OptionType.BOOLEAN,
        description: "Zoom/agrandissement de la page en douceur (Ctrl + molette)",
        default: true,
        onChange: applyCss
    },
    transitionSpeed: {
        type: OptionType.SLIDER,
        description: "Vitesse des transitions UI (ms) — bas = snappy, haut = doux",
        markers: makeRange(60, 300, 20),
        default: 130,
        stickToMarkers: false,
        onChange: applyCss
    }
});

// ─── CSS (transitions + scroll natif fluide en secours) ──────────────────────

function buildCss() {
    const s = settings.store;
    const d = Math.max(50, Math.round(s.transitionSpeed));
    let css = `
/* Scroll natif fluide (sauts vers un message, etc.) */
html, body, [class*="scroller_"], [class*="scrollerBase_"], [class*="content_"], [class*="messagesWrapper_"] {
    scroll-behavior: smooth !important;
}`;

    if (s.smoothTransitions) {
        // Hovers snappy : on transitionne UNIQUEMENT les propriétés légères et agréables
        // (couleur, fond, opacité, bordure). Pas de width/transform sur les panneaux
        // qui causaient des mouvements/janks désagréables.
        css += `
/* ─── Hover doux & snappy sur les éléments interactifs ───────────────────── */
[class*="button_"], [class*="clickable_"], [class*="item_"], [class*="link_"],
[class*="channel_"], [class*="tab_"], [class*="navItem_"], [class*="listItem_"],
[class*="categoryHeader_"], [class*="pill_"], [class*="lookFilled_"],
[class*="memberInner_"], [class*="interactive_"] {
    transition: background-color ${d}ms ${HOVER_EASE},
                color ${d}ms ${HOVER_EASE},
                border-color ${d}ms ${HOVER_EASE},
                opacity ${d}ms ${HOVER_EASE} !important;
}
/* Apparition douce des popouts/menus (fondu léger, court) */
[class*="menu_"], [class*="autocomplete_"], [class*="tooltip_"] {
    transition: opacity ${Math.min(d, 120)}ms ${HOVER_EASE} !important;
}`;
    }

    if (s.smoothZoom) {
        css += `
#app-mount, [class*="app_"], [class*="appMount"] {
    transition: transform ${d}ms ${EASE}, font-size ${d}ms ${EASE} !important;
}`;
    }

    return css;
}

function applyCss() {
    if (!style) return;
    style.textContent = buildCss();
}

// ─── Scroll à inertie (momentum) en JS ───────────────────────────────────────

// Pour chaque scroller : sa position cible. On interpole vers elle à chaque frame.
const targets = new WeakMap<HTMLElement, number>();
const running = new WeakSet<HTMLElement>();

function findScroller(start: EventTarget | null): HTMLElement | null {
    let el = start as HTMLElement | null;
    while (el && el !== document.body && el.nodeType === 1) {
        if (el.scrollHeight - el.clientHeight > 2) {
            const oy = getComputedStyle(el).overflowY;
            if (oy === "auto" || oy === "scroll") return el;
        }
        el = el.parentElement;
    }
    return null;
}

function animate(el: HTMLElement) {
    const target = targets.get(el);
    if (target === undefined) { running.delete(el); return; }

    const cur = el.scrollTop;
    const diff = target - cur;

    // facteur d'interpolation (lerp) : plus la "douceur" est haute, plus c'est lent/glissant
    const smooth = settings.store.scrollSmoothness; // 1..20
    const ease = 0.30 - (smooth - 1) / 19 * 0.25; // 1->0.30 (snappy), 20->0.05 (très smooth)

    if (Math.abs(diff) < 0.5) {
        el.scrollTop = target;
        targets.delete(el);
        running.delete(el);
        return;
    }

    el.scrollTop = cur + diff * ease;
    requestAnimationFrame(() => animate(el));
}

function onWheel(e: WheelEvent) {
    if (!settings.store.momentumScroll) return;
    // Laisser le zoom (Ctrl) et le scroll horizontal (Shift) au comportement natif
    if (e.ctrlKey || e.shiftKey || e.deltaX !== 0) return;
    // Pixel vs ligne : normaliser
    if (e.deltaMode !== 0) return; // ignore les modes ligne/page (rares)

    const scroller = findScroller(e.target);
    if (!scroller) return;

    const max = scroller.scrollHeight - scroller.clientHeight;
    const base = targets.get(scroller) ?? scroller.scrollTop;

    // Direction où on ne peut plus scroller → laisser le natif (chargement de messages, etc.)
    const dir = Math.sign(e.deltaY);
    if ((dir < 0 && base <= 0) || (dir > 0 && base >= max)) return;

    e.preventDefault();

    const step = (e.deltaY / 100) * settings.store.scrollSpeed;
    let next = base + step;
    next = Math.max(0, Math.min(next, max));
    targets.set(scroller, next);

    if (!running.has(scroller)) {
        running.add(scroller);
        requestAnimationFrame(() => animate(scroller));
    }
}

function rebindWheel() {
    window.removeEventListener("wheel", onWheel, { capture: true } as any);
    if (settings.store.momentumScroll) {
        window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    }
}

export default definePlugin({
    name: "SmoothMode",
    description: "Discord ultra fluide : scroll à inertie (momentum), transitions premium et zoom doux. Règle la douceur et la vitesse avec les sliders. (Désactive 'disable animations' dans TurboMode.)",
    authors: [Devs.o0],
    tags: ["Appearance", "Smooth", "Scroll", "Animation"],
    settings,

    start() {
        style = createAndAppendStyle("SmoothMode", managedStyleRootNode);
        applyCss();
        rebindWheel();
    },

    stop() {
        style?.remove();
        style = undefined;
        window.removeEventListener("wheel", onWheel, { capture: true } as any);
    }
});
