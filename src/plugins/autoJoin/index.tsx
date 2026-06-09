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

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import type { Channel } from "@gambo/discord-types";
import { ChannelStore, FluxDispatcher, Menu, Toasts, VoiceStateStore } from "@webpack/common";

const VoiceStateActions = findByPropsLazy("selectVoiceChannel");

const VOICE_CHANNEL = 2;
const STAGE_CHANNEL = 13;

let autoJoinChannelId: string | null = null;
let fluxListener: ((action: any) => void) | null = null;

function getMemberCount(channelId: string): number {
    const states = VoiceStateStore.getVoiceStatesForChannel(channelId);
    return Object.keys(states ?? {}).length;
}

function isChannelFull(channel: Channel): boolean {
    const limit = (channel as any).userLimit;
    if (!limit || limit === 0) return false;
    return getMemberCount(channel.id) >= limit;
}

function stopAutoJoin(showToast = true) {
    if (fluxListener) {
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", fluxListener);
        fluxListener = null;
    }
    autoJoinChannelId = null;

    if (showToast) {
        Toasts.show({
            message: "AutoJoin annulé.",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE
        });
    }
}

function tryJoin() {
    if (!autoJoinChannelId) return;

    const ch = ChannelStore.getChannel(autoJoinChannelId);
    if (!ch) { stopAutoJoin(false); return; }

    if (!isChannelFull(ch)) {
        try {
            VoiceStateActions.selectVoiceChannel(ch.id);
            Toasts.show({
                message: `Place trouvée ! Rejoint #${ch.name}`,
                id: Toasts.genId(),
                type: Toasts.Type.SUCCESS
            });
        } catch (e) {
            Toasts.show({
                message: `Erreur lors du join de #${ch.name}`,
                id: Toasts.genId(),
                type: Toasts.Type.FAILURE
            });
        }
        stopAutoJoin(false);
    }
}

function startAutoJoin(channel: Channel) {
    if (fluxListener) stopAutoJoin(false);

    autoJoinChannelId = channel.id;

    Toasts.show({
        message: `AutoJoin activé pour #${channel.name} — en attente d'une place...`,
        id: Toasts.genId(),
        type: Toasts.Type.MESSAGE
    });

    // React instantly to any voice state change (join/leave events)
    fluxListener = (action: any) => {
        const updates: any[] = action.voiceStates ?? [];
        const relevant = updates.some(s =>
            s.channelId === autoJoinChannelId ||
            s.oldChannelId === autoJoinChannelId
        );
        if (relevant) tryJoin();
    };

    FluxDispatcher.subscribe("VOICE_STATE_UPDATES", fluxListener);
}

const channelContextMenuPatch: NavContextMenuPatchCallback = (children, props: { channel: Channel; }) => {
    const { channel } = props;
    if (!channel) return;

    const type = (channel as any).type;
    if (type !== VOICE_CHANNEL && type !== STAGE_CHANNEL) return;

    if (autoJoinChannelId === channel.id) {
        children.push(
            <Menu.MenuItem
                id="vc-autojoin-cancel"
                label="❌ Annuler AutoJoin"
                action={() => stopAutoJoin(true)}
            />
        );
        return;
    }

    if (!isChannelFull(channel)) return;

    children.push(
        <Menu.MenuItem
            id="vc-autojoin"
            label="⏳ AutoJoin"
            action={() => startAutoJoin(channel)}
        />
    );
};

export default definePlugin({
    name: "AutoJoin",
    description: "Rejoins automatiquement un salon vocal plein dès qu'une place se libère. Clic droit sur le salon → AutoJoin.",
    authors: [Devs.o0],
    tags: ["Voice", "Utility", "Auto"],
    contextMenus: {
        "channel-context": channelContextMenuPatch
    },
    stop() {
        stopAutoJoin(false);
    }
});
