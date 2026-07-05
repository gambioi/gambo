/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Activity } from "@gambo/discord-types";
import { ActivityType } from "@gambo/discord-types/enums";
import { ApplicationAssetUtils, FluxDispatcher } from "@webpack/common";

import { GameActivitySettings } from "./Settings";

const logger = new Logger("CustomGameActivity");
const ShowCurrentGame = getUserSettingLazy<boolean>("status", "showCurrentGame")!;

// Any valid Discord app id works as an mp:external asset host (ownership not required).
// Used only in Custom mode when no Application ID is provided, so covers still render.
const FALLBACK_APP_ID = "1053143107327176755";

export const enum Mode {
    CUSTOM,
    GAME,
}

export interface DetectableGame {
    id: string;
    name: string;
    icon?: string;
}

// Discord's public list of detectable games (id + name + icon). ~11MB, fetched once + cached.
let detectableCache: DetectableGame[] | null = null;
let detectablePromise: Promise<DetectableGame[]> | null = null;

export function getDetectableGames(): Promise<DetectableGame[]> {
    if (detectableCache) return Promise.resolve(detectableCache);
    if (detectablePromise) return detectablePromise;

    detectablePromise = fetch("https://discord.com/api/v9/applications/detectable")
        .then(r => r.json())
        .then((list: DetectableGame[]) => {
            detectableCache = list.map(g => ({ id: g.id, name: g.name, icon: g.icon }));
            return detectableCache;
        })
        .catch(e => {
            logger.error("Failed to fetch detectable games", e);
            detectablePromise = null;
            return [];
        });

    return detectablePromise;
}

export const settings = definePluginSettings({
    config: {
        type: OptionType.COMPONENT,
        component: GameActivitySettings,
    },
}).withPrivateSettings<{
    mode?: Mode;
    // Real game
    gameId?: string;
    gameName?: string;
    // Custom
    appName?: string;
    appID?: string;
    details?: string;
    state?: string;
    type?: ActivityType;
    // Images (cover = large)
    coverUrl?: string;
    coverText?: string;
    smallUrl?: string;
    smallText?: string;
    // Shared
    timestamp?: boolean;
}>();

// Resolve an image URL or asset key into a usable asset id (external URLs → mp:external proxy).
async function resolveAsset(appId: string, keyOrUrl: string): Promise<string | undefined> {
    try {
        return (await ApplicationAssetUtils.fetchAssetIds(appId, [keyOrUrl]))[0];
    } catch (e) {
        logger.error("Failed to resolve asset", keyOrUrl, e);
        return undefined;
    }
}

async function createActivity(): Promise<Activity | undefined> {
    const { mode, gameId, gameName, appName, appID, details, state, type, timestamp, coverUrl, coverText, smallUrl, smallText } = settings.store;

    let activity: Activity | undefined;
    let assetAppId: string;

    if (mode === Mode.GAME) {
        if (!gameId || !gameName) return;
        assetAppId = gameId;
        activity = {
            application_id: gameId,
            name: gameName,
            type: ActivityType.PLAYING,
            flags: 1 << 0,
        };
    } else {
        if (!appName) return;
        // A valid app id is required for external cover images (mp:external proxy).
        // Fall back to a neutral one so custom covers work without hunting an id.
        assetAppId = appID || FALLBACK_APP_ID;
        activity = {
            application_id: appID || FALLBACK_APP_ID,
            name: appName,
            details: details || undefined,
            state: state || undefined,
            type: type ?? ActivityType.PLAYING,
            flags: 1 << 0,
        };
    }

    if (timestamp) activity.timestamps = { start: Date.now() };

    if (coverUrl) {
        const large = await resolveAsset(assetAppId, coverUrl);
        if (large) activity.assets = { large_image: large, large_text: coverText || undefined };
    }

    if (smallUrl) {
        const small = await resolveAsset(assetAppId, smallUrl);
        if (small) activity.assets = { ...activity.assets, small_image: small, small_text: smallText || undefined };
    }

    for (const k in activity) {
        if (k === "type") continue;
        const v = (activity as any)[k];
        if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) delete (activity as any)[k];
    }

    return activity;
}

export async function setGameActivity(disable?: boolean) {
    const activity = disable ? null : await createActivity();

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: "CustomGameActivity",
    });
}

export function isGameActivityEnabled() {
    return ShowCurrentGame.getSetting();
}

export function enableGameActivity() {
    ShowCurrentGame.updateSetting(true);
}

export default definePlugin({
    name: "CustomGameActivity",
    description: "Fake a game status: pick any real Discord-detectable game (real icon + name) or set a fully custom 'Playing' activity.",
    tags: ["Activity", "Customisation"],
    authors: [Devs.o0],
    dependencies: ["UserSettingsAPI"],
    requiresRestart: false,
    settings,

    start: () => setGameActivity(),
    stop: () => setGameActivity(true),
});
