/*
 * Gambo, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

import { PluginInfo } from "@plugins/betterMicrophone.desktop/constants";
import { logger } from "@plugins/betterMicrophone.desktop/logger";
import { microphoneStore } from "@plugins/betterMicrophone.desktop/stores";
import { Emitter, MediaEngineStore, Patcher, types } from "@plugins/philsPluginLibrary";
import { patchConnectionAudioTransportOptions } from "@plugins/philsPluginLibrary/patches/audio";

export class MicrophonePatcher extends Patcher {
    private mediaEngineStore: types.MediaEngineStore;
    private mediaEngine: types.MediaEngine;
    public connection?: types.Connection;
    public oldSetTransportOptions: (...args: any[]) => void;
    public forceUpdateTransportationOptions: () => void;
    private originalSetInputVolume?: (...args: any[]) => any;

    constructor() {
        super();
        this.mediaEngineStore = MediaEngineStore;
        this.mediaEngine = this.mediaEngineStore.getMediaEngine();
        this.oldSetTransportOptions = () => void 0;
        this.forceUpdateTransportationOptions = () => void 0;
    }

    public patch(): this {
        this.unpatch();

        const { get } = microphoneStore;

        // ── Patch setInputVolume ──────────────────────────────────────────────
        // Discord calls setInputVolume internally at any time (reconnect, voice
        // state change, settings dispatch…). We intercept every call so our
        // gain value always wins, even when Discord resets to its default 100.
        const engine = this.mediaEngine as any;
        if (typeof engine.setInputVolume === "function") {
            this.originalSetInputVolume = engine.setInputVolume.bind(engine);

            engine.setInputVolume = (volume: number) => {
                const { inputVolume, inputVolumeEnabled, agcBoost, agcBoostEnabled, boostLevel, boostLevelEnabled } = microphoneStore.get().currentProfile as any;

                // Boost level ≥ 2: force input to 100 regardless of slider
                const activeLevel = (agcBoostEnabled && agcBoost && boostLevelEnabled && boostLevel != null)
                    ? (boostLevel as number) : 0;
                if (activeLevel >= 2) return this.originalSetInputVolume!(100);

                // Manual input volume override
                if (inputVolumeEnabled && inputVolume != null) return this.originalSetInputVolume!(inputVolume);

                return this.originalSetInputVolume!(volume);
            };

            this.unpatchFunctions.push(() => {
                engine.setInputVolume = this.originalSetInputVolume;
                this.originalSetInputVolume = undefined;
            });
        }

        // ── Connection event ──────────────────────────────────────────────────
        const connectionEventFunction =
            (connection: types.Connection) => {
                if (connection.context !== "default") return;

                this.connection = connection;

                const { oldSetTransportOptions, forceUpdateTransportationOptions } = patchConnectionAudioTransportOptions(connection, get, logger);

                this.oldSetTransportOptions = oldSetTransportOptions;
                this.forceUpdateTransportationOptions = forceUpdateTransportationOptions;

                // Trigger once immediately, then again when the connection is
                // fully established (Discord may re-apply its default after connect).
                this.forceApplyInputVolume();

                Emitter.addListener(connection.emitter, "on", "connected", () => {
                    this.forceApplyInputVolume();
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

    // Called from the modal onDone callback after the user hits Apply.
    public forceApplyInputVolume(): void {
        const { inputVolume, inputVolumeEnabled, agcBoost, agcBoostEnabled, boostLevel, boostLevelEnabled } = microphoneStore.get().currentProfile as any;
        const activeLevel = (agcBoostEnabled && agcBoost && boostLevelEnabled && boostLevel != null) ? (boostLevel as number) : 0;

        let volume: number;
        if (activeLevel >= 2) {
            volume = 100; // boost level 2+ forces max input
        } else if (inputVolumeEnabled) {
            volume = inputVolume ?? 100;
        } else {
            return;
        }

        try {
            if (this.originalSetInputVolume) {
                this.originalSetInputVolume(volume);
            } else {
                (this.mediaEngine as any).setInputVolume(volume);
            }
        } catch (e) {
            logger?.error("Failed to set input volume", e);
        }
    }

    public unpatch(): this {
        this.connection = undefined;
        return this._unpatch();
    }
}
