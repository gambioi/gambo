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
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType } from "@utils/types";

const logger = new Logger("TurboMode");

let style: HTMLStyleElement | undefined;
let cleanupTimer: ReturnType<typeof setInterval> | undefined;

const settings = definePluginSettings({
    disableAnimations: {
        type: OptionType.BOOLEAN,
        description: "Désactive animations & transitions (gros gain anti-lag CPU/GPU)",
        default: true,
        onChange: applyCss
    },
    disableShadows: {
        type: OptionType.BOOLEAN,
        description: "Retire les ombres (box-shadow) — rendu plus léger",
        default: true,
        onChange: applyCss
    },
    disableBlur: {
        type: OptionType.BOOLEAN,
        description: "Retire les flous (backdrop-filter) — très coûteux en GPU",
        default: true,
        onChange: applyCss
    },
    pauseGifs: {
        type: OptionType.BOOLEAN,
        description: "Met en pause les GIFs/emojis animés (moins de CPU/RAM)",
        default: false,
        onChange: applyCss
    },
    memoryCleanup: {
        type: OptionType.BOOLEAN,
        description: "Nettoyage mémoire périodique (libère la RAM via garbage collector)",
        default: true,
        onChange: restartCleanup
    },
    cleanupInterval: {
        type: OptionType.SLIDER,
        description: "Intervalle du nettoyage mémoire (minutes)",
        markers: makeRange(1, 30, 1),
        default: 5,
        stickToMarkers: true,
        onChange: restartCleanup
    }
});

function buildCss() {
    const s = settings.store;
    let css = "";

    if (s.disableAnimations) {
        css += `
*, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-delay: 0ms !important;
    transition-duration: 0.001ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
}`;
    }

    if (s.disableShadows) {
        css += `
* { box-shadow: none !important; text-shadow: none !important; }`;
    }

    if (s.disableBlur) {
        css += `
* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; filter: none !important; }`;
    }

    if (s.pauseGifs) {
        // Fige les GIFs animés (emojis, stickers, avatars animés)
        css += `
img[src*=".gif"], [class*="emoji"][src*=".gif"], video[class*="emoji"] {
    animation-play-state: paused !important;
}`;
    }

    return css;
}

function applyCss() {
    if (!style) return;
    style.textContent = buildCss();
}

function runMemoryCleanup() {
    try {
        // window.gc n'existe que si Chromium a été lancé avec --expose-gc (ajouté côté natif).
        const gc = (window as any).gc;
        if (typeof gc === "function") {
            gc();
            logger.info("Nettoyage mémoire effectué (GC)");
        }
    } catch (e) {
        logger.error("Échec du nettoyage mémoire", e);
    }
}

function restartCleanup() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = undefined;
    }
    if (settings.store.memoryCleanup) {
        const ms = Math.max(1, settings.store.cleanupInterval) * 60 * 1000;
        cleanupTimer = setInterval(runMemoryCleanup, ms);
    }
}

export default definePlugin({
    name: "TurboMode",
    description: "Optimise Discord : moins de lag (animations/ombres/flous off), moins de RAM (nettoyage mémoire), rendu plus fluide. Tout est réglable avec les toggles.",
    authors: [Devs.o0],
    tags: ["Performance", "Utility", "Lag", "RAM"],
    settings,

    start() {
        style = createAndAppendStyle("TurboMode", managedStyleRootNode);
        applyCss();
        restartCleanup();
        // Premier nettoyage peu après le démarrage
        setTimeout(runMemoryCleanup, 10_000);
    },

    stop() {
        style?.remove();
        style = undefined;
        if (cleanupTimer) {
            clearInterval(cleanupTimer);
            cleanupTimer = undefined;
        }
    }
});
