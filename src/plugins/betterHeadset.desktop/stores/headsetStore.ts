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
import { createPluginStore, ProfilableInitializer, ProfilableStore, profileable, ProfileableProfile } from "@plugins/philsPluginLibrary";

export interface HeadsetProfile {
    // ── Volume ────────────────────────────────────────────────────────────────
    outputVolume?: number;
    outputVolumeEnabled?: boolean;

    // ── Attenuation ───────────────────────────────────────────────────────────
    attenuateWhileSpeaking?: boolean;
    attenuateWhileSpeakingEnabled?: boolean;
    attenuationFactor?: number;
    attenuationFactorEnabled?: boolean;

    // ── Audio processing ──────────────────────────────────────────────────────
    /** AGC: auto level on incoming voices */
    normalizeAudio?: boolean;
    normalizeAudioEnabled?: boolean;

    /** Echo cancellation — disable with headphones for better quality */
    echoCancellation?: boolean;
    echoCancellationEnabled?: boolean;

    /** Discord noise suppression — disable for raw voice quality */
    noiseSuppression?: boolean;
    noiseSuppressionEnabled?: boolean;

    /** Krisp AI noise cancellation */
    noiseCancellation?: boolean;
    noiseCancellationEnabled?: boolean;

    /** QoS packet priority for audio */
    qos?: boolean;
    qosEnabled?: boolean;

    /** Minimum jitter buffer level (0 = lowest latency, 4 = most stable) */
    jitterBuffer?: number;
    jitterBufferEnabled?: boolean;
}

export interface HeadsetStore {
    simpleMode?: boolean;
    setSimpleMode: (enabled?: boolean) => void;

    setOutputVolume: (volume?: number) => void;
    setOutputVolumeEnabled: (enabled?: boolean) => void;
    setAttenuateWhileSpeaking: (enabled?: boolean) => void;
    setAttenuateWhileSpeakingEnabled: (enabled?: boolean) => void;
    setAttenuationFactor: (factor?: number) => void;
    setAttenuationFactorEnabled: (enabled?: boolean) => void;
    setNormalizeAudio: (enabled?: boolean) => void;
    setNormalizeAudioEnabled: (enabled?: boolean) => void;

    setEchoCancellation: (enabled?: boolean) => void;
    setEchoCancellationEnabled: (enabled?: boolean) => void;
    setNoiseSuppression: (enabled?: boolean) => void;
    setNoiseSuppressionEnabled: (enabled?: boolean) => void;
    setNoiseCancellation: (enabled?: boolean) => void;
    setNoiseCancellationEnabled: (enabled?: boolean) => void;
    setQos: (enabled?: boolean) => void;
    setQosEnabled: (enabled?: boolean) => void;
    setJitterBuffer: (level?: number) => void;
    setJitterBufferEnabled: (enabled?: boolean) => void;
}

export const defaultHeadsetProfiles = {
    normal: {
        name: "Normal",
        outputVolume: 100,
        outputVolumeEnabled: true,
        attenuateWhileSpeaking: false,
        attenuateWhileSpeakingEnabled: false,
        attenuationFactor: 50,
        attenuationFactorEnabled: false,
        normalizeAudio: false,
        normalizeAudioEnabled: false,
        echoCancellation: true,
        echoCancellationEnabled: false,
        noiseSuppression: true,
        noiseSuppressionEnabled: false,
        noiseCancellation: false,
        noiseCancellationEnabled: false,
        qos: true,
        qosEnabled: false,
        jitterBuffer: 2,
        jitterBufferEnabled: false,
    },
    headphones: {
        name: "Headphones (Max Quality)",
        outputVolume: 150,
        outputVolumeEnabled: true,
        attenuateWhileSpeaking: false,
        attenuateWhileSpeakingEnabled: false,
        attenuationFactor: 50,
        attenuationFactorEnabled: false,
        normalizeAudio: false,
        normalizeAudioEnabled: false,
        // With headphones: disable echo cancellation and noise suppression
        // for the cleanest raw voice quality
        echoCancellation: false,
        echoCancellationEnabled: true,
        noiseSuppression: false,
        noiseSuppressionEnabled: true,
        noiseCancellation: false,
        noiseCancellationEnabled: false,
        qos: true,
        qosEnabled: true,
        jitterBuffer: 0,
        jitterBufferEnabled: true,
    },
    gaming: {
        name: "Gaming",
        outputVolume: 150,
        outputVolumeEnabled: true,
        attenuateWhileSpeaking: true,
        attenuateWhileSpeakingEnabled: true,
        attenuationFactor: 75,
        attenuationFactorEnabled: true,
        normalizeAudio: true,
        normalizeAudioEnabled: true,
        echoCancellation: false,
        echoCancellationEnabled: true,
        noiseSuppression: true,
        noiseSuppressionEnabled: true,
        noiseCancellation: false,
        noiseCancellationEnabled: false,
        qos: true,
        qosEnabled: true,
        jitterBuffer: 1,
        jitterBufferEnabled: true,
    },
} as const satisfies Record<string, HeadsetProfile & ProfileableProfile>;

export const headsetStoreDefault: ProfilableInitializer<HeadsetStore, HeadsetProfile> = (set, get) => ({
    simpleMode: true,
    setSimpleMode: enabled => get().simpleMode = enabled,

    setOutputVolume: volume => get().currentProfile.outputVolume = volume,
    setOutputVolumeEnabled: enabled => get().currentProfile.outputVolumeEnabled = enabled,
    setAttenuateWhileSpeaking: val => get().currentProfile.attenuateWhileSpeaking = val,
    setAttenuateWhileSpeakingEnabled: enabled => get().currentProfile.attenuateWhileSpeakingEnabled = enabled,
    setAttenuationFactor: factor => get().currentProfile.attenuationFactor = factor,
    setAttenuationFactorEnabled: enabled => get().currentProfile.attenuationFactorEnabled = enabled,
    setNormalizeAudio: val => get().currentProfile.normalizeAudio = val,
    setNormalizeAudioEnabled: enabled => get().currentProfile.normalizeAudioEnabled = enabled,

    setEchoCancellation: val => get().currentProfile.echoCancellation = val,
    setEchoCancellationEnabled: enabled => get().currentProfile.echoCancellationEnabled = enabled,
    setNoiseSuppression: val => get().currentProfile.noiseSuppression = val,
    setNoiseSuppressionEnabled: enabled => get().currentProfile.noiseSuppressionEnabled = enabled,
    setNoiseCancellation: val => get().currentProfile.noiseCancellation = val,
    setNoiseCancellationEnabled: enabled => get().currentProfile.noiseCancellationEnabled = enabled,
    setQos: val => get().currentProfile.qos = val,
    setQosEnabled: enabled => get().currentProfile.qosEnabled = enabled,
    setJitterBuffer: level => get().currentProfile.jitterBuffer = level,
    setJitterBufferEnabled: enabled => get().currentProfile.jitterBufferEnabled = enabled,
});

export let headsetStore: ProfilableStore<HeadsetStore, HeadsetProfile>;

export const initHeadsetStore = () =>
    headsetStore = createPluginStore(
        PluginInfo.PLUGIN_NAME,
        "HeadsetStore",
        profileable(
            headsetStoreDefault,
            { name: "" },
            Object.values(defaultHeadsetProfiles)
        )
    );
