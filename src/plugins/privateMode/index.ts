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
import { getUserSettingLazy } from "@api/UserSettings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const StatusSetting = getUserSettingLazy<string>("status", "status")!;
const ShowCurrentGame = getUserSettingLazy<boolean>("status", "showCurrentGame")!;

let active = false;
let savedStatus: string | null = null;
let savedShowGame: boolean | null = null;

const settings = definePluginSettings({
    privateStatus: {
        type: OptionType.SELECT,
        description: "Statut à appliquer en mode privé",
        options: [
            { label: "Invisible (apparaît hors ligne)", value: "invisible", default: true },
            { label: "Ne pas déranger", value: "dnd" },
            { label: "Inactif", value: "idle" },
        ],
        onChange: () => { if (active) StatusSetting.updateSetting(settings.store.privateStatus); }
    },
    hideActivity: {
        type: OptionType.BOOLEAN,
        description: "Cacher ton activité / le jeu en cours",
        default: true,
        onChange: value => {
            if (!active) return;
            if (value) {
                ShowCurrentGame.updateSetting(false);
            } else if (savedShowGame !== null) {
                ShowCurrentGame.updateSetting(savedShowGame);
            }
        }
    }
});

function enablePrivate() {
    // Sauvegarder l'état actuel pour le restaurer ensuite
    const curStatus = StatusSetting.getSetting();
    if (curStatus) savedStatus = curStatus;

    StatusSetting.updateSetting(settings.store.privateStatus);

    if (settings.store.hideActivity) {
        const g = ShowCurrentGame.getSetting();
        if (g !== undefined && g !== null) savedShowGame = g;
        ShowCurrentGame.updateSetting(false);
    }
}

function disablePrivate() {
    // Restaurer l'état d'avant
    if (savedStatus) StatusSetting.updateSetting(savedStatus);
    if (savedShowGame !== null) ShowCurrentGame.updateSetting(savedShowGame);
    savedStatus = null;
    savedShowGame = null;
}

export default definePlugin({
    name: "PrivateMode",
    description: "Rend ton compte privé dès que tu l'actives : te passe en Invisible et cache ton activité/jeu. Désactive-le pour restaurer ton état d'avant.",
    authors: [Devs.o0],
    tags: ["Privacy", "Status", "Activity"],
    settings,

    start() {
        active = true;
        enablePrivate();
    },

    stop() {
        active = false;
        disablePrivate();
    }
});
