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
import type { Channel, User } from "@gambo/discord-types";
import { Menu, RestAPI, Toasts, UserStore } from "@webpack/common";

interface UserContextProps {
    user: User;
    guildId?: string;
    channel?: Channel;
}

async function fetchAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function cloneAvatar(user: User, guildId?: string) {
    // Get highest quality avatar (2048px, animated if available)
    const avatarUrl = user.getAvatarURL(guildId, 2048, true)
        ?.replace(/\?size=\d+$/, "?size=2048");

    if (!avatarUrl) {
        Toasts.show({
            message: "Impossible de récupérer l'avatar.",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE
        });
        return;
    }

    try {
        const base64 = await fetchAsBase64(avatarUrl);

        await RestAPI.patch({
            url: "/users/@me",
            body: { avatar: base64 }
        });

        Toasts.show({
            message: `Avatar de ${user.username} copié !`,
            id: Toasts.genId(),
            type: Toasts.Type.SUCCESS
        });
    } catch (e) {
        Toasts.show({
            message: "Erreur lors de la copie de l'avatar.",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE
        });
    }
}

const userContextMenuPatch: NavContextMenuPatchCallback = (children, { user, guildId }: UserContextProps) => {
    if (!user) return;
    if (user.id === UserStore.getCurrentUser()?.id) return;

    children.push(
        <Menu.MenuItem
            id="vc-clone-avatar"
            label="Clone Avatar"
            action={() => cloneAvatar(user, guildId)}
        />
    );
};

export default definePlugin({
    name: "CloneAvatar",
    description: "Copie la photo de profil de quelqu'un en tant que ta propre photo de profil en un clic.",
    authors: [Devs.o0],
    tags: ["Avatar", "Profile", "Utility"],
    contextMenus: {
        "user-context": userContextMenuPatch
    }
});
