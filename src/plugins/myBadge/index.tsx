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

import { addProfileBadge, BadgePosition, BadgeUserArgs, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Tooltip } from "@webpack/common";

const OWNER_ID = "976573494353616897";

const Badge26Component = (props: ProfileBadge & BadgeUserArgs) => (
    <Tooltip text="26 ✦ _o0">
        {({ onMouseEnter, onMouseLeave }) => (
            <div
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #0f0f1a 0%, #6c00bd 60%, #a855f7 100%)",
                    border: "1.5px solid rgba(255, 215, 0, 0.65)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "9px",
                    fontWeight: "900",
                    color: "#FFD700",
                    letterSpacing: "-0.3px",
                    cursor: "default",
                    boxShadow: "0 0 8px rgba(168, 85, 247, 0.6), inset 0 0 4px rgba(255,215,0,0.1)",
                    userSelect: "none",
                    fontFamily: "gg sans, Noto Sans, Whitney, Helvetica Neue, Arial, sans-serif",
                    flexShrink: 0
                }}
            >
                26
            </div>
        )}
    </Tooltip>
);

const badge: ProfileBadge = {
    id: "my-badge-26",
    key: "my-badge-26",
    description: "26 ✦ _o0",
    position: BadgePosition.START,
    component: Badge26Component,
    shouldShow: ({ userId }: BadgeUserArgs) => userId === OWNER_ID
};

export default definePlugin({
    name: "MyBadge",
    description: "Affiche un badge personnalisé « 26 » sur le profil de _o0.",
    authors: [Devs.o0],
    tags: ["Appearance", "Badge"],

    start() {
        addProfileBadge(badge);
    },

    stop() {
        removeProfileBadge(badge);
    }
});
