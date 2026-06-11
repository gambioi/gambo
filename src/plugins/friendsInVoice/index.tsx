/*
 * Gambo, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
*/

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, FluxDispatcher, Forms, React } from "@webpack/common";

// Stores en lazy (jamais undefined a l'import -> pas de risque de casser l'enregistrement)
const RelationshipStore = findByPropsLazy("getFriendIDs", "getRelationships");
const VoiceStateStore = findByPropsLazy("getVoiceStateForUser", "getVoiceStatesForChannel");
const ChannelStore = findByPropsLazy("getChannel", "getDMFromUserId");
const GuildStore = findByPropsLazy("getGuild", "getGuilds");
const UserStore = findByPropsLazy("getUser", "getCurrentUser");

const joinTimes = new Map<string, number>();
const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${s}s`;
};

function collect() {
    const out: any[] = [];
    try {
        const ids: string[] = RelationshipStore.getFriendIDs?.() ?? [];
        for (const id of ids) {
            const vs = VoiceStateStore.getVoiceStateForUser?.(id);
            if (!vs?.channelId) continue;
            const ch = ChannelStore.getChannel?.(vs.channelId);
            if (!ch) continue;
            const guild = vs.guildId ? GuildStore.getGuild?.(vs.guildId) : null;
            const states = VoiceStateStore.getVoiceStatesForChannel?.(vs.channelId) ?? {};
            const others = Object.keys(states).filter(u => u !== id).map(u => UserStore.getUser?.(u)).filter(Boolean);
            out.push({
                id, user: UserStore.getUser?.(id),
                guildName: guild?.name ?? "DM / Groupe",
                channelName: ch.name ?? "Vocal",
                since: joinTimes.get(id) ?? null,
                others
            });
        }
    } catch { /* */ }
    return out.sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
}

function Modal({ rootProps }: any) {
    const [, force] = React.useState(0);
    React.useEffect(() => {
        const on = () => force(x => x + 1);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", on);
        const iv = setInterval(on, 1000);
        return () => { FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", on); clearInterval(iv); };
    }, []);
    const list = collect();
    return (
        <ModalRoot {...rootProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <Forms.FormTitle tag="h2" style={{ margin: 0 }}>🔊 Amis en vocal ({list.length})</Forms.FormTitle>
            </ModalHeader>
            <ModalContent style={{ padding: "1em" }}>
                {list.length === 0
                    ? <Forms.FormText style={{ opacity: .7 }}>Aucun ami en vocal dans tes serveurs partagés. (Appels DM privés et serveurs non partagés non visibles.)</Forms.FormText>
                    : <div style={{ display: "flex", flexDirection: "column", gap: ".6em" }}>
                        {list.map(f => (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: ".7em", background: "var(--background-secondary)", borderRadius: 8, padding: ".6em .8em" }}>
                                <img src={f.user?.getAvatarURL?.(undefined, 64) ?? ""} width={40} height={40} style={{ borderRadius: "50%" }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: "var(--text-default)" }}>{f.user?.globalName ?? f.user?.username ?? f.id}</div>
                                    <div style={{ fontSize: ".8em", color: "var(--text-muted)" }}>
                                        <b>{f.guildName}</b> · 🔊 {f.channelName}{f.since != null && <> · ⏱ {fmt(Date.now() - f.since)}</>}
                                    </div>
                                    {f.others.length > 0 && <div style={{ fontSize: ".75em", color: "var(--text-muted)", marginTop: 2 }}>avec {f.others.map((u: any) => u.globalName ?? u.username).join(", ")}</div>}
                                </div>
                            </div>
                        ))}
                    </div>}
                <Forms.FormText style={{ marginTop: "1em", fontSize: ".7em", opacity: .5 }}>
                    ⏱ Durée comptée dès que Gambo voit l'ami rejoindre. Marche même s'il est en « invisible ».
                </Forms.FormText>
            </ModalContent>
        </ModalRoot>
    );
}

export const openFriendsInVoice = () => openModal(props => <Modal rootProps={props} />);

const settings = definePluginSettings({
    open: {
        type: OptionType.COMPONENT,
        description: "Voir mes amis en vocal",
        component: () => (
            <Button onClick={openFriendsInVoice}>🔊 Voir mes amis en vocal</Button>
        )
    }
});

const fluxListener = (action: any) => {
    for (const s of (action.voiceStates ?? [])) {
        if (s.channelId && s.channelId !== s.oldChannelId) joinTimes.set(s.userId, Date.now());
        else if (!s.channelId) joinTimes.delete(s.userId);
    }
};

export default definePlugin({
    name: "FriendsInVoice",
    description: "Voir tes amis en vocal (serveur, salon, avec qui, depuis quand) — même en invisible. Ouvre via les réglages du plugin ou la commande /amisvocal.",
    authors: [Devs.o0],
    settings,

    commands: [{
        name: "amisvocal",
        description: "Affiche tes amis actuellement en vocal",
        execute: () => {
            openFriendsInVoice();
            return { content: "" } as any;
        }
    }],

    start() {
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", fluxListener);
    },
    stop() {
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", fluxListener);
        joinTimes.clear();
    }
});
