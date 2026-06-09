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

import { HeadsetSettingsModal } from "@plugins/betterHeadset.desktop/components";
import { PluginInfo } from "@plugins/betterHeadset.desktop/constants";
import Plugin from "@plugins/betterHeadset.desktop/index";
import { headsetStore } from "@plugins/betterHeadset.desktop/stores";
import { openModalLazy } from "@utils/modal";

const onHeadsetModalDone = () => {
    const { headsetPatcher } = Plugin;

    if (headsetPatcher) {
        headsetPatcher.forceUpdateTransportationOptions();
        headsetPatcher.forceApplyVolume();
        headsetPatcher.forceApplyAudioProcessing();
    }
};

export const openHeadsetSettingsModal =
    () => openModalLazy(async () => {
        return props =>
            <HeadsetSettingsModal
                onDone={onHeadsetModalDone}
                showInfo
                headsetStore={headsetStore}
                author={PluginInfo.AUTHOR}
                contributors={Object.values(PluginInfo.CONTRIBUTORS)}
                {...props} />;
    });
