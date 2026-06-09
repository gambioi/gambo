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
import { openHeadsetSettingsModal } from "@plugins/betterHeadset.desktop/modals";
import { HeadsetPatcher } from "@plugins/betterHeadset.desktop/patchers";
import { initHeadsetStore } from "@plugins/betterHeadset.desktop/stores";
import { addSettingsPanelButton, Emitter, removeSettingsPanelButton } from "@plugins/philsPluginLibrary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

// Headset icon (headphones SVG) with settings gear, matching the philsPluginLibrary icon style
export const HeadsetSettingsIcon =
    (props: React.ComponentProps<"svg">) =>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1000"
            height="1000"
            viewBox="0 0 1000 1000"
            {...props}
        >
            <defs>
                <mask id="headsetSettingsIconMask">
                    {/* Headphones icon */}
                    <path
                        fill="currentColor"
                        fillRule="evenodd"
                        d="M12 3C6.48 3 2 7.48 2 13v5c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-3c0-1.1-.9-2-2-2H4v-1c0-4.42 3.58-8 8-8s8 3.58 8 8v1h-1c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-5c0-5.52-4.48-10-10-10z"
                        transform="matrix(43.2813 0 0 43.3063 567.187 588.59) translate(-12 -12)"
                        vectorEffect="non-scaling-stroke"
                    />
                    {/* Circle cutout for settings gear */}
                    <path
                        fill="#000"
                        strokeWidth="0"
                        d="M132.5 67.5c0 35.899-29.101 65-65 65-35.898 0-65-29.101-65-65 0-35.898 29.102-65 65-65 35.899 0 65 29.102 65 65z"
                        transform="translate(229.14 230.807) scale(4.9157) translate(-67.5 -67.5)"
                        vectorEffect="non-scaling-stroke"
                    />
                </mask>
            </defs>
            <rect width="100%" height="100%" fill="#fff" mask="url(#headsetSettingsIconMask)" />
            {/* Settings gear */}
            <path
                fill="currentColor"
                fillRule="evenodd"
                strokeWidth="0"
                d="M19.738 10H22v4h-2.261a7.952 7.952 0 01-1.174 2.564L20 18l-2 2-1.435-1.436A7.946 7.946 0 0114 19.738V22h-4v-2.262a7.94 7.94 0 01-2.564-1.174L6 20l-2-2 1.436-1.436A7.911 7.911 0 014.262 14H2v-4h2.262a7.9 7.9 0 011.174-2.564L4 6l2-2 1.436 1.436A7.9 7.9 0 0110 4.262V2h4v2.261a7.967 7.967 0 012.565 1.174L18 3.999l2 2-1.436 1.437A7.93 7.93 0 0119.738 10zM12 16a4 4 0 100-8 4 4 0 000 8z"
                transform="translate(229.812 230.81) scale(23.0217) translate(-12 -12)"
                vectorEffect="non-scaling-stroke"
            />
        </svg>;

export default definePlugin({
    name: "BetterHeadset",
    description: "This plugin allows you to further customize your headset audio output.",
    authors: [Devs.o0],
    dependencies: ["PhilsPluginLibrary"],
    requiresRestart: true,

    start(): void {
        initHeadsetStore();
        this.headsetPatcher = new HeadsetPatcher().patch();
        addSettingsPanelButton({
            name: PluginInfo.PLUGIN_NAME,
            icon: HeadsetSettingsIcon,
            tooltipText: "Headset Settings",
            onClick: openHeadsetSettingsModal
        });
    },

    stop(): void {
        this.headsetPatcher?.unpatch();
        Emitter.removeAllListeners(PluginInfo.PLUGIN_NAME);
        removeSettingsPanelButton(PluginInfo.PLUGIN_NAME);
    },

    toolboxActions: {
        "Open Headset Settings": openHeadsetSettingsModal
    },
});
