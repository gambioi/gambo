/*
 * Gambo, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
*/

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Button, FluxDispatcher, Forms, React, RelationshipStore, UserStore } from "@webpack/common";

const VoiceStateStore = findStoreLazy("VoiceStateStore");
const ChannelStore = findStoreLazy("ChannelStore");
const GuildStore = findStoreLazy("GuildStore");
const VoiceActions = findByPropsLazy("selectVoiceChannel");

// joinTimes: accurate time from VOICE_STATE_UPDATES event
// firstSeen: fallback for friends already in voice when Gambo starts
const joinTimes = new Map<string, number>();
const firstSeen = new Map<string, number>();

const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${s}s`;
};

function collect() {
    try {
        const ids: string[] = RelationshipStore.getFriendIDs() ?? [];
        if (ids.length === 0) return { list: [], error: null, friendCount: 0 };

        const out: any[] = [];
        for (const id of ids) {
            try {
                const vs = VoiceStateStore.getVoiceStateForUser(id);
                if (!vs?.channelId) {
                    firstSeen.delete(id);
                    continue;
                }
                const ch = ChannelStore.getChannel(vs.channelId);
                if (!ch) continue;
                const guild = vs.guildId ? GuildStore.getGuild(vs.guildId) : null;
                const states = VoiceStateStore.getVoiceStatesForChannel(vs.channelId) ?? {};
                const others = Object.keys(states)
                    .filter(u => u !== id)
                    .map(u => UserStore.getUser(u))
                    .filter(Boolean);

                // use accurate join time if available, else firstSeen fallback
                if (!firstSeen.has(id)) firstSeen.set(id, Date.now());
                const since = joinTimes.get(id) ?? firstSeen.get(id) ?? null;

                out.push({
                    id,
                    user: UserStore.getUser(id),
                    guildName: guild?.name ?? "Group DM",
                    channelName: ch.name ?? "Voice",
                    channelId: vs.channelId,
                    guildId: vs.guildId ?? null,
                    since,
                    sinceApprox: !joinTimes.has(id),
                    others
                });
            } catch { }
        }

        return {
            list: out.sort((a, b) => (a.since ?? 0) - (b.since ?? 0)),
            error: null,
            friendCount: ids.length
        };
    } catch (e) {
        return { list: [], error: `${e}`, friendCount: 0 };
    }
}

function Modal({ rootProps }: any) {
    const [, force] = React.useState(0);
    React.useEffect(() => {
        const on = () => force(x => x + 1);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", on);
        const iv = setInterval(on, 1000);
        return () => { FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", on); clearInterval(iv); };
    }, []);

    const { list, error, friendCount } = collect();

    return (
        <ModalRoot {...rootProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <Forms.FormTitle tag="h2" style={{ margin: 0 }}>🔊 Friends in Voice ({list.length})</Forms.FormTitle>
            </ModalHeader>
            <ModalContent style={{ padding: "1em" }}>
                {error && (
                    <Forms.FormText style={{ color: "var(--text-danger)", marginBottom: "0.6em", fontSize: ".8em" }}>
                        ⚠ Error: {error}
                    </Forms.FormText>
                )}
                {list.length === 0
                    ? <Forms.FormText style={{ opacity: .7 }}>
                        {friendCount === 0
                            ? "No friends found."
                            : `None of your ${friendCount} friends are currently in a voice channel.`}
                    </Forms.FormText>
                    : <div style={{ display: "flex", flexDirection: "column", gap: ".6em" }}>
                        {list.map(f => (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: ".7em", background: "var(--background-secondary)", borderRadius: 8, padding: ".6em .8em" }}>
                                <img
                                    src={f.user?.getAvatarURL?.(undefined, 64) ?? ""}
                                    width={40} height={40}
                                    style={{ borderRadius: "50%", flexShrink: 0 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: "var(--text-default)" }}>
                                        {f.user?.globalName ?? f.user?.username ?? f.id}
                                    </div>
                                    <div style={{ fontSize: ".82em", color: "var(--text-muted)", marginTop: 1 }}>
                                        <b>{f.guildName}</b> · 🔊 {f.channelName}
                                        {f.since != null && (
                                            <> · ⏱ {fmt(Date.now() - f.since)}{f.sinceApprox && <span title="Already in voice when Gambo started"> ~</span>}</>
                                        )}
                                    </div>
                                    {f.others.length > 0 && (
                                        <div style={{ fontSize: ".75em", color: "var(--text-muted)", marginTop: 2 }}>
                                            with {f.others.map((u: any) => u.globalName ?? u.username).join(", ")}
                                        </div>
                                    )}
                                </div>
                                <Button
                                    size={Button.Sizes.SMALL}
                                    onClick={() => {
                                        VoiceActions.selectVoiceChannel(f.channelId);
                                        rootProps.onClose();
                                    }}
                                    style={{ flexShrink: 0 }}
                                >
                                    Join
                                </Button>
                            </div>
                        ))}
                    </div>}
                <Forms.FormText style={{ marginTop: "1em", fontSize: ".7em", opacity: .5 }}>
                    ⏱ ~ = already in voice when Gambo started, timer approximate. Offline/invisible friends shown if in a shared server voice channel.
                </Forms.FormText>
            </ModalContent>
        </ModalRoot>
    );
}

export const openFriendsInVoice = () => openModal(props => <Modal rootProps={props} />);

const settings = definePluginSettings({
    open: {
        type: OptionType.COMPONENT,
        description: "View your friends currently in voice channels",
        component: () => (
            <Button onClick={openFriendsInVoice}>🔊 View friends in voice</Button>
        )
    }
});

const fluxListener = (action: any) => {
    for (const s of (action.voiceStates ?? [])) {
        if (s.channelId && s.channelId !== s.oldChannelId) {
            joinTimes.set(s.userId, Date.now());
            firstSeen.set(s.userId, Date.now());
        } else if (!s.channelId) {
            joinTimes.delete(s.userId);
            firstSeen.delete(s.userId);
        }
    }
};

export default definePlugin({
    name: "FriendsInVoice",
    description: "See which friends are in voice — server, channel, who they're with, how long, and join with one click. Works for invisible/offline friends too.",
    authors: [Devs.o0],
    settings,

    start() {
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", fluxListener);
    },
    stop() {
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", fluxListener);
        joinTimes.clear();
        firstSeen.clear();
    }
});
