/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { Button, Forms, useState } from "@webpack/common";

const cl = classNameFactory("vc-etnacol-");

/**
 * Colour panel for the Etna theme (Translucence base).
 * The theme drives its colours as split HSL (--xxx-hue / -saturation / -lightness).
 * A hex colour picker is converted to HSL and applied to the three variables.
 * Sliders drive the glass blur and panel opacity.
 */

type HslVar = {
    kind: "hsl";
    key: string;
    label: string;
    hue: string;
    sat: string;
    light: string;
    default: string; // hex
};
type SliderVar = {
    kind: "slider";
    key: string;
    label: string;
    vars: string[];
    default: number;
    min: number;
    max: number;
    step: number;
    unit: string;
};
type TVar = HslVar | SliderVar;

const VARS: TVar[] = [
    { kind: "hsl", key: "accent", label: "Accent (buttons, links, mentions, tooltips)", hue: "--accent-hue", sat: "--accent-saturation", light: "--accent-lightness", default: "#8a8f98" },
    { kind: "hsl", key: "reply", label: "Reply highlight", hue: "--reply-hue", sat: "--reply-saturation", light: "--reply-lightness", default: "#8a8f98" },
    { kind: "slider", key: "blur", label: "Glass blur", vars: ["--app-blur"], default: 6, min: 0, max: 30, step: 1, unit: "px" },
    { kind: "slider", key: "opacity", label: "Panel opacity", vars: ["--sidebar-opacity", "--main-content-opacity"], default: 0.3, min: 0, max: 1, step: 0.02, unit: "" },
];

const STORAGE_KEY = "etnaVars";

type Values = Record<string, string | number>;

function getDefaults(): Values {
    const out: Values = {};
    for (const v of VARS) out[v.key] = v.default;
    return out;
}

function getValues(): Values {
    const stored = (settings.store[STORAGE_KEY] ?? {}) as Values;
    const out = getDefaults();
    for (const v of VARS) {
        if (stored[v.key] !== undefined) out[v.key] = stored[v.key];
    }
    return out;
}

function setValues(values: Values) {
    settings.store[STORAGE_KEY] = { ...values };
}

/** hex (#rrggbb / #rgb) -> { h(0-360), s(0-100), l(0-100) } */
function hexToHsl(hex: string): { h: number; s: number; l: number; } {
    let x = hex.replace("#", "");
    if (x.length === 3) x = x.split("").map(c => c + c).join("");
    const r = parseInt(x.substr(0, 2), 16) / 255;
    const g = parseInt(x.substr(2, 2), 16) / 255;
    const b = parseInt(x.substr(4, 2), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const root = () => document.documentElement;

function applyVar(v: TVar, value: string | number) {
    if (v.kind === "hsl") {
        const { h, s, l } = hexToHsl(String(value));
        root().style.setProperty(v.hue, String(h));
        root().style.setProperty(v.sat, s + "%");
        root().style.setProperty(v.light, l + "%");
    } else {
        for (const name of v.vars) root().style.setProperty(name, value + v.unit);
    }
}

function applyAll() {
    const values = getValues();
    for (const v of VARS) applyVar(v, values[v.key]);
}

function removeAll() {
    for (const v of VARS) {
        if (v.kind === "hsl") {
            root().style.removeProperty(v.hue);
            root().style.removeProperty(v.sat);
            root().style.removeProperty(v.light);
        } else {
            for (const name of v.vars) root().style.removeProperty(name);
        }
    }
}

function Panel() {
    const [values, setLocal] = useState<Values>(() => getValues());

    const update = (key: string, val: string | number) => {
        const next = { ...values, [key]: val };
        setLocal(next);
        setValues(next);
        const v = VARS.find(x => x.key === key);
        if (v) applyVar(v, val);
    };

    const reset = () => {
        const d = getDefaults();
        setLocal(d);
        setValues(d);
        applyAll();
    };

    return (
        <div className={cl("panel")}>
            <Forms.FormTitle tag="h3">Etna theme colors</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16}>
                Change the theme colors and glass. Applied live, saved automatically.
            </Forms.FormText>

            {VARS.map(v => v.kind === "hsl" ? (
                <div key={v.key} className={cl("row")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <Forms.FormTitle tag="h5" style={{ margin: 0 }}>{v.label}</Forms.FormTitle>
                    <input
                        type="color"
                        value={String(values[v.key])}
                        aria-label={v.label}
                        onChange={e => update(v.key, e.currentTarget.value)}
                    />
                </div>
            ) : (
                <div key={v.key} className={cl("row")} style={{ marginBottom: "8px" }}>
                    <Forms.FormTitle tag="h5" style={{ margin: "0 0 4px" }}>{v.label}: {String(values[v.key])}{v.unit}</Forms.FormTitle>
                    <input
                        type="range"
                        min={v.min}
                        max={v.max}
                        step={v.step}
                        value={Number(values[v.key])}
                        aria-label={v.label}
                        style={{ width: "100%" }}
                        onChange={e => update(v.key, v.step < 1 ? parseFloat(e.currentTarget.value) : parseInt(e.currentTarget.value))}
                    />
                </div>
            ))}

            <Button className={Margins.top16} color={Button.Colors.RED} look={Button.Looks.OUTLINED} onClick={reset}>
                Reset to defaults
            </Button>
        </div>
    );
}

export const settings = definePluginSettings({
    [STORAGE_KEY]: { type: OptionType.CUSTOM, default: getDefaults() },
    panel: { type: OptionType.COMPONENT, component: Panel }
});

export default definePlugin({
    name: "EtnaColors",
    authors: [Devs.o0],
    description: "Color panel for the Etna theme: accent, reply, glass blur and panel opacity.",
    tags: ["Appearance", "Theme"],
    settings,
    startAt: StartAt.DOMContentLoaded,
    start: applyAll,
    stop: removeAll
});
