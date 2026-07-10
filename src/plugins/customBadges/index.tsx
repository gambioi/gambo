/*
 * Gambo, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import BadgeAPIPlugin from "@plugins/_api/badges";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore } from "@webpack/common";

// Shows the chosen badges on YOUR OWN profile (whatever account is logged in), in real Discord order.
// Nitro & Boost are single sliders → only ONE tier shows at a time (pick your level).
const myId = () => UserStore.getCurrentUser()?.id;

// Icons via jsDelivr (mezotv/discord-badges) — CSP-friendly CDN.
const CDN = "https://cdn.jsdelivr.net/gh/mezotv/discord-badges@main/";
const img = (p: string) => CDN + p;

// Standard badges, in left→right profile order (before Nitro/Boost).
const STANDARD: { key: string; name: string; icon: string; }[] = [
    { key: "staff", name: "Discord Staff", icon: "assets/discord-staff.svg" },
    { key: "partner", name: "Partnered Server Owner", icon: "assets/discord-partner.svg" },
    { key: "modAlumni", name: "Moderator Programs Alumni", icon: "assets/discord-mod.svg" },
    { key: "hypesquadEvents", name: "HypeSquad Events", icon: "assets/hype-squad-events.svg" },
    { key: "bugHunter1", name: "Bug Hunter", icon: "assets/discord-bug-hunter-green.svg" },
    { key: "bravery", name: "HypeSquad Bravery", icon: "assets/hype-squad-bravery.svg" },
    { key: "brilliance", name: "HypeSquad Brilliance", icon: "assets/hype-squad-brilliance.svg" },
    { key: "balance", name: "HypeSquad Balance", icon: "assets/hype-squad-balance.svg" },
    { key: "bugHunter2", name: "Golden Bug Hunter", icon: "assets/discord-bug-hunter-gold.svg" },
    { key: "verifiedDev", name: "Early Verified Bot Developer", icon: "assets/discord-bot-dev.svg" },
    { key: "activeDev", name: "Active Developer", icon: "assets/active-developer.svg" },
];

// Nitro tenure tiers — slider value 1..8 (0 = off)
const NITRO: { name: string; icon: string; }[] = [
    { name: "Nitro — Bronze (1 month)", icon: "assets/subscriptions/badges/bronze.png" },
    { name: "Nitro — Silver (3 months)", icon: "assets/subscriptions/badges/silver.png" },
    { name: "Nitro — Gold (6 months)", icon: "assets/subscriptions/badges/gold.png" },
    { name: "Nitro — Platinum (12 months)", icon: "assets/subscriptions/badges/platinum.png" },
    { name: "Nitro — Diamond (24 months)", icon: "assets/subscriptions/badges/diamond.png" },
    { name: "Nitro — Emerald (36 months)", icon: "assets/subscriptions/badges/emerald.png" },
    { name: "Nitro — Ruby (60 months)", icon: "assets/subscriptions/badges/ruby.png" },
    { name: "Nitro — Opal (72 months)", icon: "assets/subscriptions/badges/opal.png" },
];

// Server Boost tiers — slider value 1..9 (0 = off)
const BOOST: { name: string; icon: string; }[] = [
    { name: "Server Boost (1 month)", icon: "assets/boosts/discord-boost-1.svg" },
    { name: "Server Boost (2 months)", icon: "assets/boosts/discord-boost-2.svg" },
    { name: "Server Boost (3 months)", icon: "assets/boosts/discord-boost-3.svg" },
    { name: "Server Boost (6 months)", icon: "assets/boosts/discord-boost-4.svg" },
    { name: "Server Boost (9 months)", icon: "assets/boosts/discord-boost-5.svg" },
    { name: "Server Boost (12 months)", icon: "assets/boosts/discord-boost-6.svg" },
    { name: "Server Boost (15 months)", icon: "assets/boosts/discord-boost-7.svg" },
    { name: "Server Boost (18 months)", icon: "assets/boosts/discord-boost-8.svg" },
    { name: "Server Boost (24 months)", icon: "assets/boosts/discord-boost-9.svg" },
];

const EARLY = { name: "Early Supporter", icon: "assets/discord-early-supporter.svg" };

// ─── settings: standard toggles + Nitro/Boost sliders + Early Supporter ─────────
const settingsDef: Record<string, any> = {};
for (const b of STANDARD)
    settingsDef[b.key] = { type: OptionType.BOOLEAN, description: `Show "${b.name}"`, default: false };
settingsDef.nitroLevel = {
    type: OptionType.SLIDER,
    description: "Nitro tier — 0=off, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum, 5=Diamond, 6=Emerald, 7=Ruby, 8=Opal",
    markers: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    default: 0,
    stickToMarkers: true,
};
settingsDef.boostLevel = {
    type: OptionType.SLIDER,
    description: "Server Boost — 0=off, 1=1mo, 2=2mo, 3=3mo, 4=6mo, 5=9mo, 6=12mo, 7=15mo, 8=18mo, 9=24mo",
    markers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    default: 0,
    stickToMarkers: true,
};
settingsDef.earlySupporter = { type: OptionType.BOOLEAN, description: `Show "Early Supporter" (placed after Nitro & Boost)`, default: false };
settingsDef.hideRealBadges = {
    type: OptionType.BOOLEAN,
    description: "Auto-hide ALL your real Discord badges — show only the ones you picked here (removes the double Nitro + your real quest/orbs/gift badges)",
    default: false,
};

const settings = definePluginSettings(settingsDef);

// One dynamic provider → full control of order + Nitro/Boost exclusivity.
const provider: ProfileBadge = {
    id: "custombadges-provider",
    position: BadgePosition.END,
    shouldShow: ({ userId }) => userId === myId(),
    getBadges: ({ userId }) => {
        if (userId !== myId()) return [];
        const s = settings.store as any;
        const out: { name: string; icon: string; }[] = [];

        for (const b of STANDARD) if (s[b.key]) out.push(b);

        const n = Math.round(s.nitroLevel ?? 0);
        if (n >= 1 && n <= NITRO.length) out.push(NITRO[n - 1]);

        const bo = Math.round(s.boostLevel ?? 0);
        if (bo >= 1 && bo <= BOOST.length) out.push(BOOST[bo - 1]);

        if (s.earlySupporter) out.push(EARLY);

        return out.map((x, i) => ({
            id: `cb-${i}`,
            key: `cb-${i}`,
            description: x.name,
            iconSrc: img(x.icon),
            position: BadgePosition.END,
        }));
    },
};

export default definePlugin({
    name: "CustomBadges",
    description: "Show any Discord badges on your own profile in real order. Standard badges = toggles; Nitro & Server Boost = sliders (only the selected tier shows). Optionally auto-hide all your real badges and show only your picks.",
    authors: [Devs.o0],
    tags: ["Appearance", "Badge"],
    settings,

    // When enabled for the owner, replace the profile's real badges with only ours.
    patches: [
        {
            find: "getLegacyUsername(){",
            replacement: {
                match: /getBadges\(\)\{/,
                replace: "$&if($self.shouldHideReal(this))return $self.ownBadges(this);"
            }
        }
    ],

    shouldHideReal(profile: any) {
        try { return profile?.userId === myId() && !!(settings.store as any).hideRealBadges; } catch { return false; }
    },

    ownBadges(profile: any) {
        try { return BadgeAPIPlugin.getBadges({ userId: profile.userId, guildId: profile.guildId }) ?? []; } catch { return []; }
    },

    start() {
        addProfileBadge(provider);
    },

    stop() {
        removeProfileBadge(provider);
    }
});
