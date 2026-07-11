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

import { PluginInfo } from "@plugins/betterHeadset.desktop/constants";
import { logger } from "@plugins/betterHeadset.desktop/logger";
import { headsetStore } from "@plugins/betterHeadset.desktop/stores";
import { Emitter, MediaEngineStore, Patcher, types } from "@plugins/philsPluginLibrary";

// ─── Transport options ────────────────────────────────────────────────────────

export function getHeadsetTransportOptions(get: typeof headsetStore["get"]) {
    const { currentProfile } = get();
    const { qos, qosEnabled } = currentProfile;

    return {
        ...(qosEnabled && qos != null
            ? { qos }
            : {}),
    };
}

export function patchConnectionHeadsetTransportOptions(
    connection: types.Connection,
    get: typeof headsetStore["get"]
) {
    if (!connection.conn) return { oldSetTransportOptions: (() => void 0) as any, forceUpdateTransportationOptions: () => void 0 };
    const oldSetTransportOptions = connection.conn.setTransportOptions;

    connection.conn.setTransportOptions = function (this: any, options: Record<string, any>) {
        const overrides = getHeadsetTransportOptions(get);
        Object.assign(options, overrides);
        return Reflect.apply(oldSetTransportOptions, this, [options]);
    };

    const forceUpdateTransportationOptions = () => {
        const overrides = getHeadsetTransportOptions(get);
        logger?.info("Headset Transport Overrides", overrides);
        oldSetTransportOptions(overrides);
    };

    return { oldSetTransportOptions, forceUpdateTransportationOptions };
}

// ─── Output volume ────────────────────────────────────────────────────────────

export function applyOutputVolume(
    mediaEngine: types.MediaEngine,
    get: typeof headsetStore["get"]
) {
    const { currentProfile } = get();
    const { outputVolume, outputVolumeEnabled } = currentProfile;
    if (!outputVolumeEnabled || outputVolume == null) return;

    try {
        if (typeof (mediaEngine as any).setOutputVolume === "function") {
            (mediaEngine as any).setOutputVolume(outputVolume);
        }
    } catch (e) {
        logger?.error("Failed to set output volume", e);
    }
}

// ─── Direct connection methods (apply immediately on active call) ─────────────

export function applyAudioProcessing(
    connection: types.Connection,
    get: typeof headsetStore["get"]
) {
    const { currentProfile } = get();
    const {
        attenuateWhileSpeaking, attenuateWhileSpeakingEnabled,
        attenuationFactor,
        qos, qosEnabled,
        jitterBuffer, jitterBufferEnabled,
    } = currentProfile;

    // Duck while speaking — the REAL Discord API. setAttenuation(percent, others, self):
    // lowers other apps/users by `percent` when someone speaks. This is what actually
    // works (the old transport-option approach did nothing).
    try {
        if (attenuateWhileSpeakingEnabled) {
            const on = attenuateWhileSpeaking ?? true;
            connection.setAttenuation(on ? (attenuationFactor ?? 50) : 0, on, on);
        }
    } catch { }

    try {
        if (qosEnabled && qos != null)
            (connection as any).setQoS(qos);
    } catch { }

    try {
        if (jitterBufferEnabled && jitterBuffer != null)
            connection.setMinimumJitterBufferLevel(jitterBuffer);
    } catch { }
}

// ─── HeadsetPatcher ───────────────────────────────────────────────────────────

export class HeadsetPatcher extends Patcher {
    private mediaEngineStore: types.MediaEngineStore;
    private mediaEngine: types.MediaEngine;
    public connection?: types.Connection;
    public oldSetTransportOptions: (...args: any[]) => void;
    public forceUpdateTransportationOptions: () => void;

    constructor() {
        super();
        this.mediaEngineStore = MediaEngineStore;
        this.mediaEngine = this.mediaEngineStore.getMediaEngine();
        this.oldSetTransportOptions = () => void 0;
        this.forceUpdateTransportationOptions = () => void 0;
    }

    public patch(): this {
        this.unpatch();

        const { get } = headsetStore;

        const connectionEventFunction = (connection: types.Connection) => {
            if (connection.context !== "default") return;
            if ((connection as any).destroyed) return;
            if (this.connection === connection) return;

            this.connection = connection;

            const { oldSetTransportOptions, forceUpdateTransportationOptions } =
                patchConnectionHeadsetTransportOptions(connection, get);

            this.oldSetTransportOptions = oldSetTransportOptions;
            this.forceUpdateTransportationOptions = forceUpdateTransportationOptions;

            applyOutputVolume(this.mediaEngine, get);

            Emitter.addListener(connection.emitter, "on", "connected", () => {
                this.forceUpdateTransportationOptions();
                applyOutputVolume(this.mediaEngine, get);
                applyAudioProcessing(connection, get);
            });

            Emitter.addListener(connection.emitter, "on", "destroy", () => {
                this.forceUpdateTransportationOptions = () => void 0;
                this.oldSetTransportOptions = () => void 0;
                this.connection = undefined;
            });
        };

        Emitter.addListener(
            this.mediaEngine.emitter,
            "on",
            "connection",
            connectionEventFunction,
            PluginInfo.PLUGIN_NAME
        );

        return this;
    }

    public forceApplyVolume(): void {
        applyOutputVolume(this.mediaEngine, headsetStore.get);
    }

    public forceApplyAudioProcessing(): void {
        if (this.connection) {
            applyAudioProcessing(this.connection, headsetStore.get);
        }
    }

    public unpatch(): this {
        this.connection = undefined;
        return this._unpatch();
    }
}
