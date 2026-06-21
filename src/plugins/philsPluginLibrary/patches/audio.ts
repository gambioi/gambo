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

import { MicrophoneProfile, MicrophoneStore } from "@plugins/betterMicrophone.desktop/stores";
import { ProfilableStore, types } from "@plugins/philsPluginLibrary";
import { Logger } from "@utils/Logger";
import { lodash } from "@webpack/common";

export function getDefaultAudioTransportationOptions(connection: types.Connection) {
    return {
        audioEncoder: { ...(connection.getCodecOptions?.("opus")?.audioEncoder ?? {}) },
        encodingVoiceBitRate: 64000
    };
}

export function getReplaceableAudioTransportationOptions(
    connection: types.Connection,
    get: ProfilableStore<MicrophoneStore, MicrophoneProfile>["get"]
) {
    const store = get();
    const { currentProfile } = store;
    const {
        channels, channelsEnabled, freq, freqEnabled, pacsize, pacsizeEnabled,
        rate, rateEnabled, voiceBitrate, voiceBitrateEnabled,
        agcBoost, agcBoostEnabled,
        boostLevel, boostLevelEnabled,
        noiseSuppressionOff, echoCancellationOff, opusAudioMode,
    } = currentProfile as any;

    const forceBitrate = (store as any).forceBitrate;

    // Boost level 0-4: progressively removes audio processing for louder raw signal.
    // Level ≥ 3 disables noise suppression, level ≥ 4 also disables echo cancellation.
    const activeLevel = (agcBoostEnabled && agcBoost && boostLevelEnabled && boostLevel != null)
        ? (boostLevel as number) : 0;

    // NS/EC can be disabled via boost level OR via independent toggles
    const disableNS = noiseSuppressionOff || activeLevel >= 3;
    const disableEC = echoCancellationOff || activeLevel >= 4;

    // Passthrough — keep Discord-stable audio. Only apply settings the user explicitly
    // toggled. NB: receiving a friend's stereo (L/R) is NOT achievable here — the decoder
    // channel count is set by native SDP negotiation, not exposed to plugins. That's a
    // Discord Canary voice feature; Vesktop's stable base negotiates mono receive.
    return {
        ...(forceBitrate
            ? { encodingVoiceBitRate: 320000 }
            : (voiceBitrateEnabled && voiceBitrate ? { encodingVoiceBitRate: voiceBitrate * 1000 } : {})),
        ...(agcBoostEnabled && agcBoost != null ? { automaticGainControl: agcBoost } : {}),
        ...(disableNS ? { noiseSuppression: false } : {}),
        ...(disableEC ? { echoCancellation: false } : {}),
        audioEncoder: {
            ...(connection.getCodecOptions?.("opus")?.audioEncoder ?? {}),
            ...(opusAudioMode ? { application: "audio" } : {}),
            ...(rateEnabled && rate ? { rate } : {}),
            ...(pacsizeEnabled && pacsize ? { pacsize } : {}),
            ...(freqEnabled && freq ? { freq } : {}),
            ...(channelsEnabled && channels ? { channels } : {})
        }
    };
}

export function patchConnectionAudioTransportOptions(
    connection: types.Connection,
    get: ProfilableStore<MicrophoneStore, MicrophoneProfile>["get"],
    logger?: Logger
) {
    if (!connection.conn) return { oldSetTransportOptions: (() => void 0) as any, forceUpdateTransportationOptions: () => void 0 };
    const oldSetTransportOptions = connection.conn.setTransportOptions;

    connection.conn.setTransportOptions = function (this: any, options: Record<string, any>) {
        const replaceable = getReplaceableAudioTransportationOptions(connection, get);
        if (replaceable.encodingVoiceBitRate !== undefined) options.encodingVoiceBitRate = replaceable.encodingVoiceBitRate;
        if ((replaceable as any).automaticGainControl !== undefined) options.automaticGainControl = (replaceable as any).automaticGainControl;
        if ((replaceable as any).noiseSuppression !== undefined) options.noiseSuppression = (replaceable as any).noiseSuppression;
        if ((replaceable as any).echoCancellation !== undefined) options.echoCancellation = (replaceable as any).echoCancellation;
        if (!options.audioEncoder) options.audioEncoder = {};
        Object.assign(options.audioEncoder, replaceable.audioEncoder);
        return Reflect.apply(oldSetTransportOptions, this, [options]);
    };

    const forceUpdateTransportationOptions = () => {
        const transportOptions = lodash.merge(
            { ...getDefaultAudioTransportationOptions(connection) },
            getReplaceableAudioTransportationOptions(connection, get)
        );
        logger?.info("Overridden Transport Options", transportOptions);
        oldSetTransportOptions(transportOptions);
    };

    return { oldSetTransportOptions, forceUpdateTransportationOptions };
}
