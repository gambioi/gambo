/*
 * Gambo, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import { IpcEvents } from "@shared/IpcEvents";
import { SettingsStore } from "@shared/SettingsStore";
import { mergeDefaults } from "@utils/mergeDefaults";
import { ipcMain } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

import { NATIVE_SETTINGS_FILE, SETTINGS_DIR, SETTINGS_FILE } from "./utils/constants";

mkdirSync(SETTINGS_DIR, { recursive: true });

const SETTINGS_BACKUP_FILE = join(SETTINGS_DIR, "settings.backup.json");

function readSettings<T = object>(name: string, file: string): Partial<T> {
    // Try main file first, then backup if main is corrupted/missing
    for (const path of [file, file === SETTINGS_FILE ? SETTINGS_BACKUP_FILE : null]) {
        if (!path) continue;
        try {
            const raw = readFileSync(path, "utf-8");
            const parsed = JSON.parse(raw);
            if (path === SETTINGS_BACKUP_FILE)
                console.warn(`[Gambo] Restored ${name} settings from backup`);
            return parsed;
        } catch (err: any) {
            if (err?.code !== "ENOENT")
                console.error(`Failed to read ${name} settings from ${path}`, err);
        }
    }
    return {};
}

function writeSettingsAtomic(file: string, data: object) {
    const tmp = file + ".tmp";
    writeFileSync(tmp, JSON.stringify(data, null, 4), "utf-8");
    renameSync(tmp, file);
}

export const RendererSettings = new SettingsStore(readSettings<Settings>("renderer", SETTINGS_FILE));

RendererSettings.addGlobalChangeListener(() => {
    try {
        // Écriture atomique : on écrit dans un .tmp puis on renomme — pas de corruption si Discord se ferme brutalement
        writeSettingsAtomic(SETTINGS_FILE, RendererSettings.plain);
        // Backup automatique après chaque sauvegarde réussie
        writeSettingsAtomic(SETTINGS_BACKUP_FILE, RendererSettings.plain);
    } catch (e) {
        console.error("Failed to write renderer settings", e);
    }
});

ipcMain.on(IpcEvents.GET_SETTINGS, e => e.returnValue = RendererSettings.plain);

ipcMain.handle(IpcEvents.SET_SETTINGS, (_, data: Settings, pathToNotify?: string) => {
    RendererSettings.setData(data, pathToNotify);
});

export interface NativeSettings {
    plugins: {
        [plugin: string]: {
            [setting: string]: any;
        };
    };
    customCspRules: Record<string, string[]>;
}

const DefaultNativeSettings: NativeSettings = {
    plugins: {},
    customCspRules: {}
};

const nativeSettings = readSettings<NativeSettings>("native", NATIVE_SETTINGS_FILE);
mergeDefaults(nativeSettings, DefaultNativeSettings);

export const NativeSettings = new SettingsStore(nativeSettings as NativeSettings);

NativeSettings.addGlobalChangeListener(() => {
    try {
        writeFileSync(NATIVE_SETTINGS_FILE, JSON.stringify(NativeSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write native settings", e);
    }
});
