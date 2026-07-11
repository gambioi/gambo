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

import { PluginInfo } from "@plugins/betterScreenshare.desktop/constants";
import { createPluginStore, ProfilableInitializer, ProfilableStore, profileable, ProfileableProfile } from "@plugins/philsPluginLibrary";


export interface ScreenshareProfile {
    width?: number,
    height?: number,
    framerate?: number,
    videoCodec?: string,
    keyframeInterval?: number,
    videoBitrate?: number;
    videoBitrateEnabled?: boolean;
    resolutionEnabled?: boolean,
    framerateEnabled?: boolean,
    videoCodecEnabled?: boolean;
    keyframeIntervalEnabled?: boolean;
    hdrEnabled?: boolean;
    stabilityMode?: boolean;
}

export interface ScreenshareStore {
    audioSource?: string;
    audioSourceEnabled?: boolean;
    simpleMode?: boolean;
    setWidth: (width?: number) => void;
    setHeight: (height?: number) => void;
    setFramerate: (framerate?: number) => void;
    setVideoCodec: (codec?: string) => void;
    setKeyframeInterval: (keyframeInterval?: number) => void;
    setVideoBitrate: (bitrate?: number) => void;
    setKeyframeIntervalEnabled: (enabled?: boolean) => void;
    setResolutionEnabled: (enabled?: boolean) => void;
    setFramerateEnabled: (enabled?: boolean) => void;
    setVideoCodecEnabled: (enabled?: boolean) => void;
    setVideoBitrateEnabled: (enabled?: boolean) => void;
    setHdrEnabled: (enabled?: boolean) => void;
    setStabilityMode: (enabled?: boolean) => void;
    setAudioSource: (audioSource?: string) => void;
    setAudioSourceEnabled: (enabled?: boolean) => void;
    setSimpleMode: (enabled?: boolean) => void;
}

export const defaultScreenshareProfiles = {
    performance: {
        name: "Performance (No Lag)",
        width: 1280,
        height: 720,
        framerate: 60,
        videoBitrate: 3000,
        keyframeInterval: 100,
        resolutionEnabled: true,
        framerateEnabled: true,
        videoBitrateEnabled: true,
        keyframeIntervalEnabled: true,
        stabilityMode: true,
    },
    low: {
        name: "Low Quality",
        width: 1280,
        height: 720,
        framerate: 60,
        videoBitrate: 2500,
        keyframeInterval: 60,
        resolutionEnabled: true,
        framerateEnabled: true,
        videoBitrateEnabled: true,
        keyframeIntervalEnabled: true,
        stabilityMode: true,
    },
    medium: {
        name: "Medium Quality",
        width: 1920,
        height: 1080,
        framerate: 60,
        videoBitrate: 5000,
        keyframeInterval: 90,
        resolutionEnabled: true,
        framerateEnabled: true,
        videoBitrateEnabled: true,
        keyframeIntervalEnabled: true,
        stabilityMode: true,
    },
    high: {
        name: "High Quality (1080p60, low delay)",
        width: 1920,
        height: 1080,
        framerate: 60,
        videoBitrate: 10000,
        keyframeInterval: 60, // ~1s at 60fps → fast recovery, low delay
        resolutionEnabled: true,
        framerateEnabled: true,
        videoBitrateEnabled: true,
        keyframeIntervalEnabled: true,
        stabilityMode: true,
    },
    smooth120: {
        name: "Smooth (1080p120)",
        width: 1920,
        height: 1080,
        framerate: 120,
        videoBitrate: 12000,
        keyframeInterval: 120,
        resolutionEnabled: true,
        framerateEnabled: true,
        videoBitrateEnabled: true,
        keyframeIntervalEnabled: true,
        stabilityMode: true,
    },
    insane: {
        name: "INSANE Quality (1080p60, max bitrate)",
        width: 1920,
        height: 1080,
        framerate: 60,
        videoBitrate: 20000, // pushed way past Discord's default cap (needs Nitro/boosts to fully land)
        keyframeInterval: 60,
        resolutionEnabled: true,
        framerateEnabled: true,
        videoBitrateEnabled: true,
        keyframeIntervalEnabled: true,
        stabilityMode: true,
    }
} as const satisfies Record<string, ScreenshareProfile & ProfileableProfile>;

export const screenshareStoreDefault: ProfilableInitializer<ScreenshareStore, ScreenshareProfile> = (set, get) => ({
    setVideoBitrate: bitrate => get().currentProfile.videoBitrate = bitrate,
    setVideoBitrateEnabled: enabled => get().currentProfile.videoBitrateEnabled = enabled,
    setVideoCodec: codec => get().currentProfile.videoCodec = codec,
    setVideoCodecEnabled: enabled => get().currentProfile.videoCodecEnabled = enabled,
    setFramerate: framerate => get().currentProfile.framerate = framerate,
    setFramerateEnabled: enabled => get().currentProfile.framerateEnabled = enabled,
    setHeight: height => get().currentProfile.height = height,
    setWidth: width => get().currentProfile.width = width,
    setResolutionEnabled: enabled => get().currentProfile.resolutionEnabled = enabled,
    setKeyframeInterval: keyframeInterval => get().currentProfile.keyframeInterval = keyframeInterval,
    setKeyframeIntervalEnabled: enabled => get().currentProfile.keyframeIntervalEnabled = enabled,
    setHdrEnabled: enabled => get().currentProfile.hdrEnabled = enabled,
    setStabilityMode: enabled => get().currentProfile.stabilityMode = enabled,
    setAudioSource: audioSource => get().audioSource = audioSource,
    setAudioSourceEnabled: enabled => get().audioSourceEnabled = enabled,
    setSimpleMode: enabled => get().simpleMode = enabled,
    simpleMode: true
});

export let screenshareStore: ProfilableStore<ScreenshareStore, ScreenshareProfile>;

export const initScreenshareStore = () =>
    screenshareStore = createPluginStore(
        PluginInfo.PLUGIN_NAME,
        "ScreenshareStore",
        profileable(
            screenshareStoreDefault,
            { name: "" },
            Object.values(defaultScreenshareProfiles)
        )
    );
