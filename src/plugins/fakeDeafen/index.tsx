/*
 * Gambo, a modification for Discord's desktop app
 * Copyright (c) 2024 _o0 and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, Menu } from "@webpack/common";
import type { MouseEvent } from "react";

export let fakeD = false;

const settings = definePluginSettings({
    keybind: {
        type: OptionType.SELECT,
        description: "Keybind to toggle fake deafen",
        options: [
            { label: "F1",  value: "f1"  },
            { label: "F2",  value: "f2"  },
            { label: "F3",  value: "f3"  },
            { label: "F4",  value: "f4"  },
            { label: "F5",  value: "f5"  },
            { label: "F6",  value: "f6"  },
            { label: "F7",  value: "f7"  },
            { label: "F8",  value: "f8"  },
            { label: "F9",  value: "f9",  default: true },
            { label: "F10", value: "f10" },
            { label: "F11", value: "f11" },
            { label: "F12", value: "f12" },
            { label: "Ctrl+D",        value: "ctrl+d"        },
            { label: "Ctrl+Shift+D",  value: "ctrl+shift+d"  },
            { label: "Alt+D",         value: "alt+d"         },
            { label: "Alt+F",         value: "alt+f"         },
            { label: "Ctrl+Alt+D",    value: "ctrl+alt+d"    },
        ],
    },
    useCustomKeybind: {
        type: OptionType.BOOLEAN,
        description: "Use a custom keybind instead of the preset",
        default: false,
        onChange: () => setupKeybindListener(),
    },
    customKeybind: {
        type: OptionType.STRING,
        description: "Custom keybind (e.g. ctrl+shift+f9)",
        default: "",
        disabled: () => !settings.store.useCustomKeybind,
        onChange: () => setupKeybindListener(),
    },
    muteUponFakeDeafen: {
        type: OptionType.BOOLEAN,
        description: "Also mute yourself when enabling fake deafen",
        default: false,
    },
    mute: {
        type: OptionType.BOOLEAN,
        description: "Show as muted to others",
        default: true,
    },
    deafen: {
        type: OptionType.BOOLEAN,
        description: "Show as deafened to others",
        default: true,
    },
    cam: {
        type: OptionType.BOOLEAN,
        description: "Show camera as off to others",
        default: false,
    },
});

function toggleFakeDeafen() {
    fakeD = !fakeD;

    // Quick-click deafen button to trigger a voice state update so the patch runs
    const deafenBtn = document.querySelector('[aria-label="Deafen"]') as HTMLElement;
    if (deafenBtn) {
        deafenBtn.click();
        setTimeout(() => deafenBtn.click(), 200);
    }

    if (fakeD && settings.store.muteUponFakeDeafen) {
        setTimeout(() => {
            (document.querySelector('[aria-label="Mute"]') as HTMLElement)?.click();
        }, 300);
    }

    // Show a toast via Discord's own FluxDispatcher
    FluxDispatcher.dispatch({
        type: "LAYER_POP_START",
    });
}

function parseKeybind(raw: string) {
    const parts = raw.toLowerCase().split("+");
    return {
        ctrl:  parts.includes("ctrl") || parts.includes("control"),
        shift: parts.includes("shift"),
        alt:   parts.includes("alt"),
        key:   parts[parts.length - 1],
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
            : (settings.store.keybind ?? "f9");

        const kb = parseKeybind(raw);
        if (
            kb.ctrl  === (e.ctrlKey  || e.metaKey) &&
            kb.shift === e.shiftKey &&
            kb.alt   === e.altKey &&
            e.key.toLowerCase() === kb.key
        ) {
            e.preventDefault();
            toggleFakeDeafen();
        }
    };

    document.addEventListener("keydown", keydownListener);
}

export default definePlugin({
    name: "FakeDeafen",
    description: "Makes you appear deafened/muted to others while you still hear everything. Press F9 (configurable) to toggle.",
    authors: [Devs.o0],
    patches: [
        {
            find: "}voiceStateUpdate(",
            replacement: {
                match: /self_mute:([^,]+),self_deaf:([^,]+),self_video:([^,]+)/,
                replace: "self_mute:$self.toggle($1,'mute'),self_deaf:$self.toggle($2,'deaf'),self_video:$self.toggle($3,'video')",
            },
        },
    ],
    settings,

    toggle(value: any, what: "mute" | "deaf" | "video") {
        if (!fakeD) return value;
        switch (what) {
            case "mute":  return settings.store.mute;
            case "deaf":  return settings.store.deafen;
            case "video": return settings.store.cam;
        }
    },

    contextMenus: {
        "user-panel-video": (children: any) => {
            children.push(
                <Menu.MenuSeparator />,
                <Menu.MenuCheckboxItem
                    id="vc-fakedeafen-toggle"
                    label={`Fake Deafen: ${fakeD ? "ON" : "OFF"}`}
                    checked={fakeD}
                    action={() => toggleFakeDeafen()}
                />
            );
        },
    },

    start() {
        setupKeybindListener();
    },

    stop() {
        if (keydownListener) {
            document.removeEventListener("keydown", keydownListener);
            keydownListener = null;
        }
        fakeD = false;
    },
});
