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
import { createPluginStore, ProfilableInitializer, ProfilableStore, profileable, ProfileableProfile } from "@plugins/philsPluginLibrary";


export interface MicrophoneProfile {
    freq?: number,
    pacsize?: number,
    channels?: number,
    rate?: number,
    voiceBitrate?: number;
    freqEnabled?: boolean,
    pacsizeEnabled?: boolean;
    channelsEnabled?: boolean;
    rateEnabled?: boolean;
    voiceBitrateEnabled?: boolean;
    /** Mic input device volume 0-100 (maps to Discord's microphone volume) */
    inputVolume?: number;
    inputVolumeEnabled?: boolean;
    /** AGC boost — amplifies mic signal before Opus encoding for louder transmission */
    agcBoost?: boolean;
    agcBoostEnabled?: boolean;
    /**
     * Boost level 0-4 (requires agcBoost enabled):
     * 0 = off  1 = AGC only  2 = AGC+max input  3 = AGC+max+no noise  4 = AGC+max+no noise+no echo
     */
    boostLevel?: number;
    boostLevelEnabled?: boolean;
    /** Disable Discord's noise suppression independently */
    noiseSuppressionOff?: boolean;
    /** Disable Discord's echo cancellation independently */
    echoCancellationOff?: boolean;
    /** Use Opus "audio" mode instead of "voip" (full frequency range) */
    opusAudioMode?: boolean;
    /** Opus in-band Forward Error Correction — recovers lost packets (less choppy voice) */
    fec?: boolean;
    fecEnabled?: boolean;
    /** Packet loss % (0-100) the encoder plans for → adds FEC redundancy proactively */
    expectedPacketLoss?: number;
    expectedPacketLossEnabled?: boolean;
    /** Opus encoding complexity 0-10 (10 = best quality, slightly more CPU) */
    complexity?: number;
    complexityEnabled?: boolean;
}

export interface MicrophoneStore {
    simpleMode?: boolean;
    setSimpleMode: (enabled?: boolean) => void;
    forceBitrate?: boolean;
    setForceBitrate: (enabled?: boolean) => void;
    setFreq: (freq?: number) => void;
    setPacsize: (pacsize?: number) => void;
    setChannels: (channels?: number) => void;
    setRate: (rate?: number) => void;
    setVoiceBitrate: (voiceBitrate?: number) => void;
    setFreqEnabled: (enabled?: boolean) => void;
    setPacsizeEnabled: (enabled?: boolean) => void;
    setChannelsEnabled: (enabled?: boolean) => void;
    setRateEnabled: (enabled?: boolean) => void;
    setVoiceBitrateEnabled: (enabled?: boolean) => void;
    setInputVolume: (volume?: number) => void;
    setInputVolumeEnabled: (enabled?: boolean) => void;
    setAgcBoost: (enabled?: boolean) => void;
    setAgcBoostEnabled: (enabled?: boolean) => void;
    setBoostLevel: (level?: number) => void;
    setBoostLevelEnabled: (enabled?: boolean) => void;
    setNoiseSuppressionOff: (off?: boolean) => void;
    setEchoCancellationOff: (off?: boolean) => void;
    setOpusAudioMode: (enabled?: boolean) => void;
    setFec: (enabled?: boolean) => void;
    setFecEnabled: (enabled?: boolean) => void;
    setExpectedPacketLoss: (value?: number) => void;
    setExpectedPacketLossEnabled: (enabled?: boolean) => void;
    setComplexity: (value?: number) => void;
    setComplexityEnabled: (enabled?: boolean) => void;
}

export const defaultMicrophoneProfiles = {
    normal: {
        name: "Normal",
        channels: 2,
        channelsEnabled: true,
        voiceBitrate: 96,
        voiceBitrateEnabled: true
    },
    high: {
        name: "High",
        channels: 2,
        channelsEnabled: true,
        voiceBitrate: 320,
        voiceBitrateEnabled: true,
        // best-quality Opus levers
        fec: true,
        fecEnabled: true,
        expectedPacketLoss: 15,
        expectedPacketLossEnabled: true,
        complexity: 10,
        complexityEnabled: true,
    },
} as const satisfies Record<string, MicrophoneProfile & ProfileableProfile>;

export const microphoneStoreDefault: ProfilableInitializer<MicrophoneStore, MicrophoneProfile> = (set, get) => ({
    simpleMode: true,
    setSimpleMode: enabled => get().simpleMode = enabled,
    forceBitrate: false,
    setForceBitrate: enabled => get().forceBitrate = enabled,
    setChannels: channels => get().currentProfile.channels = channels,
    setRate: rate => get().currentProfile.rate = rate,
    setVoiceBitrate: voiceBitrate => get().currentProfile.voiceBitrate = voiceBitrate,
    setPacsize: pacsize => get().currentProfile.pacsize = pacsize,
    setFreq: freq => get().currentProfile.freq = freq,
    setChannelsEnabled: enabled => get().currentProfile.channelsEnabled = enabled,
    setFreqEnabled: enabled => get().currentProfile.freqEnabled = enabled,
    setPacsizeEnabled: enabled => get().currentProfile.pacsizeEnabled = enabled,
    setRateEnabled: enabled => get().currentProfile.rateEnabled = enabled,
    setVoiceBitrateEnabled: enabled => get().currentProfile.voiceBitrateEnabled = enabled,
    setInputVolume: volume => get().currentProfile.inputVolume = volume,
    setInputVolumeEnabled: enabled => get().currentProfile.inputVolumeEnabled = enabled,
    setAgcBoost: val => get().currentProfile.agcBoost = val,
    setAgcBoostEnabled: enabled => get().currentProfile.agcBoostEnabled = enabled,
    setBoostLevel: level => get().currentProfile.boostLevel = level,
    setBoostLevelEnabled: enabled => get().currentProfile.boostLevelEnabled = enabled,
    setNoiseSuppressionOff: off => get().currentProfile.noiseSuppressionOff = off,
    setEchoCancellationOff: off => get().currentProfile.echoCancellationOff = off,
    setOpusAudioMode: enabled => get().currentProfile.opusAudioMode = enabled,
    setFec: val => get().currentProfile.fec = val,
    setFecEnabled: enabled => get().currentProfile.fecEnabled = enabled,
    setExpectedPacketLoss: val => get().currentProfile.expectedPacketLoss = val,
    setExpectedPacketLossEnabled: enabled => get().currentProfile.expectedPacketLossEnabled = enabled,
    setComplexity: val => get().currentProfile.complexity = val,
    setComplexityEnabled: enabled => get().currentProfile.complexityEnabled = enabled,
});

export let microphoneStore: ProfilableStore<MicrophoneStore, MicrophoneProfile>;

export const initMicrophoneStore = () =>
    microphoneStore = createPluginStore(
        PluginInfo.PLUGIN_NAME,
        "MicrophoneStore",
        profileable(
            microphoneStoreDefault,
            { name: "" },
            Object.values(defaultMicrophoneProfiles)
        )
    );
